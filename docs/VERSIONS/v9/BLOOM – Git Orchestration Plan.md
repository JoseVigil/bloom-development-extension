Perfecto. A continuación te entrego **UN ÚNICO DOCUMENTO MARKDOWN**, autónomo, estructurado y preparado para ser usado como artefacto oficial de planificación.

Este archivo lo podés:

* **Descargar / copiar tal cual**
* Adjuntar junto a `bloom_unified_spec.md`, `codebase.md` y `plugin_tree.txt`
* Usar como documento de entrada para una siguiente iteración con cualquier modelo LLM
* Integrar en repos como `/docs/architecture/git_orchestration_plan.md`

---

# 📘 **BLOOM – Git Orchestration Plan (v1.0)**

*Estrategia unificada para creación, clonación, vinculación y push explícito de Nucleus y Proyectos*
*Autor: ChatGPT · Basado en requerimientos del usuario y bloom_unified_spec.md*

---

## 📑 **Índice**

1. [Contexto General](#contexto-general)
2. [Objetivos del Sistema](#objetivos-del-sistema)
3. [Decisiones Arquitectónicas Principales](#decisiones-arquitectónicas-principales)
4. [GitOrchestrator (Diseño de Módulo)](#gitorchestrator-diseño-de-módulo)
5. [Flujos Unificados](#flujos-unificados)

   * [Nucleus: Crear](#flujo-nucleus-crear)
   * [Nucleus: Clonar](#flujo-nucleus-clonar)
   * [Nucleus: Vincular (local + remoto)](#flujo-nucleus-vincular)
   * [Proyectos: 3 Casos](#flujo-proyectos-3-casos)
6. [Interacción con Python](#interacción-con-python)
7. [Modelo de UX: Push Explícito](#modelo-de-ux-push-explícito)
8. [Decisiones Resultantes de la Ronda de Preguntas](#decisiones-resultantes)
9. [Apéndice: Convenciones & Nomenclatura](#apéndice-convenciones--nomenclatura)

---

# 1. Contexto General

Este documento describe la **planificación integral del sistema de Git Orchestration** para el ecosistema Bloom/Nucleus, basado en:

* Los requerimientos unificados de Nucleus
* La especificación arquitectónica en `bloom_unified_spec.md`
* La sesión de análisis con Claude
* Las decisiones estratégicas consolidadas durante esta interacción

El objetivo central es asegurar que Bloom gestione **repos remotos y locales de forma determinística**, permitiendo:

* Crear o clonar repositorios
* Aplicar o completar configuraciones obligatorias
* Ofrecer *UN SOLO* flujo mental unificado
* Hacer commit + push explícito y confirmable

---

# 2. Objetivos del Sistema

### 🎯 **Objetivo 1 — Unificar todos los flujos Git**

Tanto para Nucleus como para Proyectos, el patrón debe ser:
**Detectar → Crear/Clonar/Vincular → Aplicar Configuración → Stage → Push explícito**

### 🎯 **Objetivo 2 — Introducir un módulo GitOrchestrator**

Un punto único de decisión e interacción con Git y GitHub, escrito en TypeScript.

### 🎯 **Objetivo 3 — Mantener la estructura de generación en Python**

Python permanece como motor para la generación de archivos `.bloom/`, documentación y scaffolding.

### 🎯 **Objetivo 4 — Mantener la unicidad `nucleus-<org>`**

Una organización tiene exactamente **un** Nucleus.

### 🎯 **Objetivo 5 — Garantizar que el usuario siempre vea y confirme el push**

Nunca hacer push silencioso.

---

# 3. Decisiones Arquitectónicas Principales

## ✔️ 3.1 Git y GitHub se manejan **exclusivamente desde TypeScript**

Esto incluye:

* Crear repos remotos
* Inicializar repos locales
* Clonar repos
* Añadir remotes
* Commit y push
* Manejo de errores y estados
* Detección de situación local/remota

**Herramientas:**

* `simple-git`
* `@octokit/rest`
* VSCode Git Extension API

---

## ✔️ 3.2 Python queda para generación de contenido

Scripts que ya existen en tu spec:

* `generate_nucleus.py`
* `generate_project_context.py`
* `generate_codebase.py`

Python no decide nada sobre Git, solo produce archivos.

---

## ✔️ 3.3 Mantener **un único Nucleus por organización**

Convención rígida:

```
nucleus-<org>
```

No se soportan múltiples variantes por organización en esta etapa.

---

## ✔️ 3.4 Integración UX: usar **panel SCM nativo de VSCode**

Para commit/push confirmable.

Más adelante se podrá implementar un modal/webview para el “Initial Nucleus Setup”.

---

# 4. GitOrchestrator (Diseño de Módulo)

```ts
export interface GitOrchestrator {
    // Nucleus
    detectNucleusStatus(org: string): Promise<NucleusStatus>;
    createNucleus(org: string, path: string): Promise<NucleusResult>;
    cloneNucleus(org: string, path: string): Promise<NucleusResult>;
    linkExistingNucleus(localPath: string): Promise<NucleusResult>;

    // Proyectos
    createProject(name: string, type: string, nucleusPath: string): Promise<ProjectResult>;
    cloneProject(repoUrl: string, nucleusPath: string): Promise<ProjectResult>;
    linkProjectToNucleus(projectPath: string, nucleusPath: string): Promise<ProjectResult>;

    // Git Ops
    stageAll(repoPath: string): Promise<void>;
    openSCM(repoPath: string): Promise<void>;
    ensureInitialCommit(repoPath: string, msg: string): Promise<void>;
}
```

---

# 5. Flujos Unificados

---

## 🌱 Flujo Nucleus: **Crear**

### → Entrada:

* org: `"acme"`
* localPath: `~/dev/nucleus-acme`

### → Proceso:

1. Verificar si existe `nucleus-acme` en GitHub
2. Si NO existe → crear repo remoto
3. Crear carpeta local
4. `git init`
5. Agregar `origin`
6. Ejecutar `generate_nucleus.py`
7. Aplicar estructura `.bloom/`
8. `git add`
9. Abrir SCM para commit/push confirmable

---

## 🌱 Flujo Nucleus: **Clonar**

1. Detectar `nucleus-acme` remoto
2. `git clone` en local
3. Ejecutar verificación de `.bloom/`
4. Completar si falta
5. Abrir SCM para commit/push si se agregaron archivos

---

## 🌱 Flujo Nucleus: **Vincular** (local + remoto existen)

Condición:

* Carpeta local existe
* `.git` existe
* `origin` coincide con repo remoto

Flujo:

1. Validar estructura `.bloom/`
2. Generar lo que falte
3. Stage + SCM
4. Nunca clonar
5. Registrar Nucleus en bloom registry

---

# 🌱 Flujo Proyectos (3 casos)

## **Caso 1 — Clonar proyecto SIN configuración Nucleus**

1. `git clone`
2. Detectar ausencia de `.bloom/`
3. Generar `.bloom/`
4. Stage + SCM
5. Push confirmable

---

## **Caso 2 — Clonar proyecto CON config Nucleus**

1. `git clone`
2. Detectar `.bloom/` y `nucleus.json`
3. Validar consistencia
4. No generar nada
5. Registrar proyecto

---

## **Caso 3 — Crear proyecto nuevo**

1. Crear carpeta
2. `git init`
3. Crear repo en GitHub
4. Agregar `origin`
5. Ejecutar generador Python para `.bloom/`
6. Stage + SCM
7. Push inicial confirmable

---

# 6. Interacción con Python

Python se usa únicamente para:

* Generar estructura Nucleus
* Generar estructura Proyecto
* Generar documentación y contextos
* Generar templates

Ejemplo:

```bash
python generate_nucleus.py --path ~/dev/nucleus-acme
```

**Nunca para:**

* Git
* GitHub
* Clonar
* Crear repo
* Push

---

# 7. Modelo de UX: Push Explícito

### Reglas:

* **Nunca** se hace `git commit` sin confirmación del usuario
* **Nunca** se hace `git push` sin que el usuario lo vea
* Siempre se abre el **SCM panel** automáticamente

### Ejemplo de flujo:

1. GitOrchestrator agrega los archivos `.bloom/` al stage
2. Llama a:

   ```ts
   vscode.commands.executeCommand('workbench.view.scm');
   ```
3. El usuario edita el mensaje
4. Commit
5. Push

---

# 8. Decisiones Resultantes

Estas son las respuestas oficiales a las preguntas clave:

---

### ✔️ **1. TS nativo + Python sólo para generación (híbrido invertido)**

Git y GitHub → **TypeScript**
Generación de contenido → **Python**

---

### ✔️ **2. Si repo remoto y local existen → vincular (Case 3)**

Nunca clonar encima, salvo mismatch crítico.

---

### ✔️ **3. UI de push confirmable → panel SCM nativo (MVP)**

Más adelante: modal/webview.

---

### ✔️ **4. Un único Nucleus por organización**

`nucleus-<org>` estricto en esta fase.

---

### ✔️ **5. Al agregar `.bloom/` → stage + review + push confirmable**

Nunca auto-push silencioso.

---

# 9. Apéndice: Convenciones & Nomenclatura

| Elemento          | Convención                        |
| ----------------- | --------------------------------- |
| Nucleus repo name | `nucleus-<org>`                   |
| Project repo      | libre, pero siempre con `.bloom/` |
| Archivo central   | `nucleus.json`                    |
| Carpeta raíz      | `.bloom/`                         |
| Registro global   | `bloom_registry.json`             |

---

# ✔️ Documento Finalizado

Este markdown está listo para:

* Adjuntarse como artefacto arquitectónico
* Ser consumido por cualquier modelo LLM
* Formar parte de `/docs/` en tu repositorio
* Ser usado para planificar la implementación real del GitOrchestrator

Si querés, también puedo generar:
✅ la versión PDF
✅ la versión en inglés
✅ diagramas de actividad / secuencia
✅ el código base del `GitOrchestrator.ts`
Solo pedímelo.
