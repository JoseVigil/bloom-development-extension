// internal/orchestration/mandatestate/transition.go
//
// CAMBIO (esta sesión): Paso 2 del plan de consolidación del action graph
// (Mandate_Genesis_ActionGraph_Plan_Ejecucion_v1.md). Generaliza el patrón
// de validación de transición que mandate_genesis_sign_activity.go ya usaba
// inline y duplicado para signature.status (persistSignatureSigned /
// PersistSignatureFailureActivity: "if status != pending { error }") en una
// función compartida, para que currentPhase pueda usar la misma disciplina
// sin reinventarla ni duplicarla otra vez.
package mandatestate

import "fmt"

// ValidateForwardOnly rechaza cualquier transición que no sea exactamente
// un paso hacia adelante en order — nunca un salto (ingest → signed
// saltando cluster/validate), nunca un retroceso (signed → cluster).
// current == next se trata como no-op válido: el caller decide qué hacer
// con eso (Mutate ya tiene su propio criterio de idempotencia vía el bool
// de retorno del callback).
func ValidateForwardOnly(order []string, current, next string) error {
	if current == next {
		return nil
	}
	currentIdx := indexOf(order, current)
	if currentIdx == -1 {
		return fmt.Errorf("estado actual %q no pertenece a la secuencia %v", current, order)
	}
	nextIdx := indexOf(order, next)
	if nextIdx == -1 {
		return fmt.Errorf("estado destino %q no pertenece a la secuencia %v", next, order)
	}
	if nextIdx != currentIdx+1 {
		return fmt.Errorf("transición %q → %q inválida (orden esperado: %v)", current, next, order)
	}
	return nil
}

func indexOf(order []string, value string) int {
	for i, v := range order {
		if v == value {
			return i
		}
	}
	return -1
}
