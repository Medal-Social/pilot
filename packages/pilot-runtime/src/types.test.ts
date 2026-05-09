// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, expectTypeOf, it } from 'vitest';
import type { EmailMessage, Logger, MedalSocialContext, PilotHost, SyncEvent } from './types.js';

describe('PilotHost types', () => {
  it('cloud.send takes a SyncEvent and returns Promise<void>', () => {
    expectTypeOf<PilotHost['cloud']['send']>().parameters.toEqualTypeOf<[SyncEvent]>();
    expectTypeOf<PilotHost['cloud']['send']>().returns.resolves.toBeVoid();
  });

  it('email.send takes EmailMessage and resolves to { id }', () => {
    expectTypeOf<PilotHost['email']['send']>().parameters.toEqualTypeOf<[EmailMessage]>();
    expectTypeOf<PilotHost['email']['send']>().returns.resolves.toEqualTypeOf<{ id: string }>();
  });

  it('secrets.get returns Promise<string | null>', () => {
    expectTypeOf<PilotHost['secrets']['get']>().returns.resolves.toEqualTypeOf<string | null>();
  });

  it('auth.medalSocial is sync and may return null', () => {
    expectTypeOf<
      PilotHost['auth']['medalSocial']
    >().returns.toEqualTypeOf<MedalSocialContext | null>();
  });

  it('log has info/warn/error/debug methods', () => {
    expectTypeOf<Logger>().toMatchTypeOf<{
      info: (msg: string, meta?: Record<string, unknown>) => void;
      warn: (msg: string, meta?: Record<string, unknown>) => void;
      error: (msg: string, meta?: Record<string, unknown>) => void;
      debug: (msg: string, meta?: Record<string, unknown>) => void;
    }>();
  });
});
