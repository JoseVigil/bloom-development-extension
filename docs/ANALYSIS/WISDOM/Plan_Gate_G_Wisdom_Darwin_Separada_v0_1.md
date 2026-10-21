# Gate G de Wisdom en la instalación Darwin separada: plan v0.1

**Fecha:** 2026-10-21. **Estado:** aprobado por José y ejecutado. **PASS** el 21/10 en la corrida `G-20261021-165144`, con la reanudación sobre el mismo Backend desechable. El resultado está en `Estado_Gate_Wisdom_Darwin_Traspaso_Codex_v1_0.md` §4.

**Agregados respecto de este plan, aplicados en la ejecución:**
- marcador `.master` en el Nucleus de R, requisito de `master_local`;
- reanudación `ISO_MODE=resume` con renovación de la emisión de Authority, que vence a los 4 minutos.
**R:** `~/bloom-isolated/wisdom-20261021-012631`. **Backend desechable:** `127.0.0.1:8788`, estado en `R/backend-state`.

**Qué demuestra G:** que la oferta real aparece en Wisdom y que sólo el clic explícito del Paladín descarga, verifica e instala exactamente la versión elegida, que queda inactiva. Todo ocurre en R y nada toca tu instalación.

---

## 1. Qué se escribe en el Backend desechable

Las escrituras van a la D1 y a R2 locales, en `R/backend-state`. El Backend arranca vacío.

| # | Paso | Ruta o comando | Tablas y objetos que escribe (según el código) |
|---|---|---|---|
| B0 | Migraciones 0001–0025 sobre la D1 vacía | `wrangler d1 migrations apply bloom-backend --local --persist-to R/backend-state`, desde `R/checkout/backend` | Esquema completo, incluida `0025_mandate_offers` |
| B1 | Génesis de la organización de prueba con el proveedor fixture | `POST /v1/authority/genesis/login` → `GET /v1/authority/human/callback?state&code=<sujeto-fixture>`. Son las mismas llamadas que el runner hace en 00a/00b | `authority_genesis_flows`, `tenants`, `organizations`, `authority_human_identities`, `authority_genesis_registry`, `authority_human_flows`, `authority_human_sessions` |
| B2 | Emisión inicial de Authority | `POST /v1/authority/initial-emission {organizationId}`, con la sesión de B1 | `authority_initial_emission_commits`, `authority_emissions`, `issuer_signing_keys`, `authority_trust_manifests` (manifest fixture firmado con la raíz de prueba RFC 8032) |
| B3 | Registro de la instalación separada | `nucleus authority register` (token de operador) | `installation_keys`, `authority_installation_capability_declarations` |
| B4 | Sync y reclamo de `wisdom_gate_project` | `nucleus authority sync` | `authority_sync_challenges`, el estado del Durable Object `AUTHORITY_SYNC`, `authority_project_claims`, `authority_project_scope_evidence` |
| B5 | Publicación de la definición firmada | `POST /v1/mandate/offers/publish` (token de operador y modo fixture) | Objeto R2 en `MANDATES` (bytes de la definición), `mandate_definitions`, `mandate_definition_versions` |
| B6 | Habilitación para la organización de prueba | `POST /v1/mandate/offers/enable` | `organization_mandate_offers`; se vuelve a emitir `authority_trust_manifests` con la clave del publicador (`purpose: mandate-definition`) |
| B7 | Catálogo y entrega exacta (durante la instalación) | `GET /v1/mandate/offers?org=` y `GET /v1/mandate/offers/{id}/versions/{v}?…&digest=` | Sólo lectura. El código no escribe al entregar; se confirma al ejecutar |

### Configuración del Backend desechable

Va en `R/checkout/backend/.dev.vars`, un archivo nuevo que sólo existe en R. No se copia nada del `.dev.vars` habitual: `iso-prepare` lo excluye y el sandbox lo deniega.

