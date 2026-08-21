# bloom-development-extension — contexto raiz para agentes

Este archivo es el punto de entrada. OpenCode lo lee automaticamente al
trabajar en cualquier parte de este repo. Claude Code no lee `AGENTS.md`
nativamente todavia (confirmado agosto 2026) — usa `CLAUDE.md` al lado,
que importa este archivo con `@AGENTS.md`.

Estilo de este documento y de los que referencia: **son punteros a fuentes
reales, no resumenes que puedan quedar desactualizados.** Si un dato de acá
contradice el codigo, el codigo gana — actualizá este archivo, no al revés.

## Mapa de sistemas (de arriba hacia abajo)

- **BTIPS** — capa de ingenieria de intencion del sistema completo.
  Arquitectura completa: `docs/BTIPS_Bloom_Technical_Intent_Package_v6_0.md`.
  Tesis central: la intencion de ingenieria (BISP) sobrevive al modelo, al
  proveedor y a la sesion — el executor es reemplazable, el intent no.
- **BISP** — unidad de intencion / trabajo cognitivo-ingenieril (intent,
  objective, context, constraints, decisiones previas, findings, estado,
  outputs). Referencia de implementacion real: `brain/commands/bisp/`,
  `brain/core/bisp/ollama_manager.py`. El contrato de output
  `payload.json / index.json / response/{...}` esta documentado en
  `agentic-harness/CLAUDE.md` seccion "Logging en forma BISP".
- **AITAP** (`installer/aitap/`) — tres pilares, nada mas: Gateway
  (routing de runtime y, por separado, de provider/model efectivo), Vault
  (referencia `key_id` contra Nucleus, nunca el secreto) y Contabilidad
  (tokens/costo/latencia/auditoria por consumidor). **No ejecuta codigo ni
  toca filesystem. No es el orquestador** — Brain (`IntentExecutor`) y
  Alfred lo son, AITAP es llamado por ellos, nunca al reves. **Tampoco
  parsea ni valida el `BSIP-Response`**: devuelve la respuesta cruda del
  modelo; el `BSIP-Response` lo arma cada orquestador al parsear esa
  respuesta contra el schema del Contrato D — AITAP no es dueño de ese
  artefacto. Decision original:
  `docs/AITAP/AITAP_Decision_Arquitectonica_Gateway_vs_Ejecucion.md`.
  Vocabulario preciso (v1.1 — tres pilares, quien parsea el
  `BSIP-Response`, ciclo completo con OpenCode):
  `docs/AITAP/AITAP_Arquitectura_Grifo_Orquestadores_v1_0.md`.
  Guardrail operativo: `installer/aitap/AGENTS.md`.
- **Execution Layer / Executor** — Execution Layer es el plano abstracto;
  **Executor** es la aplicación first-party Go aprobada que lo implementará,
  con binario `executor.exe`, servicio/CLI propios y target source único
  `installer/executor/`. El staging actual vive en `installer/execution/` hasta
  migración explícita. OpenCode es runtime first-party; Codex/Claude CLI son
  runtimes externos descubiertos. Norma:
  Aplicación: `docs/EXECUTOR/README.md`. Decisión superior:
  `docs/GOVERNANCE/ARCHITECTURE/COGNITUUM_EXECUTOR_APPLICATION_DECISION_v1_0.md`.
- **Nucleus** (`installer/nucleus/`, Go) — capa de gobernanza. Dueño del
  vault de credenciales (`internal/vault/vault.go`, respaldado por el
  Keyring del SO). Tambien el dominio que deberia autorizar cambios reales
  de codigo que proponga Executor — ese bridge especifico
  todavia no esta definido, no asumir que es el mismo `nucleus vault`.
- **Brain** (`brain/`, Python) — ejecuta comandos, vectoriza contexto,
  administra credenciales por proveedor hoy (`brain/shared/credentials/`).
  Patron de CLI (`CommandRegistry`/`BaseCommand`/`CommandCategory`/
  `render_help`) que `installer/aitap` reutiliza deliberadamente.
- **Alfred** (`installer/alfred/`, Python) — capa de voz/conversacion,
  enruta sin firmar nunca. Ver `installer/alfred/pyproject.toml`.

## Norma de CLI del ecosistema

Todo servicio expone `--help` humano y una variante JSON machine-readable.
Dos implementaciones del mismo contrato, segun lenguaje:
- Go (`nucleus`, `sentinel`, `metamorph`, `sensor`): cobra + `--json-help`,
  build scripts vuelcan a `installer/help/<app>_help.{json,txt}`.
- Python (`brain`, `aitap`): typer + `CommandRegistry`/`BaseCommand`/
  `CommandCategory` + `render_help()` con modos texto/JSON/AI-native.

`installer/aitap` todavia NO vuelca a `installer/help/` compartido — es a
proposito, ver `installer/aitap/README.md`.

## Contexto scoped por directorio (mas especifico gana)

- `installer/aitap/AGENTS.md` + `installer/aitap/README.md`
- `docs/EXECUTOR/AGENTS.md` + `docs/EXECUTOR/README.md`
- `agentic-harness/CLAUDE.md`

Si vas a trabajar en una carpeta que no tiene su propio `AGENTS.md`/
`CLAUDE.md` todavia y el trabajo es no trivial, consideralo una señal para
crear uno en vez de asumir convenciones.
