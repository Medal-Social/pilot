// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

export const errorCodes = {
  UPDATE_CHECK_FAILED: 'UPDATE_CHECK_FAILED',
  UPDATE_INSTALL_FAILED: 'UPDATE_INSTALL_FAILED',
  UPDATE_NIX_NOT_SUPPORTED: 'UPDATE_NIX_NOT_SUPPORTED',
  UNINSTALL_NOT_INSTALLED: 'UNINSTALL_NOT_INSTALLED',
  UNINSTALL_BACKUP_FAILED: 'UNINSTALL_BACKUP_FAILED',
  UNINSTALL_STEP_FAILED: 'UNINSTALL_STEP_FAILED',
  UNINSTALL_NPM_FAILED: 'UNINSTALL_NPM_FAILED',
  DOWN_UNKNOWN_TEMPLATE: 'DOWN_UNKNOWN_TEMPLATE',
  DOWN_NOT_INSTALLED: 'DOWN_NOT_INSTALLED',
  DOWN_REMOVE_FAILED: 'DOWN_REMOVE_FAILED',
  UP_REGISTRY_FETCH_FAILED: 'UP_REGISTRY_FETCH_FAILED',
  UP_REGISTRY_TAMPERED: 'UP_REGISTRY_TAMPERED',
  UP_TEMPLATE_NOT_FOUND: 'UP_TEMPLATE_NOT_FOUND',
  UP_STEP_FAILED: 'UP_STEP_FAILED',
  UP_NO_PACKAGE_MANAGER: 'UP_NO_PACKAGE_MANAGER',
  USAGE_INVALID_SINCE: 'USAGE_INVALID_SINCE',
  PLUGIN_INVALID_MANIFEST: 'PLUGIN_INVALID_MANIFEST',
  COMPLETIONS_UNKNOWN_SHELL: 'COMPLETIONS_UNKNOWN_SHELL',
  ADMIN_NOT_AUTHENTICATED: 'ADMIN_NOT_AUTHENTICATED',
  ADMIN_ACCESS_DENIED: 'ADMIN_ACCESS_DENIED',
  DISPATCH_UNAVAILABLE: 'DISPATCH_UNAVAILABLE',
  DISPATCH_NOT_READY: 'DISPATCH_NOT_READY',
  CONNECT_PAIR_CREATE_FAILED: 'CONNECT_PAIR_CREATE_FAILED',
  CONNECT_PAIR_CODE_EXPIRED: 'CONNECT_PAIR_CODE_EXPIRED',
  CONNECT_PAIR_CODE_NOT_FOUND: 'CONNECT_PAIR_CODE_NOT_FOUND',
  CONNECT_PAIR_TIMEOUT: 'CONNECT_PAIR_TIMEOUT',
  CONNECT_KEYCHAIN_LOST_TOKEN: 'CONNECT_KEYCHAIN_LOST_TOKEN',
  CONNECT_REJECTED: 'CONNECT_REJECTED',
  DISCONNECT_NO_KEYCHAIN_RECORD: 'DISCONNECT_NO_KEYCHAIN_RECORD',
  DISCONNECT_SERVER_ERROR: 'DISCONNECT_SERVER_ERROR',
  DISCONNECT_BAD_RESPONSE: 'DISCONNECT_BAD_RESPONSE',
  DISCONNECT_UNPAIR_FAILED: 'DISCONNECT_UNPAIR_FAILED',
} as const;

type ErrorCode = (typeof errorCodes)[keyof typeof errorCodes];

const userMessages: Record<ErrorCode, string> = {
  UPDATE_CHECK_FAILED: 'Unable to check for updates — are you online?',
  UPDATE_INSTALL_FAILED:
    'Update could not be installed. Please try again or visit medalsocial.com/pilot for help.',
  UPDATE_NIX_NOT_SUPPORTED:
    'Pilot is managed by Nix on this machine. Update via your flake or home-manager configuration, not `pilot update`.',
  UNINSTALL_NOT_INSTALLED: 'Pilot is not installed. Nothing to remove.',
  UNINSTALL_BACKUP_FAILED: 'Could not back up knowledge files. Uninstall aborted for safety.',
  UNINSTALL_STEP_FAILED: 'A removal step failed — continuing with remaining steps.',
  UNINSTALL_NPM_FAILED:
    'Could not remove the global package. Run: sudo npm uninstall -g @medalsocial/pilot',
  DOWN_UNKNOWN_TEMPLATE: 'Unknown template. Run pilot up to see available templates.',
  DOWN_NOT_INSTALLED: 'That template is not installed. Nothing to remove.',
  DOWN_REMOVE_FAILED: 'Could not remove template dependencies. Some files may remain.',
  UP_REGISTRY_FETCH_FAILED: 'Could not fetch the template registry — are you online?',
  UP_REGISTRY_TAMPERED:
    'Registry integrity check failed. The registry may have been tampered with.',
  UP_TEMPLATE_NOT_FOUND: 'Template not found. Run `pilot up` to see available templates.',
  UP_STEP_FAILED:
    'An install step failed. Fix the error above and run `pilot up <template>` again.',
  UP_NO_PACKAGE_MANAGER:
    'No compatible package manager found for your platform. Visit medalsocial.com/pilot/setup for install instructions.',
  USAGE_INVALID_SINCE: '--since expects a date in YYYYMMDD format (e.g. 20260401).',
  PLUGIN_INVALID_MANIFEST: 'Plugin has an invalid manifest — missing name or namespace.',
  COMPLETIONS_UNKNOWN_SHELL: 'Unknown shell. Supported shells: bash, zsh, fish.',
  ADMIN_NOT_AUTHENTICATED: 'You must be signed in to access the admin dashboard. Run: pilot login',
  ADMIN_ACCESS_DENIED: "You don't have permission to access the admin dashboard.",
  DISPATCH_UNAVAILABLE:
    'Dispatch is not set up yet on this machine. Run `pilot up dispatch` to install it.',
  DISPATCH_NOT_READY: 'That dispatch action is not available yet in this Pilot release.',
  CONNECT_PAIR_CREATE_FAILED:
    'Could not start the pair flow. Check your network connection and try again.',
  CONNECT_PAIR_CODE_EXPIRED:
    'Pair code expired (5-minute window). Run `pilot connect` again to get a fresh code.',
  CONNECT_PAIR_CODE_NOT_FOUND:
    'Pair code not found. Run `pilot connect` again to get a fresh code.',
  CONNECT_PAIR_TIMEOUT: 'Pair flow timed out before approval. Run `pilot connect` again.',
  CONNECT_KEYCHAIN_LOST_TOKEN:
    'Could not save the device token to your keychain. Check Keychain Access permissions and try again.',
  CONNECT_REJECTED: 'The Medal Connect server rejected this device. Run `pilot connect` again.',
  DISCONNECT_NO_KEYCHAIN_RECORD: 'No paired device found in your keychain for that deviceId.',
  DISCONNECT_SERVER_ERROR: 'The Medal Connect server rejected the unpair request.',
  DISCONNECT_BAD_RESPONSE: 'The Medal Connect server returned an unexpected response.',
  DISCONNECT_UNPAIR_FAILED: 'Could not unpair the device. Try again in a few seconds.',
};

export class PilotError extends Error {
  code: ErrorCode;

  constructor(code: ErrorCode, detail?: string) {
    super(userMessages[code]);
    this.code = code;
    this.name = 'PilotError';
    if (detail) this.cause = detail;
  }
}
