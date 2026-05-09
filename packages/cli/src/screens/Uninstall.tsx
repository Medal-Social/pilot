// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { execFile } from 'node:child_process';
import { rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Box, Text, useApp, useInput } from 'ink';
import { useEffect, useState } from 'react';
import { colors } from '../colors.js';
import { Step } from '../components/Step.js';
import { removeRoutingFromClaudeMd, removeSkillSymlink } from '../deploy/deployer.js';
import { backupKnowledge } from '../device/backup.js';
import { getInstalledTemplateNames, removeTemplateFromState } from '../device/state.js';
import { detectPackageManagers } from '../installer/detect.js';
import { runUninstallSteps } from '../installer/runner.js';
import { fetchRegistry } from '../registry/fetch.js';
import { realExec } from '../shell/exec.js';

type Phase =
  | 'intro'
  | 'backup-failed'
  | 'step1-knowledge'
  | 'step2-skills'
  | 'step3-claude'
  | 'step4-tools'
  | 'step5-cli'
  | 'done';

interface CompletedStep {
  label: string;
  skipped: boolean;
}

/** Track which categories the user opted to keep */
interface SkippedCategories {
  knowledge: boolean;
  skills: boolean;
}

export function Uninstall() {
  const { exit } = useApp();
  const [phase, setPhase] = useState<Phase>('intro');
  const [backupPath, setBackupPath] = useState<string | undefined>(undefined);
  const [completedSteps, setCompletedSteps] = useState<CompletedStep[]>([]);
  const [templates, setTemplates] = useState<string[]>([]);
  const [npmError, setNpmError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [kept, setKept] = useState<SkippedCategories>({ knowledge: false, skills: false });

  // Load templates once on mount
  useEffect(() => {
    setTemplates(getInstalledTemplateNames());
  }, []);

  function addStep(label: string, skipped: boolean) {
    setCompletedSteps((prev) => [...prev, { label, skipped }]);
  }

  useInput(
    (input) => {
      /* v8 ignore start */
      if (busy) return;
      /* v8 ignore stop */

      const yes = input === 'y' || input === 'Y';
      const no = input === 'n' || input === 'N';
      if (!yes && !no) return;

      if (phase === 'intro') {
        if (no) {
          exit();
          return;
        }
        // Run backup then advance — abort if backup fails
        setBusy(true);
        const result = backupKnowledge();
        setBusy(false);
        if (!result.success && !result.skipped) {
          setPhase('backup-failed');
          return;
        }
        if (result.backupPath) setBackupPath(result.backupPath);
        setPhase('step1-knowledge');
        return;
      }

      if (phase === 'backup-failed') {
        // Any key exits
        exit();
        return;
      }

      if (phase === 'step1-knowledge') {
        if (yes) {
          const home = homedir();
          const pilotDir = join(home, '.pilot');
          try {
            rmSync(join(pilotDir, 'knowledge'), { recursive: true, force: true });
            rmSync(join(pilotDir, 'sessions'), { recursive: true, force: true });
            rmSync(join(pilotDir, 'audit.log'), { force: true });
          } catch {
            // best-effort
          }
          addStep('Knowledge & sessions removed', false);
        } else {
          setKept((prev) => ({ ...prev, knowledge: true }));
          addStep('Knowledge & sessions', true);
        }
        setPhase('step2-skills');
        return;
      }

      if (phase === 'step2-skills') {
        if (yes) {
          const home = homedir();
          const pilotDir = join(home, '.pilot');
          try {
            rmSync(join(pilotDir, 'skills'), { recursive: true, force: true });
            rmSync(join(pilotDir, 'plugins'), { recursive: true, force: true });
            rmSync(join(pilotDir, 'manifest.json'), { force: true });
          } catch {
            // best-effort
          }
          addStep('Skills & plugins removed', false);
        } else {
          setKept((prev) => ({ ...prev, skills: true }));
          addStep('Skills & plugins', true);
        }
        setPhase('step3-claude');
        return;
      }

      if (phase === 'step3-claude') {
        if (yes) {
          removeSkillSymlink();
          removeRoutingFromClaudeMd();
          addStep('Claude integration removed', false);
        } else {
          addStep('Claude integration', true);
        }
        setPhase('step4-tools');
        return;
      }

      if (phase === 'step4-tools') {
        /* v8 ignore start */
        if (templates.length === 0) {
          // Should have been auto-skipped, but handle defensively
          setPhase('step5-cli');
          return;
        }
        /* v8 ignore stop */
        if (yes) {
          setBusy(true);
          const home = homedir();
          const cacheDir = join(home, '.pilot', 'registry');
          const noop = {
            onStepStart: () => {},
            onStepSkip: () => {},
            onStepDone: () => {},
            onStepError: () => {},
          };
          (async () => {
            try {
              const { index } = await fetchRegistry({ cacheDir });
              const managers = await detectPackageManagers(realExec);
              // Track remaining installed templates so shared-dep protection
              // (pkg + global npm) sees the real peer set as we uninstall.
              let remaining = [...templates];
              for (const t of templates) {
                const otherInstalled = remaining.filter((n) => n !== t);
                const entry = index.templates.find((e) => e.name === t);
                // Default to false: only mark cleanup successful when we
                // actually ran the uninstall steps. If the registry no longer
                // knows about this template, we can't safely remove it — keep
                // the state so the user retains visibility and can retry.
                let cleanupSucceeded = false;
                if (entry) {
                  try {
                    await runUninstallSteps(
                      entry.steps,
                      managers,
                      undefined,
                      otherInstalled,
                      t,
                      noop
                    );
                    cleanupSucceeded = true;
                  } catch {
                    // Keep template tracked so the user can retry cleanup via
                    // `pilot down <template>` instead of losing state visibility.
                  }
                }
                if (cleanupSucceeded) {
                  removeTemplateFromState(t);
                  remaining = otherInstalled;
                }
                // else: template remains tracked so the user can retry cleanup.
              }
            } catch {
              // Registry unavailable (network down, UP_REGISTRY_TAMPERED, etc.).
              // Do NOT clear state — the dev tools are still installed on the
              // machine, and removing the tracking now would leave the user
              // with no way to retry via `pilot down <template>`.
            }
            addStep('Dev tools removed', false);
            setBusy(false);
            setPhase('step5-cli');
          })();
        } else {
          addStep('Dev tools', true);
          setPhase('step5-cli');
        }
        return;
      }

      if (phase === 'step5-cli') {
        if (yes) {
          setBusy(true);
          const home = homedir();
          const pilotDir = join(home, '.pilot');
          try {
            // Only remove settings + templates state; respect earlier skip choices
            rmSync(join(pilotDir, 'settings.json'), { force: true });
            rmSync(join(pilotDir, 'templates.json'), { force: true });
            rmSync(join(pilotDir, 'crew.json'), { force: true });
            rmSync(join(pilotDir, 'analytics'), { recursive: true, force: true });
            // Remove knowledge/skills only if user didn't skip those steps
            if (!kept.knowledge) {
              rmSync(join(pilotDir, 'knowledge'), { recursive: true, force: true });
              rmSync(join(pilotDir, 'sessions'), { recursive: true, force: true });
              rmSync(join(pilotDir, 'audit.log'), { force: true });
            }
            if (!kept.skills) {
              rmSync(join(pilotDir, 'skills'), { recursive: true, force: true });
              rmSync(join(pilotDir, 'plugins'), { recursive: true, force: true });
              rmSync(join(pilotDir, 'manifest.json'), { force: true });
            }
            // Try to remove the directory itself (will only succeed if empty)
            try {
              rmSync(pilotDir, { recursive: false });
            } catch {
              // Expected if user kept some files
            }
          } catch {
            // best-effort
          }
          execFile(
            'npm',
            ['uninstall', '-g', '@medalsocial/pilot'],
            { encoding: 'utf-8' },
            (err) => {
              if (err) {
                setNpmError(
                  'Could not uninstall automatically. Run: sudo npm uninstall -g @medalsocial/pilot'
                );
              }
              addStep('Pilot CLI removed', false);
              setBusy(false);
              setPhase('done');
            }
          );
        } else {
          addStep('Pilot CLI', true);
          setPhase('done');
        }
        return;
      }
    },
    { isActive: !busy }
  );

  // Auto-skip step4 when no templates installed
  useEffect(() => {
    if (phase === 'step4-tools' && templates.length === 0) {
      setCompletedSteps((prev) => [
        ...prev,
        { label: 'Dev tools (none installed)', skipped: true },
      ]);
      setPhase('step5-cli');
    }
  }, [phase, templates]);

  const skippedItems = completedSteps.filter((s) => s.skipped).map((s) => s.label);

  return (
    <Box flexDirection="column" padding={2} gap={1}>
      <Text color={colors.muted}>$ pilot down</Text>

      {/* Completed steps history */}
      {completedSteps.map((s) => (
        <Step
          key={s.label}
          label={s.label}
          status={s.skipped ? 'waiting' : 'done'}
          detail={s.skipped ? '(skipped)' : undefined}
        />
      ))}

      {/* Intro phase */}
      {phase === 'intro' && (
        <Box flexDirection="column" gap={1}>
          <Text color={colors.warning} bold>
            This will remove Pilot from your machine.
          </Text>
          <Text color={colors.text}>Your knowledge files will be backed up before removal.</Text>
          <Text color={colors.text}>Continue? [Y/n]</Text>
        </Box>
      )}

      {/* Backup failed — abort */}
      {phase === 'backup-failed' && (
        <Box flexDirection="column" gap={1}>
          <Text color={colors.error} bold>
            Could not back up knowledge files. Uninstall aborted for safety.
          </Text>
          <Text color={colors.muted}>Press any key to exit.</Text>
        </Box>
      )}

      {/* Step 1: knowledge */}
      {phase === 'step1-knowledge' && (
        <Box flexDirection="column" gap={1}>
          <Step label="Remove knowledge, sessions & audit log?" status="active" />
          <Text color={colors.text}>Remove knowledge/, sessions/, audit.log? [Y/n]</Text>
        </Box>
      )}

      {/* Step 2: skills */}
      {phase === 'step2-skills' && (
        <Box flexDirection="column" gap={1}>
          <Step label="Remove skills, plugins & manifest?" status="active" />
          <Text color={colors.text}>Remove skills/, plugins/, manifest.json? [Y/n]</Text>
        </Box>
      )}

      {/* Step 3: claude integration */}
      {phase === 'step3-claude' && (
        <Box flexDirection="column" gap={1}>
          <Step label="Remove Claude integration?" status="active" />
          <Text color={colors.text}>Remove skill symlink and routing from CLAUDE.md? [Y/n]</Text>
        </Box>
      )}

      {/* Step 4: dev tools */}
      {phase === 'step4-tools' && templates.length > 0 && (
        <Box flexDirection="column" gap={1}>
          <Step label="Remove dev tool templates?" status="active" />
          <Box flexDirection="column">
            {templates.map((t) => (
              <Text key={t} color={colors.muted}>
                {'  '}• {t}
              </Text>
            ))}
          </Box>
          <Text color={colors.text}>Uninstall all templates? [Y/n]</Text>
        </Box>
      )}

      {/* Step 5: CLI removal */}
      {phase === 'step5-cli' && (
        <Box flexDirection="column" gap={1}>
          <Step label="Remove ~/.pilot and uninstall CLI?" status="active" />
          <Text color={colors.text}>Remove ~/.pilot directory and npm package? [Y/n]</Text>
        </Box>
      )}

      {/* Done */}
      {phase === 'done' && (
        <Box flexDirection="column" gap={1}>
          <Box marginTop={1}>
            <Text color={colors.success} bold>
              ✈ Pilot has been removed. Safe travels!
            </Text>
          </Box>
          {backupPath && <Text color={colors.muted}>Knowledge backed up to: {backupPath}</Text>}
          {npmError && <Text color={colors.warning}>{npmError}</Text>}
          {skippedItems.length > 0 && (
            <Box flexDirection="column">
              <Text color={colors.muted}>Skipped:</Text>
              {skippedItems.map((item) => (
                <Text key={item} color={colors.muted}>
                  {'  '}• {item}
                </Text>
              ))}
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
