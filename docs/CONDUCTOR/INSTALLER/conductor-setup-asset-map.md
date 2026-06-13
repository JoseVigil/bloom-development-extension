# Conductor Setup — Asset Map completo
> Fuente de verdad para el instalador Electron (conductor-setup).  
> Basado en `metamorph rollout` — estado final incluyendo correcciones post-listado.  
> Destino base: `AppData/.shared/` (equivalente al `basePath` de metamorph).

---

## Convenciones

| Token | Significado |
|---|---|
| `{repo}` | Raíz del repositorio (origen en el bundle del instalador) |
| `{base}` | `AppData/.shared/` — destino raíz en la máquina del usuario |
| `DIR` | Copiar directorio completo recursivamente (preservar symlinks) |
| `FILE` | Copiar archivo único |
| `ZIP` | Extraer archivo ZIP al destino |
| `TAR.XZ` | Extraer archivo tar.xz al destino |
| `chmod 0755` | Aplicar permisos de ejecución post-deploy (Darwin/Linux) |
| `chmod 4755` | Setuid root — requiere privilegios (Linux, chrome-sandbox) |

---

## Helper: resolución de plataforma (`nativePlatformDir`)

| OS | ARCH | Directorio |
|---|---|---|
| windows | amd64 | `win64` |
| darwin | amd64 | `darwin_x64` |
| darwin | arm64 | `darwin_arm64` |
| linux | amd64 | `linux_x64` |
| linux | arm64 | `linux_arm64` |

`nativeBin(comp)` = `{repo}/installer/native/bin/{nativePlatformDir()}/{comp}/`

---

## Componentes — Capa de gobernanza (Go binaries)

### brain
| Plataforma | Origen | Tipo | Destino |
|---|---|---|---|
| todas | `nativeBin("brain")` | DIR | `{base}/bin/brain/` |

### nucleus
| Plataforma | Origen | Tipo | Destino |
|---|---|---|---|
| todas | `nativeBin("nucleus")` | DIR | `{base}/bin/nucleus/` |

### sentinel
| Plataforma | Origen | Tipo | Destino |
|---|---|---|---|
| todas | `nativeBin("sentinel")` | DIR | `{base}/bin/sentinel/` |

### metamorph
| Plataforma | Origen | Tipo | Destino |
|---|---|---|---|
| todas | `nativeBin("metamorph")` | DIR | `{base}/bin/metamorph/` |
> ⚠️ En Windows el binario puede estar en uso — el instalador debe manejar el reemplazo con reintentos o renombrado atómico.

---

## Componentes — Native messaging host

### host
| Plataforma | Origen | Tipo | Destino |
|---|---|---|---|
| todas | `nativeBin("host")` | DIR | `{base}/bin/host/` |
> En Windows el directorio contiene `bloom-host.exe` + todas las DLLs necesarias. Copiar el directorio completo captura todo automáticamente.

---

## Componentes — Workspace / UI (Electron)

### workspace
| Plataforma | Origen | Tipo | Destino |
|---|---|---|---|
| windows | `{repo}/installer/native/bin/win64/workspace/bloom-workspace.exe` | FILE | `{base}/bin/workspace/` |
| darwin amd64 | `{repo}/installer/native/bin/darwin_x64/workspace/mac/bloom-workspace.app` | DIR | `{base}/bin/workspace/` |
| darwin arm64 | `{repo}/installer/native/bin/darwin_x64/workspace/mac-arm64/bloom-workspace.app` | DIR | `{base}/bin/workspace/` |
| linux | `nativeBin("workspace")/linux-unpacked/` | DIR | `{base}/bin/workspace/` |
> Darwin: el bundle `.app` contiene symlinks en `Frameworks/` — el copiado debe preservarlos (no seguirlos).

### setup
| Plataforma | Origen | Tipo | Destino |
|---|---|---|---|
| windows | `{repo}/installer/native/bin/win64/setup/bloom-setup.exe` | FILE | `{base}/bin/setup/` |
| darwin amd64 | `{repo}/installer/native/bin/darwin_x64/setup/mac/bloom-setup.app` | DIR | `{base}/bin/setup/` |
| darwin arm64 | `{repo}/installer/native/bin/darwin_x64/setup/mac-arm64/bloom-setup.app` | DIR | `{base}/bin/setup/` |
| linux | `nativeBin("setup")/linux-unpacked/` | DIR | `{base}/bin/setup/` |
> Linux: el ejecutable principal dentro de `linux-unpacked/` es `bloom-nucleus-installer`.

