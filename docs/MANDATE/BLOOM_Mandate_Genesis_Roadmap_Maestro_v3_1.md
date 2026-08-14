# BLOOM Mandate Genesis — Roadmap Maestro (documento único de orientación)
**v3.1 — Pivot v1.4 (Unificación de Motor y UI), sobre la base de v3 (`ing/` + `dis/`, alineado con `ING_Intent_Spec_v1_1.md` y `DIS_Intent_Spec_v1_0.md`)**

**Propósito:** este es el único documento que junta todo lo que se decidió y construyó en esta sesión — Backend (Go/Nucleus), Frontend (Electron + Svelte webview), y las Capas del Bootstrap Strategy. Cuando te sientas perdido, empezá acá, no en el historial de chat.

**Qué es v3.1 y por qué existe:** es un pivot de arquitectura sobre v3, tomado *antes* de implementar el trabajo de UI y backend que v3 dejaba pendiente — no una corrección de un error puntual, sino una decisión temprana para no construir dos veces sobre un diseño que ya se veía insuficiente. Toca tres cosas a la vez, y las tres están conectadas: (1) dónde se dispara la creación real del Mandate Genesis, (2) si Genesis necesita o no su propio motor de ejecución, y (3) si Genesis necesita o no su propia UI. Ver §0.1 para el detalle de cada punto y por qué se decidieron juntas en vez de por separado.

**Regla de esta sesión (heredada, sigue vigente):** todo lo que se marca "✅ Confirmado" fue verificado contra un archivo real, no contra un resumen. Todo lo que dice "🔄 En curso" o "⬜ Sin empezar" es honesto sobre su estado — no hay nada "medio hecho" escondido.

**Regla nueva de v2, sigue vigente en v3:** "✅ Confirmado" se subdivide en dos niveles porque hay dos fuentes distintas de verdad:
- **✅ Confirmado (código real — GAP V3):** verificado línea por línea contra `mandate_genesis_activities.go`, `mandate_genesis_build_workflow.go`, `mandate_watcher.go`, `ws-events.ts`.
- **✅ Confirmado (spec previa, sin cross-check de código en esta ronda):** lo que ya estaba marcado ✅ en v1 pero el GAP V3 no lo tocó — sigue siendo válido, pero no fue re-verificado ahora.
- **🎯 Redefinido (objetivo, no implementado):** partes de este documento que antes describían *estado actual* y ahora describen el *diseño objetivo* de `ing/` y, desde v3, también de `dis/`. El código real de hoy **todavía no hace esto** — se marca así para no confundir "lo que queremos que haga Fase 1/2, o lo que debería disparar `dis/`" con "lo que el workflow hace hoy".

**Regla nueva de esta migración (v3):** la capa de Intents BISP que corre por debajo del ciclo de vida de un Genesis Mandate (Fases 1-4, Go/Temporal, ver §9) ya no es un único motor — se formalizó e independizó en **dos** intents complementarios, cada uno con su propia spec:
- **`ing/` (Intent de Ingesta, `ING_Intent_Spec_v1_1.md`):** procesa lotes locales e incrementales de material raw — `.reception/ → .classification/ → .consolidation/` — y **propone** dominios locales vía `.domain_resolution.json`, sin alterar el mapa global BISP directamente hasta que un turno de `.consolidation/` cierra `committed: true`. Es el motor que las Fases 1 y 2 del workflow invocan (ver §2 y §9). Nunca reestructura Dominios ya existentes — no fusiona, no divide, no renombra, no agrega una segunda arista a un Gene que ya tenía Dominio.
- **`dis/` (Intent de Discovery, `DIS_Intent_Spec_v1_0.md`):** corre **después** de una o más corridas de `ing/`, a demanda o periódicamente, con la vista completa y retrospectiva del grafo — `.discovery/ → .mapping/ → .ratification/`. No asimila material crudo, no crea Genes; su única salida es un grafo de Dominios corregido: fusiones, splits, renombres y detección de Genes cross-domain. Es el intent que asume la propiedad de la topología de Dominios a partir de `ING_Intent_Spec_v1_1.md`.

En una frase: **`ing/` sube información al sistema y propone localmente; `dis/` reordena el sistema completo mirando todo lo que ya subió `ing/`.** Ninguno de los dos reemplaza al otro ni compiten por el mismo dato — `ing/` nunca hace lo que hace `dis/`, y `dis/` nunca hace lo que hace `ing/` (ver §9 para el mapeo formal Fase↔Intent y el disparador de `dis/`).

**Regla nueva de v3.1 (Pivot v1.4 — Unificación de Motor y UI), reemplaza el marco de v3 donde corresponda:**

1. **Desacoplamiento de Onboarding:** la creación del Mandate Genesis deja de ocurrir dentro del wizard de Onboarding y pasa a ser responsabilidad directa de Core — al abrirse por primera vez tras el onboarding, o a demanda en cualquier momento posterior. El step `mandate_genesis` de Onboarding pasa a ser una pantalla puramente explicativa: comunica qué va a pasar, no dispara nada. Ver §1 y §1.2 (nuevo).
2. **Unificación de Motor Backend:** se elimina el tipo custom `Mandate Genesis` / `MandateGenesisBuildWorkflow`. Genesis pasa a ser un Mandate estándar ejecutado sobre un `domain_baseline: "empty"`. Las Fases 1-4 dejan de describir un workflow de Temporal dedicado a Genesis y pasan a ser la ejecución combinada de los Intents genéricos (`ing/` y `dis/`) sobre un Mandate como cualquier otro — sin Workflow propio, sin Activities propias, sin canal de Signal "brandeado". Ver §2 (reencuadrada como base histórica) y §2.1 (nuevo, diseño vigente).
3. **Unificación de UI:** desaparece la necesidad de construir un `GenesisTab` aislado (Paso 4 de la migración de UI) — se unifica en un único `MandateTab` genérico, impulsado por estado (`MandateType`, `domain_baseline`, fase/turno actual), no por un componente Svelte separado con ciclo de vida propio. Ver §4.

Esto no descarta lo confirmado por código en v3 (GAP V3 sigue siendo la foto real del código a esa fecha) — lo que cambia es el diseño objetivo hacia el que se está construyendo. Donde v3 decía "Genesis tiene su propio Workflow, hay que redefinir sus Fases", v3.1 dice "no hace falta un Workflow de Genesis en absoluto: un Mandate genérico con Actions que resuelven en `ing/`/`dis/` ya cubre el caso". Cada sección de abajo marca explícitamente si describe el estado real de hoy (histórico), el diseño de v3 (superado por este pivot) o el diseño de v3.1 (vigente).

---

## 0. Glosario — para no volver a confundir esto

Tres numeraciones conviven en esta sesión y **no son la misma cosa**:

| Término | Qué es | Ejemplos |
|---|---|---|
| **Fases** (1-4) | El ciclo de vida técnico de UN Genesis Mandate ya creado: `ingest → cluster → validate → scaffold` | Fase 3 = pantalla de confirmar dominios |
| **Capas** (0-3) | La estrategia del *Bootstrap Strategy* para que la Fase 2 (cluster) tenga datos reales en vez de un placeholder | Capa 0 = subir documentación |
| **Pasos** (1-5) | La migración de UI de Core de HTML/vanilla-JS a Svelte real | Paso 1 = Sidebar fusionado |

Estos tres ejes son ortogonales entre sí — un Mandate puede estar en Fase 3, mientras Capa 1 todavía no existe, mientras la UI sigue en Paso 2 de la migración. No se bloquean mutuamente salvo donde se indica explícitamente abajo.

**Nota v3.1:** "Fases (1-4)" sigue siendo un eje válido para describir el ciclo de vida de un Genesis Mandate — pero bajo el pivot de esta versión deja de ser sinónimo de "los 4 pasos hardcodeados de un `MandateGenesisBuildWorkflow` dedicado" (ver §2.1). Pasa a describir el mismo ciclo lógico (ingest → cluster → validate → scaffold) ejecutado por el motor genérico de Mandate, sin Workflow propio de Genesis. El eje no desaparece, cambia lo que hay por debajo.

**Un cuarto eje, nuevo en v3, no ortogonal a "Fases" sino anidado dentro de él:** las Fases 1-4 son la orquestación *externa* (Temporal/Go). Por debajo, dos Intents BISP hacen el trabajo real:

| Intent | Nivel | Alcance | Cuándo corre |
|---|---|---|---|
| **`ing`** | Interno a un Mandate, invocado por Fase 1 y Fase 2 | Local — el lote de material que acaba de entrar, comparado contra dominios ya existentes | Cada vez que el workflow de un Genesis Mandate pasa por Fase 1/2, y en cualquier incorporación posterior de subsistema/repo/módulo (no exclusivo de Génesis) |
| **`dis`** | Nucleus-wide, no atado a un Mandate en particular | Global — todo el grafo de Dominios/Genes ya consolidados, retrospectivo | Bajo demanda o tras acumulación de cambios incrementales de una o más corridas de `ing` (ver §9) |

