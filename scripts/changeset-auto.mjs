#!/usr/bin/env node
/*
 * Copyright (c) Medal Social, Inc. and its affiliates.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not
 * use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0.
 */

/**
 * Deterministic changeset classifier + generator.
 *
 * Decides whether the current PR needs a changeset, what semver bump type it
 * should declare, and which packages it should target. Writes a stable
 * `.changeset/auto-<pr>-<sha7>-<slug>.md` file, or skips entirely — no
 * LLM tokens consumed on the hot path.
 *
 * Exit codes:
 *   0 — no changeset needed (ignored paths / no pkg touched / user-skip)
 *   1 — changeset was (or would be) written
 *   2 — ambiguous; human or AI fallback attention required
 *
 * Usage:
 *   node scripts/changeset-auto.mjs            # write mode
 *   node scripts/changeset-auto.mjs --check    # read-only merge gate
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  COMMENT_COMMAND_REGEXES,
  DEPENDABOT_TITLE_REGEX,
  IGNORED_GLOBS,
  PACKAGE_MAP,
  SKIP_LABEL,
  TYPE_LABELS,
} from './changeset-auto.config.mjs';
import { exec as runExec } from './exec.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** Returns true if `file` matches the glob-like `pattern` used in IGNORED_GLOBS. */
export function matchesIgnoredGlob(file, pattern) {
  if (pattern.endsWith('/**')) {
    const prefix = pattern.slice(0, -3);
    return file === prefix || file.startsWith(`${prefix}/`);
  }
  if (pattern.startsWith('*.')) {
    // Root-only basename match — do not match files nested in subdirectories.
    if (file.includes('/')) return false;
    return file.endsWith(pattern.slice(1));
  }
  // Literal path match (no slash required at the root, exact match otherwise).
  return file === pattern;
}

/** Returns true when every changed file matches at least one ignored glob. */
export function allFilesIgnored(files, globs = IGNORED_GLOBS) {
  if (files.length === 0) return true;
  return files.every((f) => globs.some((g) => matchesIgnoredGlob(f, g)));
}

/** Maps a file path to a publishable package name, or null if no match. */
export function mapFileToPackage(file, map = PACKAGE_MAP) {
  for (const entry of map) {
    if (entry.glob.endsWith('/**')) {
      const prefix = entry.glob.slice(0, -3);
      if (file.startsWith(`${prefix}/`)) return entry.name;
    }
  }
  return null;
}

/**
 * Classifies a single conventional-commit subject line into a semver bump.
 * Returns 'major' | 'minor' | 'patch' | 'unknown'.
 */
export function classifyCommit(subject) {
  const trimmed = subject.trim();
  // Breaking-change marker `!` after the type/scope.
  const breakingMatch = /^([a-z]+)(\([^)]+\))?!:/i.exec(trimmed);
  if (breakingMatch) return 'major';
  if (/^BREAKING CHANGE:/i.test(trimmed)) return 'major';

  const typeMatch = /^([a-z]+)(\([^)]+\))?:/i.exec(trimmed);
  if (!typeMatch) return 'unknown';
  const type = typeMatch[1].toLowerCase();
  switch (type) {
    case 'feat':
      return 'minor';
    case 'fix':
    case 'perf':
    case 'revert':
    case 'refactor':
    case 'chore':
    case 'build':
    case 'style':
      return 'patch';
    case 'docs':
    case 'test':
    case 'ci':
      return 'unknown';
    default:
      return 'unknown';
  }
}

/** Compares two semver-ish strings; returns 'major' | 'minor' | 'patch'. */
export function semverDiff(from, to) {
  const parse = (v) =>
    v
      .replace(/^[v=]+/, '')
      .split('.')
      .map((p) => Number.parseInt(p, 10) || 0);
  const [a1, a2, a3] = parse(from);
  const [b1, b2, b3] = parse(to);
  if (b1 > a1) return 'major';
  if (b2 > a2) return 'minor';
  if (b3 > a3) return 'patch';
  return 'patch';
}

