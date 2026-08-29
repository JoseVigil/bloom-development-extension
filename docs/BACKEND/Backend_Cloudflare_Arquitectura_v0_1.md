# Backend en Cloudflare — Distribución, Cuentas y Mandates

**Tipo:** Recomendación de arquitectura (asesoría), no implementación
**Estado:** Borrador v0.2 — decisiones confirmadas por Jose entre []; el resto es propuesta a validar
**Fecha:** 2026-08-29 (v0.1 inicial) — actualizado el mismo día tras confirmación de la Opción A (§6)
**Contexto:** conversación en la que se pidió asesoría para migrar sitios de Vercel a Cloudflare y construir, en el mismo repo (`bloom-nucleus-installer`), una aplicación backend nueva para: (1) distribuir binarios pesados del ecosistema Bloom, (2) registrar cuentas de usuario, (3) alojar una base de datos de Mandates para el futuro marketplace inter-organizacional.
**Fuentes revisadas para este documento:** `BTIPS_Bloom_Technical_Intent_Package_v7_1_1.md`, `BATCAVE_ARCHITECTURE.md`, `metamorph-ionpump-reference.md`, `METAMORPH_COMANDOS.md` (los cuatro del repo local), más inspección directa de la estructura del repo (`package.json`, `installer/`, `workers/`, `contracts/`, `build-all.py`).

---

## 0. Lo que ya está decidido (respuestas de Jose)

| Decisión | Respuesta |
|---|---|
| ¿Qué son los sitios a migrar? | Están en **Vercel** (no "Dersel"), corridos hoy desde dos proyectos locales en la máquina de Jose. Rutas exactas: pendiente. |
| Base de datos | **Cloudflare D1** — valorado explícitamente por poder simularse localmente en SQLite para desarrollo, y por la portabilidad de SQLite. |
| Volumen de binarios | Pendiente medir — el candidato real es `~/.local/share/BloomNucleus/bin` (AppData de Linux, según `BTIPS §2.13`). El pedido de acceso a esa carpeta no se confirmó a tiempo; queda como próximo paso (§8). |
| Relación con Batcave | **Separado** — el backend nuevo es un origen que alimenta a Batcave/Metamorph. Batcave sigue siendo el control plane soberano en GitHub Codespaces, sin tocarlo. |
| Quién habla con el backend nuevo (§6) | **Confirmado: Batcave** (no Metamorph). Batcave sondea el backend cada X horas/diario y traduce lo que encuentra en manifests que Metamorph ya sabe consumir. |
| Roles en la base de datos | Pendiente — Jose va a dar más información; el esquema de §4 queda como está mientras tanto. |

---

## 1. Dónde encaja esto en la arquitectura que ya existe

El diagrama de `BTIPS v7.1.1` (sección 2️⃣) ya dibuja la pieza que falta, sin que nadie la haya construido todavía:

```
BloomUpdateServer["📦 Bloom Update Server\nManifests firmados · Ion Recipes"]
    │
    │ "manifests firmados / ion recipes"
    ▼
Batcave (GitHub Codespaces, control plane soberano por-organización)
    │ Nucleus valida firma + ACL
    ▼
Metamorph (reconciliador local — nunca toca internet)
```

Y por el lado de negocio, `BTIPS §7️⃣` ya describe el **Marketplace de Mandates** como "el producto central del ecosistema Bloom" — un ecosistema horizontal donde cualquier organización puede publicar y adoptar Mandates — pero tampoco tiene todavía ningún backend que lo materialice.

**Conclusión:** lo que estás pidiendo no es una pieza nueva conceptualmente — es construir el `Bloom Update Server` + el backend del Marketplace de Mandates, que el propio diagrama ya reserva un lugar para ellos. Por eso la ubicación en el repo también ya está reservada: existe una carpeta `workers/` en la raíz del repo, creada el 10 de junio, **vacía**. Es el lugar obvio para esta app nueva.

---

## 2. Estructura del repo — cómo entra la app nueva sin romper el patrón existente

El repo (`bloom-nucleus-installer`) no es un monorepo con `workspaces` de npm/pnpm — es un único paquete que orquesta subcarpetas independientes bajo `installer/` (`batcave/`, `conductor/`, `metamorph/`, `nucleus/`, `sentinel/`, etc.), cada una con su propio `package.json`, construidas por un orquestador Python (`build-all.py`, ya usado hoy con `--only batcave`).

Dos alternativas de ubicación:

1. **`workers/`** (recomendado) — ya existe, ya está vacía, ya tiene un nombre que evoca exactamente Cloudflare Workers. La uso como raíz del proyecto Wrangler.
2. `installer/backend/` — seguiría el patrón exacto de `installer/batcave/`, `installer/metamorph/`, etc. como componente más del instalador.

Dado que esta app no se instala en la máquina del usuario (no es parte del `BloomNucleus/` que Metamorph gestiona) sino que es un servicio que **Jose** despliega una sola vez en Cloudflare, `workers/` es semánticamente más correcto: no es un artefacto del instalador, es infraestructura propia. Se integra a `build-all.py` con un flag nuevo (`--only backend`) siguiendo la misma convención que ya usa Batcave, y su deploy es `wrangler deploy` (o vía CI), no `metamorph rollout`.

`contracts/` (con `types.ts`, `errors.ts`, `state-machines.ts`, `websocket-protocol.ts`) ya es el lugar donde el repo comparte tipos TypeScript entre componentes (Batcave, Conductor, etc.). Los tipos de `Mandate`, `User`, `Organization`, `Release` que defina el backend nuevo deberían vivir ahí también, para que Batcave y Nucleus los importen sin duplicar definiciones — mismo patrón que ya usan `OwnershipSchema`/`BatcaveConfigSchema` con Zod en `batcave/`.

---

## 3. Stack recomendado para `workers/`

| Pieza | Elección | Por qué |
|---|---|---|
| Runtime | **Cloudflare Workers** | Ya es la plataforma elegida; sin servidores que administrar, escala a cero costo en reposo. |
| Router/framework | **Hono** | Liviano, TypeScript-first, pensado para el runtime de Workers (no Node) — consistente con el resto del repo, que ya es TS con Zod. |
| Base de datos | **Cloudflare D1** (confirmado) | SQLite en el edge. Límite real: 10 GB por base en el plan pago (500 MB en Free), con hasta 50.000 bases por cuenta — si algún día hiciera falta particionar por organización, D1 lo permite sin cambiar de motor. Para cuentas + metadata de Mandates este límite no es un problema en ningún horizonte previsible. |
| ORM | **Drizzle ORM** | Soporta D1 nativamente y también SQLite plano — exactamente lo que permite correr contra una base local en desarrollo sin tocar la capa de acceso a datos. |
| Objetos grandes (binarios, blobs de Mandate firmados) | **Cloudflare R2** | Compatible S3, **egress $0** vía Workers/API pública — clave para archivos ejecutables autoextraíbles pesados. Storage: `$0.015/GB-mes` (Standard). |
| Cache efímero (nonces, sesiones cortas) | **Cloudflare KV** | Mismo rol que ya cumple el par QR+nonce de Batcave (TTL 30s) — reutilizable para sesiones del backend. |
| Autenticación | **GitHub OAuth** (reutilizar patrón) | El ecosistema ya autentica identidad de desarrollador vía GitHub en tres lugares (`Batcave Auth`, VS Code Plugin, `Repo Ops`). Un cuarto mecanismo de login sería inconsistente — conviene que las cuentas del Marketplace usen la misma identidad de GitHub, y que el `organization_fingerprint` (`bloom:org:{name}`) sea la clave que amarra usuario ↔ organización ↔ Nucleus. |

---

## 4. Esquema de datos propuesto (D1 / Drizzle)

