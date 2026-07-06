// internal/orchestration/activities/mandate_genesis_activities.go
package activities

import (
	"bytes"
	"encoding/json"
	"net/http"
	"time"
)

type ScaffoldDomainInput struct {
	MandateID  string
	ActionID   string
	DomainName string
	Files      []string
}

type ScaffoldDomainResult struct {
	ResultRef string // path relativo a .intents/.gen/.../report.json
}

// ScaffoldDomainActivity habla por TCP (puerto 5678) con Brain para generar
// código de dominio.
// TODO: acá va la llamada real a Brain — mismo patrón que sentinel_activities.go
// usa para invocar Brain (no lo invento sin ver ese archivo).
func ScaffoldDomainActivity(input ScaffoldDomainInput) (ScaffoldDomainResult, error) {
	publishMandateEvent("mandate:action:started", map[string]interface{}{
		"mandateId":  input.MandateID,
		"actionId":   input.ActionID,
		"domainName": input.DomainName,
		"startedAt":  time.Now().Format(time.RFC3339),
	})

	resultRef := ".intents/.gen/" + input.DomainName + "/report.json"

	publishMandateEvent("mandate:action:completed", map[string]interface{}{
		"mandateId":   input.MandateID,
		"actionId":    input.ActionID,
		"domainName":  input.DomainName,
		"resultRef":   resultRef,
		"completedAt": time.Now().Format(time.RFC3339),
	})
	return ScaffoldDomainResult{ResultRef: resultRef}, nil
}

// PublishMandateEventActivity es la versión "activity" para eventos que el
// workflow mismo dispara (no una activity de negocio), como all_complete.
func PublishMandateEventActivity(event string, data map[string]interface{}) error {
	publishMandateEvent(event, data)
	return nil
}

// publishMandateEvent hace POST al endpoint dual-emit del Control Plane
// (puerto 48215, el mismo que expone bootControlPlane en service.go).
func publishMandateEvent(event string, data map[string]interface{}) {
	body, _ := json.Marshal(map[string]interface{}{"event": event, "data": data})
	go func() {
		client := &http.Client{Timeout: 2 * time.Second}
		resp, err := client.Post("http://localhost:48215/internal/mandate-event",
			"application/json", bytes.NewBuffer(body))
		if err != nil {
			return
		}
		defer resp.Body.Close()
	}()
}