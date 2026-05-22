---
'@medalsocial/pilot': patch
---

Pilot now correctly identifies the active machine when its hostname matches a configured machine name, in addition to the built-in pattern map. Fixes a silent fallback where Pilot would route commands to the first configured machine on hosts whose hostname didn't match one of the built-in patterns.
