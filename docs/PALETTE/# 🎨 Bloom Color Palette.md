# BTIPS Design System
## Visual Language & Component Doctrine v1.0

---

## Filosofía de Diseño

BTIPS no es una aplicación. Es un sistema cognitivo operativo.

Su lenguaje visual debe reflejar eso:

- **Calma estructural** — ningún elemento compite por atención
- **Persistencia percibida** — lo que se construye debe sentirse permanente
- **Estado, no acción** — la interfaz comunica condición del sistema, no solo instrucciones
- **Emergencia progresiva** — el sistema aparece gradualmente; nada aparece de golpe

Cada decisión visual —color, tipografía, espaciado, animación— debe responder a la misma pregunta:

> ¿Esto comunica sistema o comunica aplicación?

---

## Paleta de Colores

### Fondos y Superficies

```css
--color-bg:              #080A0E
--color-surface:         #0D1117
--color-surface-hover:   #131820
```

**`--color-bg` — Vacío profundo**
- El fondo más oscuro. No negro puro. Azul-negro con profundidad perceptible.
- Uso: Background global, áreas extensas, pantalla base
- Concepto: Estado previo a la activación. El sistema antes de existir.

**`--color-surface` — Contenedor neutro**
- Un nivel de elevación sobre el fondo. Apenas perceptible.
- Uso: Cards, panels, campos de entrada, barras de estado
- Concepto: Estructura latente

**`--color-surface-hover` — Interactividad preparada**
- Usado solo en hover y focus de elementos interactivos
- Uso: Estados hover sobre superficies

---

### Texto

```css
--color-text-primary:    #E8EAF0
--color-text-secondary:  rgba(232, 234, 240, 0.45)
--color-text-dim:        rgba(232, 234, 240, 0.22)
```

**`--color-text-primary`**
- Texto principal. Ligeramente frío para mantener coherencia cromática con el fondo.
- Uso: Títulos, acciones, labels activos
- Nunca usar blanco puro (`#FFFFFF`) — produce tensión excesiva sobre el fondo

**`--color-text-secondary`**
- Información contextual, descripciones, texto de apoyo
- Uso: Body text, subtítulos, metadatos

**`--color-text-dim`**
- Información inactiva o latente
- Uso: Labels de nodos no activados, placeholders, texto pre-sistema

---

### Bordes

```css
--color-border:          rgba(255, 255, 255, 0.06)
--color-border-active:   rgba(255, 255, 255, 0.18)
```

**`--color-border`**
- Borde en reposo. Casi invisible. Define estructura sin interrumpir.
- Uso: Campos en estado neutro, divisores, contenedores pasivos

**`--color-border-active`**
- Borde en foco o estado activo.
- Uso: Campos en focus, nodos en activación, contenedores seleccionados

---

### Acento — System Active

```css
--color-accent:          #C8F55A
--color-accent-dim:      rgba(200, 245, 90, 0.12)
--color-accent-glow:     rgba(200, 245, 90, 0.06)
```

**`--color-accent` — Verde-lima de sistema**
- El único color saturado en toda la interfaz.
- No es un color de marca. Es un indicador de estado activo.
- Aparece solamente cuando algo en el sistema está vivo, establecido o activo.
- Uso: Botones primarios, puntos de nodo activo, indicadores de estado, glow de Vault armado

**Regla de uso del acento:**

> El acento no decora. El acento indica.

No usar como color ornamental. No usar en texto genérico. No usar en backgrounds pasivos.

**`--color-accent-dim`**
- Versión de baja opacidad para fondos de estado activo sin interferir con el contenido
- Uso: Background de state blocks activos, highlight sutil

**`--color-accent-glow`**
- Sombra difusa de presencia. Refuerzo ambiental de estado activo.
- Uso: box-shadow en elementos con acento, efectos de glow en Vault Shield, Nucleus

---

### Error y Crítico

```css
--color-error:           #FF4444
```

- Solo para errores de validación o fallos críticos del sistema.
- Uso restrictivo. Nunca como decoración.

---

### Tabla de Referencia Rápida

