# AITAP — decisión de Intelligence y Execution Routing

**Estado:** `SUPERSEDED` por Runtime and Intelligence Routing v2
**Versión:** 1.0  
**Fecha:** 2026-08-20

AITAP es dueño de la decisión abstracta de grifo en dos espacios separados:

1. `intelligence_provider`: provider/backend y model para inferencia;
2. `execution_runtime`: target abstracto para ejecución, clasificado como
   `first_party_runtime` o `external_runtime`.

La segunda dimensión amplía el routing vigente, pero no amplía la ejecución.
AITAP devuelve un target y razones auditables. Executor materializa la decisión:
resuelve OpenCode mediante integración first-party y Codex CLI/Claude Code CLI
mediante adapters externos.

Brain conserva Intent/BISP, stages, turns, persistencia y validación. Temporal
autoriza ejecución, pausa, retry y reevaluación. Nucleus autoriza policies,
grants y overrides. Vault custodia secretos. AITAP no ejecuta código, no toca
filesystem, no posee checkpoints y no administra procesos o sesiones CLI.

La primera policy es `genesis-cross-cli-proof/v1`: routing determinístico por
stage y un cambio deliberado de `codex_cli` a `claude_code_cli` durante `dev`.
La variante de conformidad sustituye solamente el recovery target por
`synapse_simulator`.

Contratos canónicos del primer corte:

- `installer/aitap/contracts/v1/routing-request.schema.json`;
- `installer/aitap/contracts/v1/routing-decision.schema.json`;
- `installer/aitap/contracts/v1/capability-descriptor.schema.json`.

Esta decisión reemplaza únicamente la frase previa que limitaba el routing de
AITAP a provider/model. Mantiene intactos todos los guardrails negativos.

Migración vigente:
[`AITAP_Runtime_Intelligence_Routing_v2.md`](./AITAP_Runtime_Intelligence_Routing_v2.md).

La representación única de OpenCode como runtime first-party y la separación de
su provider/model efectivo se rigen por
[`AITAP_Decision_OpenCode_BSIP_CLIS_v1.md`](./AITAP_Decision_OpenCode_BSIP_CLIS_v1.md).
