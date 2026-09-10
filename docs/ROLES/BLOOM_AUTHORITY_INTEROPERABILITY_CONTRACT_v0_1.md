# BLOOM — Contrato de interoperabilidad de autoridad v0.1

Fecha: 2026-09-10. Work ROLES. Lotes 1A–6 concluidos en sus alcances de desarrollo;
validación operativa y cutover permanecen abiertos y requieren autorización separada.

La última devolución de José precisa D5: 50 segundos es una política candidata
exclusivamente en shadow, que incluye critical, privileged y standard. Se registra
lo que habría bloqueado sin cambiar el resultado local ni bloquear trabajo offline.
La política productiva ante desconexiones queda pendiente antes del cutover y no
se traslada automáticamente a remote_enforced. Esta precisión prevalece sobre las
formulaciones anteriores del Physical Design; ese archivo no se modifica en 1B.

Este contrato concreta la dirección aprobada de D4 y los límites de la primera
entrega. Se complementa con el [diseño físico](BLOOM_REMOTE_AUTHORITY_PHYSICAL_DESIGN_v0_1.md).
1A entrega un emisor puro Backend y aceptación Go verificable localmente. No conecta
HTTP, datos productivos, administración humana, sincronización ni cutover.

## 1. Perfil wire y entradas

Los tipos `Wire*` de `backend/src/authority/schema.ts` y los tipos de
`installer/nucleus/internal/authority/{envelope,snapshot}.go` describen el perfil
`bloom.authority.snapshot`, schema_version `1.0`.

- JSON UTF-8 válido, propiedades únicas, exactas y case-sensitive. Se rechazan
  propiedades desconocidas, campos ausentes y tipos incorrectos; no hay defaults.
- Envelope: exactamente `payload` e `integrity`. Integrity contiene
  `canonicalization`, `digest_algorithm`, `digest`, `signature_algorithm`, `key_id`,
  `signature`. Valores de algoritmo: `JCS-RFC8785`, `SHA-256`, `Ed25519`.
- Payload: metadata común de §3, `kind`, `base_authority_version` y `content`.
  `kind` es full/delta. Base es null para full; string positivo menor que la versión
  de resultado para delta. No se convierte ninguna versión mediante Number.
- Versiones: strings decimales `[1-9][0-9]*`, máximo `18446744073709551615`.
  Aplica a authority_version, role_version, base y versión de revocación.
- UTC: `YYYY-MM-DDTHH:mm:ss[.fffffffff]Z`, años 0001–9999, hasta 9 decimales,
  calendario válido y sin segundos intercalares. Se quitan ceros fraccionarios
  finales. No offsets, redondeo a milisegundos ni normalización Unicode.
- Todas las cinco colecciones de FullContent son obligatorias y arrays, incluso
  cuando están vacías. `external_identities` y `permissions` también son arrays.
- `valid_until` admite null. `base_authority_version` admite null sólo en full.
  `value` admite null sólo para delta remove. Los demás campos no admiten null.
  `accepted_at` debe venir de evidencia real: no se deriva de created_at. Un
  procedimiento pendiente sin aceptación no puede fabricar ese timestamp para
  entrar en este perfil; su registro administrativo queda fuera de esta proyección.

Entidades y validaciones:

| Colección | Identidad | Validación |
|---|---|---|
| principals | principal_id | tipo human/service; estado active/suspended/retired; external identities provider+subject únicos, status verified/revoked y verified_at real |
| memberships | membership_id | principal presente y organización exacta; status pending/active/suspended/expired/revoked; vigencia válida y accepted_at |
| role_definitions | role_id + role_version | origen builtin/organization; status active/suspended/retired; permisos conocidos y únicos; built-ins exactamente iguales al catálogo actual |
| role_assignments | assignment_id | membership y versión exacta de rol presentes; scope explícito válido; organization scope coincide con organización; status y vigencia como membership |
| revocations | revocation_id | target_type external_identity/membership/role_definition/role_assignment; target_id, reason_code y effective_at; versión positiva no futura |

No puede haber dos bindings externos `verified` del mismo `(provider, subject)`
en una proyección. Los identificadores son opacos y no vacíos; handles/display_name
pueden ser vacíos y no son prueba de identidad. La validación wire no autentica
un humano ni implementa la política de concesión de D3. Que el catálogo técnico
contenga permisos Vault/Executor o tipo service no autoriza nuevas concesiones.

## 2. Normalización y los dos digests

JCS ordena propiedades, preserva arrays y Unicode. Antes del digest de estado se
construye una copia normalizada, sin mutar la entrada:

1. Principals por principal_id; identidades por provider y luego subject.
2. Memberships por membership_id.
3. Roles por role_id y role_version **numérica exacta**; permissions por texto.
4. Assignments por assignment_id; revocaciones por revocation_id.
5. Timestamps con la forma UTC mínima de §1.

Todas las comparaciones textuales usan unidades UTF-16, sin locale. Esto hace que
`p-😀` preceda a `p-\uE000`, a diferencia del orden de bytes UTF-8. Las versiones
de un mismo rol `2` y `10` se conservan y se ordenan numéricamente.

```text
payload_digest = base64url_no_padding(SHA256(UTF8(JCS(payload))))
state_digest   = base64url_no_padding(SHA256(UTF8(JCS(normalized_FullContent))))
signature      = Ed25519(private_key,
                 UTF8("BLOOM-AUTHORITY-SNAPSHOT-v1") || 0x00 || UTF8(JCS(payload)))
```

`integrity.digest` siempre es payload_digest. `delta.content.result_digest` es
state_digest. El full no añade un campo state_digest al payload: el receptor lo
calcula. El store conserva ambos y la metadata de emisión. Estado normalizado
incluye exactamente las cinco colecciones y todos sus campos, sin envelope,
organización exterior, audience, tiempos de emisión ni journal.

Digest codifica 32 bytes; firma codifica 64 bytes, ambos base64url sin padding
con representación exacta. El límite del envelope completo es 16 MiB. Go rechaza
duplicados, Unicode inválido, números no finitos y cero negativo antes de JCS.
En el emisor, los valores wire tienen tipos cerrados y las versiones son strings.

## 3. Una emisión organizacional y metadata inmutable

Metadata común:

```text
schema, schema_version, snapshot_id, issuer, organization_id,
authority_version, issued_at, not_before, expires_at, audience
```

Audience contiene organization_id e installation_ids (no vacíos, únicos, orden
UTF-16). Forma parte de la emisión firmada; la instalación receptora debe figurar
expresamente y el issuer/organization deben coincidir con el binding local.

La misma versión debe tener la misma metadata común normalizada y el mismo estado.
Full/delta sólo pueden diferir en kind, base y content. El digest de estado no
compensa una audiencia incorrecta; cambiar audience en la misma versión es conflicto,
incluso si la instalación actual sigue incluida. Una instalación nueva requiere
una emisión superior con la audiencia correspondiente, no regenerar la anterior.

`emitSnapshot({metadata,state,base?}, privatePkcs8, keyId)` recibe los datos de
emisión explícitamente. No lee reloj, DB ni sesión, no asigna versiones y no
infiere identidades. Valida, normaliza, arma full/delta y firma. El emisor puro no
puede impedir que un caller lo invoque con dos estados diferentes para una versión;
la reserva atómica e inmutabilidad en Backend son responsabilidad del próximo lote.
Go detecta el conflicto contra evidencia previamente aceptada.

TTL máximo 24 h; issued_at < expires_at y not_before <= expires_at. Go exige
issued_at <= now, not_before <= now < expires_at antes de considerar replay.
Una renovación usa versión superior y nueva metadata, aunque state_digest no cambie.
Parámetro inicial aprobado: 4 min, hasta 360 emisiones diarias por organización
activa. El costo incluye registro de emisión, historial y fan-out; retención,
scheduler y costos medidos no están implementados en 1A.

## 4. Delta, continuidad y aceptación

Delta lleva result_digest y operations. Cada operación tiene sequence string
contigua desde `1`, operation upsert/remove, collection, entity_id y value.
El emisor recorre colecciones en orden principals, memberships, role_definitions,
role_assignments, revocations; en cada una emite remociones antes de upserts,
siguiendo el orden normalizado. El consumidor aplica el orden firmado.

- Base exacta igual al high-water mark local. Un gap requiere full; no se salta.
- Upsert de rol usa `(role_id, role_version)`; entity_id coincide con role_id del
  value. Se conservan otras versiones. No se eliminan roles históricos en 1A.
- Cambiar permisos u origen de una versión existente exige nueva role_version.
  Display_name/status pueden cambiar en nueva authority_version; no amplían permisos.
- Revocaciones anteriores se conservan sin cambios. No se elimina un principal.
  El borrado de membership/assignment exige revocación correspondiente en resultado.
- Se valida la proyección resultante completa y su digest antes de persistir.
  Las mismas reglas de continuidad se aplican a un full superior en Go.
- El emisor sólo puede comprobar continuidad cuando recibe base. Un full aislado
  no acredita la historia previa: Backend durable deberá preservar esas precondiciones.

| Candidato | Resultado Go |
|---|---|
| Inferior a high-water mark o cutover floor | Rechazo sin cambiar estado durable |
| Igual versión y distinto metadata común | Conflicto |
| Igual versión, metadata igual, digest del payload ya aceptado | Replay idempotente; sin escritura ni renovar tiempos |
| Full igual versión, metadata igual, mismo state_digest | Equivalente; no reemplaza evidencia ni journal |
| Full igual versión, metadata igual, state_digest distinto | Conflicto |
| Delta igual versión con otro payload digest | No reaplicar sobre resultado; requiere full |
| Versión superior válida y continuidad verificada | Guardar proyección, ambos digests, metadata y aceptación |

Verificación criptográfica, binding y vigencia preceden a la aceptación monotónica.
Una firma inválida, algoritmo desconocido, clave fuera del trust bundle o delta
inválido nunca cambia el archivo de estado aceptado. Se serializa read/compare/write
con el lock existente. El journal registra sólo una aceptación para los replays
probados y accepted se devuelve después del guardado.

