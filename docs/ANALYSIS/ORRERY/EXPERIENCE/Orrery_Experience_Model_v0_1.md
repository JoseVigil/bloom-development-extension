# Orrery — Experience Model v0.1

> **Reemplazado por `Orrery_Experience_Model_v1_0.md` (normativo, 2026-10-11).** Este documento se conserva como versión histórica y no se edita.

| Campo | Valor |
|---|---|
| Documento | `docs/ANALYSIS/ORRERY/EXPERIENCE/Orrery_Experience_Model_v0_1.md` (copia en Project BTIPS: `ANALYSIS/ORRERY/EXPERIENCE/Orrery_Experience_Model_v0_1.md`) |
| Tipo | Experience Model — propuesta para revisión. No es UI/UX v0.2, no es Interaction Grammar, no es contrato ni implementación |
| Estado | BORRADOR para revisión de José. **No aprobado como eslabón normativo** |
| Fecha | 2026-10-10 |
| Encargo | `docs/ANALYSIS/ORRERY/Orrery_Experience_Model_Assignment_v0_1.md` (ejecutado completo) |
| Acta de corpus | "Orrery Experience Model — Corpus priorizado para el cowork" (2026-10-10) |
| Base normativa | Vocabulario v1.0 · Constitución v1.0 (C-1..C-17) · D-1/D-2/D-3/D-3.b v1.0 |
| Referencia física | `main` @ `3bd723be960e788d7358273314c4663856ddd692` (hijo directo de `78bbaad`; el commit sólo agrega documentación) |
| Autoridad de diseño | José Vigil (única) |

> **Convención de citas.** Toda cita física `path:línea` se refiere a `@3bd723b` salvo que se indique otro commit. Las rutas son relativas a la raíz de `bloom-development-extension`. `[Project]` indica un documento que sólo vive en el Project BTIPS. Las referencias normativas se citan como `Vocab §x`, `C-n`, `D-n`.
>
> **Marcas de estado físico usadas en todo el documento.**
> - **[F✓]** existe físicamente y se verificó en código/schema/test a HEAD.
> - **[F~]** existe parcialmente (primitiva o ruta sin caller productivo, o sin llegar a la UI).
> - **[F✗]** no existe físicamente (ausencia demostrada con la búsqueda indicada).
> - **[NO OBSERVADO]** lo que las fuentes normativas y el código determinan que *debería* producirse, pero que no fue validado mediante el Genesis E2E (decisión de José 2026-10-10, punto 1). Ninguna afirmación [NO OBSERVADO] es evidencia de existencia de datos reales.

---

## 0. Decisiones de José que rigen esta versión (2026-10-10)

| ID | Decisión | Efecto en este documento |
|---|---|---|
| DJ-1 | CT-01 opción (a): modelarlo desde lo que norma y código determinan que debería producirse; todo lo no validado por el Genesis E2E se marca [NO OBSERVADO]; no se lee `.bloom` ni `BloomNucleus`. | §11 CT-01; §12 requisitos de validación diferida. |
| DJ-2 | Eje C opción (a): Gravity se mantiene como eje fundamental; CT-02..CT-05 como contrato de experiencia; requisitos con información, productor/Fuente, Procedencia, existencia física y gap; no se reduce Gravity por ausencia de implementación. | §6, §11 CT-02..05, §12 RI-G. |
| DJ-3 | Escritura aprobada en `docs/ANALYSIS/ORRERY/EXPERIENCE/` y copia en el Project; anexos dentro del mismo documento. | Este archivo. |
| DJ-4 | `GravityGraph_Domains_Genes_Postures_Provenance_and_Persistence_Audit_v0_1.md` se incorpora como Nivel 2 del eje C, subordinado a la norma vigente. | §6, Anexo C. |
| DJ-5 | Hover se trata como fenómeno de interacción sin estatus normativo; no se propone modificar el Vocabulario. | §4.1; §14 sin propuestas de término. |
| DJ-6 | Postulate no se resuelve; se registra dónde afecta, qué queda indeterminado y qué decisión futura requiere. EM-C04 permanece. | §3 (E8), §7.2, §13 EM-C04, §15. |

Con DJ-1 y DJ-2 quedaron levantadas las detenciones §13.6 y §13.9 del Assignment para este trabajo. Las demás condiciones de detención siguieron vigentes durante la redacción; ninguna se activó (ver §16).

---

## 1. Resumen ejecutivo

1. **Secuencia corregida.** La hipótesis de 13 eslabones se reorganiza en **una capa permanente de orientación**, **once fases** y **dos fenómenos transversales**. *Percibir* deja de ser una fase (es continuo); *hover* pasa a ser un fenómeno dentro de *explorar*; aparece **Capturar** como fase propia (D-3 la separa de anclar y no la ata a declarar); *Atender* deja de ser una fase secuencial y pasa a ser una **convocatoria por excepción** que puede llegar en cualquier momento sin mover a la persona (C-17); *Retornar* se separa en **salir del Régimen Orrery** y **reabrir una Location** (§3).
2. **Hover / indicación.** Es necesario como fenómeno de experiencia (permite reconocer antes de comprometer la atención), pero no como término: no pertenece al Navigation State, no tiene Fuente, no cambia cámara ni Superficie, y nunca se convierte en Foco sin un acto de la persona. Su equivalente sin puntero es obligatorio (§4.1).
3. **Lentes.** Se describen por la Proyección que leen. Se fijan ocho criterios verificables anti-segundo-modelo y una regla de cobertura: en el Espacio la ausencia de Anotación es ambigua, por lo que cada Lente debe hacer perceptible la diferencia entre **ninguno** (evaluado, sin filas) y **desconocido** (no evaluado / no cubierto) (§5).
4. **Gravity.** CT-02 se recorre paso a paso como contrato de experiencia con cuatro estados distinguibles —**ninguno, confirmada, indecidible, desconocido**— y la Masa sólo como explicación en una Superficie. **Hoy ningún flujo físico puede producir lo que el recorrido necesita**: ningún workflow invoca Activities de Gravity (EM-C01), el contrato firmado no lleva `GravityRef`, los detectores sólo emiten colisiones confirmadas (EM-C05) y no existe lectura de Gravity. Se derivan 14 requisitos RI-G (§6, §12).
5. **Actos.** Los únicos actos humanos físicos sobre Trabajo (confirmar/rechazar dominios, aprobar, activar) existen sólo por CLI, atados a digest y atestación de Authority. Ninguno debe ofrecerse desde el Espacio ni desde una indicación; sólo desde una Superficie cuyo sujeto es el objeto exacto (§7).
6. **CT-01.** Tras Genesis, lo que *debería* existir [NO OBSERVADO] es: Contexto confirmado, un Project vinculado, un Domain confirmado declarado por el Mandate (D-3.b), el Mandate Genesis situado con su `domain_definition.json`, y ningún Gene, Relación Domain↔Gene, Posture vinculada ni Location. **Nada de eso es hoy legible por la UI salvo el resumen del Mandate**: la persona podría orientarse en Contexto (si se consumiera), ver un Mandate en una lista, y nada territorial real (§11).
7. **Hallazgos nuevos contra HEAD:** EM-C01 (recorrido Gravity del Closure v1.1 ya no conectado), EM-C02 (fallback de Contexto rechazado por el propio cliente), EM-C03 (nombres de eventos), EM-C04 (objeto de *declarar* indeterminado), EM-C05 (detectores sin tri-estado), EM-C06 (Atención sin señal clasificada) y otros (§13).
8. **Sin propuestas de término nuevo** (DJ-5). Sin nombres de Lentes. Sin gestos. Sin schemas.

---

## 2. Base, método y referencia física

### 2.1 Regla de diseño aplicada

Cada cosa perceptible propuesta responde: **¿qué término o fenómeno válido hago perceptible y qué acto humano habilito?** (Assignment §1). La matriz completa está en §10.

### 2.2 Disciplina epistemológica

Se aplicó textualmente Assignment §10.1: para hechos físicos, `código / schemas / tests > research histórico`; para semántica, `Vocabulario → Constitución → D-1/D-2/D-3`. Ningún documento histórico se usó como autoridad. Lo simulado (`fromSimulatedData`, `data.ts`, `MOCK_FEED`) se usó sólo como evidencia de interacción. Las ausencias se demostraron con búsqueda (Anexo B).

### 2.3 Referencia física y procedimiento

- HEAD leído de `.git/refs/heads/main` y `.git/logs/HEAD` (sin invocar git después de la primera lectura; ver §16).
- Lectura directa de código, schemas y tests en el equipo de José mediante el puente de dispositivo; ninguna ejecución de builds, tests ni servicios.
- No se leyó el estado operativo (`/home/jose/repos/elias-repos/.bloom`, `/home/jose/.local/share/BloomNucleus`) (DJ-1).
- El prototipo D1 no se ejecutó en runtime; su comportamiento de interacción se derivó del código (`main.ts`). Se registra como límite (§16).

### 2.4 Corpus incorporado

- **Nivel 1:** los 21 documentos (18 repo, 3 Project), verificados accesibles. El #10 existe en el Project sólo como `Investigacion_Already_Orrery_Location_Infraestructura_v0_3_Addendum.md`; sus conclusiones sobre SESSION y ProjectID están superadas por `ORRERY_LOCATION_MATERIAL_CLOSURE_v1_1.md`.
- **Nivel 2:** incorporado por eje antes de cerrarlo (lista en Anexo C), más el audit de Postures (DJ-4).
- **Nivel 3:** consultado sólo donde se indica (Genesis Design v1.0 como historia de "qué produce Genesis"; Glosario/Brief para detectar términos reemplazados).

### 2.5 Lagunas confirmadas (búsqueda por contenido, Anexo C)

| Laguna | Resultado | Tratamiento |
|---|---|---|
| Source Authority Profile V1 | Sólo menciones que declaran sus rutas canónicas no confirmadas (`docs/ANALYSIS/BSIP/ASM/ASM_PRE_MANDATE_EXECUTION_ADR_v0_1.md:46`; `.../ASM_PRE_MANDATE_EXECUTION_ROADMAP_I3_I7_v0_1.md:109,376`). | Se trabaja con las siete clases de Fuente de Vocab §2.5 (A-4). Requisito RI-P3. |
| Tarea ORRERY `01a0a6d5-…` | `docs/CONTROL/AGENDA_MAESTRA.md:715`: "el índice consolidado vive en su conversación y no en un archivo". | No necesaria salvo para A-2; no bloquea. |
| Research "Orrery Postures vs Postulates" | No existe. Contenido disperso: VisorMandatos v0.1 §2.3/§7.1; borrador UI/UX DIS-04; audit de Postures (DJ-4). | EM-C04 (DJ-6). |
| ASM "working snapshot" / `ASM_Location_Research_v0_1` | No localizados; sólo v0.2. | Se usa v0.2 (C28). |
| Atención, Constellation, Assembler, Genesis Control, Monitor | Sin documento dedicado a la experiencia. Genesis Control es un Work Codex CERRADO el 2026-09-18 (`docs/CONTROL/AGENDA_FOLLOWUP.md:92,170-176`) dueño del bloqueador E2E (`docs/MANDATE/MANDATE_PROGRAM_CANONICAL_SOURCE_v0_1.md:73`). Constellation sólo en históricos; Constitución V-3 la reclasifica como Trabajo. Monitor: `installer/monitor/internal/status/command.go:16` ("not yet wired to any runtime source"). | Atención se trabaja desde Vocab §3.7 y C-17 y se registra como requisito hacia el sistema responsable (§7.4, RI-A). |

---

## 3. Secuencia de experiencia validada (P-01, P-02, P-03)

### 3.1 Análisis de la hipótesis eslabón por eslabón

| Eslabón hipotético | ¿Fase real y distinta? | Término/fenómeno A1 | Decisión | Justificación |
|---|---|---|---|---|
| entrar | Sí | Régimen (D-2) | **Se conserva (E1).** | Cambio de Régimen por acto de la persona (C-17); nunca por actividad (Gateway v0.1 §2.4, V-5). |
| orientarse | Sí, pero no es momentánea | Contexto, HUD (D-2), Foco inicial | **Se convierte en capa permanente (O) y en fase inicial (E2).** | D-2 exige HUD de orientación siempre presente; orientarse se repite tras cada salto, no sólo al entrar. |
| percibir | No como fase | Espacio, Anotación | **Se disuelve como modalidad continua (T2).** | La percepción ocurre durante toda la estancia; en términos de situation awareness (Endsley) es el nivel 1, permanente, no un paso (Anexo A X9). |
| explorar | Sí | Navigation State (Foco cambia), Espacio | **Se conserva (E3).** | Navegar ≠ capturar (C-9). |
| hover | No como fase | Ningún término (DJ-5) | **Fenómeno "indicación" dentro de E3.** | No cambia Navigation State; ver §4.1. |
| enfocar | Sí | Foco | **Se conserva (E4).** | Vocab §2.10. |
| comprender | Sí | Superficie de Workspace Core | **Se conserva (E5).** | Puede ocurrir sin mover el Foco (lectura por niveles); su lugar es la Superficie (Vocab §2.8, P-12). |
| anclar | Sí | Anchor | **Se conserva (E6)**, con su inverso *desanclar*. | C-10, D-3 §3 ("un Anchor permanece hasta que la persona lo quita"). |
| — (faltante) | Sí | Captura, LocationSnapshot | **Se agrega Capturar (E7).** | D-3 fija navegar, anclar y capturar como tres actos distintos; Integración v0.3 §3.2 admite capturar sin declarar. |
| declarar | Sí normativamente; objeto indeterminado | Vocab §2.11/§3.4 (ejemplos "Declarar desde Domain Identidad"); Postulate sin definir (Vocab §2.6) | **Se conserva (E8) marcada INDETERMINADA (EM-C04).** | DJ-6. |
| decidir | Sí | Acto humano sobre objeto exacto (C-13, C-14) | **Se conserva (E9).** | Actos físicos existen (§7.2). Distinto de declarar: decide sobre una versión/digest existente. |
| observar | Sí | Trabajo, Lente sobre Trabajo situado, Superficie | **Se conserva (E10).** | Incluye "esperar". |
| atender | No como fase secuencial | Atención (Vocab §3.7) | **Fenómeno transversal "convocatoria" (T1).** | C-17: la Atención llega clasificada y no mueve a la persona; puede ocurrir en cualquier fase. |
| retornar | Sí, pero son dos fenómenos | Régimen / Location reabierta (D-3 §5) | **Se separa en E11a (salir del Régimen) y E11b (reabrir una Location).** | El primero conserva Navigation State (D-2); el segundo es Proyección/Anotación sobre Territorio actual (D-3). |
| — "recuperar contexto" | No como fase nueva | Contexto revalidado + Lente de cambios | **Se absorbe en E2** (orientarse incluye "qué cambió desde la última vez", sólo si una Fuente lo provee). | Evita que Orrery interprete relevancia (C-17). |
| — "descartar" | Sí como acto | C-14 (lo no confirmado no persiste) | **Se absorbe en E6 (desanclar) y E8 (descartar declaración).** | Persistencia deliberada (Orb. Principio XI; Client Object Model §3). |

### 3.2 Secuencia propuesta

```text
CAPA PERMANENTE  O  Orientación: Contexto · ubicación (Foco) · Anchors · Régimen · retorno   (HUD, siempre presente en Régimen Orrery)
TRANSVERSAL      T2 Percibir (continuo)          T1 Convocatoria de Atención (por excepción, cualquier momento, nunca mueve)

E1 Entrar ─► E2 Orientarse ─► E3 Explorar [indicación] ─► E4 Enfocar ─► E5 Comprender
                                   ▲                         │              │
                                   └─────────────────────────┴──────────────┘   (ciclo libre, sin registros)
E5 ─► E6 Anclar/desanclar ─► E7 Capturar ─► E8 Declarar [INDETERMINADO] ─► (proceso soberano posterior)
E5 ─► E9 Decidir (sobre objeto exacto de Trabajo) ─► E10 Observar ─► E5 …
E11a Salir del Régimen  ·  E11b Reabrir Location (vuelve a E2 sobre el Territorio actual)
```