No confundir "Fase 2 del workflow" con "`dis/`": Fase 2 dispara `.classification/` de `ing/`, que propone una asignación **local** de dominio para el lote entrante. `dis/` es una corrida aparte, no forma parte del ciclo Fase 1-4 de un Mandate — puede correr sin que haya ningún Mandate en Fase 1-4 activo en ese momento.

---

## 0.1 El pivot de v3.1, explicado — por qué las tres cosas van juntas

**Esto es una decisión de arquitectura recién tomada, todavía no implementada.** El trabajo que sigue, en los dos frentes, es de investigación y diseño (confirmar mecanismos reales de paso de parámetros entre ventanas, redefinir el contrato del step de Onboarding, confirmar si la frontera `GenesisTab`/`StandardMandateTab` sigue siendo necesaria) antes de tocar código. Nada de lo marcado "✅ Confirmado (código real — GAP V3)" en el resto de este documento deja de ser cierto — sigue siendo la foto exacta del código a esa fecha. Lo que cambia es hacia dónde apunta el trabajo que sigue.

### CAMBIO UI — dónde se dispara la creación del mandate

**Qué había hasta ahora:** el step `mandate_genesis` del Onboarding (el último de los 7 steps, en Electron) disparaba la creación real del mandate — IPC síncrono que invoca `nucleus mandate genesis`, escribe `mandate_state.json`, y ese mismo evento cierra la ventana de Onboarding y abre Core. La creación quedaba atada al proceso de instalación inicial: pasaba una sola vez, dentro de un wizard lineal, sin posibilidad de reintentar ni depurar por separado.

**Qué se decide cambiar, y por qué:** sacar la creación real del mandate del Onboarding. El Onboarding pasa a mostrar el step `mandate_genesis` solo como pantalla explicativa — comunica qué va a pasar, pero no dispara nada — y la creación efectiva ocurre recién cuando abre Core: automáticamente al finalizar el Onboarding (con un parámetro que le indica a Core "arrancá Genesis para este proyecto"), o más adelante, desde una funcionalidad propia de Core equivalente a "crear mandate → elegir Genesis", disponible en cualquier momento, no solo en la instalación inicial. Motivos, en orden de peso:

1. **El proceso hoy está partido entre tres capas** (Electron → Nucleus Go → Temporal) disparado por un solo click de un wizard — frágil por diseño, con evidencia directa de esa fragilidad (un mandate real que quedó huérfano por una falla de infraestructura no relacionada al Onboarding en sí).
2. **Hoy no se puede debuguear ni iterar sobre la creación del mandate sin correr el Onboarding completo** — cada ajuste al flujo de Genesis obliga a repetir 7 steps para llegar al punto que interesa.
3. **División de responsabilidades:** crear un mandate es trabajo de Core (y eventualmente del plugin de VS Code), no del Onboarding — el Onboarding debería limitarse a dejar el entorno listo, no a orquestar trabajo de negocio.
4. **Hoy no hay forma de "agregar un proyecto nuevo" desde Core sin pasar, conceptualmente, por un flujo de instalación** — si un usuario quiere anexar otro proyecto a una organización ya existente, crear un mandate necesita ser una acción disponible en cualquier momento desde Core, no algo amarrado al primer arranque.
5. **Genesis tiene turnos, y el proceso necesita poder repetirse:** partes del flujo (confirmar/renombrar dominios) requieren que el humano pueda volver e iterar sobre una propuesta ya hecha. Eso no funciona bien dentro de un wizard de una sola pasada que ya cerró la ventana — necesita vivir en una UI persistente, que es Core.

**Qué queda pendiente de investigación (no de diseño):** confirmar el mecanismo real por el que hoy se abre la ventana de Core (apertura de ventana nueva + cierre de la vieja) para ver qué forma de pasaje de parámetros ya está disponible — IPC, argumentos de proceso, variable de entorno — y usar eso para transportar "arrancá Genesis para este proyecto" sin inventar un canal nuevo si no hace falta. Ver §1.2.

### CAMBIO BACKEND — por qué Genesis deja de ser un tipo custom

**Qué existía hasta ahora:** Genesis era un tipo de Mandate con tratamiento especial de punta a punta — su propio Workflow en Go (`mandate_genesis_build_workflow.go`), sus propias Activities (`mandate_genesis_activities.go`), su propio canal de Signal "brandeado" (`mandate:genesis:validate`, `mandate:genesis:rejected`, `mandate:genesis:all_complete`), y una función de firma (`SignMandateActivity`) que hardcodeaba el string `"genesis"` sin mirar el `MandateType` real. Aunque el dato (`MandateType: "genesis" | "domain_expansion"`) ya era genérico en el modelo, el *código* seguía bifurcando: un camino "Genesis", y todo lo demás tratado como caso secundario mal integrado.

**Por qué era un error, no solo un detalle de naming:** es el mismo error que ya se identificó y corrigió una vez a nivel Intent con `gen/` — un tipo especial con su propia lógica forzada, por fuera de la gramática uniforme del resto del sistema. Ahí se resolvió reemplazando `gen/` por `ing/`, un Intent estándar más (ver v1→v2 de esta migración). El mismo error se había reproducido un nivel más arriba: un Mandate especial con Workflow dedicado, en vez de un Mandate genérico compuesto por Actions que se resuelven en Intents estándar — que es literalmente lo que la jerarquía de 4 niveles del ecosistema (Nucleus → Mandate → Action → Intent) ya establecía desde el principio: el Mandate no le habla directamente a los intents, le habla a sus Actions, y cada Action se resuelve como un intent concreto — sin excepción para Genesis.

**La corrección:** en vez de generalizar el Workflow específico de Genesis para que también sirva a `domain_expansion` (el camino que se venía explorando al auditar si esos archivos podían renombrarse), la corrección es que **no exista un Workflow dedicado por tipo de Mandate en absoluto**. Un Mandate — cualquiera — descompone su trabajo en Actions, y cada Action se resuelve como uno de los Intents estándar del sistema: `ing/` para ingesta y clasificación de dominios, `dis/` para reconciliación cross-Mandate cuando hace falta fusionar o dividir dominios que dos corridas separadas crearon por error, y los ya conocidos `dev/`, `doc/`, `exp/`, `inf/`, `cor/` para todo lo demás. "Genesis" deja de ser una bifurcación de código: pasa a ser la descripción de negocio de un Mandate cuya primera Action se resuelve en un `ing/` con `domain_baseline: "empty"` — porque es la primera vez que se ingiere algo para ese proyecto. Un Mandate `domain_expansion` corre exactamente el mismo motor genérico, solo que su `ing/` arranca con `domain_baseline: "existing"`. No hay dos caminos: hay un motor y un parámetro de entrada distinto.

**Qué gana el sistema, concretamente:**
- Elimina de raíz los bugs ya encontrados por tener dos caminos desincronizados — el hardcode de `"genesis"` en la firma, y `BaseGenesisID` ignorado en todo el Workflow porque nadie lo conectó nunca a la lógica real (ver D-14, §6).
- Un Mandate se puede crear, correr y reintentar N veces con el mismo mecanismo sin importar qué tipo de negocio representa — el mismo beneficio ya ganado al pasar de `gen/` a `ing/`, ahora un nivel más arriba.
- **Impacto directo en UI:** la distinción `GenesisTab` vs `StandardMandateTab`, Paso 4 pendiente de la migración de UI (§4), probablemente deja de tener sentido como dos componentes arquitectónicamente distintos. Si Genesis ya no es un tipo especial de Mandate, no necesita una tab especial — es la misma UI de Mandate genérica para cualquier `MandateType`, con a lo sumo variación de copy o de estado inicial visible (por ejemplo, mostrar que `domain_baseline` es `empty` en vez de `existing`), no un componente Svelte separado con su propio ciclo de vida. Esto también resuelve, de raíz, por qué `/genesis` hoy vive "suelta" sin tab: una vez que Genesis entra al mismo modelo genérico de Mandate, entra naturalmente al mismo flujo de tabs que cualquier otro Mandate, sin necesitar una ruta especial por fuera del sistema.

**Estado real de esto:** decisión de arquitectura recién tomada, no implementada — el refactor de `mandate_genesis_build_workflow.go`/`mandate_genesis_activities.go` hacia un motor genérico todavía no se hizo (se había pausado antes por esta misma razón: no tenía sentido renombrar el archivo mientras el contenido seguía siendo Genesis-específico). Punto de acción concreto para UI: antes de invertir esfuerzo separando `GenesisTab` de `StandardMandateTab` como venía el roadmap de v3, confirmar si esa separación sigue siendo necesaria bajo esta arquitectura, o si el Paso 4 se simplifica a "una sola tab de Mandate, genérica, con variaciones de estado según `MandateType`" (ver §4).