## 5. Compatibilidad, confianza y recuperación

Los tipos legacy de schema.ts y las APIs existentes de canonical.ts conservan su
interfaz: digestCanonical devuelve hex y los helpers de firma devuelven base64.
El nuevo digestWire produce base64url. Las pruebas cubren esos helpers y separación
de dominios; no se modificó el comportamiento de otros consumidores.

Incompatibilidades verificables:

- El productor legacy conservado usa `{content,digest,signature,signing_key_id}`,
  versiones Number, timestamps/factos legacy y otra forma de delta. No es wire v1.
  1B conecta GET /v1/authority/snapshot a emisiones wire persistidas y deja de invocar
  ese productor en dicha ruta. Los helpers anteriores se conservan para otros callers.
- `snapshot.ts` presupone columnas status que las migraciones de autoridad leídas
  no aportan. También faltan verified_at/accepted_at y otros hechos del perfil;
  no convertirlos mediante defaults. 1B no ejecuta esa conversión: una organización
  con evidencia anterior y sin emisión wire devuelve recovery_required. La fuente
  administrativa real y su recuperación siguen pendientes.
- El store legacy Go no conserva metadata ni state_digest. Su carga devuelve
  ErrLegacyState y conserva el archivo; no hace reset ni adopta una versión inferior.
  El procedimiento real de recuperación/importación de esa evidencia no se implementa
  en 1A. Si se perdió todo el store, aún no hay checkpoint separado que permita
  distinguirlo de una primera instalación.
- Los tipos wire no sustituyen controles de concesión: la verificación canónica de
  scopes de proyecto y la administración humana de D1–D3 siguen pendientes de integración.

Confianza productiva exige root auténtica con procedencia aprobada y manifiesto de
issuer firmado que vincule issuer, organización, versión monotónica, claves autorizadas
y vigencia. Root, claves nuevas y rotación no se aceptan por una referencia SQL
`signed_by_key_id` ni por autofirma del snapshot. Claves retiradas para historia
no autorizan automáticamente emisiones nuevas. La codificación y el verificador
del manifiesto se implementarán en el lote de confianza, no en 1A.

El TrustBundle Go de esta entrega es entrada explícita de prueba. El fixture usa
la semilla pública del vector de RFC 8032, identificada como TEST ONLY. No contiene
ni instala una root productiva; no existe fallback desde autenticación real a fixture.

## 6. Fronteras de los contratos siguientes

| Área | Acuerdo conservado y trabajo pendiente |
|---|---|
| Identidad/administración | GitHub App exclusiva Backend, identidad estable, sesión sin roles y autorización vigente; actor local con desafío, audiencia y prueba de posesión distinta de instalación; duración/renovación/revocación limitadas |
| Onboarding | D1 verifica habilitación, destinatario y aceptación; D2/D3 emisor/facultades/primera concesión; verificador/evidencia reales pendientes, sin primera administración superior de tenant |
| Mutaciones | Precondiciones, hechos, versión, historial, auditoría, resultado idempotente y outbox en un commit; precondición fallida impide el commit completo |
| Concesión | Perfil D3 acotado; revalidar otorgante al aceptar; nueva versión más poderosa exige nueva concesión; recuperación y otros másters no reabren onboarding |
| Sincronización | Durable Object/outbox/WS + consulta HTTPS firmada ligada a desafío y lectura suficientemente consistente; versión indicada debe estar aceptada; medir desde inicio de consulta; reinicio exige consulta nueva |
| Parámetros | Renovación 4 min y poll 20 s iniciales; ensayo shadow a 50 s incluye critical/privileged/standard y preserva resultado local/offline; 60 s es objetivo por medir. Política productiva ante desconexiones pendiente |
| Persistencia | Checkpoint separado con binding, high-water mark, compromiso de estado/emisión y floor; pruebas de interrupción/restore parcial; sin promesa de restore total ni binarios incompatibles |
| Decisión/shadow | Catálogo cerrado de operaciones y controles; control requerido ausente implica not_evaluable/deny; shadow conserva el resultado local exacto; sync-push sin mapeo permanece no migrado |
| Evidencia | CLI humano/JSON y observación integrada 24 h posteriores, no readiness ni cutover |

La latencia de detectar revocación del grant GitHub es distinta del tiempo de
propagar una revocación ya confirmada por Backend. Ninguno se mide en 1A.
Gravity sigue en investigación; no se amplían Vault/Executor ni el catálogo tenant.

## 7. Evidencia reproducible local

Fixture compartido: [authority_interop_v1.json](fixtures/authority_interop_v1.json).
Incluye estados literales ordenados, bytes JCS esperados, digests y cuatro envelopes
firmados independientemente del emisor con node:crypto. Contiene Unicode no ASCII,
orden UTF-16, nanosegundos, versiones mayores a 2^53, roles 2/10, remoción con revocación
y renovación sin cambios. Es un vector fijo; las pruebas no reescriben sus expectativas.

Backend emite full1/full2/delta2/renewal3 y compara los envelopes canónicos completos
con el fixture. Luego escribe artefactos temporales nuevos, invoca el test Go,
verifica aceptación durable y lee una respuesta con un envelope firmado por Go.
Backend verifica esa firma y su igualdad con full2. Los temporales se eliminan al
final; el fixture y los tests conservan la evidencia reproducible.

State digest de full2/delta2/renewal3:

```text
tXncfzWOT2q23PH0iw1FgFaKrnBUBjWULPWvYD2qu4c
```

Pruebas locales (sin instalación de dependencias ni acceso a servicios):

```text
backend: node node_modules/vitest/vitest.mjs run test/authority-interop.spec.ts --no-cache
backend: node node_modules/typescript/bin/tsc --noEmit --strict --target ES2022 --module ESNext --moduleResolution Bundler --lib ES2022 --types node,@cloudflare/workers-types --skipLibCheck --esModuleInterop src/authority/schema.ts src/authority/canonical.ts src/authority/emission.ts test/authority-interop.spec.ts
installer/nucleus: go test ./internal/authority -count=1
```

Go usa cache temporal `bloom-authority-go-cache` y GOPROXY=off. El caso Go de
intercambio dinámico se omite cuando no tiene AUTHORITY_INTEROP_ARTIFACT; Vitest lo
ejecuta con artefactos recién emitidos y exige PASS. No equivale a una omisión de
la comprobación cruzada en la ejecución Backend.

Resultado final local: **38/38 tests Backend**, **18 tests principales Go aprobados
(61 incluyendo subtests)** y **typecheck estricto aprobado**. La ejecución autónoma
Go omite únicamente el caso dinámico sin artefacto; ese caso pasó dentro de Vitest
con los cuatro envelopes nuevos y comprobación de la firma de retorno Go → Backend.

El typecheck se limita a los archivos de este lote y usa el perfil Workers del
proyecto. Un ensayo con tipos DOM produjo incompatibilidades BufferSource en helpers
preexistentes; no se cambió su API para adaptar un perfil ajeno al proyecto.
No se declara verde la suite completa Backend ni un runtime workerd/D1 real.

Los ensayos de crash existentes simulan fallos antes/después del rename. No prueban
power loss físico, checkpoint, restore conjunto, ventanas de sincronización,
revocación E2E, identidad/root productiva, controles remotos ni observación de 24 h.

## 8. Lote 1B: persistencia y lectura de emisiones

**Autorización puntual posterior a 1A: ocho archivos, pruebas locales y migración
sólo en base temporal.** La tabla conserva la lista exacta aprobada.

Objetivo: persistir una emisión organizacional inmutable y servir esos bytes por
la ruta de snapshots. No reconstruir autoridad desde filas legacy incompletas ni
firmar una emisión distinta en cada pull. La escritura inicial se prueba con entradas
explícitas verificables; no se expone una vía de onboarding o concesión sin D1–D3.

| Archivo literal | Cambio propuesto |
|---|---|
| backend/migrations/0004_authority_emissions.sql | Crear migración aditiva para emisiones, head organizacional e idempotencia; versiones decimales TEXT, metadata/state_digest y bytes de artefactos; unicidad por organización/versión y precondiciones que aborten toda la escritura. Sólo probar en base temporal local; sin backfill ni aplicación productiva |
| backend/src/authority/emission-store.ts | Crear persistencia/lectura de emisiones, comparación exacta uint64, reserva concurrente de versión, rechazo de conflictos y reintento idempotente; mantener metadata/estado/artefactos de una emisión unidos; rechazo de evidencia inicial insuficiente, sin reset legacy |
| backend/src/authority/snapshot.ts | Agregar resolución wire desde emisión persistida: full reutilizable, delta sólo con base disponible y validada, fallback full; conservar helpers legacy y trust existentes sin usarlos como conversión automática |
| backend/src/authority/snapshot-route.ts | Crear handler aislado para lectura autenticada de snapshot; validar base decimal e instalación destinataria, responder wire persistido o error explícito si falta evidencia; sin sesiones humanas ni nuevos grants |
| backend/src/index.ts | Cambiar exclusivamente import/conexión del handler de GET /v1/authority/snapshot; mantener middleware de instalación existente y las demás rutas sin cambios |
| backend/test/authority-emission-store.spec.ts | Crear pruebas locales D1 de commit/rollback completo, CAS fallida, idempotencia, concurrencia, conflictos y renovación; probar que ninguna fila/versión parcial queda confirmada |
| backend/test/authority-snapshot-route.spec.ts | Crear pruebas del handler aislado con autenticación de instalación como precondición explícita, audiencia, base inválida, full/delta y replay; intercambiar respuesta wire con Go sin importar otras rutas |
| docs/ROLES/BLOOM_AUTHORITY_INTEROPERABILITY_CONTRACT_v0_1.md | Actualizar evidencia y compatibilidad según resultados reales de 1B, documentar esquema/errores de persistencia y límites; mantener pendientes productivos y D5 visibles |