Lectura: E3–E5 forman un **ciclo de exploración sin consecuencias** (nada se persiste, C-9, C-14). Las fases con consecuencias (E6, E7, E8, E9) requieren acto deliberado y Contexto confirmado (C-12). E9 y E10 operan sobre **Trabajo** y pueden alcanzarse sin anclar (un Mandate se aprueba sobre su contrato, no desde un Anchor).

### 3.3 Fases: término, acto, invariantes y estado físico

| Fase | Término / fenómeno | Acto humano habilitado | Invariantes | Estado físico |
|---|---|---|---|---|
| O Orientación | Contexto, Foco, Anchors, Régimen | Ninguno propio; habilita volver, cambiar Contexto (fuera de Orrery) | C-2, C-12, C-17, D-2 | Contexto [F~]: `bloom.confirmed-context/v1` existe (`installer/nucleus/internal/governance/authority_command.go`) y el puente `window.confirmedContext` también (`installer/conductor/workspace/core/preload_core.js:77`), pero no tiene consumidores en la UI (búsqueda `grep -rl confirmedContext webview/app/src` → sólo `webview/app/src/lib/confirmedContext.ts`). HUD [F~]: sólo botón "Volver" (`webview/app/src/lib/components/OrreryContainer.svelte:40`, numeración del componente). |
| E1 Entrar | Régimen Orrery | Entrar (acto de la persona) | C-17, D-2 | [F~] Entrada A (Sidebar) y B (ProjectsPanel) existen; B siempre degrada a A (`webview/app/src/lib/stores/regimeStore.ts:59-75`). Contenido siempre simulado (`regimeStore.ts:61`). |
| E2 Orientarse | Contexto, Foco inicial | Ninguno | C-2, C-12 | [F✗] Sin Contexto consumido; foco inicial = primer anchor simulado (`regimeStore.ts:45-47`). |
| E3 Explorar | Espacio, Navigation State; fenómeno *indicación* | Mover la atención por el Territorio | C-1, C-3, C-6, C-9 | [F~] Cámara orbital, zoom, desplazamiento (`installer/conductor/workspace/core/orrery/src/main.ts:327-373,400-409`). Sin indicación (`main.ts:331-347`: `pointermove` sólo orbita). Territorio simulado. |
| E4 Enfocar | Foco | Enfocar (acto liviano, reversible) | C-10 (Foco nunca se captura) | [F~] `select()` actualiza el inspector (`main.ts:279-292`); el Foco no se registra en ningún Navigation State; `recordVisited` no es invocado por `OrreryContainer.svelte`. |
| E5 Comprender | Superficie de Workspace Core | Abrir niveles de detalle; ir al lugar legítimo de cambio | C-1, C-2, C-13 | [F~] Inspector del prototipo con texto simulado; `MandateTab` real para Mandates (`webview/app/src/lib/components/MandateTab.svelte:71-96`). |
| E6 Anclar | Anchor | Anclar / desanclar (deliberado) | C-4, C-10, C-12, D-3.b | [F✗] No existe acto de anclar; `lastVisitedAnchor` confunde Foco con Anchor (F-7, `regimeStore.ts:31,67,73,85`). |
| E7 Capturar | Captura, LocationSnapshot | Capturar (deliberado) | C-9, C-10, C-11, C-12 | [F✗] Location `NOT_SUPPORTED` (Closure v1.1 §1); `fromLocationSnapshot` lanza (`installer/conductor/workspace/core/orrery/src/adapters/fromLocationSnapshot.ts:23-28`). |
| E8 Declarar | INDETERMINADO (EM-C04) | Declarar / descartar | C-11 (la declaración no entra a la Location), C-14 | [F✗] Sin Postulate ni PostulateProposal; ASM no registrado (`brain/core/intent_types.py:50-51` sólo ING/DIS). |
| E9 Decidir | Acto humano sobre Trabajo | confirm/reject dominios, approve, activate | C-13, C-14 | [F~] Sólo CLI (§7.2). |
| E10 Observar | Trabajo, Lente sobre Trabajo situado, Superficie | Abrir detalle; ninguno sobre la ejecución | C-2, C-6, C-17 | [F~] `GET /api/v1/mandates` (`src/api/routes/mandates.routes.ts:35`) + WS `mandate:*` (`webview/app/src/routes/+layout.svelte:87-92`), con eventos desalineados (EM-C03). Ledger `MOCK_FEED` (`webview/app/src/lib/stores/ledgerStore.ts:31,65`). |
| E11a Salir | Régimen | Salir | D-2 (conserva Navigation State) | [F~] "Volver" a Panel (`regimeStore.ts:78-80`). |
| E11b Reabrir Location | Proyección/Anotación sobre Territorio actual | Reabrir | C-8, C-11, D-3 §5 | [F✗] Sin Location ni resolver. |
| T1 Convocatoria | Atención | Ir (decisión de la persona) | C-17 | [F✗] Ningún sistema emite Atención clasificada (EM-C06). |
| T2 Percibir | Espacio + Anotaciones | — | C-2, C-6 | [F~] Sólo dato visual simulado con marca "ESQUICIO 01 · DATOS SIMULADOS" (`main.ts:60-64`). |

### 3.4 P-02 — Primera entrada: qué existe para percibir

Ver CT-01 (§11). Síntesis: por norma y código, tras un Genesis exitoso **debería** existir [NO OBSERVADO] un Contexto confirmado, un Project con binding, un Domain confirmado declarado por el Mandate y el Mandate Genesis situado sobre él con su resultado. **Físicamente legible por la UI hoy:** sólo el resumen del Mandate (`mandates.routes.ts:35-60`: `mandateId`, `mandateType`, `status`, `currentPhase`, `stateVersion`). Ni el Domain declarado, ni el contrato, ni el Contexto llegan a la UI.

### 3.5 P-03 — Orientación: Espacio vs Superficie

La persona necesita saber, en este orden: **(1) en qué Contexto está y con qué evidencia** (Organization + Project, estado del binding, momento de verificación); **(2) dónde está** (Foco actual y su cadena de ancestros); **(3) qué tiene anclado**; **(4) en qué Régimen está y cómo vuelve**; **(5) si algo la convoca** (T1).

- **Superficie/HUD** (no Espacio): (1), (3), (4), (5) y la cadena textual de (2). Son datos con Fuente y estado que requieren lenguaje (Vocab §2.8; D-2 "HUD de orientación existe siempre").
- **Espacio**: sólo (2) como posición relativa y contención. El Espacio nunca es la única vía para saber dónde se está (§4.6).
- **Autoridad**: la persona debe poder distinguir "verificado" de "no evaluable" en el Contexto (C-2, C-12). El contrato físico ya distingue estados (`webview/app/src/lib/confirmedContext.ts:1-15`: `verified|incomplete|stale|revoked|conflict|not_evaluable`), pero el camino de error está roto (EM-C02).

---

## 4. Eje A — Modelo de percepción espacial (P-04 a P-07)

### 4.1 Estatus de Hover → fenómeno "indicación" (P-04; DJ-5)

**Posición.** El hover es necesario **como fenómeno de experiencia** y **no** como término normativo. En este documento se lo llama *indicación* para independizarlo del puntero (incluye el equivalente de teclado o de cualquier otro dispositivo).

| Propiedad | Indicación (fenómeno) | Foco (término, Vocab §2.10) | Anchor (término, Vocab §2.11) |
|---|---|---|---|
| Qué es | Señalar provisoriamente una Entidad candidata, sin comprometer atención | Lo que la persona mira ahora | Punto deliberado desde el cual decide o actúa |
| Cambia la cámara | No | Sí ("determina hacia dónde va la cámara", Vocab §2.10) | No por sí mismo |
| Cambia el sujeto de la Superficie | No | Sí | No por sí mismo |
| Pertenece al Navigation State | **No** | Sí | Sí |
| Entra en una LocationSnapshot | Nunca | Nunca (C-10) | Sí |
| Lo produce | Movimiento del puntero o del cursor de teclado | Acto de la persona (liviano, reversible) | Acto deliberado (C-10) |
| Fuente / verdad | Ninguna: es estado efímero del cliente | La persona; cliente | Acto + verificación de existencia y pertenencia |

**Por qué no se lo trata como término.** (a) No ocupa ningún lugar en el principio fundacional ni en las cuatro cadenas de Vocab §4.1: no transporta información ni autoridad; (b) todo lo que puede mostrar ya está gobernado por C-1/C-2 (qué se muestra y con qué autoridad) y por C-9/C-10 (no navega ni ancla); (c) es intercambiable entre dispositivos y gestos, lo que lo ubica en la futura Interaction Grammar, no en la norma.

**Por qué sí es necesario como fenómeno.** En un Espacio con contención (Gene ⊂ Domain ⊂ Project) y oclusión, la persona necesita saber **qué Entidad respondería** antes de enfocar; si enfocar fuese el único modo de "preguntar", cada pregunta movería cámara y Superficie, rompiendo el ciclo libre E3–E5. La literatura de selección en entornos densos muestra que hacer explícito cuál es el único objetivo activo reduce error y tiempo (Bubble Cursor, Grossman & Balakrishnan 2005; depth ray y 3D bubble cursor, Vanacken et al. 2007 — Anexo A X1/X2).

**Riesgo terminológico registrado.** En WAI-ARIA, *focus* designa el puntero de navegación (≈ nuestra *indicación*) y *selection* lo elegido (≈ nuestro *Foco*). Toda referencia externa debe traducirse a Vocab v1.0; "focus" de ARIA **no** es Foco (Anexo A X2).

**Física.** [F✗] No hay indicación: `main.ts:331-347` sólo orbita en `pointermove`. PlayCanvas 2.22.1 permite implementarla físicamente (picker por buffer de IDs con consulta puntual o rectangular, `getSelectionAsync`; profundidad opcional con `getWorldPointAsync`; Anexo A X12).

### 4.2 Cadena corregida (P-07)

```text
percepción (T2) ─► indicación (efímera) ─► Foco (Navigation State) ─► Anchor (deliberado) ─► Captura (deliberada) ─► LocationSnapshot
                     ▲ opcional                ▲ también desde una Superficie (lista, jerarquía, búsqueda)
```

- La **indicación es opcional**: el Foco puede cambiar desde una Superficie sin pasar por el Espacio (§4.6).
- **Foco → Anchor nunca es automático** ni por permanencia, repetición o "último visitado" (C-10; F-7).
- **Anchor → Captura** es un acto distinto: se puede tener Anchors sin capturar (D-3 §3–§4).

### 4.3 Límites perceptibles, picking y desambiguación (P-05)

Principios (sin gestos concretos):

1. **Geometría de respuesta ≠ geometría visible.** La región que responde a la indicación de una Entidad es su propia morfología *menos* la de las Entidades contenidas visibles: un Domain responde en su región no ocupada por sus Genes; el Project, en la suya. Así, la Entidad indicada es siempre **la más específica bajo el punto**, y el contenedor sigue siendo alcanzable (en su borde, en su etiqueta o por ascenso explícito).
2. **Un solo candidato activo a la vez.** Cuando varias Entidades compiten (proximidad, solapamiento, oclusión parcial), la experiencia mantiene **exactamente una** indicada y permite **recorrer los candidatos** en orden estructural estable (contención primero, luego proximidad), nunca por relevancia (C-17). Base: Bubble Cursor (un único objetivo seleccionable) y refinamiento progresivo (Bacim 2015, Anexo A X1).
3. **Oclusión.** Una Entidad totalmente ocluida debe ser indicable por la vía de candidatos o desde la Superficie sincronizada; la experiencia no puede exigir mover la cámara para alcanzarla (Elmqvist & Tsigas 2008, X1).
4. **Qué parte responde.** Núcleo/envolvente propios (regla 1) y **etiqueta** (proxy de la Entidad). Una **Anotación** responde indicando **su Entidad de referencia** y revelando *qué* Lente la produjo; nunca es sujeto de Foco por sí misma (C-8).
5. **Sincronía con la jerarquía.** La Entidad indicada o enfocada en el Espacio se refleja en la jerarquía de la Superficie y viceversa (overview+detail; Cockburn, Karlson & Bederson 2008, X3).
6. **Lo que nunca responde como Entidad:** objetos de Trabajo, Postures, nodos Gravity sin Entidad, marcadores de simulación, campos visuales (C-4, C-6).
7. **Tolerancia y escala.** La precisión del picking debe ser suficiente para la Entidad más pequeña representable en la escala actual; si no lo es, la experiencia debe ofrecer el recorrido de candidatos (regla 2), no fallar en silencio.

**Física.** [F~] Picker de 512×512 sin profundidad (`main.ts:325`); se consulta sólo al soltar sin arrastre (`main.ts:348-361`) y se toma **el primer** `MeshInstance` mapeado sin desambiguación (`main.ts:356`). Los campos de Posture no son pickables porque no se registran con nodo (`main.ts:152,197`), pero las Postures sí existen como objetos del Espacio (F-5). La documentación primaria advierte que un buffer de baja resolución puede perder objetos pequeños (X12). Contención real no existe: el prototipo dibuja ítems planos con posiciones fijas (`installer/conductor/workspace/core/orrery/src/adapters/fromSimulatedData.ts:43-47`).

### 4.4 Información mínima durante la indicación (P-06)

**Se muestra** (y nada más):

| Elemento | Término | Fuente | Si no está disponible |
|---|---|---|---|
| Nombre visible | Entidad | Fuente del tipo (vía resolver de presentación) | "Sin nombre conocido" (nunca el id disfrazado de nombre) |
| Tipo | Entidad | Fuente del tipo | "tipo desconocido" |
| Marca de Procedencia | Procedencia (Vocab §3.5) | Territorio | `no verificable` |
| Estado de verificación | Procedencia + Contexto (C-12) | Contexto / Fuente | `no evaluable` |
| Marca de simulación | C-2 | Tree `simulated` | — (obligatoria si aplica) |
| Recuento de Anotaciones activas sobre la Entidad, por Lente | Anotación | Lentes activas | "desconocido" si alguna Lente no cubre la Entidad (§5.6) |

**No se muestra** en la indicación: contenido de la Entidad, explicación de Anotaciones, Postures, Masa, estado de Mandates, actos, historia. Todo eso convierte la indicación en Superficie y pertenece a E5 (P-12). La indicación **no ofrece actos** (ni siquiera anclar): anclar requiere Foco previo.

### 4.5 Transiciones y clasificación de estados (P-07)

**Indicación → Foco.** La causa es **un acto de la persona** (no permanencia del puntero ni temporizador): el Foco mueve cámara y cambia el sujeto de la Superficie, y C-17 prohíbe que lugar o modo cambien sin acto. La guía primaria de WAI-ARIA sostiene que la selección no debe seguir al foco cuando produce trabajo costoso o desorientador (X2). El Foco **no** es un acto deliberado en el sentido de C-10/C-14: no produce registro ni consecuencia.

**Foco → Anchor.** Acto deliberado, explícito, distinguible de enfocar, reversible hasta la Captura, permitido sólo sobre Entidades admisibles por el contrato de Location vigente y con Contexto confirmado (C-10, C-12, D-3 §3, D-3.b).

| Clase | Estados |
|---|---|
| **Puramente efímeros** (no sobreviven a un cambio de Régimen) | Indicación; conjunto de candidatos de desambiguación; posición del puntero; cámara, distancia, órbita; transiciones visuales; recuentos de densidad calculados para la vista. |
| **Navigation State** (sesión; se conserva al cambiar de Régimen, D-2) | Contexto (de su Fuente), Foco, Anchors, historia de focos (D-3 §2). |
| **Estado de vista del cliente** (no es Navigation State ni Fuente) | Lentes activas y su composición; Superficies abiertas/colapsadas; modo foco. Se conserva por conveniencia; no se captura ni se envía. |
| **Requieren acto deliberado** | Anclar, desanclar, Capturar, Declarar (indeterminado), Decidir (approve/activate/confirm/reject), descartar declaración. |
| **Jamás en una LocationSnapshot** | Foco; indicación; historia de focos; Lentes activas; Anotaciones; Trabajo (Mandate, Session, Action, Intent, resultados); Gravity (Postures, Masa, colisiones, nodos NUCLEUS/MANDATE/SESSION — F-1); Entidades D-3.b mientras v0.1 no las admita (`unsupported`); cámara, coordenadas, layout, `view_context`; la declaración y cualquier interpretación de propósito (C-11); contenido de Entidades y artefactos; Régimen y Superficies; dato visual o simulado; diagnósticos de resolución posteriores (C-11); `localLocation` (F-6); estados de Atención. |

