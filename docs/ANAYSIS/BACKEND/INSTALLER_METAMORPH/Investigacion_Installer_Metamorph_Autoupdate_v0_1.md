# Installer/Metamorph — Investigación de Auto-actualización y Versionado (v0.1)

**Tipo:** Investigación pura (no propone implementación) — insumo conceptual para el cowork Cloud, separado de los works operativos BACKEND/BATCAVE que corren en Codex.
**Estado:** Borrador v0.1
**Fecha:** 2026-08-29
**Encargo explícito de Jose:** *"El instalador va a ser clave [...] Metamorph va a ser clave en que cada cosa que se actualice de ese sistema sea de manera automática, de manera tal que no haya que pedirle al desarrollador o al ingeniero que actualice, actualice, actualice. Simplemente le dará OK a una ventana y se actualizará solo el sistema. Eso va a permitir que cosas de urgencia, como Ion Pump o cambios en cualquiera de las aplicaciones, se puedan hacer rápidamente. [...] Metamorph tiene que estar muy aceitado en cada versión que está local y cada versión que está en el servidor de disponibilidad y cómo van a ser las notificaciones de actualizaciones."*
**Método:** agente de investigación con lectura completa de 9 documentos/archivos núcleo y consulta dirigida (grep + lectura parcial) sobre ~25 documentos y archivos de código adicionales, todos provistos por Jose. Cero implementación propuesta; toda afirmación está citada contra archivo y sección/línea.
**Nota de fuentes:** los documentos de `docs/BACKEND/` no existen en el repo local subido a este work — viven en el Project de claude.ai bajo `ANAYSIS/CLOUDFLARE/`; se leyeron desde ahí.

---

## 1. ¿Existen ya "Sovereign" y "Paladin" como paquetes distribuibles concretos?

🟡 **Parcial** — existen como concepto de producto/gobernanza documentado (`PALADIN_FOUNDATION_AND_PRELIMINARY_ROADMAP_v0_1.md`, autoridad José Vigil, 2026-08-26), no como artefacto, build target o manifest real. El propio documento fundacional se declara **fase P0 de un roadmap de 6 fases (P0–P6)** y aclara explícitamente en su header que "no autoriza implementación ni cierra las decisiones marcadas como abiertas". Grep exhaustivo (`Sovereign|Paladin`) sobre todo el repo no encuentra ningún build target, manifest o flag `--only sovereign`/`--only paladin` en ningún componente real — el catálogo real de componentes (`rollout.go`) solo lista binarios concretos (brain, nucleus, sentinel, host, workspace, setup, sensor, cortex, ionpump, vsix, bootstrap, hooks, config, nssm, ollama, temporal, node, runtime, chrome, batcave).

**Implicancia:** diseñar un backend de distribución "para el ciclo Sovereign/Paladin" hoy anticiparía decisiones de producto que el propio documento fundacional deja abiertas (12 preguntas de gobernanza en su §13). El orden correcto es esperar esas respuestas.

---

## 2. Pipeline real builder → publicado → backend → Batcave → Metamorph

🟡 **Mixto** — cada tramo existe con distinto grado de madurez; el pipeline completo NO está armado de punta a punta.

| Tramo | Estado | Evidencia |
|---|---|---|
| Build local (`build-all.py`) | ✅ real, funcionando | `BUILD_ALL_Documentacion_v1_0.md` §2-§6 — compila y despliega en la misma máquina, sin publicar a ningún backend |
| `metamorph rollout` genérico | ✅ real, pero local | `rollout.go` (`runRollout`) copia desde `installer/native/bin/` a `AppData/bin/` — sin descarga remota en ningún punto; `net/http` solo se usa para health-check local |
| Ion recipes (bootstrap) | ✅ real | `manifest.go`/`reconcile.go` — pipeline de bootstrap embebido en el instalador, no de actualización remota |
| Backend Cloudflare → Batcave | 🟡 en construcción activa | Confirmado por `CODEX_Backend_Batcave_Status_v0_1.md`: dos works de Codex construyendo ahora mismo el loop mínimo (manifest + ETag + descarga R2). La validación conjunta de 7 pasos todavía no está confirmada como corrida. |
| **Batcave → Metamorph** | ❌ **el eslabón que falta, documentado como bloqueado en 3 fuentes independientes** | `IONSITE_DEPLOY_GUIDE.md` ("Phase 6b — futuro, bloqueado"); `IONPUMP_IMPLEMENTATION_PROMPT_v2.md` ("⛔ Blocked until Bartcave server exists"); `SYNAPSE_PROTOCOL_MASTER_v3.md` ("Bloqueado — [...] Copia manual mientras tanto") |

