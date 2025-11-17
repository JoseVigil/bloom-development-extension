# Bloom Technical Intent Package (BTIP)

**Explicación extendida basada en la estructura BLOOM (Core / Project / Intents)**

## ¿Qué es un BTIP?

Un BTIP (Bloom Technical Intent Package) es una cápsula técnica autónoma que encapsula un único objetivo o problema específico dentro de un proyecto. Representa la unidad más pequeña y precisa de trabajo asistido por IA. Cada BTIP existe dentro de:

    .bloom/intents/<nombre-del-intent>.btip/

Su propósito: permitir que una IA resuelva un problema con precisión quirúrgica, usando solo la información estrictamente necesaria, sin ruido, sin alucinaciones y sin preguntar cosas que ya deberían estar en el contexto.

Un BTIP incluye:

- Lo que hay que resolver
- Los archivos relevantes
- El plan de acción generado por IA
- El reporte final del trabajo realizado

## El rol del BTIP dentro del ecosistema BLOOM

BLOOM divide el conocimiento en 3 capas:

    core/      → Reglas globales inmutables
    project/   → Contexto semiestático del proyecto
    intents/   → Problemas actuales, dinámicos

El BTIP vive en la capa INTENTS, pero funciona gracias al contexto de CORE y PROJECT.

La IA recibe esas tres capas juntas cuando se hace un push, logrando entendimiento total sin exceder límites de contexto y sin mezclar documentación innecesaria.

---

## CORE LAYER (Inmutable)

**Ubicación:**

    .bloom/core/

La capa CORE establece reglas globales que rigen cómo debe trabajar la IA en todos los repositorios de tu startup. Nunca cambia. Sus archivos:

    .rules.bl        → Reglas generales, prohibiciones, protocolos
    .standards.bl    → Estándares de código, formatos, testing, documentación
    .roles.bl        → Modos de operación de la IA (architect, reviewer, developer, etc.)
    .tech-stack.bl   → Tecnologías autorizadas en tu ecosistema

Esta capa proporciona un marco inquebrantable: siempre presente, siempre cargado, siempre igual.

Todos los BTIPs dependen implícitamente de esta capa.

---

## PROJECT LAYER (Semi-estática)

**Ubicación:**

    .bloom/project/

Define la identidad del proyecto actual. Cambia con menor frecuencia (semanal o mensual). Incluye:

    .requirements.bl   → Objetivos, users, criterios de éxito
    .architecture.bl   → Diseño del sistema, diagramas, flujos
    .state.bl          → Estado del proyecto, progreso, bloqueos
    .dependencies.bl   → Dependencias internas y externas

Un BTIP nunca duplica esta información, sino que la hereda al hacer push.

Esto permite que cada BTIP sea pequeño pero altamente contextual.

---

## INTENTS LAYER (Dinámico)

**Ubicación general:**

    .bloom/intents/<intent>.btip/

El BTIP vive aquí. Esta capa es la única que cambia día a día.

Cada BTIP contiene:

    .intent.bl      → La definición exacta del problema
    .codebase.bl    → Los archivos relevantes al problema
    .plan.bl        → Plan generado por IA
    .report.bl      → Qué se hizo al resolverlo

**La lógica:** El BTIP es donde ocurre el trabajo real, enfocado y atómico.

---

## Arquitectura piramidal en toda la startup

Esta es una característica esencial de BLOOM:

