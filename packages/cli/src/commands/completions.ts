// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { errorCodes, PilotError } from '../errors.js';

const BASH_COMPLETION = `_pilot_completions() {
  local commands="admin completions connect crew disconnect down help kit plugins status training uninstall up update usage"
  COMPREPLY=($(compgen -W "$commands" -- "\${COMP_WORDS[COMP_CWORD]}"))
}
complete -F _pilot_completions pilot
`;

const ZSH_COMPLETION = `#compdef pilot
_pilot() {
  local commands=(admin completions connect crew disconnect down help kit plugins status training uninstall up update usage)
  _describe 'command' commands
}
compdef _pilot pilot
`;

const FISH_COMPLETION = `complete -c pilot -f
complete -c pilot -n '__fish_use_subcommand' -a admin -d 'Admin dashboard'
complete -c pilot -n '__fish_use_subcommand' -a completions -d 'Shell completions'
complete -c pilot -n '__fish_use_subcommand' -a connect -d 'Pair this machine with a Medal Social workspace'
complete -c pilot -n '__fish_use_subcommand' -a crew -d 'Manage your AI crew'
complete -c pilot -n '__fish_use_subcommand' -a disconnect -d 'Revoke this device from its Medal Social workspace'
complete -c pilot -n '__fish_use_subcommand' -a down -d 'Remove a template'
complete -c pilot -n '__fish_use_subcommand' -a help -d 'Show help'
complete -c pilot -n '__fish_use_subcommand' -a kit -d 'Machine configuration & Nix management'
complete -c pilot -n '__fish_use_subcommand' -a plugins -d 'Manage plugins'
complete -c pilot -n '__fish_use_subcommand' -a status -d 'System status'
complete -c pilot -n '__fish_use_subcommand' -a training -d 'Knowledge base'
complete -c pilot -n '__fish_use_subcommand' -a uninstall -d 'Uninstall Pilot'
complete -c pilot -n '__fish_use_subcommand' -a up -d 'Setup templates'
complete -c pilot -n '__fish_use_subcommand' -a update -d 'Check for updates'
complete -c pilot -n '__fish_use_subcommand' -a usage -d 'AI token usage and costs'
`;

const SCRIPTS: Record<string, string> = {
  bash: BASH_COMPLETION,
  zsh: ZSH_COMPLETION,
  fish: FISH_COMPLETION,
};

export async function runCompletions(shell: string) {
  const script = SCRIPTS[shell];
  if (!script) {
    throw new PilotError(errorCodes.COMPLETIONS_UNKNOWN_SHELL, shell);
  }
  process.stdout.write(script);
}
