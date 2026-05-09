import { access, readdir, readFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const validStatuses = new Set(['open', 'fixed', 'accepted-exclusion', 'removed']);
const docsWithLayoutClaims = ['README.md', 'CONTRIBUTING.md', 'docs/ARCHITECTURE.md'];
const docsWithQualityCommand = ['README.md', 'CONTRIBUTING.md'];
const stalePackageClaims = ['packages/plugins/sanity', 'packages/plugins/pencil'];
const requiredLayoutClaims = ['packages/cli', 'packages/plugins/kit', 'workers/pilot-landing'];
const requiredPackageFiles = ['packages/cli/package.json', 'packages/plugins/kit/package.json'];
const requiredWorkflowFiles = ['.github/workflows/ci.yml', '.github/workflows/release.yml'];
const requiredQuality100Commands = [
  'pnpm quality',
  'pnpm test:repo:coverage',
  'pnpm quality:worker',
  'pnpm test -- --run --coverage',
  'pnpm knip:check',
  'pnpm secret:scan',
  'pnpm pilot-100',
];

function result(code, message, file) {
  return { code, message, file };
}

function displayPath(root, file) {
  if (!file) return '';
  return isAbsolute(file) ? relative(root, file) : file;
}

export function formatFinding(root, item) {
  const file = displayPath(root, item.file);
  const location = file ? `${file}: ` : '';
  return `[${item.code}] ${location}${item.message}`;
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

function parseMarkdownTable(text) {
  const lines = findingsSection(text)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('|') && line.endsWith('|') && !line.includes('---'));

  if (lines.length < 2) return [];

  const [headerLine, ...bodyLines] = lines;
  const headers = splitRow(headerLine);

  return bodyLines.map((line) => {
    const cells = splitRow(line);
    return Object.fromEntries(
      headers.map((header, index) => [header.toLowerCase(), cells[index] ?? ''])
    );
  });
}

function splitRow(line) {
  return line
    .slice(1, -1)
    .split('|')
    .map((cell) => cell.trim());
}

function splitCommandChain(script) {
  return new Set(
    script
      .split('&&')
      .map((command) => command.trim())
      .filter(Boolean)
  );
}

function findingsSection(text) {
  const start = text.indexOf('## Findings');
  if (start === -1) return '';

  const section = text.slice(start);
  const nextHeading = section.slice('## Findings'.length).search(/\n##\s+/);
  return nextHeading === -1 ? section : section.slice(0, nextHeading + '## Findings'.length);
}

export async function checkLedger(root = process.cwd()) {
  const file = join(root, 'docs/quality/pilot-100.md');
  if (!(await exists(file))) {
    return [result('ledger-missing', 'docs/quality/pilot-100.md is required', file)];
  }

  const text = await readFile(file, 'utf8');
  const rows = parseMarkdownTable(text);
  const findings = [];

  if (rows.length === 0) {
    findings.push(result('ledger-empty', 'Pilot 100 ledger must include a findings table', file));
  }

  for (const row of rows) {
    const id = row.id || '<missing id>';
    if (!validStatuses.has(row.status)) {
      findings.push(
        result('ledger-invalid-status', `${id} has invalid status "${row.status}"`, file)
      );
    }
    if (row.status === 'open') {
      findings.push(result('ledger-open-finding', `${id} must be fixed or justified`, file));
    }
    if (!row.verification) {
      findings.push(result('ledger-verification-missing', `${id} needs verification`, file));
    }
    if (row.status === 'accepted-exclusion' && !row.sunset) {
      findings.push(result('ledger-accepted-exclusion-incomplete', `${id} needs a sunset`, file));
    }
  }

  return findings;
}

export async function checkPluginManifests(root = process.cwd()) {
  const pluginRoot = join(root, 'packages/plugins');
  if (!(await exists(pluginRoot))) return [];

  const entries = await readdir(pluginRoot, { withFileTypes: true });
  const findings = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const packagePath = join(pluginRoot, entry.name, 'package.json');
    if (!(await exists(packagePath))) continue;

    const manifest = join(pluginRoot, entry.name, 'plugin.toml');
    if (!(await exists(manifest))) {
      findings.push(
        result(
          'plugin-manifest-missing',
          `Plugin package ${entry.name} needs plugin.toml`,
          manifest
        )
      );
    }
  }

  return findings;
}

export async function checkPackageMetadata(root = process.cwd()) {
  const findings = [];
  const rootPackagePath = join(root, 'package.json');
  const rootPackage = await readJson(rootPackagePath);

  const quality100 = rootPackage.scripts?.['quality:100'];
  if (!quality100) {
    findings.push(
      result(
        'package-root-quality-missing',
        'Root package.json needs scripts.quality:100',
        'package.json'
      )
    );
  } else {
    const quality100Commands = splitCommandChain(quality100);
    for (const command of requiredQuality100Commands) {
      if (!quality100Commands.has(command)) {
        findings.push(
          result(
            'package-root-quality-command-missing',
            `scripts.quality:100 must include ${command}`,
            'package.json'
          )
        );
      }
    }
  }

  for (const packageFile of requiredPackageFiles) {
    const absolute = join(root, packageFile);
    if (!(await exists(absolute))) {
      findings.push(result('package-missing', `${packageFile} is required`, packageFile));
      continue;
    }

    const pkg = await readJson(absolute);
    if (!pkg.name) {
      findings.push(result('package-name-missing', `${packageFile} needs name`, packageFile));
    }
    if (!pkg.scripts?.test) {
      findings.push(
        result('package-test-missing', `${packageFile} needs scripts.test`, packageFile)
      );
    }
    if (!pkg.scripts?.typecheck) {
      findings.push(
        result('package-typecheck-missing', `${packageFile} needs scripts.typecheck`, packageFile)
      );
    }
    if (!pkg.exports) {
      findings.push(result('package-exports-missing', `${packageFile} needs exports`, packageFile));
    }
    if (!Array.isArray(pkg.files) || pkg.files.length === 0) {
      findings.push(result('package-files-missing', `${packageFile} needs files`, packageFile));
    }
  }

  return findings;
}

export async function checkDocsDrift(root = process.cwd()) {
  const findings = [];

  for (const doc of [
    ...new Set([...docsWithLayoutClaims, ...docsWithQualityCommand, 'docs/WORKFLOWS.md']),
  ]) {
    const path = join(root, doc);
    if (!(await exists(path))) continue;

    const text = await readFile(path, 'utf8');
    for (const stale of stalePackageClaims) {
      if (text.includes(stale)) {
        findings.push(result('docs-stale-package-claim', `${doc} mentions stale ${stale}`, doc));
      }
    }
  }

  for (const doc of docsWithLayoutClaims) {
    const path = join(root, doc);
    if (!(await exists(path))) continue;
    const text = await readFile(path, 'utf8');

    for (const claim of requiredLayoutClaims) {
      if (!text.includes(claim)) {
        findings.push(result('docs-layout-claim-missing', `${doc} must mention ${claim}`, doc));
      }
    }
  }

  for (const doc of docsWithQualityCommand) {
    const path = join(root, doc);
    if (!(await exists(path))) continue;
    const text = await readFile(path, 'utf8');

    if (!text.includes('quality:100')) {
      findings.push(
        result('docs-quality-command-missing', `${doc} must document quality:100`, doc)
      );
    }
  }

  const workflowsPath = join(root, 'docs/WORKFLOWS.md');
  if (await exists(workflowsPath)) {
    const workflows = await readFile(workflowsPath, 'utf8');
    if (!workflows.includes('dev') || !workflows.includes('prod')) {
      findings.push(
        result(
          'docs-workflow-branches-missing',
          'docs/WORKFLOWS.md must document dev/prod branches',
          'docs/WORKFLOWS.md'
        )
      );
    }
    if (!workflows.includes('Pilot 100')) {
      findings.push(
        result(
          'docs-workflow-quality-missing',
          'docs/WORKFLOWS.md must document Pilot 100',
          'docs/WORKFLOWS.md'
        )
      );
    }
  }

  for (const claim of requiredLayoutClaims) {
    if (!(await exists(join(root, claim)))) {
      findings.push(
        result('docs-layout-target-missing', `Expected layout path missing: ${claim}`, claim)
      );
    }
  }

  return findings;
}

export async function checkWorkflowGate(root = process.cwd()) {
  const findings = [];

  for (const workflow of requiredWorkflowFiles) {
    const path = join(root, workflow);
    if (!(await exists(path))) {
      findings.push(result('workflow-missing', `${workflow} is required`, workflow));
      continue;
    }

    const text = await readFile(path, 'utf8');
    if (!hasWorkflowQualityRun(text)) {
      findings.push(
        result('workflow-quality-gate-missing', `${workflow} must run pnpm quality:100`, workflow)
      );
    }
  }

  return findings;
}

function hasWorkflowQualityRun(text) {
  return text.split(/\r?\n/).some((line) => {
    const trimmed = line.trimStart();
    if (!trimmed || trimmed.startsWith('#')) return false;

    const match = trimmed.match(/^(?:-\s*)?run:\s*(.+)$/);
    if (!match) return false;

    const command = match[1].trim().replace(/^['"]|['"]$/g, '');
    return /^pnpm\s+quality:100(?:\s|$)/.test(command);
  });
}

export async function runPilot100(root = process.cwd()) {
  const checks = await Promise.all([
    checkLedger(root),
    checkPluginManifests(root),
    checkPackageMetadata(root),
    checkDocsDrift(root),
    checkWorkflowGate(root),
  ]);
  return checks.flat();
}

function isMainModule() {
  return Boolean(process.argv[1]) && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
}

/* v8 ignore start -- subprocess smoke tests cover the executable entrypoint. */
if (isMainModule()) {
  const root = process.cwd();
  const findings = await runPilot100(root);

  for (const item of findings) {
    console.error(formatFinding(root, item));
  }

  process.exitCode = findings.length === 0 ? 0 : 1;
}
/* v8 ignore stop */
