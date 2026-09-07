# Auditoría de acoplamiento "Genesis" en Mandate — Fase 1 (v2, con respuestas a bloqueos)

**Repo:** `bloom-development-extension` (local, `~/repos/bloom-development-extension`)
**Alcance:** solo lectura. Cero escrituras. Ningún archivo del repo fue modificado.
**v1:** 2026-09-06. **v2 (este documento):** mismo día, respondiendo 6 preguntas de seguimiento
del usuario — 2 de ellas bloqueantes para pasar a Fase 2. **No se propone plan de commits de Fase
2 en esta entrega** — el usuario pidió explícitamente resolver 1 y 2 primero y no avanzar hasta
entonces; esta entrega se limita a eso más 3, 4 y 6.

---

## 0. Corrección de método sobre v1 — esto hay que decirlo primero

Al responder la pregunta 4 del usuario encontré que mi propio criterio de poda de v1 tenía un
error real, no solo una limitación declarada: excluí **directorios enteros**
(`installer/conductor/setup`, `installer/conductor/workspace`, `installer/native`) asumiendo que
eran 100% vendoring por su tamaño total (1.1G y 1.9G respectivamente), sin verificar que **mezclan
binarios vendoreados con código fuente propio** en subcarpetas distintas.

Verificado ahora con `du` por subcarpeta:
- `installer/conductor/workspace/` sin `node_modules`: **1.7M** (no 455M) — el resto es un
  `node_modules` de Electron que sí correspondía excluir, pero yo excluí la carpeta padre entera.
  Dentro de ese 1.7M vive el código fuente real de Onboarding (Electron main + renderer).
- `installer/conductor/setup/` sin `node_modules`: **1.6M** (no 603M) — mismo patrón.
- `installer/native/`: `bin/` son **1.9G** de binarios reales (Node/Chrome/Temporal empaquetados,
  confirmado por `ls`: `chrome-linux.tar.xz`, carpetas `linux_x64/`), pero `config/`, `hooks/`,
  `batcave/`, `ionpump/` al lado son **24K–388K** de config/scripts propios.

Re-corrí el barrido de 1.1 con la poda corregida (excluir `node_modules` por nombre en cualquier
nivel, no directorios padre enteros). Resultado: **13 archivos de código fuente real que v1 no
vio**, todos en `installer/conductor/workspace/**` y uno en `installer/native/config/`. Ya están
incorporados en las respuestas de abajo y en el inventario. El resto de las exclusiones de v1
(`installer/native/bin`, `installer/temporal`, `installer/node`, `installer/chrome`,
`installer/resources`, `installer/opencode`, `installer/ollama`, `installer/vscode`,
`installer/antlr`, `brain/libs`) las verifiqué de nuevo con `ls`/`du` por subcarpeta y **sí son
100% binario vendoreado sin código propio mezclado** — esas exclusiones se mantienen.

Total de archivos con "genesis" ahora: **184** (era 171 en v1), sobre 1829 archivos escaneados
(era 1719).

---

## 1. Pregunta 1 (BLOQUEANTE) — ¿`mandate:genesis:*` y la señal se disparan también para `domain_expansion`?

**Confirmado con evidencia: sí, se disparan igual para ambos tipos. La infraestructura ya es
compartida — el nombre miente. Hay que renombrarla.**

`MandateGenesisBuildWorkflow` es el único workflow que arranca `startGenesisWorkflow` en
`mandate_watcher.go`, y ese dispatch está gateado (línea 339, 383-384) por:
```go
if ms.MandateType != "genesis" && ms.MandateType != "domain_expansion" { return }
...
case ms.Status == "building" && ms.CurrentPhase == "ingest" && ms.Phases.Ingest.Status == "pending":
    w.startGenesisWorkflow(ctx, ms)
```
— es decir, **el mismo `case` arranca el mismo workflow sin importar cuál de los dos tipos sea**
`ms.MandateType`. `startGenesisWorkflow` arma `GenesisBuildInput{..., MandateType: ms.MandateType, ...}`
(línea 585) y se lo pasa tal cual a `MandateGenesisBuildWorkflow`.

