Aquí tienes los ejemplos directos para usar el nuevo comando `tree`:

**1. Snapshot Básico (Uso diario)**
Genera el mapa visual de todo el proyecto.
```bash
python -m core tree -o .project/.tree.bl
```

```bash
python -m core scripts tree src webview core installer package.json tsconfig.json -o tree/plugin_tree.txt
```

**2. Snapshot para la IA (Con Hash y JSON)**
Fundamental para que Gemini detecte cambios y archivos. Genera `.tree.bl` y `.tree.json`.
```bash
python -m core tree -o .project/.tree.bl --hash --json
```

**3. Mapeo Parcial (Debug)**
Si solo quieres ver carpetas específicas (ej: `src` y `docs`).
```bash
python -m core tree -o partial_tree.txt src docs
```

**4. Rutas Absolutas (Modo Plugin)**
Como lo llamaría VSCode internamente:
```bash
python -m core tree -o "C:/ruta/proyecto/.project/.tree.bl" --root "C:/ruta/proyecto" --hash
```

Aquí tienes los comandos de prueba.

> **Nota importante:** Como migramos a `typer` usando `Option` para los inputs (para soportar flags `-i`), la sintaxis cambia ligeramente respecto a tu script viejo. Ahora, para múltiples archivos, repites la flag `-i` (ej: `-i carpeta1 -i carpeta2`).

Aquí tienes la guía rápida para probar todas las funcionalidades que hemos migrado al nuevo núcleo **`core`**.

Asegúrate de estar en la raíz de tu proyecto (`bloom-development-extension`) y con tu entorno virtual activado (si estás en local).

### 1. Generador de Árbol (`tree`)
Reemplaza a `generate_tree.py`. Genera el mapa del proyecto.

*   **Mapa simple (para humanos):**
    ```bash
    python -m core tree --out tree_visual.txt
    ```

*   **Mapa completo para IA (con Hashes y JSON):**
    *Ideal para `.project/.tree.bl`*
    ```bash
    python -m core tree --out .project/.tree.bl --hash --json --root .
    ```

*   **Mapa parcial (solo carpetas específicas):**
    ```bash
    python -m core tree src core --out partial_tree.txt
    ```

---

### 2. Compresor (`compress`)
Reemplaza a `files_compressor.py`. Empaqueta código o documentación (Protocolo v2.1).

*   **Generar Codebase (Código):**
    *Toma `src` y `core`, excluye tests, guarda en carpeta `payloads`.*
    ```bash
    python -m core compress \
      --mode codebase \
      --input src \
      --input core \
      --output payloads \
      --exclude "tests,*.spec.ts"
    ```
    *(Generará: `payloads/.codebase.json` y `payloads/.codebase_index.json`)*

*   **Generar Docbase (Documentación):**
    *Toma la carpeta `.project` y el `README.md`.*
    ```bash
    python -m core compress \
      --mode docbase \
      --input codebase \
      --input docs \
      --output codebase
    ```
    *(Generará: `payloads/.docbase.json` y `payloads/.docbase_index.json`)*

---

### 3. Extractor (`extract`)
Reemplaza a `files_extractor.py`. Verifica y desempaqueta.

*   **Extracción completa:**
    *Descomprime todo el contenido en una carpeta `salida`.*
    ```bash
    python -m core extract --input payloads/.codebase.json --output salida
    ```

*   **Leer un archivo específico (Peek):**
    *Muestra el contenido en consola sin descomprimir todo (útil para debug).*
    ```bash
    python -m core extract --input payloads/.codebase.json --file src/index.ts
    ```

---

### 4. Orquestación (Stubs)
Estos comandos son la base para la futura conexión con Gemini. Por ahora solo imprimen que recibieron la orden.

*   **Simular ejecución de un Intent:**
    ```bash
    python -m core run --intent-id "uuid-1234" --phase "briefing"
    ```

*   **Simular hidratación:**
    ```bash
    python -m core hydrate --intent-id "uuid-1234"
    ```

### 💡 Tip Adicional
Siempre puedes ver la ayuda de cualquier comando agregando `--help`:

```bash
python -m core --help
python -m core compress --help
```

Aquí tienes la documentación técnica completa del módulo **Bloom Nucleus Generator** en un solo archivo Markdown, listo para ser incluido en tu documentación de desarrollador.

***

# Bloom Nucleus Generator (`init-nucleus`)

El módulo **Nucleus Generator** es la herramienta de inicialización ("Bootstrap") para repositorios organizacionales en el ecosistema Bloom. Su función es crear una estructura estandarizada de documentación viva que sirva como "Centro de Conocimiento" central para múltiples proyectos técnicos.

