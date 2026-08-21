# Execution Layer — guardrails

Fuente normativa:
`../../docs/GOVERNANCE/ARCHITECTURE/COGNITUUM_EXECUTION_RUNTIME_ADAPTERS_NORM_v1_0.md`.

Decisión de aplicación:
`../../docs/GOVERNANCE/ARCHITECTURE/COGNITUUM_EXECUTOR_APPLICATION_DECISION_v1_0.md`.
El work se llama EXECUTOR y el target físico único es `installer/executor/`.

Documentación vigente del work: `../../docs/EXECUTOR/README.md` y
`../../docs/EXECUTOR/EXECUTOR_IMPLEMENTATION_HANDOFF_2026-08-20.md`. Los
handoffs locales se conservan sólo como compatibilidad histórica. Gate C
bloquea runtimes reales hasta aprobar DTOs y `runtime_port`.

- Esta carpeta posee lifecycle, persistencia y Evidence de ejecución.
- No interpreta ni redefine Intent/BISP.
- No contiene Intelligence Supply ni custodia secretos.
- OpenCode es el `first_party_runtime` administrado por Setup/Installer y
  Metamorph; no se modela como adapter externo genérico.
- Codex CLI y Claude Code CLI son runtimes externos detrás de adapters de CLIS
  Integration. Ningún runtime exporta formatos nativos por el puerto neutral.
- Runtime y provider/backend/model efectivo son dimensiones distintas.
- Todo cambio de contrato se versiona bajo `contracts/` y se refleja en la
  arquitectura normativa antes de modificar adapters.
- Ningún runtime accede al workspace canónico; sólo Promotion Engine promueve
  desde un execution root efímero bajo Grant y fence vigente.
