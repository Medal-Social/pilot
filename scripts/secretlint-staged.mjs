import { execFileSync } from 'node:child_process';

const stagedFiles = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'], {
  encoding: 'utf8',
})
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

execFileSync(command, args, {
  stdio: 'inherit',
});
