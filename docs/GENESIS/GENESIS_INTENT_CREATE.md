## Lectura crítica del v1.1 — lo que falta antes del Paso 1

El orden de implementación de la Sección 12 arranca con `brain intent create --type gen`. Eso implica que Brain necesita poder crear un intent `.gen` igual que crea un `.dev` o un `.doc`. Pero hay una diferencia que el documento no especifica: **¿cómo llegan los archivos del usuario al `.raw/` antes de que el intent `.gen` exista?**

En un intent `.dev`, el usuario crea el intent y después hidrata con archivos. En el `.gen`, la operación es inversa conceptualmente: el usuario tiene archivos y quiere crear el genesis. El intent se crea *a partir* de los archivos, no antes de ellos.

Hay tres modelos posibles y necesitan una decisión antes de implementar el Paso 1:

**Modelo A — Dos comandos separados:**
```
brain intent create --type gen --name "my-genesis"
brain genesis ingest <workspace_path> --intent genesis-uuid
```
El intent se crea vacío. El `ingest` lo puebla. Sigue el mismo patrón que `brain intent create` + `brain intent hydrate` del pipeline `.dev`. Ventaja: consistencia con el modelo existente. Desventaja: dos pasos explícitos donde el primero no hace nada visible.

**Modelo B — Comando unificado:**
```
brain intent create --type gen --source <workspace_path>
```
`create` hace todo: crea la estructura, copia los archivos a `.raw/`, inicializa el `ingest_manifest.json`, y arranca el proceso de ingestión. El `gen_state.json` se escribe en fase `ingest` inmediatamente. Ventaja: una sola operación desde la perspectiva del usuario. Desventaja: el `create` de `.gen` tiene mucha más responsabilidad que el `create` de `.dev`.

**Modelo C — Comando `brain genesis` dedicado:**
```
brain genesis start <workspace_path>
```
Comando de alto nivel que abstrae la creación del intent y la ingestión en una sola operación. Brain crea el Mandate Genesis si no existe, instancia el intent `.gen`, y arranca la ingestión. Ventaja: UX más limpia, el usuario no necesita saber qué es un intent `.gen`. Desventaja: es un comando nuevo que no reutiliza la lógica de `brain intent create`.

El pendiente de la Sección 13 dice "Comando `brain genesis ingest` — diseño del CLI", pero no define si es autónomo o parte de un `brain intent create --type gen`. Esta decisión afecta cómo se escribe el Paso 1 y el Paso 2.

---

## Mi recomendación

**Modelo B** para el primer pass de implementación, con apertura a evolucionar al Modelo C cuando el CLI design esté más maduro.

La razón es práctica: el Modelo B reutiliza la infraestructura de `brain intent create` que ya existe, agrega el flag `--source` que dispara la ingestión, y mantiene el gen_state.json como coordinador del proceso. El usuario del CLI escribe un comando; Brain hace el resto en background. Cuando el Conductor (la UI) esté lista, puede llamar al mismo comando subyacente con una capa de abstracción encima.

El Modelo C es el destino final de UX, pero requiere que el comando `brain genesis` exista como categoría, que el Mandate Genesis se auto-instancie, y que Brain sepa que en un proyecto sin genesis previo ese es el primer paso. Eso es más scope del que necesita el Paso 1.

---

## Propuesta concreta para el Paso 1

Dado el Modelo B, el spec del Paso 1 es:

**`brain intent create --type gen` — spec de comportamiento:**

```
brain intent create --type gen \
  --name "genesis" \
  --source <path_or_url> \
  --nucleus-path <nucleus_root>

Comportamiento:
1. Valida que el proyecto no tenga un intent .gen previo (el genesis se ejecuta una vez)
2. Crea la estructura de directorios completa del intent .gen (todas las carpetas del tree)
3. Escribe gen_state.json con phase: "ingest", todos los campos del schema Sección 4.1
4. Si --source es una URL: clona el repo a .raw/ (reutiliza brain github clone internamente)
5. Si --source es un path local: copia los archivos a .raw/ con verificación de hashes
6. Escribe ingest_manifest.json inicial con status: "pending" para cada archivo
7. Inicia la ingestión en background (proceso separado o integrado con brain service)
8. Retorna al usuario inmediatamente con el intent_id y un mensaje de progreso

Error conditions que Brain debe manejar:
- Ya existe un intent .gen en este proyecto → error + sugerencia de usar brain intent recover
- --source no existe o no es accesible → error antes de crear nada
- El Mandate Genesis no existe → crearlo automáticamente o requerir que el usuario lo cree primero (decisión pendiente)
```

La decisión del último punto (auto-crear el Mandate Genesis vs requerirlo pre-existente) es la única que falta para que el Paso 1 esté completamente especificado. ¿Lo crea Brain automáticamente cuando el usuario ejecuta `brain intent create --type gen` por primera vez, o el Mandate Genesis tiene que existir antes?