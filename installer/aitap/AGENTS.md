# installer/aitap — instrucciones de proyecto para cualquier agente

Este archivo se carga automaticamente por OpenCode al trabajar en esta
carpeta (prioridad sobre `CLAUDE.md`). Claude Code todavia no lee `AGENTS.md`
nativamente (confirmado agosto 2026) — por eso existe `CLAUDE.md` al lado,
como shim de una linea que importa este archivo. Leelo antes de escribir
codigo ademas de `README.md`.

## Decision de raiz — no reabrir sin evidencia nueva

**AITAP es el grifo. No es el implementador. Tampoco es el orquestador.**

Fuente completa del razonamiento y la resolucion:
`../../docs/AITAP/AITAP_Decision_Arquitectonica_Gateway_vs_Ejecucion.md`
(seccion "RESOLUCION", al principio del archivo).

Fuente de verdad de vocabulario (mas precisa, **v1.1**, leer si hay
cualquier duda de terminologia antes de escribir docs o codigo nuevo):
`../../docs/AITAP/AITAP_Arquitectura_Grifo_Orquestadores_v1_0.md` — fija
que Brain (`IntentExecutor`) y Alfred son los **orquestadores** que
consumen a AITAP; AITAP nunca es "orquestador" en ningun documento formal.
**Correccion v1.1, tan estricta como la de filesystem mas abajo: AITAP no
arma ni entrega el `BSIP-Response`.** Devuelve la respuesta cruda del
modelo, sin parsear; el `BSIP-Response` es lo que arma *cada orquestador*
al validar esa respuesta cruda contra el schema del Contrato D, puertas
adentro de Brain o de Alfred. AITAP nunca es dueño de ese artefacto ni
sabe que existe.

Confirmado directamente por Jose el 2026-08-12, no derivado por Cowork.
No es una pregunta abierta a re-evaluar cada vez que aparece OpenCode u
otro runtime de ejecucion en la conversacion.

## Lo que AITAP hace — exactamente tres pilares, nada mas

1. **Gateway/Grifo:** decide que modelo/proveedor de IA responde una
   solicitud de razonamiento (Gemini, Claude, OpenAI, xAI, y eventualmente
   OpenCode **usado como modelo de razonamiento**, nunca como harness).
   Gestiona prioridad, failover y circuit breaker entre proveedores.
2. **Vault (referencia, no custodia):** resuelve `key_id` contra Nucleus
   Vault — nunca guarda el secreto real. Ver `README.md` seccion
   "Decisiones ya tomadas".
3. **Contabilidad (pilar explicito, no un detalle suelto):** registra
   tokens de input/output, costo, latencia y auditoria de cada consulta,
   **por consumidor** (Brain, Alfred, los que se sumen). Esto es lo que
   permite responder "cuanto gasto Alfred este mes" sin reconstruirlo
   despues.

Su ciclo operativo completo, literal: recibe el `BSIP-Payload`, consulta
al modelo, registra la metrica en Contabilidad, devuelve la respuesta
cruda del modelo tal cual. Nada mas — ver tripwire de parseo abajo.

Expone su propio CLI (`aitap`) siguiendo el patron de `brain`
(`cli/base.py`, `categories.py`, `registry.py`, `help_renderer.py`).

## Lo que AITAP NUNCA hace — tripwires explicitos

Si estas por escribir codigo en `installer/aitap` que hace cualquiera de
estas cosas, pará: estás en el componente equivocado.

- **No agregar tools de filesystem/bash/edit/patch/diff.** AITAP no toca
  el codebase de ningun proyecto, ni siquiera el suyo propio en runtime.
- **No agregar una `CommandCategory` de ejecucion** (`EXECUTE`, `BASH`,
  `APPLY`, `RUN`, o similar). El set cerrado hoy es `SYSTEM`, `KEYS`,
  `ROUTE`, `HEALTH` (`src/aitap/cli/categories.py`). Si un caso de uso
  nuevo parece necesitar una categoria de ese tipo, el caso de uso
  pertenece a la "Implementation Layer" (todavia no construida, no vive
  acá), no a AITAP.
- **No administrar sesiones headless de OpenCode** (`opencode serve`,
  `session`, `message`, `diff`, `revert`, `fork` de la API de ejecucion).
  Eso es responsabilidad de un componente separado que **consume** a
  AITAP, no que vive dentro de el.
- **No aplicar cambios ni verificar diffs.** Esa autorizacion es dominio
  de Nucleus, no de AITAP.
- **No asumir que OpenCode-como-implementador necesita vivir en
  `installer/aitap` "por ahorrar trabajo".** Ese ahorro es exactamente el
  acoplamiento que la resolucion descarta (ver Opcion B, descartada, en
  el documento de decision).
- **No parsear ni validar el `BSIP-Response`.** AITAP devuelve la
  respuesta cruda del modelo de frontera, sin tocarla, mas alla de
  contarle tokens para Contabilidad. Si estas escribiendo codigo que
  valida la estructura `create`/`edit`/`patch`/`delete` del Contrato D, o
  que interpreta el *contenido* de la respuesta del modelo mas alla de su
  tamaño/costo/latencia, estas en el componente equivocado — eso es
  dominio exclusivo del orquestador que llamo a AITAP (Brain o Alfred),
  nunca de AITAP. Este guardrail es tan estricto como el de filesystem de
  arriba: no hay excepcion de "solo para validar rapido" ni "solo para
  loggear el contenido".
- **No confundir Contabilidad con interpretacion.** Contabilidad cuenta
  tokens/costo/latencia y audita quien consumio que — no lee ni entiende
  el contenido semantico de la respuesta. Si una funcion de Contabilidad
  necesita saber si la respuesta fue un `create` o un `edit` para hacer su
  trabajo, esa funcion ya cruzo la linea hacia parseo y no deberia existir
  en AITAP.

## Si OpenCode aparece en una tarea de AITAP

Preguntate primero: ¿esto es OpenCode-como-modelo (razona y devuelve
texto/decision, sin tocar filesystem) u OpenCode-como-harness (ejecuta
`edit`/`write`/`bash` sobre un repo real)?

- Modelo → entra por el mismo path que Claude/Gemini/OpenAI: un provider
  mas detras del gateway. Corresponde a `installer/aitap`.
- Harness → no corresponde a este directorio. Señalalo explicitamente en
  vez de implementarlo aca "por ahora".

## Contexto adicional

- `README.md` (este mismo directorio) — decisiones de lenguaje, vault,
  norma de CLI, estado del scaffold.
- `../../docs/AITAP/AITAP_Decision_Arquitectonica_Gateway_vs_Ejecucion.md`
  — razonamiento completo grifo vs. implementador.
- `../../docs/BTIPS_Bloom_Technical_Intent_Package_v6_0.md` — arquitectura
  BTIPS completa (Nucleus, Mandates, Alfred, Batcave).
- `../../agentic-harness/CLAUDE.md` — ejemplo de otro componente del mismo
  repo con el mismo estilo de contexto "pointer, no duplicar contenido".
