package ionpump

import (
	"fmt"
	"os"
	"path/filepath"

	"metamorph/internal/core"
	"metamorph/internal/inspection"
	"github.com/spf13/cobra"
)

func createRollbackCommand(c *core.Core) *cobra.Command {
	var forceSwap bool

	cmd := &cobra.Command{
		Use:   "rollback <domain>",
		Short: "Rollback ion site to previous backup version",
		Long: `Restores a domain's ion site from its backup copy in _backup/<domain>/.

The backup is created automatically during every successful atomic swap, so it
holds the previous version. After rollback the backup directory is consumed —
a second rollback is not possible until the next swap.

Use --force-swap to bypass Brain quiesce/reload signals during emergency recovery.

Verify available backups with:
  metamorph ion-pump status <domain>`,

		Args: cobra.ExactArgs(1),

		Annotations: map[string]string{
			"category": "IONPUMP",
			"json_response": `{
  "success": true,
  "domain": "github.com",
  "version_before": "1.1.0",
  "version_after": "1.0.0",
  "backup_consumed": true
}`,
		},

		Example: `  metamorph ion-pump rollback github.com
  metamorph ion-pump rollback github.com --force-swap
  metamorph --json ion-pump rollback github.com`,

		RunE: func(cmd *cobra.Command, args []string) error {
			domain := args[0]

			result, err := runRollback(c, domain, forceSwap)
			if err != nil {
				c.Logger.Error("❌ Rollback failed: %v", err)
				return err
			}

			if c.Config.OutputJSON {
				c.OutputJSON(result)
				return nil
			}

			c.Logger.Info("✅ Rollback complete — %s: %s → %s",
				domain, result.VersionBefore, result.VersionAfter)
			return nil
		},
	}

	cmd.Flags().BoolVar(&forceSwap, "force-swap", false, "Bypass Brain signal — for recovery without Nucleus")

	return cmd
}

func runRollback(c *core.Core, domain string, forceSwap bool) (*RollbackResult, error) {
	ionsitesPath := resolveIonSitesPathFromCore(c)

	liveDir   := filepath.Join(ionsitesPath, domain)
	backupDir := filepath.Join(ionsitesPath, "_backup", domain)

	// Guard: live site must exist.
	if _, err := os.Stat(liveDir); os.IsNotExist(err) {
		return nil, fmt.Errorf("domain %q not found in ionsites — nothing to rollback", domain)
	}

	// Guard: backup must exist.
	if _, err := os.Stat(backupDir); os.IsNotExist(err) {
		return nil, fmt.Errorf("no backup found for %q — run 'ion-pump status %s' to verify", domain, domain)
	}

	// Read the live version (what we're replacing).
	liveInfo, _ := inspection.InspectIonRecipe(liveDir)
	versionBefore := ""
	if liveInfo != nil {
		versionBefore = liveInfo.Version
	}

	// Read the backup version (what we're restoring to).
	backupInfo, _ := inspection.InspectIonRecipe(backupDir)
	versionAfter := ""
	if backupInfo != nil {
		versionAfter = backupInfo.Version
	}

	// Signal Brain to quiesce unless --force-swap.
	var client inspection.IonPumpClient
	if forceSwap {
		c.Logger.Info("⚠️  --force-swap: Brain quiesce/reload signals skipped")
		client = &inspection.NoopIonPumpClient{}
	} else {
		client = inspection.NewHttpIonPumpClient(resolveIonPumpPort())
	}

	if !forceSwap {
		qr, err := client.QuiesceSite(domain, 10_000)
		if err != nil || qr.Status != "quiesced" {
			msg := "Brain quiesce failed"
			if err != nil {
				msg = err.Error()
			} else {
				msg = fmt.Sprintf("Brain returned status: %s", qr.Status)
			}
			return nil, fmt.Errorf("cannot rollback %q: %s (use --force-swap to bypass)", domain, msg)
		}
	}

	// Perform rollback: remove live, rename backup → live.
	if err := os.RemoveAll(liveDir); err != nil {
		return nil, fmt.Errorf("failed to remove live directory: %w", err)
	}
	if err := os.Rename(backupDir, liveDir); err != nil {
		return nil, fmt.Errorf("failed to rename backup → live: %w", err)
	}

	// Signal Brain to reload.
	if !forceSwap {
		if _, err := client.ReloadSite(domain, versionAfter); err != nil {
			c.Logger.Info("⚠️  Brain reload signal failed after rollback: %v", err)
			// Non-fatal — rollback succeeded on disk.
		}
	}

	// Update versions.json to reflect the rollback.
	vf, err := readVersionsJSON(ionsitesPath)
	if err == nil {
		if entry, ok := vf.Sites[domain]; ok {
			entry.Version = versionAfter
			entry.Status  = "active"
			vf.Sites[domain] = entry
			_ = atomicWriteJSON(filepath.Join(ionsitesPath, "_meta", "versions.json"), vf)
		}
	}

	return &RollbackResult{
		Success:        true,
		Domain:         domain,
		VersionBefore:  versionBefore,
		VersionAfter:   versionAfter,
		BackupConsumed: true,
	}, nil
}