Leí `mandate_genesis_build_workflow.go` completo (455 líneas). **Ni una sola vez** el cuerpo del
workflow bifurca sobre `input.MandateType` para decidir qué señal esperar o qué evento publicar.
Los 6 puntos donde dispara algo con "genesis" en el nombre son incondicionales:
- `workflow.GetSignalChannel(ctx, "mandate:genesis:validate")` — línea 222, corre siempre.
- `"mandate:genesis:rejected"` — línea 228, si `!signal.Approved`, sin mirar `MandateType`.
- `"mandate:genesis:error"` — línea 302, en cualquier falla de firma.
- `"mandate:genesis:signed"` — línea 412, tras firmar con éxito.
- `"mandate:genesis:all_complete"` — línea 450, al terminar, siempre.

La única rama que sí distingue por tipo es `IngestReceptionActivity` (`domainBaseline: "empty"` vs
`"existing"`, ya citado en v1) — pero eso pasa **antes** de que se disparen los eventos/señal, y no
afecta cuáles se disparan, solo qué hace la Fase 1 puertas adentro.

**Conclusión accionable:** los 5 identificadores `mandate:genesis:*` (señal + 4 eventos) sirven
hoy a `genesis` y a `domain_expansion` por igual. Esto **cambia el alcance**, tal como preveía el
usuario: no es opcional dejarlos así — si se generaliza `MandateType`, estos nombres quedan
renombrables (con ventana de compatibilidad, ver Categoría C/D de v1, sin cambios ahí).

---

## 2. Pregunta 2 (BLOQUEANTE) — `baseGenesisId`: ¿ligado a genesis específicamente, o genérico?

**Confirmado con evidencia: está ligado a "genesis" específicamente, por decisión de diseño
explícita y documentada (D-7). NO debe renombrarse a `baseMandateId` ni nada genérico. Se retira
de la lista de renames.**

La evidencia más directa, que en v1 cité pero no leí completa, es el propio comentario de cabecera
de `src/api/hooks/assert-base-genesis-completed.hook.ts` (líneas 17-26):

> `2. Su mandateType debe ser 'genesis' — explícitamente NO se acepta encadenar sobre otro
> domain_expansion (ver D-7 en §8: esto es una decisión tomada, no un descuido; hoy el modelo de
> dominios es una lista plana anclada a un único genesis raíz, no un árbol).`

Y el código lo aplica literalmente (líneas 65-71):
```ts
if (base.mandateType !== 'genesis') {
  return reply.code(422).send({
    error: 'BASE_GENESIS_WRONG_TYPE',
    detail: `${baseId} es mandateType='${base.mandateType}', se requiere 'genesis'`,
    // ver D-7 en §8 — decisión explícita, no descuido
  });
}
```

Esto está reforzado por dos fuentes independientes que ya tenía de v1 y una nueva:
- `prompts/copilot_contracts/.copilot.genesis.bl`: "GENESIS es un evento cognitivo singular que
  ocurre exactamente una vez por Nucleus" — solo puede haber un genesis-ancla por Nucleus.
- `installer/nucleus/internal/orchestration/activities/mandate_genesis_activities.go:321-325`:
  domain_baseline mapea 1:1 desde MandateType, "genesis" -> "empty", "domain_expansion" ->
  "existing" (incorpora sobre un **baseGenesisId ya existente**) — nunca sobre otro
  `domain_expansion`.
- **Nueva, de la corrección de método (§0):** `installer/conductor/shared/onboarding-schema.js`
  persiste `onboarding.genesis_mandate_id` en `nucleus.json` como **el único** mandate genesis de
  la organización (líneas 8, 28, 93, 109, 212, 230, 252) — mismo patrón de singularidad.

**Tenías razón en la corrección que me pediste**: `baseGenesisId`/`baseGenesis` (Go struct field,
JSON persistido, campo TS, flag CLI `--base-genesis-id`) significa "el Mandate Genesis raíz que
ancla este domain_expansion", no "el mandate base de cualquier tipo". Sacar de §7 de v1 la entrada
de Categoría B que lo incluía — corregido en §5 de este documento.

---

## 3. Pregunta 3 — `mandate_state.json` real, ¿instancias materializadas?

