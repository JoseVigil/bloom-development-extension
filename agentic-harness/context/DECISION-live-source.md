# Decisión — fuentes en vivo, y qué significa ahora que el proyecto vive dentro del repo

Fecha: 2026-08-05. Historial de la decisión, para que quede el razonamiento
completo y no solo la conclusión:

1. Primero se evaluó vendorizar (copiar) `contracts/` y partes de
   `brain/core/` a un repo separado, con mock de organización. Se llegó a
   armar ese paquete completo.
2. Jose planteó el riesgo de que esas copias quedaran desactualizadas
   respecto al proyecto real, y pidió referencia en vivo en lugar de
   snapshots — elegido explícitamente sobre la alternativa de
   vendorizar + manifest de procedencia + resync manual que se le ofreció.
3. Jose después decidió que la raíz del proyecto de Claude Code **es este
   mismo repo** (`bloom-development-extension/agentic-harness/`), no un
   repo externo. Esto resuelve la referencia en vivo de la forma más
   simple posible: no hace falta ningún resolver, variable de entorno ni
   mecanismo de sincronización — `../contracts/`, `../brain/core/` y
   `../docs/` ya están ahí, siempre actualizados, porque es literalmente
   el mismo checkout de git.

## Qué significa esto en la práctica, hoy

- El harness importa/lee `../contracts/types.ts`, `../contracts/errors.ts`,
  etc. por path relativo directo. Cero indirección.
- `../brain/core/intent_types.py` y `../brain/core/bisp/ollama_manager.py`
  se leen igual, en vivo.
- `../docs/BTIPS_Bloom_Technical_Intent_Package_v6_0.md` está en el mismo
  repo, path fijo y estable.
- No hace falta la Pieza de infraestructura "BloomSourceResolver" que se
  había diseñado para el escenario de repo separado. Se documenta acá por
  si hace falta más adelante (ver próxima sección), pero no es parte del
  plan de las 5 piezas mientras el proyecto viva acá.

## Si algún día esta carpeta se extrae a un repo propio (portfolio standalone)

Sigue siendo una posibilidad real — el objetivo final es "agregarlo al
perfil". Si en algún momento se decide separar `agentic-harness/` a su
propio repo público:

- Los imports/reads directos por path relativo (`../contracts/...`) dejan
  de resolver. En ese momento sí hace falta introducir el resolver
  (variable de entorno tipo `BLOOM_SOURCE_ROOT`, o volver a vendorizar un
  snapshot con manifest de procedencia).
- El trabajo de vendorizado ya hecho en la sesión anterior (contracts/
  copiado, mock-nucleus/, brain-core-reference/) no se perdió — quedó
  documentado en esa sesión y se puede reconstruir o recuperar del
  historial de conversación si se llega a ese punto.
- Hasta que eso pase, no construir la indirección de antemano — es
  complejidad sin uso mientras el proyecto viva dentro del mismo repo.
  Regla general: no resolver un problema de portabilidad que todavía no
  existe.

## Lo que NO cambia con esta decisión

- `INVARIANT-ALF-004` (el contrato soberano real nunca se carga desde
  fuera del Nucleus de la organización) sigue aplicando igual. El harness
  sigue usando `context/mock-nucleus/` como fixture, nunca un
  `.ai_bot.sovereign.bl` real de una organización real.
- El harness sigue sin firmar ni ejecutar nada directamente. Vivir en el
  mismo repo que Bloom no le da autoridad — solo le da lectura de
  contratos y motor reales.