### 4.6 Accesibilidad y acceso no espacial

1. **Toda Entidad alcanzable en el Espacio es alcanzable desde una Superficie** (jerarquía, lista o búsqueda) con el mismo resultado sobre el Navigation State. El Espacio nunca es la única vía (Assignment §5 A.9; D-2: "Las Superficies funcionan aunque el Espacio no esté disponible").
2. **Equivalente no puntero** para cada transición: mover la indicación, enfocar, anclar, desanclar, capturar, recorrer candidatos y salir.
3. **Foco visible siempre y Anchor perceptiblemente distinto del Foco** (traducción de WAI-ARIA: "el indicador de foco siempre visible" y "el estado seleccionado visualmente distinto del foco", X2).
4. **Ningún estado se codifica sólo con color** (C-8: "explicar la decisión pendiente sólo con el color del glifo" viola). La paleta vigente tiene un único acento de estado activo y un único color de error (`docs/PALETTE/# 🎨 Bloom Color Palette.md:89-125`), insuficientes para Procedencia y tri-estado; se requiere codificación redundante (forma, textura, texto).

**Física.** [F~] Existen dos vías no espaciales en el prototipo: etiquetas HTML como botones (`main.ts:215-223`) y un selector "Encontrar elemento…" (`main.ts:38,305-308`). No hay jerarquía sincronizada ni teclado para anclar (no existe anclar).

### 4.7 Anti-espectacularidad

Para datos abstractos y jerárquicos el 3D necesita justificación (Munzner, "No unjustified 3D": oclusión, distorsión de perspectiva, texto inclinado; X4), y la evidencia sobre memoria espacial no favorece al 3D (Cockburn & McKenzie 2002: "3D hinders retrieval", claro en interfaces físicas, no significativo en virtuales; X4). Consecuencia para el modelo (no decisión de forma, que es UX): **ningún fenómeno de este Experience Model puede ser perceptible sólo en 3D**; la contención y la extensión son lo único que el Espacio aporta de forma propia, y todo lo demás debe tener equivalente en Superficie.

---

## 5. Eje B — Modelo de experiencia de Lentes (P-08 a P-13)

### 5.1 Cadena y responsabilidades (B.4)

```text
Fuente (sistema dueño) ──► Proyección de lectura (organizada por Entidad; la produce el sistema dueño o su adaptador)
        ──► Lente (sólo lee) ──► Anotación (ref. a Entidad existente · clase de glifo · estado · marca de Procedencia) ──► Espacio
        └──────────────────────────────────────────────► Superficie (significado, explicación, actos)
```

- **Quién produce la Proyección:** el sistema dueño de la información (Nucleus/Temporal para Trabajo; Gravity para criterio y efectos; Authority para Contexto; el resolver de Location para reaperturas). Nunca la Lente ni el Espacio (C-7).
- **Qué hace la Lente:** filtra por Entidades presentes en el Territorio actual y traduce filas a Anotaciones. No agrega, no infiere, no persiste.
- **A qué refiere la Anotación:** a una Entidad existente en el Territorio actual (C-8). Si la Entidad no existe, la fila no se dibuja: se informa como referencia degradada en la Superficie (§7.5).

### 5.2 Lentes descritas por su Proyección (sin nombres; A-3)

Los identificadores `P-*` designan Proyecciones de lectura, no Lentes con nombre.

| Id | Proyección que se lee | Fenómeno que hace perceptible | Entidades a las que refiere | Productor esperado | Estado físico |
|---|---|---|---|---|---|
| P-W1 | Trabajo situado por Entidad (Mandates y su estado de ciclo de vida) | "Aquí ocurre trabajo y en qué estado está" | Domain declarado (contrato), Project | Nucleus (`mandate_state.json`, contrato firmado) | [F~] resumen sin Domain (`src/api/routes/mandates.routes.ts:35-60`); contrato sin lectura |
| P-W2 | Resultados de Trabajo por Entidad (`domain_definition.json`, digest, cumplimiento) | "Aquí hay un resultado producido por trabajo" | Domain | Nucleus/Brain | [F✗] sin lectura |
| P-W3 | Propuestas por Entidad (`DomainCandidate`, `semantic_candidate`) | "Aquí hay una propuesta, no un hecho" | Project; pares de Entidades existentes | Nucleus (humanSync); Brain/BISP | [F~] candidatos sólo por CLI (`installer/nucleus/internal/orchestration/commands/mandate_build_domains_cmd.go:85`); semantic sin productor conectado |
| P-G1 | Criterio declarado por nodo de spine, asociado a Entidades Organization/Project | "Aquí aplica criterio declarado en este nivel" | Organization, Project | Gravity (Nucleus) | [F✗] sin lectura de Postures (búsqueda en `installer/help/nucleus_help.json`: 0 comandos gravity/posture) |
| P-G2 | Efectos de Gravity sobre Trabajo situado, por Entidad (estado de colisión de 4 valores, rechazos, excepciones) | "El trabajo situado aquí tiene una colisión / fue rechazado / es indecidible / no fue evaluado" | Domain/Project donde se sitúa el Trabajo | Gravity + Impact | [F✗] ningún flujo (EM-C01, EM-C05) |
| P-A1 | Atención clasificada por Entidad | "Algo aquí requiere a una persona" | Entidad donde se sitúa el sujeto | Sistema responsable (workflow, Authority, Monitor) | [F✗] (EM-C06) |
| P-L1 | Resolución de una Location reabierta (8 estados por referencia) | "Esto cambió / desapareció / no se pudo verificar desde que se capturó" | Entidades actuales referidas por la captura | Resolver de Location | [F✗] |
| P-I1 | Assessments de Impact cuyo sujeto se sitúa | "Hay una evaluación sobre trabajo aquí: hallazgos, cobertura, indeterminación" | Entidad del sujeto | Impact | [F~] contrato existe (`installer/impact/internal/contracts/contract.go:40-75`), sin consumidor |

Información **sin** Lente (Vocab §2.7, condición de pertenencia): contabilidad de inteligencia (`installer/aitap/contracts/v2/inference-accounting-event.schema.json`), Ledger no situado, Actions/Intents (Vocab §4.2: "sin sentido espacial propio"). Sólo Superficies.

### 5.3 Activación, manifestación y retiro (P-08)

1. **Qué la activa:** un acto de la persona, o el Régimen/Superficie como **valor por defecto declarado y estable**. Nunca la actividad del sistema ni la llegada de Atención (C-17). La llegada de Atención se presenta como convocatoria (T1); activar la Lente correspondiente es decisión de la persona.
2. **Saber qué está activo:** existe siempre un **inventario perceptible de Lentes activas** en la orientación (capa O), cada una con su Proyección, su Fuente y la frescura de su lectura. Una Lente activa sin datos se ve como activa-sin-datos, no como inactiva.
3. **Retirar:** desactivar una Lente retira sólo sus Anotaciones; nada más cambia (C-8).
4. **Persistencia:** el conjunto de Lentes activas es estado de vista del cliente (§4.5); no entra al Navigation State, a una Location ni a ninguna Fuente.

### 5.4 Combinación y densidad (P-09)

1. **Se combinan.** No hay exclusión normativa entre Lentes.
2. **Identidad por Anotación.** Cada Anotación conserva perceptiblemente de qué Lente proviene; dos Lentes no comparten el mismo canal de codificación.
3. **Orden de composición determinista e independiente del contenido.** Sobre una misma Entidad, las Anotaciones se componen en un orden fijo por clase de Proyección, nunca por "importancia" calculada en el cliente (C-17).
4. **Densidad:** cuando la densidad excede lo legible, se **agrega por Entidad** (recuento por Lente) o por nivel de escala (zoom semántico, overview+detail; X3), y se dice cuánto se agregó. **Ocultar sin decirlo está prohibido**: lo oculto se confundiría con *ninguno* (C-2). Base: grado de interés de Furnas (importancia a priori menos distancia al foco) y su adaptación a grafos de van Ham & Perer (X3, X5), traducidos aquí como reglas de escala **estructurales** (profundidad en el Territorio, distancia al Foco), no de relevancia inferida.
5. **Desénfasis sí, eliminación no.** Una Lente puede atenuar visualmente lo que no anota, pero sólo con indicación explícita de que es una atenuación de vista ("foco no destructivo"; Research Resultados §2.3.3, histórico, traducido a C-8).

### 5.5 Invariancia (P-10) — hipótesis verificada

| Aspecto | ¿Cambia con una Lente? | Verificación |
|---|---|---|
| Identidad de Entidades | No | C-7, C-8 |
| Posición territorial y layout | No | Física: `layoutPositions(tree, hints)` recibe sólo árbol y hints de posición (`installer/conductor/workspace/core/orrery/src/layout.ts:18-24`); ninguna entrada de Lente. **Coincide.** |
| Estructura (contención, Relaciones) | No | C-3, C-7 |
| Visibilidad de Entidades | No (sólo desénfasis declarado) | §5.4.5 |
| Anotaciones | Sí | Vocab §3.2 |
| Objetos en el Espacio | Ninguno nuevo | **Contradicción física conocida:** el control "Campos de Gravity" del prototipo habilita/deshabilita *entidades* de Posture (`main.ts:319-322`, `243-245`), es decir, objetos propios en el Espacio. Es F-5; no es Lente en sentido normativo. |

### 5.6 Procedencia visible por Anotación; desconocido vs ninguno (P-11)

Cada Anotación lleva una **marca de Procedencia** perceptible y, en la Superficie, su explicación completa:

| Dato | Dónde | Fuente |
|---|---|---|
| Clase de Fuente (autoridad canónica, registro, copia, proyección, índice, cache, dato visual) | Marca en el Espacio + texto en Superficie | Vocab §2.5 (A-4: escala provisional) |
| Procedencia (verificado, declarado por un Mandate, propuesto, proyección, no verificable) | Ídem | Vocab §3.5 |
| Momento de observación / frescura | Superficie | Proyección |
| Cobertura de la Proyección | Inventario de Lentes + Superficie | Proyección (RI-P1) |

**Regla de cobertura (central).** En el Espacio, *no ver una Anotación* puede significar "evaluado y sin nada" o "no evaluado". Para no violar C-2, cada Proyección debe declarar **qué Entidades cubre** y la Lente debe hacer perceptible el estado **desconocido** para las no cubiertas (marca propia o declaración global "no evaluado aquí"). La forma física existe como precedente en Impact: `Coverage{Evaluated, Undetermined, Complete}` (`installer/impact/internal/contracts/contract.go:56-60`). Tres estados por Lente y por Entidad:

| Estado | Significado | Percepción mínima |
|---|---|---|
| **con filas** | La Proyección cubre la Entidad y tiene información | Anotación |
| **ninguno** | La Proyección cubre la Entidad y afirma que no hay nada | Sin Anotación, **sólo** si la Lente declara cobertura completa para esa zona |
| **desconocido** | La Proyección no cubre, no se evaluó o la Fuente no está disponible | Marca de "desconocido" o declaración global; nunca ausencia silenciosa |

**CT-12 (Fuente débil):** una Anotación de clase cache, índice o dato visual se marca como tal y nunca usa la codificación de autoridad canónica. A-4 queda abierto: sin Source Authority Profile V1 la escala es ordinal provisional (Vocab §2.5).

### 5.7 Espacio vs Superficie (P-12)

Regla operativa: **si para entenderlo hace falta una oración, va en la Superficie.** El Espacio aporta presencia, clase, estado y Procedencia en posición; la Superficie aporta significado, razones, listas, historia, versiones/digests y canales de acto. Precedentes: separación ambiental/intervención HUD–MFD (Research Resultados §2.1.4, histórico) y costos de superposición en HUD ("cognitive capture") que recomiendan no cargar el campo visual primario con información de intervención (Long 1994, X10).

### 5.8 Criterios verificables anti-segundo-modelo (P-13)

Una Lente (o cualquier capa de percepción) **no es admisible** si falla cualquiera de estos criterios:

| # | Criterio | Cómo se verifica |
|---|---|---|
| L1 | Toda Anotación refiere a un id de Entidad presente en el Territorio actual. | Rechazo de filas con id ausente; conteo de filas descartadas visible. |
| L2 | Ninguna Lente crea ids, Entidades ni Relaciones. | El Territorio con todas las Lentes activas y sin ninguna tiene el mismo conjunto de ids y Relaciones. |
| L3 | El layout no depende de Lentes. | `layout(T, lentes=∅) == layout(T, lentes=X)` para todo X. |
| L4 | Ninguna Anotación es navegable como Relación ni cuenta para vecindad, reachability o Captura. | Una Captura con y sin Lentes produce el mismo contenido. |
| L5 | Anotaciones entre dos Entidades (p. ej. `semantic_candidate`) sólo existen si ambos extremos existen, se marcan como propuesta y nunca se usan para navegar (Vocab §4.2; C-3). | Inspección de la Proyección. |
| L6 | Ninguna Lente persiste ni actúa como Fuente; lo que conserva es lectura revalidable. | No hay escritura; frescura visible. |
| L7 | Ninguna Lente oculta Entidades; el desénfasis está declarado. | Inventario de Entidades visible en Superficie idéntico con/sin Lentes. |
| L8 | Ninguna Lente ordena, prioriza o selecciona por relevancia inferida en el cliente. | El orden proviene de la Proyección o de un orden fijo por clase. |

Señales de alarma (P-13): una Lente que necesita "agregar un nodo para dibujar algo", que "agrupa" Entidades por similitud, que guarda historia de navegación, o cuya desactivación cambia la forma del Territorio, se está convirtiendo en un segundo modelo.

---

## 6. Eje C — Contrato de experiencia de Gravity (P-14 a P-17)

### 6.1 Premisas (no reabribles)

- Gravity no es Territorio; las Postures no son Entidades (C-4, C-15). Su estructura vive en nodos de spine NUCLEUS/ORGANIZATION/PROJECT/MANDATE/SESSION, nunca en Domain/Gene.
- Ruta constitucional: **Gravity → Proyección → Lente → Anotación → Entidad**, con Fuente, Procedencia y autoridad.
- Orrery **no** calcula Gravity, no decide colisiones, no inventa autoridad, no convierte Postures en objetos del Territorio, no usa similitud como confirmación, y **sí** puede hacer perceptibles efectos sobre Entidades respecto del Trabajo situado en ellas.
- Lectura subordinada del audit (DJ-4): la entidad vigente es `GravityPosture`; "Postulate" no existe como entidad persistente; GravityGraph, el índice Domain/Gene y el estado operacional de Genesis son tres estructuras distintas que "pueden proyectarse juntas en una UI, pero no deben presentarse como una única fuente de verdad" (`docs/ANALYSIS/GRAVITY/GRAFO/GravityGraph_Domains_Genes_Postures_Provenance_and_Persistence_Audit_v0_1.md:12,27,486-495`). Su afirmación "GravityGraph no contiene Domains ni Genes" quedó superada por la reapertura ratificada del Cierre de Boundary §6 (DOMAIN/GENE como nodos estructurales sin Postures); se usa sólo como evidencia de separación de planos.

### 6.2 Dónde se sitúa cada familia de colisión

| Familia (spec Colisiones §3) | Sujetos | Dónde puede situarse el efecto | Condición |
|---|---|---|---|
| Territorial (`MANDATE_TERRITORY_OVERLAP`) | Mandates activos | Entidades donde ambos Mandates están situados | `scope_paths` **no** es Territorio (D-T1): situar exige que la Fuente provea la correspondencia alcance→Entidad (RI-G10) |
| Jerárquica (`POSTURE_HIERARCHICAL_CONTRADICTION`) | Posture inferior vs heredada | Nodo de spine donde se intenta declarar; efecto sobre el Trabajo cuyo criterio se rechaza | Ocurre "antes de firmar" (spec §3.2): su lugar de experiencia es la Superficie de composición de criterio, no el Espacio |
| Horizontal (`POSTURE_HORIZONTAL_INCOMPATIBILITY`: threshold, priority cycle, escalation, cualitativa) | Postures de nodos distintos aplicables al mismo caso | Entidades donde se sitúa el Trabajo al que ambas aplican | La aplicabilidad es por tipo de trabajo (`appliesTo`), no territorial (C-15) |
| Precedencia interna (`POSTURE_INTERNAL_PRECEDENCE_CONFLICT`) | Expresiones `priority` | Nodo de spine que las declara | Invalidez del criterio, no del Trabajo |

