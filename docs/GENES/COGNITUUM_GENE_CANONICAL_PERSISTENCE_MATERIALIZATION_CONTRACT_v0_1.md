# Cognituum Gene — Canonical Persistence & Materialization Contract v0.1

**Estado:** contrato físico canónico de G1  
**Fecha:** 2026-09-17  
**Autoridad conceptual:** `COGNITUUM_GENE_CONCEPT_v3_0.md`  
**Fuentes integradas:** contrato físico base y addendum preimplementación. Ante contradicción, este documento adopta la decisión del addendum.  
**Alcance implementado:** store filesystem Nucleus-level, fixtures sintéticos autorizados y pruebas. No integra Brain, ING/DIS, Temporal, Mandates productivos, Authority, GravityGraph, BISP, Location ni Orrery.

## 1. Decisión física

La fuente canónica es un store filesystem perteneciente a Nucleus, particionado explícitamente por `project_id`, con objetos inmutables y una única raíz mutable por Project:

```text
<nucleus-root>/.genes/projects/{project_id}/
├── project.lock
├── head.json
├── identities/{gene_id}.json
├── revisions/{revision_digest_hex}.json
├── contributions/{contribution_id}.json
├── commits/{commit_digest_hex}.json
├── relations/domain-gene/{relation_digest_hex}.json
└── transactions/{transaction_digest_hex}.json
```

`.genes/projects` es la única raíz válida. La variante `.projects` queda descartada. La raíz procede de configuración de Nucleus; nunca se infiere desde un repositorio, cwd ni asset.

`project.lock` serializa todas las publicaciones de un Project. Identidades, revisiones, Contributions, canonical commits y relaciones son inmutables. `head.json` es la única raíz canónica reemplazable. `transactions/` conserva evidencia recuperable de operaciones; no constituye autoridad alternativa.

## 2. Digests contractuales y nombres físicos portables

El formato contractual único es:

```text
sha256:<64 caracteres hexadecimales minúsculos>
```

G1 sólo admite SHA-256. Un digest con otro algoritmo, longitud, mayúsculas, caracteres no hexadecimales o componentes de path se rechaza.

Windows no admite `:` en nombres. Por eso existe una separación normativa:

- campos JSON, contratos y referencias: `sha256:<hex>`;
- nombre físico de un objeto content-addressed: `<hex>.json`.

La conversión es interna, determinista y reversible. Al leer, el store reconstruye el digest contractual desde el filename, valida exactamente 64 caracteres hexadecimales minúsculos y recalcula el dominio de digest del objeto. El filename no cambia la identidad ni aparece como formato alternativo en contratos.

## 3. Canonical JSON

Todos los digests se calculan sobre bytes UTF-8 producidos con RFC 8785 JSON Canonicalization Scheme, más estas restricciones:

- claves duplicadas rechazadas;
- Unicode inválido rechazado;
- strings y claves contractuales obligatoriamente NFC;
- números no finitos o fuera del dominio JCS rechazados;
- decimales de dominio representados como strings normalizados;
- identificadores y digests en minúsculas cuando son case-insensitive;
- arrays-set ordenados por su clave contractual;
- arrays-secuencia conservan el orden.

Los tiempos operativos, staging, transaction IDs, reintentos, errores y métricas no participan en digests de Revision, Contribution o canonical commit.

## 4. Boundary Project y Repository

Todo objeto persistido contiene `project_id`, que debe coincidir con input, path, head, identidad, Revision y Contribution. El Project es el boundary de identidad V1.

Cada asset contiene `repository_id` explícito. El materializador recibe un mapping autorizado `repository_id → root`; no deriva Repository desde Project, cwd ni path. Una ruta local nunca sustituye la identidad de Repository.

Las rutas de assets:

- son relativas y usan `/`;
- no contienen componentes vacíos, `.`, `..`, drive letter ni path absoluto;
- no atraviesan symlinks;
- permanecen dentro del root autorizado;
- se verifican por bytes, tamaño y SHA-256 observado.

V1 admite exclusivamente `file`, `document` y `test`. La identidad física de asset se deriva de `project_id + repository_id + normalized_repository_relative_path`; `asset_kind` no duplica la identidad.

## 5. Objetos persistidos

### 5.1 Identity

Conserva `schema_version`, `project_id`, `gene_id`, función declarada y origen inmutable (`mandate_id`, `intent_id`, `decision_id`). No contiene current revision, paths, embedding, Domain singular ni estado de consumidores.

Una identidad solamente ratificada no se materializa ni aparece en `head.json`. El primer canonical commit instala conjuntamente identidad, primera Revision verificada, Contribution y entrada del head.

### 5.2 Contribution

Conserva identidad, Project, Gene, revisión base opcional, Mandate, Intent, función, assets, provenance estable y evidencia de ratificación. Su digest excluye `contribution_digest` y estados/tiempos operativos.

La clave de idempotencia es `contribution_id`:

- mismo ID y mismo digest: replay;
- mismo ID y digest diferente: `CONTRIBUTION_ID_CONFLICT`.

G1 no verifica Authority productiva. Sólo admite el fixture autorizado marcado simultáneamente `test_only`, `synthetic` y `productive_authority=false`. G2 deberá sustituir ese seam por RatificationEnvelope verificable.

### 5.3 Revision

La Revision conserva Project, Gene, parent opcional, función, assets observados ordenados, Contribution productora, provenance estable y evidencia de verificación.

```text
revision_digest = SHA-256(JCS(revision_digest_payload))
```

El payload excluye `revision_digest`, estados derivados, timestamps operativos, staging, transaction ID, embeddings e IDs de consumidores. Una Revision ratificada jamás se modifica.

### 5.4 Canonical commit

El commit conserva Project, generación esperada/publicada, commit previo, Contributions, Genes creados, transiciones de Revision y referencias con digests de todos los objetos instalados.

```text
canonical_commit_digest = SHA-256(JCS(canonical_commit_digest_payload))
```

El payload excluye su propio digest, transaction ID, hora de commit, host, PID, lock owner, métricas y digest circular del head.

### 5.5 Project head

`head.json` contiene `schema_version`, `project_id`, `generation`, último canonical commit y mapa de Genes resolubles con identity ref, lifecycle y current revision digest. Sólo contiene Genes que poseen una Revision canónica vigente.

El CAS compara `generation` y, cuando el caller lo aporta, el digest JCS del head observado. Para Genes existentes también compara la base Revision.

### 5.6 Transactions

Una transacción registra correlación, Contribution, digest, generación esperada, canonical commit preparado y estado recuperable. No puede contradecir al head. `COMMITTED` se prueba por alcanzabilidad desde el canonical commit referenciado por `head.json`, no por mutar el journal.

## 6. Protocolo de publicación

Dentro del lock exclusivo del Project:

1. releer y validar head;
2. comprobar generación, digest observado y revisión base;
3. resolver y verificar assets;
4. calcular Contribution, Revision, verification y canonical commit;
5. crear objetos inmutables mediante create-if-absent; mismo ID exige mismos bytes;
6. persistir evidencia transaccional recuperable;
7. escribir el head nuevo en temporal del mismo directorio/volumen;
8. flush y cierre del temporal;
9. reemplazar atómicamente `head.json`;
10. aplicar barrera de durabilidad del sistema;
11. reabrir, parsear y verificar el head publicado;
12. liberar el lock.

`head.json` nunca referencia un objeto que no haya sido creado y sincronizado previamente.

### Windows

- lock: `LockFileEx` sobre `project.lock`;
- temporal: `File.Sync`, respaldado por `FlushFileBuffers`;
- replace: `MoveFileExW(MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH)`;
- temporal y destino en el mismo volumen;
- no se presume que sincronizar un directorio sea portable;
- la relectura posterior es obligatoria.

### Linux

- lock: `flock`;
- `fsync` de temporales y objetos;
- rename atómico en el mismo filesystem;
- `fsync` del directorio padre después del rename/link;
- sincronización del padre al crear estructura, sin recorrer hasta `/` en cada publicación.

### macOS

- lock: `flock`;
- preferencia por `F_FULLFSYNC`;
- fallback explícito a `fsync` como capacidad degradada;
- rename atómico y `fsync` del directorio padre.

## 7. Recovery e idempotencia

Un crash antes del replace deja objetos no alcanzables e inocuos. Un retry idéntico revalida CAS y completa la publicación. Un crash después del replace se resuelve releyendo head y devolviendo el canonical commit ya alcanzable. Nunca se borra automáticamente un objeto durante recovery.

Un replay usa `project_id + contribution_id + contribution_digest + base_revision_digest`. No crea una Revision ni un commit adicional. Un objeto con mismo ID y bytes diferentes falla cerrado.

Puntos normativos:

| Fallo | Resultado |
|---|---|
| Antes de transaction | retry normal |
| Objetos escritos, head viejo | revalidar CAS y completar |
| Commit escrito, head viejo | publicar si CAS continúa válido |
| Head publicado, respuesta ausente | replay devuelve el commit existente |
| Replace interrumpido | head viejo o nuevo completo, nunca JSON parcial |
| Digest distinto para ID existente | colisión/corrupción; no sobrescribir |

## 8. Fallos mínimos

G1 distingue: `PROJECT_ID_REQUIRED`, `PROJECT_MISMATCH`, `REPOSITORY_ID_REQUIRED`, `REPOSITORY_UNRESOLVED`, `ASSET_PATH_INVALID`, `ASSET_OUTSIDE_REPOSITORY`, `ASSET_MISSING`, `ASSET_DIGEST_CHANGED_DURING_MATERIALIZATION`, `CONTRIBUTION_NOT_RATIFIED`, `CONTRIBUTION_ID_CONFLICT`, `BASE_REVISION_CONFLICT`, `PROJECT_GENERATION_CONFLICT`, `REVISION_CONTENT_COLLISION`, `VERIFICATION_FAILED`, `CANONICAL_HEAD_CORRUPT`, `CANONICAL_OBJECT_MISSING`, `RECOVERY_REQUIRED` y `DIGEST_INVALID`.

