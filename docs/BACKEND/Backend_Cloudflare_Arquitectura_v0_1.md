# Backend en Cloudflare — Distribución, Cuentas y Mandates

**Tipo:** Recomendación de arquitectura (asesoría), no implementación
**Estado:** Borrador v0.3 — decisiones confirmadas por Jose entre []; el resto es propuesta a validar
**Fecha:** 2026-08-29 (v0.1 inicial) — actualizado el mismo día tras confirmación de la Opción A (§6), con los primeros pasos concretos (§9), y con la nota de estado que sigue.
**Nota de estado (2026-08-29):** §9 de este documento pasó de "primeros pasos propuestos" a **en ejecución** — el loop mínimo (Backend sirviendo manifest de ion recipes + Batcave consumiéndolo con ETag) quedó asignado a los works de Codex BACKEND y BATCAVE. Ver `CODEX_Backend_Batcave_Status_v0_1.md` (mismo directorio) para el corte de alcance exacto. Este cowork queda libre para el resto de las etapas conceptuales (catálogo, canales, audiencias, políticas comerciales, retención, observabilidad, etc.), sin tocar el contrato operativo ya en manos de esos dos works.
**Contexto:** conversación en la que se pidió asesoría para migrar sitios de Vercel a Cloudflare y construir, en el mismo repo (`bloom-nucleus-installer`), una aplicación backend nueva para: (1) distribuir binarios pesados del ecosistema Bloom, (2) registrar cuentas de usuario, (3) alojar una base de datos de Mandates para el futuro marketplace inter-organizacional.
**Fuentes revisadas para este documento:** `BTIPS_Bloom_Technical_Intent_Package_v7_1_1.md`, `BATCAVE_ARCHITECTURE.md`, `metamorph-ionpump-reference.md`, `METAMORPH_COMANDOS.md` (los cuatro del repo local), más inspección directa de la estructura del repo (`package.json`, `installer/`, `backend/`, `contracts/`, `build-all.py`).

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

**Conclusión:** lo que estás pidiendo no es una pieza nueva conceptualmente — es construir el `Bloom Update Server` + el backend del Marketplace de Mandates, que el propio diagrama ya reserva un lugar para ellos. Por eso la ubicación en el repo también ya está reservada: existe una carpeta `backend/` en la raíz del repo, creada el 10 de junio, **vacía**. Es el lugar obvio para esta app nueva.

---

## 2. Estructura del repo — cómo entra la app nueva sin romper el patrón existente

El repo (`bloom-nucleus-installer`) no es un monorepo con `workspaces` de npm/pnpm — es un único paquete que orquesta subcarpetas independientes bajo `installer/` (`batcave/`, `conductor/`, `metamorph/`, `nucleus/`, `sentinel/`, etc.), cada una con su propio `package.json`, construidas por un orquestador Python (`build-all.py`, ya usado hoy con `--only batcave`).

**Actualización (2026-08-29):** la carpeta se llama `backend/`, no `workers/` — decisión de Jose por consistencia con el resto del repo. `installer/`, `contracts/` se nombran por *rol*, no por tecnología; `workers/` rompía esa convención y además quedaría desactualizado si el día de mañana este servicio dejara de correr sobre Cloudflare Workers. La carpeta vacía que existía en la raíz desde el 10 de junio se renombró de `workers/` a `backend/` — se conserva el mismo slot reservado, solo cambia el nombre.

Dado que esta app no se instala en la máquina del usuario (no es parte del `BloomNucleus/` que Metamorph gestiona) sino que es un servicio que **Jose** despliega una sola vez en Cloudflare, vive en la raíz del repo (`backend/`) y no dentro de `installer/` — no es un artefacto del instalador, es infraestructura propia. Se integra a `build-all.py` con un flag nuevo (`--only backend`) siguiendo la misma convención que ya usa Batcave, y su deploy es `wrangler deploy` (o vía CI), no `metamorph rollout`.

`contracts/` (con `types.ts`, `errors.ts`, `state-machines.ts`, `websocket-protocol.ts`) ya es el lugar donde el repo comparte tipos TypeScript entre componentes (Batcave, Conductor, etc.). Los tipos de `Mandate`, `User`, `Organization`, `Release` que defina el backend nuevo deberían vivir ahí también, para que Batcave y Nucleus los importen sin duplicar definiciones — mismo patrón que ya usan `OwnershipSchema`/`BatcaveConfigSchema` con Zod en `batcave/`.

