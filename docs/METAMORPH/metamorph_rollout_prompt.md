# Prompt para desarrollo: Metamorph rollout completo

## Contexto

Estás trabajando en `rollout.go` del paquete `maintenance` de **Metamorph**, una herramienta Go que actúa como fuente de verdad del deploy de binarios para el proyecto Bloom Nucleus. El archivo ya existe con una estructura `allComponents []component` donde cada entrada define `Key`, `SourceFn`, `DestFn`, y opcionalmente `PostDeployFn` y `Platforms`.

El objetivo de esta tarea es **reemplazar `allComponents` completamente** con el mapa canónico y exhaustivo de todos los binarios — custom y genéricos — para las tres plataformas: Windows, Darwin, Linux. También hay que agregar helpers y lógica de extracción nueva para los casos que lo requieran.

---

## Decisiones de arquitectura ya tomadas

### 1. Fuente de verdad única: `native/bin/`
Todo origen viene de `installer/native/bin/{platform}/` para los binarios custom. No hay `{comp}/dist/`. Los paths de `dist/` que existen hoy en `allComponents` son erróneos y deben eliminarse.

### 2. Helper `nativePlatformDir()`
Debe existir un helper central que resuelva el string de directorio de plataforma en runtime, combinando OS + ARCH. No se hardcodea el switch por componente. La convención de nombres es:

| OS | ARCH | Dir |
|---|---|---|
| windows | amd64 | `win64` |
| darwin | amd64 | `darwin_x64` |
| darwin | arm64 | `darwin_arm64` |
| linux | amd64 | `linux_x64` |
| linux | arm64 | `linux_arm64` |

Ambos artefactos Darwin y Linux siempre existen en el repo. No hay fallback cross-arch.

### 3. `rollout_other.go` — desbloquear Linux y Darwin
El `ensureElevated()` actual bloquea el comando `rollout` en non-Windows. Hay que refactorizar para que Linux y Darwin puedan correr rollout (con su propia lógica de elevación o sin requerir elevación). Los `SourceFn` de Linux y Darwin ya están definidos y deben funcionar.

### 4. `conductor` eliminado
El componente `workspace` en Windows y Linux apunta hoy a `conductor/dist/bloom-conductor`. Eso es legacy. `bloom-conductor` ya no existe. La entrada `workspace` debe apuntar al path correcto.

### 5. `hook` eliminado
El binario Go `hook` en `allComponents` no corresponde a ningún artefacto real del sistema actual. Eliminar la entrada. Los hooks son archivos de datos en `native/hooks/` (ver componente `hooks` más abajo).

### 6. Extracción de archivos comprimidos
Metamorph necesita nueva lógica para manejar tres tipos de origen comprimido:
- `.zip` → extracción estándar
- `.tar.xz` → extracción tar con descompresión xz

La extracción siempre va a un directorio temporal y luego se mueve al destino. Después de la extracción se aplican permisos según la plataforma (ver detalles por componente abajo). Esta lógica debe implementarse como helpers reutilizables: `extractZip(src, dst string) error` y `extractTarXz(src, dst string) error`.

---

## Mapa canónico completo de `allComponents`

### Helpers necesarios

```go
// nativePlatformDir resuelve el subdirectorio de native/bin/ según OS + ARCH.
func nativePlatformDir() string {
    switch runtime.GOOS {
    case "windows":
        return "win64"
    case "darwin":
        if runtime.GOARCH == "arm64" {
            return "darwin_arm64"
        }
        return "darwin_x64"
    case "linux":
        if runtime.GOARCH == "arm64" {
            return "linux_arm64"
        }
        return "linux_x64"
    }
    return runtime.GOOS
}

// nativeBin construye el path de origen dentro de installer/native/bin/{platform}/{comp}/
func nativeBin(r, comp string) string {
    return filepath.Join(r, "installer", "native", "bin", nativePlatformDir(), comp)
}
```

---

### Componentes custom — Capa de gobernanza (Go binaries)

**brain**
- Origen: `installer/native/bin/{platform}/brain/` (directorio)
- Destino: `bin/brain/`
- Todas las plataformas

**nucleus**
- Origen: `installer/native/bin/{platform}/nucleus/` (directorio)
- Destino: `bin/nucleus/`
- Todas las plataformas

**sentinel**
- Origen: `installer/native/bin/{platform}/sentinel/` (directorio)
- Destino: `bin/sentinel/`
- Todas las plataformas

