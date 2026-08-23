# BTIPS — Resumen del ecosistema

## Contexto

BTIPS convierte la interacción con IA en un proceso de ingeniería reproducible.
En vez de que el conocimiento viva en prompts que se pierden, cada acción técnica
queda registrada como un **intent**: contexto, entradas, salidas y efectos,
todo guardado en el filesystem (`.bloom/`), no en la memoria del modelo.

La idea de fondo:

- **Projects** = ejecución (donde se hace el trabajo real)
- **Nucleus** = conciencia organizacional (gobierna, no desarrolla)

---

## Componentes — qué hace cada uno

### 🧠 Nucleus
La autoridad de gobierno del sistema. Existe un solo Nucleus por organización.
Conserva identidad, firma, Vault y estado organizacional. No interpreta Intents,
no selecciona runtimes o modelos y no realiza la ejecución técnica.

### 🛡️ Sentinel
Daemon que mantiene el Event Bus vivo. Es el sistema nervioso: transporta
eventos entre todos los componentes aunque el usuario cierre la interfaz.

### 🧠 Brain
Motor cognitivo Python y dueño de los Intents/BISP. Construye contexto y
`BSIP-Payload`, consume inteligencia mediante AITAP, persiste y valida la
respuesta del modelo y produce trabajo técnico neutral cuando una acción debe
ser materializada.

### 🚰 AITAP
El grifo del ecosistema. Tiene exactamente tres pilares:

- **Gateway / Grifo** — selecciona por separado el runtime y el
  proveedor/backend + modelo efectivos.
- **Vault por referencia** — resuelve `key_id` contra Nucleus Vault sin
  custodiar el secreto.
- **Contabilidad** — registra tokens, costo, latencia y consumo por consumidor.

Brain y Alfred consumen AITAP cuando necesitan inteligencia. AITAP devuelve la
respuesta cruda; cada consumidor la interpreta. AITAP decide routing, pero no
ejecuta código ni administra runtimes.

### ⏳ Temporal
Mantiene workflows durables de Intents, Actions y Mandates. Coordina dispatch,
pausa, reanudación, retry y recuperación. No interpreta el BISP ni ejecuta
herramientas.

### ⚙️ Execution Layer y Executor
**Execution Layer** es el plano abstracto de ejecución. **Executor** es la
aplicación first-party Go que lo implementa. Recibe trabajo neutral de Brain y
la decisión de runtime de AITAP; prepara el entorno aislado, administra procesos
y sesiones, integra el runtime mediante adapters y devuelve Events, Result y
Evidence.

Executor no interpreta Intents/BISP ni selecciona runtime, proveedor o modelo.

### 🖥️ Runtimes de procesamiento

- **OpenCode** — runtime first-party administrado por Bloom.
- **Codex CLI** — runtime externo descubierto y operado mediante Executor.
- **Claude Code CLI** — runtime externo descubierto y operado mediante Executor.

El runtime y la inteligencia efectiva son dimensiones separadas. OpenCode no
es un proveedor de inteligencia, y elegir un CLI no determina por sí mismo el
proveedor/backend o modelo.

### 🤖 Cognituum Runner
Runtime propio de automatización controlada. IonPump interpreta recipes `.ion`,
Synapse transporta los comandos y Runner ejecuta la automatización first-party.
Cortex conserva la captura de contexto del navegador.

### ⚙️ Host
Puente en C++ entre Brain y el navegador (Cortex). Bajo nivel, poco visible,
pero necesario para que ambos mundos se comuniquen.

### 🔌 Bootstrap
Control Plane independiente, un proceso Node.js que corre **fuera de VS Code**
y que Nucleus lanza y supervisa como proceso hijo (`bootControlPlane()`).
Levanta el WebSocket Server (puerto 4124) y el API Server (puerto 48215),
reutilizando los mismos módulos compilados del VS Code Plugin (`out/`) pero
con el módulo `vscode` interceptado por un stub vacío en tiempo de build, lo
que le permite correr de forma standalone. Existe porque esos servidores no
pueden depender de que el editor esté abierto: si VS Code se cierra, el
Bootstrap sigue corriendo para que Nucleus no pierda su puente hacia el
plugin y el webview. No reemplaza al VS Code Plugin — ambos corren en
paralelo y comparten módulos, pero tienen ciclos de vida independientes.

### 🎛️ Bloom Conductor
La terminal de gobernanza. Interfaz standalone (Electron) donde se observa el
Event Bus en tiempo real y se crean intents, especialmente los de coordinación
(`cor`) para resolver conflictos entre cambios.

### 🧩 VS Code Plugin
La superficie de trabajo diaria del developer. A diferencia del Conductor,
tiene acceso directo al código que se está editando — eso hace que los intents
que genera sean más precisos.

