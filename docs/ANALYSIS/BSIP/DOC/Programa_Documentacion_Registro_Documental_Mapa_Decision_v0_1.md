# Registro documental gobernado — mapa para decidir v0.1

**Estado:** relevamiento y mapa de opciones para decidir el registro documental. **No decide ni diseña la implementación.**
**Fecha:** 2026-11-04
**Autoridad:** José Vigil
**Alimenta a:** `Programa_Documentacion_Documento_Madre_v0_4.md` (§5.4 y §13, eje E1)
**Marcas:** las mismas del documento madre (IMPL, ESPEC, PROP, NO EXISTE, LAGUNA, REAL).

### Marco: decisiones de José (2026-11-04)

| # | Decisión |
|---|---|
| DJ-13 (P19) | El registro gobernado aparte es la base, para todos los niveles. La continuidad declarada en la Contribution, solo para documentos que sean activos de un Gene y en una etapa posterior. El digest es evidencia de integridad, no identidad. Se descarta el id dentro del archivo |
| DJ-14 (P20) | La documentación de un Repository que el sistema no produjo queda fuera del programa en esta etapa. No se diseña incorporación |
| DJ-15 (P26) | El disparo es al terminar un `dev` |
| DJ-16 | Los movimientos de documentos los hace el propio sistema. Un movimiento que ocurra sin pasar por el sistema es una anomalía pendiente de declaración y nunca se resuelve por parecido de contenido |

El mensaje que trae estas respuestas llegó encabezado como borrador para revisar ("Revisala antes de enviarla"). Este documento las toma como decisiones de José porque fueron enviadas. Si alguna no lo es, el mapa no cambia, pero sí su marco.

---

## 1. Tensiones con la postura (sin elegir)

| ID | Tema | Versión 1 | Versión 2 |
|---|---|---|---|
| T-1 | Latencia | MJ: integridad de los archivos "actualizados **en tiempo real**" (documento madre v0.3, R-6) | DJ-15: "al terminar un `dev`" |
| T-2 | Orden de `doc` respecto de `dev` | El Mandate v4 firma `ing → dis → doc → exp → dev → exp`: dentro del Mandate, `doc` corre **antes** de `dev`, y después de `dev` viene `exp` (`mandatecontract/contract.go:93`; `tools/mandate-v4-sign/main.go:293`; definición publicada REAL con `doc-3` dependiente de `dis-2`, RV R11) | DJ-15 pone `doc` después de `dev`. Coincide con DOC spec §0 ("conceptualmente se dispara después de un `dev`") y con el ejemplo de BTIPS v7.3 l. 1198 (`exp → dev → doc`) |
| T-3 | Qué es "el propio sistema" | DJ-16: los movimientos los hace el sistema | Hay varios componentes del sistema que escriben, sobrescriben o podrían mover archivos de documentación sin ningún registro: el merge de `dev` (`MergeManager` aplica archivos del staging, `merge_manager.py`); `context generate` sobrescribe `.bloom/core/.rules.bl` (`core/context/manager.py:124-126`); `NucleusManager` crea los `.bl` de gobernanza (`nucleus_manager.py:158-194`); `ProjectLinker` reescribe `overview.bl` y `_index.bl` (`linker.py:320-355`); la extensión escribe sus `.bl` (`NucleusStrategy.ts`). Además, `git pull`, `checkout` o `rebase` traen renombres hechos en otra máquina. No hay fuente que diga cuáles de estos son "el sistema" (P27) |
| T-4 | Recuperar la identidad | DJ-13 descarta el id dentro del archivo | Con esa decisión, la identidad vive **solo** en el registro. Si el registro no está disponible (otra máquina, clon nuevo), nada en el archivo permite recuperarla. Es una consecuencia, no una contradicción entre fuentes; condiciona §3 |

---

## 2. Dónde vive