El handler dependerá de la autenticación de instalación existente; estas pruebas
no demostrarán por sí mismas esa autenticación. La ruta tampoco acreditará una
consulta actual firmada: desafío/consistencia de lectura pertenecen al lote de
sincronización. El commit administrativo conjunto con auditoría/outbox queda para
su lote; 1B no ofrecerá un endpoint de mutación que eluda ese requisito.

Si el ensayo D1 exige archivos de configuración o dependencias adicionales, se
presentará su lista puntual antes de escribir. No se tocan componentes excluidos,
operaciones Git, despliegues, migraciones productivas ni cutover.

1A no cierra el Work. El plan continúa con administración acotada, confianza y
checkpoint, sincronización, decisión/shadow y observación integrada, cada uno
con su lista de archivos y autorización independiente.

### 8.1 Implementación y contrato de persistencia de 1B

- `authority_emissions` guarda metadata normalizada, estado normalizado, state_digest,
  full y delta firmados como strings canónicos exactos, base, request_id y compromiso
  de solicitud. Versiones TEXT positivas uint64, nunca INTEGER/Number. Cada
  `(organization_id, authority_version)` y `(organization_id, request_id)` es único.
- `authority_emission_heads` referencia la emisión actual. Un trigger BEFORE INSERT
  exige base igual al head; una precondición fallida ejecuta RAISE(ABORT). Un trigger
  AFTER INSERT publica el head dentro de la misma sentencia. No se utiliza un UPDATE
  de cero filas como supuesto rollback. UPDATE/DELETE de emisiones están prohibidos.
- La librería exige la siguiente versión exacta respecto de expectedVersion y
  rechaza overflow. El llamador aporta metadata explícita; no hay scheduler ni un
  contador independiente fuera del commit. Dos candidatos concurrentes para una
  base no pueden confirmar ambos. Reintentos idénticos devuelven los bytes originales,
  incluso tras avanzar el head, sin volver a firmar; otra solicitud con el mismo ID
  produce idempotency_conflict.
- El primer registro sólo se habilita mediante allowTestFixtures explícito y
  evidencia marcada environment=test; no hay alta real disponible en 1B ni endpoint
  público de escritura. Si existe cualquier evidencia organizacional legacy, incluso
  authority_state en cero, se requiere recuperación. Perder el head conservando
  emisiones, o restaurarlo por debajo de emisiones retenidas, también produce
  recovery_required. No se detecta la pérdida conjunta de toda evidencia.
- La publicación usa el emisor 1A y comprueba continuidad contra la base persistida:
  issuer, roles versionados, historia y remociones con revocación. Preparar/fallar la
  firma no reserva una versión ni deja filas parciales.
- Las lecturas usan sesión D1 first-primary. Esto evita elegir deliberadamente una
  réplica eventual, pero la respuesta NO es una prueba firmada de consulta actual.
  El protocolo con desafío y evidencia temporal pertenece al lote de sincronización.

### 8.2 Lectura HTTP y compatibilidad

GET /v1/authority/snapshot conserva el middleware de instalación existente. El
handler recibe su resultado como precondición explícita; no autentica humanos.
Verifica organización, audiencia y base decimal sin Number. Devuelve directamente
los bytes persistidos, con Content-Type JSON y Cache-Control: no-store.

- Base exacta disponible/validada: delta persistido.
- Base ausente, más antigua sin delta, igual a actual o base histórica dañada: full
  actual, siempre que la emisión actual sea válida estructuralmente.
- Base superior a head: 409 authority_version_ahead, sin servir downgrade como éxito.
- Audiencia incorrecta: 403. Falta de precondición de instalación: 401.
- Base/org ausentes o ambiguos según contrato: 400. Sin emisión: 503
  authority_emission_unavailable. Evidencia legacy/perdida/contradictoria: 503
  authority_recovery_required. Fallo de DB: 503 authority_storage_unavailable.

Cambiar de respuesta legacy a wire es intencional en esta ruta. Los callers legacy
deben adaptarse; no existe fallback que fabrique aceptación, identidad ni vigencia.
Un pull nunca renueva tiempos, aun si la emisión expiró: Nucleus verifica su vigencia.
No se cambió el middleware de instalación ni se importaron otras rutas en los tests.

### 8.3 Evidencia y límites de 1B

Resultado final: **28/28 tests Backend aprobados** (15 de persistencia y 13 del
handler), **typecheck estricto aprobado** y **test Go de intercambio dinámico
aprobado** desde las respuestas persistidas. La reapertura del mismo directorio
temporal conservó bytes, head e idempotencia. No se declara completado el Work.

Las pruebas utilizan Miniflare/workerd y D1 local con persistencia exclusivamente
en directorios temporales. Se crea una tabla organizations mínima de fixture y se
aplican las migraciones de autoridad 0001 y 0004; no se ejecuta la cadena productiva
completa. No se instalaron dependencias ni se cambiaron configuraciones. Se usa el
adaptador convertV4MiniflareOptions disponible en la versión instalada y cf=false,
sin pedir datos externos para el ensayo.

Casos: publicación full/delta/renovación, versiones superiores a 2^53, idempotencia
tras avance de head, dos candidatos concurrentes, reintentos idénticos concurrentes,
rollback del batch completo por CAS fallida, fallo durante publicación de head,
rechazo de alta no-fixture, evidencia legacy, pérdida/restore parcial de head,
historia inmutable, continuidad y reapertura del mismo almacenamiento temporal.

El handler entrega full1/full2/delta2/renewal3 desde D1. Esos bytes se comparan con
los vectores fijos, se intercambian con el test Go existente y se verifica la firma
de retorno. No se modifica ni repite la implementación de 1A.

Comandos reproducibles desde backend:

```text
node node_modules/vitest/vitest.mjs run test/authority-emission-store.spec.ts test/authority-snapshot-route.spec.ts --no-cache
node node_modules/typescript/bin/tsc --noEmit --strict --target ES2022 --module ESNext --moduleResolution Bundler --lib ES2022 --types node,@cloudflare/workers-types --skipLibCheck --esModuleInterop src/authority/emission-store.ts src/authority/snapshot.ts src/authority/snapshot-route.ts test/authority-emission-store.spec.ts test/authority-snapshot-route.spec.ts
```

El typecheck es de los módulos del lote y dependencias de autoridad. No se declara
verde la aplicación Backend completa ni sus suites legacy. El middleware real,
servicios Cloudflare desplegados, tráfico de red completo y credenciales productivas
no están acreditados por un test del handler aislado. En 1B todavía no había publicación
administrativa con auditoría/outbox. 2A integra esa transacción interna (§10), sin
exponer un endpoint de concesión ni acreditar autenticación humana real.

## 9. Registro único de pendientes y criterios de cierre

Este registro sustituye listas de pendientes anteriores. 1A es evidencia concluida;
1B y 2A no cierran el Work. Las precisiones aprobadas de D1–D8 no se reabren salvo
incompatibilidad concreta. Fixture válido no equivale a habilitación productiva.

### 9.1 Tres decisiones de José

| ID | Recomendación concreta, todavía no aprobada | Consecuencia y bloqueo |
|---|---|---|
| P1 — Onboarding real de Sovereign | José designa expresamente un verificador de onboarding con facultad acotada y auditable. Exigir designación del cliente vinculada al representante autorizado, organización y destinatario, con verificación independiente de esa facultad; controlar GitHub no basta. Comprobar correspondencia explícita para organización existente | No crea un rol superior del tenant ni autoridad permanente para el verificador. Sin decisión/evidencia: rechazar creación y primera concesión reales. No bloquea desarrollo ni fixtures explícitos. Lotes 2B y confianza |
| P2 — Recuperación del estado anterior | Preservar los registros anteriores; verificar binding y procedencia, conservar el mayor high-water mark/floor acreditado y recuperar mediante emisión auténtica superior sin inventar metadata faltante. Si falta evidencia necesaria, mantener restricción y exigir recuperación explícita; nunca convertir ausencia en cero | Bloquea adopción de instalaciones/datos anteriores afectados, no pruebas de desarrollo. Procedimiento y escrituras concretos deben aprobarse antes de aplicarse. No promete recuperar un restore conjunto indetectable. Lote 3 |
| P3 — Política productiva ante desconexión | Ensayar ahora la candidata aprobada: shadow a 50 s para critical/privileged/standard, sin alterar local/offline. Como recomendación para una futura modalidad remota, exigir reconciliación en nuevas acciones de esas clases y mantener sólo diagnósticos no protegidos; decidir su activación expresamente tras medir disponibilidad y revocación | El ensayo con standard YA está aprobado y no bloquea desarrollo. La recomendación productiva sacrifica disponibilidad durante desconexiones y NO se activa por inferencia. Bloquea fijar política productiva y cutover, no 1B ni shadow. Lotes 4–6 |

### 9.2 Desarrollo inicial: pendientes verificables

