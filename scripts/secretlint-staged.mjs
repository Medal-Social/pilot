import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const stagedFiles = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'], {
  encoding: 'utf8',
})
  .split('\n')
  .map((file) => file.trim())
  .filter(Boolean);

if (stagedFiles.length === 0) {
  process.exit(0);
}

const command = process.platform === 'win32' ? process.execPath : 'pnpm';
const args =
  process.platform === 'win32'
    ? [
        join(dirname(process.execPath), 'node_modules/corepack/dist/pnpm.js'),
        'exec',
        'secretlint',
        ...stagedFiles,
      ]
    : ['exec', 'secretlint', ...stagedFiles];

if (process.platform === 'win32' && !existsSync(args[0])) {
  throw new Error(`Unable to locate Corepack pnpm shim at ${args[0]}`);
}

execFileSync(command, args, {
  stdio: 'inherit',
});
