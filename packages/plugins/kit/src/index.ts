// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

export { addApp, listApps, removeApp } from './commands/apps.js';
export type { CleanTarget, DeleteResult, ScannedTarget } from './commands/clean.js';
export {
  CLEAN_TARGETS,
  deleteTarget,
  deleteTargets,
  formatBytes,
  scanTargets,
} from './commands/clean.js';
export { resolveEditor, runEdit } from './commands/edit.js';
export { initSteps, runInit } from './commands/init.js';
export { migrateMachineFile } from './commands/migrate-apps.js';
export { scaffoldKit } from './commands/new.js';
export { renderStatus } from './commands/status.js';
export type { UpdateHooks, UpdatePhase } from './commands/update.js';
export { realSudoKeeper, runMigrations, runUpdate } from './commands/update.js';
export type { LoadedKitConfig } from './config/load.js';
export { configCandidates, loadKitConfig } from './config/load.js';
export type { KitConfig, Machine } from './config/schema.js';
export { detectMachine } from './detect.js';
export { errorCodes, KitError } from './errors.js';
export { getSystemInfo } from './machine/system.js';

export { LocalProvider } from './provider/local.js';
export { resolveProvider } from './provider/resolve.js';
export type {
  FleetProvider,
  ProviderContext,
  RequiredApps,
  StatusReport,
} from './provider/types.js';

export { realExec } from './shell/exec.js';
