# Dependencias de binarios de terceros — Bloom Installer

> Documento de referencia para reconstruir el árbol de binarios de terceros en una máquina nueva, ya que **no se incluyen en el repo** por su peso. Basado en el análisis de `installer.js`, `global_paths.js`, `chromium-installer.js` y las notas propias de descarga.

---

## Estructura general de carpetas (desarrollo)

```
bloom-development-extension/
└── installer/
    ├── conductor/
    │   ├── shared/global_paths.js
    │   └── setup/
    │       ├── config/paths.js
    │       └── install/
    │           ├── installer.js
    │           └── chromium-installer.js
    ├── native/                          ← binarios custom + OpenCode
    │   └── opencode/win64/opencode.exe
    ├── chrome/
    │   └── chrome-win.zip
    ├── ollama/
    │   └── windows/ollama.exe
    ├── node/
    │   └── win64/node.exe
    ├── temporal/
    │   └── win64/temporal.exe
    └── resources/
        └── runtime-windows/             ← Python embebido (carpeta completa)
```

`baseDir` en producción (Windows) = `%LOCALAPPDATA%\BloomNucleus`

---

## 1. Chromium

| | |
|---|---|
| **Ejecutable** | `chrome.exe` |
| **Origen (dev)** | `installer/chrome/chrome-win.zip` (se extrae automáticamente) |
| **Destino (prod)** | `%LOCALAPPDATA%\BloomNucleus\bin\chrome-win\chrome.exe` |
| **Copia dependencias** | Sí — todo el contenido del ZIP |
| **Fuente de descarga** | Windows/macOS: sin origen confirmado en las notas — **pendiente de documentar de dónde se bajó el .zip**. Linux: [ungoogled-chromium-binaries](https://ungoogled-software.github.io/ungoogled-chromium-binaries/) |
| **Versión instalada actualmente** | `151.0.7922.137-1` (Windows). Versión inicial usada fue `146.0.7680.177` |
| **Ubicación usada** | `C:\repos\bloom-development-extension\installer\chrome\chrome-win.zip` |
| **Notas** | El instalador detecta automáticamente la carpeta raíz dentro del ZIP (puede venir versionada) y valida que `chrome.exe` pese >50MB antes de correr un smoke test (`chrome.exe --version --headless`). Es una build **ungoogled-chromium** (sin telemetría de Google). |

⚠️ **Pendiente**: confirmar y documentar la URL exacta de descarga para Windows y macOS — actualmente solo está clara la fuente para Linux.

---

## 2. Temporal

| | |
|---|---|
| **Ejecutable** | `temporal.exe` |
| **Origen (dev)** | `installer/temporal/win64/temporal.exe` |
| **Destino (prod)** | `%LOCALAPPDATA%\BloomNucleus\bin\temporal\temporal.exe` |
| **Copia dependencias** | No — solo el `.exe` suelto |
| **Fuente de descarga** | [github.com/temporalio/cli/releases/tag/v1.5.1](https://github.com/temporalio/cli/releases/tag/v1.5.1) |
| **Archivo descargado** | `temporal_cli_1.5.1_windows_amd64.zip` (extraer y copiar solo el `.exe` a `installer/temporal/win64/`) |
| **Versión** | v1.5.1 |

---

## 3. Node.js

| | |
|---|---|
| **Ejecutable** | `node.exe` |
| **Origen (dev)** | `installer/node/win64/node.exe` (Windows) / `installer/node/darwin/node` (macOS) |
| **Destino (prod)** | `%LOCALAPPDATA%\BloomNucleus\bin\node\node.exe` |
| **Copia dependencias** | No — solo el `.exe` suelto |
| **Fuente de descarga** | [nodejs.org/en/download](https://nodejs.org/en/download) |
| **Versión** | v2.11 (Windows/macOS) — v2.22.3 (Linux) |

⚠️ Ojo con la numeración de versión anotada (v2.11 / v2.22.3) — no coincide con el esquema habitual de versionado de Node.js (que va por v18/v20/v22...). Vale la pena revalidar esto contra la descarga real antes de reproducirlo en una máquina nueva, para no confundirlo con otra herramienta.

---

## 4. Ollama

| | |
|---|---|
| **Ejecutable** | `ollama.exe` |
| **Origen (dev)** | `installer/ollama/windows/ollama.exe` |
| **Destino (prod)** | `%LOCALAPPDATA%\BloomNucleus\bin\ollama\ollama.exe` |
| **Copia dependencias** | No — el instalador solo busca y copia el `.exe`. Si el ZIP trae DLLs adicionales (p. ej. soporte CUDA/ROCm), **el instalador las ignora silenciosamente** |
| **Fuente de descarga** | [ollama.com/download](https://ollama.com/download) |
| **Archivo directo (Windows)** | [github.com/ollama/ollama/releases/latest/download/ollama-windows-amd64.zip](https://github.com/ollama/ollama/releases/latest/download/ollama-windows-amd64.zip) |

---

## 5. Python Runtime (embebido)

| | |
|---|---|
| **Ejecutable** | `python.exe` (Windows) |
| **Origen (dev)** | `installer/resources/runtime-windows/` (carpeta completa) |
| **Destino (prod)** | `%LOCALAPPDATA%\BloomNucleus\bin\engine\runtime\` (ejecutable en `...\runtime\python.exe`) |
| **Copia dependencias** | **Sí** — carpeta completa (`Lib/`, `Lib\site-packages\`, `python310.zip`, DLLs del intérprete) |
| **Config post-copia** | El instalador genera `python310._pth` en destino con: `.`, `python310.zip`, `Lib`, `Lib\site-packages` → fuerza **modo aislado** |
| **Fuente** | [Python Build Standalone (Astral)](https://github.com/astral-sh/python-build-standalone/releases/) — builds `install_only_stripped` |
| **Versión** | CPython 3.10.20 — release `20260414` |
| **macOS** | Dos tarballs: uno `aarch64` (Apple Silicon) y uno `x86_64` (Intel) |
| **Linux x86_64** | [cpython-3.10.20+20260414-x86_64-unknown-linux-gnu-install_only_stripped.tar.gz](https://github.com/astral-sh/python-build-standalone/releases/download/20260414/cpython-3.10.20+20260414-x86_64-unknown-linux-gnu-install_only_stripped.tar.gz) |
| **Linux ARM64** | [cpython-3.10.20+20260414-aarch64-unknown-linux-gnu-install_only_stripped.tar.gz](https://github.com/astral-sh/python-build-standalone/releases/download/20260414/cpython-3.10.20+20260414-aarch64-unknown-linux-gnu-install_only_stripped.tar.gz) |

⚠️ Falta la URL específica del build de **Windows** en las notas — se infiere que también sale de python-build-standalone (equivalente al embeddable package), pero conviene confirmar el asset exacto (`x86_64-pc-windows-msvc-install_only_stripped.tar.gz` o similar) antes de reproducirlo.

Además, hay un paso separado (`runRuntimeInstall` → `runtime-installer.js`) que corre **después** de copiar el runtime — no documentado en este análisis, revisar si instala paquetes pip adicionales.

---

## 6. OpenCode

| | |
|---|---|
| **Ejecutable** | `opencode.exe` |
| **Origen (dev)** | `installer/native/opencode/win64/opencode.exe` (único binario de terceros que vive dentro de `native/`) |
| **Destino (prod)** | `%LOCALAPPDATA%\BloomNucleus\bin\opencode\opencode.exe` |
| **Copia dependencias** | No — solo el `.exe` suelto |
| **Fuente de descarga** | [github.com/opencode-ai/opencode/releases](https://github.com/opencode-ai/opencode/releases) |
| **Archivo directo (Windows)** | [github.com/anomalyco/opencode/releases/download/v1.17.12/opencode-windows-x64.zip](https://github.com/anomalyco/opencode/releases/download/v1.17.12/opencode-windows-x64.zip) |
| **Versión** | v1.17.12 |
| **Se registra como servicio** | Sí, vía `service-installer-opencode.js` (Windows) — no crítico si falla la instalación del servicio |

⚠️ Nota: el repo del release (`anomalyco/opencode`) no coincide con el repo de referencia (`opencode-ai/opencode`) — parece ser un fork. Vale la pena confirmar cuál es la fuente "oficial" que efectivamente se usa en el build.

---

## 7. NSSM (Non-Sucking Service Manager)

| | |
|---|---|
| **Ejecutable** | `nssm.exe` |
| **Origen (dev)** | `installer/native/nssm/win64/nssm.exe` |
| **Destino (prod)** | `%LOCALAPPDATA%\BloomNucleus\bin\nssm\nssm.exe` |
| **Copia dependencias** | No |
| **Fuente de descarga** | **No está en las notas** — pendiente de documentar |

⚠️ **Pendiente**: no hay ningún registro de dónde se descargó NSSM. Sitio oficial de referencia: [nssm.cc/download](https://nssm.cc/download).

---

## 8. Python de desarrollo (build-time, NO es el runtime embebido)

No confundir con §5 (Python Runtime embebido, el que se empaqueta y se copia a
`NUCLEUS_HOME` para producción) — esto es el Python del propio desarrollador,
instalado en la máquina que corre `build-all.py`, y `brain.ps1`/`build-brain.sh`
lo usan directo desde el PATH del sistema.

**Obligatorio, antes de correr `build-all.py` por primera vez en una máquina
nueva** (sea Windows, macOS o Linux):

```bash
pip install -r brain\requirements.txt
python -m pip install pyinstaller
```

Por qué son dos comandos separados y no uno solo:

- `brain\requirements.txt` cubre las dependencias que `update_version.py` y el
  resto de `brain/build_deploy/` necesitan importar (`tomli-w`, `typer`,
  `pydantic`, etc.). Sin esto, `build_brain()` falla temprano con
  `[ERROR] Falta dependencia: tomli-w`.
- `pyinstaller` está deliberadamente **fuera** de `requirements.txt`: ese
  archivo también se vendorea a `brain/libs/` para el runtime empaquetado (ver
  `install_python_deps.js`), y PyInstaller es una herramienta de build, no una
  dependencia de Brain en sí — agregarla ahí infla el paquete final sin
  necesidad. Sin este segundo `pip install`, la compilación llega hasta el
  paso de PyInstaller y falla con `No module named PyInstaller`.

`build-all.py` (desde el commit `003f07d`) chequea ambas antes de compilar
Brain y las instala solo si faltan — pero si el `pip`/`python` del PATH no
tiene permisos de escritura, o el operador prefiere dejarlo resuelto de
antemano, correr estos dos comandos a mano evita depender de esa
auto-instalación.

---

## Checklist para armar una máquina nueva

- [ ] Chromium (Windows/macOS) — **falta confirmar fuente**
- [ ] Chromium (Linux) — ungoogled-chromium-binaries
- [ ] Temporal CLI v1.5.1
- [ ] Node.js (validar versión real — v2.11/v2.22.3 anotado no es un esquema típico)
- [ ] Ollama Windows amd64
- [ ] Python Build Standalone 3.10.20 (Windows — **falta URL exacta**, macOS x2 arch, Linux x2 arch)
- [ ] OpenCode v1.17.12 (confirmar si repo `anomalyco/opencode` es el correcto)
- [ ] NSSM — **falta fuente completa**
- [ ] Python de desarrollo: `pip install -r brain\requirements.txt` + `python -m pip install pyinstaller`

---

## Puntos abiertos a resolver

1. **Chromium Windows/macOS**: falta el origen exacto de descarga.
2. **Node.js**: revalidar el número de versión anotado.
3. **Python Windows**: falta la URL específica del asset de python-build-standalone para Windows.
4. **`runtime-installer.js`**: no analizado — puede instalar dependencias pip adicionales después de copiar el runtime.
5. **OpenCode**: confirmar si el fork `anomalyco/opencode` es la fuente correcta o si debería salir del repo oficial `opencode-ai/opencode`.
6. **NSSM**: no hay ningún registro de la fuente de descarga.
7. **`service-installer-opencode.js`**: no analizado — define cómo se registra el servicio de Windows para OpenCode.