Ningún fallo autoriza publicación parcial ni evidencia productiva.

## 9. Fixture autorizado de G1

`authorized_first_gene.json` es exclusivamente `test_only`, `synthetic`, `productive_authority=false` y `fixtures_only`. Usa únicamente:

```text
project_id      = 11111111-1111-4111-8111-111111111111
repository_id   = 22222222-2222-4222-8222-222222222222
gene_id         = 33333333-3333-4333-8333-333333333333
contribution_id = 44444444-4444-4444-8444-444444444444
mandate_id      = 55555555-5555-4555-8555-555555555555
intent_id       = 66666666-6666-4666-8666-666666666666
decision_id     = 77777777-7777-4777-8777-777777777777
```

Estos IDs no constituyen autoridad, no describen un Gene real y no pueden reutilizarse fuera de fixtures. Los bytes JCS y digests esperados se generan desde la implementación y quedan fijados como vectores literales en tests.

## 10. Aceptación de G1

Las pruebas deben demostrar:

- JCS byte-a-byte, NFC, rechazo de duplicados y digests SHA-256 estrictos;
- separación reversible entre digest contractual y filename portable;
- primer commit sintético sin Domain;
- inmutabilidad y verificación al leer objetos content-addressed;
- resolución de `file`, `document` y `test` por Repository explícito;
- replay idempotente y colisión de Contribution;
- conflicto CAS sin auto-rebase;
- crash antes y después del replace;
- head sin objetos ausentes;
- compilación de publishers Windows, Linux y macOS.

## 11. Frontera de G2

G1 no crea caller productivo, no marca effect ledgers y no implementa RatificationEnvelope ni MergeReceipt. G2 deberá decidir el coordinador efectivo de ING/DIS y sólo marcar un efecto después de publicar y releer el canonical commit. GravityGraph, BISP, Location y Orrery serán consumidores derivados read-only en incrementos posteriores.

No se crea aquí un primer Gene productivo, no se registran Project/Repository reales y no se incorporan decisiones humanas reales.

### 11.1 Caller productivo pendiente

El caller material no existe todavía. El recorrido observado termina en un effect ledger sin invocación productiva del materializador. `mandate_genesis_activities.go` no se presume caller sólo por contener adaptadores relacionados.

G2 deberá implementar explícitamente:

```text
RatificationEnvelope
→ aplicación gobernada de cambios
→ MergeReceipt durable
→ GeneMaterializationRequest
→ materializador Nucleus
→ GeneMaterializationReceipt verificado
→ mark-effect-applied
→ commit-bisp-turn
→ advance-bisp-turn
```

El materializador no recibirá propuestas libres. Un crash posterior a publicación se recuperará consultando `contribution_id` y digest. El effect ledger sólo podrá marcarse después de comprobar alcanzabilidad desde head.

### 11.2 Evidencia productiva de ratificación pendiente

G2 considerará una Contribution ratificada únicamente con evidencia que contenga, como mínimo:

- `decision_id`, `decision_type=gene_contribution`, Project, Contribution y digest exactos;
- actor humano estable, fuente de identidad y prueba verificable;
- modo, scope, rol, versión, revisión de control y razón de Authority;
- outcome exacto `RATIFIED`, `decided_at` autoritativo normalizado y condiciones;
- Intent, stage `ING|DIS`, turn, control ref/digest y effect-ledger ref/digest.

La validación deberá probar identidad del actor, autoridad y scope efectivos, coincidencia exacta del payload, `commit_requested=true`, effect ledger íntegro y cadena de provenance completa hasta ING o DIS y Mandate. No bastan `human_decision`, username del SO, evidencia arbitraria no vacía, MergeReceipt, tests exitosos ni existencia previa del contenido.

Los diagnósticos internos distinguirán `RATIFICATION_MISSING`, `RATIFICATION_ACTOR_UNVERIFIED`, `RATIFICATION_AUTHORITY_INVALID`, `RATIFICATION_SCOPE_MISMATCH`, `RATIFICATION_PAYLOAD_MISMATCH`, `RATIFICATION_PROVENANCE_BROKEN` y `RATIFICATION_DECISION_NOT_ALLOW` bajo el error contractual `CONTRIBUTION_NOT_RATIFIED`.

### 11.3 Domain

El materializador no crea Domain. Un Gene puede publicarse sin relación Domain o con referencia externa a un Domain ya ratificado. La referencia externa contiene `domain_id`, `source_ref`, `source_revision_or_version`, `source_digest` y `ratification_decision_ref`. El store sólo valida y registra esa referencia; no completa, corrige ni publica Domain.