| ID | Pendiente y criterio verificable | Lote |
|---|---|---|
| DEV-ADMIN | Verificados 2A/2B: aceptación/revalidación, evidencia explícita de scope, rechazo de autoelevación; commit de hechos, emisión, historia, auditoría, idempotencia y outbox. HTTP usa sesión humana y protege revisiones de sesión/identidades en el commit. La fuente canónica real de proyectos sigue pendiente | 2A/2B concluidos; fuente real en validación operativa |
| DEV-IDENTITY | Implementados adaptador GitHub App, identidad inicial, sesiones Backend sin roles y prueba efímera del actor local ligada a humano/organización/instalación/desafío/posesión. Falta transporte automático del actor y validación con cuenta real; no confundir instalación con persona | Backend 2B y prueba 3 concluidos; transporte lote 4; P1 bloquea sólo onboarding real |
| DEV-TRUST | Verificado en 3: manifiesto root-signed con versión/vigencia, claves emisoras activas/retiradas, rechazo sin root externa y sin TOFU; Nucleus usa el manifiesto para snapshots y atestaciones. Roots productivas no provisionadas | 3 concluido; validación operativa pendiente |
| DEV-RECOVERY | Verificado en 3: checkpoint separado y store vuelven al par anterior ante interrupciones propias; restore parcial/corrupción/rollback de manifiesto quedan visibles y fail-closed sin rebajar high-water/floor. No se implementó adopción productiva de estado anterior | Mecanismo 3 concluido; P2 para recuperación productiva real |
| DEV-SYNC | Verificados outbox, relay, pull, scheduler y desafío de consulta actual; avisos perdidos/retrasados y reinicio no renuevan evidencia; las medidas separan commit→aceptación de commit→restricción hipotética | 4 concluido; objetivo universal de 60 s pendiente de validación operativa |
| DEV-DECISION | Verificado en 5: Nucleus evalúa permisos/scopes/controles sobre estado aceptado; control requerido ausente produce not_evaluable/deny; shadow preserva exactamente local, incluido offline; registra operación, clase, causa, versión y evidencia temporal de la candidata D5. `create_organization`/`create_project` permanecen not_evaluable hasta aprobar mapping al catálogo | 5 concluido; mapping Gravity pendiente de José |
| DEV-EVIDENCE | Verificados CLI humano/JSON sobre un modelo único de evidencia y recorrido integrado administración→emisión persistida→outbox→sincronización→aceptación durable→decisión shadow. El acumulador durable registra aceptación, fallos, latencias, divergencias y no evaluables con ventana explícita | 6 concluido; ventana real de 24 h pendiente de validación operativa |

Cierre de desarrollo: cada fila DEV tiene pruebas del recorrido correspondiente
en el entorno declarado, sin sustituir dependencias por allow silencioso. La decisión
remota se verifica como cálculo/evaluador en pruebas; shadow no cambia enforcement
local. Los casos productivos excluidos permanecen rechazados y visibles. Ningún
lote aislado satisface el cierre de extremo a extremo.

### 9.3 Validación operativa y cutover, separados del desarrollo

**Validación operativa:** identidades y roots auténticas, onboarding P1, recuperación
aplicable P2 (incluida recuperación organizacional del último máster por procedimiento
independiente), fuentes canónicas reales de scopes y controles integrados; medición
en entorno/carga/fallos representativos. Detectar revocación del grant GitHub y
propagar una revocación confirmada se miden separadamente. Una observación de 24 h
no demuestra SLA universal ni restricción productiva cuando sólo hubo shadow.

**Cutover:** política productiva de desconexión P3, tratamiento aprobado de
divergencias, compatibilidad que impida retorno a autoridad legacy por software
incompatible, validación del objetivo de revocación y procedimiento/autorización
independiente de José. No hay actualización de aplicaciones, cambio de modo ni
cutover en los lotes ejecutados. Dominio excluido que falte se registra como bloqueo,
sin ampliar Authority ni implementar Gravity/Vault/Executor por inferencia.

## 10. Lote 2A: administración acotada y commit conjunto

**Implementado y verificado dentro de los diez archivos aprobados.** El motor
administrativo y su transacción reciben identidad humana verificada como
precondición explícita. No expone un endpoint que acepte una
identidad declarada por el caller; autenticación/sesiones y conexión HTTP quedan
en 2B. No habilita onboarding real ni recuperación ni nuevos permisos.

| Archivo literal | Cambio propuesto |
|---|---|
| backend/migrations/0005_authority_administration.sql | Crear migración aditiva para propuestas/aceptaciones administrativas, historial, auditoría y outbox, con precondiciones abortables e idempotencia; aplicar sólo a base temporal de pruebas |
| backend/src/authority/administration.ts | Crear reglas de memberships, suspensión/revocación y concesión del perfil D3; verificar actor humano vigente, subconjunto del máster, aceptación, revalidación, autoelevación y scope canónico; rechazos explícitos para funciones diferidas |
| backend/src/authority/administration-store.ts | Crear transacción administrativa que una precondiciones, cambio, emisión, historia, auditoría, resultado idempotente y outbox; validar de nuevo al aceptar; ningún commit parcial ante carreras |
| backend/src/authority/emission-store.ts | Separar preparación validada de publicación para integrarla en el mismo commit administrativo, conservando inmutabilidad, CAS y reintentos de 1B; sin un segundo commit independiente |
| backend/test/authority-administration.spec.ts | Crear matriz de autorización/rechazo: no herencia, subset, autoelevación, scopes no verificables, aceptación y funciones diferidas |
| backend/test/authority-administration-store.spec.ts | Crear pruebas D1 temporal de aceptación, revalidación y carreras; fallo de auditoría/outbox/precondición revierte también emisión y hechos |
| backend/test/authority-emission-store.spec.ts | Adaptar y conservar la cobertura de 1B al integrar preparación/publicación con administración |
| backend/test/authority-snapshot-route.spec.ts | Agregar recorrido desde mutación administrativa confirmada hasta lectura wire, sin introducir otras rutas ni autenticación simulada como real |
| installer/nucleus/internal/authority/administration_interop_test.go | Crear consumidor Go de los artefactos administrativos de prueba; verificar aceptación/proyección exactas y ausencia de cambios ante candidatos inválidos; no modificar gates ni modo |
| docs/ROLES/BLOOM_AUTHORITY_INTEROPERABILITY_CONTRACT_v0_1.md | Actualizar contratos, evidencia y este registro único según lo efectivamente implementado; conservar P1/P2/P3 y fronteras productivas |

La prueba de scope canónico será una interfaz explícita con fixtures identificados
en tests; sin fuente real verificable se rechaza la concesión real. Ningún rol nuevo,
jerarquía tenant ni administración global de identidad se añade. Si aparece una
dependencia que requiera otro archivo, se presenta antes de escribir.

### 10.1 Contrato implementado

El conjunto cerrado de comandos comprende proponer membership, proponer assignment,
aceptar propuesta, definir versión de rol organizacional y suspender, reanudar o
revocar membership/assignment. Onboarding, recuperación, mutaciones globales de
identidad y operaciones no enumeradas se rechazan. El destinatario humano debe
estar verificado en la proyección actual; todavía no se importan nuevas identidades.

Las propuestas guardan otorgante, destinatario y condiciones fuera de la proyección
efectiva. Sólo la aceptación por el destinatario incorpora la relación con su
accepted_at real. Se revalidan otorgante, permisos, rol exacto, scope y vigencia al
aceptar. Una definición de rol no concede autoridad. Sus permisos se limitan al
máster vigente; para concederlos también deben estar entre los permisos vigentes
del otorgante. No se amplía el catálogo ni se habilitan nuevas concesiones Vault/Executor.
La autoconcesión no puede ampliar permisos, scope ni vigencia. Reanudar una membership
revalida las asignaciones que volvería a habilitar; una relación revocada no se
reanuda ni reutiliza su identificador. No hay herencia automática entre organizaciones.

Los scopes organizacionales deben coincidir exactamente. Los de proyecto requieren
evidencia explícita de pertenencia, procedencia, revisión, estado y vigencia. Los
fixtures sólo se admiten con marca y opción de prueba expresas. No hay adaptador
productivo de esa fuente ni fallback que convierta su ausencia en autorización.

prepareEmission valida y firma sin publicar. El batch D1 reúne emisión y head,
solicitud/historia, propuesta o aceptación, auditoría y outbox. Los triggers abortan
ante base incompatible, propuesta ya consumida o evidencia de proyecto modificada.
La falla de una sentencia revierte todo el batch. Cada comando confirmado reserva
una versión, incluso una propuesta cuyo estado efectivo no cambia. El outbox queda
persistido; 2A no lo entrega ni implementa relay o scheduler.

La clave idempotente compromete actor, comando, metadata y versión esperada. El
reintento autenticado idéntico devuelve el recibo terminal original, aun con head
posterior; no vuelve a ejecutar el cambio. Otra solicitud con la misma clave falla.
El token de prueba del actor no se guarda en solicitud ni auditoría. Se conserva
el instante de decisión firmado y se verifica de nuevo la vigencia antes del batch.
La autoridad organizacional y revisión de proyecto se protegen en el commit;
la revocación de una sesión real entre autenticación y commit requiere la integración
de 2B. El adaptador obligatorio de identidad no equivale a autenticación HTTP real.

### 10.2 Evidencia local y límites

Resultado: **79/79 pruebas Backend aprobadas**: 35 de política administrativa,
14 de transacción administrativa, 16 de emisiones y 14 del handler de snapshots.
**Typecheck estricto de los módulos y pruebas del lote aprobado.** No se declara
verde la aplicación Backend completa ni las suites de dominios excluidos.

Las pruebas D1 usan Miniflare/workerd y directorios temporales, tabla organizations
mínima y migraciones de autoridad 0001, 0004 y 0005. No se aplicó una migración
productiva ni la cadena completa del producto. Se verificaron rollback por fallas
de auditoría/outbox, carreras de aceptación, idempotencia y cambios de autoridad,
propuesta y evidencia de proyecto entre validación y commit.

El intercambio nuevo entrega a Go seis estados: inicial, propuesta y aceptación
de membership, propuesta y aceptación de assignment de proyecto, y revocación.
Go acepta los bytes servidos por el handler desde D1, verifica digests y proyección
de cada etapa y confirma que las propuestas no confieren autoridad. También verifica
full final equivalente, rechazo de firma alterada y downgrade sin cambiar estado.
El ensayo Go autónomo de referencia inválida pasó; el caso dinámico se omite sin
AUTHORITY_ADMIN_ARTIFACT y **pasó dentro de Vitest con artefactos recién generados**.
La comprobación cruzada anterior de 1B también pasó, sin repetir su implementación.

Comandos desde backend:

```text
node node_modules/vitest/vitest.mjs run test/authority-administration.spec.ts test/authority-administration-store.spec.ts test/authority-emission-store.spec.ts test/authority-snapshot-route.spec.ts --no-cache
node node_modules/typescript/bin/tsc --noEmit --strict --target ES2022 --module ESNext --moduleResolution Bundler --lib ES2022 --types node,@cloudflare/workers-types --skipLibCheck --esModuleInterop src/authority/administration.ts src/authority/administration-store.ts src/authority/emission-store.ts test/authority-administration.spec.ts test/authority-administration-store.spec.ts test/authority-emission-store.spec.ts test/authority-snapshot-route.spec.ts
```

