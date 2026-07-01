# BLOOM — Mandate Package Spec v1.0.0

**Tipo:** RFC / Design Specification
**Estado:** Línea base — sesión de diseño activa
**Fecha:** 2026-06-30
**Dominio:** Nucleus · Marketplace · Portabilidad Cognitiva
**Depende de:** `BLOOM_Mandate_Universal_Schema_v1_0_0.md` (Bloques 0–3) · `BLOOM_Gene_Intent_Gen_Spec_v1_0_0.md` · `The_Mandate_Knowledge_Model.md`
**Extiende:** `BLOOM_Mandate_Universal_Schema_v1_0_0.md` como **Bloque 4 — Manifiesto de Empaquetado**

---

## Principio rector

> Un Mandate firmado es un contrato local. Un Mandate Package es ese mismo conocimiento, despojado de toda identidad local, capaz de rearraigar en cualquier Nucleus que hable el mismo protocolo cognitivo.

El Mandate Package **no es un nuevo tipo de Mandate**. Es una proyección de exportación del mismo contrato universal definido en `BLOOM_Mandate_Universal_Schema_v1_0_0.md`, sometida a un proceso de desacople, empaquetado y verificación antes de salir del Nucleus de origen, y a un proceso simétrico de resolución y rearraigo al entrar al Nucleus de destino.

Todo Mandate Package se rige por una regla no negociable heredada del BTIPS §7:

> Un Mandate publicado en el marketplace nunca puede asumir acceso a recursos propietarios del vendor. Solo puede asumir que el Nucleus del comprador tiene los tipos de intent necesarios y los datos que el comprador decide proveer.

---

## Reglas de invariancia de este schema

Continúan la numeración de `BLOOM_Mandate_Universal_Schema_v1_0_0.md` (I-1 a I-6).

| # | Invariante |
|---|---|
| I-7 | Ningún Mandate Package puede contener `projectId` u `organizationId` literales. Todo campo de identidad local se reemplaza por un token de inyección dinámica. Un paquete que contenga un UUID de proyecto u organización en cualquier nivel de anidamiento es un paquete inválido — el export debe fallar, no sanitizar en silencio. |
| I-8 | `dependencies.genes[]` (referencias por `geneId` local) **no puede viajar en un Mandate Package**. Todo requerimiento de Gene se expresa exclusivamente como `gene_blueprint`. Un Mandate con `dependencies.genes[]` no vacío al momento de exportar es un Mandate no portable — el `compliance.linter` debe bloquear el export. |
| I-9 | Todo vector incluido en `embeddings.json` viaja junto con el `sourceText` que lo originó y el `model` que lo generó. Un vector sin su terna `(vector, sourceText, model)` completa es un vector inválido para importación. |
| I-10 | La resolución semántica de Genes en destino usa la **misma función de matching** que `linkReusableGenes` del Pipeline de Firma Cognitiva en origen (ver `BLOOM_Mandate_Universal_Schema_v1_0_0.md` §4). No existen dos implementaciones de matching. Existe una función parametrizable por `chromaCollection` de origen (local vs. importado). |
| I-11 | Una discrepancia de modelo de embedding entre paquete y Nucleus local **nunca es una condición de fallo de instalación**. Es una condición de re-vectorización diferida. El Mandate importado bajo esta condición transiciona a `pending_cognitive`, nunca a `failed`. |
| I-12 | Todo Mandate Package debe traer un hash de integridad firmado por el Nucleus de origen. El Nucleus de destino verifica ese hash antes de ejecutar cualquier hidratación cognitiva (inyección de vectores en ChromaDB local). Un paquete con hash inválido o ausente se rechaza antes de tocar el ChromaDB local. |

---

## 1. Anatomía del Mandate Package

Formato de distribución: archivo comprimido (`.zip` / `.bundle`), un directorio raíz por paquete.

```
{mandate-slug}-{mandateVersion}.mandate-package/
│
├── manifest.json                    ← metadata del paquete en sí (no del Mandate)
├── mandate.json                     ← contrato agnóstico (Operational + Cognitive, sin IDs locales)
├── compliance.linter.json           ← reporte de sanitización firmado, generado en el export
│
├── cognitive_assets/
│   ├── embeddings.json              ← vectores híbridos: vector + sourceText + model
│   └── gene_blueprints/
│       ├── {blueprint-slug}.json    ← un blueprint por Gene requerido
│       └── ...
│
└── integrity/
    ├── checksum.sha256              ← hash del contenido del paquete
    └── signature.json               ← firma de la organización de origen sobre el checksum
```