---

## 1. El flujo completo, de punta a punta, en una sola tabla

**El diagrama de abajo describe el flujo real, tal como está construido hoy (histórico — código real, GAP V3).** Bajo el pivot v3.1 (§0.1, CAMBIO UI), este flujo cambia en el punto exacto donde se dispara la creación — ver la variante "diseño v3.1" inmediatamente después, y §1.2 para el detalle.

```
ONBOARDING (Electron, ventana 1)                                    [ESTADO REAL — histórico, código GAP V3]
  └── step PROJECT: usuario elige/importa carpeta de proyecto (ya sube TODO el proyecto a la raíz .bloom/)
  └── step MANDATE (último step): copy + botón → dispara CLI `nucleus mandate genesis --project --source [--docs]`
        └── el flag `--docs` es parseo de CLI para Capa 0 (detección de documentación) — NO viaja como
            campo del input de Temporal (ver §1.1). No confundir ambas cosas.
        └── escribe mandate_state.json (currentPhase: "ingest", status: "pending")
        └── dispara onboarding:complete → Opción C: ventana nueva (Core) + cierre de la vieja
                │
                ▼
CORE (Electron, ventana 2 — Svelte webview en :5173)
  └── mandate_watcher.go (servicio Go, ya corriendo en paralelo) detecta el archivo por fsnotify
        └── arranca MandateGenesisBuildWorkflow (Temporal) — YA CORRIÓ o está por correr
              │
              ▼
        FASE 1 — ingest        (ver §1.1 y §2 — estado real vs. objetivo `ing/` difieren)
        FASE 2 — cluster       (ver §1.1 y §2 — estado real vs. objetivo `ing/` difieren)
        FASE 3 — validate      (ÚNICO paso con input humano: confirmar/renombrar dominios — HTML ya construido)
        FASE 4 — scaffold      (automático, placeholder — P4 real no implementado)
```

```
ONBOARDING (Electron, ventana 1)                          [DISEÑO v3.1 — 🔀 Pivot, no implementado todavía]
  └── step PROJECT: usuario elige/importa carpeta de proyecto (sin cambios respecto al flujo real)
  └── step MANDATE (último step, redefinido): pantalla puramente EXPLICATIVA — comunica qué es Genesis y
        qué va a pasar, pero NO dispara `nucleus mandate genesis` ni escribe mandate_state.json.
        └── verify/produce del step cambia (ver §1.2) — ya no puede verificar `genesis_mandate_id`,
            porque a esta altura ese mandate todavía no existe.
        └── dispara onboarding:complete → misma Opción C (ventana nueva Core + cierre de la vieja) —
            el mecanismo de apertura de ventana NO cambia, lo que cambia es qué parámetro viaja con él
            (ver §1.2: "arrancá Genesis para este proyecto", por el canal de paso de parámetros que ya
            exista entre ventanas — IPC, args de proceso o env var, a confirmar cuál).
                │
                ▼
CORE (Electron, ventana 2 — Svelte webview)
  └── si recibió el parámetro "arrancá Genesis": dispara la creación real del Mandate ACÁ — Core es quien
      manda a crear el mandate, ya no un IPC síncrono desde Onboarding.
  └── si NO lo recibió (Core abierto normalmente, sin venir de un Onboarding recién cerrado): la creación
      de un mandate Genesis pasa a estar disponible como acción propia de Core en cualquier momento —
      "crear mandate → elegir Genesis" — no exclusiva del primer arranque (ver §1.2).
        └── mandate_watcher.go sigue detectando el mandate_state.json recién escrito, sin cambios en el
            mecanismo de detección por fsnotify.
              │
              ▼
        El Mandate creado corre como un Mandate estándar — SIN Workflow dedicado a Genesis. Ver §2.1 para
        cómo se reparte ese trabajo entre `ing/` (domain_baseline: "empty") y, si hace falta, `dis/`.
```

**El picker de Capa 1** (`/genesis` en el webview) vive **en Core**, y hoy es best-effort — no bloquea ni pausa Fase 1, porque no existe (todavía) un gate en `mandate_watcher.go` que lo obligue a esperar. Bajo v3.1, con Genesis viviendo dentro del mismo `MandateTab` genérico (§4), este picker deja de tener sentido como ruta "suelta" — se integra al mismo flujo que cualquier Mandate.

### 1.2 Mecanismo de paso de parámetros Onboarding → Core (🔀 Pivot v3.1, investigación pendiente)

El contrato de datos del step `mandate_genesis` en `onboarding_steps.json` cambia: hoy produce `genesis_mandate_id` y lo verifica contra ese campo (`verify: json_field`), con `conductor_reaction: onOnboardingSuccess` disparando el cierre de la ventana. Si la creación real se difiere a Core, ese step deja de poder verificar algo que todavía no existe en ese momento — hace falta redefinir qué produce y verifica en su lugar, probablemente algo tan simple como "el usuario vio y reconoció la pantalla explicativa" (un booleano de tipo `acknowledged: true`, a confirmar el nombre real del campo contra `onboarding_steps.json`).

Queda pendiente confirmar el mecanismo real por el que se abre la ventana de Core hoy (Opción C: ventana nueva + cierre de la vieja) para ver qué forma de pasaje de parámetros ya está disponible — IPC, argumentos de proceso, variable de entorno — y usar ese mismo canal para transportar "arrancá Genesis para este proyecto", sin inventar uno nuevo si no hace falta. Esto es investigación, no diseño: la decisión de *que* Core dispare la creación ya está tomada (§0.1); lo que falta es el *cómo* técnico exacto.

Esto se cruza directo con el Paso 4 de la migración de UI (§4): antes de diseñar la pantalla de "Core dispara Genesis al abrir", conviene decidir en qué UI concreta aterriza esa creación — y, bajo v3.1, esa decisión ya no depende de terminar toda la migración de los 5 Pasos, porque no hace falta un `GenesisTab` separado (ver §4) — hay que definir igual un punto intermedio aceptable mientras el resto de los Pasos no estén listos.

### 1.1 Fase 0 — Setup / `GenesisBuildInput` (Temporal) — ✅ Confirmado (código real — GAP V3)

La firma real del input de Temporal **no incluye `RawDocs` ni empaquetado de adjuntos**. El struct `GenesisBuildInput` tiene únicamente estos campos, confirmados contra `mandate_genesis_build_workflow.go`:

- `MandateID`
- `MandateType`
- `BaseGenesisID`
- `Source`
- `Project`
- `MandatesRoot`

Cualquier mención previa (v1 de este documento, y otros docs relacionados) a que el workflow "empaqueta adjuntos" o "transmite `RawDocs`" queda **corregida**: eso no existe en el código real. Si Capa 0 necesita mover documentos al workflow, tiene que hacerlo por otro canal (filesystem, no por el input de Temporal) — ver §3, Capa 0.

**Nota v3.1:** este struct (`GenesisBuildInput`) y el `MandateGenesisBuildWorkflow` que lo consume son, en sí mismos, lo que el pivot de esta versión elimina (§0.1, CAMBIO BACKEND). La foto de campos de arriba sigue siendo correcta como registro de lo que existe hoy en el código, pero deja de ser el objetivo a extender — no se trata de agregarle `RawDocs` a este struct en el futuro, sino de que este struct completo deje de tener un Workflow dedicado que lo reciba. Ver §2.1 para qué lo reemplaza.

---

## 2. Estado por Fase del workflow — Backend (base histórica + diseño v3, superado en parte por v3.1 — ver §2.1)

**Nota de encuadre v3.1:** la tabla de abajo compara "estado real hoy" (columna izquierda, código GAP V3, sigue siendo verdad) contra "objetivo `ing/`/`dis/`" tal como lo definía v3 (columna derecha) — que todavía asumía que ese objetivo se alcanzaba *dentro* de las mismas 4 Fases de un `MandateGenesisBuildWorkflow` dedicado. El pivot v3.1 va un paso más allá: no es solo que Fase 1 y Fase 2 deban invocar `ing/` en vez de estar huecas — es que **no debería seguir existiendo un Workflow de Go específico de Genesis que numere "Fases" en absoluto**. La tabla queda igual como registro de lo confirmado por código y como diseño intermedio de v3, pero el diseño vigente para construir de acá en más es el de §2.1.