| Token | Valor | Uso |
|---|---|---|
| `--color-bg` | `#080A0E` | Fondo global |
| `--color-surface` | `#0D1117` | Contenedores |
| `--color-surface-hover` | `#131820` | Hover de superficie |
| `--color-text-primary` | `#E8EAF0` | Texto principal |
| `--color-text-secondary` | `rgba(232,234,240,0.45)` | Texto de apoyo |
| `--color-text-dim` | `rgba(232,234,240,0.22)` | Texto latente |
| `--color-border` | `rgba(255,255,255,0.06)` | Bordes en reposo |
| `--color-border-active` | `rgba(255,255,255,0.18)` | Bordes activos/focus |
| `--color-accent` | `#C8F55A` | Estado activo del sistema |
| `--color-accent-dim` | `rgba(200,245,90,0.12)` | Fondo de estado activo |
| `--color-accent-glow` | `rgba(200,245,90,0.06)` | Glow ambiental |
| `--color-error` | `#FF4444` | Error crítico |

---

## Tipografía

BTIPS usa dos familias tipográficas. Una sola para estructura, una sola para datos.

### Familias

```css
--font-display: 'Syne', sans-serif
--font-mono:    'DM Mono', monospace
```

**Syne** — Tipografía estructural
- Usada para: Títulos, subtítulos, botones, navegación, todo texto de composición
- Característica: Geométrica, técnica, con personalidad propia sin ser decorativa
- Pesos utilizados: `400`, `500`, `600`, `700`
- Fuente: Google Fonts — `https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700`

**DM Mono** — Tipografía de sistema
- Usada para: Labels técnicos, estados del sistema, metadata, campos de entrada, Cortex, código
- Característica: Monoespaciada, precisa, comunica datos y estado del sistema
- Pesos utilizados: `300`, `400`
- Fuente: Google Fonts — `https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400`

---

### Escala Tipográfica

```css
/* Display */
--type-display:    font-size: 42px; font-weight: 700; letter-spacing: -0.03em;
--type-headline:   font-size: 32px; font-weight: 600; letter-spacing: -0.02em;
--type-title:      font-size: 26px; font-weight: 600; letter-spacing: -0.02em;
--type-subtitle:   font-size: 20px; font-weight: 500; letter-spacing: -0.01em;

/* Body */
--type-body:       font-size: 14px; font-weight: 400; line-height: 1.6;
--type-body-small: font-size: 13px; font-weight: 400; line-height: 1.7;

/* Mono / System */
--type-label:      font-size: 11px; font-family: DM Mono; letter-spacing: 0.12em; text-transform: uppercase;
--type-label-sm:   font-size: 10px; font-family: DM Mono; letter-spacing: 0.20em; text-transform: uppercase;
--type-mono:       font-size: 12px; font-family: DM Mono; letter-spacing: 0.06em;
--type-micro:      font-size: 9px;  font-family: DM Mono; letter-spacing: 0.20em; text-transform: uppercase;
```

---

### Reglas Tipográficas

**Jerarquía por familia:**
- Todo lo que define estructura del documento usa Syne
- Todo lo que comunica estado del sistema usa DM Mono
- No mezclar familias en el mismo elemento

**Letter-spacing:**
- Títulos en Syne: tracking negativo (`-0.02em` a `-0.03em`) para densidad visual
- Labels en DM Mono: tracking positivo (`0.10em` a `0.25em`) para legibilidad técnica

**Color de texto según jerarquía:**

| Nivel | Token | Familia |
|---|---|---|
| Títulos principales | `--color-text-primary` | Syne |
| Subtítulos / cuerpo | `--color-text-secondary` | Syne o DM Mono |
| Labels de sistema | `--color-text-dim` → se activa a `--color-text-secondary` | DM Mono |
| Estado activo | `--color-accent` | DM Mono |

---

## Sistema de Espaciado

Espaciado generoso. El espacio vacío no es ausencia de contenido — es parte del contenido.

```css
--space-xs:   8px
--space-sm:   12px
--space-md:   24px
--space-lg:   40px
--space-xl:   56px
--space-2xl:  72px
--space-3xl:  96px
```

