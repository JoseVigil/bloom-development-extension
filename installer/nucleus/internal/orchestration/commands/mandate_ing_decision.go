package commands

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"reflect"

	"github.com/spf13/cobra"
	"nucleus/internal/authority"
	"nucleus/internal/core"
	"nucleus/internal/orchestration/mandatecontract"
	"nucleus/internal/orchestration/mandatestate"
	"nucleus/internal/orchestration/temporal"
	"nucleus/internal/supervisor"
)

type ingDecisionResult struct {
	Success        bool   `json:"success"`
	MandateID      string `json:"mandateId"`
	ActionID       string `json:"actionId,omitempty"`
	ContractDigest string `json:"contractDigest,omitempty"`
	IntentID       string `json:"intentId,omitempty"`
	DecisionDigest string `json:"decisionDigest,omitempty"`
	SignalPending  bool   `json:"signalPending"`
	Error          string `json:"error,omitempty"`
}

type ingDecisionBinding struct {
	MandateID, ActionID, ContractDigest, DeliveryDigest, OrganizationID, InstallationID, IntentID, ClassificationDigest string
}

func persistINGDecision(path string, binding ingDecisionBinding, record map[string]any) error {
	_, err := mandatestate.Mutate(path, func(current map[string]any) (bool, error) {
		adopted, _ := current["adoption"].(map[string]any)
		currentActions, _ := current["actions"].(map[string]any)
		currentEntry, _ := currentActions[binding.ActionID].(map[string]any)
		if currentEntry == nil {
			return false, errors.New("journal ING cambió")
		}
		currentDigest := currentEntry["evidenceSha256"]
		if currentEntry["status"] == "completed" {
			currentDigest = currentEntry["classificationSha256"]
		}
		if current["mandateId"] != binding.MandateID || adopted == nil || adopted["contractDigest"] != binding.ContractDigest || adopted["digest"] != binding.DeliveryDigest || adopted["version"] == "" || adopted["organizationId"] != binding.OrganizationID || adopted["installationId"] != binding.InstallationID || currentDigest != binding.ClassificationDigest || currentEntry["intentId"] != binding.IntentID {
			return false, errors.New("journal ING cambió")
		}
		if prior, ok := current["ingDecision"]; ok {
			if reflect.DeepEqual(prior, record) {
				return false, nil
			}
			return false, errors.New("decisión ING contradictoria")
		}
		current["ingDecision"] = record
		return true, nil
	})
	return err
}

func createMandateINGDecisionCommand(c *core.Core) *cobra.Command {
	var id, decisionsPath string
	cmd := &cobra.Command{
		Use: "ing-decision", Short: "Registra la decisión humana de ING",
		Long:        "Registra las decisiones para todos los clusters clasificados de un Mandate adoptado. Vincula el lote al contrato y a la clasificación antes de avisar al workflow; repetir el mismo lote es seguro.",
		Example:     "  nucleus mandate ing-decision --id MANDATE_ID --decisions decisions.json\n  nucleus --json mandate ing-decision --id MANDATE_ID --decisions decisions.json",
		Args:        cobra.NoArgs,
		Annotations: map[string]string{"category": "MANDATES", "json_response": `{"success":true,"mandateId":"MANDATE_ID","actionId":"ACTION_ID","contractDigest":"SHA256","intentId":"INTENT_ID","decisionDigest":"SHA256","signalPending":false}`},
		RunE: func(cmd *cobra.Command, _ []string) error {
			result, err := runMandateINGDecision(cmd.Context(), c, id, decisionsPath)
			if err != nil {
				result.Success = false
				result.MandateID = id
				result.Error = err.Error()
			}
			if c != nil && c.IsJSON {
				raw, _ := json.Marshal(result)
				fmt.Fprintln(cmd.OutOrStdout(), string(raw))
			} else if err == nil {
				fmt.Fprintf(cmd.OutOrStdout(), "Decisiones ING registradas para %s (aviso pendiente: %t)\n", id, result.SignalPending)
			}
			return err
		},
	}
	cmd.Flags().StringVar(&id, "id", "", "ID del Mandate adoptado")
	cmd.Flags().StringVar(&decisionsPath, "decisions", "", "Archivo JSON con una decisión por cluster")
	_ = cmd.MarkFlagRequired("id")
	_ = cmd.MarkFlagRequired("decisions")
	return cmd
}