El campo `DownloadURL` existe en `IonManifest` (`manifest.go`) pero su consumo real vive en un paquete (`internal/inspection`) no incluido en la investigación — no se pudo confirmar si Metamorph mismo lo descarga (violaría "nunca toca internet") o si espera el archivo ya staged localmente por otro proceso.

**Hoy, en la práctica**, la única vía confirmada de que un `.ion` llegue a destino es bootstrap embebido o copia manual.

---

## 3. Version tracking local vs. servidor

🟡 **Existe, pero solo para ion recipes — no escala hoy a "toda la app".**

- **Ion recipes (✅ real y sofisticado):** `_meta/versions.json` (`VersionsFile{schema_version, sites, last_updated}`, cada `VersionEntry` con `version, sha256, deployed_at, source, backup_available, swap_count, status`), confirmado en código (`rollback.go`, `manifest.go`, `reconcile.go`) — incluye crash recovery basado en este mismo archivo.
- **Batcave como componente (🟡 real, mecanismo distinto):** `artifact-manifest.json` con comparación estricta `Build`/`Version` antes de dar por exitoso el rollout (`rollout_batcave.go`) — específico de ese artefacto.
- **Componentes binarios genéricos (❌ no existe):** `deployedEntry.Version/Build` está `omitempty` y solo se puebla en el camino Batcave — para brain/host/sentinel/nucleus/workspace/setup/sensor el rollout es `copyFile`/`copyDir` puro, sin versión, sin hash, sin comparación antes/después.

**Implicancia:** escalar el tracking de versión a toda la app requiere construir un `versions.json`-equivalente genérico. No existe ni como diseño documentado más allá del schema `releases`/`downloadRules` del backend (que modela versión del lado servidor, pero no define cómo Metamorph compararía eso contra su propio estado local para esos componentes).

---

## 4. Ventana de aprobación / UX de "un solo OK"

❌ **No existe ningún diseño, ni a nivel de documento.**

Metamorph es, en toda la documentación revisada, una herramienta 100% CLI (`METAMORPH_COMANDOS.md`, `metamorph_rollout_prompt.md`) — invocada manualmente o encadenada desde `build-all.py`. No hay ningún concepto de canal/prioridad "urgente" vs. "normal" — el único "canal" que existe es `channel: stable|beta` en el schema D1 del backend, que es de *estabilidad de release*, no de *urgencia*, y no tiene consumidor implementado del lado de Metamorph.

Lo más cercano reutilizable: `BATCAVE_ARCHITECTURE.md` §9.7 ya describe "Aprobación de acciones: recibir una notificación de que un intent `cor` requiere decisión humana y resolverlo desde la app [mobile]" vía WebSocket/BlindJudge/RelayEngine — mecanismo real, pero para gobernanza de intents, no para actualizaciones de sistema. Podría eventualmente reutilizarse como transporte, pero eso es diseño nuevo.

---

## 5. Notificaciones de actualización

🟡 **Solo lo ya cubierto por el diseño de BACKEND — nada más en el ecosistema resuelve esto.**

El mecanismo confirmado hoy es poll periódico con ETag/If-None-Match (cadencia todavía sin definir). El canal push (Durable Objects + WebSocket Hibernation) está diseñado en detalle en `Backend_Batcave_Nucleus_Identidad_y_Comunicacion_v0_1.md` pero **explícitamente fuera de alcance de los works actuales de Codex** (`CODEX_Backend_Batcave_Status_v0_1.md`) — es diseño, no código. Synapse (Brain↔Cortex/Chrome) y Cortex/AUTHORITY_BOUNDARY confirman ser dominios completamente ortogonales (automatización de navegador), sin ningún indicio de haberse considerado como canal de distribución de actualizaciones.

---

## 6. Rollback y atomicidad — ¿exclusivo de ion recipes?

✅ **Confirmado: sí, exclusivo de ion recipes y del artefacto Batcave.**