Desde installer/nucleus, con GOCACHE temporal y GOPROXY=off:

```text
go test ./internal/authority -run '^TestAdministrationInterop' -count=1 -v
```

La compatibilidad wire de 1A/1B se conserva. Los datos legacy sin evidencia suficiente
siguen requiriendo recuperación; no hay conversión ni alta real implícita. Este
recorrido prueba administración interna → emisión persistida → lectura → aceptación
Go. No prueba transporte de sincronización, actor local, root productiva, checkpoint,
decisión efectiva de gates, latencia de revocación ni observación de 24 h. D5 sigue
siendo exclusivamente shadow para critical/privileged/standard: este lote no cambia
el resultado local, el modo ni el trabajo offline. El registro único de §9 permanece
como criterio de cierre del Work.

## 11. Lote 2B: identidad Backend y entrada administrativa

**Ejecutado por aprobación puntual de los catorce archivos de esta tabla.** Conectar identidad humana inicial,
sesiones sin roles y entrada HTTP al commit administrativo. La pertenencia explícita
a una organización no se deduce del tenant ni de controlar una cuenta GitHub.
No se habilitan onboarding real, recuperación, merge de principals, enlaces externos
adicionales ni autoridad global. P1/P2/P3 conservan exactamente sus fronteras de §9.

| Archivo literal | Cambio puntual propuesto |
|---|---|
| backend/migrations/0006_authority_human_identity.sql | Crear persistencia de flujos de autenticación de un uso, identidad humana inicial con correspondencia organizacional explícita y sesiones sin roles, con revocación y precondiciones transaccionales. Migración sólo en base temporal |
| backend/src/authority/human-identity.ts | Crear adaptador GitHub App exclusivo Backend: identidad estable, correlación y protección contra replay del flujo, evidencia del proveedor y rechazo sin configuración. Verificar el contrato del proveedor al implementar; fixtures explícitos sin fallback real |
| backend/src/authority/human-session-store.ts | Crear sesiones con credenciales almacenadas mediante hash, duración limitada, renovación/revocación y resolución del actor; producir precondiciones de sesión para el commit. No guardar permisos en sesión ni habilitar administración global |
| backend/src/authority/administration-route.ts | Crear handlers aislados de autenticación/sesión y administración: validar entrada, protección de sesión/CSRF, idempotencia y metadata generada por Backend; no aceptar identidad declarada por el caller |
| backend/src/authority/administration-store.ts | Integrar precondiciones de sesión vigente en el mismo batch y evidencia de identidad inicial del destinatario; conservar recibo idempotente con metadata asignada por servidor y atomicidad de 2A |
| backend/src/authority/administration.ts | Permitir únicamente incorporar la primera identidad humana verificada al proponer membership mediante actor autorizado; sin reemplazar identidad existente, merge, enlaces adicionales ni concesión automática; mantener D3 |
| backend/src/index.ts | Conectar exclusivamente imports y rutas de autenticación humana/administración Authority; preservar middleware de instalación y demás dominios |
| backend/worker-configuration.d.ts | Declarar sólo bindings necesarios del adaptador y sesiones; configuración ausente rechaza el recorrido. Sin provisionar secretos ni desplegar |
| backend/test/authority-human-identity.spec.ts | Crear pruebas del contrato del adaptador, identidad estable, correlación, replay y errores, con proveedor de prueba explícito |
| backend/test/authority-human-session-store.spec.ts | Crear pruebas D1 temporal de hash, vencimiento, renovación, revocación y concurrencia; sesión no confiere roles |
| backend/test/authority-administration-route.spec.ts | Crear recorrido de handlers aislados desde sesión hasta commit, rechazos y reintentos; no importar rutas ajenas ni presentar proveedor simulado como autenticación productiva |
| backend/test/authority-administration-store.spec.ts | Probar revocación de sesión entre validación y commit con rollback completo e incorporación inicial de identidad sin autoridad implícita |
| backend/test/authority-administration.spec.ts | Probar que la evidencia inicial no permite sobrescritura, merge, enlaces adicionales, autoelevación ni herencia organizacional |
| docs/ROLES/BLOOM_AUTHORITY_INTEROPERABILITY_CONTRACT_v0_1.md | Actualizar contratos y evidencia de 2B, registro único y siguiente lista puntual; conservar decisiones y separación desarrollo/operación/cutover |

El cierre de 2B acredita un recorrido local autenticado por el adaptador de prueba,
con sesión revocable y commit protegido, además de revisión del contrato documentado
del proveedor; no acredita una cuenta productiva ni onboarding real de Sovereign.
La prueba del actor local en Nucleus sigue pendiente con confianza, y los lotes 3–6
mantienen los criterios de §9. Cualquier dependencia que exija otro archivo se
presentará antes de escribir; no se incluyen Git, despliegues ni cutover.

### 11.1 Contrato y evidencia de 2B

El flujo Backend usa GitHub App web authorization con state aleatorio y PKCE S256.
El callback exige coincidencia de state y navegador, consume el flujo una sola vez,
intercambia el código en Backend y toma el ID numérico de GitHub como subject estable;
el handle sólo es presentación. El contrato se contrastó con la documentación oficial
vigente de GitHub App. No se realizó una autenticación contra una cuenta real.

La autenticación sólo encuentra una correspondencia organizacional previamente
registrada y explícita. No crea organización, principal global, membership, assignment
ni autoridad. La correspondencia liga organización, principal, subject, fuente y
revisión; no puede cambiar de subject, borrarse o revivir después de revocada. Un
principal inicialmente ausente de la proyección sólo se incorpora al proponer su
membership por un administrador autorizado. La propuesta sigue sin conferir membership
ni permisos; el destinatario debe autenticarse y aceptar. No se admiten merge,
sobrescritura ni identidades externas adicionales por este recorrido.

Las sesiones guardan hashes del token y CSRF y cifran el token de proveedor con AES-GCM.
No contienen roles. Se limitan a 15 minutos y al vencimiento menor del grant de proveedor;
la renovación rota token y CSRF, no excede el límite absoluto y sólo una carrera puede
ganar. Cada resolución comprueba sesión, identidad, organización y proveedor. Un 401
confirmado del proveedor revoca la sesión; una indisponibilidad rechaza la autenticación
sin registrar una revocación falsa. Logout requiere token y CSRF, y no depende de que
el proveedor esté disponible.

La entrada HTTP exige origen exacto en mutaciones, cookie Secure/HttpOnly/SameSite=Lax,
CSRF, JSON acotado y forma cerrada. El actor se deriva de la cookie; un actor declarado
por el cuerpo se rechaza. Backend asigna metadata y tiempo. Reintentos concurrentes con
la misma clave convergen al recibo y bytes ganadores aunque hayan preparado UUID distintos.
La sesión, identidad del actor y evidencia inicial del destinatario se fijan por revisión
en el mismo batch de 2A; revocarlas o modificarlas antes del commit revierte emisión,
propuesta, auditoría y outbox.

La entrada configurada falla con 503 cuando faltan origen, GitHub App, clave de sesión
o firma de Authority. No existe fallback a fixture. Los bindings sólo se declararon;
no se agregaron secretos al repo ni se modificó configuración de despliegue.

Resultado local final: **105/105 pruebas Authority Backend aprobadas** en siete archivos
de prueba: 36 política administrativa, 18 transacción, 16 emisiones, 14 snapshot, 9
adaptador GitHub, 7 sesiones y 5 HTTP. La migración 0006 se aplicó junto con 0001/0004/0005
únicamente en D1 de Miniflare/workerd dentro de directorios temporales. El typecheck
estricto de todos los módulos y pruebas de 2B pasó.

El typecheck global del Backend sigue rojo por ocho errores preexistentes fuera de los
catorce archivos: tests legacy importan cloudflare:test y símbolos de identity.ts que
no existen, además de dos firmas/tipos incompatibles. No se tocaron esos archivos.
Tampoco se importó el árbol completo de rutas en las pruebas de 2B porque contiene el
dominio excluido. No se ejecutaron Git, despliegues, migraciones productivas ni cutover.

El límite de 2B es explícito: el adaptador fue probado con transporte simulado, no con
credenciales/cuenta GitHub reales, webhooks desplegados ni SSO. La correspondencia real
de Sovereign continúa bloqueada por P1. El cifrado usa una clave de configuración; su
provisión y custodia productivas no se acreditan. No hay recuperación P2, actor local,
root productiva, sync, checkpoint ni decisión efectiva. D5 permanece sólo en shadow
para critical/privileged/standard, sin alterar resultado local ni trabajo offline.

## 12. Plan completo de lotes restantes 3–6

Los lotes son secuenciales. Cada uno requiere aprobación puntual independiente. Este
plan no autoriza ninguna de sus escrituras. Los criterios de desarrollo se distinguen
de las condiciones posteriores de validación operativa y cutover de §9.3.

### 12.1 Lote 3 — confianza, checkpoint y prueba del actor local (concluido)

Dependencias: wire y store 1A/1B; sesiones 2B; binding de instalación existente.
P1 no bloquea fixtures ni organizaciones ya emitidas. P2 bloquea adoptar estado legacy
real, pero no implementar y probar el mecanismo fail-closed de checkpoint/recuperación.

