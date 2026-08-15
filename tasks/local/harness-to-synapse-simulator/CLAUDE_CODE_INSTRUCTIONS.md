# Instrucciones para Claude Code: migración `harness` → `synapse-simulator`

Contexto: el proyecto BTIPS usa el término "harness" de forma incorrecta en 585+
ocurrencias entre código, nombres de archivo y documentación. El término correcto
es "synapse-simulator". Esta migración debe hacerse en 3 fases, NUNCA todas en un
solo paso, con checkpoints de confirmación entre cada una.

## REGLA DE ORO — no rompas nada que compile o corra

No hagas find-and-replace ciego de texto. `harness` cambia de forma según el
estilo de cada identificador. Usá esta tabla de conversión exacta:

| Estilo detectado | Regla | Ejemplo |
|---|---|---|
| `UPPER_SNAKE_CASE` (constantes) | `HARNESS` → `SYNAPSE_SIMULATOR` | `HARNESS_CONFIG` → `SYNAPSE_SIMULATOR_CONFIG` |
| `PascalCase` (nombre propio del componente) | `Harness` → `SynapseSimulator` en identificadores; `Harness` → `Synapse Simulator` (con espacio) en prosa/UI-facing text | `Harness.init` → `SynapseSimulator.init`; "el Harness es..." → "el Synapse Simulator es..." |
| `lower_snake_case` | `harness` → `synapse_simulator` | `harness_generator.py` → `synapse_simulator_generator.py` |
| `camelCase` | `harness` (como sub-palabra) → `SynapseSimulator`, `Harness` inicial → `synapseSimulator` | `loadHarnessConfig` → `loadSynapseSimulatorConfig`, `harnessLogBuffer` → `synapseSimulatorLogBuffer` |
| kebab-case / nombres de carpeta en minúscula | `harness` → `synapse-simulator` | `templates/harness/` → `templates/synapse-simulator/` |
| Nombres de archivo `HARNESS_*.md` (docs) | `HARNESS` → `SYNAPSE_SIMULATOR` | `HARNESS_Workspace_Manual.md` → `SYNAPSE_SIMULATOR_Workspace_Manual.md` |

No inventes casing nuevo. Si encontrás una variante que no está en esta tabla,
DETENÉTE y preguntame antes de decidir arbitrariamente.

## EXCLUSIONES — no tocar bajo ningún concepto

1. **`extension/harness/`** (o cualquier carpeta bajo un directorio de build/dist/output)
   — es artefacto generado. Se regenerará solo al buildear una vez que el código
   fuente (`brain/core/profile/web/templates/harness/` y sus referencias) esté
   renombrado. Si tu build script todavía apunta a rutas viejas, actualizá el
   build script, pero no toques archivos generados a mano.
2. **Backups de source-of-truth**: `HARNESS_SOURCE_OF_TRUTH.md`,
   `HARNESS_SOURCE_OF_TRUTH_1_2.md`, `HARNESS_SOURCE_OF_TRUTH_FIX.md`
   — quedan fuera de scope, no renombrar ni editar contenido.
   Solo `HARNESS_SOURCE_OF_TRUTH_1_6.md` es la versión vigente y SÍ se migra.
3. **Historial de git** — no reescribas commits pasados ni uses `git filter-branch`
   / `filter-repo` salvo que te lo pida explícitamente.

## FASE 1 — Inventario y verificación (NO EDITAR TODAVÍA)

1. Corré en la raíz del repo:
   ```
   rg -ic 'harness' --stats
   rg -io '[a-zA-Z0-9_.\/-]*harness[a-zA-Z0-9_.\/-]*' -i | sort -u
   find . -iname '*harness*' -not -path '*/node_modules/*' -not -path '*/dist/*' -not -path '*/build/*'
   ```
2. Compará el resultado contra el archivo `AUDIT_REPORT_harness_to_synapse-simulator.md`
   que te voy a pasar junto con este prompt. Si aparecen variantes NUEVAS que no
   están en ese reporte (por ejemplo en archivos de código que yo todavía no
   subí como documentación), agregalas a una sección nueva "Hallazgos adicionales"
   sin tocarlas todavía.
3. Generá un archivo `MIGRATION_PLAN.md` con:
   - Lista completa de archivos a renombrar (ruta vieja → ruta nueva)
   - Lista completa de identificadores a reemplazar por archivo
   - Conteo total de cambios
   - Cualquier caso ambiguo que encontraste y no supiste clasificar
4. **PARÁ ACÁ.** Mostrame `MIGRATION_PLAN.md` completo y esperá mi confirmación
   antes de tocar un solo archivo.

## FASE 2 — Ejecución controlada (solo después de mi OK)

1. Creá una branch nueva: `git checkout -b refactor/harness-to-synapse-simulator`
2. Empezá por **contenido de archivos** (texto/identificadores), NO por nombres
   de archivo todavía — así podés hacer commits atómicos y revertir fácil si algo
   sale mal.
   - Aplicá los reemplazos según la tabla de conversión, archivo por archivo.
   - Después de cada archivo modificado, mostrame un diff resumido.
3. Recién cuando el contenido esté migrado y confirmado, hacé los **renames de
   archivos y carpetas** usando `git mv` (no `mv` + `git add`, para preservar
   historial):
   ```
   git mv brain/core/profile/web/harness_generator.py brain/core/profile/web/synapse_simulator_generator.py
   git mv brain/core/profile/web/templates/harness brain/core/profile/web/templates/synapse-simulator
   ```
   (repetir para cada ruta del `MIGRATION_PLAN.md`)
4. Volvé a correr `rg -ic 'harness'` sobre todo el repo (excluyendo las
   exclusiones de la sección anterior). El resultado esperado es CERO matches
   fuera de: comentarios históricos explícitos tipo changelog ("v4.0 se llamaba
   Harness"), y los archivos backup excluidos.

## FASE 3 — Verificación funcional

1. Corré el build / linter / type-checker del proyecto (`npm run build`,
   `go build ./...`, `python -m py_compile`, lo que corresponda por módulo).
2. Corré el test suite si existe.
3. Buscá referencias cruzadas rotas: cualquier `import`, `require`, path relativo,
   o URL interna que todavía apunte a la ruta vieja.
4. Reportame:
   - Qué compiló/testeó OK
   - Qué falló y por qué
   - Cualquier referencia a `harness` que haya quedado (con justificación de por
     qué se dejó, si aplica)

## Si algo no está claro

Preferí preguntar antes de asumir. Un rename mal hecho en una constante de
protocolo (`HARNESS_PROTOCOL_MANIFEST`) puede romper el handshake entre Cortex
y Brain silenciosamente — no falla en build time, falla en runtime. Priorizá
correctitud sobre velocidad.
