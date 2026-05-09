// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

export const errorCodes = {
  UPDATE_CHECK_FAILED: 'UPDATE_CHECK_FAILED',
  UPDATE_INSTALL_FAILED: 'UPDATE_INSTALL_FAILED',
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
} as const;

type ErrorCode = (typeof errorCodes)[keyof typeof errorCodes];

const userMessages: Record<ErrorCode, string> = {
  UPDATE_CHECK_FAILED: 'Unable to check for updates — are you online?',
  UPDATE_INSTALL_FAILED:
    'Update could not be installed. Please try again or visit medalsocial.com/pilot for help.',
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