| Archivo literal | Cambio puntual propuesto |
|---|---|
| backend/migrations/0007_authority_trust.sql | Crear journal inmutable de manifiestos de issuer, desafíos de actor local de un uso y aprobaciones humanas ligadas a organización/instalación/clave; sólo D1 temporal |
| backend/src/authority/trust-manifest.ts | Crear perfil canónico firmado de manifiesto: root, issuer, organización, versión, claves autorizadas/retiradas y vigencia; sin TOFU ni confianza por signed_by_key_id |
| backend/src/authority/trust-route.ts | Crear lectura del manifiesto y recorrido challenge/approval de actor local usando sesión humana 2B y prueba de posesión distinta de instalación; rechazar replay, audiencia o binding incorrectos |
| backend/src/index.ts | Conectar únicamente rutas Authority de trust y actor local, conservando las demás rutas |
| backend/worker-configuration.d.ts | Declarar bindings de root/manifiesto necesarios; configuración ausente falla cerrada, sin provisionar secretos |
| backend/test/authority-trust.spec.ts | Probar manifiestos, rotación, retiro, vigencia, challenge de un uso y aprobación humana con D1 temporal; ninguna root fixture admitida sin marca explícita |
| installer/nucleus/internal/authority/trust_manifest.go | Verificar manifiesto canónico, cadena a root configurada, versión/vigencia, issuer/org y conjunto de claves; separar claves históricas de emisoras vigentes |
| installer/nucleus/internal/authority/trust_manifest_test.go | Probar root incorrecta, autofirma/TOFU, rollback, expiración, rotación solapada y retiro sin pérdida de evidencia histórica |
| installer/nucleus/internal/authority/checkpoint.go | Crear checkpoint separado con binding, high-water mark, state/emission digest y cutover floor; escritura durable atómica y reconciliación fail-closed con Store |
| installer/nucleus/internal/authority/checkpoint_test.go | Probar interrupciones en cada etapa, restore parcial store/checkpoint, corrupción, pérdida y prohibición de bajar high-water/floor; sin prometer pérdida conjunta indetectable |
| installer/nucleus/internal/authority/actor_proof.go | Crear clave/prueba local efímera y desafío firmado ligado a humano, organización, instalación, audiencia y vencimiento; no reutilizar la clave de instalación |
| installer/nucleus/internal/authority/actor_proof_test.go | Probar posesión, replay, organización/instalación/audiencia incorrectas, expiración y separación de claves |
| installer/nucleus/internal/authority/snapshot.go | Integrar trust manifest y checkpoint en aceptación durable, preservando compatibilidad wire y ErrLegacyState |
| installer/nucleus/internal/authority/snapshot_test.go | Extender pruebas de aceptación/rollback para manifiesto, checkpoint y estados parciales sin reset implícito |
| docs/ROLES/BLOOM_AUTHORITY_INTEROPERABILITY_CONTRACT_v0_1.md | Registrar contrato/evidencia de lote 3, P1/P2/P3 y lista siguiente; sin declarar recovery productiva ni cutover |

Cierre verificable de desarrollo: Backend y Go aceptan el mismo manifiesto; root o
cadena inválidas no cambian estado; rotación conserva historia pero sólo claves vigentes
emiten; toda interrupción ensayada deja store/checkpoint anterior o nuevo coherentes;
restore parcial exige recuperación sin bajar floor; una prueba local sólo vale tras
challenge, aprobación de sesión humana y posesión de clave distinta de instalación.

#### Evidencia y límites del lote 3

El manifiesto `bloom.authority.trust-manifest` se canonicaliza con JCS, usa SHA-256
y firma Ed25519 bajo un dominio propio. Su payload liga root_key_id, issuer,
organización, versión monotónica, vigencia y claves emisoras activas o retiradas.
La root se aporta externamente al verificador y firma solamente el manifiesto; no
queda embebida como confianza ni firma atestaciones online. Este ajuste resolvió
una incompatibilidad detectada durante la implementación: una propuesta intermedia
habría requerido mantener la root privada online. Las atestaciones del actor usan
una clave emisora activa enumerada por el manifiesto y Nucleus las valida contra él.

Backend persiste manifiestos inmutables y un head monotónico. El alta se mantiene
inaccesible salvo fixture explícito; no existe endpoint ni procedimiento productivo
para provisionar roots/manifiestos. Un head perdido con historia retenida produce
recovery_required. La ruta de lectura entrega los bytes persistidos sólo a la
instalación ligada. Nucleus rechaza root desconocida, firma/digest/binding inválidos,
manifest vencido, rollback de versión y uso nuevo de una clave retirada.

La prueba local crea una clave Ed25519 efímera distinta de instalación. El desafío
se emite sólo tras autenticación de instalación, se almacena por digest y liga
organización, instalación, clave y audiencia. La aprobación exige sesión humana 2B,
CSRF, posesión de la clave y desafío pendiente/vigente. Sólo entonces se emite una
atestación de dos minutos con principal explícito. Replay, binding, audiencia,
posesión o vencimiento incorrectos se rechazan. Todavía no existe el cliente HTTP
automático que complete este intercambio desde Nucleus; se conecta en lote 4.

El checkpoint separado compromete binding, high-water mark, payload_digest,
state_digest, cutover_floor, digest exacto del store y versión/digest del manifiesto.
Un journal previo a la escritura conserva el par anterior; un reinicio después del
journal, del estado o del checkpoint restaura ese par y permite reintentar. Sin
journal válido, ausencia de uno de los archivos, corrupción, combinación de versiones
o rollback del manifiesto falla cerrado con recuperación explícita. No se interpreta
ausencia como primera instalación.

Resultado final: **111/111 pruebas Authority Backend aprobadas** en ocho archivos,
incluidas las 105 de lotes previos y seis de trust/actor. El typecheck estricto del
lote y su conexión en `index.ts` pasó. La migración 0007 se aplicó únicamente junto
a las dependencias mínimas en D1 Miniflare/workerd temporal. El paquete Go
`./internal/authority` pasó completo con GOPROXY=off y caché temporal. Vitest generó
manifiesto y atestación nuevos, Go verificó ambos artefactos con la root pública de
prueba y rechazó alteración; el caso autónomo se omite solamente sin el artefacto.

No se demostraron fsync del directorio ni power loss físico; las pruebas inyectan
interrupciones deterministas alrededor de las escrituras. La pérdida/restauración
conjunta y coherente de todo el store, checkpoint, journal y ancla externa no es
detectable sólo con estos archivos. P2 sigue siendo necesario para adoptar evidencia
legacy o un estado anterior real. Tampoco se acreditan root, credenciales, GitHub,
SSO ni fuentes canónicas productivas. P1/P3 permanecen separados. D5 continúa sólo
shadow para critical/privileged/standard, sin efecto sobre resultado local u offline.

### 12.2 Lote 4 — sincronización durable

Dependencias: lote 3 para trust/checkpoint y 2A para outbox. Implementa aviso más pull;
el aviso nunca es autoridad. P1/P2 no bloquean fixtures. No activa D5 ni remote_enforced.

| Archivo literal | Cambio puntual propuesto |
|---|---|
| backend/migrations/0008_authority_sync.sql | Crear leases/intentos/acknowledgements del outbox y desafíos de pull, con idempotencia, reintentos y retención; sólo D1 temporal |
| backend/src/authority/sync-store.ts | Reclamar/publicar/confirmar outbox durable, registrar latencias separadas y resolver avisos perdidos/retrasados sin marcar entrega prematura |
| backend/src/authority/sync-object.ts | Crear coordinador Durable Object por organización para fan-out y reconexión; evento contiene versión/correlación, nunca estado confiable |
| backend/src/authority/sync-route.ts | Crear stream de avisos y pull HTTPS con desafío, autenticación de instalación, audiencia y lectura first-primary suficientemente consistente |
| backend/src/index.ts | Conectar rutas y export del coordinador Authority sin cambiar rutas ajenas |
| backend/worker-configuration.d.ts | Declarar namespace/bindings de sincronización, sin provisionarlos |
| backend/wrangler.jsonc | Declarar Durable Object y migración local de configuración para pruebas; sin deploy ni bindings productivos |
| backend/test/authority-sync-store.spec.ts | Probar claim/ack, crash, reintento, duplicado, lease expirada y medición commit→aceptación separada de restricción hipotética |
| backend/test/authority-sync-route.spec.ts | Probar desafío actual, replay, binding/audiencia, consistencia y fallback de aviso perdido a pull |
| backend/test/authority-sync-object.spec.ts | Probar fan-out, desconexión/reconexión, orden, duplicados y ausencia de autoridad en el push |
| installer/batcave/src/server/routes/authority-proxy.ts | Reenviar trust-manifest, challenge/approval del actor y rutas sync/pull/upgrade conservando bytes, cookies, CSRF, desafío y headers según cada canal; no verificar ni firmar autoridad |
| installer/batcave/src/server/routes/authority-proxy.test.ts | Probar proxy de trust/actor/HTTP/stream, desconexión, error, headers y que Batcave no altera payload ni evidencia ni registra secretos |
| installer/batcave/src/server/http-server.ts | Conectar transporte de avisos Authority al servidor existente, sin tocar el dominio excluido |
| installer/batcave/src/server/http-server.test.ts | Probar conexión efímera y cierre/reinicio del transporte con fallback a pull |
| installer/nucleus/internal/authority/sync.go | Crear cliente de aviso/pull con poll inicial 20 s, desafío nuevo por consulta, verificación y aceptación mediante Verifier/checkpoint |
| installer/nucleus/internal/authority/sync_test.go | Probar pérdida, demora, duplicado, reinicio, gap/full, expiry y medición commit→aceptación; ningún evento renueva evidencia |
| docs/ROLES/BLOOM_AUTHORITY_INTEROPERABILITY_CONTRACT_v0_1.md | Registrar evidencia de lote 4 y siguiente lote, manteniendo D5 sólo shadow |

Cierre verificable: cada outbox confirmado se puede entregar o reintentar tras crash;
push perdido converge por pull; reinicio crea consulta/desafío nuevos; versión anunciada
sólo se reconoce después de aceptación durable; full/delta preservan equivalencia; las
medidas distinguen commit→aceptación de commit→would-block. El objetivo 60 s se mide,
no se declara demostrado universalmente.

