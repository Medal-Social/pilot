// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import type { LoadedPlugin } from './types.js';

export const bundledPlugins: LoadedPlugin[] = [
  {
    manifest: {
      name: 'kit',
      namespace: 'medalsocial',
      description:
        'Open-source MDM and dotfiles for engineers — machine config, version-controlled.',
      provides: {
        commands: ['kit init', 'kit new', 'kit update', 'kit status', 'kit apps', 'kit edit'],
        mcpServers: [],
      },
      permissions: { network: ['github.com'] },
      roleBindings: {},
    },
    id: '@medalsocial/kit',
    enabled: true,
    path: 'bundled',
  },
  {
    manifest: {
      name: 'sanity',
      namespace: 'medalsocial',
      description: 'CMS content management',
      provides: { commands: [], mcpServers: ['sanity'] },
      permissions: { network: [] },
      roleBindings: {},
    },
    id: '@medalsocial/sanity',
    enabled: true,
    path: 'bundled',
  },
  {
    manifest: {
      name: 'pencil',
      namespace: 'medalsocial',
      description: 'Design tool integration',
      provides: { commands: [], mcpServers: ['pencil'] },
      permissions: { network: [] },
      roleBindings: {},
    },
    id: '@medalsocial/pencil',
    enabled: true,
    path: 'bundled',
  },
  {
    manifest: {
      name: 'dispatch',
      namespace: 'medalsocial',
      description:
        'Fleet manager for AI coding agents — hub + worker daemons, real-time dashboard, drag-to-assign Kanban.',
      provides: {
        commands: [
          'dispatch up',
          'dispatch down',
          'dispatch worker register',
          'dispatch worker start',
          'dispatch source add',
        ],
        mcpServers: ['dispatch'],
      },
      permissions: { network: ['api.linear.app', 'api.github.com'] },
      roleBindings: {},
    },
    id: '@medalsocial/dispatch',
    // Default off — opt-in until Plan 7 ships across both repos.
    enabled: false,
    path: 'bundled',
  },
];