### 🌐 Bloom Cortex
Extensión de Chrome que conecta al usuario con las webs de IA. Vive en 4 páginas:
- **Discovery** — onboarding inicial
- **Landing** — dashboard del perfil activo
- **SynapseSimulator** — debug, solo existe en builds de desarrollo
- **Companion** — panel lateral con Gemini que da una "segunda
  opinión" sin ensuciar la sesión principal de IA del ingeniero

### 🌱 Bloom Sensor
Mide presencia humana (sesión activa, bloqueada, idle) y calcula un
`energy_index`. Es un observable pasivo: no ejecuta nada, solo informa.

### 🔄 Metamorph
El actualizador del sistema. Compara qué versiones hay instaladas contra lo
que debería haber, y actualiza binarios de forma atómica (todo o nada, con
rollback automático si algo falla).

### 🧪 Intent vs 🏛️ Mandate — no son lo mismo

Esta es la distinción que más importa entender bien:

- **Un Intent es la unidad de intención concreta.** Un solo trabajo, acotado y
  determinista: modificar código, generar documentación, explorar una
  alternativa, incorporar material o curar su topología semántica.
- **Un Mandate es un contrato estratégico firmado por Nucleus que agrupa,
  secuencia y persiste múltiples intents** bajo un objetivo organizacional
  común. El Mandate **nunca ejecuta lógica directamente**: Nucleus conserva
  su autoridad y firma, Brain interpreta los Intents y Temporal mantiene el
  workflow durable.

La jerarquía completa tiene 4 niveles:

```
Nivel 1 — Nucleus     Autoridad, gobernanza y firma
Nivel 2 — Mandate     Entidad estratégica firmada, versionada
Nivel 3 — Action      Unidad semántica dentro del Mandate
Nivel 4 — Intent      Unidad de intención (dev/doc/exp/inf/cor/ing/dis)
```

El Mandate no le habla directamente a los intents: le habla a sus **Actions**,
y cada Action se resuelve como un intent concreto. Ejemplo: un Mandate
*"Estabilizar la capa de autenticación"* se
descompone en explorar módulos sin uso (`exp`) → eliminarlos (`dev`) →
actualizar la documentación (`doc`). Cada uno de esos pasos es un intent
gobernado; el Mandate es el contrato que los une.

El **Mandate Genesis** estructura un proyecto mediante el flujo resumido:
incorporar material (`ing`) → consolidar Genes (`ing`) → curar la topología
de Dominios (`dis`) → producir documentación inicial (`doc`).

| Un Mandate NO es / NO hace | Un Mandate SÍ es / SÍ hace |
|---|---|
| Un tipo especial de intent | Un contrato estratégico firmado |
| Un reemplazo de intents | Una capa superior que los orquesta |
| Ejecutor de lógica de negocio | Contrato coordinado mediante Actions e Intents |
| Escritor directo en `.intents/` | Solicitante a Nucleus para crear intents |
| Mutable post-creación | Inmutable — el contrato original nunca se altera |

#### 🧪 Los 7 tipos de Intent
| Tipo | Para qué sirve |
|---|---|
| `dev` | Modificar código |
| `doc` | Generar documentación |
| `exp` | Explorar alternativas |
| `inf` | Recolectar información |
| `cor` | Coordinar cambios en conflicto |
| `ing` | Incorporar material y sembrar el linaje de Genes |
| `dis` | Curar la topología entre Dominios y Genes |

#### 🏛️ Mandates — además, el producto del ecosistema
Por ser contratos firmados, versionados y autocontenidos, los Mandates son
transferibles entre organizaciones: se pueden publicar en un marketplace como
know-how operativo empaquetado (por ejemplo, "SOC2 Audit Prep"), y otra
organización los adopta y los ejecuta en su propio Nucleus, con sus propios
datos.

### ☁️ Batcave
El control plane remoto (corre en GitHub Codespaces). No tiene lógica de
negocio propia: valida identidad, distribuye actualizaciones firmadas y
habilita el túnel seguro hacia el sistema local.

### 🦇 Alfred
El agente remoto. Traduce instrucciones en lenguaje natural en intents o
Mandates, y los envía al Nucleus local. Es el único punto del ecosistema que
permite operar el sistema sin estar físicamente en la máquina.

### 📱 App Mobile
El cliente de Alfred. Permite emitir instrucciones, aprobar acciones y
monitorear el sistema desde el celular. La autoridad nunca se mueve del
Nucleus local — el celular solo es el canal de entrada de la intención.

---

## El principio que atraviesa todo

> **El acceso puede ser remoto. La autoridad siempre es local.**

No importa si la instrucción nace en el Conductor, el VS Code Plugin o el
celular vía Alfred: Nucleus conserva la autoridad, Brain interpreta el
Intent/BISP, Temporal coordina el workflow, AITAP selecciona inteligencia y
runtime, y Executor materializa el trabajo mediante OpenCode o un CLI externo.
