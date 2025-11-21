# Bloom Intent Lifecycle - Especificación Técnica

## 🎯 Objetivo

Implementar ciclo de vida minimalista para intents con gestión dinámica de archivos y regeneración automática de codebase.

---

## 📂 Estrategias de Proyecto

La estructura .bloom se genera según la estrategia del proyecto:

| Estrategia | Descripción |
|------------|-------------|
| android | Proyecto Android (Java/Kotlin) |
| ios | Proyecto iOS (Swift/Obj-C) |
| react-web | Proyecto React Web |
| node | Backend Node.js |
| python-flask | Backend Python Flask |
| php-laravel | Backend PHP Laravel |
| nucleus | Proyecto organizacional (Centro de conocimiento) |
| generic | Proyecto genérico |

Uso: `python generate_context.py --strategy=android`

---

## 🔗 Vinculación con Nucleus (Opcional)

Un proyecto BTIP puede estar vinculado a un proyecto Nucleus (organizacional).

### Archivo de vinculación: `.bloom/nucleus.json`

```json
{
  "linkedToNucleus": true,
  "nucleusId": "uuid",
  "nucleusName": "nucleus-organization",
  "nucleusPath": "../nucleus-organization",
  "projectId": "uuid-de-este-proyecto",
  "linkedAt": "ISO-timestamp"
}
```

### Beneficios de la vinculación
- El proyecto aparece en el índice del Nucleus
- Acceso a políticas y protocolos organizacionales
- Contexto compartido para análisis cross-proyecto

---

## 📋 Cambios Principales

### 1. Botones de Archivos - 3 Acciones

Cada file pill tendrá 3 íconos:

    [📄 LoginActivity.kt] [🔗] [📋] [📂] [❌]
         ↓ click          ↓    ↓    ↓    ↓
      pegar nombre    abrir copiar path finder remover
                      vscode   completo

- **📄 Nombre:** Click inserta "LoginActivity.kt" en input activo
- **🔗 Abrir VSCode:** Abre archivo en columna derecha (split)
- **📋 Copiar Path:** Copia path completo al clipboard
- **📂 Finder/Explorer:** Abre ubicación del archivo en sistema
- **❌ Remover:** Elimina archivo del intent + regenera codebase

### 2. Ciclo de Vida - 5 Estados

Estados del intent:

- **🔏 Draft** (amarillo): Intent en construcción, editable
- **✅ Generated** (verde): intent.bl generado, listo para IA
- **🟡 In Progress**: Intent activo con conversación abierta
- **✅ Completed**: Intent resuelto
- **📦 Archived**: Intent archivado

Transiciones:

    🔏 Draft ──[Submit Form]──> ✅ Generated
    ✅ Generated ──[Open in Browser]──> 🟡 In Progress
    🟡 In Progress ──[Mark Complete]──> ✅ Completed
    ✅ Completed ──[Archive]──> 📦 Archived
    ✅ Generated ──[Edit + Regenerate]──> ✅ Generated

### 3. Gestión Dinámica de Archivos

#### Agregar archivos desde Explorer

Menú contextual en Explorer:

    Click derecho en archivo/carpeta →
    ├── Bloom: Generate New Intent
    └── Bloom: Add to Intent →
        ├── 🔏 fix_login_bug
        ├── 🔏 add_payment_method
        └── ✅ improve_performance

Comportamiento:
- Agregar archivos a intent existente
- Regenerar codebase.md automáticamente
- Actualizar intent.json
- Si formulario abierto → auto-reload file pills

#### Remover archivos desde formulario

Botón ❌ en cada file pill:
- Remueve archivo de intent.json
- Regenera codebase.md
- Actualiza contador de tokens

### 4. Límite de Tokens

Visualización debajo de file pills:

    📊 Token estimate: 45,234 / 100,000 (45%)
    
    ⚠️ Warning: 95,678 / 100,000 (95%) - Consider removing files
    
    ❌ Error: 120,456 / 100,000 (120%) - Cannot generate, remove files

