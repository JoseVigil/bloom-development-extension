# Orrery — Estado base v1.0

| Campo | Valor |
|---|---|
| Documento | `docs/ANALYSIS/ORRERY/Orrery_Estado_Base_v1_0.md` (copia en Project BTIPS: `ANALYSIS/ORRERY/Orrery_Estado_Base_v1_0.md`) |
| Tipo | **Documento índice. No es fuente normativa.** |
| Precedencia | Resume estado, autoridad, dependencias y trabajo pendiente. **Ante cualquier divergencia entre este índice y un documento fuente, manda el documento fuente.** Este índice no crea, modifica ni interpreta normas, decisiones ni contratos. |
| Fecha | 2026-10-11 (actualizado el mismo día por la publicación de la Constitución v1.1 y el registro del punto de partida de la fase siguiente) |
| Autoridad de diseño | José Vigil (única) |
| Referencia física | `main` @ `8b8101a` (HEAD al escribir este índice). El último contraste físico del Experience Model se hizo a `3bd723b` |

---

## 1. Para qué sirve

Es la puerta de entrada a ORRERY. Dice qué documento manda en cada tema, qué está cerrado, qué está abierto, de qué depende cada pendiente y qué está congelado. Cualquier cowork nuevo de Orrery empieza aquí y lee después los documentos fuente que correspondan.

Se actualiza cuando cambia un documento fuente. Si quedara desactualizado, sigue mandando el documento fuente.

---

## 2. Orden normativo y documentos vigentes

```text
Vocabulario normativo  →  Constitución de Orrery  →  Decisiones arquitectónicas (D-1 … D-4)
                       →  Experience Model         →  Arquitectura UI/UX  →  Vertical slices  →  Implementación
```

Fuente del orden: Vocabulario v1.1 §7.

| Eslabón | Documento vigente | Estado |
|---|---|---|
| Vocabulario normativo | `docs/ANALYSIS/ORRERY/Orrery_Vocabulario_Normativo_v1_1.md` | Normativo |
| Constitución de Orrery | `docs/ANALYSIS/ORRERY/Orrery_Constitucion_v1_1.md` | Normativo (C-1..C-17, idénticos a v1.0; v1.1 es actualización referencial) |
| Decisiones arquitectónicas | `docs/ANALYSIS/ORRERY/Orrery_Decisiones_Arquitectonicas_v1_1.md` | Normativo (D-1, D-2, D-3, D-3.b, D-4) |
| Experience Model | `docs/ANALYSIS/ORRERY/EXPERIENCE/Orrery_Experience_Model_v1_0.md` | Normativo desde 2026-10-11 |
| Arquitectura UI/UX | Sin documento vigente | Primer entregable previsto: Orrery Visual Architecture / Visual Experience v0.1 (§9) |
| Vertical slices | — | No iniciado |
| Implementación | — | Código de Orrery congelado (§7) |

---

## 3. Capas de autoridad