---

## Componentes — Agentes de sesión

### sensor
| Plataforma | Origen | Tipo | Destino |
|---|---|---|---|
| todas | `nativeBin("sensor")` | DIR | `{base}/bin/sensor/` |
> Copiar el directorio completo para incluir subdirectorios como `help/`.

---

## Componentes — Cross-platform (sin subdirectorio de arch)

### cortex
| Plataforma | Origen | Tipo | Destino |
|---|---|---|---|
| todas | `{repo}/installer/native/bin/cortex/bloom-cortex.blx` | FILE | `{base}/bin/cortex/` |

### ionpump
| Plataforma | Origen | Tipo | Destino |
|---|---|---|---|
| todas | `{repo}/installer/native/ionpump/` | DIR | `{base}/bin/cortex/ionpump/` |
> Contiene `bootstrap-ions.json` + archivos `*.ion` (ZIPs). El instalador solo copia — no ejecuta el pipeline de reconcile (eso lo hace metamorph en runtime).

### vsix
| Plataforma | Origen | Tipo | Destino |
|---|---|---|---|
| todas | `{repo}/installer/vscode/bloom-extension.vsix` | FILE | `{base}/bin/vscode/` |
> Post-deploy opcional: instalar con `code --install-extension bloom-extension.vsix --force` si el CLI de VS Code está disponible. No crítico si falla.

### bootstrap
| Plataforma | Origen | Tipo | Destino |
|---|---|---|---|
| windows | `{repo}/installer/native/bin/bootstrap/` | DIR | `{base}/bin/bootstrap/` |
| darwin | `{repo}/installer/native/bin/bootstrap/` | DIR | `{base}/bin/bootstrap/` |
| linux | — | — | No aplica |

### hooks
| Plataforma | Origen | Tipo | Destino |
|---|---|---|---|
| todas | `{repo}/installer/native/hooks/` | DIR | `{base}/hooks/` |
> Scripts Python, cross-platform. Copiar directorio completo sin filtros.

### config
| Plataforma | Origen | Tipo | Destino |
|---|---|---|---|
| todas | `{repo}/config/` | DIR | `{base}/config/` |

---

## Componentes — Solo Windows

### nssm
| Plataforma | Origen | Tipo | Destino |
|---|---|---|---|
| windows | `{repo}/installer/native/bin/win64/nssm/nssm.exe` | FILE | `{base}/bin/nssm/` |

---

## Componentes genéricos — LLM Runtime

### ollama
| Plataforma | Origen | Tipo | Destino | Post-deploy |
|---|---|---|---|---|
| windows | `{repo}/installer/ollama/windows/ollama.exe` | FILE | `{base}/bin/ollama/` | — |
| darwin | `{repo}/installer/ollama/darwin/ollama` | FILE | `{base}/bin/ollama/` | `chmod 0755` |
| linux | `{repo}/installer/ollama/linux/ollama` | FILE | `{base}/bin/ollama/` | `chmod 0755` |

### temporal
| Plataforma | Origen | Tipo | Destino | Post-deploy |
|---|---|---|---|---|
| windows | `{repo}/installer/temporal/win64/temporal.exe` | FILE | `{base}/bin/temporal/` | — |
| darwin | `{repo}/installer/temporal/darwin/temporal` | FILE | `{base}/bin/temporal/` | `chmod 0755` |
| linux | `{repo}/installer/temporal/linux/temporal` | FILE | `{base}/bin/temporal/` | `chmod 0755` |

---

## Componentes genéricos — Node.js

### node
| Plataforma | Origen | Tipo | Destino | Post-deploy |
|---|---|---|---|---|
| windows | `{repo}/installer/node/win64/node.exe` | FILE | `{base}/bin/node/` | — |
| darwin | `{repo}/installer/node/darwin/node` | FILE | `{base}/bin/node/` | — |
| linux | `{repo}/installer/node/linux_x64/linux-x64.tar.xz` | TAR.XZ | `{base}/bin/node/` | `chmod 0755 node` |
> Linux: extraer el tar.xz, localizar el binario en `bin/node` dentro del árbol extraído (e.g. `node-v*/bin/node`), copiar solo ese binario al destino como `node`.

---

## Componentes genéricos — Runtime Python