/**
 * Reads the raw `dependencies` map from `packages/cli/package.json`. Returns
 * an empty object when the file is missing or malformed.
 */
export function readCliRuntimeDeps(rootDir = repoRoot) {
  try {
    const raw = readFileSync(path.join(rootDir, 'packages/cli/package.json'), 'utf8');
    const parsed = JSON.parse(raw);
    return parsed.dependencies ?? {};
  } catch {
    return {};
  }
}

/** Slugifies free text into a safe file-name fragment (max 40 chars). */
export function slugify(text) {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'changeset'
  );
}

/** Strips conventional-commit prefixes from a PR title. */
export function stripConventionalPrefix(title) {
  return title.replace(/^[a-z]+(\([^)]+\))?!?:\s*/i, '').trim();
}

// ---------------------------------------------------------------------------
// Classifier (pure)
// ---------------------------------------------------------------------------

/**
 * @typedef {object} ClassifierInputs
 * @property {number} pr
 * @property {string} headSha
 * @property {string[]} changedFiles
 * @property {string[]} commitSubjects
 * @property {string} prTitle
 * @property {string} prAuthor
 * @property {string[]} prLabels
 * @property {string} [commentBody]
 * @property {Record<string,string>} [runtimeDeps]
 */

/**
 * @typedef {object} Classification
 * @property {'created'|'skipped'|'ambiguous'|'user-skip'} action
 * @property {string} reason
 * @property {'patch'|'minor'|'major'|null} type
 * @property {string[]} packages
 * @property {string|null} description
 * @property {string|null} file
 * @property {0|1|2} exitCode
 */

/**
 * Pure classifier — takes fully-gathered inputs, returns a decision.
 * @param {ClassifierInputs} inputs
 * @returns {Classification}
 */
export function classify(inputs) {
  const {
    pr,
    headSha,
    changedFiles,
    commitSubjects,
    prTitle,
    prAuthor,
    prLabels,
    commentBody,
    runtimeDeps = {},
  } = inputs;

  const labels = prLabels.map((l) => l.toLowerCase());

  // 1. Comment commands (highest priority).
  if (commentBody) {
    if (COMMENT_COMMAND_REGEXES.skip.test(commentBody)) {
      return {
        action: 'user-skip',
        reason: 'user requested /skip-changeset',
        type: null,
        packages: [],
        description: null,
        file: null,
        exitCode: 0,
      };
    }
    const typedMatch = COMMENT_COMMAND_REGEXES.generateTyped.exec(commentBody);
    if (typedMatch) {
      const type = /** @type {'patch'|'minor'|'major'} */ (typedMatch[1].toLowerCase());
      const desc = typedMatch[2].trim();
      const pkgs = detectPackages(changedFiles);
      return finaliseCreate({
        pr,
        headSha,
        packages: pkgs.length > 0 ? pkgs : [PACKAGE_MAP[0].name],
        type,
        description: desc,
        reason: 'comment override',
      });
    }
  }

  // 2. Label-based skip.
  if (labels.includes(SKIP_LABEL)) {
    return {
      action: 'skipped',
      reason: `label \`${SKIP_LABEL}\` present`,
      type: null,
      packages: [],
      description: null,
      file: null,
      exitCode: 0,
    };
  }
  const overrideLabel = TYPE_LABELS.find((l) => labels.includes(l));

  // 3. Path-based ignore set.
  if (allFilesIgnored(changedFiles)) {
    return {
      action: 'skipped',
      reason: 'ignored paths only',
      type: null,
      packages: [],
      description: null,
      file: null,
      exitCode: 0,
    };
  }

  // 4. Package detection.
  const packages = detectPackages(changedFiles);
  if (packages.length === 0) {
    return {
      action: 'skipped',
      reason: 'no publishable package touched',
      type: null,
      packages: [],
      description: null,
      file: null,
      exitCode: 0,
    };
  }

  // 5. Dependabot handling.
  if (prAuthor === 'dependabot[bot]') {
    const match = DEPENDABOT_TITLE_REGEX.exec(prTitle);
    if (match) {
      const depName = match[1];
      const fromV = match[2];
      const toV = match[3];
      const isRuntime = Object.hasOwn(runtimeDeps, depName);
      if (!isRuntime) {
        return {
          action: 'skipped',
          reason: `dependabot dev-dep bump (${depName})`,
          type: null,
          packages: [],
          description: null,
          file: null,
          exitCode: 0,
        };
      }
      const type = overrideLabel ?? semverDiff(fromV, toV);
      const desc = `Bump ${depName} from ${fromV} to ${toV}.`;
      return finaliseCreate({
        pr,
        headSha,
        packages,
        type,
        description: desc,
        reason: 'dependabot runtime dep',
      });
    }
  }

  // 6. Conventional-commit inference.
  const types = commitSubjects.map((s) => classifyCommit(s));
  let inferred = null;
  if (types.includes('major')) inferred = 'major';
  else if (types.includes('minor')) inferred = 'minor';
  else if (types.includes('patch')) inferred = 'patch';

  const type = overrideLabel ?? inferred;
  if (!type) {
    return {
      action: 'ambiguous',
      reason: 'no conventional commits to derive bump from',
      type: null,
      packages,
      description: null,
      file: null,
      exitCode: 2,
    };
  }

  // 7. Description.
  const rawDesc = stripConventionalPrefix(prTitle || commitSubjects[0] || '');
  const description = rawDesc || 'Update';

  return finaliseCreate({
    pr,
    headSha,
    packages,
    type,
    description,
    reason: overrideLabel ? `label override \`${overrideLabel}\`` : 'conventional commit inference',
  });
}

