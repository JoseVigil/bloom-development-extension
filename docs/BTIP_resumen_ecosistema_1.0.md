# BTIP — Resumen del ecosistema

## Contexto

BTIP convierte la interacción con IA en un proceso de ingeniería reproducible.
En vez de que el conocimiento viva en prompts que se pierden, cada acción técnica
queda registrada como un **intent**: contexto, entradas, salidas y efectos,
todo guardado en el filesystem (`.bloom/`), no en la memoria del modelo.

La idea de fondo:

- **Projects** = ejecución (donde se hace el trabajo real)
- **Nucleus** = conciencia organizacional (gobierna, no desarrolla)

---

## Componentes — qué hace cada uno

### 🧠 Nucleus
El árbitro del sistema. Un solo Nucleus por organización. No escribe código de
producto: **firma, valida y decide** quién puede hacer qué. Es la autoridad
final sobre identidad, credenciales y estado organizacional.

### 🛡️ Sentinel
Daemon que mantiene el Event Bus vivo. Es el sistema nervioso: transporta
eventos entre todos los componentes aunque el usuario cierre la interfaz.

### 🧠 Brain
Motor Python que ejecuta el trabajo concreto: corre pipelines, habla con los
proveedores de IA (Gemini, Claude, GPT) y lee/escribe archivos según lo que
diga cada intent.

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
- **Harness** — debug, solo existe en builds de desarrollo
- **Companion** *(nuevo v6.0)* — panel lateral con Gemini que da una "segunda
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

- **Un Intent es la unidad ejecutable concreta.** Un solo trabajo, acotado y
  determinista: modificar código, generar documentación, explorar una
  alternativa, etc.
- **Un Mandate es un contrato estratégico firmado por Nucleus que agrupa,
  secuencia y persiste múltiples intents** bajo un objetivo organizacional
  común. El Mandate **nunca ejecuta lógica directamente** — solo orquesta,
  siempre a través de Nucleus, usando Temporal para persistir el progreso.

La jerarquía completa tiene 4 niveles:

```
Nivel 1 — Nucleus     Autoridad, gobernanza, routing, firma
Nivel 2 — Mandate     Entidad estratégica firmada, versionada
Nivel 3 — Action      Unidad semántica dentro del Mandate
Nivel 4 — Intent      Unidad ejecutable concreta (exp / cor / dev / doc)
```

El Mandate no le habla directamente a los intents: le habla a sus **Actions**,
y cada Action se resuelve como un intent concreto que Nucleus instancia y
controla. Ejemplo: un Mandate *"Estabilizar la capa de autenticación"* se
descompone en explorar módulos sin uso (`exp`) → eliminarlos (`dev`) →
actualizar la documentación (`doc`). Cada uno de esos pasos es un intent
gobernado; el Mandate es el contrato que los une.

| Un Mandate NO es / NO hace | Un Mandate SÍ es / SÍ hace |
|---|---|
| Un tipo especial de intent | Un contrato estratégico firmado |
| Un reemplazo de intents | Una capa superior que los orquesta |
| Ejecutor de lógica de negocio | Orquestador vía Nucleus exclusivamente |
| Escritor directo en `.intents/` | Solicitante a Nucleus para crear intents |
| Mutable post-creación | Inmutable — el contrato original nunca se altera |

#### 🧪 Los 5 tipos de Intent
| Tipo | Para qué sirve |
|---|---|
| `dev` | Modificar código |
| `doc` | Generar documentación |
| `exp` | Explorar alternativas |
| `inf` | Recolectar información |
| `cor` | Coordinar cambios en conflicto |

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
celular vía Alfred: quien firma, valida y ejecuta siempre es el Nucleus y el
Brain locales.