| Aspecto | L-B: Brain, por Project (`<project>/.bloom/…`) | L-N: Nucleus (`.bloom/.nucleus-{org}/…`, partición por Project) |
|---|---|---|
| Precedente de ubicación | Brain ya escribe por Project bajo `.bloom/.intents/` (`intent_manager.py:622-626`) | El store de Genes ya particiona por Project bajo el Nucleus: `<nucleus-root>/.genes/projects/{project_id}/` (G1 §1; `gene/store.go:61-72`) |
| Precedente de escritura | `IntentStateManager` y el effect ledger: escrituras atómicas y checkpoints idempotentes (`effect_ledger.py`) | Lock por Project + CAS por generación + `head.json` con reemplazo atómico + recuperación (G1 §6-7); `mandatestate.Mutate` con lock de archivo y `stateVersion` monotónico (`mandatestate/store.go:14-41`) |
| Brain escribiendo en el Nucleus | No aplica | Hay precedente: ING escribe `.cache/.semantic-index.json` del Nucleus directamente (`genesis_intelligence.py:304-306`). No existe una API de Nucleus para documentos |
| Projects con varios Repositories | **No los cubre** si el `.bloom/` está en un solo repo. Gene v3 §3 y §7.1 admiten varios Repositories por Project | Los cubre: la partición es por Project, no por repo |
| Identidad del Project que usa | La ruta (`_find_bloom_project`) o el id local `uuid4()` (I-27) | El `project_id`. Si se exige el de Authority, hoy este repo no tiene binding (RV §3, pregunta 2; RN §2) |
| Documentos de nivel Organization y Nucleus | No están en ningún `.bloom/` de Project: quedarían fuera o en otro registro | Están en el propio Nucleus (`.core/`, `.governance/`): mismo lugar |
| Lectores futuros (Genes, Location, Orrery, ASM) | Leerían un archivo dentro del repo de cada Project | Leerían desde el Nucleus, como el store de Genes |
| Costo relativo | Menor: solo Brain; sin interfaz nueva entre sistemas | Mayor: un store nuevo en Nucleus más una interfaz para que Brain escriba (comando o contrato de archivo), más el lifecycle y el dueño en Nucleus |
| Dueño | Brain | Nucleus, con Brain como escritor |

---

## 3. Si viaja con el repo

| Caso | Qué implica |
|---|---|
| **L-B versionado con el repo** | Un clon o un pull traen el registro. Un movimiento hecho por el sistema en otra máquina llega en el mismo commit que el archivo movido, así que es coherente. Pero cada rama tiene su propio registro: hay conflictos de merge en el registro y movimientos que existen en una rama y no en otra. Un commit que lleve el archivo movido sin el registro actualizado produce una anomalía. El historial de Git queda como transporte, nunca como autoridad (X-2). Requiere que `.bloom/` se versione: en este repo el `.gitignore` no lo excluye; en los repos de un Paladín no hay política (LAGUNA) |
| **L-B local, no versionado** | Otra máquina o un clon nuevo no tienen registro. Como no hay id en el archivo (T-4), todos los documentos aparecen sin identidad. Un pull que trae un movimiento hecho por el sistema en otra máquina se ve como anomalía (falta A, apareció B), aunque lo haya hecho el sistema: choca con el espíritu de DJ-16. Si el mismo repo se usa en Windows, Mac y Linux, como pasa hoy, quedan tres registros separados |
| **L-N y el repo** | El Nucleus no vive dentro del repo del Project: en Darwin está en `~/repos/elias-repos/.bloom/.nucleus-elias-repos/` (RV, REAL). Por definición el registro **no viaja** con el repo del Project. Llevarlo a otra máquina requiere que el Nucleus mismo se versione o se sincronice |
| **Sincronizar por Authority** | Existe `authority sync` para identidad, bindings y Mandates (RN; `authority_command.go`). **No existe** ninguna sincronización de documentos ni de registros |

---

## 4. Concurrencia

### 4.1 Quiénes escriben a la vez

- Dos Intents `doc` sobre el mismo Project.
- `doc` y el merge de un `dev`.
- Brain y la extensión.
- Varias máquinas, si el registro viaja por Git: el merge de Git pasa a ser el mecanismo de concurrencia.

### 4.2 Precedentes en el código

| Mecanismo | Dónde | Qué garantiza |
|---|---|---|
| Lock exclusivo por Project + CAS por generación + objetos inmutables + `head.json` con reemplazo atómico + journal de transacciones recuperable | Store de Genes (G1 §6-7; `gene/store.go`; `publish_{darwin,linux,windows}.go`) | Una publicación por vez; nunca un head que apunte a algo inexistente; recuperación después de un crash |
| Lock de archivo + `stateVersion` monotónico | `mandatestate/store.go:14-41` | Mutaciones serializadas y versionadas del estado del Mandate |
| Flags `locked` / `locked_by` en el estado del Intent | `intent_manager.py:1360-1400` | Bloqueo consultivo; no impide escrituras de otro proceso que no lo consulte |
| `flock` / `msvcrt.locking` | `intelligence_supply.py` (journal de suministro) | Exclusión entre procesos en la misma máquina |
| Checkpoints idempotentes | `effect_ledger.py` | Reintentos sin duplicar efectos |