### 6.3 Cuatro estados que la experiencia debe distinguir (P-15)

| Estado | Fuente del estado | Qué percibe la persona | Qué **no** puede pasar |
|---|---|---|---|
| **Ninguno** (`NO_COLLISION`) | Evaluación con cobertura que afirma compatibilidad | Ausencia de marca **dentro de una zona declarada como evaluada**; en Superficie, "evaluado: sin colisión" con fecha y alcance | Presentarse cuando no hubo evaluación |
| **Confirmada** (`CONFIRMED_COLLISION`) | Prueba estructurada o autoridad competente | Marca de colisión sobre la Entidad donde se sitúa el Trabajo afectado; en Superficie sujetos, contexto compartido y fundamento | Confirmarse por similitud (C-16) |
| **Indecidible** (`UNDECIDABLE_CANDIDATE`) | Evaluación que no puede probar ni refutar | Marca propia, distinta de confirmada y de desconocido; en Superficie "puede chocar; el sistema no puede decidirlo" y quién puede decidir | Presentarse como confirmada o como compatible |
| **Desconocido** (no evaluado, no evaluable, Fuente indisponible, cobertura parcial) | Ausencia de evaluación declarada por la Fuente, o falla de lectura | Marca o declaración global "no evaluado"; en Superficie la causa | Presentarse como ausencia (C-2, C-16: "la imposibilidad de evaluar nunca equivale a compatibilidad") |

Requisitos perceptivos: los cuatro deben distinguirse **sin depender del color** (§4.6.4); la incertidumbre de distinto tipo requiere significación visual distinta (MacEachren et al. 2012, X7). Por la regla de cobertura (§5.6), *ninguno* sólo es legítimo donde la Fuente declaró cobertura.

**Físico.** [F~] El único lugar que separa tres clases es `AnalyzeJoint` (`installer/nucleus/gravity/portable.go:76`; tipos `:37-45`): `Conflicts` (confirmadas: threshold y priority cycle), `Evaluated` (evaluadas sin conflicto para esa referencia) y `Undetermined` (requieren juicio, priority sin clase o unidades distintas; `:100-127`). Sus únicos llamadores están en Impact (`installer/impact/internal/evaluation/coexistence.go:24`, `preservation.go:43,87`), sin consumidor productivo. Los detectores internos sólo emiten confirmadas (`installer/nucleus/internal/gravity/priority_cycle_detector.go:47-60,84-95`; `threshold_unsatisfiable_detector.go:87-93,139`): **la ausencia de hallazgo no es `NO_COLLISION`** (EM-C05).

### 6.4 CT-02 — Recorrido completo (contrato de experiencia)

Escenario: la persona observa un Domain; hay Trabajo situado allí (un Mandate cuyo contrato declara ese Domain); Gravity determinó una colisión confirmada entre Postures relevantes para ese Trabajo.

| Paso | Percibe | Comprende | Puede hacer | Información necesaria (RI) | Invariantes | Existe hoy |
|---|---|---|---|---|---|---|
| **0 · No sabe** | Si la Fuente clasificó la colisión como Atención: una convocatoria en la capa O, sin movimiento de cámara ni Régimen. Si no: nada cambia por sí solo. Si la Lente P-G2 está activa: la marca sobre el Domain. | Que existe algo que lo convoca (si fue clasificado), no qué es | Decidir si va; activar P-G2 | RI-A1 (Atención clasificada), RI-G7 (estado por sujeto situado) | C-17, C-7 | [F✗] |
| **1 · Percibe** | Marca de colisión *confirmada* sobre el Domain, con marca de Procedencia "resolución de Gravity" | Que el **trabajo situado aquí** tiene una colisión confirmada (no que el Domain "tiene Gravity") | Indicar/enfocar el Domain | RI-G7, RI-W1 (Mandate situado en Domain) | C-2, C-8, C-15 | [F✗] |
| **2 · Identifica lo afectado** | En Superficie: el/los Mandates (y su fase), la Action/Intent afectada, y las demás Entidades donde el mismo Trabajo se sitúa | Qué trabajo está comprometido y dónde más se sitúa | Abrir el Mandate; enfocar otras Entidades afectadas | RI-G8 (sujetos y contexto compartido), RI-W1, RI-W3 | C-4, C-8 | [F✗] |
| **3 · Comprende las Postures** | En Superficie: cada Posture en lenguaje humano (texto declarado), su primitivo, aplicabilidad (`appliesTo`), y el **fundamento** de la colisión (p. ej. "intervalo vacío para la misma métrica y unidad", "ciclo de prioridad") | Por qué no pueden cumplirse a la vez | Ver la expresión literal bajo demanda | RI-G2 (Posture legible), RI-G9 (fundamento), RI-G3 (Masa explicada) | C-2, C-15, C-16 | [F~] fundamento existe en `AnalyzeJoint` (`portable.go:131-137`, `Basis`) sólo vía Impact; Posture sin lectura |
| **4 · Conoce el origen** | Para cada Posture: nodo de spine de origen (NUCLEUS/ORG/PROJECT/MANDATE/SESSION), `origin` (`nucleus|organization|project|mandate_own|mandate_inherited|session`), verificable, promovida desde, autoridad que la firmó y versión del nodo | Quién sostiene ese criterio y con qué autoridad | Enfocar la Entidad asociada al nodo (si es ORG/PROJECT); abrir la Superficie del nodo | RI-G1, RI-G4, RI-G5 | C-4, C-15 (nunca se ancla al Domain) | [F~] modelo existe (`installer/nucleus/internal/gravity/model.go:24-32,64-75`), sin lectura |
| **5 · Qué puede hacer** | En Superficie: la lista de caminos legítimos **que existen**, con su autoridad requerida, y los que **no existen** marcados como no disponibles | Que Orrery no resuelve: conduce al camino legítimo | Hoy: ninguno ejecutable desde Orrery. Previstos por el corpus (no físicos): pedir excepción, solicitar elevación, proponer cambio de Posture, rechazar/abandonar el Trabajo | RI-G11 (actos de Gravity y autoridad), RI-G12 | C-13, C-14, C-15 | [F✗] (0 comandos gravity en `nucleus_help.json`) |

**Lo que Orrery no hace en CT-02:** calcular la colisión o la Masa en el cliente; ordenar Postures por Masa; anclar la Posture al Domain; ofrecer "resolver" o "aprobar igual"; convertir la colisión en Relación o Entidad; mover a la persona al Domain cuando la colisión aparece.

**Veredicto físico CT-02:** no existe hoy ningún flujo que produzca una colisión confirmada observable sobre un Domain. Evidencia: (a) ningún workflow invoca Activities de Gravity (`installer/nucleus/internal/orchestration/temporal/workflows/mandate_execution_workflow.go:191,199` son las únicas `ExecuteActivity`; búsqueda `grep -rni "gravitymandatenode|gravitysession|resolveactivegravity|executiongravity" internal/orchestration/temporal/workflows` → sólo comentarios) (EM-C01); (b) el contrato firmado no lleva `GravityRef` (`installer/nucleus/internal/orchestration/commands/mandate_authority_cmd.go:440`); (c) `ResolveActive` exige SESSION (`installer/nucleus/internal/gravity/resolver.go:11-14,24-25,46-47`) y ninguna SESSION se crea; (d) los detectores no tienen consumidor en Nucleus; (e) no hay lectura de Gravity. El caso queda como **requisito** (DJ-2).

### 6.5 CT-03 — Indecidible

Igual que CT-02 hasta el paso 1, con marca **indecidible**. Paso 3: la Superficie dice qué no pudo decidirse y por qué (criterio cualitativo, `priority` sin clase de colisión, unidades no convertibles — causas físicas reales en `portable.go:100-127`). Paso 5: la única salida legítima es **una decisión humana autorizada** (spec Colisiones §4.2: "requiere decisión autorizada"); la experiencia muestra quién tiene esa autoridad y que hoy no existe el acto (RI-G11). **No** se presenta como confirmada ni como compatible (C-16). Física: [F~] `Undetermined` existe sólo dentro de `AnalyzeJoint`/Impact.

### 6.6 CT-04 — Ninguno vs desconocido

- **Ninguno:** requiere que Gravity declare que evaluó el Trabajo situado y no encontró colisión, con alcance (qué Postures, qué tipos de trabajo) y momento. Se percibe por ausencia de marca *en zona declarada evaluada*.
- **Desconocido:** es **el único estado verdadero hoy** para todo Mandate Genesis: su contrato no lleva Gravity (`mandate_authority_cmd.go:440`), no se resolvió ninguna Gravity activa (EM-C01) y no hay lectura. La experiencia correcta hoy es: "Gravity no fue evaluada para este trabajo" (con causa), nunca "sin conflictos". Mientras no exista lectura (RI-G6), ni siquiera ese estado llega a la UI: la Lente P-G2 debería declararse **activa sin Fuente disponible** (§5.3.2).
- El borrador UI/UX v0.1 proponía "Este Mandate se firmó sin criterio vinculado" (§13.1, histórico); es un hecho del contrato y es compatible con *desconocido* respecto de colisiones, no con *ninguno*.

### 6.7 CT-05 — Similitud aparente

Dos Postures "se parecen" o existe un `semantic_candidate` entre Entidades. **Nada se muestra como colisión ni como Relación.** Si una Fuente produce un candidato de colisión por similitud, su único estado admisible es *indecidible* (spec Colisiones §4.2 regla 1). Un `semantic_candidate` puede proyectarse sólo como propuesta (Vocab §4.2), con marca de Procedencia "propuesto", nunca navegable ni capturable (L4, L5). Física: [F✗] ningún productor conectado de `semantic_candidate`; el plano Semantics está separado por diseño (Cierre de Boundary §1).

### 6.8 Masa (P-17)

- **Dónde:** sólo en la Superficie, junto a cada Posture, como **explicación con desglose** de sus factores calculables (origen, verificable, promovida), nunca como número aislado (Paladin UX §4.3, histórico, compatible con C-15).
- **Qué no hace:** no ordena Postures en conflicto, no determina tamaño, posición, prominencia ni color de nada en el Espacio, no sugiere "la que gana" (C-15; spec Colisiones §2.2: "Masa explica peso; no decide compatibilidad").
- **Quién la calcula:** Nucleus (`installer/nucleus/internal/gravity/masa.go:4-18`, 1–3). El cliente no la recalcula (C-15: Orrery no calcula Gravity); la lee con sus factores (RI-G3).
- **Tensión registrada (no conflicto):** el Corolario dice que "la masa determina su influencia" (`docs/ANALYSIS/GRAVITY/MODELS/Corolario___La_persona_como_fuente_de_Gravity.md:23`); se lee por C-15: influencia ≠ decisión de conflicto.

### 6.9 P-16 — Información que Orrery necesita de Gravity

Ver RI-G1..RI-G14 en §12. Resumen de principio: **Orrery necesita resultados de Gravity ya resueltos y situables, con su cobertura y su fundamento; nunca entradas para calcularlos.**

---

## 7. Trabajo, actos y tiempo (P-18 a P-22)

### 7.1 P-18 — Trabajo situado sin volverlo Territorio

| Objeto de Trabajo | Cómo se percibe | Dónde se comprende | Situación (Vocab §3.8) | Estado físico |
|---|---|---|---|---|
| Mandate | Anotación (P-W1) sobre la Entidad que su contrato declara | Superficie del Mandate | `contract.domain` (`installer/nucleus/internal/orchestration/mandatecontract/contract.go:19-32`) | [F~] resumen legible; Domain/contrato no |
| Session | No se anota por sí misma (corrida de ejecución) | Dentro del Mandate | Hereda la del Mandate | [F✗] no se crea (EM-C01) |
| Action / Intent | No se anota (Vocab §4.2) | Dentro del Mandate | — | [F~] una Action `run_intent gen` (`mandate_authority_cmd.go:440`; `contract.go:99` "exactly one bound gen Action") |
| Resultado (`domain_definition.json`) | Anotación de presencia (P-W2) | Superficie del Domain y del Mandate | Domain del contrato | [F~] producido (`brain/core/intent/gen_domain.py`), sin lectura |
| Postulate | **Indeterminado** (EM-C04) | — | "en sus Anchors" (Vocab §4.2) si se define | [F✗] |
| `DomainCandidate` | Anotación de propuesta sobre el Project (P-W3) | Superficie del Mandate | Project | [F~] CLI |

Regla: el Trabajo nunca aparece como objeto del Espacio, nunca es anclable (CT-08) y nunca define vecindad (C-4).

### 7.2 P-19 — Declarar y decidir: actos que existen

| Acto | Existe físicamente | Atado a | Fuente de autoridad | Desde dónde debería ser accesible | Desde dónde nunca |
|---|---|---|---|---|---|
| Confirmar / rechazar dominio candidato | [F✓] CLI `nucleus mandate build domains confirm|reject` (`mandate_build_domains_cmd.go:117,262`), sólo en fase `validate` (`:132-133`), señal `mandate:build:validate` (`:230`) | Mandate + ids de candidatos | Nucleus/workflow | Superficie cuyo sujeto es el Mandate en espera de validación | Espacio; indicación; Anotación |
| Aprobar contrato | [F✓] CLI `approve` (`mandate_authority_cmd.go:35-71`) | **Digest del contrato confirmado** (`:133-160`) + atestación de Authority (`:247-297`), permiso `mandate.sign` (`:251`) | Authority | Superficie que muestra el digest exacto y abre el paso por Authority | Espacio; cliente que marque aprobado (C-13) |
| Activar | [F✓] CLI `activate` (`:162-175`) | Digest + recibo de aprobación verificado; permiso `mandate.install` (`:253`) | Authority | Ídem | Ídem |
| Pausar / reanudar / cancelar | [F✗] (búsqueda en `nucleus_help.json`: 0 `pause`/`resume`) | — | — | Mostrado como "no disponible" | — |
| Anclar / capturar | [F✗] | Entidad admisible / Contexto | Productor de Location (A1) | Espacio y Superficie (ambas vías) | — |
| Declarar | [F✗] **Indeterminado** (EM-C04) | Anchors + declaración | Proceso soberano posterior (FOLLOWUP §4) | — | — |

**C-13/C-14 en la experiencia.** La Superficie muestra el objeto exacto (versión/digest) y canaliza el acto; nunca firma. El flujo físico (consentimiento en la URL de Authority y atestación pegada) es la única vía hoy; la Superficie de Orrery sólo podría **abrir** ese paso y **verificar el resultado** por relectura (V-11).

### 7.3 P-20 — Observar

| Qué | Fuente | Autoridad | Estado físico |
|---|---|---|---|
| Estado del Mandate (status, fase, versión) | Nucleus (`mandate_state.json`) vía Control Plane | Registro | [F~] `GET /api/v1/mandates` (`mandates.routes.ts:35-60`) + `mandateStore.hydrateFromList` (`webview/app/src/lib/stores/mandateStore.ts:144-166`) |
| Eventos de ciclo de vida | Nucleus/Temporal vía WS `:4124` | Notificación (no Fuente) | [F~] desalineados (EM-C03) |
| Resultado de ejecución y cumplimiento | Nucleus | Registro | [F✗] sin lectura de detalle |
| Ledger | Fuente/Proyección de eventos (Vocab §4.2) | — | [F✗] `MOCK_FEED` |
| Monitor | Monitor | Señales | [F✗] |
| Impact | Impact | Evidencia (nunca permiso) | [F~] sin consumidor |
| Contabilidad de inteligencia | AITAP | Evidencia operativa | [F✓] en Superficie (`IntelligenceSupplyView`, borrador UI §2.1), sin Lente |
| Estados de ejecución pausada/reanudada/cancelada | Executor | Contrato staging | [F~] schema (`installer/execution/contracts/v1/execution-event.schema.json`), sin runtime |

Principio: observar distingue **confirmación inmediata de recepción** de un acto y **efecto completo rastreable** (Research Resultados §2.6.1, histórico, traducido): lo primero lo da la Fuente del acto; lo segundo, la relectura del estado. Una notificación nunca reemplaza la relectura (C-13).

