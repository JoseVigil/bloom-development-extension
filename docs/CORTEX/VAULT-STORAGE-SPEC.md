# VAULT-STORAGE-SPEC.md
**Security & Identity Spec · v1.0**

---

## 0. Alcance

Este documento cubre exclusivamente gestión de secretos, cifrado y alcance por usuario:

- Cada API key vive **aislada por usuario**, nunca en un pool o vault compartido entre componentes del sistema.
- Los tokens de GitHub para autenticación de usuario y para operaciones sobre repos/org están **separados**, cada uno con su propio scope mínimo.
- La extensión de Chrome nunca descifra ni maneja API keys en texto plano.

---

## 1. Gestión de Credenciales — User-Scoped Storage

### 1.1 Diagnóstico

El modelo actual centraliza API keys de múltiples usuarios y múltiples proveedores en un vault compartido (`Vault.go`), consumido por un componente separado (`Brain`) que decide su uso después de la captura. Esto crea:

- Un único punto de fallo con alto blast radius (compromiso del vault = compromiso de credenciales de todos los usuarios, todos los proveedores).
- Desacople entre "cuándo el usuario autorizó" y "cuándo la key se usa" — el uso posterior no es necesariamente visible ni auditable por el usuario en el momento.
- Ambigüedad de responsabilidad: si `Brain` puede usar la key de cualquier usuario en cualquier momento, no hay un límite claro de qué constituye "uso autorizado".

### 1.2 Arquitectura propuesta

**Principio: 1 usuario → N keys propias → cada key cifrada y direccionable solo por su dueño.**

```
┌─────────────────────────────────────────────────────────┐
│  Discovery/Landing (captura)                             │
│  Usuario pega key → POST /keys/register                  │
└───────────────────────┬───────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────┐
│  Encryption Service (por request, sin estado propio)     │
│  - Deriva DEK con KMS local o AEAD                        │
│  - Cifra key con AES-256-GCM                               │
│  - Descarta plaintext de memoria inmediatamente            │
└───────────────────────┬───────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────┐
│  Store cifrado (por usuario)                              │
│  Key: {user_id}:{provider}:{key_id}                        │
│  Value: ciphertext + nonce + metadata (no plaintext nunca) │
└───────────────────────┬───────────────────────────────────┘
                         ▼ (solo en runtime, scoped a la request)
┌─────────────────────────────────────────────────────────┐
│  Runtime de ejecución                                      │
│  - Descifra 1 key, para 1 usuario, para 1 llamada API       │
│  - Usa el SDK oficial del proveedor                         │
│  - Plaintext vive solo en memoria del proceso, nunca en log │
└─────────────────────────────────────────────────────────┘
```

> **Nota de alcance:** qué hace el runtime con la key descifrada (qué SDK invoca, cómo transporta la respuesta) es responsabilidad de `PROVIDER-EXECUTION-SPEC.md`. Este documento solo especifica la ruta de captura, cifrado y acceso.

### 1.3 Especificación técnica

| Elemento | Especificación |
|---|---|
| Algoritmo | AES-256-GCM (AEAD) — autenticidad + confidencialidad en una operación |
| Derivación de clave | KMS local del SO (Keychain en macOS, DPAPI en Windows, Secret Service en Linux) o KMS cloud si el backend corre remoto (AWS KMS / GCP KMS) — nunca una clave hardcodeada o derivada solo de un secreto de app |
| Namespacing | `{user_id}:{provider}:{key_id}` — nunca una tabla plana compartida entre usuarios |
| Acceso | El componente que descifra debe recibir `user_id` de la sesión autenticada, no de un parámetro que el llamador controle |
| Logging | Prohibido loguear plaintext de key en cualquier nivel (debug incluido). Loguear solo `key_id` y `provider` |
| Rotación | Cada key tiene `created_at`; el usuario puede revocar/reemplazar desde su panel sin tocar keys de otros usuarios ni requerir downtime del sistema |
| Borrado | Al desconectar un proveedor, `DELETE` real del ciphertext — no soft-delete que deje el secreto recuperable |

### 1.4 Flujo captura → uso

1. Usuario pega key en Discovery/Landing (sin cambio de UX respecto al modelo actual — la fricción para el usuario es la misma).
2. Backend valida el formato de la key contra el proveedor (ej. `GET /v1/models` con la key, para confirmar que es válida antes de guardarla).
3. Se cifra y persiste con el namespacing de §1.3.
4. En cada uso posterior, el componente que necesita la key la pide al store para **ese usuario específico**, la descifra en memoria, y descarta el plaintext al terminar la request.
5. No existe un "modo batch" donde un componente central itere sobre keys de múltiples usuarios sin que cada uso corresponda a una acción explícita de ese usuario.

---

## 2. Separación de Tokens — GitHub App & Batcave

### 2.1 Diagnóstico

El token obtenido vía Device Flow para la GitHub App (scopes: `Contents: Read & write`, `Administration: Read & write`, `Members: Read-only`) se reutilizaba también para configurar Batcave, el control plane remoto en Codespaces. Un solo token cubriendo dos propósitos distintos amplía el blast radius: si se compromete el canal de Batcave, se compromete también push/create-repo sobre la org.

