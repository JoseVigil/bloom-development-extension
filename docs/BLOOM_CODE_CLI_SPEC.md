# ⚙️ BLOOM CLI SPEC  
### Especificación del sistema de línea de comandos para Bloom

---

## 1. PROPÓSITO

El CLI de Bloom constituye el **núcleo operativo del ecosistema**.  
Todas las operaciones de inicialización, creación y gestión de BTIPs se ejecutan a través de comandos del CLI.  
El plugin o cualquier integración externa actúan como simples interfaces visuales del CLI.

---

## 2. ESTRUCTURA PRINCIPAL DE COMANDOS

    bloom [command] [options]

| Comando | Descripción | Ejemplo |
|----------|-------------|----------|
| `init` | Inicializa un proyecto Bloom, creando `.bloom/` y los system BTIPs base. | `bloom init` |
| `create intent <name>` | Crea un nuevo BTIP de intención técnica. | `bloom create intent cache-system --files MainActivity.java DataLoadManager.java` |
| `update intent <name>` | Actualiza los archivos de un BTIP existente con los cambios locales. | `bloom update intent cache-system` |
| `list` | Muestra todos los BTIPs disponibles en el proyecto. | `bloom list` |
| `ai run <name>` | Envía un BTIP a una IA compatible para análisis. | `bloom ai run cache-system --model grok` |
| `export` | Empaqueta todos los BTIPs en un ZIP portable. | `bloom export --all` |
| `report <name>` | Muestra o genera un informe local de auditoría. | `bloom report cache-system` |

---

## 3. CONFIGURACIÓN GLOBAL

Archivo `.bloom/manifest.json` define los metadatos del proyecto:

    {
      "project": "SmallApp",
      "version": "1.0.0",
      "bloom_version": "1.0.0",
      "system_btips": ["readme.main", "system-prompt", "architecture-guide"],
      "intents": ["cache-system", "notifications", "auth-refactor"]
    }

---

## 4. CICLO DE VIDA DE UN INTENT

1. **Creación:**
       bloom create intent cache-system --files MainActivity.java DataLoadManager.java

   → Genera `.bloom/intents/cache-system.btip/` con plantillas vacías.

2. **Ejecución con IA:**
       bloom ai run cache-system

   → Envía el contenido del BTIP a una IA, siguiendo `PROMPT MAESTRO` interno.

3. **Actualización:**
       bloom update intent cache-system

   → Refresca los archivos del BTIP con cambios locales.

4. **Exportación o Sincronización:**
       bloom export
       bloom push --remote github

---

## 5. PRINCIPIOS DE DISEÑO

- **CLI-first:** todo el flujo debe poder ejecutarse sin interfaz gráfica.  
- **Declarativo:** los BTIPs se definen en archivos `.bl` fácilmente leíbles por IA.  
- **Extensible:** soporte para múltiples backends (GPT, Claude, Grok, Gemini).  
- **Interoperable:** cada comando genera resultados trazables y reutilizables.  

---

## 6. ROADMAP FUTURO (CLI)

- `bloom diff <intent>` → compara versiones de BTIPs.  
- `bloom validate` → valida integridad de archivos y esquema `.bl`.  
- `bloom metrics` → genera métricas de auditoría.  
- `bloom sync` → sincroniza BTIPs con repositorios remotos.

---