### 7.4 P-21 — Atender sin que Orrery decida

1. **Origen:** la Atención existe sólo si el sistema responsable la **clasifica y expone** (Vocab §3.7). Ejemplo normativo: "el workflow del Mandate espera la señal de aprobación; ese estado, expuesto por su fuente, es Atención".
2. **Presentación:** convocatoria persistente en la capa O y en la Superficie correspondiente, con su sujeto, la Entidad donde se sitúa (si la hay) y el acto que se espera; opcionalmente Anotación (P-A1) si la Lente está activa.
3. **Nunca:** mover cámara, cambiar Régimen, cambiar Foco, abrir Superficies, reordenar por heurística del cliente (C-17).
4. **Orden y ritmo:** el de la Fuente. La persona decide cuándo atender (coordinación negociada; McFarlane 2002 encontró la negociación como mejor solución global salvo cuando la prontitud es crítica, X11).
5. **Física y conflicto.** [F✗] Ningún sistema emite Atención clasificada. El estado de espera existe implícitamente (`currentPhase = validate`, firma pendiente: `installer/nucleus/internal/orchestration/temporal/workflows/mandate_build_workflow.go:222,280,289`), pero **no existe un campo que diga "espera el acto X de una persona"**; derivarlo en el cliente desde el nombre de fase sería interpretación (C-17). EM-C06 / RI-A1.

### 7.5 P-22 — Retornar

**E11a · Salir del Régimen Orrery.** Conserva el Navigation State (D-2). Al volver al Régimen Panel la persona reencuentra el panel de origen y el **foco de origen** (Gateway v0.1 §5.2 reinterpretado por D-3: `origin_anchor_ref` es foco de origen, no Anchor). Si hubo Captura durante la visita, se señala su existencia (Gateway §5.3).

**E11b · Reabrir una Location (CT-10).** La reapertura no reemplaza el Territorio (D-3 §5): se dibuja el Territorio actual y, mediante la Proyección P-L1, cada referencia de la captura con su estado (`resolved`, `changed`, `stale`, `missing`, `unauthorized`, `ambiguous`, `unsupported`, `unverifiable`; LocationSnapshot §D).
- Entidad **cambiada**: Anotación `changed` sobre la Entidad actual; la Superficie muestra revisión capturada y actual (C-11).
- Entidad **desaparecida**: no hay Entidad a la cual anotar (C-8). La referencia degradada se informa en la Superficie de la Location; **propuesta del modelo** (compatible con C-8 porque refiere a una Entidad existente): el ancestro existente más cercano capturado puede llevar una Anotación "contiene una referencia `missing` de la Location X", con Procedencia "resolución de Location".
- `unverifiable` y `unsupported` nunca se presentan como `missing` (Closure v1.1 §8).
- La Location reabierta **no** restaura Anchors automáticamente ni crea Navigation State nuevo: anclar de nuevo es un acto (C-10).

Física: [F✗] sin Location, sin resolver, sin reapertura.

---

## 8. Condiciones de borde (P-23, P-24)

### 8.1 P-23 — Contexto no confirmado (CT-15)

| Qué | Con Contexto confirmado | Sin Contexto confirmado (C-12) |
|---|---|---|
| Existencia de objetos | Se muestran | **Se siguen mostrando**: C-12 no condiciona existencia |
| Territorio como verificado | Sí, con su Procedencia | **No**: Entidades marcadas "no verificable en este Contexto" |
| Anclar, Capturar | Permitidos sobre Entidades admisibles | **Bloqueados**, con causa visible |
| Canalizar actos (approve, activate…) | Permitidos | **Bloqueados**, con causa visible |
| Orientación | Contexto con estado y momento | El HUD dice qué falta (binding vencido, identidad no evaluable…) y no fabrica Contexto |
| Lentes | Normales | Normales, con Procedencia; nada se presenta como verificado |

**Física y conflicto.** El contrato del Contexto distingue estados (`webview/app/src/lib/confirmedContext.ts:1-14`), pero cuando la lectura falla, el handler devuelve una respuesta sin `projectIdContinuity` (`installer/conductor/workspace/core/ipc/confirmed-context-handlers.js:24-31`) y el cliente la rechaza por incompleta (`confirmedContext.ts:21`, error `confirmed_context_incomplete_response`). Resultado: el caso "no confirmado" no llega a la UI como estado sino como excepción (EM-C02). A-2 sigue abierto: no se afirma equivalencia con el "Context" de los tres estados cognitivos.

### 8.2 P-24 — Escalabilidad (ver CT-16 en §11)

---

## 9. Relación con decisiones históricas

Las decisiones V-1..V-16 se usaron sólo a través de su clasificación en la Constitución §3. Ninguna se reabrió.

---

## 10. Matriz fenómeno → término → acto (§11.5 del Assignment)

Cada elemento perceptible propuesto en este modelo. "Acto" = acto humano que habilita (— si sólo informa).

| # | Fenómeno perceptible | Término / fenómeno válido | Dónde | Acto que habilita | Invariantes | Físico |
|---|---|---|---|---|---|---|
| M1 | Contexto con estado y momento de verificación | Contexto | Capa O | Decidir si continuar; ir a resolverlo fuera de Orrery | C-2, C-12 | [F~] |
| M2 | Ubicación actual (cadena de ancestros del Foco) | Foco, Territorio | Capa O + Espacio | Ascender/enfocar ancestros | C-1, C-3 | [F✗] |
| M3 | Anchors actuales | Anchor | Capa O + Espacio | Desanclar; Capturar | C-10 | [F✗] |
| M4 | Régimen y retorno | Régimen | Capa O | Salir (E11a) | D-2 | [F~] |
| M5 | Inventario de Lentes activas con Fuente y frescura | Lente, Proyección | Capa O | Activar/desactivar Lentes | C-7, C-17 | [F✗] |
| M6 | Convocatoria de Atención | Atención | Capa O / Superficie | Ir (decisión de la persona) | C-17 | [F✗] |
| M7 | Entidad con morfología, extensión y contención | Entidad, Espacio | Espacio | Indicar, enfocar | C-1, C-3, C-6 | [F~] simulado |
| M8 | Relación existente | Relación | Espacio | Navegar por estructura | C-3 | [F✗] (sólo simuladas) |
| M9 | Marca de Procedencia de una Entidad (verificado / declarado por Mandate / propuesto / proyección / no verificable / simulado) | Procedencia, Fuente | Espacio + Superficie | — | C-2, D-3.b | [F~] sólo marca de simulación |
| M10 | Indicación (una Entidad candidata) | Fenómeno sin estatus normativo (DJ-5) | Espacio | Enfocar | C-9, C-17 | [F✗] |
| M11 | Conjunto de candidatos de desambiguación | Fenómeno | Espacio + Superficie | Recorrer candidatos; enfocar | C-17 (orden estructural) | [F✗] |
| M12 | Foco visible | Foco | Espacio + Superficie | Comprender (E5); anclar | C-10 | [F~] selección del prototipo |
| M13 | Anchor visible, distinto del Foco | Anchor | Espacio + Superficie | Desanclar; Capturar | C-10, C-12 | [F✗] |
| M14 | Resultado de Captura (Location producida) | Captura, LocationSnapshot | Superficie | Declarar (indeterminado); reabrir | C-9, C-11 | [F✗] |
| M15 | Anotación de Trabajo situado (P-W1) | Anotación, Situar, Trabajo | Espacio | Enfocar Entidad; abrir el Mandate | C-4, C-6, C-8 | [F✗] |
| M16 | Anotación de resultado (P-W2) | Anotación, Trabajo | Espacio | Abrir resultado | C-2 | [F✗] |
| M17 | Anotación de propuesta (P-W3) | Anotación, Procedencia "propuesto" | Espacio | Abrir el Mandate en validación | C-2, C-3 | [F✗] |
| M18 | Anotación de criterio por nivel (P-G1) sobre Organization/Project | Anotación, criterio Gravity | Espacio | Abrir Superficie del nodo de origen | C-15 | [F✗] |
| M19 | Estado de colisión de 4 valores sobre Trabajo situado (P-G2) | Anotación, efecto de Gravity | Espacio | Abrir explicación (CT-02 pasos 2–5) | C-2, C-15, C-16 | [F✗] |
| M20 | Marca "desconocido / no evaluado" por Lente | Procedencia, cobertura | Espacio + Capa O | Abrir causa | C-2 | [F✗] |
| M21 | Recuento agregado por densidad ("N más") | Anotación agregada | Espacio | Acercarse; abrir lista | C-2 | [F✗] |
| M22 | Anotación de Atención (P-A1) | Atención, Anotación | Espacio | Ir | C-17 | [F✗] |
| M23 | Anotación de resolución de Location (P-L1) | Anotación, Location | Espacio + Superficie | Re-anclar; nueva Captura | C-8, C-11 | [F✗] |
| M24 | Anotación de evidencia de Impact (P-I1) | Anotación, Trabajo/criterio | Espacio | Abrir assessment | C-2 | [F✗] |
| M25 | Superficie del Mandate: contrato, digest, fase, acto esperado | Superficie, Trabajo | Superficie | confirm/reject, approve, activate (canalizados) | C-13, C-14 | [F~] MandateTab sin digest ni actos |
| M26 | Superficie de Posture: texto, primitivo, aplicabilidad, origen, autoridad | Superficie, criterio Gravity | Superficie | Ir al nodo de origen; caminos legítimos de cambio | C-15 | [F✗] |
| M27 | Masa con desglose | Superficie, Masa | Superficie | — (explicación) | C-15 | [F✗] |
| M28 | Fundamento de colisión | Superficie, colisión | Superficie | Ver literal | C-16 | [F✗] |
| M29 | Caminos legítimos disponibles / no disponibles | Superficie | Superficie | El acto disponible, si existe | C-13, C-14, C-15 | [F✗] |
| M30 | Estado del binding/Contexto degradado y causa | Contexto | Capa O | Ir a resolver fuera de Orrery | C-12 | [F✗] (EM-C02) |
| M31 | Marca de simulación | Procedencia "dato visual" | Capa O + Espacio | — | C-2 | [F✓] `main.ts:60-64` |
| M32 | Contabilidad de inteligencia | Superficie (sin Lente) | Superficie | — | C-7 (sin Lente) | [F✓] `IntelligenceSupplyView.svelte` |
| M33 | Confirmación inmediata de recepción de un acto + estado releído | Superficie | Superficie | — | C-13 | [F~] |
| M34 | Indicador de Captura realizada al salir | Captura | Régimen Panel | Abrir la captura | C-11 | [F✗] |

No quedan elementos perceptibles sin término o fenómeno ni sin acto o función informativa declarada.

---

## 11. Recorrido de casos CT-01 a CT-16

Formato por caso: **Percibe · Comprende · Puede hacer · Invariantes · Información · Existe físicamente · Veredicto.**

### CT-01 · Primera entrada post-Genesis (DJ-1)

**Qué debería existir tras un Genesis exitoso [NO OBSERVADO], derivado de norma y código:**

| Elemento | Debería existir porque | Clase de Fuente / Procedencia | ¿Legible hoy por la UI? |
|---|---|---|---|
| Identidad, Tenant, Organization, Project con binding | Onboarding `backend_identity_check` → … → `project_select` (`installer/native/config/onboarding/onboarding_steps.json`); `bloom.confirmed-context/v1` | Autoridad canónica / verificado | [F~] puente existe, sin consumidor; error roto (EM-C02) |
| Mandate Genesis creado | `genesisLaunch.ts:89-111` → `POST /api/v1/mandates` | Registro | [F✓] en lista (`GET /mandates`) |
| Fases ingest → cluster → validate → signed → completed | `mandate_build_workflow.go:112` | Registro | [F~] `currentPhase` en resumen |
| Un Domain confirmado `{id, name}` | `buildConfirmedContract` exige exactamente uno (`mandate_authority_cmd.go:394,440`) | Registro (contrato firmado) → Entidad con Procedencia **declarada por un Mandate** (D-3.b) | [F✗] sin lectura de contrato |
| Inputs congelados con hash | `mandate_authority_cmd.go:419-438` | Registro | [F✗] |
| `domain_definition.json` (purpose, boundaries, concepts, decisions, sources) | Action `run_intent gen` (`mandate_authority_cmd.go:440`), `MandateGenActivity` (`mandate_execution_workflow.go:191`) | Resultado de Trabajo; `decisions` = propuestas del modelo (C-2) | [F✗] |
| Recibos de aprobación y activación con digest | `mandate_authority_cmd.go:287-297` | Registro firmado | [F✗] |
| Contabilidad de inferencia | AITAP v2 | Evidencia operativa | [F✓] Superficie |
| Domain canónico, Genes, `DOMAIN_GENE` | Sin productor conectado | — | [F✗] **no existirán** |
| Nodos Gravity MANDATE/SESSION por ejecución; Gravity resuelta | **Ya no se invoca** (EM-C01) | — | [F✗] **no existirán** |
| Postures vinculadas al contrato | `GravityRef` no asignado | — | [F✗] **no existirán** → estado *desconocido* |
| Location | `NOT_SUPPORTED` | — | [F✗] |

**Recorrido de los primeros minutos (modelo):**

| Momento | Percibe | Comprende | Puede hacer |
|---|---|---|---|
| Entrar (E1) | El Régimen Orrery; capa O con Contexto | Dónde está y con qué evidencia | Salir |
| Orientarse (E2) | Foco inicial en el Project del Contexto; ancestros Organization/Tenant | Que el Project está vinculado (verificado) | — |
| Percibir (T2) | Project como región; **un Domain con marca "declarado por un Mandate"**; ningún Gene; Anotación P-W1 del Mandate Genesis (completado) sobre el Domain; Anotación P-W2 de resultado; P-G2 en estado **desconocido** | Qué sabe Cognituum del proyecto, qué hizo el Genesis, y que el criterio no fue evaluado | Activar/desactivar Lentes |
| Explorar / enfocar / comprender (E3–E5) | Indicación y Foco sobre el Domain; Superficie con la definición (propósito, límites, conceptos, decisiones propuestas, fuentes) y el Mandate de origen | Que el Domain es identidad declarada, no canónica; que sus "decisiones" son propuestas del modelo | Abrir el Mandate y su contrato |
| Anclar (E6) | El Project es anclable; el Domain D-3.b **no** es anclable en v0.1 (se informa `unsupported`) | Por qué no puede anclar el Domain | Anclar el Project |
| Capturar (E7) | Captura con Anchor = Project, ancestros comprobados, sin Relaciones (listas vacías válidas, LocationSnapshot §G) | Qué quedó capturado y qué no | Capturar |

**Invariantes ejercitadas:** C-3 (el Domain sólo con su Procedencia), C-6, C-9, C-10, C-12, D-3, D-3.b.
**Información:** RI-C1, RI-C2, RI-T1, RI-T2, RI-W1, RI-W2, RI-W4, RI-G6, RI-L1.
**Existe físicamente:** el recorrido completo no; legible hoy sólo el resumen del Mandate en una lista. Location y anclar no existen.
**Veredicto:** **norma sin implementación**. El modelo es coherente con la norma; validación con datos genuinos diferida al E2E (DJ-1). La propuesta del borrador UI §14.2 ("tarjeta lo que Cognituum sabe") es compatible si se reexpresa por Lentes y Superficies y se elimina la afirmación implícita de "Nada necesita tu decisión" cuando no hay Fuente de Atención (sería *ninguno* sin cobertura: C-2).

### CT-02 · Colisión confirmada sobre un Domain con Trabajo situado
Ver §6.4. **Veredicto:** norma sin implementación; requisito RI-G1..RI-G14. Invariantes C-2, C-4, C-7, C-8, C-14, C-15, C-16, C-17 respetadas en el contrato.

### CT-03 · Colisión indecidible
Ver §6.5. **Veredicto:** norma sin implementación; primitiva física parcial (`Undetermined` en `AnalyzeJoint`) sólo vía Impact.

### CT-04 · Sin colisión vs no evaluado
Ver §6.6. **Veredicto:** hoy el único estado verdadero es *desconocido*, y no llega a la UI. La experiencia no puede mostrar *ninguno* sin cobertura declarada.

