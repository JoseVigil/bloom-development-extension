# Bloom Workspace — Technical Reference
> `workspace` · v0.1 · Electron (Windows x64) · Estado: Incipiente · Internal Dev Reference

---

## Ubicación en el árbol del proyecto

```
bloom-development-extension/
└── conductor/
    ├── setup/          ← Proyecto: Installer (documentado)
    ├── shared/         ← Logger y utilidades compartidas entre proyectos
    └── workspace/      ← Proyecto: Workspace (este documento)
        ├── main_conductor.js
        ├── conductor.html
        ├── preload_conductor.js
        ├── assets/bloom.ico
        ├── package.json
        └── build_info.json
```

**Ejecutable producido:** `installer/native/bin/win64/conductor/bloom-conductor.exe`  
**Nombre de ventana:** `Bloom Nucleus Workspace`  
**Background color actual:** `#0f0f1e` (legacy — reemplazar por `#080A0E` del Design System BTIPS v1.0)

---

## Relación con el Installer

Los dos proyectos son **ejecutables independientes** que comparten el directorio `shared/` (logger). El Installer despliega `bloom-conductor.exe` como parte del milestone `binaries` (M04) y lo copia a `%LOCALAPPDATA%\BloomNucleus\bin\conductor\`. No hay dependencia de código en runtime — se comunican únicamente a través del filesystem (`nucleus.json`) y del proceso `nucleus.exe`.

```
Installer (setup/)     →  despliega  →  bloom-conductor.exe
                       →  escribe    →  nucleus.json (installation.completed)
                       →  crea       →  master_profile UUID

Workspace (workspace/) →  lee        →  nucleus.json (verifica instalación)
                       →  invoca     →  nucleus.exe (health, profiles, launch)
```

---

## Estado Actual del Proyecto

El workspace es un proyecto **funcional mínimo**. Tiene estructura Electron correcta y una UI operativa básica, pero está lejos de reflejar las capacidades definidas en BTIPS v3.0 para el Conductor.

### Qué existe y funciona

**`main_conductor.js`**

- Modo CLI (`--version`, `--info`, `--version-json`) implementado correctamente con el patrón `app.whenReady() → output → app.exit(0)`. Esto permite que Metamorph interrogue el binario sin abrir ventana.
- Verificación de instalación al arrancar: lee `nucleus.json`, confirma `installation.completed === true` y verifica que `nucleus.exe` existe. Si falla, muestra diálogo de error y cierra.
- 5 handlers IPC registrados: `nucleus:health`, `nucleus:list-profiles`, `nucleus:launch-profile`, `nucleus:create-profile`, `nucleus:get-installation`.
- Invoca `nucleus.exe` via `execAsync` (shell command) — funciona pero es frágil comparado con `spawn` con JSON parsing robusto.

**`preload_conductor.js`**

- Expone `window.nucleus` con los 5 métodos correspondientes a los handlers IPC. API limpia y correctamente aislada con `contextBridge`.

**`conductor.html`**

- UI con dos secciones: System Health (badge + service grid) y Profiles (lista + botones Launch / New Profile).
- Health polling cada 10 segundos via `setInterval`.
- Todo el CSS está inline en el archivo — sin archivo externo, sin Design System aplicado.
- Paleta visual: gradiente púrpura/rosa legacy — **no usa BTIPS v1.0**.
- Usa `prompt()` nativo del navegador para crear perfiles — patrón inaceptable para producción.
- No hay manejo de errores consistente — algunos casos usan `alert()`.

### Qué falta según BTIPS v3.0

Comparando el estado actual contra la definición del Conductor en el BTIPS:

| Capacidad BTIPS | Estado |
|---|---|
| Event Bus Visualization (observar eventos en tiempo real) | ❌ No existe |
| Intent Editor (crear/editar intents con sintaxis asistida) | ❌ No existe |
| Vault Shield (visualización de acceso a credenciales) | ❌ No existe |
| Project Switcher (Nucleus ↔ Projects) | ❌ No existe |
| Rehydration automática desde `.bloom/` | ❌ No existe |
| Comunicación directa con Nucleus via HTTP/WebSocket | ⚠️ Parcial — solo CLI via execAsync |
| Cognitive Merge (intent `cor`) | ❌ No existe |
| Design System BTIPS v1.0 | ❌ Usa paleta legacy |
| Stateless UI (reconstruye estado desde filesystem) | ❌ No implementado |
| Sistema de pantallas / navegación | ⚠️ Mínimo — una sola vista |

---

## Arquitectura Actual

```
main_conductor.js
│
├── CLI MODE (--version / --info / --version-json)
│   └── app.whenReady() → stdout → app.exit(0)
│
└── GUI MODE
    ├── checkInstallation()
    │   ├── Lee nucleus.json
    │   └── Verifica nucleus.exe
    │
    ├── createWindow()
    │   ├── BrowserWindow 1000×700
    │   └── Carga conductor.html
    │
    └── IPC Handlers
        ├── nucleus:health          → execAsync "nucleus.exe --json health"
        ├── nucleus:list-profiles   → execAsync "nucleus.exe --json profile list"
        ├── nucleus:launch-profile  → execAsync "nucleus.exe --json launch <id>"
        ├── nucleus:create-profile  → execAsync "nucleus.exe --json profile create <name>"
        └── nucleus:get-installation → fs.readJson(nucleus.json)
