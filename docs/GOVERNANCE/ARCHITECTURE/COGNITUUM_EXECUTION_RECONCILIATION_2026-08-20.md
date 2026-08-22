# Cognituum — Reconciliación de Execution Layer

**Estado:** EN CURSO — gate bloqueante previo a EXC-001..EXC-010  
**Fecha:** 2026-08-20  
**Disparador:** inconsistencia detectada entre los contratos inicialmente
cerrados de Execution Layer y el árbol/código real de Intents.  
**Pedido fuente:**
[`installer/execution/pedido_reconciliacion_execution_layer.md`](../../../installer/execution/pedido_reconciliacion_execution_layer.md)

## 1. Regla de este gate

No se ejecuta la batería, no se instala otro CLI y no se promociona ningún
provider desde `NOT_RUN` hasta resolver, en este orden:

1. mapeo campo por campo contra `bloom_project_tree.txt` para `dev`, `ing`,
   `dis` y `doc`;
2. integración first-party de OpenCode frente a AITAP y a los adapters externos
   Codex CLI y Claude Code CLI;
3. flujo `submit → response → staging → merge` implementado actualmente.

Los schemas `cognituum.execution/v1` quedan materializados para revisión, pero
su forma cerrada es **provisional hasta completar este gate**. Una ausencia en
el árbol no se clasifica automáticamente como gap de implementación: puede
refutar el campo del contrato.

## 2. Procedencia de la sesión temporal

Este checkpoint preserva decisiones y observaciones de la sesión que originó
la reconciliación:

- La tesis estratégica se redujo a propiedad portable de decisión y razón;
  memoria, sandbox, auditoría y wrapper de prompts no son el moat.
- Se eligió `installer/execution/` como ownership físico separado de Brain y
  AITAP, siguiendo la precedencia documental ya existente para Implementation
  Layer.
- Se materializaron cuatro schemas candidatos: Execution Package, Execution
  Event, Execution Result y Evidence.
- Se definió EXC-001..EXC-010, pero **no se ejecutó ningún caso**.
- Codex fue detectado en
  `C:\Program Files\WindowsApps\OpenAI.Codex_26.814.5167.0_x64__2p2nqsd0c76g0\app\resources\codex.exe`;
  el sandbox de la sesión rechazó lanzar `--version` con `Access is denied`.
- OpenCode fue detectado en
  `C:\Users\josev\AppData\Local\BloomNucleus\bin\opencode\opencode.exe`;
  el sandbox rechazó lanzar `--version` con `Access is denied`.
- `claude` no fue encontrado mediante `Get-Command`; no se instaló nada.
- Por estas restricciones, los tres providers permanecen `NOT_RUN`. No existe
  evidencia de conformidad cross-CLI producida por esta sesión.

## 3. Evidencia inicial del punto 1

Fuente releída específicamente para esta reconciliación:
[`tree/bloom/bloom_project_tree.txt`](../../../tree/bloom/bloom_project_tree.txt).

El árbol confirma para los cuatro tipos:

- un state file específico (`.dev_state.json`, `.ing_state.json`,
  `.dis_state.json`, `.doc_state.json`);
- archivos de fase y planes de contexto con nombres diferentes;
- por fase, `.payload.json`, `.index.json` y `.response/` con
  `.raw_output.txt`, `.report.json` y `.staging/`.

El árbol por sí solo enumera archivos, no schemas internos. Por tanto todavía
no permite afirmar de qué campo exacto sale `objective`, `constraints`,
`acceptance_criteria`, `capabilities`, `policy_ref` o cada correlation ID. El
mapeo campo por campo permanece pendiente de inspeccionar specs y productores
reales; no se completa mediante inferencia editorial.

### 3.1 Drift descubierto entre árbol y código

La primera inspección estática encontró una contradicción que bloquea asumir
equivalencia directa:

- el árbol canónico nombra `.response/.raw_output.txt`;
- `brain/core/intent/response_parser.py` busca `.raw_output.json`;
- `brain/core/intent/staging_manager.py` también consume `.raw_output.json`;
- ambos generan/consumen artefactos adicionales no visibles en el árbol, como
  `.parse_report.json` y `.staging_manifest.json`.

Este drift debe resolverse como evidencia de estado actual, no mediante rename
silencioso del árbol o del contrato.

## 4. Evidencia inicial del punto 3 — no reconciliada todavía

La búsqueda estática confirmó estas piezas actuales:

- comando: `brain/commands/intent/submit.py`;
- implementación: `brain/core/intent_manager.py::submit_intent`;
- mensaje construido con `command: "{provider}.submit"`;
- descripción explícita: envío por native host bridge;
- parseo posterior: `brain/core/intent/response_parser.py`;
- staging: `brain/core/intent/staging_manager.py`;
- validación: `brain/core/intent/validation_manager.py`;
- aplicación final: `brain/core/intent/merge_manager.py`.

Esto todavía no constituye el flujo paso a paso solicitado. En particular no
se ha demostrado aún quién escribe efectivamente la respuesta, qué handler de
Synapse/native host la recibe ni qué transición enlaza automáticamente —si
existe— submit, parse, stage, validate y merge.

## 5. Estado de los tres puntos

| Orden | Punto | Estado | Condición para cerrarlo |
|---|---|---|---|
| 1 | Campos contra árbol real por intent | EN CURSO | Matriz completa Directo/Parcial/No existe, con archivo y campo probado |
| 2 | OpenCode first-party/AITAP/CLIs externos | TAXONOMÍA CERRADA; CONTRATOS BLOQUEADOS POR 1 | Runtime y provider/model separados; Evidence versionada |
| 3 | Submit actual E2E | BLOQUEADO POR 2 | Secuencia con comandos, handlers, archivos y gaps confirmados |

## 6. Regla de continuidad entre sesiones

Toda sesión posterior debe comenzar aquí y en el pedido fuente. No debe usar el
chat temporal como evidencia. Cada avance agrega archivo/línea o evidencia de
ejecución a este documento. Solo al cerrar los tres puntos puede actualizarse
el estado provisional de los schemas y habilitarse EXC-001..EXC-010.