---

## 3. Stack recomendado para `backend/`

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

**Corrección (2026-08-29), tras revisar el código real de Metamorph, no solo la documentación:** la primera versión de este documento afirmaba que el formato existente era `artifacts[]`/`ion_recipes[]`, citando el ejemplo de manifest de `BTIPS` y el README de `installer/metamorph`. Codex revisó el consumidor real (Go) y encontró que **`metamorph generate-manifest` es un stub sin implementar** (`internal/inspection/generate_manifest.go` devuelve literalmente `"status": "not_implemented"`) y que **`metamorph reconcile` solo existe dentro de `internal/ionpump/`** — no hay ningún comando ni struct real en el repo que parsee `artifacts[]`/`manifest_version`/`system_version`. Ese formato, tal como aparece en el README de Metamorph, es una descripción aspiracional, nunca construida.

Lo único real y funcionando hoy es el manifest de **ion recipes** que consume `internal/ionpump/manifest.go`: `{"schema_version": "...", "generated_at": "...", "ions": []}`. Confirmado también por grep directo sobre el código: cero resultados para `manifest_version`/`system_version`/`ManifestVersion` en todo `installer/metamorph/**/*.go`.

**Implicancia para el backend:** `releases`+`downloadRules` (§4) siguen siendo la fuente correcta de datos, pero el manifest que el backend produzca para **ion recipes** (`component: "ionrecipe:github.com"`) debe seguir el contrato real `{schema_version, generated_at, ions[]}` — no un `artifacts[]` inventado. Para los **componentes binarios** (`brain`, `host`, `sentinel`, etc.) no hay hoy ningún consumidor real del lado de Metamorph — construir ese formato de manifest sería inventar un contrato para algo que Metamorph todavía no sabe leer. El schema D1 no cambia (ya modela ambos como filas de `releases`), pero el endpoint solo puede servir de punta a punta, hoy, el manifest de ion recipes; la distribución de binarios queda con el dato guardado en R2/D1 pero sin un consumidor real confirmado del otro lado hasta que `generate-manifest`/`reconcile` de binarios se construya (o Jose confirme otro mecanismo).

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
- **"Qué debería descargarse"** = el `r2Key`/`sha256` de esas filas, ya presente en el esquema — para ion recipes, el backend arma el contrato real `{schema_version, generated_at, ions[]}` que `internal/ionpump` ya sabe interpretar (ver corrección en §4); para componentes binarios, ver la limitación señalada en esa misma corrección.
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

1. ~~Medir el volumen real de binarios~~ — **resuelto**: `~/.local/share/BloomNucleus/bin` pesa 2.2 GB (4.1 GB el árbol completo). R2 Standard alcanza sobrado incluso reteniendo varias versiones para rollback; no hace falta Infrequent Access todavía. El componente más pesado es `chrome-linux` (697 MB, un Chrome embebido) — vale confirmar si eso necesita viajar por el manifest o es prescindible.
2. **Confirmar rutas de los dos proyectos Vercel** para decidir Pages vs Workers por sitio.
3. **Cerrar las 5 decisiones de `Backend_Batcave_Nucleus_Identidad_y_Comunicacion_v0_1.md` §11** (confianza inicial en la clave pública, targeting por-device, reglas de revocación, TTL de credencial, WebSocket vs. SSE) antes de implementar el canal push. El pull autoritativo (§6 de este documento) no depende de esas decisiones y se puede construir antes.
4. **Roles en la base de datos** (§0, §4 `orgMembers.role`): queda como está hasta que compartas la información pendiente.
5. Definir el formato exacto del `mandate.json` firmado que se sube a R2 — este documento asume que ya existe un formato (Nucleus lo firma), pero no vi todavía un schema consolidado de Mandate en el repo — puede ser el mismo trabajo pendiente que señalan los documentos de Gravity/Nucleus API ya en este proyecto, y que retoma en detalle la investigación de Wisdom (`BLOOM_Wisdom_Handshake_Investigacion_v0_1.md`, `docs/WISDOM/`).
6. **Confirmar el plan para distribución de binarios** (§4/§6): hoy solo el manifest de ion recipes tiene un consumidor real en Metamorph. Antes de invertir en el endpoint de manifest para componentes binarios (`brain`/`host`/`sentinel`/etc.), confirmar si `generate-manifest`/`reconcile` de binarios está en el roadmap de Metamorph, o si hay otro mecanismo previsto que no está en los documentos revisados.

