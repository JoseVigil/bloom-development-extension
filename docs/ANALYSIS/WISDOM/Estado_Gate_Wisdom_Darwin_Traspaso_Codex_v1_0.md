# Gate de Wisdom en Darwin: estado y traspaso a Codex v1.5 (cierre)

**Fecha:** 2026-10-21, 17:30 (Argentina). **Máquina:** Mac Intel (x86_64), checkout `~/repos/bloom-development-extension`.
**Decide José.** Codex no hace git, commit ni push.

---

## 1. Objetivo

Ver en Wisdom una oferta real de Mandate e instalarla **inactiva** en un proyecto elegido de forma explícita.

- **Debe producir:** 1 descarga, 1 recibo, 1 definición y 1 `mandate_state.json` con `status: installed`.
- **No debe producir:** `mandate.json`, workflows, aprobación, activación ni AITAP.
- **Contrato:** `ANALYSIS/WISDOM/Contrato_Oferta_Inicial_Wisdom_Mandate_v0_2.md`.

**La oferta sólo puede verse en G.** Hasta que en G se publique y habilite la oferta en el Backend desechable y se registre la identidad de la instalación separada, Wisdom muestra «Catálogo no disponible: installation_identity_unavailable». Ese es el estado previsto en E, no una falla.

---

## 2. Instalación separada

| Elemento | Valor |
|---|---|
| R | `~/bloom-isolated/wisdom-20261021-012631`, recreada el 21/10 después de la reinstalación |
| Organización y proyecto | `wisdom-gate` / `wisdom_gate_project`, sintéticos. El id real de la organización llega en G |
| Contención | `sandbox-exec` con `R/iso.sb`, entorno `R/iso-env` y directorio de trabajo dentro de R |

Los puertos 5173, 48215, 4124, 5678, 7233, 8233 y 11434 están fijos en el código. Por eso tus servicios se detienen mientras corre R y se restauran al final.

---

## 3. Fase E: cerrada con FAIL formal por interacción

José decidió el 21/10 no repetir E. El FAIL formal se debe a los pasos interactivos de pantalla, no al aislamiento.

### 3.1 Evidencia de aislamiento verificada en varias corridas

Corridas: `E-20261021-015821`, `021159`, `031943`, `045406` y `051615`.

| Control | Resultado |
|---|---|
| Huella habitual (sha256, tamaño y mtime de ~2.550 archivos: BloomNucleus, elias-repos, `~/.bloom`, Application Support, LaunchAgents y `backend/.wrangler`) | Idéntica en todas |
| Denegaciones del sandbox contra lo habitual | 0 accesos. La introspección de `lsof` (sólo metadata) se registra aparte, por decisión de José |
| Control positivo del sandbox y herencia a procesos hijos | Comprobados |
| Dueños de los puertos durante la corrida | Todos procesos de R |
| Watcher de R | Vigila su propio `.mandates`, con línea de log de la misma corrida |
| Navegación | Home ✓; Wisdom ✓ (`/wisdom`, «Catálogo no disponible: installation_identity_unavailable», el estado previsto); `/home` alcanzable (clic programático, `051615`) |

### 3.2 Por qué el FAIL es formal

- **`045406`:** el paso C leyó un Enter que ya estaba tipeado. Corregido: ahora se descarta la entrada previa.
- **`051615`:** José respondió `no` en los pasos B y C, aunque la URL ya era `/wisdom`.
- **`031943`:** la confirmación de Wisdom fue ambigua y el `finally` dejó procesos de R vivos.

### 3.3 Incidente del 21/10, corregido

En `031943` y `040727` el `finally` restauró tus servicios encima de procesos de R vivos (Temporal, Brain, Vite y npm). Tu Nucleus quedó conectado al Temporal de R entre las 03:46 y las 04:50.

`recover-from-R.sh` cerró sólo los procesos de R. Quedó RECUPERADO en `~/bloom-isolated/recovery-20261021-044959`: inventario sin huérfanos y cada puerto en manos de la instalación habitual.

