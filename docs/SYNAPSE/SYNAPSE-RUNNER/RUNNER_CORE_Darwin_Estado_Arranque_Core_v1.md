# RUNNER CORE Darwin — estado del arranque de Core (v1)

**Fecha:** 2026-10-18. **Máquina:** Mac Intel `x86_64`, instalación habitual del usuario (`~/Library/BloomNucleus`), estado de RUNNER conservado. **Base:** `RUNNER_CORE_Migracion_Darwin_v1.md` y `RUNNER_Migracion_Darwin_v1.md`.
**Alcance de esta tanda:** recuperar el arranque automático del Control Plane y lograr que Workspace Core abra y muestre su UI en Darwin. **No** se ejecutaron gates de RUNNER CORE, ni Wisdom, ni AITAP. Las decisiones de §7.2 del dossier CORE siguen abiertas.

## 1. Resultado

Workspace Core abre en Darwin con `npm run dev:darwin` (desde `installer/conductor/workspace`) y muestra su UI: pantalla «Loading Bloom Nucleus…» y la sección Wisdom con el stub «Próximamente». Verificado visualmente por José el 2026-10-18 ~19:34 (UTC-3).

| Comprobación | Evidencia |
|---|---|
| Bundle del Control Plane instalado | `metamorph rollout --only bootstrap`: `1 deployed, 0 skipped, 0 errors`; SHA-256 `07abd61e…768d3` igual en `installer/native/bin/bootstrap/bundle.js` y `~/Library/BloomNucleus/bin/bootstrap/bundle.js`. |
| Arranque automático por launchd | Al iniciar `com.bloom.nucleus` (03:58:57) el servicio registra Control Plane sin `port 48215 not ready`; antes del fix fallaba con `Cannot find module …/bin/bootstrap/bundle.js`. |
| Salud | `nucleus service restart-bootstrap` → `exit=0`, `RUNNING`; `nucleus --json health --component control_plane` → `HEALTHY`; `:48215` escucha (`node`), `GET /api/docs` → 200. |
| Svelte dev server | `dev-start` resuelve `webview/app` en la raíz del repo y levanta Vite en `:5173` (`✓ Svelte dev server ready`). |
| UI de Core | Visible tras reiniciar Vite con `playcanvas` instalado. |

## 2. Causas encontradas y correcciones

### 2.1 Cambios en el repositorio

| Archivo | Causa | Cambio |
|---|---|---|
| `installer/conductor/setup/package.json` | `mac.extraResources` no incluía `native/bin/bootstrap`; el setup empaquetado buscaba `Contents/Resources/bootstrap`, no lo encontraba y registraba `⚠️ Bootstrap source not found, skipping`. | Agregada la entrada `{"from": "../../native/bin/bootstrap", "to": "bootstrap"}` en `mac.extraResources`. Verificado: el `.app` reconstruido trae `Resources/bootstrap/bundle.js`. |
| `installer/conductor/setup/install/nucleus_manager.js` | `setOriginPath` busca `.git` hasta 10 niveles. Desde `…/darwin_x64/setup/mac/bloom-setup.app/Contents/Resources/nucleus` la raíz del repo está en el nivel 10; cae al fallback de 5 niveles y escribe `origin_path = …/bin/darwin_x64/setup`. Windows (`win-unpacked/resources`) y Linux (`linux-unpacked/resources`) la encuentran en el nivel 8. Exclusivo del setup empaquetado de Darwin. | Límite de búsqueda ampliado a 16 niveles, con comentario. Simulación del código real sobre los cuatro layouts (Darwin `.app`, Windows, Linux, Darwin dev): todos resuelven a la raíz del repo. |
| `installer/conductor/workspace/main_conductor.js` | En macOS cerrar la última ventana no termina la app; `app.on('activate')` (Dock) volvía a llamar a `registerOnboardingHandlers` y `ipcMain.handle` lanzaba `Attempted to register a second handler for 'onboarding:gemini-vault-prepare'`. Exclusivo de Darwin. | `registerOnboardingHandlersOnce()` con guard por proceso; reemplaza las cuatro llamadas (boot y `activate`). `node --check` OK. |

