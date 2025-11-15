# 🌸 BLOOM BASE CONCEPTO  
### Sistema de Documentación Inteligente - Bloom Technical Intent Packages (BTIP)

---

## 1. PROPÓSITO GENERAL

Bloom es un sistema diseñado para **crear, mantener y consultar documentación técnica y arquitectónica viva** que pueda ser interpretada y auditada por inteligencias artificiales.  
Su núcleo se basa en el concepto de **Bloom Technical Intent Packages (BTIPs)**: unidades autocontenidas que agrupan código, documentación y contexto de análisis en un solo conjunto coherente.

Bloom unifica tres necesidades:

1. 📚 **Estandarizar la documentación técnica** dentro de los proyectos.  
2. 🤖 **Proveer contexto inmediato a las IAs** al subir archivos de un proyecto.  
3. ⚙️ **Facilitar la creación, versionado y actualización de intents técnicos** mediante herramientas automatizadas.

---

## 2. ESTRUCTURA BASE DE BLOOM

Cada proyecto que integra Bloom posee una carpeta oculta llamada `.bloom/`  
donde se almacena toda la información contextual, los BTIPs y los metadatos del sistema.

Estructura general:

    .bloom/
    ├── system/
    │   ├── .readme.main.bl
    │   ├── .system-prompt.bl
    │   ├── .prompting-guide.bl
    │   ├── .architecture-guide.bl
    │   └── .api-reference.bl
    ├── intents/
    │   ├── cache-system.btip/
    │   │   ├── .requirement.bl
    │   │   ├── .codebase.bl
    │   │   ├── .plan.bl
    │   │   └── .report.bl
    │   └── another-feature.btip/
    └── manifest.json

---

## 3. CONCEPTO CENTRAL: BTIP (Bloom Technical Intent Package)

Cada BTIP representa una **intención técnica** o *intent* concreto:  
una mejora, auditoría, refactorización o validación arquitectónica.

Un BTIP contiene al menos estos componentes:

| Archivo | Descripción |
|----------|-------------|
| `.requirement.bl` | Documentación técnica de referencia (arquitectura esperada). |
| `.codebase.bl` | Código consolidado o analizado. |
| `.plan.bl` | Plan técnico de implementación o análisis. |
| `.report.bl` | Resultados de auditorías generadas por IA o humanos. |

Los BTIPs pueden ser:
- **System BTIPs:** creados automáticamente con `bloom init`, representan la base del proyecto.  
- **Intent BTIPs:** creados dinámicamente por el desarrollador con `bloom create intent`.

---

## 4. INTEGRACIÓN ENTRE CLI Y PLUGIN

El **CLI** es el núcleo operativo del sistema:  
crea, gestiona, versiona y exporta los BTIPs.

El **Plugin Bloom** (VS Studio / VSCode) es una interfaz auxiliar:  
permite seleccionar archivos, crear intents y subirlos a IAs sin salir del entorno de desarrollo.

Ambos trabajan sobre la **misma estructura .bloom/** garantizando interoperabilidad total.

---

## 5. FILOSOFÍA DE DISEÑO

- 🧠 **IA-Centric:** toda la información en `.bloom/` está optimizada para ser procesada por IAs.  
- 🔄 **Reproducible:** cada BTIP puede compartirse o versionarse como unidad independiente.  
- ⚙️ **Extensible:** la CLI expone comandos que el plugin simplemente invoca.  
- 🧩 **Modular:** cada BTIP se comporta como un *microdocumento de intención técnica*.

---

## 6. FLUJO GENERAL DE USO

1. El usuario inicializa un proyecto con `bloom init`.  
2. Bloom crea la carpeta `.bloom/` con los **system BTIPs** base.  
3. Desde el CLI o plugin, el usuario crea un nuevo intent:  
       bloom create intent cache-system --files MainActivity.java DataLoadManager.java
4. Bloom genera un BTIP autocontenido dentro de `.bloom/intents/`.  
5. El usuario puede subirlo a IA con `bloom ai run cache-system` o editarlo localmente.  
6. Los resultados (auditorías, análisis, recomendaciones) se almacenan en `.report.bl`.  

---

## 7. FUTURO Y VISIÓN

Bloom busca convertirse en un **estándar abierto de documentación IA-inteligible**,  
permitiendo que múltiples IAs (Grok, Claude, Gemini, GPT) comprendan un proyecto de inmediato  
y que los desarrolladores trabajen en un ciclo continuo de mejora técnica inteligente.

---