Resultado de ejecución del lote 4 (2026-09-10): **completado para desarrollo
inicial en entornos temporales**. La migración 0008 se aplicó sólo a D1 Miniflare
efímero. El outbox se materializa por instalación de la audiencia, se reclama con
lease recuperable y se confirma únicamente después de que el Durable Object acepta
el aviso. Los avisos quedan deduplicados, ordenados y retenidos por 24 horas; sólo
contienen organización, instalación, evento, versión, correlación, urgencia y hora de
commit. No contienen snapshot, estado, permisos ni evidencia que Nucleus pueda aceptar
como autoridad.

Backend emite un desafío aleatorio de un solo uso y dos minutos, ligado a organización
e instalación. El pull autenticado consume el desafío, lee first-primary, devuelve los
bytes persistidos full/delta y agrega un `bloom.authority.current-check` firmado bajo
`BLOOM-AUTHORITY-CURRENT-PULL-v1`. El check liga desafío, audiencia, versión, digest de
estado y digest del snapshot; no cambia `issued_at`, `not_before` ni `expires_at` del
snapshot. Nucleus firma cada request con su clave de instalación, obtiene un desafío
nuevo, verifica check y snapshot contra la misma confianza activa, y recién entonces
ejecuta `Verifier.VerifyAndAccept`, que escribe estado y checkpoint como par durable.
El lector NDJSON de Nucleus consume cada aviso mediante ese mismo recorrido desafiado;
los duplicados vuelven a consultar actualidad pero no agregan una segunda aceptación.

Evidencia: 6/6 pruebas focalizadas Backend pasaron en tres archivos sobre D1 temporal;
el test de ruta produjo en cada corrida artefactos nuevos y Go verificó firma, dominio,
binding, digests, vigencia y checkpoint. El paquete Go `./internal/authority` pasó
completo. Batcave pasó 18/18 pruebas de proxy/servidor y su typecheck estricto. Las 134
pruebas de la corrida Backend amplia que no sufrieron contención pasaron; los tres
archivos que agotaron tiempo o perdieron el helper Go al correr todos en paralelo
pasaron luego aislados: 18/18 administración-store, 14/14 snapshot-route y 6/6 trust.
El typecheck Backend conserva ocho errores preexistentes en `authority.spec.ts`,
`authority.spec.additions.ts` e `identity.spec.ts`; no involucran archivos del lote 4.

Quedaron demostrados: reintento tras lease expirada, idempotencia ante duplicados,
persistencia/reinicio del coordinador, cierre/reinicio de Batcave, pull periódico sin
aviso, rechazo ante desconexión sin mutación, desafío expirado o repetido, fallback a
full ante un gap, rechazo de evidencia expirada por el verificador y replay que no
renueva la vigencia. Las mediciones separan commit→aceptación de
commit→restricción-hipotética (50 s) y abarcan critical/privileged/standard sólo como
datos shadow. Ninguna de ellas cambia el resultado local, impide trabajo offline ni
activa `remote_enforced`.

No quedó demostrada una cota universal de 60 segundos: se midió el recorrido bajo test,
pero faltan carga real, bindings/alarma del relay, red, clocks y credenciales productivas.
Tampoco se probaron pérdida física de energía, disponibilidad multi-región ni una ventana
operativa real de 24 horas. P1 (verificador/evidencia de onboarding real de Sovereign),
P2 (procedimiento para estado anterior real) y P3 (política productiva ante desconexión)
siguen pendientes y separados del cierre del desarrollo inicial. La declaración del
Durable Object no provisiona bindings productivos y no hubo deploy, migración productiva,
cambio de modo ni cutover.

### 12.3 Lote 5 — decisión efectiva y shadow

Dependencias: estado aceptado/checkpoint del lote 3 y evidencia temporal del lote 4.
D5 incluye critical, privileged y standard sólo en cálculo shadow; local_legacy sigue
produciendo el resultado efectivo y el trabajo offline no se bloquea.

| Archivo literal | Cambio puntual propuesto |
|---|---|
| installer/nucleus/internal/authority/decision.go | Crear evaluador cerrado de principal, membership, assignment, rol/versión, permiso, scope, controles y freshness sobre estado aceptado |
| installer/nucleus/internal/authority/decision_test.go | Probar permisos/scopes exactos, vigencias/revocaciones, controles ausentes not_evaluable/deny y catálogo cerrado |
| installer/nucleus/internal/authority/shadow.go | Crear comparación shadow inmutable con operación, clase, causa, versión y evidencia temporal; devolver siempre el resultado local recibido |
| installer/nucleus/internal/authority/shadow_test.go | Probar equivalencia exacta del resultado local online/offline y would-block a 50 s para critical/privileged/standard |
| installer/nucleus/internal/governance/decision/decision.go | Consultar el evaluador Authority en shadow para las operaciones gobernadas existentes, sin activar remote_enforced ni alterar LocalLegacy |
| installer/nucleus/internal/governance/decision/decision_test.go | Crear pruebas de integración local/remoto shadow y ausencia de fallback automático a remoto |
| installer/nucleus/internal/governance/authority_mode.go | Exponer modo/basis shadow y evidencia de comparación sin cambiar el modo efectivo por configuración implícita |
| installer/nucleus/internal/governance/authority_mode_test.go | Probar matriz de modos, binding y que shadow no cambia decisiones locales |
| installer/nucleus/internal/orchestration/workflows/system_gate.go | Conectar una frontera real existente al resultado sellado de gobernanza y registrar la comparación, sin ampliar operaciones |
| installer/nucleus/internal/orchestration/workflows/system_gate_test.go | Crear prueba del gate con allow/deny/error local y remote allow/deny/not_evaluable en shadow |
| docs/ROLES/BLOOM_AUTHORITY_INTEROPERABILITY_CONTRACT_v0_1.md | Registrar evidencia, catálogo exacto evaluado y lista del lote 6; P3 sigue pendiente para producción |

Cierre verificable: las operaciones enumeradas resuelven autoridad remota sólo con
estado aceptado vigente y todos los controles requeridos; ausencia produce deny o
not_evaluable en el cálculo. Para las tres clases D5, tras 50 s se registra would-block
con causa y versión. En todos los casos shadow devuelve byte/valor/error local exacto,
incluido offline, y ninguna ruta activa remote_enforced.

Resultado de ejecución del lote 5 (2026-09-10): **completado para desarrollo
inicial**. `DecisionEvaluator` sólo carga para uso externo el par durable de estado y
checkpoint aceptado y coherente; ausencia, restore contradictorio o checkpoint faltante
produce `not_evaluable`. Evalúa el permission ID contra el catálogo cerrado v1 y exige
snapshot vigente, principal activo, identidad humana externa verificada, membership
activa, assignment activo, role ID/versión exactos, permission exacto, scope tipo/ID
exactos y cada control requerido con revisión explícita. No existe herencia implícita
entre scopes. Estado expirado, hechos inactivos, revocación o control denegado producen
`deny`; operación desconocida, control ausente o role referenciado ausente producen
`not_evaluable` con causa estable.

El comparador shadow registra operación, clase, resultado/cause remotos, versión,
digest, conectividad y tiempos. Para critical, privileged y standard calcula
`would_block_at = committed_at + 50 s` y sólo marca `would_block` desde ese instante
cuando la candidata remota no es allow. Devuelve el mismo valor y la misma instancia de
error locales aunque Authority esté desconectada o falle el sink de observación.
`EffectiveAuthorityMode` continúa devolviendo exclusivamente `local_legacy`; instalar
observación no cambia modo, basis ni enforcement y no existe una ruta que active
`remote_enforced`.

La frontera de SystemGate recibe una decisión de gobernanza ya sellada, copia su
evidencia shadow al sink y conserva exactamente el error local. La evaluación remota no
se ejecuta dentro del workflow Temporal: su input actual carece de actor, organización,
operación y evidencia, y efectuar IO desde el workflow rompería determinismo. El paquete
completo `internal/orchestration/workflows` conserva fallos preexistentes en
`recovery_flow.go`; la frontera `system_gate.go` se compiló y probó aisladamente y su uso
obsoleto de `workflow.NewApplicationError` fue actualizado a la API Temporal vigente.

Incompatibilidad concreta: los únicos `GovernedOperation` existentes son
`create_organization` y `create_project`, pero ninguno posee un permission ID en el
catálogo v1 aprobado. El lote no inventa una equivalencia: sin mapping explícito registra
`operation_permission_unmapped/not_evaluable` y preserva la decisión local. Esto no
bloquea la evaluación completa de los permission IDs enumerados ni shadow, pero sí
bloquea interpretar esas dos operaciones Gravity como allow/deny remoto hasta que José
apruebe su permission y scope requeridos. El onboarding inicial de organización además
debe conservar la excepción de circularidad ya identificada en D1/D2.

Evidencia local: `./internal/authority`, `./internal/governance/...` y la compilación
focalizada de `system_gate.go` con sus tests pasaron. Se verificaron allow, deny,
not_evaluable, catálogo cerrado, identidad, vigencia, revocación, role/versión, scope
exacto, controles ausentes/denegados, estado/checkpoint, las tres clases a 50 segundos,
online/offline, preservación de valor/error y ausencia de cambio de modo. No hubo Git,
deploy, migración productiva, configuración de modo ni cutover.

### 12.4 Lote 6 — CLI, evidencia integrada y observación

Dependencias: lotes 3–5. Construye el recorrido demostrable y herramientas de observación;
la ventana real de 24 h pertenece a validación operativa posterior, no al test unitario.