**metamorph**
- Origen: `installer/native/bin/{platform}/metamorph/` (directorio)
- Destino: `bin/metamorph/`
- Todas las plataformas
- Nota: metamorph se auto-actualiza. El copy de sí mismo requiere manejo especial en Windows (archivo en uso). En Darwin y Linux el copy directo funciona.

---

### Componentes custom — Native messaging host

**host**
- Origen Windows: `installer/native/bin/win64/host/` (directorio — contiene `bloom-host.exe` + todas las `.dll`)
- Origen Darwin: `installer/native/bin/darwin_x64/host/` o `darwin_arm64/host/`
- Origen Linux: `installer/native/bin/{platform}/host/` (contiene `bloom-host`)
- Destino: `bin/host/`
- Todas las plataformas
- Nota: en Windows copiar el directorio completo captura automáticamente el exe y todas las DLLs.

---

### Componentes custom — Workspace / UI (Electron)

**workspace**
- Origen Windows: `installer/native/bin/win64/workspace/bloom-workspace.exe` (archivo único)
- Origen Darwin (amd64): `installer/native/bin/darwin_x64/workspace/mac/bloom-workspace.app` (directorio — bundle completo)
- Origen Darwin (arm64): `installer/native/bin/darwin_x64/workspace/mac-arm64/bloom-workspace.app` (directorio)
- Origen Linux: `installer/native/bin/{platform}/workspace/linux-unpacked/` (directorio completo — preservar estructura)
- Destino Windows: `bin/workspace/`
- Destino Darwin: `bin/workspace/` (el bundle `.app` queda en `bin/workspace/bloom-workspace.app`)
- Destino Linux: `bin/workspace/` (todo `linux-unpacked/` se copia preservando estructura)
- Todas las plataformas
- Nota Darwin: `copyDir` ya maneja symlinks correctamente (ver implementación actual en `copyDir`). El bundle `.app` de Electron contiene symlinks en `Frameworks/` que deben preservarse.

**setup**
- Origen Windows: `installer/native/bin/win64/setup/bloom-setup.exe` (archivo único)
- Origen Darwin (amd64): `installer/native/bin/darwin_x64/setup/mac/bloom-setup.app` (directorio — bundle completo)
- Origen Darwin (arm64): `installer/native/bin/darwin_x64/setup/mac-arm64/bloom-setup.app` (directorio)
- Origen Linux: `installer/native/bin/{platform}/setup/linux-unpacked/` (directorio completo — preservar estructura)
- Destino Windows: `bin/setup/`
- Destino Darwin: `bin/setup/`
- Destino Linux: `bin/setup/` (todo `linux-unpacked/` preservando estructura, ejecutable principal: `bloom-nucleus-installer`)
- Todas las plataformas

---

### Componentes custom — Agentes de sesión

**sensor**
- Origen Windows: `installer/native/bin/win64/sensor/bloom-sensor.exe`
- Origen Darwin: `installer/native/bin/{platform}/sensor/bloom-sensor`
- Origen Linux: `installer/native/bin/{platform}/sensor/bloom-sensor`
- Destino: `bin/sensor/`
- Todas las plataformas

---

### Componentes custom — Cross-platform (sin subdirectorio de arch)

**cortex**
- Origen: `installer/native/bin/cortex/bloom-cortex.blx` (archivo único, mismo para todas las plataformas)
- Destino: `bin/cortex/`
- Todas las plataformas

**ionpump**
- Origen: `installer/native/ionpump/` (directorio — bootstrap-ions.json + *.ion ZIPs)
- Destino: `bin/cortex/ionpump/`
- PostDeployFn: `ionpumpPostDeploy` (ya implementada, no modificar)
- Todas las plataformas

**vsix**
- Origen: `installer/vscode/bloom-extension.vsix`
- Destino: `bin/vscode/`
- PostDeployFn: `vsixPostDeploy` (ya implementada, no modificar)
- Todas las plataformas

**bootstrap**
- Origen: `installer/native/bin/bootstrap/` (directorio — sin arch, cross-platform)
- Destino: `bin/bootstrap/`
- Platforms: `["windows", "darwin"]` (Linux excluido igual que hoy)

**hooks**
- Origen: `installer/native/hooks/` (directorio — scripts Python, cross-platform, sin arch)
- Destino: `hooks/`
- Todas las plataformas
- Nota: copiar el directorio completo sin filtros.