Ningún otro artefacto puede viajar en el paquete. En particular: **no viaja** `mandate_state.json` (es historial de ejecución local, ver §7), **no viaja** ningún `gen_state.json` real, **no viajan** paths absolutos de filesystem.

---

## 2. `manifest.json` — Metadata del paquete

Distinto de `mandate.json`: describe el paquete como artefacto de distribución, no el contrato en sí.

```json
{
  "packageFormatVersion": "1.0.0",
  "mandateSlug":           "string  — nombre publicable, kebab-case. Ej: 'soc2-audit-prep'",
  "mandateVersion":        "string  — semver, copiado de mandate.json.mandateVersion",
  "publishedBy": {
    "organizationName":    "string  — nombre público del publisher. NUNCA organizationId.",
    "publisherKeyRef":     "string  — referencia a la clave pública usada para firmar (ver §6)"
  },
  "publishedAt":           "string  — ISO 8601",
  "requiredIntentTypes":   ["string  — subconjunto de 'dev' | 'doc' | 'gen' | 'cor' | 'exp' que el Nucleus comprador debe soportar"],
  "requiredSchemaVersion": "string  — mínima versión de BLOOM_Mandate_Universal_Schema compatible",
  "geneBlueprintCount":    "number  — cantidad de archivos en cognitive_assets/gene_blueprints/",
  "packageSizeBytes":      "number"
}
```

`requiredIntentTypes` es lo único que el Nucleus comprador puede exigirse a sí mismo respetar antes de intentar instalar — es la única precondición de compatibilidad operativa declarada.

---

## 3. `mandate.json` — Contrato agnóstico (Bloque 0 dinámico)

### 3.1 Tokens de inyección dinámica

Al exportar, el Nucleus de origen **elimina** los valores reales de `projectId` y `organizationId` y los reemplaza por tokens estandarizados. Estos tokens son el contrato explícito entre el paquete y el proceso de `rebind` del Conductor comprador — no son placeholders informales, son parte del schema.

| Campo en `mandate.json` (instancia local) | Campo en Mandate Package |
|---|---|
| `"projectId": "a1b2c3d4-..."` | `"projectId": "{{NUCLEUS_DEPLOYMENT_PROJECT}}"` |
| `"organizationId": "e5f6g7h8-..."` | `"organizationId": "{{NUCLEUS_DEPLOYMENT_ORG}}"` |
| `"mandateId": "..."` | `"mandateId": "{{NUCLEUS_DEPLOYMENT_MANDATE_ID}}"` |
| `"signedAt": "2026-06-18T..."` | `"signedAt": null` — un paquete nunca viaja firmado; se firma de nuevo en destino |

**Regla de barrido completo (I-7):** el proceso de export no solo limpia el Bloque 0. Debe recorrer recursivamente:

- `operational.payloads[].data` — cualquier string que matchee el patrón de un UUID de proyecto/organización local, o cualquier path absoluto de filesystem, aborta el export.
- `cognitive.cognitiveProfile.relations.*` — cualquier `mandateId` o `geneId` que no esté declarado como `gene_blueprint` correspondiente, aborta el export.
- `cognitive.similarMandates[]` y `cognitive.linkedGenes[]` — **se eliminan por completo al exportar**. Son resultados de búsqueda local del Nucleus de origen; no tienen validez ni sentido en el Nucleus de destino, que hará su propia búsqueda al importar (§5).

### 3.2 Reemplazo de `dependencies.genes[]` por Gene Blueprints (I-8)

```
ANTES (instancia local, no exportable):
"dependencies": {
  "mandates": ["mandateId-local-1"],
  "genes":    ["geneId-local-a1b2c3"]      ← PROHIBIDO en el paquete
}

DESPUÉS (Mandate Package):
"dependencies": {
  "mandates":       ["{{slug}} referencias a otros Mandate Packages, ver §7"],
  "geneBlueprints": ["auth-validator", "token-lifecycle-manager"]  ← slugs, resueltos vía cognitive_assets/gene_blueprints/
}
```

