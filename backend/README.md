# Bloom Cloudflare Backend

Cloudflare Worker for Bloom's authoritative ion-recipe manifest, backed by a local or remote D1 database.

## Local development

```text
npm install
npm run db:migrate:local
npm run db:seed:local
npm run dev
```

Then request:

```text
GET http://localhost:8787/v1/manifest?org=bloom:org:local&channel=stable
```

The local D1 database and local R2 bucket live under `.wrangler/` and do not contact Cloudflare. The placeholder `database_id` in `wrangler.jsonc` must be replaced with the id returned by `wrangler d1 create bloom-backend` before a remote deployment.

## Modo fixture (`AUTHORITY_ALLOW_TEST_FIXTURES`)

Para pruebas E2E (por ejemplo el Synapse Runner) que necesitan ejercitar el login
humano de `/v1/authority/human/*` sin automatizar la pantalla real de GitHub —lo
cual violaría `docs/CORTEX/AUTHORITY_BOUNDARY.md` §1—, el backend soporta un modo
fixture que inyecta el estado interno post-login directamente, igual que el
Synapse Simulator hace del lado de la extensión.

```text
cp .dev.vars.example .dev.vars
npm run dev
```

Con `AUTHORITY_ALLOW_TEST_FIXTURES=true` en `.dev.vars`, `configuredAuthorityHumanResponse`
usa `testFixtureProvider()` en vez de `githubAppProvider()`: no se genera ninguna URL de
github.com y no hay ningún fetch saliente. `.dev.vars` sólo lo lee `wrangler dev` —
`wrangler deploy` nunca lo incluye, así que esta variable no puede llegar a un
despliegue real por accidente. Ver `.dev.vars.example` para el detalle completo.