| Fase | Estado real hoy (✅ código — GAP V3) | Objetivo `ing/` / `dis/` según v3 (🎯 Redefinido, superado por v3.1 — ver §2.1) |
|---|---|---|
| 1 — ingest | Una sola `PublishMandateEventActivity` que emite el evento `mandate:phase:ingest` con `mandateId`. **No lee archivos, no llama a Brain, no toca ChromaDB.** Es, literalmente, un evento hueco. | Invocar `brain` como subproceso CLI desde las Activities de Go (no TCP/EXECUTE_INTENT, ver §6 D-15): `brain intent create --type ing --json` para crear el intent, seguido de `brain intent hydrate --id <id> --files <paths de {MandatesRoot}/{MandateID}>` para leer los archivos de contexto, disparando `.reception/` (BISP §3 de `ING_Intent_Spec_v1_1.md`) — recibe el raw material, empaqueta el payload BISP de ingesta y coordina la vectorización en ChromaDB, reemplazando el evento hueco actual. |
| 2 — cluster | `ScaffoldDomainActivity` con `Mode: dry_run`. **No clusteriza nada**: devuelve siempre un único dominio igual a `input.Project`. No existe canal a Brain — el cliente TCP:5678 mencionado en specs previas **no existe en Go**. | Pasar de mock `dry_run` a invocar `brain intent add-turn` (subproceso CLI, no TCP) para los turnos de `.classification/`, que resuelve Raw→Dominio→Gene en dos pasadas (§4 de `ING_Intent_Spec_v1_1.md`) y escribe la propuesta en `.domain_resolution.json` — **acotada al lote local**, comparando solo contra los centroides de Dominio ya existentes al momento de la corrida, nunca reconsiderando Dominios ya consolidados entre sí. `brain intent submit` cuando el paso requiera invocar a un provider de IA generativa vía Synapse para la validación semántica de esa propuesta local, antes de llegar a Fase 3. **Esta fase nunca fusiona, divide, renombra Dominios ni agrega una segunda arista a un Gene que ya tenía Dominio** — esa reestructuración global es competencia exclusiva de `dis/` (ver fila siguiente y §9). |
| 3 — validate | Espera Signal `mandate:genesis:validate`; CLI (`domains confirm`) y Signal ya señalizan correctamente. | Sin cambios de esta migración — se mantiene igual. Al cerrar el turno con `committed: true` en `.consolidation/`, Brain siembra o extiende **exactamente una arista** en `.cache/.semantic-index.json` (§5 de `ING_Intent_Spec_v1_1.md`) — la propuesta local de Fase 2 recién se vuelve efectiva acá. |
| 4 — scaffold | `SignMandateActivity` arma `mandate.json` firmado; `MandateExecutionWorkflow` (P4 real) sigue placeholder puro. | Sin cambios de esta migración — se mantiene igual. |
| *(fuera del ciclo Fase 1-4, servicio aparte)* — `dis/` | ⬜ Sin empezar — no existe invocación de `dis/` en ningún punto del código Go hoy. | **`dis/` no es una quinta Fase del workflow.** Se posiciona como servicio/etapa que se ejecuta **bajo demanda o tras la acumulación de cambios incrementales** de una o más corridas de `ing/` (Génesis u otras), para la reestructuración profunda y retrospectiva del mapa semántico: recorre `.discovery/ → .mapping/ → .ratification/` (`DIS_Intent_Spec_v1_0.md`), toma como entrada el `.cache/.semantic-index.json` global y produce como salida ese mismo archivo corregido — fusiones, splits, renombres de Dominio, y altas de arista para Genes cross-domain. Se invoca igual que `ing/`, vía `brain intent create --type dis --json` seguido del ciclo `hydrate/add-turn/submit/finalize` del mismo patrón CLI subprocess (ver §6 D-15). No requiere que haya un Mandate en Fase 1-4 activo al momento de correr. |

**Nota crítica de esta migración:** en v1 de este documento, Fase 1 y Fase 2 estaban marcadas "✅ Corriendo, automático" sin distinguir entre "corre sin errores" y "hace algo real". El GAP V3 deja esto sin ambigüedad: **corren, pero Fase 1 no ingiere nada y Fase 2 no clusteriza nada.** La columna "Objetivo `ing/` / `dis/`" de arriba es la redefinición formal pedida en v3 — es diseño, todavía no código. La adición de `dis/` en v3 no reabre esta nota: `dis/` no forma parte de Fase 1 ni Fase 2, así que no cambia lo que el GAP V3 confirmó sobre ellas — solo agrega el paso posterior, hoy inexistente, que resolvería el problema de fondo (dominios que deberían ser uno solo, resueltos por lotes que nunca se vieron entre sí).

---

## 2.1 Motor unificado (🔀 Pivot v3.1, diseño vigente — no implementado)

**Qué cambia respecto a la tabla de §2:** deja de existir un `MandateGenesisBuildWorkflow` (Temporal/Go) dedicado a Genesis, con sus propias Activities y su propio canal de Signal. En su lugar, **todo Mandate — sin importar `MandateType`** — se ejecuta con el mismo motor genérico: un Mandate descompone su trabajo en Actions, y cada Action se resuelve como uno de los Intents estándar del sistema (`ing/`, `dis/`, y los ya existentes `dev/`, `doc/`, `exp/`, `inf/`, `cor/`). Esto es la aplicación, un nivel más arriba, del mismo principio que ya se aplicó a nivel Intent al reemplazar `gen/` por `ing/` — ver §0.1, CAMBIO BACKEND, para el razonamiento completo.

**Cómo se ve un Mandate Genesis bajo este motor:**

| Concepto viejo (v3, Workflow dedicado) | Concepto nuevo (v3.1, motor genérico) |
|---|---|
| `MandateType: "genesis"` dispara `MandateGenesisBuildWorkflow` | `MandateType: "genesis"` es solo metadata de negocio — el Mandate corre en el mismo motor que cualquier otro |
| Fase 1 (ingest) y Fase 2 (cluster) = pasos hardcodeados del Workflow de Genesis | Primera Action del Mandate se resuelve en un `ing/` con `domain_baseline: "empty"` — mismo `ing/` que usa cualquier incorporación de subsistema/repo/módulo, no exclusivo de Genesis |
| Fase 3 (validate) = Signal `mandate:genesis:validate` "brandeado" | Turno de `.consolidation/` dentro de ese mismo `ing/` — Signal genérico de Mandate, no un canal exclusivo de Genesis |
| Fase 4 (scaffold) = `SignMandateActivity` con `"genesis"` hardcodeado en la firma | `SignMandateActivity` firma según el `MandateType` real del Mandate — deja de hardcodear el string, bug cerrado de raíz (ver D-14, §6) |
| `domain_expansion` = caso secundario, mal integrado al Workflow de Genesis | `domain_expansion` corre el mismo motor, con `ing/` arrancando en `domain_baseline: "existing"` — no hay dos caminos, hay un parámetro de entrada distinto |
| Reestructuración global (fusión/split/rename de Dominio) = fuera de alcance del Workflow de Genesis, sin lugar claro | `dis/` corre como Action separada del mismo Mandate (o de otro, o standalone bajo demanda), sin necesidad de que el Workflow de Genesis "sepa" de su existencia — mismo `dis/` ya definido en §9 |

**Lo que NO cambia con este pivot:** el trabajo real que hacen `ing/` y `dis/` puertas adentro — sus fases internas (`.reception/ → .classification/ → .consolidation/` para `ing/`; `.discovery/ → .mapping/ → .ratification/` para `dis/`), sus artefactos, su mecanismo de invocación CLI subprocess (D-15, §6) — no se toca. `ING_Intent_Spec_v1_1.md` y `DIS_Intent_Spec_v1_0.md` siguen siendo la fuente de verdad de esa capa interna, sin cambios por este pivot. Lo que cambia es exclusivamente la capa *externa* de orquestación: quién invoca a `ing/`/`dis/` y bajo qué mecanismo (§9 sigue vigente en su descripción del puente Go→`brain` CLI; lo que deja de existir es el Workflow específico de Genesis que antes hacía esa invocación desde Fase 1/Fase 2).

**Qué gana el sistema, en términos de trabajo pendiente evitado:** el trabajo que v3 dejaba pendiente en la fila "Objetivo `ing/`/`dis/`" de §2 — conectar Fase 1 y Fase 2 del Workflow de Genesis a `ing/` — deja de ser el camino correcto. En vez de cablear `ing/` *dentro* de un Workflow que después hay que seguir manteniendo aparte para `domain_expansion` y para cualquier tipo de Mandate futuro, el trabajo pasa a ser: (a) confirmar/construir el motor genérico de ejecución de Actions→Intents a nivel Mandate (si no existe ya en alguna forma para `dev/`/`doc/`/etc.), y (b) verificar que ese motor genérico soporte iniciar un `ing/` con `domain_baseline: "empty"` como primera Action de un Mandate. Esto reemplaza, no se suma, al ítem 6 de §7 ("Implementar la redefinición de Fase 1 y Fase 2") tal como estaba planteado en v3 — ver §7 actualizado.

**Estado:** diseño recién tomado, no implementado. El refactor de `mandate_genesis_build_workflow.go`/`mandate_genesis_activities.go` hacia el motor genérico todavía no arrancó — venía pausado desde antes de este pivot, precisamente porque no tenía sentido tocar esos archivos mientras seguían siendo Genesis-específicos de punta a punta.

