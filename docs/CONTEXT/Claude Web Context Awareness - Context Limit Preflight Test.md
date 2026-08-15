# Prueba de límite de contexto en Claude Web

## Objetivo

Se realizó una prueba para determinar si **Claude Web puede reconocer cuándo el contexto disponible no es suficiente para completar una tarea compleja**, en lugar de comenzar la tarea y fallar posteriormente por agotamiento del contexto.

La prueba se realizó utilizando el corpus real de documentación del proyecto **BTIPS / Bloom**.

## Primera prueba

Inicialmente se le pidió a Claude analizar el documento principal:

`BTIPS_Bloom_Technical_Intent_Package_v6_0.md`

y, utilizando los demás documentos adjuntos, encontrar una anomalía o inconsistencia en la arquitectura.

Claude respondió **SUFICIENTE** y realizó correctamente el análisis, encontrando una inconsistencia entre las taxonomías de `intent_type`, entre otras cuestiones.

Esto demostró que una tarea de análisis puntual podía ser resuelta con el contexto disponible.

## Segunda prueba

Se aumentó deliberadamente la exigencia de contexto.

Se le pidió:

1. Comenzar por `BTIPS_Bloom_Technical_Intent_Package_v6_0.md`.
2. Leer **íntegramente los 14 documentos**.
3. Mantener el contenido necesario de todos ellos simultáneamente.
4. Comparar cada documento contra BTIPS.
5. Comparar además **cada documento contra todos los demás**.
6. Identificar todas las contradicciones e inconsistencias.
7. Proporcionar referencias precisas de documento, sección y línea.
8. Construir una matriz de compatibilidad entre todos los documentos.
9. Proponer una resolución para cada inconsistencia.
10. No fragmentar ni descartar documentos para hacer entrar la tarea en el contexto.

Antes de comenzar se le pidió explícitamente responder únicamente **SUFICIENTE** o **INSUFICIENTE** según su capacidad para completar la tarea de principio a fin.

## Resultado

Claude respondió:

**INSUFICIENTE**

La justificación fue especialmente relevante porque no se limitó a decir que la tarea era "muy grande".

Claude estimó que los 14 documentos representaban aproximadamente **140.000–150.000 tokens de contenido**, antes de contabilizar:

* system prompt;
* herramientas;
* historial de conversación;
* instrucciones adicionales;
* espacio necesario para razonamiento y generación.

También identificó específicamente cuáles requisitos de la tarea generaban el problema:

* mantener simultáneamente todos los documentos;
* verificar referencias exactas de línea;
* realizar una matriz de **14 × 14 = 91 pares**;
* realizar las sucesivas pasadas necesarias sobre el corpus.

Finalmente propuso una alternativa: **fragmentar el análisis en varias tandas**, en lugar de intentar realizar una tarea que pudiera exceder el contexto disponible.

## Conclusión

La prueba demuestra algo importante sobre **Context Awareness**.

No se trata simplemente de que Claude pueda informar cuántos tokens le quedan. En este caso, Claude utilizó su conocimiento del presupuesto de contexto para evaluar la relación entre:

**contexto disponible → tamaño de los documentos → complejidad de la tarea → contexto requerido → capacidad de completarla.**

Cuando la tarea era pequeña respecto del contexto disponible, respondió:

**SUFICIENTE**

Cuando se exigió conservar y cruzar un corpus de aproximadamente 150K tokens, junto con el resto del contexto necesario para ejecutar y documentar el análisis, respondió:

**INSUFICIENTE**

y **se negó a comenzar una tarea que no podía garantizar que terminaría correctamente**.

Esto constituye una prueba práctica de que el *context awareness* puede utilizarse como mecanismo de **preflight de tareas**: antes de ejecutar una operación extensa, un agente puede determinar si dispone de contexto suficiente o si debe dividir la operación en etapas.

**La diferencia fundamental es que no necesitamos conocer exactamente cuántos tokens quedan. Lo que necesitamos es que el modelo pueda determinar si el contexto restante es suficiente para completar la tarea solicitada.**