```ts
// contracts/marketplace-schema.ts (Drizzle + D1)

organizations {
  id: text (pk)                 // "bloom:org:acme" — mismo fingerprint que .ownership.json
  name: text
  masterGithubUsername: text
  keyFingerprint: text
  createdAt: integer
}

users {
  id: text (pk)                 // github user id
  githubUsername: text
  email: text (nullable)
  createdAt: integer
}

orgMembers {
  orgId: text (fk organizations.id)
  userId: text (fk users.id)
  role: text                    // "master" | "architect" | "specialist" — mismo modelo que Nucleus
  // pendiente: esquema de roles completo — Jose va a dar más información (§0)
}

mandates {                      // catálogo — un producto publicado
  id: text (pk)
  originOrgId: text (fk organizations.id)
  slug: text
  description: text
  visibility: text              // "public" | "org_only"
  latestVersion: text
  createdAt: integer
}

mandateVersions {               // inmutable por versión — apunta al blob real
  id: text (pk)
  mandateId: text (fk mandates.id)
  version: text                 // semver
  r2Key: text                   // ubicación del mandate.json firmado en R2
  sha256: text
  publishedAt: integer
}

mandateAdoptions {               // transacciones del marketplace
  id: text (pk)
  mandateVersionId: text (fk)
  adoptingOrgId: text (fk organizations.id)
  adoptedAt: integer
}

releases {                       // catálogo de binarios — alimenta el manifest de Metamorph
  id: text (pk)
  component: text                // "brain" | "host" | "sentinel" | "conductor" | "cortex" | "sensor" | "ionrecipe:github.com"
  version: text
  channel: text                  // "stable" | "beta"
  platform: text                 // "win" | "mac" | "linux"
  r2Key: text
  sha256: text
  sizeBytes: integer
  publishedAt: integer
}

downloadRules {                  // reglas de descarga/actualización por organización
  id: text (pk)
  organizationId: text (nullable) // null = regla global default
  component: text
  channel: text
  pinnedVersion: text (nullable)  // fuerza una versión específica para esa org
  rolloutPercent: integer (nullable) // canary
}
```

`releases` + `downloadRules` son, literalmente, la fuente de la que se computa el mismo `artifacts[]`/`ion_recipes[]` que Metamorph ya sabe consumir (`METAMORPH_ARCHITECTURE §Formato de Manifest`, `metamorph-ionpump-reference.md §2` `IonRecipeUpdate`). No hace falta inventar un formato nuevo — el backend nuevo simplemente **produce** el manifest que Batcave ya espera recibir del "servidor de origen", y es sobre estas dos tablas que se resuelve el mecanismo de sondeo confirmado en §6.

---

## 5. Desarrollo local con D1 — por qué tu instinto es correcto

`wrangler` soporta correr D1 completamente local (`wrangler d1 execute --local`, o el binding automático en `wrangler dev`), que crea un archivo SQLite real bajo `.wrangler/state/`. Con Drizzle:

- El mismo esquema (`drizzle-kit generate` → migraciones SQL) corre contra la base local en desarrollo y contra D1 en producción — no hay divergencia de dialecto porque D1 **es** SQLite.
- Se puede versionar un `seed.sql` con organizaciones/usuarios de prueba para levantar el entorno completo sin tocar la nube.
- Tests de integración pueden correr contra `:memory:` o un archivo temporal, sin mockear la capa de datos.

Esto confirma la ventaja que mencionaste: es el escenario más portable de los tres motores considerados (D1 nativo, Postgres externo vía Hyperdrive, o algo intermedio) — no depende de red ni de un proveedor externo para desarrollar.

---

## 6. Batcave habla con el backend — decisión confirmada (Opción A), mecanismo evolucionado a modelo híbrido

> **Actualización (2026-08-29):** el mecanismo de este §6 evolucionó de "solo polling" a un **modelo híbrido** (push liviano + pull autoritativo + polling de respaldo con jitter), a pedido tuyo explícito. El diseño completo de identidad, enrolamiento, credenciales, targeting, revocación y replay/recovery para ese modelo vive en un documento aparte — `Backend_Batcave_Nucleus_Identidad_y_Comunicacion_v0_1.md` (mismo directorio) — para no mezclar el diseño de identidad con esta arquitectura general. Lo que sigue en este §6 describe el pull autoritativo, que no cambió y sigue siendo la única fuente que Batcave trata como verdad.

Confirmaste la Opción A del borrador anterior: el propio servidor de Batcave en GitHub Codespaces es quien habla con el backend central (nunca Metamorph), y ahí necesitamos un mecanismo que informe **qué cambió y qué debería descargarse**, para que Metamorph lo aplique localmente.

`BTIPS §2.13` sigue intacto como invariante — Metamorph **jamás se conecta a internet**, y `metamorph-ionpump-reference.md` no expone ningún cliente HTTP saliente en `IonPumpClient` (solo `QuiesceSite`/`ReloadSite`, contra Brain local). Con la Opción A confirmada, esto queda así, sin tocar ninguna garantía de seguridad documentada:

```
[cron en Batcave, cada X horas o diario]
        │
        ▼
GET /v1/manifest?org={orgId}&channel={channel}
   (If-None-Match: <ETag guardado del último poll>)
        │
        ▼
Backend (workers/) resuelve `releases` + `downloadRules` para esa org/canal
        │
   ┌─────┴──────┐
   │ 304        │  sin cambios — Batcave no hace nada, actualiza `lastPolledAt` local y listo
   │ 200 + ETag │  hay manifest nuevo — Batcave lo valida (firma Nucleus) y se lo entrega a Metamorph
   └────────────┘
```

