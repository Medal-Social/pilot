// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { writeAppsJson } from '../apps/store.js';
import { errorCodes, KitError } from '../errors.js';
import type { Exec } from '../shell/exec.js';

export interface ScaffoldOpts {
  target: string;
  name: string;
  machine: string;
  user: string;
  type?: 'darwin' | 'nixos' | 'linux';
  exec: Exec;
}

function darwinFlake(name: string, machine: string, user: string): string {
  return `{
  description = "${name} — managed by kit";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    nix-darwin = {
      url = "github:LnL7/nix-darwin";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    nix-homebrew.url = "github:zhaofengli-wip/nix-homebrew";
  };

  outputs = { self, nixpkgs, nix-darwin, nix-homebrew, ... }: {
    darwinConfigurations.${machine} = nix-darwin.lib.darwinSystem {
      system = "aarch64-darwin";
      modules = [
        ./machines/${machine}.nix
        nix-homebrew.darwinModules.nix-homebrew
        ({ ... }: {
          system.stateVersion = 5;
          users.users.${user}.home = "/Users/${user}";
          nix-homebrew = {
            enable = true;
            enableRosetta = true;
            user = "${user}";
          };
        })
      ];
    };
  };
}
`;
}

function nixosFlake(name: string, machine: string, user: string): string {
  return `{
  description = "${name} — managed by kit";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs, ... }: {
    nixosConfigurations.${machine} = nixpkgs.lib.nixosSystem {
      system = "x86_64-linux";
      modules = [
        ./machines/${machine}.nix
        ({ ... }: {
          system.stateVersion = "24.11";
          users.users.${user} = { isNormalUser = true; home = "/home/${user}"; };
        })
      ];
    };
  };
}
`;
}

function linuxFlake(name: string, machine: string, _user: string): string {
  return `{
  description = "${name} — managed by kit";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    system-manager = {
      url = "github:numtide/system-manager";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    home-manager = {
      url = "github:nix-community/home-manager";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { self, nixpkgs, system-manager, home-manager, ... }: {
    # Non-NixOS Linux (Ubuntu, Debian, …) via system-manager + home-manager.
    # Activate with:
    #   sudo system-manager switch --flake .#${machine}
    #   home-manager switch --flake .#${machine}
    systemConfigs.${machine} = system-manager.lib.makeSystemConfig {
      modules = [
        ({ ... }: { nixpkgs.hostPlatform = "x86_64-linux"; })
        ./machines/${machine}.nix
      ];
    };
  };
}
`;
}

function machineNix(machine: string, type: 'darwin' | 'nixos' | 'linux'): string {
  if (type === 'darwin') {
    return `{ ... }: let
  apps = builtins.fromJSON (builtins.readFile ./${machine}.apps.json);
in {
  networking.hostName = "${machine}";
  homebrew.casks = apps.casks;
  homebrew.brews = apps.brews;
}
`;
  }
  if (type === 'linux') {
    // system-manager doesn't accept networking.hostName (NixOS-only) — set
    // the hostname imperatively (e.g. `sudo hostnamectl set-hostname …`).
    return `{ pkgs, ... }: {
  environment.systemPackages = with pkgs; [ git curl ];
}
`;
  }
  return `{ ... }: {
  networking.hostName = "${machine}";
}
`;
}

async function runGit(exec: Exec, args: string[], cwd: string, what: string): Promise<void> {
  const r = await exec.run('git', args, { cwd });
  if (r.code !== 0) {
    throw new KitError(
      errorCodes.KIT_REPO_CLONE_FAILED,
      `git ${args.join(' ')} failed (${what}): ${r.stderr.trim() || `exit ${r.code}`}`
    );
  }
}

export async function scaffoldKit(opts: ScaffoldOpts): Promise<void> {
  const type = opts.type ?? 'darwin';
  mkdirSync(opts.target, { recursive: true });
  mkdirSync(join(opts.target, 'machines'), { recursive: true });

  // Note: NO `repoDir` field — the loader derives it from the config file's
  // location, so this scaffolded config is portable across machines.
  const config = {
    name: opts.name,
    repo: 'github:USER/REPO',
    machines: { [opts.machine]: { type, user: opts.user } },
  };
  writeFileSync(join(opts.target, 'kit.config.json'), `${JSON.stringify(config, null, 2)}\n`);

  const flake =
    type === 'darwin'
      ? darwinFlake(opts.name, opts.machine, opts.user)
      : type === 'linux'
        ? linuxFlake(opts.name, opts.machine, opts.user)
        : nixosFlake(opts.name, opts.machine, opts.user);
  writeFileSync(join(opts.target, 'flake.nix'), flake);

  writeFileSync(
    join(opts.target, 'machines', `${opts.machine}.nix`),
    machineNix(opts.machine, type)
  );

  // apps.json (Homebrew casks/brews) is darwin-only — system-manager has no
  // declarative apt analog, so linux scaffolds skip the file.
  if (type === 'darwin') {
    writeAppsJson(join(opts.target, 'machines', `${opts.machine}.apps.json`), {
      casks: [],
      brews: [],
    });
  }

  writeFileSync(join(opts.target, '.gitignore'), `.envrc\n.direnv/\nresult\nsecrets.local/\n`);

  writeFileSync(
    join(opts.target, 'README.md'),
    `# ${opts.name}\n\nMachine config managed by kit. Run \`kit init ${opts.machine}\` to bootstrap.\n`
  );

  await runGit(opts.exec, ['init'], opts.target, 'init');
  await runGit(opts.exec, ['add', '.'], opts.target, 'stage scaffold');
  await runGit(
    opts.exec,
    ['commit', '-m', `chore: scaffold ${opts.name}`],
    opts.target,
    'initial commit'
  );
}