- Verde: 0-80%
- Amarillo: 80-100% (warning)
- Rojo: >100% (bloquea generación)

### 5. Botón Delete Intent

Ubicación en formulario (separado visualmente):

    [✨ Generar Intent]  [Cancelar]  |  [🗑️ Delete Intent]

Confirmación con popup:

    "¿Eliminar intent 'fix_login_bug'?"
    "Esto borrará la carpeta .bloom/intents/fix_login_bug/ permanentemente."
    [Cancelar] [Eliminar]

---

## 🗂️ Estructura de Archivos

### Carpeta .bloom/

```
.bloom/
├── core/
│   ├── .rules.bl
│   ├── .standards.bl
│   └── .prompt.bl
├── project/
│   ├── .context.bl
│   └── .app-context.bl
└── intents/
    ├── fix_login_bug/
    │   ├── intent.json       ← Estado y metadata
    │   ├── intent.bl         ← Generado al submit
    │   └── codebase.md       ← Regenerado dinámicamente
    └── add_payment_method/
        ├── intent.json
        ├── intent.bl
        └── codebase.md
```

### intent.json (Estructura Completa)

```json
{
  "id": "uuid-v4",
  "name": "fix_login_bug",
  "displayName": "Fix Login Bug",
  "status": "draft",
  "createdAt": "2024-01-15T10:30:00Z",
  "updatedAt": "2024-01-15T14:45:00Z",
  "content": {
    "problem": "El login falla con error 401...",
    "notes": "Usar Retrofit, mantener estilo...",
    "currentBehavior": [
      "Usuario ingresa email y contraseña",
      "Click en botón Login"
    ],
    "desiredBehavior": [
      "Validación local de formato",
      "Request al servidor con timeout 10s"
    ],
    "lastSaved": "2024-01-15T14:45:32Z"
  },
  "files": [
    "app/src/main/java/LoginActivity.java",
    "app/src/main/java/AuthService.java"
  ],
  "tokens": {
    "estimated": 8500,
    "limit": 100000,
    "percentage": 8.5
  },
  "metadata": {
    "createdAt": "2024-01-15T10:30:00Z",
    "updatedAt": "2024-01-15T14:45:32Z"
  },
  "profileConfig": {
    "profileName": "Profile 1",
    "provider": "claude",
    "account": "user@email.com"
  },
  "activeConversations": {
    "claude": {
      "conversationId": "xxx",
      "url": "https://claude.ai/...",
      "lastAccessed": "ISO-timestamp"
    }
  }
}
```

---

## 🗃️ Arquitectura - IntentSession

### Clase IntentSession

Responsabilidades:
- Coordinar modificaciones al intent desde múltiples fuentes
- Sincronizar formulario con intent.json
- Regenerar codebase automáticamente
- Prevenir race conditions

Métodos principales:

```typescript
class IntentSession {
  // Gestión de archivos
  async addFiles(files: Uri[]): Promise<void>
  async removeFile(filePath: string): Promise<void>
  
  // Regeneración
  async regenerateCodebase(): Promise<void>
  async calculateTokens(): Promise<TokenInfo>
  
  // Sincronización
  private async syncFormPanel(): Promise<void>
  private onIntentJsonChanged(): void
  
  // Ciclo de vida
  async changeStatus(newStatus: 'draft' | 'generated' | 'in-progress' | 'completed' | 'archived'): Promise<void>
  async deleteIntent(): Promise<void>
}
```

### Flujo de Sincronización

Caso: Usuario agrega archivo desde Explorer mientras formulario está abierto

    1. Explorer: Click "Add to Intent" → fix_login_bug
    2. IntentSession.addFiles() ejecuta:
       a. Agrega files a intent.json
       b. Regenera codebase.md
       c. Recalcula tokens
       d. Emite evento 'filesChanged'
    3. IntentFormPanel escucha evento:
       a. Re-renderiza file pills
       b. Actualiza contador de tokens
       c. Muestra notificación: "2 archivos agregados"

---

## 🎨 Cambios en UI

### intentForm.html

