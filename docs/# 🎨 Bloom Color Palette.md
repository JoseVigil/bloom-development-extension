# 🎨 Bloom Color Palette
## Paleta de Colores Oficial v1.0

---

## 🧠 Filosofía de Color

La paleta de Bloom está diseñada para desarrolladores que trabajan con sistemas cognitivos complejos. Cada color tiene un **propósito semántico** claro y se mapea directamente a conceptos de la arquitectura BTIP.

**Principios:**
- **Alto contraste** para distinguir estados rápidamente
- **Significado semántico** alineado con la arquitectura
- **Profesional y técnico** sin sacrificar personalidad
- **Accesible** para trabajo prolongado

---

## 🎯 Colores Base

### Fondos y Superficies

```css
--color-bg: #0f0f1e
```
**Base oscura profunda** - Fondo principal de la aplicación
- RGB: 15, 15, 30
- Uso: Background principal, áreas extensas
- Concepto: Vacío cognitivo, espacio de trabajo

```css
--color-surface: #1a1a2e
```
**Superficie elevada** - Tarjetas, paneles, contenedores
- RGB: 26, 26, 46
- Uso: Cards, modales, secciones elevadas
- Concepto: Contenedores de información

```css
--color-surface-hover: #242438
```
**Superficie interactiva** - Estados hover
- RGB: 36, 36, 56
- Uso: Hover states, elementos seleccionables
- Concepto: Interactividad preparada

---

## 💜 Colores Primarios

### Púrpura - Inteligencia y Procesamiento

```css
--color-primary: #a855f7
```
**Púrpura Principal** - Acciones primarias, IA, Brain
- RGB: 168, 85, 247
- Uso: Botones primarios, Brain engine, procesamiento IA
- Concepto: Inteligencia artificial, cognición, procesamiento

```css
--color-primary-light: #c084fc
```
**Púrpura Claro** - Hover states, énfasis suave
- RGB: 192, 132, 252
- Uso: Hover primario, estados activos
- Concepto: Activación cognitiva

### Rosa/Magenta - Energía y Ejecución

```css
--color-secondary: #ec4899
```
**Rosa/Magenta** - Acciones secundarias, Projects, ejecución
- RGB: 236, 72, 153
- Uso: Acentos, gradientes, Projects layer
- Concepto: Energía, ejecución, acción productiva

---

## 🟢 Colores Funcionales

### Verde - Éxito y Gobierno

```css
--color-success: #22c55e
```
**Verde Éxito** - Estados exitosos, Nucleus, validación
- RGB: 34, 197, 94
- Uso: Success states, Nucleus governance, confirmaciones
- Concepto: Validación, gobierno, coherencia organizacional

### Amarillo - Exploración y Atención

```css
--color-warning: #eab308
```
**Amarillo Exploración** - Warnings, exploration intents, atención
- RGB: 234, 179, 8
- Uso: Warnings, `exp` intents, estados de exploración
- Concepto: Descubrimiento, hipótesis, atención requerida

### Rojo - Errores Críticos

```css
--color-error: #ef4444
```
**Rojo Error** - Estados de error, fallos críticos
- RGB: 239, 68, 68
- Uso: Error states, validaciones fallidas, crítico
- Concepto: Fallo, bloqueo, corrección necesaria

---

## 📝 Colores de Texto

### Texto Principal

```css
--color-text: #e2e8f0
```
**Texto Principal** - Contenido primario
- RGB: 226, 232, 240
- Uso: Títulos, texto principal, contenido destacado
- Concepto: Información principal

### Texto Secundario

```css
--color-text-muted: #94a3b8
```
**Texto Atenuado** - Metadatos, información secundaria
- RGB: 148, 163, 184
- Uso: Labels, metadata, información complementaria
- Concepto: Contexto, datos auxiliares

---

## 🎭 Sombras y Elevación

```css
--shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.3)
--shadow-md: 0 4px 6px rgba(0, 0, 0, 0.4)
--shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.5)
```

