# 📘 Guía Maestra: Stepper de Onboarding v2.0 (SSOT)

**Fecha de actualización:** 5 de Julio de 2026
**Estado:** Arquitectura unificada implementada. Fase B (Rediseño) en curso.
**Fuente de Verdad Única (SSOT):** `config/onboarding/onboarding_steps.json`

---

## 1. La Nueva Arquitectura (El "Cerebro")

Hemos eliminado las 8 listas paralelas que fragmentaban la lógica. Ahora el flujo se rige por un **Motor de Resolución Idempotente**:

1.  **SSOT (`onboarding_steps.json`)**: Define la identidad del paso, su vista, qué requiere para existir y qué produce.
2.  **Verificadores (`step-verifiers.js`)**: Es la "aduana". No pregunta si el paso se terminó; pregunta si los archivos o campos en el sistema **existen de verdad**.
3.  **Motor (`resolution-engine.js`)**: El árbitro. Recorre la lista y decide: *"Si tienes A pero no tienes B, vas a la pantalla B"*.
4.  **Handlers (`onboarding-handlers.js`)**: Ahora son un "puente vacío". Ya no deciden el flujo, solo ejecutan los mandatos del motor.

---

## 2. Mapa de Verificación (La "Verdad" del Sistema)

Para que el Onboarding sea **Idempotente** (que se pueda cerrar y abrir sin errores), los verificadores actúan así:

| Hito (Step ID) | Producto (`produces`) | Verificación Real (Opción B) |
| :--- | :--- | :--- |
| **github_auth** | `github_token` | Busca `github_token_fingerprint` en `nucleus.json`. |
| **nucleus_create** | `workspace_path` | Verifica existencia de carpeta + archivo marcador `.nucleus`. |
| **vault_init** | `vault_initialized` | Busca campo `onboarding.vault_initialized` en `nucleus.json`. |
| **google_auth** | `google_account` | Busca campo `onboarding.google_account` en `nucleus.json`. |
| **ai_provider_setup** | `ai_provider_key` | Busca campo `onboarding.ai_provider_key` en `nucleus.json`. |
| **project_create** | `project_mandate` | Verifica existencia física del archivo `genesis.mandate`. |

---

## 3. Alineación con Protocolo Synapse (v3)

Este rediseño resuelve directamente los dolores encontrados en la auditoría de Synapse:

*   **Bug #1 (Pipeline mudo):** Resuelto. El nuevo JSON incluye los campos `cortex_events` y `conductor_reaction`. Ahora el `MilestoneRegistry` sí escucha al Brain.
*   **Duplicación Conductor/Workspace:** Al extraer la lógica a `resolution-engine.js`, el `main_conductor.js` y `workspace-synapse-handlers.js` ahora pueden importar la misma lógica en lugar de duplicarla.
*   **Idempotencia:** Cumplimos con el protocolo Synapse al no confiar en eventos que pudieron haberse perdido, sino en el estado del artefacto en el disco.

---

## 4. Pendientes Críticos (Lo que falta para "Cantar Victoria")

Aunque la arquitectura es sólida, quedan estos puntos abiertos para tu próxima iteración:

1.  **Actualización del Renderer (`onboarding.js`)**: La UI todavía cree que debe manejar una lista de "pasos completados". Hay que refactorizarla para que simplemente diga: *"Dime qué ID de pantalla muestro (entryStepId) y yo la muestro"*.
2.  **Transiciones Visuales**: Debemos definir si, al detectar un paso completo en vivo (vía Milestone), el stepper debe "saltar" automáticamente a la siguiente pantalla o esperar a que el usuario haga click en "Continuar".
3.  **Campos Placeholder**: Confirmar que los campos `google_account` y `ai_provider_key` son los que el Brain escribe realmente. (Esto se verifica con un log de `nucleus.json` tras una prueba exitosa).

---

## 5. Próximos Pasos (Roadmap de Iteración)

1.  **Fase B - Paso 3 (Unificación de Avance)**: Eliminar definitivamente el uso de `goTo(n)` por números en la UI y migrar a `navigateTo(stepId)`.
2.  **Fase B - Paso 5 (UX de Error)**: Implementar qué sucede cuando un verificador falla (ej: la carpeta del workspace fue borrada manualmente). El motor debería detectar esto y "retroceder" el stepper al paso de creación de Workspace automáticamente.

