---
'@medalsocial/pilot': patch
---

Add kit `linux` platform (system-manager + home-manager) so `pilot kit init`, `pilot kit update`, and `pilot kit new --type linux` work on non-NixOS systemd Linux distros (Ubuntu, Debian, etc.). The third `type` in `kit.config.json.machines.*` activates `sudo system-manager switch` followed by `home-manager switch` (with a `nix run` fallback on first bootstrap).
