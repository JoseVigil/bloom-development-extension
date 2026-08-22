Antes de tocar la batería EXC-001..EXC-010, necesito frenar y reconciliar tres cosas. No es diseño nuevo — es verificación de que lo ya diseñado está anclado al sistema real. Estos tres puntos bloquean cualquier ejecución posterior; no se resuelven en paralelo, van en este orden.

## 1. Reconciliación campo por campo contra el árbol real de intents

Fuente de verdad para esto: `C:\repos\bloom-development-extension\tree\bloom\bloom_project_tree.txt`. No un resumen tuyo del árbol — el archivo mismo, leído de nuevo para esta tarea específica.

Tomá cada uno de los cuatro contratos que definiste en `COGNITUUM_EXECUTION_LAYER_CONFORMANCE_v1_0.md` — Execution Package, Execution Event, Execution Result, Evidence — y mapeá cada campo contra su equivalente real en el árbol, para cada tipo de intent (`dev`, `ing`, `dis`, `doc`) por separado, porque no son estructuras idénticas entre sí.

Específicamente:

- **Execution Package** (objective, prior state, constraints, workspace ref, inputs, acceptance criteria, capabilities, policy ref, correlation IDs): ¿de qué archivos reales sale cada campo? Por ejemplo, para `dev`: ¿`objective` sale de `.briefing.json`, de `.dev_state.json`, o de ninguno de los dos existentes? ¿`prior state` es `.dev_state.json` completo o un subconjunto? Hacé esto campo por campo, no en bloque.
- **Execution Event**: ¿tiene equivalente hoy en `.pipeline/.{fase}/.response/.report.json`, o es un artefacto sin contraparte actual?
- **Execution Result** y **Evidence**: mismo ejercicio contra `.raw_output.txt`, `.report.json` y `.staging/`.

Para cada campo, una de tres respuestas, explícita y sin rellenar con inferencia razonable:

- **Existe equivalente directo** → nombrá el archivo/campo real.
- **Existe equivalente parcial** → explicá qué falta o qué sobra.
- **No existe equivalente** → decilo así, sin traducirlo a una inferencia editorial como hiciste antes con `.ai_bot.dis.intent.bl` en el árbol (que vos mismo marcaste como "sin mandato explícito en los specs, revisar si no corresponde" — ese nivel de honestidad es exactamente el que necesito acá, en todos los campos, no solo en ese).

Si un campo no existe hoy en el árbol real, no lo asumas como "falta implementarlo" — puede significar que el contrato está mal diseñado y hay que ajustarlo, no el árbol.

## 2. Rol exacto de OpenCode vs. AITAP vs. Codex CLI / Claude Code CLI

Esto no es un matiz — puede invalidar la simetría que asumió la batería EXC-001..EXC-010 tal como está diseñada hoy.

Necesito una respuesta binaria y justificada, no una reformulación conceptual: ¿OpenCode recibe el mismo tipo de input que recibirían Codex CLI y Claude Code CLI bajo Execution Layer — es decir, un objetivo crudo que razona de forma autónoma — o recibe algo categóricamente distinto: operaciones ya resueltas por un modelo de frontera vía AITAP (Contrato D con `execution_hint.tool` en `patch`/`write`/`bash`, como describe §3.3 del baseline BSIP), que solo aplica mecánicamente?

Si es lo segundo, decime explícitamente si eso significa que OpenCode no debería figurar como un tercer "Execution Provider" simétrico en la batería, sino como parte del canal de AITAP (arquitectura (a) que ya cerramos en la ronda anterior) — y qué cambia en el diseño de Execution Layer si se saca a OpenCode de esa lista.

## 3. Mecanismo real y actual de `submit`

No el mecanismo ideal, el que existe hoy. Necesito que documentes, paso a paso y contra el árbol real:

- Qué dispara el paso de `.pipeline/.{fase}/.payload.json` hacia Synapse — qué comando, qué componente, qué condición.
- Qué recibe Synapse y cómo vuelve el resultado a `.response/.raw_output.txt` y `.report.json`.
- Cómo se pasa de `.report.json` a `.staging/` y de ahí a la aplicación final.

Sin esto documentado tal cual existe, no hay forma de saber qué le falta al "submit equivalente" que necesitaríamos para que un CLI externo (Codex CLI, Claude Code CLI) reciba un intent — sería diseñar una pieza nueva sin saber qué reemplaza exactamente.

## Sobre resultados y visibilidad

Todo lo que produzcas en esta tarea — el mapeo campo por campo, la resolución del punto 2, la documentación del submit real — tiene que quedar compartido con el Work completo, no solo devuelto en esta conversación. Dejalo documentado en el lugar donde el Work ya consulta este tipo de decisiones (junto a `COGNITUUM_RESPONSIBILITY_BOUNDARIES.md` y `COGNITUUM_EXECUTION_LAYER_CONFORMANCE_v1_0.md`), con fecha y con referencia explícita a que esta reconciliación fue disparada por una inconsistencia detectada entre los contratos de Execution Layer y el árbol real de intents — no lo presentes como una corrección silenciosa de algo que ya estaba "cerrado".

No se corre ninguna batería, ni se instala ningún CLI adicional, hasta que estos tres puntos estén resueltos y confirmados.

---

## Estado de recepción y persistencia — 2026-08-20

El pedido fue recibido como gate bloqueante y quedó compartido con el Work en:

- `docs/GOVERNANCE/ARCHITECTURE/COGNITUUM_EXECUTION_RECONCILIATION_2026-08-20.md`
  — checkpoint durable, procedencia de la sesión temporal, observaciones CLI,
  evidencia inicial y estado secuencial de los tres puntos;
- `docs/GOVERNANCE/ARCHITECTURE/COGNITUUM_EXECUTION_LAYER_CONFORMANCE_v1_0.md`
  — estado degradado explícitamente a forma normativa provisional;
- `docs/GOVERNANCE/ARCHITECTURE/COGNITUUM_RESPONSIBILITY_BOUNDARIES.md` §10
  — gate enlazado desde la arquitectura normativa;
- `docs/GOVERNANCE/RESEARCH/COGNITUUM_ARCHITECTURE_FINDINGS_2026-08-17.md`
  — finding append-only `CAF-032`.

Estado al compartir: punto 1 `EN CURSO`; puntos 2 y 3 bloqueados en ese orden;
EXC-001..EXC-010 no ejecutada; OpenCode, Codex CLI y Claude Code CLI continúan
`NOT_RUN`. Este bloque registra recepción, no declara resuelta la
reconciliación.