**Todos los repositorios de la startup contienen una carpeta .bloom/**

Esto genera una arquitectura piramidal:

1. Cada proyecto comparte una estructura idéntica.
2. Cada proyecto mantiene sus propios BTIPs.
3. Las reglas CORE se comparten entre todos los proyectos, creando coherencia global.
4. Las documentaciones PROJECT permiten que los BTIPs de un repositorio sean totalmente comprensibles por cualquier IA.
5. Los BTIPs registran el aprendizaje técnico de cada proyecto.

### El resultado:

- Todo tu ecosistema tiene una estructura estándar
- Todas las IAs reciben información predecible
- Los desarrolladores pueden navegar repositorios sin fricción
- El conocimiento deja de perderse
- La startup construye memoria técnica acumulativa

---

## Anatomía profunda del BTIP

### 1. .intent.bl

Define el problema puntual. Contiene:

- Statement del problema
- Contexto y alcance
- Comportamiento actual
- Comportamiento deseado
- Constraints
- Acceptance criteria
- Rol recomendado para IA
- Archivos relevantes
- Impacto del problema
- Hipótesis iniciales

Este archivo establece la dirección.

### 2. .codebase.bl

Es un snapshot acotado de los archivos del proyecto relevantes al problema (5 a 10 archivos máximo).

Incluye:

- Lista de archivos seleccionados
- Por qué se incluyen
- Contenido completo de cada archivo
- Estadísticas técnicas
- Archivos relevantes no incluidos (solo referenciados)
- Observaciones clave

Este archivo puede ser generado mediante cualquier mecanismo de selección de archivos:

- Scripts externos
- Selección manual
- Una herramienta gráfica (sin mencionar ninguna plataforma)

**Lo importante:** El BTIP SOLO contiene los archivos que el usuario decide incluir.

### 3. .plan.bl

Generado por la IA después del primer push.

Debe incluir:

- Resumen del análisis
- Enfoque técnico elegido
- Pasos detallados
- Archivos a modificar
- Tests a crear
- Riesgos
- Estimación de esfuerzo

Es la hoja de ruta concreta del trabajo.

### 4. .report.bl

Archivo final que documenta lo que realmente se hizo:

- Cambios realizados
- Archivos modificados
- Tests agregados
- Impacto técnico
- Limitaciones
- Aprendizajes
- Tareas de seguimiento

Cada BTIP archivado se convierte en memoria técnica que evita repetir errores o análisis en el futuro.

---

## Flujo de vida completo del BTIP

    1. Crear intent
    2. Completar .intent.bl
    3. Seleccionar los archivos del .codebase.bl
    4. Hacer push para análisis IA
    5. Recibir y revisar .plan.bl
    6. Implementar cambios en el proyecto real
    7. Documentar en .report.bl
    8. Cerrar y archivar el intent

---

## ¿Por qué funcionan los BTIPs?

1. Enfocan el problema
2. Reducen ruido
3. Mantienen contexto mínimo pero suficiente
4. Evitan alucinaciones
5. Permiten reproducibilidad exacta
6. Crean documentación automática
7. Facilitan colaboraciones entre equipos
8. Reducen carga cognitiva del desarrollador
9. Estandarizan la relación humano–IA
10. Transforman la sesión de IA en conocimiento transferible

---

## BTIP dentro de la cultura BLOOM

Un BTIP convierte cada interacción con IA en:

- Conocimiento estructurado
- Documentación versionada
- Registro técnico permanente
- Mejora continua del proyecto
- Historial de decisiones
- Métricas de impacto

Con el tiempo, la carpeta `.bloom/` de cada proyecto se convierte en un verdadero **sistema operativo técnico** que unifica toda la ingeniería de tu startup.

---

## Conclusión

El BTIP es la unidad atómica del desarrollo asistido por IA dentro del ecosistema BLOOM. Es pequeño, preciso, reproducible y totalmente integrado con la arquitectura del proyecto y las reglas globales del sistema.

Implementar BTIPs en todos los repositorios convierte a tu startup en:

- Una organización con memoria técnica
- Un sistema escalable
- Un entorno donde las IAs entienden todo al instante
- Un ecosistema compatible y coherente
- Un ambiente donde los problemas se resuelven con velocidad, claridad y orden

---

## Próximos pasos

Si querés, ahora puedo generar:

- Plantillas oficiales de cada archivo BTIP
- Especificación del CLI
- Documentación para desarrolladores
- Documentación para creadores de BTIPs
- Ejemplos de BTIPs reales
- Una guía completa de naming, estructura y buenas prácticas

Decime qué archivo querés que construya.