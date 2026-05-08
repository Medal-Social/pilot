# Scorecard Improvement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lift the OpenSSF Scorecard from 7.5/10 to ~8.8–9.2 by fixing three config/doc issues and triggering a fresh scorecard scan.

**Architecture:** Pure configuration and documentation changes — no code logic. All changes land in a single PR from a new branch off `main`. After merge, a manual scorecard workflow trigger picks up all improvements at once.

**Tech Stack:** GitHub Actions, pinned package manifests, cosign (Sigstore), OpenSSF Scorecard

**Spec:** `docs/superpowers/specs/2026-04-21-scorecard-improvement-design.md`

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `GOVERNANCE.md` | Modify | Document consolidated dependency maintenance |
| `.github/CODEOWNERS` | Create | Move from root for scorecard detection |
| `CODEOWNERS` | Delete | Replaced by `.github/CODEOWNERS` |
| `SECURITY.md` | Modify | Fix cosign verification regexp (wrong tag format) |

---

### Task 1: Create feature branch

**Files:** none

- [ ] **Step 1: Check out main and pull latest**

```bash
git checkout main && git pull origin main
```

Expected: on `main`, clean working tree.

- [ ] **Step 2: Create branch**

```bash
git checkout -b fix/scorecard-improvements
```

Expected: `Switched to a new branch 'fix/scorecard-improvements'`

---

### Task 2: Document dependency maintenance policy

**Files:**
- Modify: `GOVERNANCE.md`

- [ ] **Step 1: Open the file**

- Confirm the maintenance policy explains that dependencies are reviewed through consolidated maintenance PRs.

- [ ] **Step 2: Update stale dependency automation language**

Replace any automated dependency update scheduling instructions with the consolidated maintenance PR process.

- [ ] **Step 3: Verify the file renders correctly**

```bash
head -5 GOVERNANCE.md
```

Expected: `# Governance` header visible.

- [ ] **Step 4: Commit**

```bash
git add GOVERNANCE.md
git commit -m "docs: document consolidated dependency maintenance"
```

---

### Task 3: Move CODEOWNERS to .github/

**Files:**
- Create: `.github/CODEOWNERS`
- Delete: `CODEOWNERS` (root)

- [ ] **Step 1: Read the current root CODEOWNERS**

```bash
cat CODEOWNERS
```

Expected output:
```
# Default: require review from both maintainers
* @alioftech @adaadev

# Plugin manifests need careful review
packages/plugins/*/plugin.toml @alioftech @adaadev

# Skill deployment and security
packages/cli/src/deploy/ @alioftech @adaadev
packages/cli/src/skills/ @alioftech @adaadev

# CI and release pipeline
.github/ @alioftech @adaadev
```

- [ ] **Step 2: Create `.github/CODEOWNERS` with identical content**

```bash
cp CODEOWNERS .github/CODEOWNERS
```

- [ ] **Step 3: Verify the copy is identical**

```bash
diff CODEOWNERS .github/CODEOWNERS
```

Expected: no output (files are identical).

- [ ] **Step 4: Delete the root CODEOWNERS**

```bash
git rm CODEOWNERS
```

Expected: `rm 'CODEOWNERS'`

- [ ] **Step 5: Commit**

```bash
git add .github/CODEOWNERS
git commit -m "chore: move CODEOWNERS to .github/ for scorecard detection"
```

---

### Task 4: Fix cosign verification command in SECURITY.md

**Files:**
- Modify: `SECURITY.md`

**Context:** The `--certificate-identity-regexp` in `SECURITY.md` references `refs/tags/v.*` but Changesets creates tags like `@medalsocial/pilot@0.1.7`. Anyone running the documented verification command will get a failure. This also affects the Signed-Releases scorecard check.

- [ ] **Step 1: Find the broken line**

```bash
grep -n "certificate-identity-regexp" SECURITY.md
```

Expected output (line number may vary):
```
68:  --certificate-identity-regexp "https://github.com/Medal-Social/Pilot/.github/workflows/build-binaries.yml@refs/tags/v.*" \
```

- [ ] **Step 2: Replace the regexp**

Find this exact string in `SECURITY.md`:
```
  --certificate-identity-regexp "https://github.com/Medal-Social/Pilot/.github/workflows/build-binaries.yml@refs/tags/v.*" \
```

Replace with:
```
  --certificate-identity-regexp "https://github.com/Medal-Social/Pilot/.github/workflows/build-binaries.yml@refs/tags/@medalsocial/pilot@.*" \
```

- [ ] **Step 3: Verify the change looks correct**

```bash
grep -A2 -B2 "certificate-identity-regexp" SECURITY.md
```

Expected: the regexp now reads `refs/tags/@medalsocial/pilot@.*`

- [ ] **Step 4: Commit**

```bash
git add SECURITY.md
git commit -m "fix: correct cosign verification regexp to match Changesets tag format"
```

---

### Task 5: Open and merge the PR

**Files:** none

- [ ] **Step 1: Push the branch**

```bash
git push -u origin fix/scorecard-improvements
```

Expected: branch pushed, pre-push hooks pass (lint + tests).

- [ ] **Step 2: Open the PR**

```bash
gh pr create \
  --title "fix: scorecard improvements — dependency maintenance, CODEOWNERS, cosign regexp" \
  --body "$(cat <<'EOF'
## Summary
- Document consolidated dependency maintenance for pinned manifests
- Move CODEOWNERS to .github/ for scorecard Code-Review detection
- Fix cosign verification regexp in SECURITY.md (was refs/tags/v.*, should be refs/tags/@medalsocial/pilot@.*)

## Score impact
Current: 7.5/10 → Projected: ~8.8–9.2 after this PR + next release + scorecard re-run

Spec: docs/superpowers/specs/2026-04-21-scorecard-improvement-design.md
EOF
)"
```

- [ ] **Step 3: Wait for CI to pass, then merge**

```bash
gh pr checks --watch
```

Expected: all checks green. Then:

```bash
gh pr merge --squash
```

---

### Task 6: Trigger scorecard re-run

**Files:** none

**Context:** The CII Best Practices badge has been in the README since April 10 but the last scorecard run predates it. A manual trigger gives us an immediate fresh score.

- [ ] **Step 1: Switch back to main and pull**

```bash
git checkout main && git pull origin main
```

- [ ] **Step 2: Trigger the scorecard workflow**

```bash
gh workflow run scorecard.yml --ref main
```

Expected: `Created workflow_dispatch event for scorecard.yml at main`

- [ ] **Step 3: Monitor the run**

```bash
gh run list --workflow=scorecard.yml --limit=3
```

Wait for the latest run to show `completed` / `success`. Takes ~2 minutes.

- [ ] **Step 4: Verify the new score**

Visit: https://scorecard.dev/viewer/?uri=github.com/Medal-Social/Pilot

Allow up to 5 minutes for the viewer to update after the workflow completes. Expected improvements visible:
- CII-Best-Practices: 0 → 10
- Pinned-Dependencies: 9 → 10
- Branch-Protection: -1 → real score (if internal error resolved)

---

## What improves automatically (no action needed)

| When | What |
|---|---|
| PR #36 merges → release fires `build-binaries.yml` | Signed-Releases 0 → ~8 |
| New PRs flow through with branch protection enforced | Code-Review 6 → 8–9 |
| ~July 2026 (90 days of activity) | Maintained 0 → 10 |
| External contributors open PRs | Contributors 3 → higher |