### CT-05 · Similitud aparente
Ver §6.7. **Veredicto:** coincide con la norma por omisión (no hay productor); el modelo fija la regla para cuando exista.

### CT-06 · Entidades contenidas y solapadas
- **Percibe:** Gene dentro de Domain dentro de Project, con oclusión parcial.
- **Comprende:** cuál responde: la más específica bajo el punto (§4.3.1); si hay competencia, un candidato a la vez y recorrido estructural.
- **Puede hacer:** recorrer candidatos, ascender al contenedor, enfocar desde la jerarquía sincronizada.
- **Invariantes:** C-1, C-3; Gene v3.0 §7.8 (Gene como Entidad, relaciones como enlaces).
- **Información:** RI-T3 (contención/Relaciones con identidad), RI-T4.
- **Físico:** [F✗] sin contención real (posiciones fijas planas), picking del primer hit (`main.ts:356`), sin Genes reales (`internal/gene` sin importador externo).
- **Veredicto:** norma sin implementación; prototipo contradice el principio de desambiguación (no norma).

### CT-07 · Foco que intenta persistirse
- **Percibe/Comprende:** al cerrar Orrery y volver en la misma sesión, el Navigation State (Contexto, Foco, Anchors, historia de focos) se conserva (D-2); al terminar la sesión, el Foco se pierde; ninguna Location contiene el Foco.
- **Puede hacer:** anclar explícitamente si quiere conservar un punto de decisión.
- **Invariantes:** C-9, C-10.
- **Físico:** `regimeStore.lastVisitedAnchor` guarda lo último visitado como "anchor" y lo usa como foco inicial (`regimeStore.ts:31,67,73,85`) — F-7. Contrastado: la intención (restituir foco) es compatible si se renombra a foco de origen/historia; llamarlo Anchor viola C-10.
- **Veredicto:** implementación contradice norma (F-7, existente).

### CT-08 · Intento de anclar Trabajo
- **Percibe:** el Mandate aparece sólo como Anotación; no hay Entidad Mandate que enfocar ni anclar.
- **Comprende:** que el Mandate se sitúa sobre el Domain; anclar se ofrece sólo sobre Entidades admisibles.
- **Puede hacer:** anclar el Project (o Entidades admisibles); abrir el Mandate en su Superficie.
- **Invariantes:** C-4, C-10, D-3.
- **Físico:** el schema candidato admite MANDATE/SESSION/NUCLEUS (F-1; `Orrery_LocationSnapshot_v0.md` §E `nodeType`); `OrreryNodeType` del cliente también (`installer/conductor/workspace/core/orrery/src/locationTree.ts:25-33`). La Investigación de Integración v0.3 §2.3 lo presentaba como admisible (histórico; reemplazado por C-4).
- **Veredicto:** la experiencia no ofrece el acto; conflicto contractual F-1 existente.

### CT-09 · Domain D-3.b
- **Percibe:** el Domain con marca "declarado por un Mandate", distinta de "verificado/canónico".
- **Comprende:** que su Fuente es el contrato firmado y el acto humano de confirmación; que no es canónico.
- **Puede hacer:** enfocar, comprender, abrir el Mandate de origen; **no** anclarlo en v0.1 (se informa `unsupported`).
- **Invariantes:** C-2, C-3, C-4, D-3.b.
- **Información:** RI-T2.
- **Físico:** [F✗] contrato con `domain` existe (`contract.go:19-32`) pero sin lectura.
- **Veredicto:** norma sin implementación.

### CT-10 · Retorno a Location alterada
Ver §7.5. **Veredicto:** norma sin implementación (Location `NOT_SUPPORTED`).

### CT-11 · Saturación de Lentes
- **Percibe:** varias Lentes activas sobre la misma zona; Anotaciones compuestas en orden fijo; agregados "N más" cuando excede la densidad; inventario de Lentes en la capa O.
- **Comprende:** de qué Lente viene cada Anotación y qué se agregó.
- **Puede hacer:** desactivar Lentes, acercarse, abrir lista en Superficie.
- **Invariantes:** C-2, C-6, C-7, C-8, C-17; L1–L8.
- **Físico:** [F✗] no existen Lentes; el control "Campos de Gravity" del prototipo togglea objetos (F-5).
- **Veredicto:** norma sin implementación.

### CT-12 · Anotación de Fuente débil
Ver §5.6. **Veredicto:** norma sin implementación; A-4 limita la precisión (escala provisional de siete clases).

### CT-13 · Actividad en curso en otro lugar
- **Percibe:** si la Fuente clasifica Atención, una convocatoria en la capa O; si la Lente P-W1 está activa, el cambio de estado sobre el otro Domain; nada se mueve.
- **Comprende:** qué trabajo avanzó y dónde.
- **Puede hacer:** ir (acto propio) o ignorar.
- **Invariantes:** C-17, D-2 ("Ninguna actividad del sistema cambia el Régimen ni el foco por sí sola").
- **Información:** RI-A1, RI-W3 (eventos con secuencia y recuperación).
- **Físico:** [F~] WS `mandate:*` existe; eventos desalineados (EM-C03); sin señales de Monitor; sin contrato de eventos recuperables (FOLLOWUP §5, fila MONITOR).
- **Veredicto:** norma sin implementación.

### CT-14 · Decidir sobre una versión exacta
- **Percibe:** en la Superficie del Mandate, el contrato exacto y su digest; el acto canalizado a Authority.
- **Comprende:** que aprueba *esa* versión.
- **Si el digest cambió entre percepción y acto:** el acto debe rechazarse por la autoridad, y la Superficie debe mostrar que lo visto ya no es lo vigente, pedir releer y volver a decidir. Nunca "aprobar la nueva versión" implícitamente (C-13, C-14).
- **Físico:** [F✓] la aprobación se calcula sobre el contrato confirmado y su digest (`mandate_authority_cmd.go:133-160`); la activación verifica el recibo de aprobación contra el digest (`:162-175`); el workflow verifica `ExpectedDigest` (`mandate_build_workflow.go:280-291`). [F✗] No existe Superficie que muestre el digest ni canal desde Core.
- **Veredicto:** coincide en la autoridad; norma sin implementación en la experiencia.

### CT-15 · Contexto no confirmado
Ver §8.1. **Veredicto:** implementación interna inconsistente (EM-C02); norma sin implementación en la UI.

### CT-16 · Bloomaut (escenario secundario, recorrido después de CT-01..CT-15)
- **Nuevo Territorio:** otro Project (o el mismo Organization con un Project nuevo) → mismas Entidades y Procedencias; el modelo no cambia.
- **Varios Domains:** hoy un Mandate admite **exactamente un** Domain (`contract.go:99`; `mandate_authority_cmd.go:394`). Con un Mandate por Domain, el modelo escala: varias Anotaciones P-W1, varios Domains D-3.b. Un contrato multi-dominio tampoco cambia el modelo (situar en varias Entidades ya está previsto).
- **Conocimiento existente (`AGENTS.md`, specs, reglas):** su reconocimiento como **propuestas de criterio** entra por P-W3/P-G1 como "propuesto", y su adopción es acto humano (C-14). El modelo no requiere reescritura; requiere RI-G13 (criterio propuesto con Procedencia de origen).
- **Densidad:** cientos de ejecuciones (snapshot de entrevistas §14: "Orrery fracasa si convierte cada una en una cosa más que mirar") → agregación por Entidad (§5.4), Atención por excepción (T1), ningún objeto de Trabajo en el Espacio (C-6).
- **Partes que no escalan sin trabajo adicional:** (a) la regla de cobertura (§5.6) exige que cada Proyección declare cobertura a escala; (b) la desambiguación (§4.3) con cientos de Genes exige zoom semántico estructural (X3); (c) Repository (Project→Repository 0..N) no tiene representación física (Vocab §2.3).
- **Veredicto:** el modelo de CT-01 escala sin reescritura; los límites son de información (RI), no de modelo.

### Resumen de veredictos

| Caso | Veredicto |
|---|---|
| CT-01 | Norma sin implementación; [NO OBSERVADO]; validación diferida al E2E |
| CT-02 | Norma sin implementación; requisito hacia Gravity (EM-C01, EM-C05) |
| CT-03 | Norma sin implementación; primitiva parcial vía Impact |
| CT-04 | Hoy sólo *desconocido* es verdadero, y no llega a la UI |
| CT-05 | Coincide por omisión |
| CT-06 | Norma sin implementación; prototipo sin desambiguación |
| CT-07 | Implementación contradice norma (F-7) |
| CT-08 | Contrato contradice norma (F-1); la experiencia no ofrece el acto |
| CT-09 | Norma sin implementación |
| CT-10 | Norma sin implementación |
| CT-11 | Norma sin implementación; prototipo F-5 |
| CT-12 | Norma sin implementación; A-4 |
| CT-13 | Norma sin implementación; EM-C03, EM-C06 |
| CT-14 | Autoridad coincide; experiencia sin implementación |
| CT-15 | Implementación inconsistente (EM-C02) |
| CT-16 | Escala sin reescritura; límites de información |

Ningún caso exigió violar C-1..C-17 ni D-1..D-3.b.

---

## 12. Requisitos de información (§11.7) — no son contratos

Formato (DJ-2): **información requerida · productor/Fuente esperado · Procedencia necesaria · existencia física actual · gap.**

### 12.1 Contexto (RI-C)

| Id | Información requerida | Productor / Fuente esperado | Procedencia necesaria | Existencia física | Gap |
|---|---|---|---|---|---|
| RI-C1 | Contexto confirmado con estado por componente y momento | Nucleus (`authority context-read`) | Autoridad canónica, revalidada | [F~] `confirmedContext.ts`, puente `preload_core.js:77`; sin consumidor | Consumo en UI |
| RI-C2 | Contexto **no confirmado** como estado legible (no como excepción) con causa | Nucleus / handler IPC | Idem + causa | [F✗] fallback incompleto (EM-C02) | Coherencia handler–cliente |

### 12.2 Territorio (RI-T)

| Id | Información requerida | Productor / Fuente esperado | Procedencia necesaria | Existencia física | Gap |
|---|---|---|---|---|---|
| RI-T1 | Modelo navegable del Territorio del Contexto (Entidades con `(fuente,tipo,id)`, nombre, tipo) | Authority (scope) + fuente canónica Domain/Gene | Por Entidad | [F✗] sin modelo de lectura (D-3 consecuencia física) | Lectura de Territorio distinta de LocationSnapshot |
| RI-T2 | Domains confirmados en Mandates no canónicos (D-3.b) | Nucleus (contrato firmado + humanSync) | "declarado por un Mandate" + id del Mandate | [F~] dato en contrato (`contract.go:26`), sin lectura | Lectura |
| RI-T3 | Relaciones con identidad (Domain↔Gene ratificada; pertenencia soberana) | Fuente canónica; GravityGraph como proyección | Por Relación (A-5) | [F✗] reconciliador sin caller (`structural_projection.go:63`) | A-5; C1–C3 de Location |
| RI-T4 | Genes con revisión vigente | Store Gene G1 | Canónica | [F✗] `internal/gene` sin importador externo | G2/G3 |
| RI-T5 | Repository por Project (0..N) | Authority/registro | Canónica | [F✗] | Sin representación |

### 12.3 Trabajo (RI-W)

| Id | Información requerida | Productor / Fuente esperado | Procedencia necesaria | Existencia física | Gap |
|---|---|---|---|---|---|
| RI-W1 | Situación de cada Mandate: Entidad(es) declaradas en su contrato | Nucleus | Registro (contrato firmado, digest) | [F~] contrato existe; resumen sin Domain | Exponer situación en el read model |
| RI-W2 | Contrato exacto y digest legibles | Nucleus (`mandatecontract`) | Registro firmado | [F✗] sin lectura de detalle | Lectura |
| RI-W3 | Eventos de ciclo de vida con nombres acordados, secuencia y recuperación | Nucleus/Temporal + Control Plane | Notificación + cursor | [F~] desalineados (EM-C03); sin replay | Contrato de eventos (Monitor) |
| RI-W4 | Resultado de ejecución (`domain_definition.json`, digest, cumplimiento) | Nucleus/Brain | Resultado de Trabajo; `decisions` como propuesta | [F~] producido, sin lectura | Lectura |
| RI-W5 | Acto esperado (validate / approve / activate) explícito en el estado | Workflow / Nucleus | Registro | [F✗] sólo `currentPhase` | Ver RI-A1 |

### 12.4 Gravity (RI-G) — eje fundamental (DJ-2)

| Id | Información requerida | Productor / Fuente esperado | Procedencia necesaria | Existencia física actual | Gap |
|---|---|---|---|---|---|
| RI-G1 | Postures por nodo de spine (id, primitivo, texto, `appliesTo`, estado, `origin`, `verifiable`, `promotedFrom`) | Gravity / Nucleus | Proyección de GravityGraph, versión de nodo | [F~] modelo (`gravity/model.go:64-75`); [F✗] lectura (0 comandos) | Superficie de lectura |
| RI-G2 | Posture en lenguaje humano + expresión literal bajo demanda | Gravity (parser autoritativo) | Idem | [F~] parser Go existe; sin exposición | Lectura |
| RI-G3 | Masa con sus factores | Gravity (`ComputeMasa`) | Derivada, con inputs | [F~] `masa.go:4-18`; sin exposición | Lectura |
| RI-G4 | Asociación nodo ORGANIZATION/PROJECT ↔ Entidad Organization/Project | Gravity + Authority | Proyección asociada (Vocab §2.3) | [F~] ids existen; correspondencia no expuesta | Contrato de correspondencia |
| RI-G5 | Autoridad que firmó cada nodo/Posture y versión | Gravity / Authority | Registro | [F~] firma/estado en nodo; sin lectura | Lectura |
| RI-G6 | **Estado de evaluación de Gravity por Trabajo situado** (evaluado / no evaluado / no evaluable, con causa) | Gravity (resolución) | Resolución de Gravity con momento | [F✗] ningún workflow resuelve (EM-C01); contrato sin `GravityRef` | Integración workflow + lectura |
| RI-G7 | Estado de colisión de 4 valores por sujeto situado, con cobertura | Gravity (detección) + Impact (coexistence) | Resolución/assessment + cobertura | [F~] `AnalyzeJoint` (Conflicts/Evaluated/Undetermined) sólo vía Impact; detectores sólo confirmados (EM-C05) | Productor que emita los 4 estados situados |
| RI-G8 | Sujetos de la colisión (Postures, nodos, Mandates) y contexto compartido | Gravity | Prueba estructurada | [F~] `PriorityCycleFinding` (`priority_cycle_detector.go:52-60`) | Exposición |
| RI-G9 | Fundamento de la colisión (método de confirmación, autoridad si no mecánica) | Gravity / autoridad competente | Prueba o atestación | [F~] `Basis` en `portable.go:132-137` | Exposición; autoridad cualitativa (QUALITATIVE-CONFIRMATION-01) |
| RI-G10 | Correspondencia alcance operacional (`scope_paths`) → Entidades del Territorio | Coordinación de Mandates | Proyección de situación | [F✗] (spec Colisiones §9.1 TERRITORY-NORMALIZATION-01) | Fuente de Mandates activos y normalización |
| RI-G11 | Actos legítimos sobre Gravity disponibles (excepción, elevación, propuesta de cambio) y autoridad requerida | Gravity / Authority | Autoridad | [F✗] sin comandos; canal tras `cor` sin ratificar | Definición de actos |
| RI-G12 | Resolución de Gravity sin SESSION para observar Trabajo no en ejecución | Gravity | Resolución | [F✗] `ResolveActive` exige SESSION (`resolver.go:24-25`) | Modo de resolución por Mandate+IntentType o equivalente |
| RI-G13 | Criterio propuesto (no adoptado) con Procedencia de origen | Proceso de postulación | "propuesto" | [F✗] | Definición (ligado a EM-C04) |
| RI-G14 | Respuesta de Gravity ante conflicto de un acto (rechazado, señalado, reinterpretado, elevación, excepción, propuesta) | Gravity / Nucleus | Decisión registrada | [F✗] (Paladin UX §3, histórico) | Contrato de decisión |

### 12.5 Atención (RI-A)