```

---

## Deuda Técnica Identificada

### Crítica (bloquea desarrollo futuro)

**1. CSS inline en conductor.html**  
Todo el estilo está en un `<style>` tag dentro del HTML. Imposible mantener ni aplicar el Design System sin extraerlo a `workspace.css`.

**2. `execAsync` para invocar Nucleus**  
Usa `exec()` con string interpolación: `"${NUCLEUS_EXE}" --json health`. Frágil ante rutas con espacios, sin manejo de timeout, sin parser robusto de JSON mezclado con logs. El Installer resolvió esto con `spawn` + parser incremental de JSON — el mismo patrón debe aplicarse aquí.

**3. `prompt()` y `alert()` nativos**  
Incompatibles con el diseño BTIPS. Deben reemplazarse por componentes UI propios.

**4. Paleta visual legacy**  
Gradiente `#0f0f1e → #1e1e3f`, `#a855f7`, `#ec4899`. Debe migrar a BTIPS v1.0 completo.

**5. `backgroundColor: '#0f0f1e'` en BrowserWindow**  
Debe actualizarse a `#080A0E` para evitar flash durante la carga.

### Importante (limita escalabilidad)

**6. Sin sistema de pantallas/navegación**  
Una sola vista plana. No hay router ni estructura para añadir Event Bus Visualization, Intent Editor, etc.

**7. Sin WebSocket / conexión persistente a Nucleus**  
Cada operación es una invocación CLI puntual. El Event Bus Visualization requiere una conexión WebSocket persistente a Nucleus — arquitectura que no existe todavía.

**8. Health polling via setInterval**  
10 segundos hardcodeado. Sin cleanup robusto, sin backoff, sin indicación visual de que está polling.

**9. Nombre de variable `NUCLEUS_JSON` apunta a ruta hardcodeada**  
`path.join(process.env.LOCALAPPDATA, 'BloomNucleus', 'config', 'nucleus.json')`. Debería derivarse de un módulo `config/paths.js` compartido con el Installer, igual que el resto del ecosistema.

---

## Próximos Pasos Recomendados

En orden de prioridad para habilitar desarrollo real:

**Paso 1 — Estructura de archivos**  
Extraer CSS a `workspace.css`, separar lógica de UI en `renderer_conductor.js`. Establecer la misma estructura `src/` que usa el Installer.

**Paso 2 — Design System**  
Aplicar BTIPS v1.0 completo: variables CSS, Syne + DM Mono, paleta, componentes base (botón primario, botón ghost, state block, progress thread).

**Paso 3 — Reemplazar execAsync por spawn robusto**  
Extraer un helper `executeNucleusCommand(args)` idéntico al del Installer. Reúsa el patrón de parser JSON incremental ya probado.

**Paso 4 — Sistema de pantallas**  
Definir la navegación entre vistas antes de añadir más features. Mínimo: Dashboard, Profiles, Logs. Permite crecer sin reescribir la estructura.

**Paso 5 — WebSocket hacia Nucleus**  
Prerequisito para Event Bus Visualization. Nucleus expone un endpoint — el Workspace necesita conectarse y mantener la conexión abierta.

---

## Notas de Rename

El proyecto se llama `workspace` pero los archivos aún usan nomenclatura `conductor`:

| Archivo actual | Nombre objetivo |
|---|---|
| `main_conductor.js` | `main.js` |
| `conductor.html` | `workspace.html` o `index.html` |
| `preload_conductor.js` | `preload.js` |
| `window.nucleus` (API expuesta) | `window.workspace` o mantener `window.nucleus` |
| `backgroundColor: '#0f0f1e'` | `'#080A0E'` |
| `title: 'Bloom Nucleus Workspace'` | ya correcto |

El rename de archivos puede hacerse gradualmente — lo que importa es que el `package.json` del proyecto declare `"name": "bloom-workspace"` y que `bloom-conductor.exe` eventualmente pase a llamarse `bloom-workspace.exe` cuando el ejecutable se rebuildeé.

---

*Snapshot técnico del estado inicial del proyecto workspace. Base para planificación de desarrollo. Última actualización basada en código fuente: `main_conductor.js` · `conductor.html` · `preload_conductor.js` · BTIPS v3.0.*