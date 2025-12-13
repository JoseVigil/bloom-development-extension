Aquí tienes los ejemplos directos para usar el nuevo comando `tree`:

**1. Snapshot Básico (Uso diario)**
Genera el mapa visual de todo el proyecto.
```bash
python -m core tree -o .project/.tree.bl
```

```bash
python -m core tree src webview core installer package.json tsconfig.json -o tree/plugin_tree.txt
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

