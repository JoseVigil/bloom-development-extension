package assessment

import (
	"encoding/json"
	"fmt"
	"github.com/spf13/cobra"
	"impact/adapters/local"
	"impact/internal/core"
	"os"
)

func init() { core.RegisterCommand("EVALUATION", createAssessCommand) }
func createAssessCommand(c *core.Core) *cobra.Command {
	var input string
	cmd := &cobra.Command{Use: "assess", Short: "Evaluate an explicit question against supplied criterion and evidence", Long: "Evaluate coexistence, preservation, compliance or a registered future evaluator. The request identifies the question and version. An assessment is evidence, never authority to execute.", Args: cobra.NoArgs, Example: "  impact assess --input request.json\n  impact assess --input request.json --json", Annotations: map[string]string{"category": "EVALUATION", "json_response": `{"contract":"impact/1","question":{"type":"coexistence","version":"1"},"questionText":"Explicit evaluation question","inputDigest":"sha256:...","evaluatorVersion":"1","findings":[],"coverage":{"evaluated":[],"undetermined":[],"complete":false},"indeterminacy":[],"reevaluateWhen":[]}`}, RunE: func(cmd *cobra.Command, args []string) error {
		f, err := os.Open(input)
		if err != nil {
			return fmt.Errorf("cannot open input file")
		}
		defer f.Close()
		a, err := local.Evaluate(c.Engine, f)
		if err != nil {
			return err
		}
		if err = c.Logger.Success(fmt.Sprintf("assessment completed digest=%s findings=%d complete=%t", a.InputDigest, len(a.Findings), a.Coverage.Complete)); err != nil {
			return err
		}
		if c.JSON {
			return json.NewEncoder(c.Out).Encode(a)
		}
		if _, err = fmt.Fprintf(c.Out, "Question: %s\nInput: %s\nCoverage complete: %t\n", a.QuestionText, a.InputDigest, a.Coverage.Complete); err != nil {
			return err
		}
		for _, f := range a.Findings {
			fmt.Fprintf(c.Out, "%s: %s\n", f.Code, f.Conclusion)
		}
		for _, reason := range a.Indeterminacy {
			fmt.Fprintf(c.Out, "Undetermined: %s\n", reason)
		}
		return nil
	}}
	cmd.Flags().StringVar(&input, "input", "", "EvaluationRequest JSON file (required)")
	_ = cmd.MarkFlagRequired("input")
	return cmd
}
