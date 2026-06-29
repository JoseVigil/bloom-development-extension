# Session Progress Manifesto
## Bloom Conductor — Workspace Core UI
### v0.3 · 29 de junio de 2026 · Principio de Segregación de Entropía Cognitiva

---

## REGISTRO DE CAMBIOS v0.2 → v0.3

**F-01 expandido.** Se agrega el Principio de Segregación de Entropía Cognitiva como fundamento psicológico y arquitectónico de la división Companion / Conductor. Integrado como bloque destacado dentro de F-01 y como extensión de F-07.

**F-09 agregado.** El Companion como Segundo Cerebro: el rol formal del Companion Panel cuando es rehidratado con metadata de intents vía `STORE_BRIEF` / `INJECT_BRIEF`.

El resto del manifiesto se mantiene sin cambios.

---

## FUNDAMENTOS FIJADOS

### F-01 — Gobernanza Multicanal + Principio de Segregación de Entropía Cognitiva

El Conductor es el centro de mando determinista del pipeline BTIPS. Sus inputs son siempre reactivos a un estado concreto del sistema. Es la única superficie con autoridad para ejecutar actos de gobernanza irreversibles.

Esta definición no cierra la puerta a la interacción reactiva — la acota. La interacción en el Conductor es **dirigida y contextual**: el sistema presenta un output digerido y el usuario responde con inputs específicos para ese contexto. La exploración libre, el razonamiento conceptual y el soporte conversacional tienen su superficie propia: el Companion Panel.

---

> #### Principio de Segregación de Entropía Cognitiva — Aislamiento de Foco
>
> La bifurcación entre el Companion (Exploratorio) y el Conductor (Ejecutor) responde a una necesidad psicológica y arquitectónica simultánea: **proteger la ventana de contexto del pipeline BTIPS de la entropía del proceso humano de pensar en voz alta.**
>
> En un chat tradicional, el ida y vuelta de preguntas informales, dudas y exploraciones introduce ruido semántico que diluye el foco del modelo y desvía la ejecución del objetivo técnico original. El modelo acumula contexto irrelevante. El intent original se degrada. El filesystem recibe outputs contaminados por el camino que el usuario tomó para llegar a una decisión, no por la decisión misma.
>
> Al canalizar toda la exploración creativa, las consultas de soporte y las dudas en el Companion, el usuario **descarga la entropía cognitiva en un entorno de baja fricción y alta tolerancia al error**. El Companion absorbe el proceso — el caos productivo de pensar. El Conductor recibe únicamente el resultado: intents limpios, directos y maduros.
>
> El resultado es determinismo absoluto en la ejecución y en el filesystem. El Conductor no sabe que hubo vacilación, exploración ni corrección de rumbo — solo sabe qué hacer, porque lo que llega a él ya pasó por el filtro cognitivo del Companion.

---

Esta segregación no es una restricción de UX. Es una **decisión de higiene arquitectónica** que protege la integridad del pipeline al reconocer que el proceso humano de tomar decisiones es inherentemente ruidoso, y que ese ruido no debe entrar al sistema de ejecución.

### F-02 — El Mandate no es un documento *(sin cambios)*

Un Mandate es un contrato firmado que orquesta Actions → Intents. Lo que el usuario observa es el estado vivo de ejecución que llega por WebSocket desde Sentinel (`:4124`).

### F-03 — Las cuatro zonas arquitectónicas del Conductor son no negociables *(sin cambios)*

| Zona | Nombre | Responsabilidad única |
|---|---|---|
| 1 | Mandate Studio | Crear, definir y enviar Mandates a firma |
| 2 | Mandate Monitor | Observar estado de Mandates activos y sus Actions |
| 3 | Event Bus Feed | Stream de eventos de sistema — solo observabilidad |
| 4 | Project Browser | Jerarquía de proyectos del Nucleus — solo contexto |

### F-04 — Quinta Zona: superficie de input reactivo persistente *(sin cambios)*

Disponible en todo momento en el Conductor. Input siempre anclado a un estado concreto del sistema. Sin estado activo que lo ancle, la superficie está presente pero inactiva.

### F-05 — Diferenciación estricta de Mandates en el layout de solapas *(sin cambios)*

Genesis Mandate y Mandate estándar son organismos completamente distintos. No existen componentes genéricos. Existen `GenesisTab` y `StandardMandateTab` como superficies independientes.

### F-06 — El ciclo de vida del Genesis Mandate como secuencia de pantallas *(sin cambios)*

| Estado | Fase | Input disponible |
|---|---|---|
| `building/ingest` | Ingesta y vectorización | Ninguno — observación |
| `building/cluster` | Clustering semántico de Brain | Ninguno — observación |
| `building/validate` | Validación táctil de dominios | Renombrar, fusionar, mover, confirmar |
| `pending` | Firma digital de Nucleus | Ninguno — transición de peso |
| `running` | Scaffold por dominio vía Temporal | Pausar workflow |
| `completed` | Genesis archivado | Iniciar `domain_expansion` |

### F-07 — Ecosistema de superficies coordinadas *(expandido)*

#### Conductor (Workspace Core)
Centro de mando determinista. La única superficie con autoridad para firmar Mandates, confirmar dominios, pausar workflows y aprobar decisiones de Actions `cor`. Recibe inputs ya filtrados por el proceso cognitivo del Companion — nunca el proceso en sí.