Esto queda resuelto de una vez, sin trabajo adicional, porque ya estaba en el esquema de §4:

- **"Qué se actualiza"** = filas de `releases` con `publishedAt` más reciente que el último manifest que Batcave vio.
- **"Qué debería descargarse"** = el `r2Key`/`sha256` de esas filas, ya presente en el esquema — el backend no inventa un formato nuevo, arma el mismo `artifacts[]` que Metamorph ya sabe interpretar (§4).
- El **ETag** (hash del manifest resuelto para esa org/canal) es el mecanismo nativo de HTTP/Cloudflare Workers para no recomputar ni retransmitir nada cuando no cambió nada — barato en cómputo y en egress, y evita que Batcave tenga que descargar y comparar el manifest completo en cada sondeo.

Dos puntos quedan abiertos, y son decisión tuya, no técnica:

- **Cadencia exacta** ("todos los días o cada X horas"): ¿constante global en el cron de Batcave, o configurable por organización (columna nueva `pollIntervalMinutes` en `organizations`)? Ambas caben en el esquema actual sin romper nada — lo dejo abierto hasta que definas si distintas organizaciones necesitan cadencias distintas (planes distintos, urgencia de actualización distinta, etc.).
- **Dónde vive el estado del último poll** (el ETag/versión que Batcave ya vio): recomiendo que lo persista el propio Batcave localmente — mismo patrón que `_meta/versions.json` de IonPump en Metamorph (quien consume es quien recuerda qué ya tiene) — así el backend se mantiene sin estado de sesión por organización, más simple y más barato de operar.

La Opción B (Metamorph con cliente HTTP propio) queda descartada por tu confirmación; no se vuelve a mencionar salvo que cambies de idea.

---

## 7. Sitios (Vercel → Cloudflare)

Pendiente confirmar si son estáticos o tienen lógica de servidor (Next.js con API routes, SSR, etc. corriendo en Vercel casi siempre implica lo segundo). Dos caminos según eso:

- **Si son estáticos o exportables** (`next export`, Astro, Vite, etc.): **Cloudflare Pages** directo — el reemplazo más simple de Vercel, mismo modelo de despliegue por git.
- **Si tienen backend propio (Next.js con SSR/API routes)**: el adaptador vigente hoy es **`@opennextjs/cloudflare`** (sucesor de `@cloudflare/next-on-pages`, que quedó deprecado) — corre el mismo Next.js sobre Workers, incluyendo rutas de API, sin reescribir la app.

Decíme las rutas de los dos proyectos cuando quieras y reviso el `package.json`/framework de cada uno para confirmar cuál camino aplica a cada sitio.

---

## 8. Pendientes antes de pasar a implementación

1. **Medir el volumen real de binarios**: pedí acceso a `/home/jose/.local/share/BloomNucleus` y el diálogo se cerró sin respuesta — retomar cuando quieras (`du -sh bin/*` alcanza) para dimensionar si R2 Standard alcanza o conviene Infrequent Access para versiones viejas retenidas para rollback.
2. **Confirmar rutas de los dos proyectos Vercel** para decidir Pages vs Workers por sitio.
3. **Cerrar las 5 decisiones de `Backend_Batcave_Nucleus_Identidad_y_Comunicacion_v0_1.md` §11** (confianza inicial en la clave pública, targeting por-device, reglas de revocación, TTL de credencial, WebSocket vs. SSE) antes de implementar el canal push. El pull autoritativo (§6 de este documento) no depende de esas decisiones y se puede construir antes.
4. **Roles en la base de datos** (§0, §4 `orgMembers.role`): queda como está hasta que compartas la información pendiente.
5. Definir el formato exacto del `mandate.json` firmado que se sube a R2 — este documento asume que ya existe un formato (Nucleus lo firma), pero no vi todavía un schema consolidado de Mandate en el repo — puede ser el mismo trabajo pendiente que señalan los documentos de Gravity/Nucleus API ya en este proyecto, y que retoma en detalle la investigación de Wisdom (`BLOOM_Wisdom_Handshake_Investigacion_v0_1.md`, `docs/MANDATE/MARKETPLACE/`).

---

*Fin del borrador v0.2. Este documento es asesoría de arquitectura — no implementa código.*
