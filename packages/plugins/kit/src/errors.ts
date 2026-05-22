// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

export const errorCodes = {
  KIT_SUDO_DENIED: 'KIT_SUDO_DENIED',
  KIT_XCODE_INSTALL_FAILED: 'KIT_XCODE_INSTALL_FAILED',
  KIT_ROSETTA_INSTALL_FAILED: 'KIT_ROSETTA_INSTALL_FAILED',
  KIT_NIX_INSTALL_FAILED: 'KIT_NIX_INSTALL_FAILED',
  KIT_SSH_KEYGEN_FAILED: 'KIT_SSH_KEYGEN_FAILED',
  KIT_GITHUB_AUTH_FAILED: 'KIT_GITHUB_AUTH_FAILED',
  KIT_INIT_NOT_SUPPORTED_FOR_STRATEGY: 'KIT_INIT_NOT_SUPPORTED_FOR_STRATEGY',
  KIT_REPO_CLONE_FAILED: 'KIT_REPO_CLONE_FAILED',
  KIT_REPO_PULL_FAILED: 'KIT_REPO_PULL_FAILED',
  KIT_SECRETS_INIT_FAILED: 'KIT_SECRETS_INIT_FAILED',
  KIT_REBUILD_FAILED: 'KIT_REBUILD_FAILED',
  KIT_CONFIG_NOT_FOUND: 'KIT_CONFIG_NOT_FOUND',
  KIT_CONFIG_INVALID: 'KIT_CONFIG_INVALID',
  KIT_UNKNOWN_MACHINE: 'KIT_UNKNOWN_MACHINE',
  KIT_NO_MACHINE_FILE: 'KIT_NO_MACHINE_FILE',
  KIT_APPS_CORRUPT: 'KIT_APPS_CORRUPT',
  KIT_APPS_DUPLICATE: 'KIT_APPS_DUPLICATE',
  KIT_APPS_INVALID_NAME: 'KIT_APPS_INVALID_NAME',
  KIT_NO_EDITOR: 'KIT_NO_EDITOR',
} as const;

type ErrorCode = (typeof errorCodes)[keyof typeof errorCodes];

const userMessages: Record<ErrorCode, string> = {
  KIT_SUDO_DENIED:
    'sudo authentication was denied. Re-run after authenticating: `sudo -v` then `pilot kit update`.',
  KIT_XCODE_INSTALL_FAILED:
    'Could not install Xcode Command Line Tools. Try `xcode-select --install` manually.',
  KIT_ROSETTA_INSTALL_FAILED:
    'Could not install Rosetta 2. Try `softwareupdate --install-rosetta --agree-to-license`.',
  KIT_NIX_INSTALL_FAILED:
    'Could not install Nix. See `~/.nix-installer.log` or run the Determinate installer manually: https://install.determinate.systems/nix',
  KIT_SSH_KEYGEN_FAILED: 'Could not generate SSH key. Check that ~/.ssh is writable, then retry.',
  KIT_GITHUB_AUTH_FAILED:
    'Could not authenticate to GitHub. Try `gh auth login --hostname github.com --git-protocol https --web` manually, then retry.',
  KIT_INIT_NOT_SUPPORTED_FOR_STRATEGY:
    '`pilot kit init` is not supported when gitStrategy=none. The kit lives inside a host repository — clone the host repo manually, then run `pilot kit update`.',
  KIT_REPO_CLONE_FAILED:
    'Could not clone the kit repository. Verify GitHub auth (`ssh -T git@github.com`) and the repo URL in kit.config.json.',
  KIT_REPO_PULL_FAILED:
    'Could not pull the kit repository. Resolve any uncommitted changes (`git status` in the kit dir) and retry.',
  KIT_SECRETS_INIT_FAILED:
    'Secrets setup failed. Inspect `scripts/secrets-init.sh detect` output, then re-run `pilot kit update`.',
  KIT_REBUILD_FAILED:
    'System rebuild failed. Run the underlying rebuild command directly to see the full Nix error: `darwin-rebuild switch --flake .#<machine>` (darwin), `nixos-rebuild switch --flake .#<machine>` (nixos), or `sudo system-manager switch --flake .#<machine>` + `home-manager switch --flake .#<machine>` (linux).',
  KIT_CONFIG_NOT_FOUND:
    'No kit.config.json found. Run `pilot kit new` for a fresh setup, or clone an existing kit repo to ~/Documents/Code/kit and try again.',
  KIT_CONFIG_INVALID:
    'kit.config.json is invalid. See the detail for the offending field. Run `pilot kit config show` to inspect.',
  KIT_UNKNOWN_MACHINE:
    'Machine name is not in kit.config.json → machines. Run `pilot kit config show` to see the configured machines.',
  KIT_NO_MACHINE_FILE:
    'No machine config file found for this hostname. Add `machines/<host>.nix` and `machines/<host>.apps.json` for it.',
  KIT_APPS_CORRUPT:
    'apps.json is malformed. Check JSON syntax and that every name matches `[a-z0-9][a-z0-9._@+-]*`.',
  KIT_APPS_DUPLICATE: 'That app is already in your config. Use `pilot kit apps list` to verify.',
  KIT_APPS_INVALID_NAME:
    'Invalid Homebrew package name. Names must match `[a-z0-9][a-z0-9._@+-]*` (lowercase, no spaces).',
  KIT_NO_EDITOR:
    'No editor available. Set $EDITOR (or $KIT_EDITOR/$VISUAL) or install one of: zed, code, nvim, vim.',
};

export class KitError extends Error {
  code: ErrorCode;

  constructor(code: ErrorCode, detail?: string) {
    super(userMessages[code]);
    this.code = code;
    this.name = 'KitError';
    if (detail) this.cause = detail;
  }
}