`dependencies.genes[]` **no existe** en la forma exportada del schema. El campo se renombra a `dependencies.geneBlueprints[]` y contiene únicamente slugs que referencian archivos dentro de `cognitive_assets/gene_blueprints/`.

---

## 4. `embeddings.json` — Vectores híbridos con failsafe (I-9, I-11)

### 4.1 Estructura

```json
{
  "packageEmbeddingModel": "string  — modelo usado por el vendedor. Ej: 'nomic-embed-text'",
  "packageEmbeddingDimensions": "number  — Ej: 768",
  "vectors": [
    {
      "sourceRef":   "string  — 'mandate.cognitive.semanticSummary' | 'geneBlueprint:{slug}'",
      "vector":      "number[]  — el array de floats crudo",
      "sourceText":  "string  — copia EXACTA del texto que generó este vector. Obligatorio, nunca null.",
      "model":       "string  — modelo puntual usado para este vector específico (permite mezclar mandates re-vectorizados parcialmente)",
      "dimensions":  "number"
    }
  ]
}
```

`sourceText` es **obligatorio en todo elemento** del array — no hay excepción. Es el único campo que garantiza que el conocimiento sea recuperable aunque el vector se descarte por completo.

### 4.2 Failsafe de compatibilidad de modelo — regla estricta

Al importar, antes de inyectar cualquier vector en el ChromaDB local, el Nucleus comprador ejecuta esta comparación por cada entrada de `vectors[]`:

```
PARA CADA entrada v EN embeddings.json.vectors:

  SI v.model == local_embedding_model Y v.dimensions == local_embedding_dimensions:
      → INYECTAR v.vector directamente en ChromaDB local
      → marcar sourceRef como { status: "hydrated", method: "direct_inject" }

  SI NO:
      → NO fallar. NO abortar la instalación del Mandate.
      → DESCARTAR v.vector (no se inyecta un vector incompatible)
      → ENCOLAR v.sourceText en la cola de re-vectorización del LLM local
      → marcar sourceRef como { status: "pending_reembed", method: "queued" }
      → SI sourceRef == "mandate.cognitive.semanticSummary":
            currentStatus del Mandate importado ← "pending_cognitive"
      → SI sourceRef == "geneBlueprint:{slug}":
            ese blueprint específico queda en estado "pending_reembed"
            (no bloquea la resolución de OTROS blueprints que sí matchearon)
```

**Consecuencia directa (I-11):** un Mandate importado con modelo de embedding incompatible **nunca llega a `failed`** por esa causa. Llega a `pending_cognitive` — el mismo estado que ya existe en la tabla de estados del Universal Schema (§3) para un Mandate en medio del Pipeline de Firma Cognitiva. Esto es intencional: importar un paquete con embeddings incompatibles es, en los hechos, equivalente a crear un Mandate nuevo cuyo perfil cognitivo todavía no terminó de generarse — el sistema ya sabe cómo esperar eso.

El worker de re-vectorización en background reutiliza exactamente el paso `generateSemanticSummaryAndEmbedding` del pipeline existente (`BLOOM_Mandate_Universal_Schema_v1_0_0.md` §4), aplicado sobre `sourceText` en vez de sobre un `semanticSummary` recién generado por Nucleus. El pipeline no distingue el origen del texto — solo lo vectoriza.

---

## 5. `gene_blueprints/` — Genes por intención, no por ID (I-8, I-10)

### 5.1 Estructura de un blueprint

```json
{
  "blueprintSlug":   "string  — identificador estable dentro del paquete. Ej: 'auth-validator'",
  "domain":          "string  — dominio semántico del Gene requerido. Ej: 'authentication'",
  "semanticIntent":  "string  — descripción de la capacidad esperada. Idéntica en espíritu a expectedGenes[].semanticIntent del schema universal.",
  "requiredCapabilities": [
    { "name": "string", "description": "string" }
  ],
  "embeddingRef":    "string  — sourceRef que apunta a la entrada correspondiente en embeddings.json (sourceRef: 'geneBlueprint:{slug}')",
  "minCohesionScore": "number  — 0.0–1.0. Umbral mínimo de similitud para considerar un match válido en destino. Default sugerido: 0.75",
  "fallback":        "enum  — 'create_new' | 'require_manual_review'  — comportamiento si no hay match suficiente"
}
```