/** @param {string[]} files */
function detectPackages(files) {
  const set = new Set();
  for (const f of files) {
    const name = mapFileToPackage(f);
    if (name) set.add(name);
  }
  return Array.from(set).sort();
}

function finaliseCreate({ pr, headSha, packages, type, description, reason }) {
  const sha7 = (headSha || '0000000').slice(0, 7);
  const slug = slugify(description);
  const file = `.changeset/auto-${pr}-${sha7}-${slug}.md`;
  return {
    action: 'created',
    reason,
    type,
    packages,
    description,
    file,
    exitCode: 1,
  };
}

// ---------------------------------------------------------------------------
// Generator (side-effectful)
// ---------------------------------------------------------------------------

/**
 * Writes the classification result as a `.changeset/*.md` file, removing any
 * stale `auto-<pr>-*.md` files from previous runs. Returns the path written.
 * @param {Classification} c
 * @param {number} pr
 * @param {string} [rootDir]
 */
export function generate(c, pr, rootDir = repoRoot) {
  if (c.action !== 'created' || !c.file || !c.type) {
    throw new Error('generate() called with non-created classification');
  }
  const changesetDir = path.join(rootDir, '.changeset');
  mkdirSync(changesetDir, { recursive: true });

  const targetName = path.basename(c.file);
  // Remove stale per-PR auto files with different slug/sha.
  for (const entry of readdirSync(changesetDir)) {
    if (entry === targetName) continue;
    if (entry.startsWith(`auto-${pr}-`) && entry.endsWith('.md')) {
      try {
        unlinkSync(path.join(changesetDir, entry));
      } catch {
        // best-effort cleanup
      }
    }
  }

  const frontmatterLines = c.packages.map((p) => `"${p}": ${c.type}`).join('\n');
  const body = `---\n${frontmatterLines}\n---\n\n${c.description}\n\nRefs: #${pr}\n`;
  const fullPath = path.join(rootDir, c.file);
  writeFileSync(fullPath, body, 'utf8');
  return fullPath;
}

// ---------------------------------------------------------------------------
// Input gathering (side-effectful)
// ---------------------------------------------------------------------------

function run(cmd, args, opts = {}) {
  return runExec(cmd, args, opts);
}