### runtime
| Plataforma | Origen | Tipo | Destino |
|---|---|---|---|
| windows | `{repo}/installer/resources/runtime-windows/` | DIR | `{base}/bin/engine/runtime/` |
| darwin | `{repo}/installer/resources/runtime-darwin/` | DIR | `{base}/bin/engine/runtime/` |
| linux | `{repo}/installer/resources/runtime-linux/` | DIR | `{base}/bin/engine/runtime/` |
> Copiar directorio completo preservando estructura. Sin subdirectorio de arch.

---

## Componentes genéricos — Chromium

### chrome
| Plataforma | Origen | Tipo | Destino | Post-deploy |
|---|---|---|---|---|
| windows | `{repo}/installer/chrome/chrome-win.zip` | ZIP | `{base}/bin/chrome-win/` | — |
| darwin | `{repo}/installer/chrome/chrome-mac.zip` | ZIP | `{base}/bin/chrome-mac/` | Ver nota Darwin |
| linux | `{repo}/installer/chrome/chrome-linux.tar.xz` | TAR.XZ | `{base}/bin/chrome-linux/` | Ver nota Linux |

**Darwin post-deploy:**
- `chmod 0755` → `Chromium.app/Contents/MacOS/Chromium`
- `chmod 0755` → cada archivo en `Chromium.app/Contents/Helpers/`

**Linux post-deploy:**
- `chmod 0755` → ejecutable principal (`chrome` o `chromium`)
- `chown root:root chrome-sandbox && chmod 4755 chrome-sandbox` (requiere privilegios; si falla, loggear warning y documentar `--no-sandbox`)

**Notas de extracción:**
- Limpiar el directorio de destino antes de extraer (idempotencia).
- Extraer a directorio temporal primero, luego mover al destino.
- Si el ZIP/TAR contiene una carpeta anidada única (`chrome-win/`, `chrome-mac/`), aplanar moviendo su contenido directamente al destino.

---

## Resumen por plataforma

### Windows — 19 componentes
| Componente | Origen | Destino |
|---|---|---|
| brain | `installer/native/bin/win64/brain/` | `bin/brain/` |
| nucleus | `installer/native/bin/win64/nucleus/` | `bin/nucleus/` |
| sentinel | `installer/native/bin/win64/sentinel/` | `bin/sentinel/` |
| metamorph | `installer/native/bin/win64/metamorph/` | `bin/metamorph/` |
| host | `installer/native/bin/win64/host/` | `bin/host/` |
| workspace | `installer/native/bin/win64/workspace/bloom-workspace.exe` | `bin/workspace/` |
| setup | `installer/native/bin/win64/setup/bloom-setup.exe` | `bin/setup/` |
| sensor | `installer/native/bin/win64/sensor/` | `bin/sensor/` |
| cortex | `installer/native/bin/cortex/bloom-cortex.blx` | `bin/cortex/` |
| ionpump | `installer/native/ionpump/` | `bin/cortex/ionpump/` |
| vsix | `installer/vscode/bloom-extension.vsix` | `bin/vscode/` |
| bootstrap | `installer/native/bin/bootstrap/` | `bin/bootstrap/` |
| hooks | `installer/native/hooks/` | `hooks/` |
| config | `config/` | `config/` |
| nssm | `installer/native/bin/win64/nssm/nssm.exe` | `bin/nssm/` |
| ollama | `installer/ollama/windows/ollama.exe` | `bin/ollama/` |
| temporal | `installer/temporal/win64/temporal.exe` | `bin/temporal/` |
| node | `installer/node/win64/node.exe` | `bin/node/` |
| runtime | `installer/resources/runtime-windows/` | `bin/engine/runtime/` |
| chrome | `installer/chrome/chrome-win.zip` → ZIP | `bin/chrome-win/` |

### Darwin amd64 — 19 componentes
| Componente | Origen | Destino |
|---|---|---|
| brain | `installer/native/bin/darwin_x64/brain/` | `bin/brain/` |
| nucleus | `installer/native/bin/darwin_x64/nucleus/` | `bin/nucleus/` |
| sentinel | `installer/native/bin/darwin_x64/sentinel/` | `bin/sentinel/` |
| metamorph | `installer/native/bin/darwin_x64/metamorph/` | `bin/metamorph/` |
| host | `installer/native/bin/darwin_x64/host/` | `bin/host/` |
| workspace | `installer/native/bin/darwin_x64/workspace/mac/bloom-workspace.app` | `bin/workspace/` |
| setup | `installer/native/bin/darwin_x64/setup/mac/bloom-setup.app` | `bin/setup/` |
| sensor | `installer/native/bin/darwin_x64/sensor/` | `bin/sensor/` |
| cortex | `installer/native/bin/cortex/bloom-cortex.blx` | `bin/cortex/` |
| ionpump | `installer/native/ionpump/` | `bin/cortex/ionpump/` |
| vsix | `installer/vscode/bloom-extension.vsix` | `bin/vscode/` |
| bootstrap | `installer/native/bin/bootstrap/` | `bin/bootstrap/` |
| hooks | `installer/native/hooks/` | `hooks/` |
| config | `config/` | `config/` |
| ollama | `installer/ollama/darwin/ollama` | `bin/ollama/` |
| temporal | `installer/temporal/darwin/temporal` | `bin/temporal/` |
| node | `installer/node/darwin/node` | `bin/node/` |
| runtime | `installer/resources/runtime-darwin/` | `bin/engine/runtime/` |
| chrome | `installer/chrome/chrome-mac.zip` → ZIP | `bin/chrome-mac/` |