Cada blueprint trae su propio vector de intención (referenciado vía `embeddingRef` → `embeddings.json`), no solo texto. Esto es lo que habilita una búsqueda de similitud real en destino en vez de un match por nombre o por texto plano.

### 5.2 Resolución en destino — misma función de matching que en origen (I-10)

El Universal Schema ya define, en el Pipeline de Firma Cognitiva, el paso `linkReusableGenes`: Brain consulta la colección `nucleus-genes` en ChromaDB y vincula Genes preexistentes por similitud semántica. El Mandate Package **reutiliza literalmente esa misma función**, parametrizada por el origen de la colección consultada:

```
FUNCIÓN resolveGeneBlueprint(blueprint, chromaCollection):

  1. vector ← obtener vector hidratado de blueprint.embeddingRef
     (si el vector está en estado "pending_reembed", esta función
      espera a que el worker de re-vectorización lo complete
      antes de ejecutar la query — no matchea contra un vector ausente)

  2. resultados ← chromaCollection.query(vector, topK=5)

  3. mejorMatch ← resultados[0]

  4. SI mejorMatch.similarity >= blueprint.minCohesionScore:
        → linkedGenes.push({
              geneId: mejorMatch.geneId,      ← geneId REAL del comprador, generado localmente
              relation: "reuses",
              linkedAt: now()
          })
        → blueprint.resolution ← "matched_existing"

  5. SI NO:
        SI blueprint.fallback == "create_new":
              → disparar creación de Gene nuevo en el Nucleus del comprador
                 usando blueprint.domain + blueprint.semanticIntent
                 como si fuera un expectedGenes[] de un Mandate nativo
              → blueprint.resolution ← "created_new"
        SI blueprint.fallback == "require_manual_review":
              → Mandate importado queda en estado que requiere
                 intervención humana antes de avanzar a 'ready_to_sign'
              → blueprint.resolution ← "pending_review"
```

En origen, esta misma función corre durante `linkReusableGenes` contra `chromaCollection = local ChromaDB` del vendedor. En destino, corre exactamente igual contra `chromaCollection = local ChromaDB del comprador`. **No hay una segunda implementación** — es la razón por la que el matching de blueprints no puede divergir semánticamente del matching nativo con el paso del tiempo.

---

## 6. `compliance.linter.json` — Reporte de sanitización firmado

No es un nombre de archivo simbólico: es un reporte estructurado, generado obligatoriamente en el momento del `export`, y verificado en el `import` antes de cualquier otro paso.

```json
{
  "linterVersion":     "string",
  "ranAt":             "string  — ISO 8601",
  "sourceOrganizationHash": "string  — hash de organizationId original, NO el ID en claro. Permite auditoría sin exponer identidad.",
  "checks": {
    "noLocalIdentifiers": {
      "passed": "boolean",
      "detail": "string  — si falló, qué campo y en qué path del JSON"
    },
    "noAbsoluteFilesystemPaths": {
      "passed": "boolean",
      "detail": "string"
    },
    "noHardGeneDependencies": {
      "passed": "boolean  — dependencies.genes[] debe estar ausente o vacío",
      "detail": "string"
    },
    "noEmbeddedSecrets": {
      "passed": "boolean  — escaneo de patrones de credenciales/tokens en todo string del paquete",
      "detail": "string"
    },
    "allVectorsHaveSourceText": {
      "passed": "boolean  — invariante I-9",
      "detail": "string"
    },
    "allBlueprintsHaveEmbeddingRef": {
      "passed": "boolean",
      "detail": "string"
    }
  },
  "overallResult": "enum  — 'pass' | 'fail'",
  "blockingFailures": ["string  — lista de checks que fallaron, si overallResult == 'fail'"]
}
```

**Regla de bloqueo:** si `overallResult == "fail"`, el paquete **no se genera**. El `export` termina con error antes de escribir el `.zip`. El linter no es un warning post-hoc — es un gate previo a la existencia física del paquete.

---