| Capa | Documentos | Cómo se usan |
|---|---|---|
| **Norma** | Los cuatro eslabones vigentes de §2 | Ningún documento posterior puede contradecirlos. Sólo cambian con nueva versión aprobada por José. Vocabulario v1.1, Decisiones v1.1 y Experience Model v1.0 citan "Constitución v1.0" (en su cabecera y, en el caso del Vocabulario, en la tabla de §7): por decisión de José no se reversionan sólo por esa referencia; la versión vigente es la indicada en §2 y sus invariantes no cambiaron. |
| **Evidencia aplicada (no normativa)** | `docs/ANALYSIS/ORRERY/EXPERIENCE/Orrery_Experience_Model_Escenarios_Trabajo_Activo_v0_1.md` | Profundización subordinada al Experience Model v1.0. Sus marcas [COMPROBADO], [NO OBSERVADO], [QUIEBRE PREVISTO] e [HIPÓTESIS] se respetan; sus dependencias del Genesis E2E siguen vigentes. |
| **Interfaz técnica transitoria** | D-4 (Decisiones v1.1) | `$orrery`, `mountOrreryScene`, `OrreryHandle.update`, `destroy`, funcionamiento embebido, viewport recibido, sin control de Core. Estable durante la transición; no es modelo. |
| **Legado y compatibilidad** | `OrreryTree`, `locationTree.ts`, `anchors[0]`, `ancestors`, `simulated`, `fromSimulatedData()` (D-4) | No se amplía su uso. No sirven como base de decisiones de experiencia, Foco inicial, estructura del Territorio, Procedencia ni Fuente productiva. |
| **Contratos de otros sistemas** | Location Material Closure v1.1, LocationSnapshot v0.1, spec de Colisiones, Gene Concept v3.0, contratos de Mandate | Mandan en su sistema. Orrery registra divergencias (F-x, EM-Cxx); no las resuelve. |
| **Histórico** | Vocabulario v1.0, Constitución v1.0, Decisiones D1_D2_D3 v1.0, Experience Model v0.1 (reemplazados, marcados como tales); borrador `docs/ANALYSIS/ORRERY/UI/Investigacion_Propuesta_Arquitectura_UIUX_Orrery_WorkspaceCore_v0_1.md`; research y propuestas previas de `docs/ANALYSIS/ORRERY/UI/` y `docs/ANALYSIS/GRAVITY/ORBITAL/` | Sólo se leen como historia y a través del vocabulario vigente. No recuperan autoridad por conveniencia. |
| **Actas** | `docs/ANALYSIS/ORRERY/Orrery_Experience_Model_Assignment_v0_1.md`; informe `ANALYSIS/ORRERY/EXPERIENCE/Orrery_Actualizacion_Estado_Cowork_ExperienceModel_y_GenesisE2E_v1_0.md` (Project) | Registran encargo y estado; no son norma. |

---

## 4. Qué documento manda en cada tema

| Tema | Manda | Complementa |
|---|---|---|
| Términos (Territorio, Espacio, Entidad, Relación, Fuente, Trabajo, Lente, Superficie, Contexto, Foco, Anchor, Location) | Vocabulario v1.1 §2–§3 | — |
| Invariantes (representación ≠ verdad, autoridad de Fuente, Territorio/Trabajo/Gravity disjuntos, Lentes sólo leen, navegar ≠ capturar…) | Constitución v1.1 | — |
| Alcance de Orrery y Regímenes | D-1, D-2 | Experience Model v1.0 §3 |
| Navegación, Navigation State, Captura, reapertura | D-3, D-3.b | Experience Model v1.0 §4, §7.5 |
| Compatibilidad con Workspace Core | D-4 | Spec y Cierre de Integración Formal Core–Orrery v1.0 (Project), leídos por D-4 |
| Secuencia de experiencia | Experience Model v1.0 §3 | — |
| Indicación, Foco, Anchor, picking, accesibilidad | Experience Model v1.0 §4 | — |
| Lentes, Anotaciones, cobertura, Procedencia visible | Experience Model v1.0 §5 (regla de cobertura: DJ-7) | — |
| Gravity como experiencia (cuatro estados, Masa, aplicabilidad) | Constitución C-15, C-16; Experience Model v1.0 §6 | Escenarios R-3, S10 |
| Trabajo, actos, observar, atender, retornar | Experience Model v1.0 §7 | Escenarios §2–§4 (actos reales de Genesis) |
| Contexto no confirmado | Constitución C-12; Experience Model v1.0 §8.1 | — |
| Requisitos de información hacia otros sistemas | Experience Model v1.0 §12 | Escenarios §8 |
| Semántica de colisiones | Spec de Colisiones (Gravity) | Experience Model v1.0 §6.2 |
| Location como contrato | Location Material Closure v1.1; LocationSnapshot v0.1 (con F-1) | D-3, D-3.b |

---

## 5. Decisiones cerradas

