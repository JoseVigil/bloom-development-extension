# Executor — plan de migración E0

**Estado:** PROPUESTO — NO EJECUTADO  
**Versión:** 1.0  
**Fecha:** 2026-08-20  
**Origen:** `installer/execution/`  
**Target único:** `installer/executor/`

## 1. Restricción

Este plan no autoriza movimientos. La migración sólo podrá ejecutarse después
de aprobación explícita de E0. Debe usar operaciones Git que preserven historia,
no dejar dos implementaciones activas y mantener visibles las decisiones
históricas.

## 2. Baseline verificado

`installer/execution/` fue introducido por el commit
`40073a288f56e70d8909cdd3aef74c7149453d43` del 2026-08-20. Su inventario
actual es exclusivamente documental/contractual:

```text
installer/execution/
├─ AGENTS.md
├─ README.md
├─ CLIS_INTEGRATION_IMPLEMENTATION_HANDOFF_2026-08-20.md
├─ EXECUTOR_IMPLEMENTATION_HANDOFF_2026-08-20.md
├─ pedido_reconciliacion_execution_layer.md
└─ contracts/v1/
   ├─ evidence.schema.json
   ├─ execution-event.schema.json
   ├─ execution-package.schema.json
   └─ execution-result.schema.json
```

No se observó core, servicio, adapter, runner o binario bajo esa ruta. Por
tanto no existe hoy una segunda implementación activa, pero sí referencias que
deben clasificarse antes del traslado.

## 3. Principios de migración

1. Usar `git mv` para archivos vigentes, en un commit de migración dedicado.
2. No mezclar el movimiento con implementación Go sustantiva.
3. Preservar v1 sin mutarlo; v2 nace en archivos nuevos.
4. Conservar documentos históricos con su título y procedencia.
5. Actualizar enlaces vigentes; no reescribir citas históricas que documentan
   el estado anterior.
6. No crear redirect ejecutable, package Go o segundo servicio en la ruta vieja.
7. Validar enlaces, schemas e inventario antes de eliminar el origen.
8. Permitir rollback mediante revert del commit de migración, no copias
   paralelas mantenidas manualmente.

## 4. Mapa archivo por archivo

| Origen | Destino propuesto | Acción | Tratamiento |
|---|---|---|---|
| `installer/execution/AGENTS.md` | `installer/executor/AGENTS.md` | mover + transformar | Guardrails vigentes de Executor; conservar atribución histórica en Git |
| `installer/execution/README.md` | `installer/executor/README.md` | mover + transformar | Convertir en índice source; enlazar `docs/EXECUTOR/` |
| `contracts/v1/evidence.schema.json` | `installer/executor/contracts/v1/evidence.schema.json` | mover + conservar versión | `git mv`; conservar `$id` v1 y estado provisional/histórico |
| `contracts/v1/execution-event.schema.json` | `installer/executor/contracts/v1/execution-event.schema.json` | mover + conservar versión | no corregir campos in-place |
| `contracts/v1/execution-package.schema.json` | `installer/executor/contracts/v1/execution-package.schema.json` | mover + conservar versión | v2 será hermano nuevo |
| `contracts/v1/execution-result.schema.json` | `installer/executor/contracts/v1/execution-result.schema.json` | mover + conservar versión | no promover a implementado |
| `pedido_reconciliacion_execution_layer.md` | `installer/executor/history/pedido_reconciliacion_execution_layer.md` | mover + conservar | Histórico vigente para `CAF-032`; actualizar enlace canónico |
| `CLIS_INTEGRATION_IMPLEMENTATION_HANDOFF_2026-08-20.md` | `installer/executor/history/CLIS_INTEGRATION_IMPLEMENTATION_HANDOFF_2026-08-20.md` | mover + conservar | Histórico supersedido; no borrar/reescribir contenido |
| `EXECUTOR_IMPLEMENTATION_HANDOFF_2026-08-20.md` | `installer/executor/history/EXECUTOR_IMPLEMENTATION_HANDOFF_2026-08-20.md` | mover + conservar | Compatibilidad histórica; handoff vigente permanece en `docs/EXECUTOR/` |
| `installer/execution/` | ninguno | retirar | eliminar directorio vacío sólo tras M3 y cero referencias vigentes |

No se crea `installer/execution/README.md` de redirect permanente. Tras actualizar
referencias y validar, el directorio viejo debe desaparecer. Si tooling externo
requiere transición, Architecture debe aprobar un redirect documental temporal
con fecha de retiro; nunca código ejecutable.

El criterio de eliminación final es simultáneo: todos los archivos de §4
movidos, validaciones M3 verdes, cero consumers productivos del path viejo,
referencias históricas etiquetadas, commit dedicado revisado y rollback por
revert demostrado. Si una condición falla, el staging no se retira.