- **Ion recipes:** patrón completo — staging, verificación SHA-256, swap atómico (dos renames), backup, comando `rollback` explícito, crash recovery contra `versions.json`.
- **Batcave:** patrón equivalente e independiente — staging, verificación por archivo, backup automático antes de instalar, rollback en cualquier fallo, recuperación de residuos huérfanos tras crash.
- **Resto de componentes:** `RestoreOnFailure` **no es rollback de archivos** — solo reintenta el reinicio del servicio. Sin staging, sin hash, sin backup dir, sin comando rollback.

El propio `PALADIN_FOUNDATION...` §8 marca "Composición híbrida tras fallo" como riesgo **Crítico** con mitigación ("journal durable, rollback") listada como trabajo futuro, no presente.

---

## 7. Organización/ownership — aislamiento entre organizaciones

✅ **Sólido a nivel local; 🟡 pendiente a nivel del canal remoto nuevo.**

`rollout_batcave.go` (`validateBatcaveOrganization`) implementa una cadena real de verificaciones: slug de organización válido, `.ownership.json` existente y estructuralmente válido, `.nucleus-config.json` con el mismo slug, path resuelto coincidente, y protección contra path traversal (`requireContainedPath`). Los invariantes `INVARIANT-ORG-001` a `008` (`BATCAVE_ARCHITECTURE.md`) refuerzan esto.

**Gap real confirmado:** `GOVERNANCE_OWNERSHIP_SPEC_v1_0.md` §4 documenta, contra código real, que `.ownership.json` **no se genera en ningún flujo automático** — solo vía `nucleus init` manual. El `organization_fingerprint`, clave primaria del backend nuevo, depende de un archivo que hoy no se crea de forma confiable.

El aislamiento del canal remoto backend↔Batcave sigue pendiente de las 5 decisiones abiertas ya conocidas (`Backend_Batcave_Nucleus_Identidad_y_Comunicacion_v0_1.md` §11).

---

## 8. Synapse/Cortex — ¿mecanismo alternativo de "orden remota"?

❌ **No compite ni complementa — dominio completamente distinto.**

Synapse es el protocolo de comunicación Brain↔Cortex (extensión Chrome) para automatización de navegador — confirmado por su propio changelog. La única intersección encontrada es negativa: `SYNAPSE_PROTOCOL_MASTER_v3.md` también menciona (cuarta fuente independiente) el bloqueo de "Metamorph reconcile", pero no propone a Synapse como solución.

---

## Tabla de gaps y bloqueadores

| # | Gap/bloqueador | Por qué bloquea el diseño |
|---|---|---|
| 1 | No existe el eslabón Batcave→Metamorph | Aunque Backend→Batcave se termine, sigue sin definirse cómo Batcave entrega el manifest/ZIP a Metamorph en la misma máquina |
| 2 | `DownloadURL` en `IonManifest` sin implementación confirmada | No se puede confirmar si el invariante "Metamorph nunca toca internet" se mantiene también en este campo |
| 3 | Version tracking no escala a binarios genéricos | Sin esto, el backend no tiene con qué comparar "qué tiene instalado el ingeniero" para brain/host/sentinel/etc. |
| 4 | Rollback/atomicidad no existe para binarios genéricos | Riesgo "Crítico" ya señalado por `PALADIN_FOUNDATION...` sin mitigación construida |
| 5 | Cero UX de aprobación / "un solo OK" | Requerimiento central de negocio de Jose, sin ni un borrador de diseño |
| 6 | Sin concepto de urgencia/prioridad de actualización | El pedido de Jose sobre IonPump/urgencias no tiene campo, cola ni fast-path diseñado |
| 7 | Canal push Backend↔Batcave con 5 decisiones abiertas | Sin cerrarlas no hay notificación push real, solo poll |
| 8 | `.ownership.json` no se genera automáticamente | El `organization_fingerprint` depende de un archivo que requiere un comando manual |
| 9 | Sovereign/Paladin: fase P0 de 6, sin contrato de composición | Diseñar distribución "para el ciclo Sovereign/Paladin" anticiparía 12 preguntas de gobernanza todavía abiertas |
| 10 | Pipeline de build de Batcave con dos mecanismos documentados en conflicto | `deploy_batcave.py` (legacy, git-per-org) vs. `build_batcave.mjs`+`rollout_batcave.go` (vigente) — confirmar cuál es el real antes de documentarlo |

---

*Fin de la investigación v0.1. No propone implementación — insumo para decidir cómo continuar el diseño conceptual del backend de distribución más allá de ion recipes.*