---

## 3. Estado por Capa del Bootstrap Strategy — Backend + Frontend

| Capa | Qué es | Backend | Frontend |
|---|---|---|---|
| 0 — Documentación | Detectar docs existentes + drag-and-drop | Flag `--docs` en CLI `mandate genesis` ✅ (solo sirve en creación, no post-mandate; **no viaja al input de Temporal**, ver §1.1) | `docsGate.ts` + `/genesis` ✅ construido — pero 2 endpoints que necesita (`GET/POST /api/project/docs`) ⬜ no existen |
| 1 — Vectorizar (Ollama+ChromaDB) | Extraer patrones de la documentación | ⬜ Sin empezar como Capa aislada — pero la coordinación de vectorización en ChromaDB pasa a ser responsabilidad formal de Fase 1 dentro de `ing/` (🎯 Redefinido, ver §2). Técnica de extracción sin decidir todavía. | N/A |
| 2 — Matching contra filesystem | Proponer dominios reales a partir de los patrones | ⬜ Sin empezar — depende de 1. La validación semántica de esta propuesta es lo que Fase 2 hará vía Synapse/IA generativa (🎯 Redefinido, ver §2). | N/A |
| 3 — Biblioteca de patrones | Acumular confirmaciones humanas entre mandates | ⬜ Sin empezar — depende de 1-2 | N/A |

**Nota importante (heredada, sigue vigente):** Capas 1-3 no bloquean el lanzamiento. El sistema funciona hoy con el fallback ya documentado (Fase 2 siempre propone 1 dominio = el proyecto entero — confirmado por código en §2). No es ideal, pero es funcional y honesto (la UI ya lo comunica, ver `/genesis`).

---

## 4. Estado de la migración de UI (los 5 Pasos) — 100% Frontend

*(Sin evidencia nueva del GAP V3 en esta sección — no es código Go/TS de backend. Se mantiene igual que v1, sin re-verificar en esta ronda.)*

| Paso | Qué es | Estado |
|---|---|---|
| 1 — Sidebar fusionado | Rail visual del mock + 6 links reales de SvelteKit | ✅ Confirmado (spec previa, sin cross-check en esta ronda) |
| 2 — tab-bar | Reemplazar `switchTab` vanilla JS por Svelte real + store de tabs | 🔄 En curso — pedido ya enviado a la sesión de Frontend, sin devolución todavía |
| 3 — LedgerPanel | Estructura real + `ledgerStore.ts` (placeholder de datos explícito) | ⬜ Sin empezar — depende de 2 |
| 4 — `MandateTab` único (redefinido, v3.1) | Ya **no** es "decidir la frontera entre `GenesisTab` y `StandardMandateTab`" — pasa a ser "confirmar que una sola tab de Mandate genérica alcanza para cualquier `MandateType`, con variaciones de estado (copy, `domain_baseline` visible) en vez de dos componentes separados" | ⬜ Sin empezar — depende de 3. **Deja de bloquear que Genesis se vea dentro de una solapa**: al no haber `GenesisTab` separado, Genesis entra directo al mismo flujo de tabs que cualquier Mandate en cuanto el `MandateTab` genérico exista — ver §0.1 CAMBIO BACKEND y nota abajo |
| 5 — Rutas `/nucleus` y `/projects` | Montar `NucleusPanel.svelte`/`ProjectsPanel.svelte` ya existentes | ⬜ Sin empezar — independiente, puede ir en paralelo en cualquier momento |

**Por qué `/genesis` hoy se ve "suelta", sin tab (histórico, sigue siendo la razón real de por qué está así hoy):** decisión explícita (Opción 1, tomada unos turnos atrás) — se priorizó tener el picker de Capa 0 funcional ya, en vez de esperar a los pasos 2-4. Es esperado, no un bug.

**Actualización v3.1 — cómo se resuelve de acá en más:** ya no depende de que el Paso 4 resuelva una frontera entre dos componentes (`GenesisTab` vs `StandardMandateTab`), porque bajo el pivot backend (§0.1, §2.1) Genesis deja de ser un `MandateType` con tratamiento especial — es un Mandate más, con `domain_baseline: "empty"`. El Paso 4 se simplifica a construir un único `MandateTab` genérico, impulsado por estado (`MandateType`, `domain_baseline`, fase/turno activo), no por dos árboles de componentes distintos. **Punto de acción concreto, antes de tocar código de UI:** confirmar explícitamente, con quien venga trabajando el roadmap de UI, si la separación `GenesisTab`/`StandardMandateTab` sigue teniendo algún caso de uso real (por ejemplo, alguna variación visual que no se pueda resolver con props/estado dentro de una sola tab) — si no lo tiene, el Paso 4 pasa a ser más chico de lo que estaba planeado en v3, no más grande.

---

## 5. Filesystem y Eventos — ✅ Confirmado (código real — GAP V3)

### 5.1 `domain_proposal.json` — layout resuelto

Este documento (v1) tenía la deuda D-13 abierta: "layout plano vs. árbol anidado, sin resolver cuál es el correcto". **Queda resuelto:**

- Lo escribe `scaffoldDryRun()` en `mandate_genesis_activities.go`, vía `os.WriteFile`.
- Ruta real: `{mandatesRoot}/{mandateID}/domain_proposal.json` — **layout plano**, no anidado.
- El struct `ProposedDomain` usa las claves JSON `"id"` y `"domainName"`.

### 5.2 `ws-events.ts` vs. eventos reales de Go

Este documento (v1) tenía la deuda D-11 abierta: "contenido real de `ws-events.ts` nunca se leyó completo, el contrato se infirió de los emisores Go". **Queda parcialmente resuelto** — se leyó y se cruzó contra el código Go, y aparecen gaps concretos:

**Eventos que Go emite y que NO están en `WsEventMap` (`ws-events.ts`):**
- `mandate:phase:ingest`
- `mandate:genesis:rejected`
- `mandate:genesis:all_complete`

**Evento con payload incompleto en TS:**
- `mandate:action:completed` — Go le agrega la clave `"domains"` (con `ProposedDomain[]`) que el tipo TS no contempla.

**Comportamiento de red (nuevo dato, sin precedente en v1):** `publishMandateEvent()` en Go dispara el envío en una `goroutine` con `http.Client{Timeout: 2 * time.Second}` contra `http://localhost:48215/internal/mandate-event`, y **silencia fallas de red**. Esto es evidencia directa a favor de D-12 (canal fire-and-forget sin retry) — confirma por qué la UI necesita el plan B de timeout+fallback que ya tiene implementado en `/genesis`.

---

## 6. Deuda técnica y preguntas abiertas — consolidado, todo en un lugar