#### Companion Panel — Cognituum Side Panel
Componente nativo en el sidebar del build Chromium de Cortex. Se activa post-onboarding (`onboarding_complete`). Embebe webview de LLM solidario (Gemini en v1). Su rol es absorber la entropía del proceso humano de pensar: exploración conceptual, consultas de soporte, análisis visual de pestañas activas, síntesis de outputs del pipeline.

El Companion **no ejecuta actos de gobernanza**. Es el entorno donde la decisión madura. El Conductor es donde la decisión ejecuta.

#### La brecha de trazabilidad
Si el usuario procesa decisiones en la interfaz nativa de un provider externo (Claude.ai, Gemini web), esa interacción es invisible para el ecosistema Bloom. La trazabilidad cognitiva se rompe y el filesystem recibe outputs sin contexto de origen. Las superficies propias del ecosistema existen para cerrar esa brecha — no por restricción, sino porque sin ellas el pipeline pierde auditoría.

### F-08 — Principio de trazabilidad cognitiva *(sin cambios)*

Toda interacción que afecte o informe una decisión del pipeline BTIPS debe ocurrir en una superficie propia del ecosistema Bloom. El Companion captura el proceso. El Conductor captura el acto. Ninguna decisión relevante debe ocurrir en la interfaz nativa de un provider externo.

### F-09 — El Companion como Segundo Cerebro *(nuevo)*

El Companion Panel no es solo un chat de soporte. Cuando es rehidratado con metadata exacta de un intent activo vía `STORE_BRIEF` / `INJECT_BRIEF`, se convierte formalmente en el **Segundo Cerebro del desarrollador**: una superficie que conoce el contexto técnico preciso del pipeline en ese momento y puede razonar sobre él con el usuario en lenguaje natural.

Este mecanismo mitiga el efecto secundario principal de la segregación: que el Companion, operando solo como chat libre, no conozca el formato ni el estado del intent original. Con `STORE_BRIEF`, el Conductor puede depositar la metadata del intent en Cortex. Con `INJECT_BRIEF`, el Companion la recibe y puede operar con contexto técnico completo — sin que ese contexto haya sido contaminado por la exploración previa del usuario.

**El flujo canónico del Segundo Cerebro:**

```
Conductor detecta estado que requiere decisión humana
    │  (Action cor, propuesta de dominios, error recuperable)
    ▼
Conductor emite STORE_BRIEF con metadata del intent/mandate activo
    │  → Cortex persiste el brief en su store
    ▼
Usuario abre Companion Panel
    │  Cortex inyecta el brief vía INJECT_BRIEF
    ▼
Companion opera con contexto técnico completo
    │  el usuario explora, duda, pregunta, decide
    │  la entropía del proceso queda contenida aquí
    ▼
Usuario llega al Conductor con la decisión madura
    │  ejecuta el acto determinista
    ▼
Filesystem recibe el output limpio
    │  sin rastro del proceso que llevó a él
    ▼
Conductor puede emitir STORE_BRIEF de confirmación
    │  → Companion actualiza su estado de contexto
```

La dirección del flujo es siempre: Conductor informa al Companion → Companion absorbe el proceso → Conductor ejecuta la decisión. Nunca al revés en términos de autoridad de ejecución.

---

## DEUDA TÉCNICA ACTIVA *(sin cambios)*

| # | Problema | Impacto en UI |
|---|---|---|
| D-01 | `preload_core.js` expone `window.onboarding` en lugar de `window.nucleus` | Core no puede invocar ningún IPC |
| D-02 | `core.html` llama `window.nucleus.*` que no existe en el contextBridge | Todas las llamadas de la UI al sistema fallan silenciosamente |
| D-03 | No hay campo `mandate` en `nucleus.json` post-onboarding | La UI no puede saber si el Genesis Mandate ya fue creado |
| D-04 | `workspace_url` hardcodeado a `:3000` | Si Svelte no levanta en 3000, Core carga en blanco |
| D-05 | `registerSynapseHandlers` no se llama en el path de Core | El bridge de Synapse no se inicializa |

---

## PENDIENTES DE DECISIÓN *(sin cambios)*

| ID | Pregunta | Qué desbloquea |
|---|---|---|
| P-01 | ¿Qué estados concretos del sistema anclan la Quinta Zona? | Diseño de la superficie persistente de input |
| P-02 | ¿Un intent `.gen` único para todo el genesis o N intents por dominio? | Cómo `running` muestra progreso por dominio |
| P-03 | ¿El Studio de Mandate estándar integra IA para sugerir Actions en v1? | Flujo de creación de mandate estándar |
| P-04 | ¿Cuándo se crea el Genesis Mandate — durante onboarding o como primer acto de Core? | Pantalla inicial al cargar Core |
| P-05 | ¿Qué protocolo de sincronización existe entre Conductor y Companion Panel? | Coordinación de estado entre superficies |
| P-06 | ¿`STORE_BRIEF` / `INJECT_BRIEF` son eventos de Sentinel o un canal propio de Cortex? | Arquitectura del bridge entre Companion y Conductor |

---

## LO QUE EL v3 CONSERVA / DESCARTA *(sin cambios)*

**Conservar:** estructura sidebar + tabs + área central, identidad visual BTIPS, solapas como mandates activos.

**Descarta:** componente genérico de MandateTab, Alfred como chat sin anclaje contextual, ausencia de estados secuenciales del genesis, ledger como log de terminal.

---

*Documento vivo. v0.3 — Principio de Segregación de Entropía Cognitiva integrado. Próxima actualización: sesión de diseño de `building/validate` y coordinación Conductor ↔ Companion.*