**Uso de sombras:**
- `sm`: Elementos sutilmente elevados (status dots, tags)
- `md`: Tarjetas principales, botones
- `lg`: Modales, overlays, elementos flotantes

---

## 🧩 Mapeo Conceptual BTIP

### Por Componente de Arquitectura

```
🧠 Nucleus (Gobierno)          → #22c55e (Verde)
📦 Projects (Ejecución)         → #a855f7 (Púrpura)
🔥 Brain (Procesamiento IA)    → #a855f7 + #ec4899 (Gradiente)
🛡️ Sentinel (Orquestación)     → #94a3b8 (Gris)
🌐 Chrome Extension            → #ec4899 (Rosa)
⚙️ Native Host                  → #94a3b8 (Gris)
```

### Por Tipo de Intent

```
dev (Development)      → #a855f7 (Púrpura - ejecución técnica)
doc (Documentation)    → #94a3b8 (Gris - información)
exp (Exploration)      → #eab308 (Amarillo - descubrimiento)
inf (Information)      → #e2e8f0 (Blanco - datos puros)
cor (Coordination)     → #22c55e (Verde - gobierno)
```

### Por Estado de Sistema

```
✅ Connected/Success   → #22c55e (Verde)
⚠️ Warning/Exploring   → #eab308 (Amarillo)
❌ Error/Disconnected  → #ef4444 (Rojo)
🔄 Processing          → #a855f7 (Púrpura)
⏸️ Idle/Waiting        → #94a3b8 (Gris)
```

---

## 🎨 Gradientes Oficiales

### Gradiente Principal (Púrpura → Rosa)

```css
background: linear-gradient(135deg, #a855f7 0%, #ec4899 100%);
```
**Uso:** Botones primarios, headers destacados, Brain visualization

### Gradiente de Fondo

```css
background: linear-gradient(135deg, #0f0f1e 0%, #1e1e3f 100%);
```
**Uso:** Body background, áreas extensas

### Gradiente de Texto (Títulos)

```css
background: linear-gradient(135deg, #a855f7 0%, #ec4899 100%);
-webkit-background-clip: text;
background-clip: text;
-webkit-text-fill-color: transparent;
```
**Uso:** Títulos principales, branding

---

## 🔧 Uso en Código

### Implementación Base

```css
:root {
  /* Fondos */
  --color-bg: #0f0f1e;
  --color-surface: #1a1a2e;
  --color-surface-hover: #242438;
  
  /* Primarios */
  --color-primary: #a855f7;
  --color-primary-light: #c084fc;
  --color-secondary: #ec4899;
  
  /* Funcionales */
  --color-success: #22c55e;
  --color-warning: #eab308;
  --color-error: #ef4444;
  
  /* Texto */
  --color-text: #e2e8f0;
  --color-text-muted: #94a3b8;
  
  /* Sombras */
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.4);
  --shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.5);
}
```

---

## 📋 Guías de Uso

### ✅ Hacer

- Usar `--color-primary` para todas las acciones principales relacionadas con IA
- Usar `--color-success` para confirmaciones y estados del Nucleus
- Usar `--color-warning` para exploration intents y atención
- Mantener alto contraste entre texto y fondo
- Usar gradientes solo en elementos destacados

### ❌ Evitar

- Mezclar colores sin propósito semántico claro
- Usar rosa/magenta para errores (es para ejecución)
- Usar verde para procesamiento (es para validación)
- Degradar contraste por estética
- Crear nuevos colores fuera de la paleta

---

## 🔄 Versión

**v1.0** - Enero 2026
- Paleta inicial basada en arquitectura BTIP
- Optimizada para desarrolladores
- Alineada con conceptos Nucleus/Projects/Brain

---

## 📚 Referencias

- Arquitectura BTIP: Ver `BTIPS.md`
- Componentes UI: Ver `/components`
- Mapeo de Intents: Ver `.bloom/.intents/`