| Id | Información requerida | Productor / Fuente esperado | Procedencia necesaria | Existencia física | Gap |
|---|---|---|---|---|---|
| RI-A1 | Señal de Atención clasificada: sujeto, Entidad donde se sitúa, acto esperado, autoridad, vigencia | Sistema responsable (workflow del Mandate, Authority, Monitor) | Emitida por su Fuente | [F✗] (EM-C06) | Contrato de señal (BR-08) |
| RI-A2 | Recuperación de señales tras desconexión (secuencia, cursor, replay) | Monitor / Control Plane | — | [F✗] (FOLLOWUP §5 MONITOR) | Contrato de eventos recuperables |

### 12.6 Location (RI-L)

| Id | Información requerida | Productor / Fuente esperado | Procedencia necesaria | Existencia física | Gap |
|---|---|---|---|---|---|
| RI-L1 | Admisibilidad de anclaje por Entidad (incl. `unsupported` para D-3.b) | Contrato de Location | Contrato | [F~] schema candidato (con F-1) | Revisión de schema |
| RI-L2 | Productor de Captura | Productor de Location (A1) | — | [F✗] | A1, A2 |
| RI-L3 | Resolución por referencia (8 estados) | Resolver de Location (A3) | Por referencia | [F✗] | A3, A4 |

### 12.7 Proyecciones y Lentes (RI-P)

| Id | Información requerida | Productor / Fuente esperado | Procedencia necesaria | Existencia física | Gap |
|---|---|---|---|---|---|
| RI-P1 | Cobertura declarada por Proyección (Entidades evaluadas / no evaluadas / completa) | Sistema dueño de cada Proyección | — | [F~] precedente `Coverage` en Impact (`contract.go:56-60`) | Generalizar a toda Proyección |
| RI-P2 | Frescura (momento de observación) por fila | Idem | — | [F✗] | — |
| RI-P3 | Clase de Fuente por fila | Idem; escala de Source Authority Profile V1 | — | [F✗] (A-4) | Localizar SAP V1 |

### 12.8 Validación diferida (DJ-1)

Cuando exista el Genesis E2E, contrastar contra datos genuinos: cada fila [NO OBSERVADO] de CT-01; la existencia de MANDATE/SESSION en Gravity (EM-C01); el contenido real de `domain_definition.json`; la secuencia real de eventos emitidos; el estado del Contexto en una instalación real.

---

## 13. Registro de conflictos nuevos (EM-Cxx)

Ninguno se resuelve aquí; no se corrigen contratos ni implementación (instrucción de José). Los conflictos A-1..A-8 y F-1..F-7 se citan por su ID y no se repiten.

| ID | Tipo | Conflicto | Evidencia | Autoridad que prevalece para el hecho | Afecta | Alternativas (sin decidir) |
|---|---|---|---|---|---|---|
| **EM-C01** | doc ↔ físico | El Closure v1.1 §7 da como "recorrido comprobado" (a `0c69940`) Mandate firmado → `EnsureGravityMandateNodeActivity` → `CreateGravitySessionActivity` → `ResolveActive` → `PersistExecutionGravityActivity`. A HEAD ningún workflow invoca esas Activities: `MandateExecutionWorkflow` sólo ejecuta `MandateGenActivity` y `PersistExecutionResultActivity`. Quedan registradas sin invocador y `gravityExecutionTurn` sin uso. | `installer/nucleus/internal/orchestration/temporal/workflows/mandate_execution_workflow.go:78,191,199`; `installer/nucleus/internal/orchestration/temporal/worker.go:91-107`; búsqueda insensible a mayúsculas en `temporal/workflows` → sólo comentarios (`:55,60,74`). | Código (hecho físico); el Closure queda como historia en ese punto. | CT-01, CT-02..05, P-16, RI-G6, RI-G12 | (a) registrar en Agenda la regresión/retiro del recorrido; (b) re-integrar; (c) aceptar que Gravity se resuelva en otro punto del ciclo. Decide el dueño de Gravity/MANDATE. |
| **EM-C02** | físico (inconsistencia interna) | Ante falla de lectura, el handler IPC devuelve un `confirmed-context/v1` sin `projectIdContinuity`; el cliente exige ese campo y lanza `confirmed_context_incomplete_response`. El estado "no evaluable" no llega a la UI como estado. | `installer/conductor/workspace/core/ipc/confirmed-context-handlers.js:24-31`; `webview/app/src/lib/confirmedContext.ts:21`. | Código. | CT-15, P-03, P-23, RI-C2 | (a) completar el fallback; (b) relajar validación del cliente para estados degradados. Decide dueño de Workspace Core. |
| **EM-C03** | cliente ↔ servidor | Precisión del desalineamiento conocido: el servidor publica `mandate:phase:ingest`, `mandate:build:rejected`, `mandate:build:all_complete`; el cliente espera `mandate:build:domains_proposed`, `mandate:build:signed`, `mandate:action:all_complete`, que nadie publica. | `mandate_build_workflow.go:150,228,308`; `src/types/ws-events.ts:259-273`; `webview/app/src/lib/stores/mandateStore.ts:225,230,246`. | Código servidor para lo que ocurre; ningún contrato normativo de eventos. | E10, CT-13, RI-W3 | Contrato de eventos (Monitor) o alineación de nombres. |
| **EM-C04** | documental (objeto indefinido) | *Declarar* (E8) no tiene objeto definido. Postulate: Vocab §2.6 "cuando su objeto quede definido"; acepción (b) del borrador UI/UX DIS-04 (decisión adoptada por un proceso soberano, funda Mandate); acepción (c) del audit de Postures ("postulación = acto de proponer una Posture"; `GravityGraph_Domains_Genes_Postures_..._Audit_v0_1.md:12,27,502`); FOLLOWUP §4 sitúa `PostulateProposal` en un proceso soberano posterior a ASM. Research "Postures vs Postulates" inexistente. | Citas indicadas; búsqueda Anexo C. | Vocabulario (deja abierto). | E8, CT-01 (después de Capturar), C-14, RI-G13, frontera ASM | **Decisión futura requerida (DJ-6):** definir Postulate (objeto, dueño, acto de adopción) y su relación con Posture/postulación. **Indeterminado mientras tanto:** qué se declara, quién lo adopta, cómo se sitúa ("en sus Anchors", Vocab §4.2), si una Captura es precondición. |
| **EM-C05** | norma ↔ físico | C-16 exige tres estados con fundamento y que la imposibilidad de evaluar nunca equivalga a compatibilidad. Los detectores internos sólo emiten colisiones confirmadas; la ausencia de hallazgo no distingue *ninguno* de *no evaluado*. `AnalyzeJoint` sí separa `Conflicts/Evaluated/Undetermined`, pero sólo es llamado por Impact. | `priority_cycle_detector.go:47-60,84-95`; `threshold_unsatisfiable_detector.go:87-93,139`; `installer/nucleus/gravity/portable.go:37-45,76,100-137`; `installer/impact/internal/evaluation/coexistence.go:24`. | Norma para la semántica; código para el hecho. | CT-02..05, RI-G7 | Productor que emita los cuatro estados situados (vía Gravity o Impact). |
| **EM-C06** | norma sin implementación con riesgo constitucional | Vocab §3.7 exige Atención clasificada por su Fuente. No existe señal; sólo estados implícitos (`currentPhase`, firma pendiente). Derivar "requiere tu acto" desde nombres de fase en el cliente sería interpretación (C-17). | `mandate_build_workflow.go:222,280,289`; `mandates.routes.ts:35-60` (sólo `status`, `currentPhase`); `installer/monitor/internal/status/command.go:16`. | Norma. | T1, CT-02 paso 0, CT-13, RI-A1, RI-W5 | (a) campo explícito de acto esperado en el read model del Mandate; (b) contrato de señal de Monitor; (c) tabla fase→acto propiedad de la Fuente, no de Orrery. |
| **EM-C07** | doc ↔ norma | Ledger Panel v0.1 §5.1 fija que el Ledger vive "exclusivamente en el régimen Panel". D-1/D-2 asignan al Régimen Orrery las Superficies con sujeto territorial o situado. | `docs/ANALYSIS/ORRERY/UI/Propuesta_Diseno_LedgerPanel_CapaAuditoriaTrazabilidad_v0_1.md:58-62`; D-1 §4, D-2 §4. | Norma (D-1/D-2). Se suma a A-7. | E10 | Reescritura del documento de Ledger ya ordenada por D-3 ("Consecuencias derivadas"). |
| **EM-C08** | implementación ↔ norma (prototipo) | Vocab §2.10: el Foco "determina hacia dónde va la cámara del Espacio y de qué habla la Superficie". En el prototipo, seleccionar actualiza el inspector pero no la cámara; la cámara se mueve con un control aparte. | `main.ts:279-292,294-304`. | Norma. Prototipo (F-5). | E4 | Corregir al implementar; la forma del movimiento es UX. |
| **EM-C09** | doc ↔ físico | Gateway UX v0.1 §2.3 excluye la Sidebar como punto de entrada; la Spec/Cierre de integración la implementó como Entrada A. | `docs/ANALYSIS/ORRERY/UI/Propuesta_Diseno_Orrery_GatewayUX_Onboarding_TransicionEspacial_v0_1.md:73-77`; [Project] `Cierre_Implementacion_IntegracionFormal_Core_Orrery_v1_0.md` §1; `regimeStore.ts:52-59`. | Código para el hecho; decisión de entradas es UX (D-2 deja abierto). | E1 | Decidir en arquitectura UI/UX v0.2. |
| **EM-C10** | físico (prototipo) | Desambiguación ausente: el picking toma el primer `MeshInstance` del buffer y no hay indicación. | `main.ts:325,348-361`. | Código. No viola norma; contradice el principio §4.3. | CT-06 | Implementación futura. |

Hallazgos físicos confirmados que no generan conflicto nuevo: TS2305 (DIS-12) originado en `installer/conductor/workspace/core/orrery/src/adapters/fromSimulatedData.ts:13` (importa `Position3` desde `../locationTree`, que no lo exporta; está en `layout.ts:18`); F-5 visible en `fromSimulatedData.ts:22-29` (todo ítem como `DOMAIN` + `user_anchor`) y `main.ts:40,395-461` (panel de simulación vivo); F-7 en `regimeStore.ts:31,67,73,85`; un solo Domain por Mandate (`mandatecontract/contract.go:99`); tests: Orrery 0, `webview/app` 0 (búsqueda `find -name '*.test.ts' -o -name '*.spec.ts'` excluyendo `node_modules`).

---

## 14. Propuestas de término nuevo

**Ninguna** (DJ-5). *Indicación* se usa como nombre de un fenómeno de interacción sin estatus normativo y queda disponible para la Interaction Grammar. Si en revisión se decide elevarlo a término, se aplicaría Vocab §7 (nueva versión del Vocabulario con aprobación de José).

---

## 15. Preguntas para José (priorizadas)

1. **EM-C01.** ¿El retiro del recorrido Gravity de `MandateExecutionWorkflow` es intencional? Condiciona toda la parte física del eje C y la forma de RI-G6/RI-G12.
2. **EM-C04 / DJ-6.** ¿Cuándo y dónde se define Postulate? Hasta entonces E8 queda indeterminada y CT-01 termina en Capturar.
3. **Regla de cobertura (§5.6).** ¿Se acepta como requisito transversal para toda Proyección que alimente una Lente (RI-P1)? Es la única forma encontrada de cumplir C-2 en el Espacio sin que la ausencia de marca mienta.
4. **EM-C06.** ¿Quién es el dueño de la señal de Atención para Mandates (workflow, Nucleus o Monitor)?
5. **§7.5, ancestro con referencia `missing`.** ¿Se admite anotar el ancestro existente más cercano con la degradación de una referencia capturada? (propuesta del modelo, compatible con C-8).
6. **Foco desde Superficie.** ¿Se confirma que cambiar el Foco desde una Superficie (lista/jerarquía) mueve el Espacio (Vocab §2.10) sin acto adicional? El modelo lo asume.
7. **RI-G12.** ¿Debe Gravity poder evaluarse para Trabajo situado que no está en ejecución (sin SESSION)? Sin eso, CT-02 sólo existe durante una corrida.
8. **A-4.** ¿Hay una ubicación conocida del Source Authority Profile V1? Sin él, CT-12 opera con escala provisional.

---

## 16. Condiciones de detención y límites de esta entrega

| Condición (§13 del Assignment) | Estado |
|---|---|
| 1. Modificar/reinterpretar norma | No se activó. |
| 2. Término nuevo | No se activó (DJ-5). |
| 3. Acto humano inexistente física y normativamente | No se activó: el modelo no exige actos inexistentes; los describe como no disponibles (CT-02 paso 5, RI-G11). Declarar existe normativamente en ejemplos (Vocab §2.11, §3.4) con objeto indeterminado (EM-C04). |
| 4. Resolver A/F, SAP, identidad de Relación | No se activó; se usan como casos. |
| 5. Nombrar Lentes | No se activó (P-* son Proyecciones). |
| 6. Gravity sin información mínima | Activada y levantada por DJ-2. |
| 7. Leer estado operativo | No se leyó (DJ-1). |
| 8. Escribir en repo/Project | Autorizado por DJ-3 sólo para este archivo y su copia. |
| 9. CT-01 no alcanzable | Activada y levantada por DJ-1. |
| 10. Deriva a UI/UX, Interaction Grammar, contratos o código | Controlada: sin gestos, layouts, schemas ni archivos de código. |
| 11. Dos versiones vigentes contradictorias | No se encontró; EM-C01 es doc histórico vs código. |
| 12. Fin | Se entrega para revisión; no se avanza a la fase siguiente. |

**Límites:** (a) el prototipo D1 no se ejecutó en runtime (su interacción se derivó del código); (b) no se ejecutaron builds ni tests; las afirmaciones físicas son estáticas; (c) al inicio se ejecutó una vez `git log -1` (sólo lectura) en el equipo de José antes de aplicar §10.2.7; luego HEAD se leyó de `.git`; (d) la API de Crossref limitó consultas; las fuentes no verificables se excluyeron (Anexo A).

---

## Anexo A — Investigación externa (§9 del Assignment)

Sólo se usaron fuentes verificadas en fuente primaria o registro bibliográfico. Ninguna redefine Cognituum.

