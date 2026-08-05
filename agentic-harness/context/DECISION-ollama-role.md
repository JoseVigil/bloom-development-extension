# Decisión — qué hace Ollama local en este harness

Fecha: 2026-08-05. Decisión de Jose, después de que se le planteara la
opción entre dos roles posibles para el brazo local.

## El problema original

Jose no tiene hardware suficiente para correr un modelo de chat completo
localmente vía Ollama — es la limitación que motivó todo este proyecto
desde el principio (ver primera conversación de esta sesión).

## La resolución

No hace falta resolverlo con hardware nuevo ni con un modelo de chat chico
forzado a andar lento en CPU. El propio `ollama_manager.py` real
(`../../brain/core/bisp/ollama_manager.py`) ya muestra la respuesta: Bloom
en producción **nunca usa Ollama para chat**. Lo usa exclusivamente para
generar embeddings (`nomic-embed-text`, ~130-280MB según variante, corre
bien en cualquier máquina moderna sin GPU).

**Decisión: el harness replica exactamente ese rol.**

- **Ollama (local)** — solo genera embeddings. Se usa para clasificar la
  tarea entrante, hacer matching semántico contra un set de tareas
  conocidas/eval set, o decidir routing — nunca para producir la respuesta
  final en texto.
- **Proveedor externo (Gemini u otro que Jose prefiera para portfolio)** —
  el único que genera texto/razonamiento real. Todo lo que el usuario
  final lee como "respuesta del harness" viene de acá.

## Qué cambia en las 5 piezas por esta decisión

- **Pieza 1 (abstracción de proveedor):** el arm de Ollama implementa
  `generate_embedding` (mismo contrato que `OllamaManager.generate_embedding`
  real), no `chat`/`generate`. El arm externo sí implementa generación de
  texto completa.
- **Pieza 2 (router):** no es "tarea simple → chat local, tarea compleja →
  chat externo". Es "clasificar/rankear la tarea vía embedding local
  (barato, rápido, sin latencia de red) → decidir cómo armar el prompt para
  el proveedor externo, o si hace falta más contexto antes de llamarlo". El
  routing decide *cómo llamar* al externo, no *si evitarlo* — la
  generación siempre es externa.

## Por qué esto es una mejor historia de portfolio, no una peor

No es "no pude correr un LLM local así que hago todo en la nube". Es "el
sistema real que ya construí usa Ollama solo para la capa barata de
clasificación semántica, y mi harness replica esa misma disciplina de
diseño" — es el mismo patrón que usan sistemas de producción reales
(embeddings locales baratos para retrieval/routing, LLM caro solo cuando
hace falta razonar). Es más preciso técnicamente que "corro todo local" y
no depende de que la demo ande lenta en una laptop sin GPU.

## Qué NO se descarta

Si en algún momento Jose consigue hardware con más capacidad, o quiere
sumar la Opción B (chat local con un modelo mínimo tipo `qwen2.5:0.5b` o
`llama3.2:1b`) como demo adicional, el diseño de Pieza 1 debería dejar el
arm de Ollama fácilmente extensible a `chat()` además de
`generate_embedding()` — mismo patrón de factory/health-check, un método
más. No hay que cerrar esa puerta, solo no construir para ese caso hoy.
