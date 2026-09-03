# web/ — Login + ABM de usuarios (primer módulo)

Frontend de Bloom. React + Vite + TypeScript, desplegable como sitio estático
(Cloudflare Pages). Es el primer módulo de lo que en `docs/BACKEND/Alcance_Infraestructura_Web_Comercial_v0_1.md`
se anotó como cuatro superficies web necesarias: este ABM, el Wisdom Browser,
la suscripción y el panel de desarrollador. Los otros tres todavía no tienen
ni carpeta.

## Por qué este stack

- **React + Vite, no Next.js**: es un panel interno (login + ABM), no un sitio
  público — no necesita SSR ni SEO. Next.js queda reservado para los dos
  sitios de Vercel que se van a migrar por separado (ver
  `docs/BACKEND/Backend_Cloudflare_Arquitectura_v0_1.md` §7).
- **Sin librería de UI ni de fetching de datos** todavía — el ABM es chico
  (listar/invitar/cambiar rol/quitar) y no lo justifica hoy. Si crece,
  agregar TanStack Query es el paso natural antes de escribir más `useEffect`
  a mano.
- **Cloudflare Pages** como destino de deploy, mismo proveedor que `backend/`
  — consistente con la decisión ya tomada de mover todo a Cloudflare.

## Cómo correr esto en desarrollo

```bash
cd backend/web
npm install
cp .env.example .env
npm run dev
```

Esto levanta Vite en `localhost:8788` (fijo, `strictPort` — ver "Puertos"
abajo) y hace proxy de `/v1/*` hacia `localhost:8787` (el Worker de
`backend/` corriendo con `wrangler dev`) — así que para probar de punta a
punta hace falta tener las dos cosas corriendo: `backend/` (`npm run dev`)
y `backend/web/` (`npm run dev`), en dos terminales.

## Puertos

Este repo tiene dos sistemas corriendo puertos locales que no se conocen
entre sí: el Control Plane de Nucleus (`docs/BOOTSTRAP/BOOTSTRAP_CONTROL_PLANE.md`)
y este backend/frontend de Cloudflare. Nunca elegir un puerto para acá sin
chequear `docs/BACKEND/Registro_Puertos_Locales_v0_1.md` primero — ese
documento es la fuente de verdad, esta tabla es solo un resumen:

| Puerto | Servicio | Dueño |
|---|---|---|
| `8787` | Worker (`wrangler dev`) | este `backend/` |
| `8788` | Vite dev server | este `backend/web/` |
| `4124` | WebSocket server | Control Plane (Nucleus) — no tocar |
| `48215` | API Fastify | Control Plane (Nucleus) — no tocar |
| `5173` | Svelte dev server (webview) | Control Plane (Nucleus) — no tocar |

## Gap conocido — esto no funciona todavía de punta a punta

`backend/` hoy solo expone tres endpoints reales: `GET /`, `GET /v1/manifest`
y `GET /v1/releases/:id/download`. **Ninguno de los endpoints que este
frontend necesita existe todavía**:

- `GET /v1/auth/github/start`, `GET /v1/auth/session`, `POST /v1/auth/logout`
- `GET/POST /v1/organizations/:id/users`, `PATCH`/`DELETE .../:userId`

Están definidos como contrato en `src/api/auth.ts` y `src/api/users.ts`
(con el comentario correspondiente en cada archivo) para que el frontend
tenga un lugar único y tipado que actualizar el día que esos endpoints
existan — hoy, llamarlos devuelve 404. Esos endpoints son responsabilidad
del trabajo de autoridad organizacional de Roles
(`docs/ANAYSIS/BACKEND/ROLES/BACKEND_Requerimiento_Autoridad_Organizacional_Roles_v0_1.md`),
que todavía está en fase de investigación — no de implementación — así que
no se construyeron acá.

También falta, del lado de `backend/`, habilitar CORS para que un origen
distinto (`localhost:8788` en desarrollo, el dominio de Pages en producción)
pueda llamarlo con `credentials: "include"` — hoy `src/index.ts` no tiene
ningún middleware de CORS. No lo toqué porque es un archivo que está
construyendo el work BACKEND de Codex.

## Estructura

```
src/
├── main.tsx              punto de entrada — Router + SessionProvider
├── App.tsx                definición de rutas
├── api/
│   ├── client.ts          fetch wrapper único (headers, errores, base URL)
│   ├── auth.ts             contrato de login/sesión (endpoints no existen aún)
│   └── users.ts             contrato del ABM (endpoints no existen aún)
├── context/SessionContext.tsx  estado de sesión global
├── hooks/useSession.ts     acceso al contexto de sesión
├── types/user.ts           tipos compartidos (Role, User, ...)
├── components/
│   ├── auth/                LoginButton, AuthGuard
│   ├── users/                UserTable, UserForm, RoleBadge
│   └── layout/               AppShell (header + logout)
├── routes/                  Login, Users, NotFound
└── styles/                  tokens.css (paleta/spacing) + global.css
```

Cada pieza tiene una sola responsabilidad: `api/` no sabe de React, los
componentes de `components/users/` no saben de fetch, y `routes/` es lo
único que conecta datos con presentación. Agregar Wisdom Browser más
adelante debería significar sumar `api/wisdom.ts`, `components/wisdom/` y
`routes/Wisdom.tsx`, sin tocar lo que ya existe acá.

## Próximos pasos, no hechos en este primer pase

- ESLint/Prettier (se dejó afuera para no sumar configuración sin poder
  probarla contra el resto del repo).
- Los endpoints reales de auth/ABM del lado de `backend/`.
- CORS en `backend/src/index.ts`.
- Tests (Vitest + Testing Library, mismo runner que ya usa `backend/`).