Cambios:
- Layout simple (sin grid)
- Agregar token counter debajo de file pills
- Agregar botón "Delete Intent" separado

### intentForm.css

Cambios:
- Agregar estilos para token counter (verde/amarillo/rojo)
- Estilos para 5 botones en file pill

### intentForm.js

Cambios:
- Agregar handler para 5 acciones de file pill
- Agregar confirmación de delete
- Agregar auto-reload al recibir 'filesChanged'

### intentFormPanel.ts

Cambios:
- Integrar IntentSession
- Agregar métodos para abrir archivo en VSCode
- Agregar handler para "Add to Intent"

---

## 📝 Comandos

### Comandos de Intent

| Comando | Título |
|---------|--------|
| bloom.addToIntent | Bloom: Add to Intent |
| bloom.generateNewIntent | Bloom: Generate New Intent |
| bloom.deleteIntentFromForm | Delete Current Intent |
| bloom.openFileInVSCode | Open File in VSCode |
| bloom.revealInFinder | Reveal in Finder/Explorer |

### Comandos de Chrome Profile Manager

| Comando | Título |
|---------|--------|
| bloom.manageProfiles | Manage AI Profiles |
| bloom.configureIntentProfile | Configure Profile for Intent |
| bloom.openIntentInBrowser | Open Intent in Browser |

### Comandos de Nucleus

| Comando | Título |
|---------|--------|
| bloom.createNucleusOrganization | Create Nucleus Organization |
| bloom.appendProject | Append Project to Nucleus |

### package.json - Menú contextual

```json
"menus": {
  "explorer/context": [
    {
      "command": "bloom.generateNewIntent",
      "when": "explorerResourceIsFolder || resourceScheme == file",
      "group": "bloom@1"
    },
    {
      "command": "bloom.addToIntent",
      "when": "explorerResourceIsFolder || resourceScheme == file",
      "group": "bloom@2"
    }
  ]
}
```

---

## 🔄 Flujos Principales

### Flujo 1: Crear Intent Nuevo

    1. Usuario selecciona archivos en Explorer
    2. Click derecho → "Bloom: Generate New Intent"
    3. Formulario se abre con archivos pre-cargados
    4. Usuario escribe nombre (≥3 chars)
       → IntentSession crea carpeta + intent.json (status: draft)
    5. Usuario llena problema, comportamientos, notas
    6. Click "Generar Intent"
       → Genera intent.bl + codebase.md
       → Cambia status a 'generated'
    7. Formulario se cierra
    8. TreeView muestra: ✅ fix_login_bug

### Flujo 2: Agregar Archivos a Intent Existente

    1. Usuario selecciona archivos nuevos en Explorer
    2. Click derecho → "Bloom: Add to Intent" → fix_login_bug
    3. IntentSession.addFiles() ejecuta:
       a. Agrega archivos a intent.json
       b. Regenera codebase.md
       c. Recalcula tokens
    4. Si formulario abierto → auto-reload
    5. Notificación: "3 archivos agregados a fix_login_bug"

### Flujo 3: Remover Archivo desde Formulario

    1. Usuario abre intent existente
    2. Click en botón ❌ de "AuthService.java"
    3. Confirmación: "¿Remover AuthService.java?"
    4. IntentSession.removeFile() ejecuta:
       a. Remueve de intent.json
       b. Regenera codebase.md
       c. Recalcula tokens
    5. File pill desaparece
    6. Token counter se actualiza

### Flujo 4: Regenerar Intent

    1. Usuario abre intent con status 'generated'
    2. Botón muestra: "🔄 Regenerar Intent"
    3. Usuario modifica problema/archivos/notas
    4. Click "Regenerar Intent"
       → Sobrescribe intent.bl + codebase.md
       → Actualiza intent.json.updatedAt
    5. Notificación: "Intent regenerado exitosamente"