---

## 9. Primeros pasos concretos — cómo arrancamos

### 9.1 Servidor local en `backend/`

Con el stack ya elegido (Hono + D1 + Drizzle), la secuencia concreta para tener algo corriendo en tu máquina, en orden:

1. **Scaffold del proyecto**, en la carpeta ya reservada del repo:
   ```bash
   cd backend
   npm create cloudflare@latest -- . --type=simple --lang=ts --deploy=false
   ```
   (`--deploy=false` para no disparar un deploy real todavía; podés correrlo interactivo si preferís elegir las opciones a mano — plantilla "Hello World", tipo "Worker only", TypeScript.)

2. **Crear la base D1** y dejar que Wrangler te dé el binding:
   ```bash
   npx wrangler d1 create bloom-backend
   ```
   Esto imprime el bloque de config (`d1_databases`) para pegar en `wrangler.jsonc` (formato vigente hoy; `wrangler.toml` sigue soportado si preferís ese formato) — ahí van el `binding`, `database_name` y `database_id`.

3. **Agregar Drizzle** encima del binding, no en lugar de Wrangler:
   ```bash
   npm install drizzle-orm
   npm install -D drizzle-kit
   ```
   Definís el esquema de §4 en `contracts/marketplace-schema.ts`, generás la migración SQL con `drizzle-kit generate`, y la aplicás **local** (nunca toca la nube en este paso):
   ```bash
   npx wrangler d1 migrations apply bloom-backend --local
   ```

4. **Levantar el server local**:
   ```bash
   npx wrangler dev
   ```
   Esto corre el Worker contra la D1 local (un SQLite real bajo `.wrangler/state/`, tal como se explica en §5) en `localhost:8787` — nada de esto toca Cloudflare todavía, es 100% local.

5. **Seed de prueba**: un script chico (`seed.sql` o un endpoint temporal) que cree una organización y un usuario de prueba, para poder probar `GET /v1/manifest` de punta a punta sin depender de datos reales.

6. Recién en este punto conviene volver a `build-all.py` para sumar el flag `--only backend` (§2) — es un paso de integración con el resto del repo, no bloquea nada de lo anterior.

No hace falta tocar el canal push (`Backend_Batcave_Nucleus_Identidad_y_Comunicacion_v0_1.md`) para este primer arranque — el pull autoritativo (`GET /v1/manifest`, §6) es lo único que hace falta para tener un servidor local útil.

### 9.2 Migración de los sitios de Vercel

Acá seguimos bloqueados en el mismo punto de siempre: **necesito las rutas locales de los dos proyectos** para poder mirar su `package.json`/framework real en vez de asumir. Mientras tanto, así es como conviene auditarlos apenas los tenga:

1. Leer `package.json` (framework, scripts `build`/`dev`) y cualquier `next.config.js`/`vercel.json` existente — ahí aparece si usan algo Vercel-specific sin equivalente directo en Cloudflare (Edge Functions con APIs propias de Vercel, ISR, Image Optimization con su servicio propio, Vercel Cron) que necesite adaptación, no solo un cambio de hosting.
2. **Si son estáticos/exportables**: Cloudflare Pages directo, conectando el repo — mismo modelo de deploy por git que ya usás en Vercel.
3. **Si son Next.js con SSR/API routes**: instalar el adaptador y construir con él en vez del build de Next a secas —
   ```bash
   npm install @opennextjs/cloudflare
   npx @opennextjs/cloudflare
   wrangler deploy
   ```
   Un requisito real a chequear antes de migrar: el adaptador necesita que las rutas corran en **Node.js runtime**, no en Edge runtime — si alguna ruta del proyecto está forzada a `edge`, hay que revisarla primero. Límite a tener presente: Workers tiene un tope de tamaño de 10 MiB comprimido en el plan pago (3 MiB en Free) — un bundle de Next.js grande puede pegar contra ese límite y requerir revisar qué se está empaquetando de más.
4. Migrar variables de entorno/secrets de Vercel a Cloudflare (`wrangler secret put` por variable, o Pages secrets si terminó en Pages).
5. Cutover de DNS al final, no antes: dejar el deploy de Cloudflare corriendo en paralelo (con su URL de preview) hasta confirmar paridad real contra el sitio en Vercel, y recién ahí mover el dominio.

---

*Fin del borrador v0.3. Este documento es asesoría de arquitectura — no implementa código; §9 son los pasos que se ejecutarían si decidís avanzar.*
