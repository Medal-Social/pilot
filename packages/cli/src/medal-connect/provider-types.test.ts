// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, expectTypeOf, it } from 'vitest';
import type {
  MedalConnectProvider,
  ProviderCommand,
  ProviderEvent,
  ProviderStateSnapshot,
} from './provider-types.js';

describe('MedalConnectProvider type contract', () => {
  it('id is a string', () => {
    expectTypeOf<MedalConnectProvider['id']>().toEqualTypeOf<string>();
  });

  it('snapshot returns a Promise<ProviderStateSnapshot>', () => {
    expectTypeOf<MedalConnectProvider['snapshot']>().returns.resolves.toEqualTypeOf<ProviderStateSnapshot>();
  });

  it('watch takes an emit callback and returns Disposable', () => {
    type WatchFn = MedalConnectProvider['watch'];
    expectTypeOf<WatchFn>().parameter(0).toMatchTypeOf<(e: ProviderEvent) => void>();
    expectTypeOf<WatchFn>().returns.toMatchTypeOf<{ dispose(): void }>();
  });

  it('exec returns one of three discriminated outcomes', () => {
    type ExecRet = Awaited<ReturnType<MedalConnectProvider['exec']>>;
    type Statuses = ExecRet['status'];
    expectTypeOf<Statuses>().toEqualTypeOf<'ok' | 'failed' | 'awaiting_user'>();
  });

  it('ProviderCommand has kind + args fields', () => {
    expectTypeOf<ProviderCommand['kind']>().toEqualTypeOf<string>();
    expectTypeOf<ProviderCommand['args']>().toEqualTypeOf<Record<string, unknown>>();
  });
});