**config**
- Origen: `config/` (directorio — datos de configuración)
- Destino: `config/`
- Todas las plataformas
- Nota: esta entrada ya existe y es correcta. No modificar.

---

### Componentes custom — Solo Windows

**nssm**
- Origen: `installer/native/bin/win64/nssm/nssm.exe`
- Destino: `bin/nssm/`
- Platforms: `["windows"]`
- Nota: el path actual en rollout.go es `vendors/nssm/nssm.exe` — corregir a `installer/native/bin/win64/nssm/nssm.exe`.

---

### Componentes genéricos — LLM Runtime

**ollama**
- Origen Windows: `installer/ollama/windows/ollama.exe` (archivo único)
- Origen Darwin: `installer/ollama/darwin/ollama` (archivo único)
- Origen Linux: `installer/ollama/linux/ollama` (archivo único)
- Destino: `bin/ollama/`
- Todas las plataformas
- PostDeploy (Darwin + Linux): `chmod 0755` al ejecutable

**temporal**
- Origen Windows: `installer/temporal/win64/temporal.exe` (archivo único)
- Origen Darwin: `installer/temporal/darwin/temporal` (archivo único)
- Origen Linux: `installer/temporal/linux/temporal` (archivo único)
- Destino: `bin/temporal/`
- Todas las plataformas
- PostDeploy (Darwin + Linux): `chmod 0755` al ejecutable

**node**
- Origen Windows: `installer/node/win64/node.exe` (archivo único — autocontenido)
- Origen Darwin: `installer/node/darwin/node` (archivo único — autocontenido)
- Origen Linux: `installer/node/linux_x64/node` (archivo único — autocontenido, extraído previamente del tar.xz)
- Destino: `bin/node/`
- Todas las plataformas
- Nota Linux: el archivo fuente en el repo es `installer/node/linux_x64/linux-x64.tar.xz`. El SourceFn debe detectar si existe el tar.xz y extraer el binario `node` de su interior (en `bin/node`) antes de copiarlo al destino. Alternativamente, la extracción se hace como PreDeployFn o dentro del SourceFn retornando el path del binario ya extraído a un temp dir. El binario final en destino es simplemente `node` (sin estructura adicional).

---

### Componentes genéricos — Runtime Python

**runtime**
- Origen Windows: `installer/resources/runtime-windows/` (directorio completo)
- Origen Darwin: `installer/resources/runtime-darwin/` (directorio completo — sin subcarpeta de arch)
- Origen Linux: `installer/resources/runtime-linux/` (directorio completo — sin subcarpeta de arch)
- Destino: `bin/engine/runtime/`
- Todas las plataformas
- Nota: copiar el directorio completo preservando estructura. No hay filtros.

---

### Componentes genéricos — Chromium

**chrome**
- Origen Windows: `installer/chrome/chrome-win.zip` → extraer ZIP
- Origen Darwin: `installer/chrome/chrome-mac.zip` → extraer ZIP
- Origen Linux: `installer/chrome/chrome-linux.tar.xz` → extraer tar.xz
- Destino Windows: `bin/chrome-win/` (resultado de la extracción, estructura preservada)
- Destino Darwin: `bin/chrome-mac/` (resultado contiene `Chromium.app/` bundle completo)
- Destino Linux: `bin/chrome-linux/` (estructura preservada)
- Todas las plataformas
- PostDeploy Darwin: `chmod 0755` al ejecutable `Chromium.app/Contents/MacOS/Chromium` + `chmod 0755` a cada helper en `Chromium.app/Contents/Helpers/`
- PostDeploy Linux: `chmod 0755` al ejecutable principal + `chown root:root chrome-sandbox && chmod 4755 chrome-sandbox` (requiere privilegios; si falla, loggear warning y continuar con flag `--no-sandbox` documentado)
- Nota: limpiar el directorio de destino antes de extraer si ya existe (idempotencia). Extraer a temp dir primero, luego mover al destino final. Si el ZIP contiene una carpeta anidada `chrome-win/` o `chrome-mac/`, aplanarla moviendo su contenido al destino directamente.

---

## Lógica de extracción a implementar

### `extractZip(src, dstDir string) error`
- Usar `archive/zip` de la stdlib
- Extraer a `dstDir` preservando estructura interna
- Aplicar permisos del archivo original al extraer
- Retornar error si el archivo no existe o está corrupto (validar que pese > 50MB)

