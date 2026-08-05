# context/ — índice

Material que **no** existe en vivo en el resto del repo (por eso está acá
copiado/sintetizado). Todo lo que sí existe en vivo se referencia por path
relativo desde `../../CLAUDE.md`, no se duplica.

- `HARNESS_CONTEXT_BRIEF.md` — brief original de por qué separar el harness
  de Alfred sin perder capacidad de merge. Invariantes, contrato BISP,
  jerarquía de autoridad, principio del Marketplace de Mandates.
- `DECISION-live-source.md` — historial de la decisión de sourcing (mock
  vendorizado → referencia en vivo → proyecto dentro del mismo repo) y qué
  hacer si esta carpeta se extrae a un repo propio más adelante.
- `DECISION-ollama-role.md` — por qué Ollama local solo genera embeddings
  (no chat) y el proveedor externo es el único que razona/genera texto.
- `intent_types_full_reference.py` — los 7 tipos de intent con fase, nivel
  de confianza (`CONFIRMED_CLI` / `CONFIRMED_TREE` / `UNCONFIRMED`) y fuente
  citada. El `intent_types.py` real (`../../brain/core/intent_types.py`)
  solo cubre `ing`/`dis` — este archivo completa el resto sin inventar.
- `mock-nucleus/` — contrato soberano ficticio ("Northwind Labs") con la
  misma forma que uno real, para fixtures de test. Nunca reemplazar por
  datos de una organización real.

No hay trees estáticas acá a propósito. `../../tree/` en este repo son
mockups de diseño, no estructura real — la referencia real de un Nucleus
corriendo es `../../../elias-repos/.bloom/.nucleus-elias-repos/` (repo
hermano, ver `CLAUDE.md` para el detalle de esta corrección).
