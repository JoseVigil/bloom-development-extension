# AITAP — decisión OpenCode, BSIP Response y Executor

**Estado:** corregida por norma canónica de Architecture  
**Versión:** 1.1  
**Fecha:** 2026-08-20

OpenCode es la aplicación y servicio `first_party_runtime` de Cognituum. Setup/
Installer lo instala y descubre; Metamorph administra rollout, actualización y
compatibilidad. No es un Intelligence Provider ni una integración externa
equivalente a Codex CLI o Claude Code CLI.

Se eliminan las identidades incorrectas `opencode_intelligence` y
`opencode_execution`. Existe un único runtime `opencode`, con capacidades de
ejecución y de mediación de inteligencia. Cuando media inteligencia, la
selección y auditoría conservan como dimensiones separadas el provider/backend
real (OpenAI, Anthropic, Gemini, xAI, Ollama u otro), el modelo y la Credential
Reference aplicable. `OpenCode` nunca sustituye esos valores.
Cualquier secuencia propuesta → verificación → integración se representa como
ejecuciones explícitas, autorizadas, correlacionadas y auditables.

AITAP puede decidir separadamente runtime abstracto y provider/model, y registra
ambas decisiones y razones. Nunca parsea el BSIP Response.
Brain persiste la respuesta cruda, la parsea, valida e incorpora al BISP, y
produce después un Execution Package neutral. Ese package no contiene prompts,
comandos ni session IDs específicos de OpenCode.

Executor recibe el target abstracto y el mismo Execution Package neutral. Su
integración first-party de OpenCode capitaliza el servicio instalado, API,
sesiones headless, streaming, diff, cancelación y tool events. Sus adapters
externos separados integran Codex CLI y Claude Code CLI. Ningún
detalle nativo cruza el puerto neutral.

La conformidad funcional usa los mismos criterios para los tres runtimes sin
modificar Brain, BISP ni el contrato canónico, pero preserva su ownership:
OpenCode es first-party; Codex CLI y Claude Code CLI son externos.

Los contratos AITAP routing v1 y el registry `genesis-pilot/v1` nacieron con la
taxonomía anterior. El registry se corrige inmediatamente; los schemas v1 no se
amplían silenciosamente y requieren una revisión versionada que represente
`runtime_kind` y `effective_intelligence`.