function readEventPayload() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath || !existsSync(eventPath)) return null;
  try {
    return JSON.parse(readFileSync(eventPath, 'utf8'));
  } catch {
    return null;
  }
}

function fetchPrDetails(pr) {
  try {
    const raw = run('gh', [
      'pr',
      'view',
      String(pr),
      '--json',
      'title,author,labels,headRefOid,headRefName,baseRefName,baseRefOid',
    ]);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Resolves the merge base against which diffs/logs should be computed.
 * Prefers the PR base SHA from the event payload / API, falls back to the
 * named base ref, and finally to `origin/main`. Ensures the ref is available
 * locally (shallow clones may not have it) by issuing `git fetch`.
 * @param {object | null} event
 * @param {number} pr
 * @returns {string}
 */
function resolveBaseRef(event, pr) {
  let baseRef = '';
  let baseSha = '';

  if (event?.pull_request?.base) {
    baseRef = event.pull_request.base.ref ?? '';
    baseSha = event.pull_request.base.sha ?? '';
  } else if (pr > 0) {
    const details = fetchPrDetails(pr);
    if (details) {
      baseRef = details.baseRefName ?? '';
      baseSha = details.baseRefOid ?? '';
    }
  }

  if (!baseRef && !baseSha) {
    baseRef = 'main';
  }

  // Best-effort fetch so the ref is available. Workflows already use
  // fetch-depth: 0, but be resilient to shallow clones too. Errors are
  // swallowed here because the subsequent resolve step will fail loudly if the
  // ref still cannot be found.
  if (baseRef) {
    run('git', ['fetch', '--no-tags', 'origin', baseRef], { tolerant: true });
  }
  if (baseSha) {
    run('git', ['fetch', '--no-tags', 'origin', baseSha], { tolerant: true });
  }

  // Prefer the explicit SHA when present — it's immune to force-pushes on the
  // base branch mid-PR. Otherwise use `origin/<ref>`.
  if (baseSha && run('git', ['cat-file', '-e', baseSha], { tolerant: true }) !== null) {
    return baseSha;
  }
  const remoteRef = `origin/${baseRef || 'main'}`;
  if (run('git', ['rev-parse', '--verify', remoteRef], { tolerant: true }) === null) {
    throw new Error(
      `changeset-auto: cannot resolve base ref '${remoteRef}'. ` +
        'Ensure the workflow checkout has fetch-depth: 0 and the base branch fetched.'
    );
  }
  return remoteRef;
}

/**
 * Gathers classifier inputs from the GitHub Actions environment.
 * @returns {ClassifierInputs}
 */
export function gatherInputs() {
  const eventName = process.env.GITHUB_EVENT_NAME ?? '';
  const event = readEventPayload();

  let pr = 0;
  let prTitle = '';
  let prAuthor = '';
  /** @type {string[]} */
  let prLabels = [];
  let headSha = process.env.GITHUB_SHA ?? '';
  let commentBody;

  if (event?.pull_request) {
    pr = event.pull_request.number ?? 0;
    prTitle = event.pull_request.title ?? '';
    prAuthor = event.pull_request.user?.login ?? '';
    prLabels = (event.pull_request.labels ?? []).map((l) => l.name ?? '');
    headSha = event.pull_request.head?.sha ?? headSha;
  } else if (event?.issue?.pull_request) {
    pr = event.issue.number ?? 0;
    commentBody = event.comment?.body ?? '';
    const details = fetchPrDetails(pr);
    if (details) {
      prTitle = details.title ?? '';
      prAuthor = details.author?.login ?? '';
      prLabels = (details.labels ?? []).map((l) => l.name ?? '');
      headSha = details.headRefOid ?? headSha;
    }
  } else if (eventName === 'workflow_dispatch') {
    const inputPr = Number.parseInt(process.env.INPUT_PR ?? '', 10);
    if (!Number.isNaN(inputPr)) {
      pr = inputPr;
      const details = fetchPrDetails(pr);
      if (details) {
        prTitle = details.title ?? '';
        prAuthor = details.author?.login ?? '';
        prLabels = (details.labels ?? []).map((l) => l.name ?? '');
        headSha = details.headRefOid ?? headSha;
      }
    }
  }

  const base = resolveBaseRef(event, pr);
  const changedFiles = run('git', ['diff', '--name-only', `${base}...HEAD`])
    .split('\n')
    .map((f) => f.trim())
    .filter(Boolean);

  const commitSubjects = run('git', ['log', '--format=%s', `${base}..HEAD`])
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    pr,
    headSha,
    changedFiles,
    commitSubjects,
    prTitle,
    prAuthor,
    prLabels,
    commentBody,
    runtimeDeps: readCliRuntimeDeps(),
  };
}

// ---------------------------------------------------------------------------
// CLI entry
// ---------------------------------------------------------------------------

function writeGithubOutput(result) {
  const out = process.env.GITHUB_OUTPUT;
  if (!out) return;
  try {
    writeFileSync(out, `result=${JSON.stringify(result)}\n`, { flag: 'a' });
  } catch {
    // best effort
  }
}

function hasAnyChangesetInDiff(event, pr) {
  const base = resolveBaseRef(event, pr);
  const diff = run('git', ['diff', '--name-only', `${base}...HEAD`]);
  return diff
    .split('\n')
    .map((f) => f.trim())
    .some((f) => f.startsWith('.changeset/') && f.endsWith('.md') && f !== '.changeset/README.md');
}

/**
 * Decide what `pnpm changeset:check` should exit with.
 *
 * Both `created` (the classifier wants to add a changeset) and `ambiguous`
 * (it couldn't classify the change) require a changeset to merge — without
 * this, an ambiguous PR touching `packages/cli/**` would silently exit 0
 * and let release-affecting code through the gate.
 *
 * `skipped` and `user-skip` are explicit no-changeset paths and pass through.
 *
 * @param {{ action: 'created'|'skipped'|'ambiguous'|'user-skip' }} classification
 * @param {boolean} hasChangeset
 * @returns {{ exit: 0|1, message?: string }}
 */
export function decideCheckExit(classification, hasChangeset) {
  if (classification.action === 'created' || classification.action === 'ambiguous') {
    if (hasChangeset) return { exit: 0 };
    return {
      exit: 1,
      message:
        'A changeset is required for this PR but none was found. ' +
        'Run `pnpm changeset` locally, or comment `/changeset` on the PR to auto-generate one.\n',
    };
  }
  return { exit: 0 };
}

async function main() {
  const args = process.argv.slice(2);
  const checkMode = args.includes('--check');

  // Kill switch → route to AI fallback.
  if (process.env.CHANGESET_AUTO_DISABLE === 'true') {
    const result = {
      action: 'ambiguous',
      reason: 'disabled',
      type: null,
      packages: [],
      description: null,
      file: null,
    };
    process.stdout.write(`${JSON.stringify(result)}\n`);
    writeGithubOutput(result);
    process.exit(2);
  }

  const inputs = gatherInputs();
  const classification = classify(inputs);

  const result = {
    action: classification.action,
    reason: classification.reason,
    type: classification.type,
    packages: classification.packages,
    description: classification.description,
    file: classification.file,
  };

  process.stdout.write(`${JSON.stringify(result)}\n`);
  writeGithubOutput(result);

  if (checkMode) {
    const decision = decideCheckExit(
      classification,
      hasAnyChangesetInDiff(readEventPayload(), inputs.pr)
    );
    if (decision.message) process.stderr.write(decision.message);
    process.exit(decision.exit);
  }

  if (classification.action === 'created') {
    generate(classification, inputs.pr);
    process.exit(1);
  }
  if (classification.action === 'ambiguous') {
    process.exit(2);
  }
  process.exit(0);
}

// Only run main() when invoked directly.
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((err) => {
    process.stderr.write(`changeset-auto: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(2);
  });
}