### `extractTarXz(src, dstDir string) error`
- Usar `archive/tar` + `github.com/ulikunitz/xz` (o fallback a `exec.Command("tar", "-xJf", src, "-C", dstDir)`)
- Extraer a `dstDir` preservando estructura interna
- Retornar error si falla

---

## Modelo de componente extendido

El struct `component` actual solo tiene `PostDeployFn`. Para los casos de extracción (chrome, node Linux) se necesita una forma de indicar que el SourceFn retorna un archivo comprimido que debe extraerse antes del copy. Opciones:

**Opción A (recomendada):** agregar campo `ExtractFn func(src, dstDir string) error` al struct. Si no es nil, en lugar de `copyFile`/`copyDir`, se llama `ExtractFn(src, dst)`.

**Opción B:** el SourceFn retorna el path del binario ya extraído a un directorio temporal, y el componente usa `PostDeployFn` para limpiar el temp. Más complejo.

Usar Opción A.

---

## Estado actual de `allComponents` — delta respecto al código existente

| Componente | Estado actual | Acción |
|---|---|---|
| brain | SourceFn usa `dist/` en Win/Linux | Corregir a `nativeBin()` |
| nucleus | SourceFn usa `dist/` en Win/Linux | Corregir a `nativeBin()` |
| sentinel | SourceFn usa `dist/` en Win/Linux | Corregir a `nativeBin()` |
| metamorph | SourceFn usa `dist/` en Win/Linux | Corregir a `nativeBin()` |
| workspace | SourceFn usa `conductor/dist/bloom-conductor` en Win/Linux | Corregir; agregar Linux con linux-unpacked |
| setup | SourceFn usa `setup/dist/BloomSetup.pkg` (Darwin) y `.exe` (Win) | Corregir a `native/bin/`; agregar Linux |
| host | SourceFn usa `host/bin/{GOOS}/` — path incorrecto | Corregir a `nativeBin()` para Win/Darwin; confirmar Linux |
| nssm | SourceFn usa `vendors/nssm/nssm.exe` | Corregir a `installer/native/bin/win64/nssm/nssm.exe` |
| hook | Entrada existente — binario Go inexistente | Eliminar |
| bootstrap | SourceFn usa `bootstrap/dist/bootstrap.exe` en Win | Corregir a `nativeBin()` |
| cortex | Correcto | No modificar |
| ionpump | Correcto | No modificar |
| vsix | Correcto | No modificar |
| config | Correcto | No modificar |
| sensor | No existe | Agregar |
| hooks | No existe | Agregar |
| ollama | No existe | Agregar |
| temporal | No existe | Agregar |
| node | SourceFn usa `vendors/node/{GOOS}/` | Corregir path; agregar extracción tar.xz para Linux |
| runtime | No existe | Agregar |
| chrome | No existe | Agregar con ExtractFn |

---

## Restricciones de implementación

1. **No modificar** `ionpumpPostDeploy`, `vsixPostDeploy`, `selfExec`, `resolvePython`, `resolveCodeCLI`, `runRollout`, `activeComponents`, `componentKeys`, ni ninguna otra función fuera de `allComponents` y los nuevos helpers — salvo el struct `component` para agregar `ExtractFn`.

2. **`rollout_other.go`**: refactorizar `ensureElevated()` para que Darwin y Linux no retornen error sino que procedan sin elevación (o implementen su propio mecanismo si se requiere sudo). Linux y Darwin deben poder correr `metamorph rollout`.

3. **Idempotencia**: cada componente debe poder ejecutarse múltiples veces sin dejar estado corrupto. Para extracción, limpiar el destino antes. Para copy de directorios, `copyDir` ya lo maneja (sobreescribe).

4. **`copyDir` ya preserva symlinks**: el código existente en `copyDir` maneja `os.ModeSymlink` correctamente. Los bundles `.app` de Electron se copian correctamente sin modificaciones.

5. **Permisos post-extracción**: en Darwin y Linux, después de extraer o copiar binarios ejecutables, aplicar `chmod 0755`. Solo `chrome-sandbox` en Linux necesita `chmod 4755` con `chown root:root`.

6. **El struct `component` en Go**: agregar el campo `ExtractFn` como puntero a función. La signatura es `ExtractFn func(src, dstDir string) error`. En `runRollout`, antes de ejecutar el copy, verificar si `ExtractFn != nil` y en ese caso usarlo en lugar de `copyFile`/`copyDir`.