## 5. Clasificación de referencias

### 5.1 Actualizar al target nuevo

- `AGENTS.md` raíz y documentos que describen el target vigente;
- `docs/EXECUTOR/*`;
- Responsibility Boundaries y Application Decision cuando enlacen artefactos
  movidos;
- Reconciliation para el nuevo path del pedido;
- Conformance para los schemas físicamente migrados;
- Findings `CAF-034`, `CAF-036`, `CAF-037`, `CAF-043`, `CAF-048` mediante nota
  append-only de migración, sin reescribir evidencia histórica;
- scripts/build/tests que consuman schemas o catálogo.

### 5.2 Mantener como referencia histórica

- texto que afirma que la primera materialización ocurrió en
  `installer/execution/`;
- títulos y contenido del handoff CLIS;
- evidencia de commit y findings sobre el staging original;
- citas necesarias para explicar por qué v1 es provisional.

### 5.3 Revisar, no sustituir mecánicamente

- `installer/aitap/AGENTS.md`: distinguir antiguo “CLIS Integration” del
  Executor actual;
- research AITAP/Genesis: preservar fecha de corte y agregar enlace supersesor;
- `CAF-030/031`: no alterar IDs; agregar resolución/evidencia según regla
  append-only;
- cualquier URI/schema `$id`: el path físico no obliga a cambiar identidad
  contractual.

## 6. Secuencia de ejecución futura

### M0 — Preflight

- worktree inventariado y cambios ajenos identificados;
- E0 y movimiento aprobados;
- `CAF-032` no se presenta como cerrado;
- snapshot de `rg` references y `git log --follow` guardado en el informe;
- no existe `installer/executor/` conflictivo.

### M1 — Movimiento puro

- crear únicamente directorios target necesarios;
- ejecutar `git mv` según §4;
- no agregar Go module, comandos o adapters en el mismo commit;
- verificar que Git detecta renames y que `git log --follow` conserva el origen.

### M2 — Reconciliación documental

- actualizar enlaces vigentes clasificados en §5.1;
- agregar notas de supersesión, no borrar historia;
- actualizar findings append-only con commit/fecha/evidencia;
- no declarar contratos v1 cerrados o implementados.

### M3 — Validación

- `rg` no encuentra referencias vigentes rotas al origen;
- referencias históricas restantes están marcadas como tales;
- los cuatro schemas v1 son byte-equivalentes salvo cambios de path
  explícitamente aprobados;
- validador JSON Schema carga todos los `$id`/`$ref`;
- links Markdown del paquete Executor resuelven;
- no hay archivos ejecutables ni packages duplicados;
- `installer/execution/` queda ausente o contiene sólo redirect temporal
  explícitamente aprobado.

### M4 — Commit de migración

- commit dedicado con movimiento + reconciliación de enlaces;
- mensaje identifica `CAF-048` y preservación de v1;
- adjuntar inventario before/after y validaciones;
- no mezclar E1.

### M5 — Inicio posterior de E1

Sólo después de aceptar M4 se puede crear el Go module/shell. E1 debe partir del
target único ya migrado y etiquetar todo skeleton como `TARGET/PARCIAL`.

## 7. Validaciones y criterios de aceptación

| Validación | Criterio |
|---|---|
| Historia | `git log --follow` alcanza `40073a2…` para cada archivo movido |
| Unicidad | un único source target; ningún servicio/package activo en origen |
| Integridad v1 | schemas conservados y todavía provisionales |
| Referencias | cero enlaces vigentes rotos; históricos identificables |
| Findings | actualización append-only, sin reutilizar IDs |
| Alcance | ningún runtime, repo real o conformance ejecutado |
| Separación | commit de migración no contiene implementación E1 |

## 8. Rollback

Antes de E1, rollback es `git revert` del commit dedicado de migración. No se
usa `git reset --hard`, copias paralelas ni borrado manual. Si E1 ya comenzó, el
rollback debe detener cualquier servicio nuevo, preservar Evidence/config y
volver mediante un plan aprobado; no se cubre por este movimiento documental.

## 9. Riesgos

| Riesgo | Mitigación |
|---|---|
| reemplazo global destruye historia | clasificación §5 y revisión de diff |
| v1 se interpreta como aprobado | headers/README y findings mantienen provisional |
| dos targets activos | movimiento previo a E1 y prueba de unicidad |
| `$id` cambia por path físico | identidad contractual independiente del path |
| cambios ajenos del worktree se mezclan | commit/pathspec dedicado y revisión previa |
| redirect queda permanente | fecha/gate de retiro o ausencia total |

## 10. Estado

Plan producido; migración `NOT_RUN`. No se creó `installer/executor/`, no se
movió ningún archivo y no se ejecutó ningún runtime.
