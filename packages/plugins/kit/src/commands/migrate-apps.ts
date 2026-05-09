// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { writeAppsJson } from '../apps/store.js';

export interface MigrateResult {
  changed: boolean;
}

const INLINE_RE = /homebrew\.(casks|brews)\s*=\s*\[([\s\S]*?)\];/g;

function parseList(body: string): string[] {
  return Array.from(body.matchAll(/"([^"]+)"/g)).map((m) => m[1]);
}

function alreadyMigrated(source: string, machine: string): boolean {
  // If the file already references its apps.json, treat as migrated.
  return source.includes(`./${machine}.apps.json`);
}

function injectLetBinding(source: string, machine: string): string {
  const appsLine = `apps = builtins.fromJSON (builtins.readFile ./${machine}.apps.json);`;

  // Case A: file is `}: let ... in {` — append the apps binding to the existing let block.
  // Match `}:` then whitespace then `let` then anything up to `in {`.
  const existingLetRe = /(\}:\s*let\b)([\s\S]*?)(\bin\s*\{)/;
  const letMatch = existingLetRe.exec(source);
  if (letMatch && letMatch.index !== undefined) {
    const head = source.slice(0, letMatch.index);
    const tail = source.slice(letMatch.index + letMatch[0].length);
    const letKw = letMatch[1];
    const bindings = letMatch[2];
    const inBrace = letMatch[3];
    const trimmed = bindings.replace(/\s+$/, '');
    const insertion = `${trimmed}\n  ${appsLine}\n`;
    return `${head}${letKw}${insertion}${inBrace}${tail}`;
  }

  // Case B: file is `}: {` — inject `let apps = ...; in ` before the opening `{`.
  const transitionRe = /(\}:\s*)(\{)/;
  const match = transitionRe.exec(source);
  if (!match || match.index === undefined) {
    throw new Error('Could not locate function-to-body transition');
  }
  const before = source.slice(0, match.index + match[1].length);
  const after = source.slice(match.index + match[1].length);
  const letBinding = `let\n  ${appsLine}\nin `;
  return `${before}${letBinding}${after}`;
}

function replaceHomebrewBlocks(source: string): string {
  return source.replace(INLINE_RE, (_full, kind: string) => {
    return `homebrew.${kind} = apps.${kind};`;
  });
}

export async function migrateMachineFile(nixPath: string, machine: string): Promise<MigrateResult> {
  const original = readFileSync(nixPath, 'utf8');

  if (alreadyMigrated(original, machine)) {
    return { changed: false };
  }

  // Reset regex state from any prior caller (INLINE_RE is /g).
  INLINE_RE.lastIndex = 0;

  // Collect the cask/brew lists.
  let casks: string[] = [];
  let brews: string[] = [];
  let foundAny = false;
  for (const match of original.matchAll(INLINE_RE)) {
    foundAny = true;
    const kind = match[1];
    const items = parseList(match[2]);
    if (kind === 'casks') casks = items;
    if (kind === 'brews') brews = items;
  }

  if (!foundAny) {
    return { changed: false };
  }

  // Splice: replace homebrew blocks in place, then inject `let apps = ...; in` before body.
  let next = replaceHomebrewBlocks(original);
  next = injectLetBinding(next, machine);

  // Write apps.json sibling.
  const appsJsonPath = join(dirname(nixPath), `${machine}.apps.json`);
  writeAppsJson(appsJsonPath, { casks, brews });

  writeFileSync(nixPath, next, 'utf8');
  return { changed: true };
}