Este módulo reemplaza y mejora al antiguo script `generate_nucleus.py`, integrándolo nativamente en la arquitectura `core`.

## 📋 Capacidades Principales

### 1. Detección Inteligente de Entorno
El generador no solo crea archivos; analiza el entorno donde se ejecuta:
*   **Sibling Scanning:** Escanea el directorio padre (`../`) para detectar otros proyectos técnicos que conviven con el Nucleus.
*   **Stack Detection:** Analiza automáticamente la tecnología de los proyectos detectados (Node.js, Python, Android, iOS, etc.) basándose en archivos clave (`package.json`, `requirements.txt`, `build.gradle`).

### 2. Generación de Estructura Canónica
Crea la jerarquía de carpetas requerida por el estándar Bloom:
*   `core/`: Configuraciones (`nucleus-config.json`) y reglas de IA (`.rules.bl`).
*   `organization/`: Documentación de alto nivel (Misión, Visión, Políticas).
*   `projects/`: Índice dinámico y overviews de proyectos vinculados.
*   `intents/`: Espacio reservado para flujos de trabajo futuros.

### 3. Semillas Documentales (.bl)
Genera templates inteligentes ("Semillas") listos para ser hidratados por la IA o completados por humanos:
*   `_index.bl`: Un mapa visual de todos los proyectos de la organización.
*   `policies.bl`: Estándares de desarrollo y Git Flow.
*   `protocols.bl`: Protocolos de despliegue y respuesta a incidentes.

---

## 🚀 Uso desde CLI

El comando se invoca a través del módulo `core`.

### Sintaxis
```bash
python -m core init-nucleus [OPCIONES]
```

### Argumentos
| Opción | Alias | Requerido | Descripción |
| :--- | :--- | :---: | :--- |
| `--org` | | ✅ | Nombre de la organización (ej: "Acme Corp"). |
| `--url` | | ⬜ | URL del repositorio o sitio web (ej: "github.com/acme"). |
| `--root` | `-r` | ⬜ | Directorio raíz donde inicializar (default: `.`). |
| `--output` | `-o` | ⬜ | Carpeta de salida interna (default: `.bloom`). |

### Ejemplo de Ejecución
```bash
python -m core init-nucleus \
  --org "Tech Solutions Ltd" \
  --url "https://github.com/tech-solutions" \
  --root .
```

---

## 🛠 Integración Programática (VSCode Plugin)

Para invocar esta funcionalidad desde el entorno TypeScript del plugin:

```typescript
import { runBloomCore } from './bloomBridge';

async function createNucleus(orgName: string, orgUrl: string, rootPath: string) {
    const result = await runBloomCore({
        intentId: 'system-init', // ID temporal
        phase: 'hydrate',        // Fase de ejecución
        projectRoot: rootPath,
        apiKey: 'CONFIG_API_KEY',
        args: [
            'init-nucleus',
            '--org', orgName,
            '--url', orgUrl,
            '--root', rootPath
        ]
    });

    if (result.success) {
        console.log("Nucleus creado exitosamente.");
    }
}
```

---

## 📂 Estructura Generada

Al finalizar la ejecución, el directorio `.bloom` contendrá:

```text
.bloom/
├── core/
│   ├── nucleus-config.json    # Configuración JSON para la IA
│   ├── .rules.bl              # Reglas de lectura para el Nucleus
│   └── .prompt.bl             # Prompt de sistema para consultas
│
├── organization/
│   ├── .organization.bl       # Visión general y metadatos
│   ├── about.bl               # Historia y equipo
│   ├── business-model.bl      # Modelo de negocio
│   ├── policies.bl            # Reglas de código y seguridad
│   └── protocols.bl           # Procedimientos operativos
│
├── projects/
│   ├── _index.bl              # Árbol visual de proyectos vinculados
│   ├── {proyecto-a}/
│   │   └── overview.bl        # Resumen del Proyecto A
│   └── {proyecto-b}/
│       └── overview.bl        # Resumen del Proyecto B
│
└── intents/                   # Directorio vacío para futuros intents
```

---

## 🧠 Lógica Técnica

*   **Clase Principal:** `core.generators.nucleus_generator.NucleusGenerator`
*   **Método de Entrada:** `generate(org_name, org_url, output_path)`
*   **Dependencias:** `typer`, `pathlib`, `json`, `uuid`.

Esta implementación asegura que cada vez que se inicie un Nucleus, este nazca con conocimiento contextual sobre el código que lo rodea, eliminando la configuración manual de índices.