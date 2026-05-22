import { exec } from './exec.mjs';

const stagedFiles = exec('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'])
  .split('\n')
  .map((file) => file.trim())
  .filter(Boolean);

if (stagedFiles.length === 0) {
  process.exit(0);
}

const npmExecPath = process.env.npm_execpath;
const command = npmExecPath ? process.execPath : 'pnpm';
const args = npmExecPath
  ? [npmExecPath, 'exec', 'secretlint', ...stagedFiles]
  : ['exec', 'secretlint', ...stagedFiles];

exec(command, args, {
  stdio: 'inherit',
});
