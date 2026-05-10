---
'@medalsocial/pilot': minor
---

medal-connect plan 2: pilot CLI side of the pair flow.

- `pilot connect` — generates ephemeral ECDH keypair, posts to Medal Social,
  prints code, polls until claimed, ECDH-unseals the device token, stores it
  in the OS keychain (via @napi-rs/keyring), opens WS to the per-workspace
  Durable Object, starts 5min heartbeat backstop.
- `pilot disconnect <deviceId>` — revokes locally + tombstones in Convex +
  drops live socket via Worker /devices/<wsId>/revoke.
- New medal-connect/ subdir: keychain, ECDH (P-256 + AES-GCM), frames (zod),
  WSClient with reconnect + since-rev resume, HeartbeatLoop (5min app-level).
- Shell completions (bash/zsh/fish) updated.
- Adds `@napi-rs/keyring`, `ws`, `@types/ws`, `open` deps.