### 2.2 Solución propuesta

Dos aplicaciones registradas por separado:

| App | Propósito | Scopes |
|---|---|---|
| **GitHub App "Repo Ops"** | Push, clone, create repo, verificación de membresía de org | `Contents: Read & write`, `Administration: Read & write`, `Members: Read-only` |
| **GitHub OAuth App "Batcave Auth"** | Autenticación del usuario contra Batcave (Codespaces) | Mínimo necesario para identificar al usuario y confirmar acceso al Codespace — sin `Contents` ni `Administration` |

### 2.3 Documentación y almacenamiento

- Cada token vive bajo su propio `key_id` en el store cifrado de §1: `{user_id}:github:repo_ops` y `{user_id}:github:batcave_auth` — nunca bajo la misma clave.
- Rotación y revocación son independientes: revocar el acceso a Batcave no debe invalidar el token de `Repo Ops`, y viceversa.
- En `BTIPS-BATCAVE-GITHUB-APP-PLAN.md` y en el handoff, reemplazar cualquier referencia a "el token de GitHub App" (singular, ambiguo) por el nombre específico de cada app y su propósito.
- El mensaje Synapse `GITHUB_APP_AUTHORIZED` debe llevar un campo `app` (`repo_ops` | `batcave_auth`) para que `resolveEvent()` no dependa de inferencia — mismo patrón de discriminación explícita que ya se aplicó para `ACCOUNT_REGISTERED` + `service`.

---

## 3. Rol de la Extensión de Chrome respecto de las Credenciales

**Regla:** la extensión de Chrome nunca descifra, transporta en plano, ni almacena API keys.

| Responsabilidad | Dónde vive | Justificación |
|---|---|---|
| Captura de la key en el campo de Discovery/Landing | Extensión de Chrome (UI) | Es la superficie donde el usuario interactúa |
| Envío de la key al backend vía canal cifrado (HTTPS) para su cifrado y persistencia | Extensión de Chrome → backend | La extensión es tránsito, no destino final del secreto |
| Cifrado, namespacing y almacenamiento (§1) | Backend local / runtime | El store cifrado vive fuera del proceso de la extensión |
| Descifrado y uso de la key | Backend local / runtime | Aislamiento de superficie: un bug o compromiso en la extensión no expone keys, porque la extensión nunca las tiene en texto plano fuera del envío inicial |

> El detalle de qué hace el backend con la key descifrada (a qué SDK la pasa, cómo arma la llamada) está fuera del alcance de este documento — ver `PROVIDER-EXECUTION-SPEC.md`.

---

## 4. Matriz de Remediación — Credenciales e Identidad

| Déficit actual | Arquitectura correcta | Módulo afectado | Impacto en fricción de usuario | Pasos para implementar |
|---|---|---|---|---|
| Vault multi-tenant compartido entre Brain y Cortex | Store cifrado user-scoped, namespacing `{user_id}:{provider}:{key_id}` | `Vault.go`, `background.js` (Discovery) | Ninguno — misma UX de captura | 1) Implementar cifrado AEAD real (hoy `Vault.go` es stub). 2) Namespacing por usuario. 3) Eliminar cualquier ruta de lectura que no filtre por `user_id` de sesión |
| Token único para Repo Ops + Batcave | Dos apps separadas, scopes mínimos, `key_id` independientes | GitHub App config, `discovery.schema.json`, `milestone-registry.js` | Un paso adicional de autorización la primera vez (aceptable, ocurre una sola vez en onboarding) | Ver §2.2–2.3 |
| Clipboard Monitor documentado como código muerto pero presente en BTIPS §11 | Eliminación física del código, no solo prohibición documental | `background.js` (funciones `startClipboardMonitoring`/etc.) | Ninguno — ya está deshabilitado en producto | Borrar las funciones del archivo, no solo la sección de la doc. Confirmar con `grep` que no queda ninguna referencia activa |
| `GITHUB_APP_AUTHORIZED` sin campo `service`/`app` discriminador | Discriminación explícita en el payload, igual que `ACCOUNT_REGISTERED` | `discovery.schema.json`, `milestone-registry.js` | Ninguno | Agregar campo `app` al payload y actualizar `resolveEvent()` para exigirlo |
| Extensión con capacidad de manejar keys en plano | Extensión como tránsito puro, nunca destino del secreto | `content.js`, `background.js` de la extensión | Ninguno | Auditar y remover cualquier ruta donde la key quede en memoria/storage local de la extensión más allá del envío inicial |

---

## 5. Orden de ejecución recomendado

1. **Fix de storage cifrado (§1)** — es la base de todo lo demás; nada se guarda en el vault viejo mientras esto no esté.
2. **Separación de tokens GitHub (§2)** — independiente del resto, se puede hacer en paralelo.
3. **Auditoría de la extensión (§3)** — confirmar que no queda ninguna ruta donde la key persista fuera del store cifrado.

---

*Ver `PROVIDER-EXECUTION-SPEC.md` para todo lo relativo a ejecución de inferencia, transporte y automatización local.*

*Documento de especificación técnica — v1.0*