### Flujo 5: Eliminar Intent

    1. Usuario abre intent en formulario
    2. Click "🗑️ Delete Intent"
    3. Popup confirmación:
       "¿Eliminar intent 'fix_login_bug'?"
       "Esto borrará la carpeta permanentemente."
    4. Usuario confirma
    5. IntentSession.deleteIntent() ejecuta:
       a. Elimina carpeta .bloom/intents/fix_login_bug/
       b. Cierra formulario
       c. Refresca TreeView
    6. Notificación: "Intent eliminado"

---

## 💾 AutoSave

### Objetivo

Guardar automáticamente los cambios relevantes del formulario para minimizar pérdida de trabajo.

### Alcance

**Campos incluidos:**
- name
- problem
- currentBehavior
- desiredBehavior
- notes
- **archivos seleccionados** (files array)

**El Auto-save actualiza:**
- Timestamps (content.lastSaved, metadata.updatedAt)
- Contenido del formulario completo
- Lista de archivos seleccionados

**DECISIÓN CRÍTICA: Opción B - Auto-save SÍ toca archivos**
- Auto-save guarda TODO el estado del formulario, incluyendo `files: [...]`
- Ventaja: No se pierde ningún dato del usuario
- Comportamiento: Si usuario selecciona archivos en formulario, esos archivos SE persisten

### Comportamiento esperado

**Debounce de 2 segundos:**
- Después de la última modificación en el formulario, el sistema programa una persistencia automática.

**Merge seguro:**
- Las actualizaciones parciales se fusionan con el intent.json existente evitando pérdida de campos no editados.

**Persistencia por carpeta de intent:**
- Cada intent mantiene su propia cola de cambios pendientes.

**Timestamps:**
- Al persistir se actualizan content.lastSaved y metadata.updatedAt para trazabilidad.

**No provoca generación automática:**
- El Auto-save NO dispara la creación de intent.bl
- El Auto-save NO cambia status a "generated"
- El Auto-save NO regenera codebase.md (solo comandos explícitos lo hacen)

### Efectos visibles en UI / UX

**Indicador visual de guardado:**
- Mostrar estado breve como "💾 Guardado 14:45:32" tras cada persistencia.

**Mensajes de error:**
- Si la escritura falla (permisos o disco lleno), mostrar error y opciones para reintentar.

**Integración con contador de tokens:**
- El cálculo de tokens se actualiza tras la persistencia para reflejar el contenido actual.

### Reglas de consistencia

**Merge de datos:**
- Antes de escribir, leer el intent.json actual y aplicar un merge
- Nunca sobrescribir completamente sin merge

**Inmutabilidad del status:**
- Mantener la inmutabilidad del campo "status" salvo acciones explícitas (submit/regenerate/delete)

**Conflictos concurrentes:**
- Si existen cambios desde otro proceso, priorizar el contenido local
- Marcar un flag hasConflicts=true para revisión manual

### Persistencia mínima en intent.json

Estructura que se actualizará por Auto-save:

```json
{
    "content": {
        "problem": "...",
        "notes": "...",
        "currentBehavior": [ "..." ],
        "desiredBehavior": [ "..." ],
        "lastSaved": "2025-11-17T12:34:56Z"
    },
    "files": [
        "app/src/main/java/LoginActivity.java",
        "app/src/main/java/AuthService.java"
    ],
    "metadata": {
        "createdAt": "2025-11-17T12:00:00Z",
        "updatedAt": "2025-11-17T12:34:56Z"
    }
}
```

### Observaciones operativas

**Opcional pero recomendado:**
- El Auto-save puede activarse o desactivarse por configuración del usuario.

**Tolerante a fallos:**
- En caso de error, debe reintentar y notificar sin interrumpir la edición del usuario.

**Coexistencia con operaciones manuales:**
- El Auto-save debe coexistir con las operaciones Add/Remove/Regenerate/Generate definidas en los flujos principales.

### Gestión de Archivos: Comandos Explícitos

**Regeneración de codebase.md SOLO ocurre con:**
- Comando "Add to Intent" (agregar archivos desde Explorer)
- Comando "Remove File" (botón ❌ en file pill)
- Comando "Regenerate Intent" (botón submit con status='generated')

