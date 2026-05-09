// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import type {
  EmailMessage,
  Logger,
  MedalSocialContext,
  PilotHost,
  SyncEvent,
} from '@medalsocial/pilot-runtime';

export interface CreateDispatchHostArgs {
  log: Logger;
  /** Pilot-managed secret store (key→value). Plan 7 uses a flat object; future plans may swap in OS keychain. */
  secretsStore: Record<string, string | undefined>;
  /** Currently authed Medal Social context, or null. Plan 7 wires from settings. */
  medalSocial: MedalSocialContext | null;
  /** Real email transport — typically Pilot's existing Medal SDK path. */
  sendEmail: (msg: EmailMessage) => Promise<{ id: string }>;
  /** Cloud uploader. Plan 7 logs only; a later plan replaces with Cloudflare DO push. */
  uploadEvent?: (event: SyncEvent) => Promise<void>;
}

export function createDispatchHost(args: CreateDispatchHostArgs): PilotHost {
  const { log, secretsStore, medalSocial, sendEmail, uploadEvent } = args;
  return {
    cloud: {
      async send(event) {
        log.info('pilot.cloud.send', {
          plugin: event.plugin,
          kind: event.kind,
          id: event.id,
        });
        if (uploadEvent) await uploadEvent(event);
      },
    },
    email: { send: (msg) => sendEmail(msg) },
    secrets: {
      async get(name) {
        return secretsStore[name] ?? null;
      },
    },
    auth: { medalSocial: () => medalSocial },
    log,
  };
}