### 4.3 Lo específico del registro

- **Atomicidad entre disco y registro.** Mover el archivo y registrar el evento son dos escrituras. Si el proceso se cae en medio, queda el archivo movido con el registro viejo (una anomalía, según DJ-16) o el registro nuevo con el archivo sin mover. El único precedente de preparar, aplicar, confirmar y recuperar es el journal de transacciones de G1 (§6-7). Ninguna fuente lo define para documentos.
- **Concurrencia entre máquinas por Git:** no está definido quién resuelve un conflicto del registro ni si un conflicto también es una anomalía pendiente de declaración.

---

## 5. Qué cambia y quién es el dueño

| Componente | Cambio | Etapa | Dueño |
|---|---|---|---|
| `doc` (Brain) | Registrar los documentos que produce; hacer los movimientos a través del registro; detectar en cada corrida documentos faltantes o nuevos sin registrar y reportarlos como anomalías; incluir el id del registro en el contrato de salida (T1.8) | Base | Brain |
| `doc` (Brain) | Consumir el disparo "al terminar un `dev`" (§7) | Base | Brain |
| Identidad del Intent `doc` | Si el registro guarda qué Intent hizo cada movimiento, `uuid3(nombre)` cambia al renombrar el Intent (I-41; P21) | Base | Brain |
| Merge de `dev` (Brain) | Si un `dev` puede mover, renombrar o borrar documentos del sistema, tiene que pasar por el registro o reportar lo que hizo. Si no, cada `dev` genera anomalías (T-3; P31) | Base | Brain |
| Otros productores del sistema | Registrar lo que crean o sobrescriben (R-5): `NucleusManager`, `context generate`, `ProjectLinker`, extensión | Base | Brain; extensión (Work no identificado) |
| Nucleus | Solo con L-N: store nuevo, lock, interfaz para Brain y lifecycle | Base | Nucleus |
| Genes | **Nada obligatorio.** Un documento movido es un activo nuevo en una Contribution y una Revision nuevas (RG §3) | Base | Genes |
| Genes (campo existente) | Contribution y Revision ya tienen `stable_provenance`, un mapa libre de texto (`model.go:80, 97`; lo copia `materializer.go:134`). Podría guardar el id del registro **sin cambio de schema**. Ninguna regla lo define, entra al digest canónico y lo tiene que aceptar Genes | Base u opcional | Genes |
| Genes | Campo de continuidad por activo en Contribution y Revision, con verificación: es un cambio de contrato G1 y de `model.go` | Posterior (DJ-13) | Genes |
| Truth trees | El registro es un nodo nuevo del árbol de Project o de Nucleus: requiere una ronda del procedimiento de verificación | Base | AGENDA FOLLOWUP; aprueba José |
| Location | Solo si sus resolvers consultan el registro para reportar un traslado como "identificable" (Closure A3) | Opcional | Location (dueño por ratificar) |

---

## 6. Vínculo posterior con la continuidad de activos de un Gene

### 6.1 Cómo se vincularía

- El registro sabe qué documento es (id) y dónde está (ruta). El Gene sabe qué activos tiene en cada Revision (`asset_id` por ruta).
- **Para saber qué Genes se ven afectados por un movimiento**, el registro necesita una de dos cosas:
  - un índice inverso de archivo → Gene en Genes, que no existe (D-04);
  - o guardar la referencia al Gene en el momento en que el documento entra a una Contribution, lo que requiere definir quién la escribe.
- Por cada Gene afectado hace falta una Contribution con continuidad, ratificada, que publique una Revision nueva. **No hay propagación entre Genes** (RG §2; D-17): con N Genes, son N Contributions.
- Si Genes nunca acepta la continuidad declarada, el registro queda como la única fuente de continuidad. Las Revisiones mostrarían A y después B como activos distintos, y un lector tendría que combinarlos a través del registro.

