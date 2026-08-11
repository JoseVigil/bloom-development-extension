"""Alfred — núcleo conversacional real de Bloom.

Migrado desde agentic-harness/harness/ (portfolio) el 2026-08-09. Ya no es
portfolio: usa contexto real de organización (.ai_bot.sovereign.bl,
.rules.bl) y es la voz conversacional que eventualmente se empaqueta como
ejecutable propio (installer/alfred), gestionado por Metamorph igual que
Brain.

Distinto de Alfred-Go (nucleus/internal/governance/alfred.go,
`nucleus alfred start`), que es el custodio angosto de gobernanza —
verifica intents contra la constitución, devuelve APPROVED/DENIED. Este
paquete es la capa conversacional que, más adelante, puede invocar a
Alfred-Go como una tool (POST a localhost:48216/alfred/verify) cuando
necesite un veredicto de gobernanza en medio de la charla.
"""