## 7. `integrity/` — Procedencia verificable (I-12)

Resuelve el punto de seguridad: no se puede inyectar vectores ajenos en un ChromaDB local sin verificar que el paquete no fue alterado ni es de origen no confiable.

```
checksum.sha256       → hash SHA-256 sobre el contenido concatenado de:
                         mandate.json + compliance.linter.json + embeddings.json
                         + todos los gene_blueprints/*.json, en orden determinístico

signature.json:
{
  "algorithm":       "string  — ej. 'ed25519'",
  "publisherKeyRef":  "string  — coincide con manifest.json.publishedBy.publisherKeyRef",
  "signatureValue":   "string  — firma sobre checksum.sha256",
  "signedAt":         "string  — ISO 8601"
}
```

**Regla de verificación en destino (obligatoria, orden fijo):**

```
1. Recalcular checksum.sha256 sobre el contenido descargado
2. Verificar que coincide con integrity/checksum.sha256
   → si NO coincide: RECHAZAR el paquete. No se abre ningún otro archivo.
3. Verificar integrity/signature.json contra la clave pública del publisher
   → si la firma no valida: RECHAZAR el paquete.
4. Solo si ambos pasos son exitosos: proceder a §8 (flujo de importación)
```

Ningún archivo del paquete se lee con propósito de hidratación cognitiva antes de completar esta verificación.

---

## 8. Flujo de exportación (`nucleus mandate publish`)

```
nucleus mandate publish {mandateId} --target marketplace
  │
  ├─→ 1. Verificar que mandate.currentStatus == 'completed'
  │      (solo Mandates que ejecutaron con éxito al menos una vez son publicables
  │       — evita publicar contratos no probados)
  │
  ├─→ 2. Construir mandate.json agnóstico (§3)
  │      • strip projectId, organizationId, mandateId → tokens
  │      • strip similarMandates[], linkedGenes[] (resultados locales, no portables)
  │      • convertir dependencies.genes[] → dependencies.geneBlueprints[] (§3.2)
  │
  ├─→ 3. Generar cognitive_assets/embeddings.json (§4)
  │      • extraer vector + sourceText + model de cognitive.embedding
  │      • por cada Gene vinculado, extraer su vector de intención
  │
  ├─→ 4. Generar cognitive_assets/gene_blueprints/*.json (§5)
  │      • uno por cada entrada resuelta en dependencies.geneBlueprints[]
  │
  ├─→ 5. Ejecutar compliance.linter (§6)
  │      → SI overallResult == 'fail': ABORTAR. Retornar blockingFailures al usuario.
  │      → SI overallResult == 'pass': continuar
  │
  ├─→ 6. Calcular checksum.sha256 y firmar (§7)
  │
  └─→ 7. Empaquetar .zip, retornar al usuario el path del Mandate Package
```

---

## 9. Flujo de importación (`nucleus mandate install`)

```
nucleus mandate install {package.zip} --project {targetProjectId}
  │
  ├─→ 1. Verificación de integridad (§7) — bloqueante
  │
  ├─→ 2. Verificar manifest.requiredIntentTypes ⊆ intent types soportados localmente
  │      → si falta algún tipo: RECHAZAR con mensaje explícito
  │
  ├─→ 3. Rebind de identidad (I-7)
  │      • {{NUCLEUS_DEPLOYMENT_PROJECT}} ← targetProjectId real
  │      • {{NUCLEUS_DEPLOYMENT_ORG}}     ← organizationId real del comprador
  │      • {{NUCLEUS_DEPLOYMENT_MANDATE_ID}} ← nuevo UUID generado localmente
  │      • mandate.currentStatus ← 'draft'
  │
  ├─→ 4. Hidratación cognitiva de vectores (§4.2 — failsafe)
  │      • por cada entrada en embeddings.json: comparar modelo, inyectar o encolar
  │      • SI hubo al menos un 'pending_reembed' sobre semanticSummary:
  │            mandate.currentStatus ← 'pending_cognitive'
  │
  ├─→ 5. Resolución de Gene Blueprints (§5.2)
  │      • por cada blueprint: resolveGeneBlueprint(blueprint, chromaCollection: local)
  │      • popular cognitive.linkedGenes[] con geneIds REALES del comprador
  │
  ├─→ 6. Resolución de dependencias Mandate → Mandate (si dependencies.mandates[] no vacío)
  │      • verificar que cada Mandate dependencia ya esté instalado y 'completed' localmente
  │      • si falta alguno: instalación queda 'blocked_on_dependency', no falla —
  │        el Conductor debe ofrecer instalar la cadena de dependencias
  │
  └─→ 7. SI todo resuelto Y currentStatus no quedó en 'pending_cognitive':
            → avanzar a 'ready_to_sign'
            → Nucleus firma localmente (signedAt ← now())
            → currentStatus ← 'signed'
         SI quedó en 'pending_cognitive':
            → el Mandate existe en el sistema, visible, pero no ejecutable
              hasta que el worker de re-vectorización complete y
              el pipeline de firma cognitiva corra de punta a punta localmente
```