| # | Ítem | Dueño | Estado tras GAP V3 |
|---|---|---|---|
| D-3 | `dependsOn` entre dominios | Backend | Cerrado a nivel de datos, sin productor real (necesita Capa 1-2 / Fase 2 redefinida) — sin cambios |
| D-9 | `confirmedBy` — identidad de quien confirma | Backend/producto | Vía CLI ✅ resuelto; vía Signal ❌ sigue vacío, decisión de producto pendiente — sin cambios |
| D-11 | Contenido real de `ws-events.ts` | Backend | **✅ Resuelto en esta migración** — leído y cruzado contra Go. Ver §5.2 para los 3 eventos faltantes + 1 payload incompleto. |
| D-12 | Canal de eventos fire-and-forget, sin retry | Backend/Frontend | **✅ Confirmado por código** — `goroutine` + timeout 2s + fallas silenciadas (ver §5.2). UI ya tiene plan B en `/genesis`. |
| D-13 | Layout de filesystem real (plano) vs. árbol documentado (anidado) | Backend | **✅ Resuelto en esta migración** — es plano. Ver §5.1. |
| Q-02 | Endpoints `GET/POST /api/project/docs` | Backend | Bloquea que el picker de Capa 0 funcione de verdad, no solo la UI — sin cambios |
| Q-08 | Endpoint que exponga `genesis_mandate_id`+fase para redirect automático a `/genesis` | Backend | Hoy `/genesis` solo es alcanzable por link manual en el Sidebar — sin cambios |
| `mandate_dir` | Campo nuevo en `GenesisMandateResult` (Go) | Backend | Propuesto, viable, no aplicado todavía — sin evidencia nueva en GAP V3 |
| Preload bridge Core | `window.nucleus` en `preload_core.js` | Frontend | Reportado como arreglado por la sesión de Frontend — archivo real todavía no confirmado por esta sesión |
| D-05 (heredado) | `registerSynapseHandlers` no se llama en el path de Core | Frontend | Sin resolver, deuda conocida desde el Preludio original |
| Sync `ing/` | `mandate_state.json.currentPhase` vs. `.ing_state.json.phase_active` — orden de escritura y comportamiento ante falla parcial | Backend | No bloquea hoy — sin decisión de diseño todavía (ver §8) |
| **D-14 (nuevo)** | **`runGenIntentActivity` no existe en el código.** Cualquier referencia previa (en esta familia de documentos o en discusión) a que el workflow invoca esa función queda cerrada como incorrecta — el workflow real solo dispara `PublishMandateEventActivity` (Fase 1) y `ScaffoldDomainActivity` (Fase 2). | Backend | **✅ Cerrado por código — GAP V3** |
| **D-15** | ¿El puente Go↔`ing/` para Fase 1 y Fase 2 ya existe en algún lado no cubierto por el GAP V3, o es enteramente trabajo pendiente? (planteada en §9) | Backend | **✅ Resuelto** — el puente es invocación CLI subprocess de `brain intent {create,hydrate,add-turn,submit,finalize}`, mismo patrón que ya usa el plugin de VS Code. No requiere Sentinel ni cliente TCP nuevo. |
| **D-18 (nuevo)** | Discrepancia de protocolo/puerto: `server_manager.py` usa Big Endian en el header de 4 bytes sobre :5678 (servidor real de Brain); `submit_intent()` en `intent_manager.py` abre su propio socket también por defecto a :5678 pero con header Little Endian, apuntando conceptualmente al "native host bridge" (`bloom-host.exe`, según su docstring). | Backend | **⬜ Abierto** — confirmar el puerto real de `bloom-host.exe` antes de asumir que son el mismo socket: riesgo de colisión de puerto o de doc desactualizada. |
| **D-19 (nuevo, v3)** | Modelo de ejecución dual de Intents BISP (`ing` para el pipeline de ingesta local, `dis` para el análisis/discovery global retrospectivo) | Backend/producto | **✅ Resuelto en esta migración** — formalizado e independizado como dos intents con spec propia (`ING_Intent_Spec_v1_1.md`, `DIS_Intent_Spec_v1_0.md`). `ing` propone localmente vía `.domain_resolution.json` sin tocar el mapa global hasta confirmar; `dis` corre bajo demanda o tras acumulación de cambios incrementales y es dueño exclusivo de la reestructuración global del grafo BISP (fusión/split/rename de Dominio, altas de arista cross-domain). Ninguno de los dos existe todavía invocado desde el código Go (ver fila `dis/` en §2 y D-15) — lo resuelto acá es el *diseño del reparto de responsabilidades*, no la implementación. |
| **D-20 (nuevo, v3)** | Sincronización de contratos de metadata entre los artefactos de `ing/` (`.domain_resolution.json`, propuesta local por lote) y el grafo global revaluado por `dis/` (`.domain_graph_snapshot.json` al arrancar `.discovery/`, `.mapping_proposal.json` en `.mapping/`, `.domain_graph_delta.json` al cerrar `.ratification/`) | Backend | **⬜ Abierto, nuevo** — ambos intents leen y escriben, en última instancia, la misma fuente de verdad (`.cache/.semantic-index.json`), pero en momentos distintos y con distinta granularidad: `ing/.consolidation` siembra o extiende **una** arista por commit; `dis/.ratification` puede reescribir el grafo entero de una corrida. Falta definir explícitamente qué pasa si una corrida de `ing/` cierra su turno (`committed: true`) **mientras** una corrida de `dis/` tiene un `.mapping/` en curso sobre el mismo `domain_id` — el snapshot que tomó `dis/` en `.discovery/` (`.domain_graph_snapshot.json`) quedaría desactualizado respecto al `semantic-index.json` real al momento de `.ratification/`. Ninguna de las dos specs (`ING_Intent_Spec_v1_1.md` §4/§5, `DIS_Intent_Spec_v1_0.md` §7.3) define un lock o una regla de reintento para esta carrera — la única garantía firme hoy es que un `domain_id` absorbido por un merge o reemplazado por un split nunca se reasigna (§7.3 DIS), lo que evita colisión de identidad pero no resuelve la carrera de escritura. Relacionado con, pero distinto de, el ítem "Sync `ing/`" ya existente en esta tabla (ese es `mandate_state.json` vs. `.ing_state.json`, a nivel de un solo intent; este es entre dos intents distintos compitiendo por el mismo grafo global). |
| **D-21 (nuevo, v3)** | Switch de organización — modelo Single-Org Activa por instancia, con guardas bloqueantes G1-G8 | Nucleus (Go) / Conductor (Electron), con partes ya avanzadas en Sentinel (Go) y Brain (Python) | **🟡 Diseño aceptado + partes en código real, auditoría de Nucleus/Conductor todavía abierta.** Decisión de diseño (no se reescribe el sistema como multi-tenant en memoria): switch de organización bloqueado mientras existan Mandates, workflows de Temporal o intents in-flight de la org actual; drenado e inmutabilidad de `.bloom/.nucleus-{org}/` antes de conmutar. Ocho guardas cubren el ciclo completo — G1 (fuente de verdad del in-flight), G2 (endpoint explícito `can-switch-org`, nunca inferido por el caller), G3 (qué cuenta como in-flight, con riesgo de proceso zombie sin heartbeat/timeout), G4 (lock persistido durante el drenado, no solo antes), G5 (Vault scope: validar la org contra la activa *al momento del request*, no una cacheada al boot — prioridad alta, es donde una violación de drenado se vuelve fuga de credenciales entre orgs), G6 (punto de entrada único del switch en Conductor), G7 (`getOrCreateOrg` como primitivo tonto, nunca invocado directo desde un flujo de switch), G8 (auditoría también de los intentos de switch bloqueados). Del lado Sentinel/Brain, threading de `org_id` end-to-end (`Electron → Daemon → Client → Brain`, patrón `StampProfileOrg`) y resolución dinámica de `vault.json` por org en `server_manager.py` (`BLOOM_NUCLEUS_ROOT` → `BLOOM_ORG` → fallback, mismo orden de precedencia que `ResolveNucleusRoot()` en Go) ya están confirmados por código. La cadena de credenciales de proveedores de IA (Gemini/Claude) todavía no tiene el mismo aislamiento por org. Ver doc completo: `G1-G8_multi-org-switch-design.md` (§8). |
| **D-22 (nuevo, v3.1)** | Contrato redefinido del step `mandate_genesis` en `onboarding_steps.json` — hoy verifica `genesis_mandate_id` (`verify: json_field`) con `conductor_reaction: onOnboardingSuccess`; bajo el pivot, ese mandate ya no existe en ese momento | Frontend/Onboarding | **⬜ Abierto, nuevo** — hace falta redefinir qué produce y verifica el step en su lugar (candidato: un booleano tipo "usuario vio y reconoció la pantalla explicativa"). Bloquea el resto de §1.2 hasta confirmarse contra el archivo real. |
| **D-23 (nuevo, v3.1)** | Canal de paso de parámetros entre la ventana de Onboarding y la de Core para transportar "arrancá Genesis para este proyecto" | Frontend/Electron | **⬜ Abierto, nuevo** — hoy se sabe que existe algún mecanismo (Opción C: ventana nueva + cierre de la vieja), pero no cuál de IPC/args de proceso/env var es el disponible ya. Investigación pendiente antes de diseñar la pantalla de "Core dispara Genesis al abrir" (ver §1.2). |
| **D-19 (actualizado, v3.1)** | Modelo de ejecución dual de Intents BISP (`ing` para el pipeline de ingesta local, `dis` para el análisis/discovery global retrospectivo) — ver también D-24 | Backend/producto | Sigue **✅ Resuelto** en cuanto al reparto de responsabilidades entre `ing/` y `dis/` (sin cambios de v3). Lo que sí cambia bajo v3.1: el *cómo* se invoca ya no es "desde Fase 1/Fase 2 de un Workflow de Genesis" sino "desde la primera Action de cualquier Mandate, vía el motor genérico" — ver D-24 y §2.1. |
| **D-24 (nuevo, v3.1)** | Eliminación de `MandateGenesisBuildWorkflow`/`mandate_genesis_activities.go` como camino especial, y del hardcode de `"genesis"` en `SignMandateActivity` | Backend | **🔀 Diseño tomado (§2.1), refactor no empezado.** Reemplaza el ítem 6 de v3 en §7 ("implementar Fase 1/Fase 2 vía `ing/` dentro del Workflow de Genesis") — el trabajo ya no es cablear `ing/` dentro del Workflow existente, sino confirmar/construir el motor genérico de Mandate→Actions→Intents y migrar Genesis a correr sobre él con `domain_baseline: "empty"`. Cierra D-14 de raíz (el hardcode de `"genesis"` deja de tener sentido si no hay Workflow dedicado que lo necesite). |
| **D-25 (nuevo, v3.1)** | Frontera `GenesisTab`/`StandardMandateTab` (Paso 4, §4) — ¿sigue siendo necesaria bajo el motor unificado? | Frontend | **⬜ Abierto, nuevo, prioridad antes de tocar código del Paso 4.** Hipótesis de trabajo (§0.1, §4): probablemente no — se simplifica a un único `MandateTab` genérico impulsado por estado. Falta confirmación explícita de que no hay un caso de uso visual real que la siga justificando. |

