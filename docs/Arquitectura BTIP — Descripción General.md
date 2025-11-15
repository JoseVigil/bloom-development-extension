# Arquitectura BTIP — Descripción General

La arquitectura **BTIP** (Bloom Technical Intent Package) define un estándar simple, portátil y eficiente para encapsular un intento técnico ("intent") junto con el código relacionado, el contexto necesario y los archivos generados por la IA durante un ciclo de trabajo.

Esta arquitectura permite que humanos, plugins y modelos de IA como Claude, ChatGPT o Grok trabajen sobre el mismo set de archivos, sin ambigüedad y con máxima velocidad iterativa.

Un BTIP es una carpeta que contiene todos los elementos necesarios para que un modelo de IA pueda analizar un problema, planificar una solución y entregar resultados reproducibles. Su objetivo es estandarizar cómo se formula un problema técnico, cómo se entrega el contexto y qué produce el modelo al finalizar.

## ¿Qué es un Intent?

Un **Intent** es el archivo principal que declara:

- Qué problema queremos resolver
- Por qué existe
- Qué objetivo buscamos
- Qué archivos de código están incluidos en la investigación
- Qué alcance y restricciones tiene la tarea
- Qué modelo debería producir como salida

En la arquitectura BTIP, el intent define el propósito, no el contenido del código. El contenido del proyecto va separado en un archivo comprimido.

## Arquitectura del BTIP

Un BTIP final tiene esta estructura:

```
<nombre-del-intent>.btip/
    intent.bl
    codebase.bl
    codebase.tar.gz
    plan.bl
    report.bl
    meta.json
```

### Explicación de cada archivo

#### `intent.bl`

Archivo declarativo que describe el objetivo técnico. Debe ser pequeño, claro y en formato bloom/v1.

**Ejemplo:**

```
bloom/v1

intent: "arreglar bug en el feed de videos"
description: "El feed se refresca dos veces produciendo duplicación"
goal: "diagnosticar y corregir la doble llamada"
includes_archive: "codebase.tar.gz"
```

#### `codebase.bl`

No contiene el código. Contiene solo metadata del archivo comprimido donde realmente vive la base del proyecto.

**Ejemplo:**

```
bloom/v1

archive:
    filename: "codebase.tar.gz"
    included_manually: true
    note: "Incluye los archivos implicados en el bug"
```

#### `codebase.tar.gz`

Archivo comprimido con:

- Código fuente real
- Configuraciones
- Archivos del proyecto involucrados en el Intent

Esto reemplaza al viejo modelo de "todo en un .md gigante". Permite incluir proyectos completos sin limitaciones de tamaño ni pérdida de estructura.

#### `plan.bl`

Documento generado por la IA donde expone:

- Diagnóstico
- Pasos detallados de solución
- Estrategia técnica
- Suposiciones y consideraciones

Es la "hoja de ruta" de la solución.

#### `report.bl`

Archivo generado al final del ciclo. Incluye:

- Resumen final
- Código modificado (en bloques indentados)
- Explicaciones
- Recomendaciones
- Cualquier artefacto textual producido por el modelo

#### `meta.json`

Archivo pequeño con datos administrativos:

```json
{
    "version": "1.0",
    "name": "fix-video-feed",
    "created_at": "2025-11-14",
    "status": "open"
}
```

## Flujo Rápido de Iteración (Ciclo de Trabajo)

La arquitectura BTIP está diseñada para trabajar lo más rápido posible con un modelo de IA.

Este es el flujo standard:

### 1. Crear un Intent

El desarrollador identifica un problema:

- un bug
- una nueva feature
- una duda técnica
- una optimización

Luego crea:

- `intent.bl`
- `codebase.tar.gz` (conteniendo los archivos relevantes)
- `codebase.bl` (metadata)
- `meta.json`

### 2. Enviar el BTIP a un modelo (ChatGPT, Claude, etc.)

**Prompt recomendado:**

> Tengo un BTIP. Tomá intent.bl, codebase.bl y codebase.tar.gz y generá plan.bl y report.bl siguiendo bloom/v1. No inventes archivos que no existan.

El modelo:

- analiza el intent
- inspecciona el código dentro de codebase.tar.gz
- genera el plan.bl
- ejecuta el plan
- produce report.bl

### 3. Revisar y aplicar los cambios

El desarrollador:

- revisa el plan
- integra los cambios propuestos en report.bl
- solicita iteraciones si hace falta

### 4. Cerrar el BTIP

Cuando el problema está resuelto:

- se cierra el intent
- se guarda como artefacto histórico
- se pasa al próximo BTIP

## Ventajas de la arquitectura BTIP

- Compatible con Claude, ChatGPT, Grok y cualquier modelo moderno
- Escalable a proyectos grandes
- Portátil (un BTIP es una carpeta autocontenida)
- Ideal para debugging asistido con IA
- Ideal para procesos de desarrollo colaborativo
- Plug & play con pipelines de embeddings en un futuro
- Permite bases de código completas en su estructura natural, sin convertir a markdown

## Resumen Final

La arquitectura BTIP transforma un proceso caótico de "pedirle cosas a la IA" en un sistema ordenado, reproducible y escalable.

Los BTIPs permiten iterar en minutos, no horas, manteniendo trazabilidad de cada decisión técnica.

Separar el propósito (intent) del contenido (codebase.tar.gz) evita ambigüedades y habilita workflows profesionales, multi-agente y multi-modelo.