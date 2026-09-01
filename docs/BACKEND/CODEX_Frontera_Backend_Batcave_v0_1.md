# Frontera Backend ↔ Batcave — referencia de boundary (Codex)

**Tipo:** Documento de referencia — registra el boundary operativo que Codex está cerrando y construyendo en los works BACKEND/BATCAVE. No es un documento de este cowork: no debe modificarse, ampliarse ni reinterpretarse desde acá.
**Estado:** Compartido por Jose el 2026-09-01, tal como lo redactó/recibió de Codex.
**Propósito de guardarlo acá:** que cualquier investigación de frontera de este cowork (Mandate Server, Installer/Metamorph, Gravity, Wisdom, futuras) sepa con precisión qué parte del sistema ya está resuelta y en desarrollo en otro lugar, para no duplicarla ni interceder sobre ella.

---

# Frontera Backend ↔ Batcave

## Objetivo

Establecer un canal servidor-a-servidor entre el Backend central de Bloom y cada Batcave organizacional.

Batcave es el único cliente que cruza esta frontera:

```text
Backend Cloudflare
        ⇅
Batcave organizacional
        ⇅
Nucleus local
        ⇢
Metamorph local
```

El Backend nunca se conecta directamente a Nucleus, dispositivos o Metamorph. Las conexiones nacen desde Batcave.

## 1. Pull autoritativo de actualización

Es el primer flujo que debe quedar funcionando.

Batcave consulta:

```http
GET /v1/manifest?org=<organization_fingerprint>&channel=stable
If-None-Match: "<etag-anterior>"
```

El Backend responde:

- `200 + ETag + manifest`: existe una versión aplicable.
- `304`: no cambió el manifest.
- Error explícito: Batcave conserva su último estado válido.

El contrato real actual es:

```json
{
  "schema_version": "1.0",
  "generated_at": "2026-09-01T00:00:00.000Z",
  "ions": [
    {
      "domain": "github.com",
      "version": "1.0.0",
      "sha256": "...",
      "zip_path": "",
      "download_url": "https://backend.example/v1/releases/.../download"
    }
  ]
}
```

El Backend resuelve el contenido desde:

- D1: `releases` y `downloadRules`.
- R2: objeto descargable.
- Organización: `organization_fingerprint`.
- Canal inicial: `stable`.

Batcave:

1. Persiste el ETag.
2. Descarga el `.ion`.
3. Verifica SHA-256.
4. Conserva una copia local.
5. Genera posteriormente un manifest local con `zip_path`.
6. Entrega ese manifest a Metamorph por el camino local autorizado.

Metamorph nunca descarga desde Cloudflare.

## 2. Handshake autenticado

El pull local inicial puede probarse sin autenticación. El vínculo real desplegado deberá incorporar un handshake de servicio.

La identidad se apoya en:

- `organization_fingerprint`: identidad estable de la organización.
- `key_fingerprint`: referencia a la clave pública organizacional.
- Batcave: cliente servidor-a-servidor de la organización.
- Nucleus: única autoridad que firma con la clave privada.
- Backend: verifica la firma y emite una credencial limitada.

Flujo conceptual:

```text
Backend entrega desafío + nonce
        ↓
Batcave lo lleva a Nucleus
        ↓
Nucleus firma el desafío
        ↓
Batcave devuelve desafío firmado
        ↓
Backend verifica organización, firma, tiempo y nonce
        ↓
Backend emite credencial de servicio limitada
```

La credencial deberá incluir como mínimo:

- organización;
- identidad de Batcave, si se define una propia;
- scopes;
- emisión y expiración;
- versión del contrato;
- identificador de credencial;
- correlation ID;
- mecanismo de revocación.

Scopes separados:

```text
manifest:read
release:download
wisdom:publish
wisdom:discover
wisdom:adopt
```

Una credencial para descargar actualizaciones no debe autorizar operaciones de Wisdom.

## 3. Protección del intercambio

El handshake deberá contemplar:

- nonce de un solo uso;
- expiración corta del desafío;
- protección contra replay;
- timestamp y tolerancia de reloj;
- correlation ID;
- versionado del protocolo;
- rotación de credenciales;
- revocación;
- auditoría en Backend;
- ausencia total de claves privadas en Backend.

Continúan abiertas y no deben resolverse indirectamente desde otro co-work:

1. Confianza inicial en la clave pública organizacional.
2. Identidad y targeting por dispositivo.
3. Eventos exactos de revocación.
4. TTL y mecanismo de rotación.
5. WebSocket frente a SSE para el futuro canal push.

## 4. Separación entre actualización y Wisdom

Ambos flujos reutilizan:

- identidad organizacional;
- desafío firmado;
- credenciales;
- scopes;
- nonce y anti-replay;
- correlation ID;
- versionado;
- revocación;
- auditoría.

No comparten:

- endpoints;
- payloads;
- reglas de negocio;
- estados;
- permisos;
- persistencia;
- ciclo de vida.

### Actualización operativa

```text
GET /v1/manifest
GET /v1/releases/:id/download
```

Transporta manifests e ion recipes.

### Wisdom

Endpoints futuros conceptuales:

```text
POST /v1/wisdom/publications
GET  /v1/wisdom/publications
POST /v1/wisdom/adoptions
```

Transportará únicamente:

- artefacto publicable;
- versión;
- procedencia;
- organización publicadora;
- hashes;
- firma o referencia verificable;
- metadata necesaria para descubrimiento y adopción.

No transportará:

- evidencia cognitiva cruda;
- estado interno de Genesis;
- razonamiento privado;
- memoria local;
- trazas internas;
- autoridad de ejecución;
- cambios automáticos sobre Nucleus.

## 5. Canal push posterior

El push no reemplaza al pull autoritativo.

Su única función futura será avisar:

```text
"Existe una novedad para esta organización/canal."
```

Después del aviso, Batcave siempre ejecutará el mismo `GET /v1/manifest`.

Quedan fuera del primer tramo:

- Durable Objects;
- WebSocket/SSE;
- targeting por dispositivo;
- cursor y replay del push;
- scheduler con jitter;
- adopción automática de Wisdom.

## 6. Frontera para el co-work cloud avanzado

El co-work de estrategias avanzadas de Backend puede investigar:

- escalabilidad y partición de D1;
- arquitectura de R2;
- CDN y cache;
- observabilidad;
- rate limiting;
- resiliencia;
- disaster recovery;
- estrategias multi-región;
- costos;
- CI/CD;
- custom domains;
- políticas comerciales;
- catálogo y búsqueda;
- retención;
- seguridad perimetral;
- evolución del Marketplace.

No debe modificar ni decidir:

- el rol de Batcave como único cliente exterior;
- el rol de Nucleus como autoridad de firma;
- el invariante de Metamorph sin internet;
- el contrato vigente `{schema_version, generated_at, ions[]}`;
- la semántica ETag `200/304`;
- el handshake organizacional;
- los scopes compartimentados;
- las cinco decisiones abiertas;
- el contrato funcional de Wisdom/Genesis.

## Orden de implementación

```text
1. Contrato HTTP de actualización
2. Poll ejecutable en Batcave
3. Full-loop local 200 → descarga → 304
4. Bridge local Batcave → Nucleus → Metamorph
5. Handshake autenticado
6. Operaciones Wisdom publish/discover/adopt
7. Push y recovery
```

La regla arquitectónica central es:

> Actualización operativa y Wisdom comparten identidad y transporte, pero no comparten endpoints, payloads, estados, scopes ni responsabilidades.

---

*Referencia cruzada: `CODEX_Backend_Batcave_Status_v0_1.md` (status previo de scope, mismo directorio), `Backend_Batcave_Nucleus_Identidad_y_Comunicacion_v0_1.md` (diseño de identidad de este cowork que dio origen a este contrato), `Mandate_Server_Compatibilidad_Gravity_Introduccion_v0_1.md` (docs/ANAYSIS/BACKEND/GRAVITY — primer tema de frontera abierto en este cowork tras este corte).*