---

## 7. Qué hacer ahora, en orden de prioridad real (reordenado en v3.1)

**Nota de encuadre:** el pivot v3.1 es investigación y diseño, no implementación (§0.1). Antes de retomar el punto 6 de v3 ("implementar Fase 1/2 dentro del Workflow de Genesis"), hace falta cerrar las preguntas de diseño que este pivot abre — D-22, D-23, D-25 — para no construir sobre un Workflow o una frontera de tabs que se van a descartar.

0. **(Nuevo, v3.1, antes que nada) Cerrar D-25:** confirmar con quien trabaja el roadmap de UI si la frontera `GenesisTab`/`StandardMandateTab` tiene algún caso de uso real que un `MandateTab` genérico con estado no pueda cubrir. Esto define el tamaño real del Paso 4 (§4) antes de que alguien lo empiece a construir sobre el supuesto viejo.
1. **Confirmar el Paso 2 (tab-bar)** cuando la sesión de Frontend lo entregue — archivo real, no resumen.
2. **Confirmar `main_conductor.js`/`preload_core.js`** reales para cerrar el bridge de `window.nucleus` (reportado, no verificado todavía por esta sesión). Este mismo archivo es candidato directo para resolver D-23 (canal de paso de parámetros Onboarding→Core) — conviene investigar ambos juntos, no por separado.
3. **(Nuevo, v3.1) Cerrar D-22:** redefinir contra `onboarding_steps.json` real qué produce/verifica el step `mandate_genesis` una vez que deja de disparar la creación (§1.2). Precondición para tocar el step en código.
4. **Seguir la secuencia 3 → 4 → 5** de la migración de UI, sin saltos — es la que ya decidimos y la que evita repetir errores de diseñar en abstracto. El Paso 4 arranca del resultado del punto 0 de esta lista, no del planteo original de v3.
5. **Q-02 y Q-08** (los dos endpoints de Backend) pueden ir en paralelo a la migración de UI — no compiten por la misma sesión de Frontend.
6. **Auditoría de Nucleus (Go) para D-21 (switch de organización, G1-G8)** — pedir contenido real de los 5 archivos candidatos más probables: `system_gate.go` (G2, prioridad #1 por nombre), `vault.go` (G5, prioridad alta — es donde una falla de drenado se convierte en fuga de credenciales entre orgs), `ownership.go` (G5/G7), `paths.go` [Nucleus/Go] (G7), `registry.go` (G7) — confirmar o refutar cada guarda contra código real, no contra el mapeo por nombre de archivo del documento de diseño. Recién después, decidir si `system_gate.go` ya es el lugar correcto para G2 o si hace falta un módulo nuevo.
7. **(Reemplaza al ítem 6 de v3 — ver D-24, §2.1) Diseñar y luego implementar el motor genérico de Mandate→Actions→Intents**, confirmando primero si ya existe alguna forma de esto para Mandates `dev/`/`doc/`/etc., y migrar Genesis a correr sobre él (`ing/` con `domain_baseline: "empty"` como primera Action) en vez de seguir invirtiendo en `mandate_genesis_activities.go` como camino especial. Sigue siendo la ruta crítica real para que Capas 1-2 del Bootstrap Strategy dejen de estar bloqueadas por "técnica sin decidir" — priorizar sobre Capa 3, que sigue sin ruta crítica. El mecanismo de invocación CLI subprocess de `brain` (D-15) no cambia, solo cambia quién lo invoca.
8. **Capa 3 del Bootstrap Strategy** (biblioteca de patrones) queda para después del lanzamiento — no es parte de la ruta crítica.
9. **Actualizar `ws-events.ts`** con los 3 eventos faltantes y el payload de `mandate:action:completed` (§5.2) — es deuda chica, cross-cutting, y ya está identificada con precisión de línea de código. Al migrar al motor genérico (punto 7), revisar si los eventos "brandeados" (`mandate:genesis:validate`, `mandate:genesis:rejected`, `mandate:genesis:all_complete`) se generalizan también, o quedan como alias de eventos genéricos de Mandate.
10. **Actualizar `bloom_project_tree.txt` (nuevo en v3)** para reflejar las rutas de artefactos e índices reales de `ing/` y `dis/`, hoy ausentes o desactualizadas en ese árbol de referencia:
    - De `ing/` (`ING_Intent_Spec_v1_1.md` §2): `.reception/` (con `.files/.rawbase.json` y `.rawbase_index.json`), `.classification/.turn_X/.files/.domain_resolution.json`, `.consolidation/.turn_X/` (con `.consolidation.json`), y el `.pipeline/` espejo por fase.
    - De `dis/` (`DIS_Intent_Spec_v1_0.md` §2): `.discovery/.files/` (`.genebase.json`, `.genebase_index.json`, `.domain_graph_snapshot.json`), `.mapping/.turn_X/.files/.mapping_proposal.json`, `.ratification/.turn_X/.files/.domain_graph_delta.json`, y su propio `.pipeline/` espejo — más el archivo de estado `.dis_state.json` a nivel de intent, análogo a `.ing_state.json`.
    - Deuda chica, cross-cutting igual que el punto 9, pero importante para que cualquiera que navegue el filesystem de un Mandate no se encuentre con carpetas `.reception/`/`.discovery/` etc. no documentadas en el árbol de referencia.

---

## 8. Documentos relacionados (ya existentes, este no los reemplaza)

**Nota v3.1:** este pivot afecta directamente a dos de los documentos de esta lista más de lo que los afectaba v3 — `BLOOM_Mandate_Genesis_Backend_Design_v0_1_0.md` (describe el `MandateGenesisBuildWorkflow` que este pivot elimina) y `BLOOM_Genesis_UI_Roadmap_v1.md` (describe un roadmap de UI que probablemente asumía `GenesisTab` como componente separado, ver §4). Ninguno de los dos está reescrito todavía — quedan marcados para revisión, no corregidos por este documento.

- `BLOOM_Mandate_Genesis_Backend_Design_v0_1_0.md` — contrato técnico detallado de Backend (RESOLUCIÓN v1.3) — **revisar tras esta migración: puede tener las mismas afirmaciones sobre `RawDocs`/TCP:5678/`runGenIntentActivity` ya corregidas acá, y ahora también sobre la existencia misma de `MandateGenesisBuildWorkflow` como Workflow dedicado (§2.1)**
- `bloom-mandate-arquitectura-genesis-conductor.md` — arquitectura completa + UX del Conductor
- `BLOOM_Genesis_UI_Roadmap_v1.md` — roadmap específico de UI (multidominio, eventos) — **revisar tras esta migración: si asume `GenesisTab` como componente separado, queda superado por la unificación en `MandateTab` de §4/D-25**
- `BLOOM_Domain_Bootstrap_Strategy_v0_1.md` — las Capas 0-3 en detalle
- `Bloom Conductor — Workspace Core UI.md` / `BLOOM_CORE_GENESIS_MANDATE_PRELUDIO_v0_1.md` — documentos de producto/UX que trajiste vos, fuente de las 4 Zonas y F-01 a F-09
- `ING_Intent_Spec_v1_1.md` — especificación interna del intent `ing/` (motor de Brain detrás de las Fases 1-2, ver §9) — **reemplaza a `ING_Intent_Spec_v1_0.md`** en esta migración; v1.1 saca el campo `domain` de `gen.json` y lo mueve a `.cache/.semantic-index.json` keyeado por `domain_id`, precisamente para poder convivir con `dis/`
- `DIS_Intent_Spec_v1_0.md` — **nuevo en esta migración**, especificación interna del intent `dis/` (motor de Brain para el análisis retrospectivo/discovery de dominios, ver §9) — depende de `ING_Intent_Spec_v1_1.md`, asume la propiedad de la topología de Dominios a partir de esa versión
- `gap_vectorizacion_genesis_v3.md` — fuente primaria de todo lo marcado "✅ Confirmado (código real — GAP V3)" en este documento
- `G1-G8_multi-org-switch-design.md` — **nuevo en esta migración**, diseño del switch de organización con modelo Single-Org Activa y las 8 guardas (D-21, §6/§7). Alcance del documento: Nucleus (Go) + Conductor (Electron); Sentinel/Brain quedan explícitamente fuera de ese documento puntual aunque ya tengan avances propios en código (ver D-21)

Este documento es el índice — cuando haga falta el detalle de algo, se busca en el documento correspondiente de la lista de arriba, no se repite acá.

---

## 9. `ing/` + `dis/` — los dos motores internos detrás del ciclo de vida de un Genesis Mandate (resuelto, integrado)

**Nivel de abstracción distinto al resto de este documento — no colisiona, se integra.** Todo lo de arriba (Fases 1-4) describe la orquestación **externa**: el `MandateGenesisBuildWorkflow` de Temporal/Go, los Signals de Electron, la UI. Por debajo de esa orquestación, dos Intents BISP hacen el trabajo real, con specs propias e independientes:

- **`ing/`** (`ING_Intent_Spec_v1_1.md`, verificado línea por línea contra el archivo real) es la especificación **interna** de cómo Brain/Nucleus procesa el pipeline directo de ingesta de un proyecto/archivos — vectorización, resolución local Raw→Dominio→Gene, persistencia de `.genes/`. Es invocado **directamente** por Fase 1 y Fase 2 del Workflow (ver §2).
- **`dis/`** (`DIS_Intent_Spec_v1_0.md`) es la especificación **interna** de la fase de análisis retrospectivo/discovery de dominios — toma el corpus completo de Genes ya ingeridos por una o más corridas de `ing/` y reescribe el grafo global de `.cache/.semantic-index.json`. **No es invocado por ninguna Fase del Workflow**: corre aparte, bajo demanda o tras acumulación de cambios incrementales (ver tabla de disparo más abajo).

El Workflow en Go no se modifica por la existencia de ninguno de los dos: `ing/` y `dis/` corren debajo de él, en momentos distintos.

### 9.1 Mapeo Fase → `ing/` (invocación directa desde Fase 1 y Fase 2)

| Fase (Temporal/Go, externa) | Dispara en `ing/` (interna) |
|---|---|
| 1 — ingest | `.reception/` — acto único, sin turnos, recibe el raw material; escribe `.files/.rawbase.json` (inventario BISP-compatible) y `.files/.rawbase_index.json` (texto extraído) |
| 2 — cluster | `.classification/` — resolución local en dos pasadas (Dominio primero, Gene después), compara solo contra dominios ya existentes al momento de la corrida; escribe la propuesta en `.turn_X/.files/.domain_resolution.json` |
| 3 — validate | `.consolidation/` — abre turno con `committed: false` en `.consolidation.json`, renderiza la propuesta de `.domain_resolution.json`, espera Signal humano (`approved`/`overridden`/`rejected` por entrada) |
| 4 — scaffold | Mismo turno de `.consolidation/` muta a `committed: true` → por cada entrada aprobada, escribe `.genes/{gene_id}/gen.json` (nuevo) o `.genes/{gene_id}/.history/.delta_N/` (extend), y siembra o extiende **exactamente una arista** Domain↔Gene en `.cache/.semantic-index.json` |

**Límite explícito de esta invocación (v1.1, no existía como aclaración formal en v2):** el commit de Fase 4 sobre `.semantic-index.json` nunca agrega una segunda arista a un Gene que ya tenía Dominio, nunca fusiona, nunca divide, nunca renombra un Dominio existente. Cualquier necesidad de esas operaciones queda fuera del alcance de Fases 1-4 y pasa a ser trabajo de `dis/` — ver §9.2.

**Tensión heredada de v2, sigue vigente:** el mapeo de arriba asume que Fase 1 "recibe el raw material" y Fase 2 "resuelve Dominio→Gene" como si ya estuvieran conectadas a `ing/`. Pero §2 de este mismo documento confirma, por código, que **hoy Fase 1 y Fase 2 en Go no llaman a nada de esto** — son un evento hueco y un `dry_run` mock, respectivamente. El mapeo de esta tabla sigue siendo el diseño objetivo válido, pero no describe una conexión que exista hoy en el código (D-15, ver §6).

**Aclaración (post-cierre de D-15, ver §6):** la tabla de mapeo Fase→`ing/` de arriba sigue siendo correcta tal cual está — Fase 1 sigue disparando `.reception/`, Fase 2 sigue disparando `.classification/`, y así. El mecanismo de invocación no es un cliente TCP nuevo hablándole a Brain por el socket del Event Bus, es `brain` invocado como subproceso CLI directamente desde las Activities de Go (`brain intent create --type ing`, `hydrate`, `add-turn`, `submit`, `finalize`) — mismo patrón que ya usa el plugin de VS Code, sin pasar por Sentinel.

Degradación graceful si Ollama no está disponible (Invariante 3 BISP) ya contemplada en el spec: `.classification/` no aborta, difiere resolución a decisión manual en `.consolidation/`.

### 9.2 `dis/` — no mapea a una Fase, dispara aparte (nuevo en v3)

A diferencia de `ing/`, `dis/` no tiene una fila 1:1 en la tabla de Fases del Workflow porque **no es parte del ciclo de vida de un único Genesis Mandate** — es Nucleus-wide y retrospectivo por diseño (`DIS_Intent_Spec_v1_0.md`, Rationale). Su ciclo interno de tres fases es propio:

| Fase interna de `dis/` | Comportamiento | Artefacto clave |
|---|---|---|
| `.discovery/` | Sin turnos, carga de contexto cara (todo el corpus de Genes + grafo completo) — mismo rol que `.reception/` de `ing/` | `.files/.genebase.json` (snapshot de linaje, sin domain), `.files/.domain_graph_snapshot.json` (copia de `.semantic-index.json` al arrancar) |
| `.mapping/` | Con turnos, propone altas/bajas de arista, fusiones, splits y renombres de Dominio — mismo rol que `.classification/` de `ing/`, pero global en vez de local | `.turn_X/.files/.mapping_proposal.json` |
| `.ratification/` | Con turnos, `committed: false → true`; al cerrar, aplica el mapa final a `.cache/.semantic-index.json` | `.turn_X/.files/.domain_graph_delta.json` (qué cambió respecto al snapshot) |

**Disparo (posicionamiento pedido en esta migración):** `dis/` se ejecuta **bajo demanda o tras la acumulación de cambios incrementales** de una o más corridas de `ing/` — no en cada corrida, no automáticamente encadenado a Fase 2. Casos concretos que lo justifican (`DIS_Intent_Spec_v1_0.md`, Rationale): (a) un Mandate Génesis con múltiples corridas de `ing/` puede terminar creando dos Dominios que en realidad son el mismo territorio conceptual, porque cada corrida de `.classification/` solo compara contra lo ya consolidado, nunca reconsidera dominios entre sí; (b) un Gene puede legítimamente pertenecer a más de un Dominio (cross-domain), y detectar esa segunda pertenencia requiere comparar Genes y Dominios entre sí, no comparar un lote nuevo contra lo existente. Ninguno de los dos casos es detectable desde `ing/` por diseño — de ahí que `dis/` exista como intent aparte y no como una ampliación de `.classification/`.

Igual que `ing/`, se invoca como subproceso CLI desde donde corresponda orquestarlo (`brain intent create --type dis --json`, seguido del mismo ciclo `hydrate/add-turn/submit/finalize`) — no vía TCP ni Sentinel, mismo criterio de D-15. Hoy no existe ningún disparador de `dis/` implementado en el código Go ni en ningún otro punto del sistema — es enteramente trabajo pendiente, sin evidencia de código todavía (ver fila `dis/` en §2).

Degradación graceful si Ollama no está disponible (Invariante 3 BISP) contemplada igual que en `ing/`: `.mapping/` no aborta, difiere resolución a decisión manual en `.ratification/`.

**Garantía de integridad (§7.3 DIS, relevante para D-20 en §6):** un `domain_id` usado y luego absorbido por un merge, o reemplazado por un split, **nunca se reasigna** a una entidad nueva — evita colisión de identidad entre lo que `ing/` pudo haber escrito en paralelo y lo que `dis/` está reescribiendo.

**Punto sin resolver, no bloqueante — sigue en la tabla de deuda técnica (§6):** sincronización entre `mandate_state.json` (`currentPhase`, nivel Mandate) y `.ing_state.json` (`phase_active`, nivel Intent) — quién escribe primero en cada transición, y qué pasa si uno avanza y el otro no ante una falla a mitad de camino. Decisión pendiente, no asumida. Ver también D-20 (§6), la misma clase de problema pero entre `ing/` y `dis/` compitiendo por el mismo grafo global.

**Nota de dependencia con D-21 (switch de organización, §6/§7):** toda ruta real de `ing/`/`dis/` bajo `.bloom/.nucleus-{org}/` (`.cache/.semantic-index.json`, `.mandates/`, etc.) depende de qué org está activa en el momento de la escritura — no es independiente de ese trabajo. Cualquier ajuste a cómo Brain resuelve `.nucleus-{org}/` para artefactos de `ing/`/`dis/` debe seguir el mismo mecanismo ya confirmado en `server_manager.py` (`BLOOM_NUCLEUS_ROOT` → `BLOOM_ORG` → fallback), no inventar una segunda fuente de verdad para la org activa.
