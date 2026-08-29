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