### 2.2 Cambios de estado local (fuera de Git, sólo en esta Mac)

- `~/Library/BloomNucleus/config/nucleus.json`: **sólo** `installation.origin_path` → `/Users/josevigil/repos/bloom-development-extension` (antes `…/installer/native/bin/darwin_x64/setup`). Resto del JSON idéntico; onboarding y estado de RUNNER intactos. Necesario porque el setup no vuelve a ejecutar `setOriginPath` con el milestone completo.
- `~/Library/BloomNucleus/bin/bootstrap/`: desplegado con `metamorph rollout --only bootstrap`.
- `installer/conductor/workspace/core/orrery/node_modules/`: `npm install --no-package-lock` (instala `playcanvas@2.22.1`). `node_modules/` está en `.gitignore`.
- Vite (`:5173`) reiniciado: el proceso anterior arrancó antes de instalar `playcanvas` y `dev-start` lo reutilizaba (`already running — skipping start`).

## 3. Pendiente y no verificado

1. **Setup inicial Darwin sin probar.** El `.app` corregido trae el bootstrap, pero ninguna instalación limpia lo usó. Ese `.app` contiene el bundle anterior (`10d662c9…`); reconstruir antes de usarlo. Con una instalación existente el setup se saltea la copia porque el milestone `binaries` está completo.
2. **«Loading Bloom Nucleus…» no diagnosticado.** No se verificó si es un estado transitorio o si queda detenido. Candidato a revisar primero: punto 3.
3. **Rutas de Mandates no registradas.** `out/src/utils/org-resolver.ts` (copia suelta del 2026-07-09, único `.ts` en `out/src`) se empaqueta en lugar del `org-resolver.js` compilado porque esbuild prefiere `.ts`. El bundle busca `.core/nucleus-config.json`; el workspace tiene `.core/.nucleus-config.json`. Resultado: `/api/v1/mandates` y `/api/internal/mandate-event` no se registran. Arreglo propuesto, no aplicado: retirar ese `.ts`, `npm run build:bundle`, `metamorph rollout --only bootstrap`; opcionalmente que `bundle-bootstrap.js` prefiera `.js` dentro de `out/`.
4. **Rol del Control Plane.** `bootControlPlane` reenvía `BLOOM_USER_ROLE` crudo (`service.go:1701`); bajo launchd llega vacío y `server-bootstrap.js` usa `pre-onboarding`, aunque `nucleus.json` tenga `onboarding.completed=true` y SynapseSimulator corra en GOVERNANCE. Requiere decisión de José sobre qué rol corresponde y de dónde se deriva.
5. **Control Plane duplicado.** `dev-start` lanza un segundo Control Plane aunque launchd ya tiene uno; el segundo muere con `EADDRINUSE` en `:48215`/`:4124`. El primero sigue sirviendo.
6. **Dependencias de Orrery fuera del build.** `$orrery` es un alias al fuente (`webview/app/svelte.config.js`), declarado «sin instalación adicional», pero Orrery depende de `playcanvas` y nada lo instala en un checkout nuevo. Opciones (decisión de José): declarar `playcanvas` en `webview/app/package.json` o instalar `core/orrery` en el paso 0 de `build_bootstrap()`.
7. **SynapseBridge y reapertura desde el Dock.** El bridge guarda la ventana por valor; tras `activate` podría emitir a la ventana anterior. No probado.
8. **Windows y Linux** tampoco incluyen `native/bin/bootstrap` en `extraResources`; no se tocaron.
9. **Node del sistema 20.18.0**: `vite@7` de Orrery standalone exige ≥20.19; no afecta a Core (usa el Vite 6 de `webview/app`).

## 4. Siguiente paso sugerido

Antes de los gates de RUNNER CORE: diagnosticar el punto 2 y aplicar el 3; luego resolver con José los puntos 4 y 6 y las decisiones de §7.2 del dossier CORE. Recién después: gate negativo (onboarding/apertura sin crear, descargar ni instalar Mandates), Wisdom y AITAP.