---

## 10. Extensión de la tabla de estados

Se agregan dos estados a la tabla definida en `BLOOM_Mandate_Universal_Schema_v1_0_0.md` §3, exclusivos del ciclo de importación:

| Status | Descripción | Quién lo setea |
|---|---|---|
| `importing` | Paquete verificado, en proceso de rebind e hidratación. Transitorio. | Nucleus al iniciar `mandate install` |
| `blocked_on_dependency` | Instalación detenida porque una dependencia (`dependencies.mandates[]`) no está resuelta localmente. No es un fallo — es una espera explícita. | Nucleus durante paso 6 de §9 |

`pending_cognitive` no es un estado nuevo — es el mismo que ya existe en el schema universal, alcanzado ahora también por la vía de importación con embeddings incompatibles (I-11), no solo por la creación nativa de un Mandate.

---

## 11. Qué NO viaja en el paquete — límite explícito

| Artefacto | Razón de exclusión |
|---|---|
| `mandate_state.json` completo | Es historial de ejecución del Nucleus de origen. `cognitiveEvolution.geneEvents[]` pertenece a esa instancia, no es transferible como "verdad" para el comprador. |
| `cognitive.similarMandates[]` | Resultado de búsqueda contra el ChromaDB del vendedor. Sin sentido en destino — el comprador genera el suyo al importar. |
| `cognitive.linkedGenes[]` (con geneIds reales) | Los `geneId` son locales al vendedor. Se reconstruyen en destino vía `gene_blueprints/` (§5). |
| `dependencies.genes[]` (forma con IDs) | Prohibido por I-8. Reemplazado por `dependencies.geneBlueprints[]`. |
| Cualquier campo de `operational.payloads[].data` con path absoluto o credencial | Bloqueado por `compliance.linter` (§6). |
| `signedAt` con valor real | Un paquete nunca viaja firmado — la firma es un acto local, no transferible (§3.1). |

---

## 12. Pendientes abiertos

| # | Pendiente | Bloqueante para |
|---|---|---|
| P-1 | Formato exacto de `publisherKeyRef` y mecanismo de distribución/verificación de claves públicas de organizaciones (¿registry centralizado del marketplace? ¿web-of-trust?) | Implementar §7 en producción |
| P-2 | Política de versionado del propio `packageFormatVersion` — qué pasa si un comprador con Nucleus viejo intenta instalar un paquete de formato más nuevo | Compatibilidad hacia atrás del marketplace |
| P-3 | Definir si `dependencies.mandates[]` puede apuntar a otro Mandate Package **no publicado** (privado, mismo autor) — implica un modelo de "bundles" de Mandates relacionados | Casos de Mandates compuestos complejos |
| P-4 | Definir el tamaño máximo razonable de `embeddings.json` cuando un Mandate vincula muchos Genes — ¿hay un umbral donde conviene forzar re-embed en destino en vez de transportar el vector? | Performance de distribución a escala |
| P-5 | Confirmar contra `BLOOM_Gene_Intent_Gen_Spec_v1_0_0.md` si `gen.json` define campos adicionales de identidad de Gene que este documento debería reflejar en `gene_blueprints/` | Cierre completo de §5 |

---

*Fin del documento — v1.0.0 — Esqueleto inicial. Extiende BLOOM_Mandate_Universal_Schema_v1_0_0.md como Bloque 4.*