| # | Fuente (verificada) | Principio extraído | Evidencia | Término/fenómeno A1 | Acto que habilita | Anti-patrón que evita |
|---|---|---|---|---|---|---|
| X1 | Vanacken, Grossman & Coninx, "Exploring the Effects of Environment Density and Target Visibility on Object Selection in 3D Virtual Environments", IEEE 3DUI 2007, pp. 115–122, doi 10.1109/3DUI.2007.340783 | En entornos densos y con baja visibilidad, técnicas que hacen explícito el objetivo y alcanzan objetos ocluidos superan al cursor puntual | Experimento formal; depth ray mejor | Indicación; candidatos (§4.3) | Enfocar | Picking del primer hit en contención/oclusión |
| X1 | Elmqvist & Tsigas, "A Taxonomy of 3D Occlusion Management for Visualization", IEEE TVCG 14(5):1095–1109, 2008, doi 10.1109/TVCG.2008.59 | La oclusión es un problema de diseño con patrones identificables | Taxonomía de 50 técnicas, 5 patrones | Entidad ocluida alcanzable (§4.3.3) | Enfocar sin mover cámara | Exigir navegación para alcanzar lo oculto |
| X1 | Argelaguet & Andujar, "A survey of 3D object selection techniques for virtual environments", Computers & Graphics 37(3):121–136, 2013, doi 10.1016/j.cag.2012.12.003 | (Sólo verificada la cita; contenido no leído; no se extrajo principio) | — | — | — | — |
| X1 | Bacim de Araujo e Silva, "Increasing Selection Accuracy and Speed through Progressive Refinement", tesis doctoral, Virginia Tech, 2015 (hdl 10919/56658) | Refinamiento progresivo: reducir el conjunto de candidatos en pasos rápidos mejora precisión en entornos densos, a costa de pasos | Cuatro estudios empíricos | Recorrido de candidatos (§4.3.2) | Recorrer candidatos | Precisión exigida en un único gesto |
| X2 | Grossman & Balakrishnan, "The Bubble Cursor", CHI 2005, pp. 281–290 | Un único objetivo seleccionable en todo momento | Menor tiempo de movimiento en 1D y 2D densos | Indicación de un solo candidato | Enfocar | Ambigüedad de qué respondería |
| X2 | W3C WAI-ARIA Authoring Practices, "Developing a Keyboard Interface" | Foco ≠ selección; foco siempre visible; seleccionado distinto del foco; la selección no debe seguir al foco si produce trabajo costoso; todo operable por teclado | Guía primaria W3C | Indicación vs Foco vs Anchor (§4.1, §4.5, §4.6) — **advertencia de colisión terminológica: "focus" de ARIA ≈ indicación** | Enfocar y anclar por teclado | Foco que cambia por sí solo; sólo puntero |
| X3 | Furnas, "Generalized Fisheye Views", CHI '86, pp. 16–21 | Grado de interés = importancia a priori − distancia al foco | Formulación | Escala/agrupación estructural (§5.4) | Acercarse | Mostrar todo con igual detalle |
| X3 | Cockburn, Karlson & Bederson, "A Review of Overview+Detail, Zooming, and Focus+Context Interfaces", ACM Computing Surveys 41(1), 2008 | Cuatro familias: overview+detail, zoom, focus+context, cue-based | Revisión | Sincronía Espacio–Superficie (§4.3.5), zoom semántico (§5.4) | Comprender sin perder contexto | Superficie que tapa el Territorio |
| X4 | Cockburn & McKenzie, CHI 2002, pp. 203–210 | "3D hinders retrieval" (claro en físico; no significativo en virtual) | Experimento | Anti-espectacularidad (§4.7) | — | Fenómenos sólo perceptibles en 3D |
| X4 | Munzner, *Visualization Analysis and Design* (2014), reglas: "No unjustified 3D", "Eyes beat memory", "Overview first…" (slides del autor) | 3D requiere justificación para datos abstractos | Reglas del libro | §4.7, §5.4 | — | Visualizador espectacular y semánticamente falso |
| X4 | Shneiderman, "The Eyes Have It", TR 96-66, UMD, 1996 | Overview first, zoom and filter, details on demand | Mantra | Capa O + E3–E5 | Comprender por niveles | Detalle sin orientación |
| X5 | van Ham & Perer, "Search, Show Context, Expand on Demand", IEEE InfoVis 2009 | Contexto local alrededor de un nodo de interés con DOI en grafos | Caso de 3 M citas | Agregación y expansión estructural (§5.4) | Expandir | Overview total ilegible |
| X6 | Reeder et al., "Expandable Grids…", CHI 2008, pp. 1473–1482, doi 10.1145/1357054.1357285 | (Sólo verificada la cita; no se extrajo principio) | — | — | — | — |
| X7 | MacEachren et al., "Visual Semiotics & Uncertainty Visualization: An Empirical Study", IEEE TVCG 18(12):2496–2505, 2012, doi 10.1109/tvcg.2012.279 | Distintos tipos de incertidumbre requieren significación visual distinta | Dos estudios empíricos (resumen) | 4 estados de colisión; desconocido vs ninguno (§6.3) | — | Codificar indecidible y desconocido igual |
| X8 | Ragan, Endert, Sanyal & Chen, "Characterizing Provenance in Visualization and Data Analysis", IEEE TVCG 22(1):31–40, 2016, doi 10.1109/TVCG.2015.2467551 | Tipos de procedencia (datos, visualización, interacción, insight, rationale) y propósitos | Marco | Procedencia ≠ historia de interacción: la historia de focos es Navigation State, no Location (C-9) | — | Confundir rastro de navegación con evidencia |
| X8 | W3C PROV (PROV-N REC 2013-04-30; PROV-DM REC) | Entity/Activity/Agent; `wasDerivedFrom`, `wasAttributedTo`, `wasGeneratedBy` | Recomendación W3C | Procedencia por Anotación (§5.6): de qué Fuente deriva, qué actividad la generó, a quién se atribuye | — | Anotación sin origen |
| X9 | Endsley, "Toward a theory of situation awareness in dynamic systems", Human Factors 37(1):32–64, 1995; definición de 3 niveles verificada en FAA AM-94/27 (cita Endsley 1987/1988) | Percepción → comprensión → proyección | Teoría | Percibir continuo (T2) y Comprender (E5). **Proyección** (anticipar) no es función de Orrery (C-17): pertenece a sistemas (p. ej. `reevaluateWhen` de Impact) | — | Que Orrery "anticipe" por heurística |
| X10 | Long, *Implications of Object vs. Space Based Theories of Attention in the Design of the Aircraft Head-Up Display*, tesis M.S., UIUC, 1994 (dir. C. Wickens), DTIC ADA281791 | La superposición de simbología en el campo primario tiene costos ("cognitive capture") además de beneficios | Experimento de vuelo simulado | Capa O mínima; intervención en Superficie (§5.7) | — | HUD cargado de información de intervención |
| X11 | McFarlane, "Comparison of four primary methods for coordinating the interruption of people in HCI", Human–Computer Interaction 17:63–139, 2002 | Coordinación negociada: mejor solución global; inmediata: más rápida pero más errores | Experimento (36 participantes; validez externa limitada) | Convocatoria de Atención (T1, §7.4) | Ir cuando la persona decide | Interrupción que mueve a la persona |
| X12 | PlayCanvas Engine API `Picker` y manual "Scene Picker" | Picking por buffer de IDs; consulta puntual o rectangular; profundidad opcional; baja resolución puede perder objetos pequeños | Documentación primaria | Factibilidad física de indicación y candidatos (§4.1, §4.3) | — | Suponer precisión que el buffer no da |

**No verificadas y no usadas:** Kopper et al. 2011 (SQUAD), Wickens & Long 1995, Wickens & Carswell 1995, Sweller, Horvitz, Padilla, Perlin & Fox, Bederson & Hollan, Herman et al., Ware. Sistemas productivos (Kubernetes Lens, Datadog) sólo como antecedente histórico del Research Resultados, sin observación nueva.

---

## Anexo B — Contraste documentación ↔ implementación (§10.2)

Veredictos: **coincide** · **norma sin implementación** · **implementación contradice norma** · **doc contradice físico** · **indeterminado**.

| P | Norma (A1–A3) | Doc histórico (estado) | Físico @3bd723b | Veredicto |
|---|---|---|---|---|
| P-01 | D-3 (navegar/anclar/capturar distintos); C-17 | Hipótesis del Assignment; Integración v0.3 §3 (capturar no obligatorio) | Ninguna fase completa (§3.3) | Norma sin implementación |
| P-02 | D-3.b; C-3; C-12 | Borrador UI §14.1 (inferido, histórico); Genesis Design v1.0 §6 (tres artefactos, **reemplazado** por contrato v1–v3 de un dominio) | Contrato de un Domain (`contract.go:99`); resumen de Mandate legible (`mandates.routes.ts:35`) | Doc contradice físico (Genesis Design) / norma sin implementación |
| P-03 | Vocab §2.9; C-12; D-2 HUD | UI Contenedora v0.1 §2.2 (HUD, preservado) | Contexto sin consumidor; HUD = "Volver" | Norma sin implementación; EM-C02 |
| P-04 | Vocab §2.10–2.11 (sin hover) | — | Sin hover (`main.ts:331-347`) | Indeterminado → resuelto como fenómeno (DJ-5) |
| P-05 | C-1, C-3 | Spec integración §4.2 (diffing) | Picker 512² primer hit (`main.ts:325,356`) | Norma sin implementación; EM-C10 |
| P-06 | C-2 | — | Labels con kind/nombre simulados (`main.ts:215-223`) | Norma sin implementación |
| P-07 | C-9, C-10, D-3 | Gateway §5.2 (reinterpretado) | `lastVisitedAnchor` (F-7) | Implementación contradice norma |
| P-08 | C-7, C-17 | Research Resultados §3 P3 (overlay → Lente) | Checkbox de objetos (F-5) | Implementación contradice norma (prototipo) |
| P-09 | C-2, C-7 | — | — | Norma sin implementación |
| P-10 | C-7, C-8 | Spec §2.2 (dato/layout) | `layout.ts:18-24` sin entrada de Lente | Coincide (layout); F-5 (objetos) |
| P-11 | C-2; Vocab §2.5, §3.5 | — | Sólo marca de simulación (`main.ts:60-64`) | Norma sin implementación; A-4 |
| P-12 | Vocab §2.8; C-6 | Research §2.1.4 HUD/MFD | Inspector simulado | Norma sin implementación |
| P-13 | C-3, C-7 | UI Contenedora v0.2 §2.2 (intención preservada por C-3) | — | Norma sin implementación |
| P-14 | C-15, C-16 | Paladin UX §3 (turno, no Orrery); spec Colisiones | Ningún flujo (EM-C01) | Norma sin implementación |
| P-15 | C-16, C-2 | spec Colisiones §4.2 | Detectores sólo confirmados; `AnalyzeJoint` 3 clases vía Impact | Norma sin implementación; EM-C05 |
| P-16 | C-15 | Auditoría API (histórica, 08-28: "Gravity sin persistencia" — **superada**) | Modelo, resolver, masa, detectores existen; sin lectura ni invocación | Doc contradice físico (auditoría) / norma sin implementación |
| P-17 | C-15 | Paladin UX §4 (compatible); Corolario (leído por C-15) | `masa.go:4-18` | Norma sin implementación en experiencia |
| P-18 | C-4, Vocab §3.8 | VisorMandatos v0.1 (riesgo C-4, reemplazado); Integración v0.3 §2.3 (MANDATE anclable — reemplazado por C-4) | Contrato con `domain`; sin lectura | Norma sin implementación |
| P-19 | C-13, C-14 | Borrador UI §12.4 | CLI con digest y atestación | Coincide en autoridad; norma sin implementación en experiencia |
| P-20 | C-2, C-13 | Event audit v1 (histórico: "sin GET /mandates" — **superado**) | `GET /mandates`, WS desalineado, `MOCK_FEED` | Doc contradice físico (audit) ; EM-C03 |
| P-21 | Vocab §3.7; C-17 | Borrador UI §17.6 (A-8) | Sin señal | Norma sin implementación; EM-C06 |
| P-22 | D-3 §5; C-8, C-11 | Ledger v0.1 §3.1 (A-7); Gateway §5 | Sin Location | Norma sin implementación |
| P-23 | C-12 | Spec §1.6 (degradar sin fabricar; preservado) | Fallback roto | Implementación inconsistente; EM-C02 |
| P-24 | C-3, C-6 | Borrador UI §14.3 | Un Domain por Mandate | Coincide (escala por Mandates) |

### Búsquedas que demuestran ausencias

| Ausencia afirmada | Búsqueda / alcance |
|---|---|
| Comandos de lectura gravity/posture/location/orrery/pause/resume | Inventario de nombres en `installer/help/nucleus_help.json` (0 coincidencias) |
| Invocación de Activities Gravity | `grep -rniE "gravitymandatenode|gravitysession|resolveactivegravity|executiongravity" installer/nucleus/internal/orchestration/temporal/workflows` (sólo comentarios) y `grep -rn` de los nombres de Activity en `installer/nucleus` (sólo registro en `worker.go`) |
| Llamador de `reconcileStructuralProjection` | `grep -rn` en `installer/nucleus` excluyendo `_test` (sólo definición) |
| Consumidores de `confirmedContext` | `grep -rl confirmedContext webview/app/src` (sólo el propio módulo) |
| Importadores de `internal/gene` | `grep -rl '"nucleus/internal/gene"' installer` fuera del paquete (0) |
| Consumidores del paquete portable de Gravity | `grep -rn '"nucleus/gravity"'` → sólo `installer/impact/internal/evaluation/*` |
| Hover en el prototipo | lectura completa de `installer/conductor/workspace/core/orrery/src/main.ts` |
| Intents ASM/GEN en Brain | `brain/core/intent_types.py:50-51` (sólo ING, DIS) |
| Tests de Orrery/webview | `find` de `*_test.go`, `*.test.ts`, `*.spec.ts` excluyendo `node_modules` |

---

## Anexo C — Corpus incorporado y búsqueda de lagunas

**Nivel 1 (21):** Assignment; Vocabulario v1.0; Constitución v1.0; D-1/D-2/D-3 v1.0; MANDATE canonical source v0.1; AGENDA_MAESTRA (sección "Estado coordinado ORRERY / Location" y temas 1, 11); AGENDA_FOLLOWUP; Location Material Closure v1.1; LocationSnapshot v0.1; spec Colisiones v0.1; Cierre Boundary GravityGraph; Paladin UX Postura/Gravity/Masa; Auditoría API vs Truth; Gene Concept v3.0; Genesis Intent Gen Design v1.0; Mandate Event Mechanism Auditoría v1; borrador UI/UX Orrery Workspace Core v0.1; Orrery Research Resultados v0.1; [Project] Location Infraestructura v0.3 Addendum; [Project] Spec Implementación Integración Core–Orrery v1.0; [Project] Cierre Integración Formal v1.0.

**Nivel 2 (por eje):**
- Eje C: Paladin Client Object Model; Orbital Fundamentos (§14, §15, §21, §22, §28, §30); Corolario; GravityGraph DOMAIN_GENE Contrato; Investigación GravityGraph DomainGene; Persistencia del Grafo; Investigación y Handoff SESSION; Orbital Gravity Implementation Spec; **Audit de Postures (DJ-4)**.
- Eje A y retorno: LocationFirst v0.2; Integración UI Entrada/Salida v0.3; Verificación UI contenedora; Gateway UX v0.1; UI Contenedora v0.2.
- Trabajo/observar/atender: VisorMandatos v0.1; Ledger Panel v0.1; ASM Intent Spec v1.0; ASM Location Research v0.2; ASM ADR (§6, §12); ING v1.1; DIS v1.0; Universal Schema v1.2.0.
- Superficies: Auditoría UI consolidada; Cierre puente Core UI; Doctrina UX/UI v0.1; Bloom Color Palette.
- CT-01: Research Snapshot §14, §18; [Project] `Cierre_Implementacion_DisenoP_RetornoGenesis_v1_0.md`; [Project] `Cierre_Correccion_RUNNER_PasosWorkspaceVaultGitHubAppAuth_v1_0.md`.

**Profundidad de lectura del Nivel 2.** Lectura completa: Client Object Model, UI Contenedora v0.2, Ledger Panel v0.1, Corolario. Lectura de las secciones pertinentes a cada eje: Fundamentos (§14, §15, §21, §22, §28, §30), Gateway UX (§1–§6), Integración v0.3 (§2–§6), LocationFirst v0.2 (§3), Verificación UI contenedora (§1), ASM ADR (§6), Universal Schema (R-17..R-21), SESSION (definición: corrida de `MandateExecutionWorkflow`), contrato DOMAIN/GENE (§8, exclusión de la resolución de Postures), ING/DIS (gobierno humano de propuestas), audit de Postures (resultado ejecutivo y conclusiones), Snapshot de entrevistas (§14, §18), Doctrina y Paleta (principios de calma y tokens de estado), Cierre puente Core UI. **Contradicciones históricas detectadas en Nivel 2 (sin nuevo ID, ya cubiertas por norma o por F-x):** LocationFirst v0.2 §3 e Integración v0.3 §2.3 admiten MANDATE/SESSION/NUCLEUS como anchors (reemplazado por C-4; F-1); la Verificación de UI contenedora §1 (2026-09-20) afirma que la integración Orrery↔UI "no existe en código", superado físicamente por `126ebb7` (doc contradice físico, histórico).

**Nivel 3 consultado:** Genesis Design (historia de "qué produce Genesis"); Glosario y Brief (sólo para detectar términos reemplazados).

**Búsquedas de lagunas (en `docs/`):** nombres de archivo con `postul|postur`; contenido `postur… postulat` en ambos órdenes; literal "Postures vs Postulates"; `constellation|constelaci`; `genesis[ _-]?control`; encabezados con `Attention|Atención`; nombres `attention|atencion|monitor|assembl|ASM|source*authority`; "Source Authority Profile"; `01a0a6d5`; `working[ _-]snapshot`. Resultados en §2.5.

---

*Fin del Experience Model v0.1. Entregado para revisión. No escribe UI/UX v0.2, no define Interaction Grammar, no modifica contratos ni código, no resuelve A-x, F-x, Source Authority Profile, Postulate ni Gravity.*