Cambios en el `finally`:
- identifica los procesos de R por comando, ejecutable y cwd de `npm`;
- registra cada señal y su resultado;
- hace una segunda ronda;
- si queda algo vivo, **no restaura** y deja «RESTAURACIÓN PENDIENTE» con el comando `ISO_MODE=restore`.

---

## 4. Fase G: PASS (21/10, `G-20261021-165144`). Genesis 1.0.0 instalado e inactivo en la instalación separada

**PASS significa Genesis instalado e inactivo, no Genesis ejecutado.** No hubo preparación, aprobación, activación, workflows ni T2.

| Control | Resultado en `R/evidence/G-20261021-165144/` |
|---|---|
| Reanudación | La misma organización `6d0178bd…` y la misma oferta (definición `72ac3dfb…`, 1.0.0, digest `3be21fd9…`). Sin claves nuevas. Dos renovaciones `renewed`, cada una con `bound present matched` |
| Pasos B y C | Oferta visible; navegar no descargó nada |
| Paso D | Confirmación visible en el DOM; 0 descargas |
| Paso E | Clic de José a las 17:02:50, dentro de la vigencia (vencía 17:02:59). Exactamente 1 descarga: `GET /v1/mandate/offers/72ac3dfb…/versions/1.0.0`. 1 recibo, 1 definición y 1 `mandate_state.json` (instancia `13ae5b56…`, `installed`, `master_local`, preparación `not_defined`). 0 `mandate.json` |
| G8 | `prepare` rechazado con `preparation_not_defined` |
| G9 | Tras reiniciar Nucleus y Core de R: hash de la instancia igual, 0 workflows de Mandate y 0 descargas nuevas |
| Paso F | Wisdom muestra «Instalado · inactivo · Preparación no disponible en esta versión» (`screen-final.png`) |
| G10 | Huella habitual idéntica; 0 accesos contra lo habitual; puertos de R durante la corrida; `HEALTH_RESTORED`; `SIN_HUERFANOS`; 0 procesos de R |

### 4.1 Corridas anteriores y correcciones del gate

| Corrida | Hasta dónde llegó | Causa | Corrección |
|---|---|---|---|
| `G-20261021-112315` | G1–G4 completos. La oferta quedó visible y seleccionable en Wisdom y la confirmación apareció (`screen-confirm.png`). La instalación se detuvo antes de confirmar | Falso negativo del gate: `cdp.py` recortaba el texto a 400 caracteres y el paso D buscaba «Confirmar instalación» fuera del recorte | `cdp.py` registra el texto completo y los botones; el paso D exige el botón visible, habilitado y sin nada encima |
| `G-20261021-145653` | Se detuvo antes de abrir Wisdom: `context-read` dio `authority_state_stale` | La emisión de Authority vence a los 4 minutos | Reanudación (`ISO_MODE=resume`) sobre el mismo Backend, con renovación del mismo humano y la misma organización |
| `G-20261021-154504` | Paso D, con el botón «Instalar» deshabilitado y la etiqueta `authority_state_stale` | La emisión renovada al inicio venció mientras transcurrían los pasos A–C. Falla del procedimiento de prueba, no del producto | Renovación justo antes del paso D, control de vigencia antes de E y comparación de `installedAt` con el vencimiento |
| `G-20261021-165144` | **PASS** | — | — |

En ninguna corrida anterior se instaló nada.

### 4.2 Problema de producto para Authority/Backend, separado del gate

Con 4 minutos de vigencia y sin renovación automática (el sync no renueva y el Backend sólo renueva una emisión vencida, a pedido del humano dueño), Wisdom marca `authority_state_stale` y deshabilita «Instalar» pocos minutos después de abrirse. Un Paladín real no puede instalar si tarda más de eso. La sesión de Authority/Backend tiene que decidir la política de vigencia y renovación. Este gate no cambia el TTL: el PASS se obtuvo renovando la organización de prueba antes del paso D. Evidencia: `G-20261021-145653/context-read.json` y, en `G-20261021-154504`, `cdp-wisdom-dom.json`, `cdp-wisdom-nav-dom.json` y `screen-wisdom-nav.png`.