func runMandateINGDecision(ctx context.Context, c *core.Core, id, decisionsPath string) (ingDecisionResult, error) {
	result := ingDecisionResult{MandateID: id}
	if c == nil || id == "" || filepath.Base(id) != id || decisionsPath == "" {
		return result, errors.New("Mandate ID o decisiones inválidas")
	}
	if err := requireMandateMaster(c); err != nil {
		return result, err
	}
	active, err := core.ResolveActiveOrgContext()
	if err != nil {
		return result, err
	}
	cfg, err := supervisor.LoadNucleusConfig()
	if err != nil {
		return result, err
	}
	if filepath.Clean(cfg.MandatesRoot()) != filepath.Join(active.NucleusRoot, ".mandates") {
		return result, errors.New("workspace ajeno a la organización activa")
	}
	dir := filepath.Join(cfg.MandatesRoot(), id)
	identityPath := filepath.Join(core.ResolveAppDataDir(), "authority", "identity.json")
	envelope, err := mandatecontract.LoadVerified(dir, identityPath)
	if err != nil {
		return result, err
	}
	if envelope.Contract.ContractVersion != 4 || envelope.Contract.MandateID != id || envelope.Contract.OrganizationID != active.OrganizationID {
		return result, errors.New("Mandate adoptado inválido")
	}
	mandateRaw, err := os.ReadFile(filepath.Join(dir, "mandate.json"))
	if err != nil {
		return result, err
	}
	deliverySum := sha256.Sum256(mandateRaw)
	deliveryDigest := hex.EncodeToString(deliverySum[:])
	identity, err := authority.LoadExistingLocalIdentity(identityPath)
	if err != nil {
		return result, err
	}
	for _, operation := range []string{"approve", "activate"} {
		receipt, loadErr := mandatecontract.LoadActReceipt(dir, operation)
		if loadErr != nil {
			return result, loadErr
		}
		if verifyErr := mandatecontract.VerifyActReceipt(receipt, identity, authority.DevelopmentPinnedRoots(), operation, id, envelope.ContractDigest, envelope.Contract.ProjectID); verifyErr != nil {
			return result, verifyErr
		}
	}
	decisionRaw, err := os.ReadFile(decisionsPath)
	if err != nil {
		return result, err
	}
	var decisions []map[string]any
	if json.Unmarshal(decisionRaw, &decisions) != nil || len(decisions) == 0 {
		return result, errors.New("lote de decisiones inválido")
	}
	journalPath := filepath.Join(dir, "mandate_state.json")
	var state map[string]any
	journalRaw, err := os.ReadFile(journalPath)
	if err != nil {
		return result, err
	}
	if json.Unmarshal(journalRaw, &state) != nil {
		return result, errors.New("journal inválido")
	}
	adoption, _ := state["adoption"].(map[string]any)
	actions, _ := state["actions"].(map[string]any)
	action := envelope.Contract.Actions[0]
	entry, _ := actions[action.ActionID].(map[string]any)
	if state["mandateId"] != id || adoption == nil || adoption["contractDigest"] != envelope.ContractDigest || adoption["digest"] != deliveryDigest || adoption["version"] == "" || adoption["organizationId"] != active.OrganizationID || adoption["installationId"] != envelope.SignatureKeyID || entry == nil || (entry["status"] != "awaiting_human_decision" && entry["status"] != "completed") {
		return result, errors.New("ING no espera decisiones en el contrato adoptado")
	}
	ref, _ := entry["evidenceRef"].(string)
	digest, _ := entry["evidenceSha256"].(string)
	if entry["status"] == "completed" {
		ref, _ = entry["classificationRef"].(string)
		digest, _ = entry["classificationSha256"].(string)
	}
	intentID, _ := entry["intentId"].(string)
	if ref == "" || digest == "" || intentID == "" {
		return result, errors.New("clasificación ING incompleta")
	}
	intentBase := filepath.Join(active.NucleusRoot, ".intents", ".ing")
	rel, err := filepath.Rel(intentBase, ref)
	if err != nil || rel == ".." || len(rel) >= 3 && rel[:3] == ".."+string(filepath.Separator) {
		return result, errors.New("clasificación fuera de ING")
	}
	classificationRaw, err := os.ReadFile(ref)
	if err != nil {
		return result, err
	}
	sum := sha256.Sum256(classificationRaw)
	if hex.EncodeToString(sum[:]) != digest {
		return result, errors.New("clasificación ING cambió")
	}
	var classification struct {
		MandateID string `json:"mandate_id"`
		IntentID  string `json:"intent_id"`
		Clusters  []struct {
			ClusterID string `json:"cluster_id"`
		} `json:"clusters"`
	}
	if json.Unmarshal(classificationRaw, &classification) != nil || classification.MandateID != id || classification.IntentID != intentID || len(classification.Clusters) == 0 || len(decisions) != len(classification.Clusters) {
		return result, errors.New("decisiones no cubren la clasificación")
	}
	known := map[string]bool{}
	for _, cluster := range classification.Clusters {
		known[cluster.ClusterID] = true
	}
	seen := map[string]bool{}
	for _, decision := range decisions {
		clusterID, _ := decision["cluster_id"].(string)
		choice, _ := decision["human_decision"].(string)
		if !known[clusterID] || seen[clusterID] || (choice != "approved" && choice != "overridden" && choice != "rejected") {
			return result, errors.New("decisión de cluster inválida o duplicada")
		}
		seen[clusterID] = true
	}
	canonical, _ := json.Marshal(decisions)
	decisionSum := sha256.Sum256(canonical)
	decisionDigest := hex.EncodeToString(decisionSum[:])
	record := map[string]any{"actionId": action.ActionID, "contractDigest": envelope.ContractDigest, "intentId": intentID, "classificationDigest": digest, "decisions": decisions, "decisionDigest": decisionDigest}
	logger, logErr := core.InitLogger(&c.Paths, "MANDATE", c.IsJSON)
	if logErr != nil {
		return result, logErr
	}
	defer logger.Close()
	err = persistINGDecision(journalPath, ingDecisionBinding{MandateID: id, ActionID: action.ActionID, ContractDigest: envelope.ContractDigest, DeliveryDigest: deliveryDigest, OrganizationID: active.OrganizationID, InstallationID: envelope.SignatureKeyID, IntentID: intentID, ClassificationDigest: digest}, record)
	if err != nil {
		logger.Warning("event=ing_decision mandateId=%s actionId=%s contractDigest=%s intentId=%s outcome=rejected reason=%v", id, action.ActionID, envelope.ContractDigest, intentID, err)
		return result, err
	}
	result = ingDecisionResult{Success: true, MandateID: id, ActionID: action.ActionID, ContractDigest: envelope.ContractDigest, IntentID: intentID, DecisionDigest: decisionDigest, SignalPending: true}
	logger.Info("event=ing_decision mandateId=%s actionId=%s contractDigest=%s intentId=%s outcome=recorded", id, action.ActionID, envelope.ContractDigest, intentID)
	if entry["status"] == "completed" {
		result.SignalPending = false
		return result, nil
	}
	tc, err := temporal.NewClient(ctx, &c.Paths, c.IsJSON)
	if err == nil {
		defer tc.Close()
		err = tc.SignalWorkflow(ctx, "mandate_execute_"+id, "", "mandate:ing:decision", decisionDigest)
	}
	if err == nil {
		result.SignalPending = false
	} else {
		logger.Warning("event=ing_decision_signal mandateId=%s actionId=%s contractDigest=%s intentId=%s outcome=pending reason=%v", id, action.ActionID, envelope.ContractDigest, intentID, err)
	}
	return result, nil
}
