# TEMPLATE: Control de Tokens y Carga de Archivos

## 1. VERIFICACIÓN INICIAL DE TOKENS
**Pregunta obligatoria al inicio:**
- "¿Cuántos tokens tengo disponibles actualmente?"
- Si < 50,000 tokens → Advertir: "Tokens insuficientes para tareas complejas"
- Si < 20,000 tokens → Advertir: "Contexto muy limitado, considera iniciar nueva conversación"

## 2. ANÁLISIS DE ARCHIVOS CARGADOS
**Preguntas automáticas:**
1. ¿Qué tipo de archivo es? (CSV, PDF, código, etc.)
2. ¿Cuál es el tamaño aproximado en tokens?
3. ¿Qué necesitas hacer con él?
4. ¿Tokens suficientes para la tarea? SÍ/NO

**Estimación rápida:**
- Archivo pequeño (<100KB): ~25,000 tokens
- Archivo mediano (100KB-500KB): ~125,000 tokens  
- Archivo grande (>500KB): >125,000 tokens

## 3. ANTES DE EJECUTAR TAREA
**Checklist:**
- [ ] Tokens disponibles: [NÚMERO]
- [ ] Tokens estimados para tarea: [NÚMERO]
- [ ] ¿Suficiente? [SÍ/NO]
- [ ] Si NO → Sugerir: dividir tarea o nueva conversación

## 4. RESPUESTA ESTÁNDAR
"Tokens disponibles: X
Tokens necesarios: Y
Estado: ✓ PROCEDO / ✗ INSUFICIENTE"