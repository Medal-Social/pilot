// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

const MACHINE_PATTERNS: Array<{ pattern: string; machine: string }> = [
  { pattern: 'mini', machine: 'ali-mini' },
  { pattern: 'studio', machine: 'ali-studio' },
  // NB: there is intentionally no bare `ada` pattern. `ada` is ambiguous now
  // that the fleet has both `ada-air` (darwin) and `ada-ws` (linux) — a bare
  // `ada` token can't disambiguate them. `ada-air` is still matched by `air`
  // below; `ada-ws` resolves via the zero-config raw-hostname path in
  // resolveMachine (its hostname is literally a key in kit.config.json).
  { pattern: 'air', machine: 'ada-air' },
  { pattern: 'pro', machine: 'ali-pro' },
  { pattern: 'oslo', machine: 'oslo-server' },
];

export function detectMachine(hostname: string): string | null {
  const lower = hostname.toLowerCase();
  const segments = lower.split(/[-_.]/);
  for (const { pattern, machine } of MACHINE_PATTERNS) {
    if (segments.includes(pattern)) return machine;
  }
  return null;
}