| Archivo literal | Cambio puntual propuesto |
|---|---|
| backend/src/authority/evidence-route.ts | Crear lectura autenticada de emisiones, auditoría/outbox/sync y latencias sin secretos, con cursor e integridad explícitos |
| backend/src/index.ts | Conectar únicamente la ruta Authority de evidencia |
| backend/test/authority-evidence-route.spec.ts | Probar autenticación, paginación, integridad, minimización, errores y consistencia en D1 temporal |
| installer/batcave/src/server/routes/authority-proxy.ts | Reenviar lectura de evidencia con autenticación S2S y metadata permitida |
| installer/batcave/src/server/routes/authority-proxy.test.ts | Probar bytes/headers/errores y ausencia de tokens o firmas en logs |
| installer/nucleus/internal/authority/observation.go | Crear acumulador durable de aceptación, divergencia, no evaluable, freshness, fallos y latencias con ventana explícita |
| installer/nucleus/internal/authority/observation_test.go | Probar reinicio, deduplicación, reloj inyectado, agregados y ventana simulada sin presentarla como 24 h reales |
| installer/nucleus/internal/governance/authority_command.go | Crear CLI Authority humano y JSON para status, sync, decision, checkpoint y observation; registrar comandos mediante el patrón existente |
| installer/nucleus/internal/governance/authority_command_test.go | Probar schemas/salidas estables, códigos de error y que comandos de observación no cambian modo/cutover |
| installer/nucleus/internal/authority/e2e_test.go | Crear recorrido integrado Backend fixture → administración → emisión → outbox → sync → aceptación → decisión shadow, con fallos y reinicio |
| docs/ROLES/BLOOM_AUTHORITY_INTEROPERABILITY_CONTRACT_v0_1.md | Consolidar evidencia D1–D8, criterios de cierre de desarrollo y protocolo de validación de 24 h/cutover, conservando P1/P2/P3 |

Cierre verificable de desarrollo: CLI humano/JSON reporta la misma evidencia; el test
integrado recorre administración→emisión→sync→aceptación→decisión y demuestra reinicio,
revocación, divergencia y no evaluable; no hay dependencia silenciosa ni resultado local
alterado. El acumulador puede completar y exportar una ventana de 24 h, pero la observación
real con carga, roots, identidades y fuentes canónicas pertenece a validación operativa.
Cutover exige resolver P1/P2/P3, autorizar configuración/migraciones/despliegue, revisar
divergencias y aprobar expresamente la transición; ningún lote la infiere.

#### Resultado del lote 6 y cierre del desarrollo inicial

Backend expone `GET /v1/authority/evidence` detrás de la autenticación S2S de
instalación ya existente. La consulta liga organización e instalación, usa lectura
`first-primary`, límite 1–100 y cursor opaco ligado a ambos destinatarios. Une sólo
metadatos minimizados de emisión, administración, outbox, entrega y medición. Excluye
estado, comandos, detalles de auditoría, sesiones, tokens, firmas, desafíos, lease IDs
y payloads. Cada página lleva schema, destinatario, hora, cursor siguiente y SHA-256
sobre el cuerpo canónico sin el bloque de integridad. Batcave reenvía bytes, query,
autenticación S2S y metadata permitida; sus registros conservan sólo presencia de
headers y nunca cursor, firma ni contenido.

Nucleus persiste un documento `bloom.authority.observation/v1` mediante escritura
atómica y lock. Los eventos tienen identidad idempotente, binding, tipo, versión,
resultado, causa, clase y latencias opcionales. Un replay idéntico no agrega otra
fila y reutilizar el ID con contenido diferente falla. La lectura tras reinicio
valida schema, campos, unicidad y corrupción. El resumen exige límites temporales
explícitos, usa intervalo `[from,to)`, cuenta aceptación, divergencia, no evaluable,
freshness, fallos, latencia y shadow, y marca una ventana de 24 h como **simulada**;
no la presenta como observación operativa real.

El comando `nucleus authority` registra `status`, `sync`, `decision`, `checkpoint`
y `observation` con el patrón Cobra/Core existente. JSON y salida humana se generan
desde la misma estructura `bloom.authority.cli-evidence/v1`; las pruebas comprueban
que cada valor JSON aparece también en la representación humana. No existen
subcomandos de mode, enforce o cutover. Sin cliente o evidencia configurados, sync,
decision, checkpoint y observation devuelven códigos estables y visibles; no crean
un fallback ni cambian `local_legacy`.

El intercambio del test escribe una página de evidencia Backend en un archivo
temporal e invoca el test Go. Go exige que la misma página contenga emisión,
administración, outbox, delivery y measurement; acepta un snapshot firmado con
checkpoint, vuelve a leerlo mediante instancias nuevas de Store/Checkpoint, evalúa
allow, rechaza una divergencia sin mutar el store, produce `not_evaluable` por control
ausente, acepta una versión superior con revocación y obtiene deny. Finalmente shadow
desconectado registra `would_block` para standard a los 50 segundos y devuelve el
mismo valor y la misma instancia de error locales. Las suites anteriores cubren el
commit administrativo real, materialización/reintento del outbox, desafío/pull actual,
trust y aceptación; el test 6 une su evidencia sin repetir ni sustituir esos contratos.

Resultados locales del lote: 4/4 pruebas del endpoint Backend aprobadas, incluido el
intercambio Backend→Go; el paquete Go `./internal/authority` y todos los paquetes
`./internal/governance/...` aprobaron; el archivo de proxy Batcave y su typecheck
aprobaron. El typecheck global Backend conserva ocho errores preexistentes en
`authority.spec.ts`, `authority.spec.additions.ts` e `identity.spec.ts`: imports legacy
ausentes, tipos de `cloudflare:test` y una incompatibilidad BufferSource. Ninguno se
origina en los archivos del lote 6; la prueba Vitest compila y ejecuta el endpoint
nuevo. Todas las bases, claves, artefactos y caches del ensayo fueron temporales.

Con esta evidencia, los criterios aprobados para **cerrar el desarrollo inicial sí
quedan satisfechos**: persona autenticada y administración autorizada, emisión
persistida, outbox y sincronización automática, aceptación/checkpoint durable y
decisión efectiva calculada en Nucleus están implementados y verificados; controles
ausentes son visibles y shadow preserva exactamente el resultado local conectado o
desconectado. `EffectiveAuthorityMode` sigue siendo `local_legacy`. No se declara
validación productiva, garantía universal de 60 segundos, observación real de 24 h,
remote_enforced ni cutover.

#### Consolidación final D1–D8

| Decisión | Aprobado | Implementado en desarrollo | Falta verificar | Intervención de José |
|---|---|---|---|---|
| D1 — onboarding e identidad destinataria | Evidencia de habilitación, verificación, destinatario y aceptación; sin autoridad automática entre organizaciones ni administración superior del tenant | Identidad humana estable, GitHub App Backend, sesiones revocables, binding y prueba local del actor | Recorrido real de Sovereign con cliente y evidencia canónica | **P1:** designar verificador y fuentes aceptables |
| D2 — facultades y primera concesión | Crear organización, habilitar onboarding y designar primer máster son facultades separadas; primera concesión única, versionada, aceptada y durable; otros másters/recuperación son recorridos separados | Motor de administración, propuestas/aceptaciones, revalidación, historia y transacción conjunta | Principals compartidos, identidades externas y propagación global siguen fuera del perfil aprobado; no hay autoridad global de identidad | P1 para la primera concesión real; cualquier ampliación de principals requiere decisión nueva |
| D3 — concesión y delegación | Scope explícito, subconjunto de facultades, no autoelevación, aceptación y nueva concesión para rol más poderoso | Memberships, assignments, roles versionados, revocación y verificación de scope/control | Catálogo operativo completo del máster y fuentes canónicas reales | Aprobar sólo futuras ampliaciones concretas del catálogo/scope |
| D4 — contrato interoperable | Wire v1, JCS, SHA-256, Ed25519, versiones uint64 textuales, full/delta y binding explícito | Emisor Backend y verificador/persistencia Go interoperables con vectores e intercambio dinámico | Credenciales, roots y transporte productivos | Autorizar configuración y material productivo por separado |
| D5 — sincronización y política temporal | Aviso sin autoridad, pull desafiado y 50 s sólo shadow para critical/privileged/standard, preservando resultado local/offline | Outbox, relay, pull, mediciones separadas, comparación y `would_block` shadow | Disponibilidad/carga real, objetivo 60 s y política de desconexión productiva | **P3:** decidir política y eventual activación; no está inferida |
| D6 — confianza | Root externa, manifiesto versionado/vigente, claves emisoras activas/retiradas, sin TOFU | Firma/verificación de manifiesto, actor proof y rechazo de rollback/binding/clave inválidos | Custodia, rotación y roots reales | Autorizar roots/credenciales y procedimiento operativo |
| D7 — checkpoint y recuperación | Binding, high-water mark, digests, floor y fallo cerrado ante contradicción | Store/checkpoint/journal atómicos y pruebas de interrupción, reinicio y restore parcial | Power loss físico, restore conjunto indetectable y adopción legacy real | **P2:** aprobar procedimiento para estado anterior |
| D8 — decisión efectiva y evidencia | Catálogo cerrado, controles obligatorios, deny/not_evaluable visibles y observación sin efecto de enforcement | Evaluador, CLI, evidencia Backend/proxy, acumulador y recorrido E2E shadow | Ventana real de 24 h y fronteras Gravity sin mapping | Aprobar mappings para `create_organization`/`create_project` si se desean; hoy siguen `operation_permission_unmapped` |

#### Condiciones posteriores: validación operativa y cutover

La validación operativa requiere una autorización y entorno separados. Debe usar
P1 resuelta, identidades/fuentes de scope reales, roots y claves custodiadas, y si
corresponde el procedimiento P2. Durante al menos 24 horas continuas debe conservar
por organización/instalación el denominador de commits, aceptaciones, fallos,
divergencias y `not_evaluable`; separar commit→aceptación de commit→would-block;
ejercitar reinicios, pérdida de avisos, expiración, desconexión y recuperación; y
reconciliar cada evento con auditoría/outbox/checkpoint. Una ventana incompleta,
corrupta o sin denominador no acredita el criterio. El objetivo de 60 segundos se
informa como distribución observada, nunca como garantía universal a partir del test.

Cutover sigue siendo otra decisión. Requiere P1, P2 y P3 resueltas; mappings Gravity
aprobados o exclusión expresa de esas operaciones; revisión de divergencias y controles
ausentes; compatibilidad y rollback aprobados; migraciones/configuración/deploy
autorizados; y aprobación explícita de José para cambiar modo. Este lote no realizó
ninguna de esas acciones.
