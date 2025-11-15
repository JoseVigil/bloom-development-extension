# BLOOM_BTIP_INTERFACE_PROMPT.md

El flujo de trabajo del sistema Bloom para el desarrollo del plugin comienza siempre desde este archivo: **BLOOM_BTIP_INTERFACE_PROMPT.md**. Aquí se define de forma textual y directa la estructura de los recursos que se entregan al modelo o desarrollador para comprender el contexto completo y proceder a generar, mantener o extender el plugin de Visual Studio Code dentro del ecosistema Bloom.

---

## Archivos de referencia

1. **BLOOM_BTIP_PLUGIN_PROMPT_GENERAL.md**
   Contiene el prompt maestro en texto plano que describe el objetivo del plugin, el alcance, las funciones esperadas y las convenciones de formato. Es el documento que guía conceptualmente cómo debe comportarse el plugin en términos funcionales y de estilo.

2. **BLOOM_BTIP_UNIVERSAL_CODEBASE_TEMPLATE.md**
   Sirve como referencia conceptual de estructura para los archivos `.codebase.bl`. No se utiliza como template operativo, sino como ejemplo que indica la forma, indentación y jerarquía que deben seguir los codebases generados. Permite a la IA o al desarrollador comprender el formato esperado.

3. **BLOOM_BTIP_PLUGIN_SPEC_REVISED.md**
   Documento técnico de especificación revisado, con la descripción detallada de los comandos, flujos, límites, interfaz de usuario, arquitectura interna del plugin y relación exacta con el CLI Bloom. Define los contratos técnicos y las funciones obligatorias.

4. **extension.ts (código base original del plugin)**
   Archivo fuente TypeScript que contiene la primera implementación del plugin Bloom, limitado a la vista previa de archivos `.bl` y `.md`. Este código constituye el punto de partida práctico sobre el cual se agregarán las nuevas funciones de creación de codebases e intents.

---

## Propósito del archivo

Este archivo actúa como el **documento inicial del contexto Bloom BTIP**. Cualquier proceso de generación, ajuste o refactorización del plugin debe comenzar leyendo este archivo, para luego utilizar los documentos y archivos mencionados como insumos de desarrollo o análisis.

El flujo es el siguiente:

1. Iniciar la sesión o el contexto desde **BLOOM_BTIP_INTERFACE_PROMPT.md**.
2. Leer y comprender los tres artifacts de referencia y el código fuente base.
3. Ejecutar las acciones o generar el nuevo código según las reglas y formatos establecidos.

---

## Notas finales

* Todo el contenido técnico relacionado al plugin sigue la convención de **indentación de 4 espacios** en los bloques de código, sin uso de triple backticks.
* Este archivo debe ser considerado el punto de entrada para cualquier IA o desarrollador que trabaje en la evolución del ecosistema Bloom BTIP Plugin.