Encontré **cero** instancias de `mandate_state.json` o `mandate.json` en todo el repo (ni siquiera
fixtures de test con ese nombre exacto — los tests usan directorios temporales en runtime, no
archivos versionados). Sí existe un único árbol `.bloom/` real en el repo:
`installer/nucleus/scripts/simulation_env/.bloom/.nucleus-bloom-labs/` — lo inspeccioné
(`find` hasta profundidad 6) y **no contiene ningún directorio `.mandates/`** ni archivo
`mandate_state.json`/`mandate.json`; solo `.core/`, `.governance/` con contratos `.bl` y un
`nucleus-config.json`.

**No puedo confirmar ni descartar mandates reales fuera de este repo.** El `MandatesRoot` real de
una instancia en desarrollo/producción vive en `<workspace>/.bloom/.nucleus-{org}/.mandates`
(según comentarios de código), que es una carpeta de **trabajo del usuario**, no versionada en
este repo — y esta sesión solo tiene acceso al checkout del repo, no a otras carpetas del
dispositivo. Si querés que lo confirme, necesito que me indiques el path del `MandatesRoot` activo
(o me des acceso a esa carpeta) para poder decirte con evidencia si hay `mandateType: "genesis"`
ya persistido en disco.

**Con lo que sí tengo:** no hay evidencia de datos reales ya escritos en este repo. Si el
`MandatesRoot` activo de tu entorno de desarrollo está vacío o no existe todavía, el rename del
campo `mandateType`/`baseGenesisId` en `mandate_state.json` no necesita migración de datos — solo
falta que confirmes eso del lado tuyo.

---

## 4. Pregunta 4 — CLI `nucleus mandate genesis` / `--base-genesis-id`: ¿documentado o scripteado como interfaz pública?

**`--base-genesis-id` (el flag):** cero apariciones fuera del propio código fuente Go y su
contraparte de tipos TS ya inventariados en v1. No aparece en ningún README, doc, script `.sh`,
config CI, ni en el código nuevo encontrado en `installer/conductor/**`. **Baja prioridad
confirmada — rename directo, sin ventana de compatibilidad para el flag CLI en sí** (el campo
persistido `baseGenesisId`/`baseGenesis` es aparte — ver §2, no se toca).

**`nucleus mandate genesis` (el subcomando):** acá la respuesta es más matizada que "sí" o "no", y
es exactamente el tipo de cosa que la corrección de método de §0 sacó a la luz:

1. **Sí existe una invocación literal en código de producto**, no solo en docs:
   `installer/conductor/workspace/onboarding/ipc/onboarding-handlers.js:681`:
   ```js
   const result = await execNucleus([
     '--json', 'mandate', 'genesis',
     '--project', project,
     '--project-id', projectId,
     '--source', projectPath
   ], 15000, { cwd: workspacePath });
   ```
   Este es el handler IPC `onboarding:create-mandate` (registrado línea 654, expuesto en
   `preload_onboarding.js:42` como `window.onboarding.createMandate`).