**Auto-save NO regenera codebase.md:**
- Auto-save solo actualiza intent.json
- Regeneración de codebase requiere acción explícita del usuario

---

## 🔧 Regeneración de Codebase con Scripts Python

### Propósito

Permitir iteración y mejora del proceso de regeneración de codebase.md para optimizar el entendimiento de la IA.

### Integración con codebaseGenerator.ts

**Archivo existente modificado:**
- `src/core/codebaseGenerator.ts` se modificará para:
  - Llamar scripts Python externos cuando estén disponibles
  - Mantener fallback a generación TypeScript nativa
  - Permitir configuración de estrategia de regeneración

**Scripts Python externos:**
- Ubicación: `.bloom/scripts/`
- Propósito: Procesamiento avanzado de archivos para codebase.md
- Invocación: Opcional, configurable por usuario

**Ventajas:**
- Iteración rápida en estrategias de generación
- Experimentación con diferentes formatos
- No bloquea funcionalidad principal si scripts no están disponibles

### Estrategia de Implementación

**Paso 1: Modificar codebaseGenerator.ts**
- Agregar método `generateWithPythonScript()`
- Agregar configuración `codebaseGenerationStrategy: 'native' | 'python'`
- Mantener método `generateNative()` como fallback

**Paso 2: Detección automática**
- Al regenerar, verificar si `.bloom/scripts/generate_codebase.py` existe
- Si existe y está configurado, usar script Python
- Si no, usar generación nativa TypeScript

**Paso 3: Gestión de errores**
- Si script Python falla, caer automáticamente a generación nativa
- Notificar usuario del método usado: "Codebase regenerado (Python)" o "Codebase regenerado (Nativo)"

---

## 🌳 Tree de Archivos Completo

```
bloom-extension/
├── src/
│   ├── commands/
│   │   ├── generateIntent.ts          ← MODIFICAR (integrar IntentSession)
│   │   ├── openIntent.ts              ← MODIFICAR (abrir con IntentSession)
│   │   ├── addToIntent.ts             ← CREAR NUEVO ⚠️
│   │   ├── deleteIntentFromForm.ts    ← CREAR NUEVO ⚠️
│   │   ├── openFileInVSCode.ts        ← CREAR NUEVO ⚠️
│   │   ├── revealInFinder.ts          ← CREAR NUEVO ⚠️
│   │   ├── configureIntentProfile.ts  ← NUEVO (Chrome Profile Manager)
│   │   ├── openIntentInBrowser.ts     ← NUEVO (Chrome Profile Manager)
│   │   ├── createNucleusOrganization.ts ← NUEVO (Nucleus)
│   │   ├── appendProject.ts           ← NUEVO (Nucleus)
│   │   └── [otros existentes...]
│   │
│   ├── core/
│   │   ├── metadataManager.ts         ← MODIFICAR (nueva estructura intent.json)
│   │   ├── codebaseGenerator.ts       ← MODIFICAR (integración con scripts Python)
│   │   ├── intentAutoSaver.ts         ← CREAR NUEVO ⚠️
│   │   ├── intentSession.ts           ← CREAR NUEVO ⚠️
│   │   ├── chromeProfileManager.ts    ← NUEVO (Chrome Profile Manager)
│   │   ├── projectDetector.ts         ← NUEVO (detección de estrategia)
│   │   └── [otros existentes...]
│   │
│   ├── ui/
│   │   ├── intentForm.html            ← MODIFICAR (layout actualizado)
│   │   ├── intentForm.css             ← MODIFICAR (estilos botones)
│   │   ├── intentForm.js              ← MODIFICAR (5 acciones file pill)
│   │   ├── intentFormPanel.ts         ← MODIFICAR (integrar IntentSession)
│   │   └── [otros existentes...]
│   │
│   ├── providers/
│   │   ├── intentTreeProvider.ts      ← MODIFICAR (5 grupos por estado)
│   │   └── profileTreeProvider.ts     ← NUEVO (Chrome Profile Manager)
│   │
│   ├── models/
│   │   ├── intent.ts                  ← MODIFICAR (nueva estructura intent.json)
│   │   └── nucleus.ts                 ← NUEVO (modelo Nucleus)
│   │
│   ├── extension.ts                   ← MODIFICAR (registrar comandos nuevos)
│   └── package.json                   ← MODIFICAR (agregar comandos y menú)
│
└── .bloom/
    ├── core/
    │   ├── .rules.bl
    │   ├── .standards.bl
    │   └── .prompt.bl
    ├── project/
    │   ├── .context.bl
    │   └── .app-context.bl
    ├── scripts/
    │   └── generate_codebase.py       ← OPCIONAL (script Python)
    └── intents/
        ├── fix_login_bug/
        │   ├── intent.json
        │   ├── intent.bl
        │   └── codebase.md
        └── [otros intents...]
```