| Variable | Valor |
|---|---|
| `AUTHORITY_ALLOW_TEST_FIXTURES` | `true` |
| `AUTHORITY_HUMAN_ORIGIN` | `http://127.0.0.1:8788` |
| `AUTHORITY_ISSUER` | Emisor de prueba |
| `AUTHORITY_SIGNING_KEY_ID`, `AUTHORITY_SIGNING_KEY_PKCS8_B64` | Clave Ed25519 nueva, generada para G |
| `AUTHORITY_HUMAN_SESSION_KEY_B64` | Clave de sesión nueva |
| `AUTHORITY_TEST_TRUST_ROOT_PKCS8_B64` | Raíz de prueba RFC 8032 vector 1, que es pública y la que Nucleus fija como `development-rfc8032-root` |
| `AUTHORITY_SERVICE_TOKEN`, `MANDATE_OFFER_OPERATOR_TOKEN` | Tokens aleatorios nuevos |
| `MANDATE_DEFINITION_KEY_ID`, `MANDATE_DEFINITION_PUBLIC_KEY_B64` | Clave pública del publicador de prueba (ver §2) |

Las variables de GitHub (`AUTHORITY_GITHUB_APP_*`) quedan vacías: el modo fixture no las usa.

---

## 2. Qué se escribe en la instalación separada (R)

| Ruta en R | Contenido | Paso |
|---|---|---|
| `checkout/backend/.dev.vars` | Configuración del Backend desechable (§1) | G1 |
| `backend-state/` | D1, R2 y Durable Objects locales de wrangler | B0–B7 |
| `publisher/` | Par de claves del publicador (`mandate-definition-sign keygen`), `definition.json` con label «Genesis» y `preparation: {status: "not_defined"}`, y la definición firmada (`sign`). La clave privada nunca sale de esta carpeta | G4 |
| `home/Library/BloomNucleus/config/nucleus.json` | Se cambian `organization_id` y `backend_identity_org_id`: el id sintético por el id real que devuelve B1 | G2 |
| `home/Library/BloomNucleus/authority/identity.json` | Clave de instalación | B3 |
| `home/Library/BloomNucleus/authority/state.json`, `checkpoint.json` y `project-bindings.json` | Estado aceptado de Authority y vínculo de `wisdom_gate_project` | B4 |
| `home/Library/BloomNucleus/authority/mandate-delivery/receipts/…/receipt.json` | Recibo de la entrega exacta | Instalación |
| `home/Library/BloomNucleus/mandate-definitions/<id>/<versión>/definition.json` | Bytes exactos de la definición | Instalación |
| `home/Library/BloomNucleus/logs/…`, `home/Library/Application Support/Bloom Workspace/…` | Logs de Nucleus, Conductor y wrangler; datos de Electron de R | Toda la corrida |
| `evidence/G-<fecha>/` | Evidencia: huellas, capturas, DOM, conteo de pedidos y veredicto | Toda la corrida |

## 3. Qué se escribe en el proyecto de prueba

`R/workspaces/wisdom-gate/` tiene `wisdom_gate_project/README.md` y la entrada material en `.bloom/.nucleus-wisdom-gate/.core/.nucleus-config.json`. Ambos vienen de la preparación.

| Ruta | Contenido | Cuándo |
|---|---|---|
| `.bloom/.nucleus-wisdom-gate/.mandates/<mandateId>/mandate_state.json` | Instancia con `status: installed`, `projectId`, `definition{…, preparation: not_defined}`, `receiptRef` y `authorization: master_local` | **Sólo** después de tu confirmación en Wisdom |
| `wisdom_gate_project/` | **Ningún cambio.** No se crean `mandate.json`, `docs/` ni `inputs/` | — |

---

## 4. Secuencia

Cada paso se detiene ante la primera divergencia.