2. **Pero esa invocación está huérfana en el flujo actual — nadie la llama.** Tres fuentes
   independientes, todas dentro del propio repo, lo confirman:
   - `installer/conductor/workspace/onboarding/renderer/steps/step-mandate.js:6-14` (comentario de
     cabecera): *"este step deja de disparar la creación real del Genesis Mandate. Ya no llama a
     `window.onboarding.createMandate(...)`"* — y en efecto, leí el archivo completo (133 líneas):
     el único IPC que dispara es `onboarding:mark-step-complete`, nunca `onboarding:create-mandate`.
   - `installer/native/config/onboarding/onboarding_steps.json` (`_changelog`, v3.1.0,
     2026-08-11, D-22): *"'mandate_genesis' deja de crear el mandate real (eso pasa a Core)... y
     pasa a ser pantalla puramente explicativa. produces/verifyArgs.field cambian de
     'genesis_mandate_id' a 'mandate_screen_acknowledged'"*.
   - `webview/app/src/lib/bootstrap/genesisLaunch.ts:11-22` (comentario de cabecera, "Camino 1 vs
     Camino 2"): la creación real del mandate "pasó de Camino 1 (IPC → CLI Go,
     `window.onboarding.createMandate`) a Camino 2 (Fastify → Node, `POST /api/v1/mandates`)" —
     con el motivo explícito: Camino 1 no emitía `publishMandateEvent` bajo `nucleus dev-start`
     (mandate_watcher.go confirmado sin arrancar ahí, TD-001).

   El camino que **sí** está vivo hoy es `genesisLaunch.ts` → `createMandateApi(...)` → `POST
   /api/v1/mandates` (`create-mandate.handler.ts`, ya inventariado en v1 como Categoría B/C) — no
   pasa por la CLI en absoluto.

3. No encontré ningún README, script `.sh`, ni config de CI (no hay `.github/` en el repo) que
   invoque `nucleus mandate genesis` como interfaz documentada para humanos o pipelines. Las
   ~15 apariciones en `docs/**` (ver v1 §4 y la lista extendida que salió al grepear para esta
   pregunta) son **todas** notas de diseño/handoff describiendo el comando, nunca instrucciones de
   uso externo tipo "correr esto en tu terminal".

**Conclusión accionable:** bajo la prioridad de "ventana de compatibilidad obligatoria" a "rename
directo" para el subcomando CLI también — con una salvedad: el código huérfano de
`onboarding-handlers.js:654-741` sigue físicamente ahí y sigue siendo Categoría B (símbolo/string
con un caller, aunque ese caller ya no se ejecute en el flujo actual). Recomendación para Fase 2:
renombrar el subcomando y, en el mismo commit, actualizar ese IPC handler huérfano para que compile
con el nuevo nombre, o borrarlo si el usuario confirma que es código muerto. No lo doy por "código
muerto" sin esa confirmación explícita — sigue siendo técnicamente alcanzable si algo externo
invoca ese canal IPC directamente (`ipcRenderer.invoke('onboarding:create-mandate', ...)` desde
algún lugar que esta auditoría no haya cubierto), y no puedo descartar eso al 100% sin ver el
bundle final empaquetado de Electron, que está fuera del alcance de una auditoría de código fuente.

---

## 5. Pregunta 5 — `.copilot.genesis.bl`

Anotado, no tocado. No se incluye en ningún plan de Fase 2. Queda para tu decisión de producto,
como pediste.

---

## 6. Pregunta 6 — Líneas exactas, verificadas contra el archivo real en disco (no la copia en caché de esta sesión)

Confirmado con `sed -n` directo sobre `~/mnt/bloom-development-extension` (no la copia stageada):

- `installer/nucleus/internal/orchestration/temporal/worker.go:431`
  ```go
  mandateWorker.RegisterWorkflow(temporalworkflows.MandateGenesisBuildWorkflow)
  ```
- `installer/nucleus/internal/orchestration/temporal/temporal_client.go:429`
  ```go
  workflowID := fmt.Sprintf("mandate_genesis_%s", mandateID)
  ```
  (dentro de `StartMandateGenesisBuildWorkflow`, que arranca en la línea 424)
- `installer/nucleus/internal/orchestration/temporal/temporal_client.go:565`
  ```go
  fmt.Sprintf("mandate_genesis_%s", mandateID),
  ```
  (dentro del loop de reconciliación que también arma `mandate_execution_%s` en la línea 566)

Las tres coinciden exactamente con lo citado en v1 — no había drift, pero ahora está verificado
contra el archivo real, no inferido.

---

## 7. Correcciones al inventario de v1 (consolidado)

- **Retirado de la lista de renames:** `baseGenesisId` / `baseGenesis` / `--base-genesis-id` en
  todas sus formas (Go struct field, JSON persistido, campo TS, flag CLI). Ver §2 — está bien
  llamado así, es una decisión de diseño (D-7), no un descuido de nomenclatura.
- **Confirmado, ya no condicional:** los 5 identificadores `mandate:genesis:*` (4 eventos + 1
  señal) sí necesitan renombrarse si se generaliza `MandateType` — sirven a `domain_expansion` hoy
  mismo, sin excepción. Ver §1.
- **Bajada de prioridad:** el subcomando CLI `nucleus mandate genesis` y sus flags (excepto
  `--base-genesis-id`, ya retirado) — de "ventana de compatibilidad obligatoria" a "rename
  directo", con la salvedad del handler IPC huérfano en `onboarding-handlers.js` que igual hay que
  tocar para que compile. Ver §4.
- **Archivos nuevos incorporados al inventario** (categoría B, por la corrección de método de §0):
  `installer/conductor/workspace/onboarding/ipc/onboarding-handlers.js`,
  `installer/conductor/workspace/onboarding/renderer/steps/step-mandate.js`,
  `installer/conductor/workspace/onboarding/renderer/steps/step-project.js`,
  `installer/conductor/workspace/onboarding/onboarding.html`,
  `installer/conductor/workspace/onboarding/milestone-registry.js`,
  `installer/conductor/workspace/onboarding/milestone-reactor.js`,
  `installer/conductor/workspace/onboarding/resolution-engine.js`,
  `installer/conductor/workspace/onboarding/renderer/core/navigation.js`,
  `installer/conductor/workspace/onboarding/renderer/steps/step-identity.js`,
  `installer/conductor/workspace/onboarding/renderer/steps/step-milestone.js`,
  `installer/conductor/workspace/core/preload_core.js`,
  `installer/conductor/workspace/main_conductor.js`,
  `installer/native/config/onboarding/onboarding_steps.json` (este último con el literal
  `"id": "mandate_genesis"` como identificador de step de onboarding — persistido en
  `nucleus.json.onboarding.completed_steps[]`, propagado también a
  `installer/conductor/shared/onboarding-schema.js`).

No se propone todavía cuáles de estos son A/B/C exactos uno por uno — eso corresponde al
entregable de Fase 2 (plan de commits), que el usuario pidió explícitamente no recibir todavía en
este turno.

---

## 8. Qué sigue (obsoleto — ver §9, quedaban dos puntos abiertos que v2 no había cerrado)

---

## 9. v3 — cierre de los 3 puntos pendientes de v2

### 9.1 Pregunta 1 completada — los 4 eventos "frontend" que faltaban

Volví a leer `genesisLaunch.ts` completo (113 líneas, ya lo había leído entero en v2 pero no lo
dije con la explicitud que correspondía). Corrección importante sobre cómo lo presenté antes:
**`genesisLaunch.ts` no publica ningún evento `mandate:genesis:*` — solo llama a
`createMandateApi(...)` (POST a `/api/v1/mandates`)**. Atribuirle los 4 eventos "frontend" en v1/v2
fue impreciso de mi parte: confundí "dónde se consume/menciona el evento" con "dónde se publica".
Corrijo acá con la evidencia real, buscada de nuevo en **los 1829 archivos completos**, no solo en
los que ya tenía abiertos:

```
grep -n "publishMandateEvent(\"" (todos los .go)  → 3 resultados, ninguno "mandate:genesis:*"
grep -n 'PublishMandateEventActivity' -A1 (todos los .go) → 4 resultados, ya conocidos (rejected/error/signed/all_complete)
grep -n "publishMandateEvent('" (todos los .ts/.js) → 2 resultados: mandate:draft:created, mandate:genesis:initiated
```

Resultado, evento por evento:

- **`mandate:genesis:initiated`** — SÍ tiene productor real:
  `src/api/handlers/create-mandate.handler.ts:168`, dentro del bloque que el propio código etiqueta
  `// --- RAMA GENESIS / DOMAIN_EXPANSION ---` (línea 102) — la única otra rama del handler es
  `mandateType === 'standard'` (línea 78), que publica un evento distinto
  (`mandate:draft:created`). Confirmado: **se dispara igual para `genesis` y `domain_expansion`**,
  mismo patrón que los 4 eventos del backend Go ya verificados en v2. Sumado a la lista de
  "renombrables, contrato de runtime compartido".

- **`mandate:genesis:ingest_progress`, `mandate:genesis:ingest_complete`,
  `mandate:genesis:domains_proposed`** — **no encontré ningún lugar del código, en los 1829
  archivos escaneados (Go, TS, JS), que los publique.** Existen únicamente como: (a) entradas de
  tipo en `src/types/ws-events.ts` (contrato declarado, líneas 98-122 y 260-262), y (b) `case`
  muertos en el switch de `webview/app/src/lib/stores/mandateStore.ts` (líneas 217-225) esperando
  un evento que nunca llega. Encontré una única mención en docs
  (`docs/MANDATE/Mandate_Genesis_Completion_Plan_v1.md:126`) que afirma que `domains_proposed` "ya
  está cableado del lado de Core" — **esa afirmación de un doc de sesión anterior contradice lo que
  encuentro en el código actual**, y sigo el criterio de evidencia sobre inferencia: reporto el
  contraste, no resuelvo a favor de ninguno de los dos sin que corras el sistema real.

  **No puedo confirmar "se disparan igual para ambos MandateType" para estos 3, porque no se
  disparan en absoluto en el código que audité.** No los sumo a "renombrables, contrato de runtime
  vivo" — los separo en una categoría propia: **contrato declarado pero no implementado**. Para
  Fase 2 esto en realidad simplifica su rename (no hay ejecución en curso que romper, cero ventana
  de compatibilidad necesaria), pero sí hay que decidir si Fase 2 los renombra igual (por
  consistencia con los otros 5) o los deja como deuda técnica aparte — señalado, no soy yo quien
  decide eso.

**Lista corregida de eventos/señal `mandate:genesis:*` con contrato de runtime real y confirmado
compartido entre `genesis` y `domain_expansion`:** `initiated` (TS), `rejected`, `error`, `signed`,
`all_complete` (los 4 de Go) — **5 en total**, más la señal `mandate:genesis:validate`. Los otros 3
(`ingest_progress`, `ingest_complete`, `domains_proposed`) quedan aparte, sin evidencia de uso real.

### 9.2 Evidencia de poda pendiente — los 5 directorios, mostrada

Repetí la verificación de `installer/opencode`, `installer/vscode`, `installer/antlr`,
`installer/resources`, `installer/ollama` al mismo nivel que `conductor/`/`native/`: tamaño por
subcarpeta, listado interno de esas subcarpetas, y un grep de contenido de "genesis" sobre el
árbol completo (no solo por nombre de archivo).

**Un nivel adentro de cada uno:**
```
temporal/linux/     → un solo binario ejecutable "temporal" (211.173.560 bytes), nada más
node/linux_x64/     → "linux-x64.tar.xz" (31MB) + binario ejecutable "node" (124.819.136 bytes)
chrome/             → un solo archivo "chrome-linux.tar.xz" (141.364.096 bytes), sin extraer
resources/runtime-linux/ → bin/, include/, lib/, share/ — layout estándar de un runtime de Python compilado
resources/runtime/  → LICENSE.txt + decenas de .pyd (extensiones binarias de Python para Windows)
opencode/linux_x64/ → un solo binario ejecutable "opencode" (43.507.896 bytes)
ollama/linux/       → un solo binario ejecutable "ollama" (38.086.544 bytes)
vscode/             → un solo archivo "bloom-extension.vsix" (12.288.302 bytes)
antlr/              → un solo archivo "antlr-4.13.2-complete.jar" (2.140.045 bytes)
```

**Grep de contenido (no de nombre de archivo) de "genesis" sobre cada árbol completo:**
```
$ cd installer && for d in temporal node chrome resources opencode ollama vscode antlr; do
    grep -rlI 'genesis' "$d" 2>/dev/null
  done
```
**Resultado: cero coincidencias en los 8 directorios.** (`-I` excluye binarios pero sí recorre
texto plano dentro de ellos — `LICENSE.txt`, y cualquier header/manifiesto legible dentro de los
`.pyd`/binarios, quedaron cubiertos y no matchean.)

Esto es evidencia más fuerte que la que le di a `conductor/`/`native/` en v2 (ahí encontré
contenido real; acá, con el mismo método aplicado, no encontré nada) — confirma que la poda
original de v1 para estos 5 directorios específicos era correcta.

### 9.3 Punto 3 — anotado, esperando tu confirmación

No avanzo a Fase 2. Quedo esperando que confirmes el `MandatesRoot` real (o que el entorno es
pre-producción) y qué hacer con el handler IPC huérfano de `onboarding-handlers.js`.

---

## 10. Qué sigue

Con 1 (ahora completa para los 8 eventos) y 2 resueltas, y 3/4/6 respondidas con evidencia, más la
poda de §9.2 verificada al mismo nivel de detalle en todo el árbol excluido: sigo esperando tu
confirmación del punto 3 antes de armar el plan de commits de Fase 2. No propongo nombres nuevos ni
plan de commits en este documento.