## 5. Scripts del gate

Están en `.tmp/gate-wisdom/iso/` del checkout de la Mac y fueron verificados por md5. `.tmp/` está en el `.gitignore`, así que no están versionados.

| Script | md5 | Uso |
|---|---|---|
| `iso-prepare.sh` | `e1487a3354ecb030b9b4a500524db5ae` | Crea R (`workspace_url` = `http://localhost:5173`) |
| `iso-run-E.sh` | `773ccebc02f38cf453043a00b7ea1fd6` | Fase E (cerrada) |
| `iso-run-G.sh` | `46239ef939c473256cb997be8333d3ee` | Fase G completa, o reanudación con `ISO_MODE=resume RESUME_FROM=<evidencia>`. `ISO_MODE=restore` |
| `g-authority.mjs` | `fc25b07a63c425623843962a2dfa30ce` | Llamadas al Backend desechable (sólo `127.0.0.1:8788`): `keys`, `genesis`, `emission`, `publish`, `enable` y `renew` |
| `cdp.py` | `78db7bf09585ba750e4882472c8625bc` | URL, captura, DOM completo, botones y elemento bajo el clic |
| `recover-from-R.sh` | `062978a1…` | Cierra sólo los procesos de R y verifica el dueño de cada puerto |
| `port-inventory.sh` | `e224169c…` | Inventario de sólo lectura con veredicto de huérfanos |

**Comando del PASS:**

```
cd ~/repos/bloom-development-extension/.tmp/gate-wisdom/iso && R="$HOME/bloom-isolated/wisdom-20261021-012631" && ISO_MODE=resume RESUME_FROM="$R/evidence/G-20261021-112315" PATH="$R/home/Library/BloomNucleus/bin/node:$PATH" bash iso-run-G.sh "$R" --no-sandbox
```

---

## 6. Hallazgos para otras sesiones

| Hallazgo | Sesión que lo trata |
|---|---|
| Sensor registrado con `serve` (el binario usa `run`) y log con `%LOCALAPPDATA%` | `ANALYSIS/SETUP/Encargo_Sensor_Darwin_y_Bloqueo_Setup_Paso11_v1_0.md` |
| Brain con dos dueños (`com.bloom.brain` y el hijo de `com.bloom.nucleus`) | Nucleus |
| Vite, Temporal y Control Plane huérfanos tras `dev-start` y reinicios del servicio | Nucleus |
| `health` informa Vault en FAILED porque `synapse vault-status` imprime una línea INFO antes del JSON | Nucleus (registrado por José) |
| Discrepancia LOCKED en la ruta Synapse frente a `vault status` (`locked: false`) | Nucleus (registrado por José) |
| Vigencia de 4 minutos de la emisión de Authority, sin renovación automática: Wisdom deshabilita «Instalar» (§4.2) | Authority/Backend |
| `sample_project` ausente del catálogo material de Nucleus tras el onboarding (`material_project_entry_absent`) | Nucleus / Conductor |

---

## 7. Restricciones vigentes

- Sin git: José hace commit y push.
- No tocar la instalación habitual, `elias-repos`, `sample_project`, el Backend 8787 ni su D1.
- Sin onboarding, rollout ni reinstalación desde estas sesiones.
- El PASS de G es «instalado e inactivo» en la instalación separada R. No es Genesis ejecutado ni Genesis instalado en la instalación habitual.
- Nada se presenta como «Genesis listo» y no se ejecuta T2.

---

## 8. Traspaso a Codex

- **Gate de Wisdom en Darwin:** cerrado con PASS. No hay que repetirlo.
- **Abierto para Authority/Backend:** la política de vigencia y renovación de la emisión (§4.2).
- **Fuera de este gate:** preparación, aprobación, activación y ejecución de Genesis (T2), además de instalar en la instalación habitual. Cada una requiere su propia decisión de José.
- **La instalación separada R:** conserva su Backend desechable, la instancia instalada y toda la evidencia. Si no se va a reusar, se puede borrar completa: tu instalación habitual no depende de nada en R.
