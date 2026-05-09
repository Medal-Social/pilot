---
'@medalsocial/pilot': patch
---

`pilot update` now detects the installation method (`homebrew` / `npm` / `nix` / `unknown`) and runs the right upgrade command for each. Previously the self-updater always ran `npm install -g @medalsocial/pilot@latest`, which silently failed (or installed to a path off the user's PATH) for Homebrew-installed users. Now Homebrew installs run `brew upgrade pilot`, Nix installs surface a clear `UPDATE_NIX_NOT_SUPPORTED` error pointing at flake/home-manager, and npm/unknown installs keep the existing behaviour.