| ID | Decisión | Documento fuente |
|---|---|---|
| V-Q1 … V-Q11 | Vocabulario | Vocabulario v1.1 §1 |
| V-Q12 | Experience Model es eslabón normativo; Escenarios no | Vocabulario v1.1 §1.1 |
| V-Q13 | El eslabón se llama "Arquitectura UI/UX"; Visual Architecture / Visual Experience v0.1 es su primer entregable | Vocabulario v1.1 §1.1 |
| C-1 … C-17 | Invariantes | Constitución v1.1 (idénticos a v1.0) |
| D-1 (A2), D-2 (R-B), D-3 (N-B), D-3.b | Alcance, Regímenes, navegación, Domain declarado por Mandate | Decisiones v1.1 |
| D-4 | Compatibilidad con Workspace Core | Decisiones v1.1 |
| DJ-1 … DJ-6 | Decisiones del Experience Model v0.1 (CT-01 no observado, Gravity fundamental, Hover como fenómeno, Postulate abierto…) | Experience Model v1.0 §0 |
| DJ-7 | Regla de cobertura | Experience Model v1.0 §5.6 |
| DJ-8 | Foco desde una Superficie territorial: mismo Foco, orienta el Espacio, no crea Anchor | Experience Model v1.0 §4.2, §4.5 |
| DJ-9 | Referencia `missing`: el ancestro es sólo soporte espacial; la referencia conserva identidad y Procedencia | Experience Model v1.0 §7.5 |
| DJ-10 | "Sin criterio declarado" es cobertura/aplicabilidad, no estado de colisión; C-16 no cambia | Experience Model v1.0 §6.3, §6.6 |
| DJ-11 | EM-C01, RI-G12, dueño de Atención y Source Authority Profile abiertos y no bloqueantes para la fase visual | Experience Model v1.0 §15 |
| Escenarios §9 (1–5) | Genesis no se modifica por Orrery; V-1..V-3 son variables del protocolo; EM-C14..C16 son quiebres previstos; lectura E1–E11 sólo tras el E2E | Escenarios v0.1 §9 |

---

## 6. Abierto

Este índice no reformula los conflictos: sólo indica dónde están y si bloquean la fase visual.

| Grupo | Dónde | ¿Bloquea la fase visual? |
|---|---|---|
| A-1 … A-8 (documentales) | Vocabulario v1.1 §4.4 | No. A-3 (nombres de Lentes) se cierra en la Arquitectura UI/UX. |
| F-1 … F-7 (contratos físicos) | Vocabulario v1.1 §4.5 | No. Se resuelven en el dueño de cada contrato. |
| D-T1 … D-T5 (deudas terminológicas) | Vocabulario v1.1 §4.6 | No. |
| EM-C01 … EM-C10 | Experience Model v1.0 §13 | No (DJ-11 para EM-C01). |
| EM-C04 (Postulate; E8 Declarar indeterminada) | Experience Model v1.0 §13, §15 | No; la fase visual no representa Declarar como acto disponible. |
| EM-C11 … EM-C20 | Escenarios v0.1 §5 | No; varios esperan el E2E (§7). |
| RI-G12, dueño de la señal de Atención (EM-C06), Source Authority Profile V1 (A-4) | Experience Model v1.0 §15 | No (DJ-11). |

---

## 7. Dependencias del Genesis E2E

Lo siguiente **no se puede cerrar sin una corrida completa de Genesis** sobre el Project gobernado real de Cognituum:

| Pendiente | Fuente | Qué se espera de la evidencia |
|---|---|---|
| CT-01 como recorrido genuino (hoy [NO OBSERVADO]) | Experience Model v1.0 §11; Escenarios §6.2 | Territorio real resultante, nombre del Domain, qué ve el Paladín |
| EM-C14, EM-C15, EM-C16 (quiebres previstos) | Escenarios §5 | Confirmar o refutar. EM-C15 tiene corrección propia de Genesis (B1) pendiente de evidencia |
| EM-C17 (`confirmedBy` vacío), S1–S10, R-2 | Escenarios §3–§5 | Actualizar con datos reales |
| Corrección de V-1 (comando real `nucleus mandate build --project … --project-id … --docs …`) | Informe de estado §2 (Project) | Aplicarla al actualizar los Escenarios |
| Lectura de E1–E11 (sólo campos de Escenarios §7, sin secretos) y E12 (bitácora de José) | Escenarios §7, §9 | Autorizada **sólo** tras el E2E |

