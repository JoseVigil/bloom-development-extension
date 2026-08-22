# bloom-development-extension — contexto raiz para agentes

Este archivo es el punto de entrada. OpenCode y Codex lo leen automaticamente
al trabajar en cualquier parte de este repo. Claude Code no lee `AGENTS.md`
nativamente todavia (confirmado agosto 2026) — usa `CLAUDE.md` al lado,
que importa este archivo con `@AGENTS.md`.

Estilo de este documento y de los que referencia: **son punteros a fuentes
reales, no resumenes que puedan quedar desactualizados.** Si un dato de acá
contradice el codigo, el codigo gana — actualizá este archivo, no al revés.

## Autoridad y permisos de escritura

José Vigil es la única autoridad de diseño, decisión, nombres y alcance en
este repo. Ningún agente (Claude Code, Codex, OpenCode u otro) decide por su
cuenta qué se construye, cómo se llama, ni cuánto abarca un cambio.

**Por defecto, todo es modo lectura/propuesta.** Leer código, docs, config,
árboles, logs y `git status`; investigar; reconstruir hechos verificables;
armar hipótesis; proponer planes o alternativas — nada de eso necesita
permiso, hacelo con confianza y todas las veces que haga falta.

**Escribir sí necesita permiso explícito, cambio por cambio.** Esto incluye
crear, editar, borrar o renombrar cualquier archivo — código, tests, docs,
config, schemas — y cualquier operación de `git` (`add`, `commit`, `push`,
branches) o de pipelines/CI. No importa si el pedido original sonaba amplio
("mejorá esto", "dejalo prolijo", "avanzá con la migración"): antes de tocar
un archivo, decí exactamente cuáles vas a tocar y esperá el OK sobre esa
lista puntual.

Reglas concretas:

- Una aprobación conceptual ("me gusta esa idea", "dale, esa dirección") no
  autoriza a escribir nada — autoriza a armar el plan. El plan enumera
  archivos y cambios exactos; recién con luz verde sobre esa lista se
  ejecuta.
- Ejecutá solo lo que está en la lista aprobada. Si en el camino aparece la
  necesidad de tocar un archivo que no estaba, parate y preguntá — no lo
  sumes silenciosamente al alcance.
- No inventes nombres, carpetas, subsistemas, arquitectura ni alcance que
  José no haya pedido explícitamente.
- Ante cualquier ambigüedad sobre qué está autorizado, parate y consultá. No
  asumas la interpretación más productiva y avances sobre esa base.
- `git` y el estado durable del repo (staging, commits, push, config de CI)
  se tocan solo cuando José lo pide para esa acción puntual — nunca como
  efecto colateral de "dejar todo prolijo" o de un plan más grande.

Esto no es para frenar el trabajo — es para que lo que se construya sea
exactamente lo que José decidió, ni más ni menos.

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
proponerle a José crear uno — no crearlo por tu cuenta (ver "Autoridad y
permisos de escritura" arriba).
