# mock-nucleus/ — terreno ficticio para tests/fixtures del harness

Todo lo que hay bajo esta carpeta es ficticio. Se construyó mirando la forma
real de `.nucleus-elias-repos/.core/` (un Nucleus real, corriendo, de la
organización `elias-repos`, revisado el 2026-08-05) pero sin copiar ni un
dato real de ahí — solo la forma: mismos nombres de archivo, mismos campos,
mismo shape de JSON.

## Qué se mockeó y por qué

- **`.ai_bot.sovereign.bl`** — el contrato soberano. En el Nucleus real de
  `elias-repos` este archivo específico no existe todavía (esa instancia
  corre sin Alfred/agente remoto activo) — así que este mock se construyó
  directamente desde la especificación de `../HARNESS_CONTEXT_BRIEF.md §1`
  y el estilo de prosa observado en `.rules.bl` real (markdown plano, sin
  JSON, con secciones).
- **`.nucleus-config.json`** — sí tiene un real de referencia directo
  (`elias-repos`). Se mantuvo el mismo shape casi campo por campo,
  reemplazando organización, proyectos, ids y paths por ficticios. El campo
  `path`/`rootPath` se dejó como placeholder `{RESOLVED_AT_RUNTIME_...}`
  para forzar que el harness lo resuelva vía `OrganizationContext` en vez de
  hardcodearlo.
- **`.meta.json`** — shape idéntico al real, con `"mock": true` agregado
  como marca explícita.

## Lo que este mock deliberadamente NO incluye

El Nucleus real de `elias-repos` tampoco tiene todavía `.ai_bot.governance.bl`,
`.ai_bot.plane.bl`, ni el sistema de Genes (`.mandates/.{id}/.genes/`) que sí
aparece en `bloom_nucleus_tree.txt` (ver `../trees/`). Sus mandates reales
usan una forma más simple: `mandate_state.json` + `domain_proposal.json`,
con fases `ingest → cluster → validate`. Este mock no intenta adelantarse a
eso: se quedó en la forma que sí está confirmada como real y corriendo.

## Regla de scrubbing aplicada

Ningún nombre de organización, proyecto, path absoluto, uuid o timestamp de
este directorio es real. La organización ficticia es "Northwind Labs"
(nombre clásico de compañía de ejemplo, sin ambigüedad de que es inventada).

Usar esta carpeta como fixture en los tests del gate/router — nunca apuntar
los tests a un Nucleus real.
