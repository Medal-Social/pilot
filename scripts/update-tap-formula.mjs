#!/usr/bin/env node
/*
 * Copyright (c) Medal Social, Inc. and its affiliates.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not
 * use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0.
 */

/**
 * Stamp the Homebrew tap formula with a concrete version + tag-pinned URLs +
 * real SHA256s. Invoked from `.github/workflows/build-binaries.yml` (sync-homebrew
 * job) after the release upload step. Exposed as a pure transform so it can be
 * unit-tested without spinning up Actions.
 *
 * Why this exists: the source `homebrew-pilot/pilot.rb` checked into this repo
 * uses `releases/latest/download/...` and has no `version` field, so the
 * checked-in formula is intentionally version-less. On every release we patch
 * it to the concrete tag so `brew upgrade pilot` actually sees a version bump.
 *
 * Inputs (via env when run as a CLI):
 *   TAG_NAME — e.g. "@medalsocial/pilot@0.5.1"
 *   FORMULA_PATH — path to pilot.rb to edit in place (defaults to
 *                  homebrew-pilot/pilot.rb relative to repo root).
 *   SHA_pilot_darwin_arm64, SHA_pilot_darwin_x64,
 *   SHA_pilot_linux_arm64,  SHA_pilot_linux_x64 — sha256 hex strings.
 *
 * Library API (used by tests):
 *   stampFormula(source, { version, shas }) -> string
 */

import { readFile, writeFile } from 'node:fs/promises';
import { resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

const TAG_PREFIX = '@medalsocial/pilot@';

/**
 * Pull the SemVer suffix off a Pilot release tag.
 * `@medalsocial/pilot@0.5.1` -> `0.5.1`.
 */
export function versionFromTag(tag) {
  if (!tag.startsWith(TAG_PREFIX)) {
    throw new Error(
      `Tag must start with "${TAG_PREFIX}", got "${tag}". This workflow only runs on Pilot release tags.`
    );
  }
  const version = tag.slice(TAG_PREFIX.length);
  if (!/^\d+\.\d+\.\d+(-[\w.-]+)?$/.test(version)) {
    throw new Error(`Tag suffix is not SemVer-shaped: "${version}". Got tag: "${tag}".`);
  }
  return version;
}

/**
 * Return the URL that GitHub serves for `releases/download/<encoded tag>/<asset>`.
 * The `@` and `/` in the tag have to be percent-encoded so brew/curl can fetch.
 */
export function releaseAssetUrl(version, asset) {
  return `https://github.com/Medal-Social/Pilot/releases/download/%40medalsocial/pilot%40${version}/${asset}`;
}

const ASSETS = ['pilot-darwin-arm64', 'pilot-darwin-x64', 'pilot-linux-arm64', 'pilot-linux-x64'];

/**
 * Pure transform: take the checked-in `pilot.rb` (which uses `releases/latest`
 * and has no `version` field) and produce the released-shape formula.
 *
 * Steps, applied in order:
 *   1. Replace each `releases/latest/download/<asset>` URL with the
 *      tag-pinned `releases/download/%40medalsocial/pilot%40X.Y.Z/<asset>` URL.
 *   2. Insert a `version "X.Y.Z"` line after `license "Apache-2.0"` if not
 *      already present — Homebrew uses this to detect upgrades, without it
 *      `brew upgrade pilot` is a no-op.
 *   3. Substitute each `sha256 "..." # <asset-suffix>` line with the real
 *      sha for that asset.
 */
export function stampFormula(source, { version, shas }) {
  if (!version) throw new Error('stampFormula: version is required.');
  if (!shas) throw new Error('stampFormula: shas is required.');

  let out = source;

  // 1. Pin URLs to the release tag (encoded).
  for (const asset of ASSETS) {
    const latest = `https://github.com/Medal-Social/Pilot/releases/latest/download/${asset}`;
    const pinned = releaseAssetUrl(version, asset);
    // Replace ALL — the formula has multiple URL lines (one per arch block).
    out = out.split(latest).join(pinned);
  }

  // 2. Insert `version "X.Y.Z"` once, right after `license "..."`. Match the
  //    license line content only (no trailing whitespace) so the inserted line
  //    drops in cleanly without duplicating the blank line that follows.
  if (!/^\s*version\s+"/m.test(out)) {
    out = out.replace(/^( *license\s+"[^"]+")$/m, `$1\n  version "${version}"`);
  }

  // 3. Replace SHA placeholders with the real digests for each asset.
  const shaMap = {
    'pilot-darwin-arm64': { key: 'darwin-arm64', sha: shas.darwinArm64 },
    'pilot-darwin-x64': { key: 'darwin-x64', sha: shas.darwinX64 },
    'pilot-linux-arm64': { key: 'linux-arm64', sha: shas.linuxArm64 },
    'pilot-linux-x64': { key: 'linux-x64', sha: shas.linuxX64 },
  };
  for (const { key, sha } of Object.values(shaMap)) {
    if (!sha) continue; // leave PLACEHOLDER if a digest wasn't supplied
    const pattern = new RegExp(`sha256 "[^"]*" # ${key}`, 'g');
    out = out.replace(pattern, `sha256 "${sha}" # ${key}`);
  }

  return out;
}

function readShasFromEnv(env) {
  return {
    darwinArm64: env.SHA_pilot_darwin_arm64,
    darwinX64: env.SHA_pilot_darwin_x64,
    linuxArm64: env.SHA_pilot_linux_arm64,
    linuxX64: env.SHA_pilot_linux_x64,
  };
}

export async function main(_argv = process.argv, env = process.env) {
  const tag = env.TAG_NAME;
  if (!tag) {
    process.stderr.write('TAG_NAME is required (e.g. @medalsocial/pilot@0.5.1).\n');
    return 1;
  }
  const formulaPath = env.FORMULA_PATH ?? 'homebrew-pilot/pilot.rb';
  const version = versionFromTag(tag);
  const shas = readShasFromEnv(env);
  const missing = Object.entries(shas)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length > 0) {
    process.stderr.write(
      `Missing SHA256 env vars for: ${missing.join(', ')}. Set SHA_pilot_<asset> for each.\n`
    );
    return 1;
  }
  const source = await readFile(formulaPath, 'utf8');
  const stamped = stampFormula(source, { version, shas });
  await writeFile(formulaPath, stamped);
  process.stdout.write(`Stamped ${formulaPath} for ${tag} (version=${version}).\n`);
  return 0;
}

// Run main() when this file is invoked directly (i.e. not imported by a test).
// `process.argv[1]` may be relative (e.g. when CI runs `node
// scripts/update-tap-formula.mjs`) so resolve it before comparing — without
// `resolvePath` the strict equality fails and main() never runs, silently
// shipping the placeholder formula to the tap repo.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolvePath(process.argv[1])) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      process.stderr.write(`${err.message}\n`);
      process.exit(1);
    }
  );
}
