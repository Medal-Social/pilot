// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

export interface DispatchPluginLike {
  manifest: { name: string; namespace: string; provides: { commands: string[] } };
  syncStream(): AsyncIterable<unknown>;
  applyRemote(e: unknown): Promise<void>;
  health(): Promise<{ ok: boolean; details?: Record<string, unknown> }>;
}

export interface LoadDispatchPluginArgs {
  importFn?: (spec: string) => Promise<{ default: (opts: unknown) => DispatchPluginLike }>;
  opts: unknown;
}

export async function loadDispatchPlugin(
  args: LoadDispatchPluginArgs
): Promise<DispatchPluginLike | null> {
  const importFn =
    args.importFn ??
    ((spec: string) => import(spec) as Promise<{ default: (opts: unknown) => DispatchPluginLike }>);
  try {
    const mod = await importFn('@medalsocial/dispatch/plugin');
    return mod.default(args.opts);
  } catch (err) {
    if ((err as { code?: string }).code === 'ERR_MODULE_NOT_FOUND') return null;
    throw err;
  }
}
