# BLOOM_BTIP_INTERFACE_PROMPT.md

El flujo de trabajo del sistema Bloom para el desarrollo del plugin comienza siempre desde este archivo: BLOOM_BTIP_INTERFACE_PROMPT.md. Aquí se define de forma textual y directa la estructura de los recursos que se entregan al modelo o desarrollador para comprender el contexto completo y proceder a generar, mantener o extender el plugin de Visual Studio Code dentro del ecosistema Bloom.

---

## Archivos de referencia

1. BLOOM_BTIP_PLUGIN_PROMPT_GENERAL.md
   Contiene el prompt maestro en texto plano que describe el objetivo del plugin, el alcance, las funciones esperadas y las convenciones de formato. Es el documento que guía conceptualmente cómo debe comportarse el plugin en términos funcionales y de estilo.

2. BLOOM_BTIP_PLUGIN_SPEC_REVISED.md
   Documento técnico de especificación revisado, con la descripción detallada de los comandos, flujos, límites, interfaz de usuario, arquitectura interna del plugin. Define los contratos técnicos y las funciones obligatorias.

3. intent.bl (Template de Intent)
   Archivo de referencia que define la estructura estándar del intent que será generado por el plugin. Este template contiene todos los campos que el usuario debe completar mediante el formulario modal.

4. extension.ts (código base actual del plugin)
   Archivo fuente TypeScript que contiene la implementación actual del plugin Bloom. Incluye la funcionalidad de preview de archivos Markdown que debe mantenerse intacta. Este código constituye el punto de partida práctico sobre el cual se agregarán las nuevas funciones de creación de intents y empaquetado de archivos.

---

## Propósito del archivo

Este archivo actúa como el documento inicial del contexto Bloom BTIP. Cualquier proceso de generación, ajuste o refactorización del plugin debe comenzar leyendo este archivo, para luego utilizar los documentos y archivos mencionados como insumos de desarrollo o análisis.

El flujo es el siguiente:

1. Iniciar la sesión o el contexto desde BLOOM_BTIP_INTERFACE_PROMPT.md.
2. Leer y comprender los documentos de referencia y el código fuente base.
3. Ejecutar las acciones o generar el nuevo código según las reglas y formatos establecidos.

---

## Funcionalidades del plugin

El plugin Bloom incluye dos funcionalidades principales:

### Funcionalidad existente (debe mantenerse)

* Preview de archivos Markdown (.md) con renderizado avanzado
* Navegación entre archivos Markdown mediante links
* Actualización en tiempo real del preview al editar
* Soporte para anclajes internos y navegación suave

### Nueva funcionalidad (a implementar)

* Generación de intents mediante empaquetado de archivos seleccionados en formato .tar.gz
* Creación de archivos de intent basados en template mediante formulario interactivo
* Organización estructurada en carpetas intents/

---

## Notas finales

* Todo el contenido técnico relacionado al plugin sigue la convención de indentación de 4 espacios en los bloques de código, sin uso de triple backticks.
* Este archivo debe ser considerado el punto de entrada para cualquier IA o desarrollador que trabaje en la evolución del ecosistema Bloom BTIP Plugin.
* La implementación nueva debe coexistir con la funcionalidad de preview existente sin modificarla ni eliminarla.