### 6.2 Estado intermedio: movimiento hecho, ratificación pendiente

| Elemento | Estado |
|---|---|
| Disco | El archivo está en B |
| Registro | Id del documento en B, con el evento A→B hecho por el sistema |
| Gene | La Revision vigente R1 sigue apuntando a A. Es inmutable (X-6) |
| Verificación del Gene | Releer los activos de R1 falla con `ASSET_MISSING`, porque A no existe (`assets.go:86, 97`). Una Contribution nueva que todavía liste A también falla |
| KD | Mover un activo `document` no es un cambio material (requisitos de lifecycle, inv. 19). Si el registro cubriera algún día activos `file`/`test`, moverlos sí sería un cambio material (§1.3) |
| Location | Una captura de R1 reabierta vería A como `missing`, salvo que el resolver consulte el registro. No está definido |
| Orrery | La lista declarada de documentos de R1 muestra la ruta vieja |
| Fuente que manda | Dos fuentes dicen cosas distintas: el registro (B) y el Gene (A). Gene v3 inv. 15 dice que las proyecciones se reconcilian desde la fuente canónica, pero acá cada uno es canónico para un hecho distinto (identidad del documento frente a composición del Gene). **La precedencia no está definida** (P30; dueño: José + Genes) |

**Formas posibles de tratar ese estado** (ninguna fuente las propone; no se elige):
1. Permitir el movimiento y marcar el Gene como "continuidad pendiente" hasta la ratificación.
2. Diferir el movimiento físico de los documentos que son activos de un Gene hasta que la Contribution esté ratificada.
3. Mover y producir la Contribution en el mismo acto, y bloquear el cierre del Intent hasta la ratificación. Es análogo a cómo la KD bloquea `CURRENT`.

---

## 7. Qué falta para el disparo "al terminar un `dev`" (DJ-15)

| Pieza | Qué existe | Qué falta | Dueño |
|---|---|---|---|
| Fin de `dev` | `finalize_intent()` marca `steps.merge = True`, sin hook ni evento (`intent_manager.py:1863`, rama dev/doc en 1916-1930) | Un punto que emita "terminó el `dev` X con estos archivos cambiados" | Brain |
| Qué cambió | El merge usa `.staging_manifest.json` (`merge_manager.py:83`) y hace backup | Que esa lista llegue a `doc` | Brain |
| Canal | Brain tiene un bus de eventos con persistencia JSONL y consulta por timestamp (`core/server/server_event_bus.py:38-181`). Declara `INTENT_COMPLETE` como evento crítico | **Ningún código emite `INTENT_COMPLETE`** en lo revisado. El bus existe, no está conectado a los intents | Brain |
| Dentro de un Mandate | El v4 firma `doc` antes de `dev` (T-2) | Si el disparo tiene que pasar dentro del Mandate, cambia el contrato y la definición publicada | MANDATE |
| Qué documento actualizar | Solo dentro de un Gene hay relación código → documento | Para la documentación de Project y Nucleus, la relación sigue siendo una LAGUNA (DC-5) | Brain (`doc`) |
| `dev` operativo | `dev` también tiene huecos (I-46, I-47) | Que `dev` termine de punta a punta para que haya un "fin de `dev`" real | Brain |

---

## 8. Preguntas para decidir el registro

| ID | Pregunta |
|---|---|
| P27 | ¿Qué componentes cuentan como "el sistema" que mueve documentos: solo `doc`, también el merge de `dev`, los productores de Brain y la extensión, y las operaciones de Git que traen cambios de otra máquina? (T-3) |
| P28 | ¿Dónde vive el registro: L-B o L-N? (§2) |
| P29 | ¿El registro viaja con el repo? Con L-N, ¿cómo llega a otra máquina? (§3; T-4) |
| P30 | En el estado intermedio, ¿qué fuente manda: el registro o el Gene? ¿Cuál de las tres formas de §6.2, u otra? |
| P31 | ¿Un `dev` puede mover, renombrar o borrar documentos del sistema? Si puede, ¿lo hace a través del registro? |
| P32 | T-1: ¿"tiempo real" y "al terminar un `dev`" son lo mismo para el programa, o el primero queda como meta posterior? |
| P33 | T-2: ¿el disparo después de `dev` vale también dentro del Mandate v4, que hoy firma `doc` antes de `dev`? |
