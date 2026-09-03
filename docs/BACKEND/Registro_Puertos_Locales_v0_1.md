# Registro de puertos locales — Bloom

> Fuente de verdad de qué puerto usa qué proceso en desarrollo local. Antes
> de fijar un puerto nuevo para cualquier servicio (backend, frontend,
> worker, herramienta de diagnóstico), este documento se consulta y se
> actualiza en el mismo commit. Ningún puerto se elige por default de una
> herramienta sin verificar acá primero.

## Motivo

Bloom corre, en la máquina de un desarrollador, dos sistemas que no se
conocen entre sí:

1. **Control Plane de Nucleus** (`docs/BOOTSTRAP/BOOTSTRAP_CONTROL_PLANE.md`),
   supervisado por el binario Go de Nucleus — WebSocket, API Fastify, y el
   dev server de la webview Svelte.
2. **Backend de Cloudflare + su frontend web** (`backend/`, `backend/web/`),
   corridos manualmente por el desarrollador con `wrangler dev` / `npm run
   dev` — sin relación de proceso con Nucleus.

El 2026-09-03 el frontend de `backend/web/` se levantó en `localhost:5173`
(el default de Vite) sin chequear que ese puerto ya estaba reservado por (1)
— colisión detectada por Jose al intentar correr ambos sistemas a la vez.
Este documento existe para que no vuelva a pasar.

## Tabla de asignación

| Puerto | Servicio | Sistema | Quién lo levanta | Fijo en |
|---|---|---|---|---|
| `4124` | WebSocket server | Control Plane (Nucleus) | Nucleus (Go), vía `bootControlPlane()` | `installer/bootstrap/server-bootstrap.js` |
| `48215` | API Fastify (+ `/api/docs` Swagger) | Control Plane (Nucleus) | Nucleus (Go), vía `bootControlPlane()` | `installer/bootstrap/server-bootstrap.js` |
| `5173` | Svelte dev server (webview) | Control Plane (Nucleus) | Nucleus (Go) primero; guard `isPortOpen` evita doble spawn | `installer/bootstrap/server-bootstrap.js` |
| `8787` | Worker (`wrangler dev`) | Backend Cloudflare | Desarrollador, manual | `backend/wrangler.jsonc` → `dev.port` (explícito) |
| `8788` | Vite dev server | Frontend web (`backend/web/`) | Desarrollador, manual | `backend/web/vite.config.ts` → `server.port` (explícito, `strictPort: true`) |

## Reglas

- **Rango reservado por Nucleus/Control Plane — no usar para nada de
  `backend/`**: `4124`, `48215`, `5173`. Están fuera del control de este
  cowork; los define `server-bootstrap.js` y los lanza Nucleus.
- **Todo puerto que use `backend/` o `backend/web/` se fija explícito en su
  archivo de configuración**, no se deja en el default implícito de la
  herramienta (`wrangler dev` sin `dev.port` cae en 8787 igual, pero
  dejarlo implícito es lo que causó la colisión de 5173 — ver Motivo).
  Vite además usa `strictPort: true` para que, si el puerto ya está
  ocupado, falle con un error claro en vez de tomar silenciosamente el
  siguiente puerto libre.
- **Al agregar un servicio nuevo** (otro Worker, otra app de `backend/web/`
  tipo el Wisdom Browser, una herramienta de diagnóstico), se agrega una
  fila acá con el puerto elegido antes de fijarlo en el código, eligiendo
  fuera de la tabla existente.
- Este documento cubre puertos **locales de desarrollo** únicamente. No
  cubre configuración de producción (Cloudflare Workers/Pages no exponen
  puertos locales) ni el puerto `5678` de Brain (TCP, subsistema Go
  separado, fuera del alcance de este cowork — ver
  `ANAYSIS/GRAVITY/SESSION/Investigacion_Gravity_SessionNode_MandateGenesis_v0_1.md`).

## Historial

- **2026-09-03** — creado tras la colisión de `backend/web/` con el puerto
  `5173` del Control Plane. `backend/web/` movido de 5173 (default de Vite,
  no fijado) a `8788` (fijo, `strictPort`). `backend/wrangler.jsonc` fijado
  explícitamente en `8787` (antes: default implícito de `wrangler`).