| Paso | Qué ocurre | Acción tuya |
|---|---|---|
| G0 | Preflight igual al de E: sin procesos de R vivos, tu salud completa y los puertos con sus dueños. Después, detención registrada de tus servicios y huella habitual (antes) | — |
| G1 | Se genera `.dev.vars` en R, se aplican las migraciones (B0) y arranca `wrangler dev --port 8788 --persist-to R/backend-state` bajo sandbox, con su log en la evidencia | — |
| G2 | B1 y B2. Se escribe el id real de la organización en el `nucleus.json` de R | — |
| G3 | B3 y B4, con el Nucleus de R bajo sandbox. `context-read` tiene que dar `bound`, `present` y `matched` para `wisdom_gate_project` | — |
| G4 | Claves del publicador, firma, publicación y habilitación (B5 y B6) | — |
| G5 | Se abre el Core de R bajo sandbox. Vas a Wisdom | **Ver la oferta** con «Preparación no disponible». El catálogo tiene que tener una oferta y 0 descargas de bytes |
| G6 | Ir a Home, volver a Wisdom y recargar | Navegar. Tiene que seguir en 0 descargas y sin archivos nuevos |
| G7 | «Instalar para wisdom_gate_project» → confirmación | **Clic y confirmar.** Antes de confirmar hay 0 descargas; después, exactamente 1, con la selección exacta. Quedan 1 recibo, 1 definición y 1 `mandate_state.json` `installed`, y 0 `mandate.json` |
| G8 | `nucleus mandate offer prepare` | Tiene que rechazar con `preparation_not_defined` |
| G9 | Se reinician el Nucleus y el Core de R | Tiene que haber 0 workflows nuevos en el Temporal de R y el hash de `mandate_state.json` tiene que seguir igual |
| G10 | Huella habitual (después), denegaciones, dueños de los puertos, cierre de R y restauración verificada, con el `finally` corregido | — |

Las acciones tuyas usan los mismos recuadros de E: instrucción explícita, aviso, tiempo límite y pregunta pendiente. La URL y la captura las registra el script.

---

## 5. Controles que impiden tocar tu instalación

| Riesgo | Control | Cómo se verifica |
|---|---|---|
| Escribir en tu D1 (8787, `backend/.wrangler`) | El Backend de G corre desde `R/checkout/backend` con `--persist-to R/backend-state`. El sandbox deniega todo tu checkout, incluido `.wrangler`, y las conexiones a 8787 | Huella sha256 de `backend/.wrangler` antes y después; 0 denegaciones contra 8787 |
| Que Nucleus de R hable con tu Backend | `authority_base_url` = `http://127.0.0.1:8788` en el `nucleus.json` de R | Log de wrangler (pedidos en 8788) y denegaciones del sandbox |
| Escribir en `~/Library/BloomNucleus`, `elias-repos`, `~/.bloom`, LaunchAgents o el llavero | Sandbox `iso.sb` (lectura y escritura denegadas), `HOME` y `BLOOM_APPDATA_DIR` de R, `--use-mock-keychain` | Huella idéntica; 0 accesos en el log del sandbox |
| Que tus servicios usen los de R (puertos fijos) | Detención registrada de tus servicios; preflight; `finally` que no restaura sobre puertos ocupados | Inventario: cada puerto de R durante la corrida y de tu instalación al final, sin huérfanos |
| Claves o tokens reales | Todas las claves y tokens son nuevos y quedan en R. La raíz de confianza es el vector público RFC 8032 | Inspección de `.dev.vars` de R (sin secretos habituales) |
| Publicación fuera del Backend desechable | `publish` y `enable` sólo apuntan a 8788 y exigen modo fixture y token de operador | Log de wrangler; el Backend 8787 no recibe nada (denegación del sandbox) |

**Volver atrás:** R es autocontenida. Se cierran sus procesos y, si querés, se borra R. Tu instalación no cambia.

---

## 6. Riesgos conocidos, para confirmar en G1 antes de seguir

- `wrangler dev` bajo sandbox tiene que funcionar sin red ni login. Si pide red o una sesión de Cloudflare, G se detiene en G1.
- La emisión inicial exige la sesión humana de B1 (cookie y CSRF). Se usan las mismas llamadas que el runner; si falla, G se detiene en G2.
- El id del proyecto de prueba es un UUID v4, compatible con el reclamo, que exige un UUID canónico.

---

## 7. Decisiones de José

1. Plan aprobado.
2. Ejecución autorizada en la instalación separada R, con el Backend desechable en 8788.