**Regla de layout:**
- Máximo 480px de ancho para contenido de pantalla completa
- Centrado horizontal siempre
- Padding lateral mínimo: 24px

---

## Bordes y Superficies

```css
--radius-sm:   2px
--radius-md:   4px
```

Los bordes son casi cuadrados. BTIPS no usa `border-radius` generoso. Las esquinas redondeadas comunican app comercial.

```css
--border-default: 1px solid var(--color-border)
--border-active:  1px solid var(--color-border-active)
--border-accent:  1px solid var(--color-accent)
```

---

## Sombras y Elevación

```css
--shadow-sm:   0 1px 3px rgba(0, 0, 0, 0.4)
--shadow-md:   0 4px 12px rgba(0, 0, 0, 0.5)
--shadow-glow: 0 0 8px var(--color-accent), 0 0 1px var(--color-accent)
```

**`--shadow-glow`** — reservada exclusivamente para elementos con estado `Active` que usan acento.

---

## Animación y Transiciones

Motion comunica cambio de estado del sistema, no decoración. Cada animación tiene una razón semántica.

### Principio

> Si un elemento aparece sin movimiento, parece copiado.
> Si aparece con movimiento propio, parece construido.

---

### Duraciones

```css
--duration-micro:  150ms   /* hover, focus, color de campo */
--duration-fast:   300ms   /* transiciones de estado breves */
--duration-base:   500ms   /* transiciones de pantalla saliente */
--duration-slow:   600ms   /* activación de nodos, reveals de elementos */
--duration-reveal: 800ms   /* entrada de elementos individuales importantes */
```

---

### Curvas de Easing

```css
--ease-system:  cubic-bezier(0.4, 0, 0.2, 1)   /* transiciones estándar de estado */
--ease-emerge:  cubic-bezier(0.0, 0.0, 0.2, 1)  /* aparición desde reposo — empieza lento, termina rápido */
--ease-settle:  cubic-bezier(0.4, 0, 1, 1)       /* desaparición — empieza rápido, termina lento */
```

---

### Transiciones de Pantalla

Cada pantalla tiene dos momentos: salida y entrada. Son asimétricas intencionalmente.

**Pantalla saliente:**
```css
opacity: 1 → 0
duration: 350ms
ease: --ease-settle
/* La pantalla anterior cae rápido para no bloquear la emergencia de la siguiente */
```

**Pantalla entrante — contenedor:**
```css
opacity: 0 → 1
duration: 500ms
ease: cubic-bezier(0.4, 0, 0.2, 1)
```

**Pantalla entrante — hijos (staggered reveal):**

Cada hijo directo de `.screen-inner` entra con un delay acumulativo de 80ms:

```css
@keyframes contentReveal {
  from {
    opacity: 0;
    transform: translateY(14px);
    filter: blur(3px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
    filter: blur(0);
  }
}

duration: 600ms | ease: cubic-bezier(0.0, 0.0, 0.2, 1)

nth-child(1): delay 80ms
nth-child(2): delay 160ms
nth-child(3): delay 240ms
nth-child(4): delay 320ms
...
```

El `blur(3px)` inicial simula materialización — el elemento no aparece de la nada, emerge desde una condición difusa.

---

### Activación de Nodos del Sistema

Los nodos de la capa persistente izquierda se activan en secuencia escalonada cuando un stage se completa.

```css
/* Estado latente */
opacity: 0;
transform: translateX(-12px);

/* Estado activo */
opacity: 1;
transform: translateX(0);
transition: opacity 0.6s ease, transform 0.6s ease;

/* Dot */
background: var(--color-accent);
box-shadow: 0 0 8px var(--color-accent);
transition: background 0.4s, box-shadow 0.4s;
```

Delay escalonado entre nodos: **+150ms** por cada nodo adicional.

---

### Vault Shield — Secuencia de Armado

La activación del Vault tiene dos tiempos distintos para comunicar peso:

```
1. Click → clase "arming" (400ms)
   - Flash de fill interno: rgba(200,245,90,0.25) → rgba(200,245,90,0.03)
   - @keyframes vault-flash: 400ms ease-out

2. Después de 400ms → clase "armed"
   - border-color: var(--color-accent)
   - box-shadow (triple capa):
       0 0 0 1px rgba(200,245,90,0.20)   ← borde interno
       0 0 20px rgba(200,245,90,0.15)    ← glow medio
       0 0 48px rgba(200,245,90,0.06)    ← halo lejano
   - background: rgba(200,245,90,0.03)
   - transition: 600ms

3. Después de 600ms adicionales → transición a siguiente pantalla
```

---

### Nucleus

El Nucleus tiene tres capas de animación independientes que crean profundidad:

**Anillos (pulse):**
```css
@keyframes pulse-ring {
  0%, 100% { transform: scale(1); opacity: 0.8; }
  50%       { transform: scale(1.06); opacity: 0.3; }
}
duration: 3.5s | ease-in-out | infinite
stagger entre anillos: +0.5s
```

**Órbita (rotación continua):**
```css
border: 1px dashed rgba(200,245,90,0.12)
@keyframes orbit-spin { from: rotate(0deg) → to: rotate(360deg) }
duration: 12s | linear | infinite
```

**Núcleo central (breathe):**
```css
@keyframes core-breathe {
  0%, 100% {
    transform: scale(1);
    box-shadow: 0 0 12px rgba(200,245,90,0.8),
                0 0 32px rgba(200,245,90,0.3),
                0 0 64px rgba(200,245,90,0.1);
  }
  50% {
    transform: scale(1.08);
    box-shadow: 0 0 20px rgba(200,245,90,1.0),
                0 0 48px rgba(200,245,90,0.4),
                0 0 96px rgba(200,245,90,0.15);
  }
}
duration: 2.5s | ease-in-out | infinite
```

---

### Ambient — Glow de Fondo

El ambiente es un gradiente radial de dos capas que evoluciona con el sistema.

**Estructura:**
```
#ambient::before  — capa externa, 700px, respira lento
#ambient::after   — capa interna, 400px, late independiente
```

**Ciclo de vida del ambient por stage:**

| Estado del sistema | Clase | Comportamiento |
|---|---|---|
| Entry (screen 0) | — | `opacity: 0` — sin ambient |
| Stage 1+ | `.active` | Aparece con fade-in de 1.8s |
| Stage 3 (Ownership) | `.stage-ownership` | Se intensifica levemente |
| Milestone | `.milestone` | Breathing loop 4s, máxima intensidad |
| Enter System | reset | Se apaga con fade |

**Animación de la capa interna:**
```css
@keyframes ambient-inner {
  0%, 100% { opacity: 0.6; transform: translate(-50%, -50%) scale(1); }
  50%       { opacity: 1;   transform: translate(-50%, -50%) scale(1.12); }
}
duration: 5s | ease-in-out | infinite
```

---

### Scan Line

Una línea horizontal de 1px que barre la pantalla completa de arriba a abajo, cada 8 segundos. Comunica que el sistema está activo y monitoreando.

```css
background: linear-gradient(90deg,
  transparent 0%,
  rgba(200,245,90,0.06) 30%,
  rgba(200,245,90,0.12) 50%,
  rgba(200,245,90,0.06) 70%,
  transparent 100%
)

@keyframes scan {
  0%   { top: -2px; opacity: 0; }
  2%   { opacity: 1; }
  98%  { opacity: 1; }
  100% { top: 100%; opacity: 0; }
}
duration: 8s | linear | infinite
```

---

### Progress Thread

La barra de progreso superior no es una barra — es un trazo de energía.

```css
height: 1px
background: linear-gradient(90deg, transparent, var(--color-accent) 60%, #ffffff 100%)
box-shadow: 0 0 6px var(--color-accent), 0 0 12px rgba(200,245,90,0.4)
transition: width 1.2s cubic-bezier(0.4, 0, 0.2, 1)
```

La punta blanca al final del gradiente refuerza la dirección de avance.

---

### Milestone — Secuencia de Revelado

El Milestone no se presenta de golpe. Los nodos aparecen uno a uno:

```
Screen activa → delay 500ms → primer nodo
Cada nodo siguiente: +200ms
Último nodo (Mandate): a los 1300ms
Botón "Enter System": a los 2200ms
```

Este delay total de ~2.2 segundos antes de mostrar la acción final es intencional: el usuario debe observar el sistema completo antes de poder continuar.

---

## Componentes Core

### Botón Primario

```css
background:      var(--color-accent)
color:           var(--color-bg)
border:          none
border-radius:   var(--radius-sm)
padding:         16px 48px
font-family:     var(--font-display)
font-size:       13px
font-weight:     600
letter-spacing:  0.12em
text-transform:  uppercase

hover:
  opacity: 0.88
  transform: translateY(-1px)
  transition: 150ms

active:
  transform: translateY(0)
```

### Botón Ghost

```css
background:      transparent
color:           var(--color-text-secondary)
border:          var(--border-default)
border-radius:   var(--radius-sm)
padding:         14px 40px
font-family:     var(--font-mono)
font-size:       12px
letter-spacing:  0.14em
text-transform:  uppercase

hover:
  border-color: var(--color-border-active)
  color:        var(--color-text-primary)
```

### Campo de Entrada (Field)

```css
background:      transparent
border:          var(--border-default)
border-radius:   var(--radius-sm)
padding:         16px 20px
font-family:     var(--font-mono)
font-size:       13px
color:           var(--color-text-primary)
letter-spacing:  0.04em

placeholder:
  color: var(--color-text-dim)

focus:
  border-color: var(--color-border-active)
  outline: none
```

### State Block

Panel que muestra el estado actual del sistema en construcción.

```css
border:          var(--border-default)
border-radius:   var(--radius-sm)
padding:         20px 28px
display:         flex flex-col gap-8px
```

Cada línea de estado:
```
● Token_Name    Estado_Valor
```

```css
.state-dot:
  width: 5px; height: 5px
  border-radius: 50%
  background: var(--color-accent)
  box-shadow: var(--shadow-glow)

.state-key:  color: var(--color-text-dim)
.state-val:  color: var(--color-text-secondary)
font-family: var(--font-mono) | font-size: 11px | letter-spacing: 0.10em
```

### Nodo de Sistema (System Node)

Elemento persistente en la capa izquierda durante onboarding.

**Estado latente (antes de activarse):**
- Dot: `background: var(--color-border-active)`
- Label: `color: var(--color-text-dim)`
- Status: `opacity: 0`

**Estado establecido (después de activarse):**
- Dot: `background: var(--color-accent)` + `box-shadow: var(--shadow-glow)`
- Label: `color: var(--color-text-secondary)`
- Status: `opacity: 1` / `color: var(--color-accent)`

### Barra Synapse (Cortex Bar)

```css
position:        fixed bottom-40px center
background:      var(--color-surface)
border:          var(--border-default)
border-radius:   var(--radius-sm)
padding:         14px 24px
min-width:       320px

.synapse-dot:
  width: 6px; height: 6px
  border-radius: 50%
  background: var(--color-accent)
  animation: cortex-blink 2s ease-in-out infinite

.synapse-text:
  font-family: var(--font-mono)
  font-size:   12px
  color:       var(--color-text-secondary)
```

Aparece solo cuando el sistema tiene algo que guiar. Desaparece cuando no.

---

## Efecto de Textura

Una capa de grano sutil cubre toda la interfaz. No es decorativo — reduce la artificialidad de los fondos digitales puros.

```css
body::after {
  content: '';
  position: fixed;
  inset: 0;
  background-image: url("data:image/svg+xml,<svg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='0.03'/></svg>");
  pointer-events: none;
  z-index: 1;
}
```

Opacidad: `0.03` — perceptible solo en fondos uniformes, nunca sobre texto.

---

## Mapeo Conceptual — Estado del Sistema

