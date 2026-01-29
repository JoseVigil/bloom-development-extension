# 📜 PROMPT: Proyecto Nucleus - El Soberano de la Organización Bloom

## 🎯 Contexto
Crear **Nucleus**, un nuevo CLI modular en Go que actúa como la autoridad central de gobernanza para el ecosistema Bloom. Nucleus hereda los estándares visuales y técnicos de **Sentinel** (sistema de ayuda, versionado, build automation) pero se enfoca en la **Propiedad, Roles, Equipo y Telemetría Estratégica**.

**Misión:** Nucleus es el dueño del "Llavero" (Vault) y el juez de los "Roles". Es el componente que comunica a la organización local con el servidor central de Bloom para analíticas y actualizaciones de permisos.

---

## 🏗️ Arquitectura de Gobernanza

```
nucleus/
├── cmd/nucleus/main.go               # Punto de entrada soberano
├── internal/
│   ├── cli/                          # Help System parametrizado (Portado de Sentinel)
│   ├── core/                         # Registro, Versión y Metadata
│   ├── governance/                   # LÓGICA CORE: Roles, Propiedad y Firmas
│   ├── identity/                     # Gestión de Team y Colaboradores
│   ├── vault/                        # Interfaz con la Bóveda Maestra
│   ├── analytics/                    # Cliente de telemetría (Minimo Viable)
│   └── commands/
│       ├── system/                   # info, version, health-auth
│       ├── team/                     # add, remove, roles
│       ├── vault/                    # lock, unlock, sign
│       └── sync/                     # push-state, pull-permissions
├── scripts/build.bat                 # Automatización de compilación
├── VERSION                           # 1.0.0
└── build_number.txt                  # Auto-incremental
```

---

## 🛠️ Especificaciones de Responsabilidades (Fase 1)

### 1. Autoria y Propiedad (Governance Layer)
Implementar un sistema de **"Anclaje de Identidad"**. 
*   Nucleus debe ser capaz de emitir y verificar un archivo `ownership.json` firmado digitalmente que vincula la instalación local con una cuenta maestra.

### 2. Gestión de Roles y Equipo
Nucleus debe manejar tres niveles de autoridad:
*   **Master (Owner):** Control total de llaves y analíticas.
*   **Architect:** Puede crear proyectos y modificar automatizaciones.
*   **Specialist:** Ejecuta workers y reporta intents, pero no puede extraer llaves.

### 3. Analytics & Central Sync (The Pulse)
Nucleus es el único componente autorizado para hablar con `https://api.bloom.ai` (o similar).
*   **Minimo Viable:** Enviar latidos (`heartbeats`) que contengan: versión del sistema, número de workers activos y volumen de intents procesados (sin contenido sensible).

### 4. Vault Management (The Keyholder)
Nucleus provee la lógica para el **`vault:request-key`** que definimos. Sentinel le pide la llave a Nucleus, y Nucleus decide (basado en el rol) si autoriza la extracción desde el Master Profile de Chrome.

---

## 🚀 Instrucción de Implementación para la IA

"Genera el código base para el proyecto **Nucleus** siguiendo estas directivas estrictas:"

1.  **Herencia Técnica:** Porta el archivo `help_renderer.go` de Sentinel, pero inyecta la configuración `DefaultNucleusConfig()` para que el branding diga **"NUCLEUS - Core CLI for Bloom Ecosystem"**.
2.  **Modularidad:** Implementa el `registry.go` para que los comandos se auto-registren.
3.  **Primeros Comandos:**
    *   `nucleus info --json`: Snapshot de la organización.
    *   `nucleus vault status`: Estado de las llaves maestras.
    *   `nucleus team list`: Lista de roles y colaboradores.
4.  **Build System:** Crea el `build.bat` que incremente el build number y genere el `build_info.go`.
5.  **Ubicación:** El código debe estar preparado para vivir en `installer/nucleus` y ser compilado hacia `bin/nucleus.exe`.

---

## 💎 Valor Agregado: La "Firma de Estado"
Nucleus debe incluir un helper en `internal/governance` que genere un hash único de la carpeta `.bloom/` de un proyecto. Este hash será la base para que el Master firme las actualizaciones del equipo.


Para que el nuevo proyecto **Nucleus** nazca con el mismo ADN de **Sentinel** y respete la jerarquía de poder que diseñamos, debés proveerle a la IA los "Planos de Ingeniería" que ya funcionan.

Aquí tenés la lista exacta de archivos que debés subir al chat de la IA encargada del Bootstrap de Nucleus:

### 1️⃣ Documentos de Contexto (La "Constitución")
Estos archivos le explican a la IA **qué es** Nucleus y **cuál es su lugar** en el mundo:
*   **`BTIPS (Bloom Technical Intent Package).md`**: Vital para que entienda que Nucleus es la "Capa de Control" y Sentinel la "Capa de Ejecución".
*   **`nucleus_project_bootstrap_prompt.md`**: El prompt maestro que acabamos de redactar (el que contiene la estructura de carpetas y responsabilidades).

### 2️⃣ Estándares de Interfaz (El "ADN Visual")
Para que Nucleus se vea y se sienta igual que Sentinel (homologación de CLI):
*   **`cli/help_renderer.go` (de Sentinel)**: La IA debe portar este código pero adaptarlo a la configuración inyectable de Nucleus.
*   **`sentinel_help.txt`**: Como referencia visual de cómo debe quedar el output final (las cajas de colores, las categorías).

### 3️⃣ Arquitectura de Comandos (El "Manual de Estilo")
Para asegurar que Nucleus sea modular desde el primer bit y mantenga el estándar de Bloom:

*   **`internal/core/core.go` (de Sentinel)**: Proveer como referencia lógica. La IA debe extraer las definiciones de `CommandFactory`, `RegisteredCommand` y la función `RegisterCommand` de este archivo.
*   **`internal/core/registry.go` (NUEVO en Nucleus)**: Instrucción explícita para la IA: *"No incluyas el registro de comandos dentro de core.go como en Sentinel. Crea este archivo independiente en Nucleus para desacoplar la gestión de comandos de la estructura central"*.
*   **`Implementación de Comandos Sentinel.md`**: Proveer este manual para que Nucleus adopte el sistema de plantillas exacto para sus comandos de Roles, Vault y Equipo.

### 4️⃣ Automatización (El "Mecanismo de Parto")
Para asegurar que el sistema de build sea consistente:
*   **`scripts/build.bat` (de Sentinel)**: Para que Nucleus también tenga auto-incremento de build y generación de metadatos.