Condiciones previas registradas en el informe de estado (Project), no verificadas por este índice: B3/B4 (suministro cloud gobernado) en revisión; modelo del registry de AITAP a reemplazar; el Project gobernado de Cognituum todavía no existe; corpus para `--docs` pendiente de decisión. Fuentes: `MANDATE/GENESIS/Genesis_E2E_Correccion_B1_B2_y_Camino_Cloud_Gobernado_v1_0.md` y `MANDATE/GENESIS/Genesis_Camino_Cloud_Gobernado_B3_B4_Diseno_v0_1.md` (Project).

---

## 8. Restricciones vigentes

1. **Código de Orrery congelado:** no hay cambios en `installer/conductor/workspace/core/orrery/` hasta nueva decisión de José (D-4; informe de estado §5).
2. **Estado operativo:** `.bloom` y `BloomNucleus` no se leen sin que José indique archivo y campo.
3. **Repo y Project:** no se escribe sin lista exacta aprobada. José hace git y push.
4. **Sin Interaction Grammar, contratos ni implementación de Orrery** hasta nueva decisión.
5. **Norma no retroactiva:** los cambios normativos generan versiones nuevas; las anteriores sólo reciben la marca de reemplazo.

---

## 9. Cierre de la fase conceptual y trabajo siguiente

**Con Vocabulario v1.1, Decisiones v1.1 y Experience Model v1.0 queda cerrada la fase de consolidación conceptual de Orrery.**

**Siguiente trabajo:** Orrery Visual Architecture / Visual Experience v0.1, primer entregable del eslabón Arquitectura UI/UX. Objetivo: dejar de describir sólo qué es Orrery y definir rigurosamente cómo se percibe y se habita.

Preguntas que debe responder visualmente:

1. Cómo aparece el Territorio en el Espacio al entrar.
2. Cómo reconoce la persona Entidades y Relaciones.
3. Cómo se orienta (capa permanente de orientación).
4. Cómo el Foco transforma la escena.
5. Cómo se distingue un Anchor del Foco.
6. Cómo aparecen las Lentes y sus Anotaciones, incluida la cobertura (*ninguno* frente a *desconocido*).
7. Cómo conviven el Espacio y las Superficies de Workspace Core (Régimen Orrery, modo foco, Régimen Panel).

Límites del entregable:

- Respeta los cuatro eslabones normativos y D-4.
- No define Interaction Grammar (gestos concretos), no implementa y no modifica código de Orrery.
- No espera el Genesis E2E. Todo lo que dependa de evidencia real se marca como tal.
- No usa `OrreryTree`, `anchors[0]` ni datos simulados como base de decisiones (D-4).
- Todo elemento visual responde: **¿qué término o fenómeno válido hago perceptible y qué acto humano habilito?**

### 9.1 Punto de partida autorizado (José, 2026-10-11)

**Estas decisiones son el punto de partida autorizado para preparar el encargo del próximo trabajo. No son arquitectura visual decidida.**

| Tema | Punto de partida |
|---|---|
| Medio (opción A) | Marcos visuales de baja-media fidelidad, uno por estado de escena, más un documento de Visual Architecture / Visual Experience v0.1 que los fundamente. |
| Método | norma → fenómeno perceptible → escena → hipótesis visual → contraste normativo → lenguaje visual. El lenguaje visual emerge del contraste entre fenómenos y escenas. |
| Canales visuales | Pueden inventariarse previamente los canales disponibles, pero **no se asignan definitivamente** antes de probarlos en escenas. La tabla de codificación no es un design system decidido a priori. |
| Territorios de prueba | (1) Mínimo post-Genesis, marcado [NO OBSERVADO]: Tenant, Organization, Project y un Domain declarado por un Mandate. (2) Territorio denso, marcado [HIPÓTESIS], para probar contención, oclusión y densidad; nunca se presenta como dato. |

**Estado:** la consolidación conceptual de Orrery está cerrada. El paso siguiente es preparar el encargo específico de Orrery Visual Architecture / Visual Experience v0.1; el trabajo visual no empieza antes de ese encargo.

---

*Fin del índice. No es fuente normativa: ante divergencia manda el documento fuente.*