### Darwin arm64 — 19 componentes
Igual que Darwin amd64 excepto:
| Componente | Origen (diferencia) |
|---|---|
| brain | `installer/native/bin/darwin_arm64/brain/` |
| nucleus | `installer/native/bin/darwin_arm64/nucleus/` |
| sentinel | `installer/native/bin/darwin_arm64/sentinel/` |
| metamorph | `installer/native/bin/darwin_arm64/metamorph/` |
| host | `installer/native/bin/darwin_arm64/host/` |
| workspace | `installer/native/bin/darwin_x64/workspace/mac-arm64/bloom-workspace.app` ¹ |
| setup | `installer/native/bin/darwin_x64/setup/mac-arm64/bloom-setup.app` ¹ |
| sensor | `installer/native/bin/darwin_arm64/sensor/` |

¹ Los bundles Electron de workspace/setup para arm64 se distribuyen desde el subdirectorio `darwin_x64` (artefacto universal/rosetta gestionado por electron-builder).

### Linux amd64 — 18 componentes (sin bootstrap, sin nssm)
| Componente | Origen | Destino |
|---|---|---|
| brain | `installer/native/bin/linux_x64/brain/` | `bin/brain/` |
| nucleus | `installer/native/bin/linux_x64/nucleus/` | `bin/nucleus/` |
| sentinel | `installer/native/bin/linux_x64/sentinel/` | `bin/sentinel/` |
| metamorph | `installer/native/bin/linux_x64/metamorph/` | `bin/metamorph/` |
| host | `installer/native/bin/linux_x64/host/` | `bin/host/` |
| workspace | `installer/native/bin/linux_x64/workspace/linux-unpacked/` | `bin/workspace/` |
| setup | `installer/native/bin/linux_x64/setup/linux-unpacked/` | `bin/setup/` |
| sensor | `installer/native/bin/linux_x64/sensor/` | `bin/sensor/` |
| cortex | `installer/native/bin/cortex/bloom-cortex.blx` | `bin/cortex/` |
| ionpump | `installer/native/ionpump/` | `bin/cortex/ionpump/` |
| vsix | `installer/vscode/bloom-extension.vsix` | `bin/vscode/` |
| hooks | `installer/native/hooks/` | `hooks/` |
| config | `config/` | `config/` |
| ollama | `installer/ollama/linux/ollama` | `bin/ollama/` |
| temporal | `installer/temporal/linux/temporal` | `bin/temporal/` |
| node | `installer/node/linux_x64/linux-x64.tar.xz` → TAR.XZ (extraer `bin/node`) | `bin/node/` |
| runtime | `installer/resources/runtime-linux/` | `bin/engine/runtime/` |
| chrome | `installer/chrome/chrome-linux.tar.xz` → TAR.XZ | `bin/chrome-linux/` |

### Linux arm64 — 18 componentes
Igual que Linux amd64 excepto:
| Componente | Origen (diferencia) |
|---|---|
| brain | `installer/native/bin/linux_arm64/brain/` |
| nucleus | `installer/native/bin/linux_arm64/nucleus/` |
| sentinel | `installer/native/bin/linux_arm64/sentinel/` |
| metamorph | `installer/native/bin/linux_arm64/metamorph/` |
| host | `installer/native/bin/linux_arm64/host/` |
| workspace | `installer/native/bin/linux_arm64/workspace/linux-unpacked/` |
| setup | `installer/native/bin/linux_arm64/setup/linux-unpacked/` |
| sensor | `installer/native/bin/linux_arm64/sensor/` |
| node | `installer/node/linux_arm64/linux-arm64.tar.xz` → TAR.XZ |

