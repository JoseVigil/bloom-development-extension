# 🧩 BLOOM PLUGIN SPEC  
### Especificación del Plugin Bloom para Visual Studio / VSCode

---

## 1. PROPÓSITO

El plugin Bloom proporciona una **interfaz visual e interactiva** sobre el CLI.  
No replica la lógica interna, sino que **invoca los comandos CLI desde el entorno gráfico** para simplificar la experiencia del desarrollador.

---

## 2. OBJETIVOS PRINCIPALES

- 🖱️ Permitir la **creación rápida de BTIPs** desde archivos seleccionados.  
- 🔄 Sincronizar cambios locales en BTIPs.  
- 📤 Subir BTIPs a IAs para análisis directo.  
- 🧠 Visualizar auditorías y reportes sin salir del IDE.

---

## 3. FUNCIONALIDADES CLAVE

| Función | Descripción | Acción CLI Interna |
|----------|-------------|--------------------|
| **Crear Intent BTIP** | Seleccionar archivos → clic derecho → “Create Intent BTIP” | `bloom create intent <name> --files <paths>` |
| **Refrescar Intent** | Actualiza archivos modificados dentro del intent. | `bloom update intent <name>` |
| **Ejecutar en IA** | Envía el BTIP a la IA configurada. | `bloom ai run <name>` |
| **Ver Reporte** | Muestra el informe generado (`.report.bl`). | `bloom report <name>` |
| **Abrir Panel Bloom** | Panel lateral con lista de intents, estado y logs. | `bloom list` |

---

## 4. INTERFAZ VISUAL (UI/UX)

- Panel lateral **“Bloom Intents”** con lista expandible:  
  - System BTIPs (read-only)  
  - Intent BTIPs (editables)  

- Botones de acción contextuales:
  - ➕ Crear nuevo Intent  
  - 🔁 Actualizar Intent  
  - 🧠 Ejecutar en IA  
  - 📊 Ver Reporte  
  - 📦 Exportar Proyecto  

- Notificaciones visuales:  
  - Éxito / error en la ejecución CLI  
  - Logs y resultados IA en tiempo real  

---

## 5. ARQUITECTURA DEL PLUGIN

    [VS Studio / VSCode UI]
               │
               ▼
    [Bloom Plugin Layer]
      - Context Menu API
      - Command Palette
      - Bloom Panel UI
               │
               ▼
    [CLI Bridge]
      - Invoca comandos del CLI
      - Interpreta JSON responses
               │
               ▼
    [.bloom/ Directory Structure]

---

## 6. ROADMAP DEL PLUGIN

- Integración directa con la API Bloom Cloud.  
- Vista comparativa de diffs entre auditorías IA.  
- Auto-refresh de intents al guardar cambios.  
- Chat contextual dentro del IDE usando BTIP activo.  

---

## 7. PRINCIPIOS DE DISEÑO

- **Non-intrusive:** el plugin nunca modifica código productivo.  
- **CLI-dependent:** toda operación delega en el CLI Bloom.  
- **User-focused:** interfaz limpia, centrada en productividad.  
- **AI-native:** cada acción mantiene trazabilidad IA.  

---