| Concepto | Token | Familia |
|---|---|---|
| Sistema inactivo / pre-construcción | `--color-text-dim` | — |
| Elemento latente | `--color-border` | — |
| Elemento activo del sistema | `--color-accent` | DM Mono |
| Estado establecido | `--color-accent` + glow | DM Mono |
| Error / fallo crítico | `--color-error` | DM Mono |
| Información de apoyo | `--color-text-secondary` | Syne o DM Mono |
| Contenido principal | `--color-text-primary` | Syne |

---

## Vocabulario de Estados

BTIPS usa estados, no confirmaciones.

| Evitar | Usar en su lugar |
|---|---|
| Created | Active |
| Completed | Established |
| Finished | Persistent |
| Done | — (no se confirma; el estado habla por sí mismo) |
| Success | System Activated |

---

## CSS Variables — Implementación Completa

```css
:root {
  /* Fondos */
  --color-bg:              #080A0E;
  --color-surface:         #0D1117;
  --color-surface-hover:   #131820;

  /* Texto */
  --color-text-primary:    #E8EAF0;
  --color-text-secondary:  rgba(232, 234, 240, 0.45);
  --color-text-dim:        rgba(232, 234, 240, 0.22);

  /* Bordes */
  --color-border:          rgba(255, 255, 255, 0.06);
  --color-border-active:   rgba(255, 255, 255, 0.18);

  /* Acento */
  --color-accent:          #C8F55A;
  --color-accent-dim:      rgba(200, 245, 90, 0.12);
  --color-accent-glow:     rgba(200, 245, 90, 0.06);

  /* Error */
  --color-error:           #FF4444;

  /* Tipografía */
  --font-display:          'Syne', sans-serif;
  --font-mono:             'DM Mono', monospace;

  /* Espaciado */
  --space-xs:   8px;
  --space-sm:   12px;
  --space-md:   24px;
  --space-lg:   40px;
  --space-xl:   56px;
  --space-2xl:  72px;
  --space-3xl:  96px;

  /* Bordes */
  --radius-sm:   2px;
  --radius-md:   4px;
  --border-default: 1px solid rgba(255, 255, 255, 0.06);
  --border-active:  1px solid rgba(255, 255, 255, 0.18);
  --border-accent:  1px solid #C8F55A;

  /* Sombras */
  --shadow-sm:   0 1px 3px rgba(0, 0, 0, 0.4);
  --shadow-md:   0 4px 12px rgba(0, 0, 0, 0.5);
  --shadow-glow: 0 0 8px #C8F55A, 0 0 1px #C8F55A;

  /* Motion */
  --duration-fast:   150ms;
  --duration-base:   300ms;
  --duration-slow:   600ms;
  --duration-reveal: 800ms;
  --ease-system:     cubic-bezier(0.4, 0, 0.2, 1);
}
```

---

## Google Fonts — Import

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700&family=DM+Mono:wght@300;400&display=swap" rel="stylesheet">
```

---

## Reglas de Uso — Qué Evitar

**Color:**
- No usar `#FFFFFF` — usar `--color-text-primary`
- No usar negro puro `#000000` — usar `--color-bg`
- No usar `--color-accent` como decoración — solo en estados activos del sistema
- No crear colores fuera de esta paleta

**Tipografía:**
- No usar Inter, Roboto, ni fonts del sistema
- No usar letter-spacing positivo en Syne para títulos grandes
- No mezclar familias en el mismo elemento sin propósito semántico

**Forma:**
- No usar `border-radius` mayor a `4px` — comunica app comercial
- No agregar animaciones sin cambio de estado real
- No usar gradientes excepto en contextos excepcionales (ambient del Milestone)

**Lenguaje:**
- No usar confirmaciones tipo "Done", "Created", "Completed"
- No usar lenguaje de SaaS
- No explicar el sistema — demostrarlo

---

## Versión

**v1.0** — Enero 2026
Basado en el sistema de diseño implementado en `btips_onboarding_v4.html`.
Reemplaza `Bloom Color Palette v1.0`.

---

## Referencias

- Implementación de referencia: `btips_onboarding_v4.html`
- Arquitectura del sistema: `BTIPS__Bloom_Technical_Intent_Package_v3_0.md`
- Doctrina de onboarding: `BTIPS_Onboarding_Architecture_Branch.md`