---

## 🔄 Flujo Completo de Auto-save

    1. Usuario escribe en formulario
       ↓
    2. intentForm.js detecta cambio (debounce 2s)
       ↓
    3. Envía postMessage a intentFormPanel.ts
       ↓
    4. intentFormPanel.ts llama a IntentAutoSaver.queue()
       ↓
    5. IntentAutoSaver espera 2s, luego flush()
       ↓
    6. Lee intent.json actual (metadataManager.read())
       ↓
    7. Hace merge con updates (incluyendo files array)
       ↓
    8. Escribe intent.json (metadataManager.save())
       ↓
    9. Muestra indicador: "💾 Guardado 14:45:32"

---

## ⚠️ Consideraciones Técnicas

### Normalización de Paths

```typescript
// Windows: app\src\main\LoginActivity.kt
// Linux/Mac: app/src/main/LoginActivity.kt

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/');
}
```

### Cálculo de Tokens

```typescript
// Estimación simple: 1 token ≈ 4 caracteres
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// Total del intent
tokens = sum(archivos) + problema + notas + comportamientos
```

### Regeneración de Codebase

**Triggers:**
- Agregar archivo (Add to Intent)
- Remover archivo (botón ❌)
- Regenerar intent (botón submit)

**No regenerar:**
- Al editar contenido de archivo externo
- Al cambiar nombre/problema/notas (solo auto-save)
- Al guardar automáticamente el formulario

### Sincronización con FileSystemWatcher

```typescript
const watcher = vscode.workspace.createFileSystemWatcher(
  new vscode.RelativePattern(intentFolder, 'intent.json')
);

watcher.onDidChange(() => {
  if (this.formPanel) {
    this.formPanel.reload();
  }
});
```

---

## ✅ Criterios de Éxito

- Usuario puede crear intent y volver a abrirlo
- Usuario puede agregar/remover archivos dinámicamente
- Codebase.md se regenera automáticamente con comandos explícitos
- Auto-save guarda cambios del formulario cada 2 segundos (incluyendo archivos)
- Formulario se sincroniza al agregar archivos externos
- Contador de tokens funciona correctamente
- Botón "Regenerar" aparece en intents generados
- Botón "Delete" elimina intent con confirmación
- TreeView muestra 5 grupos (Draft/Generated/In Progress/Completed/Archived)
- Archivos se abren en VSCode al hacer click en 🔗
- Path completo se copia al hacer click en 📋
- Scripts Python opcionales funcionan para regeneración de codebase
- Auto-save persiste archivos seleccionados en el formulario
- Chrome Profile Manager permite configurar perfiles por intent
- Vinculación con Nucleus funciona correctamente

---

## 📊 Estimación de Tiempo

- Fase 1 (Fundamentos): 2-3 horas
- Fase 2 (Gestión Dinámica): 2-3 horas
- Fase 3 (Ciclo de Vida 5 Estados): 2-3 horas
- Fase 4 (Auto-save): 2-3 horas
- Fase 5 (Integración Python): 1-2 horas
- Fase 6 (Chrome Profile Manager): 3-4 horas
- Fase 7 (Nucleus Integration): 2-3 horas
- Testing y ajustes: 2-3 horas

**Total estimado: 16-24 horas**
