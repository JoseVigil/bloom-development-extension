# Bloom — Cross-Platform Git Filters

Solución para evitar colisiones de artefactos de build entre Darwin, Linux y Windows.

## El problema

Cada vez que compilás en cualquier plataforma, el sistema de build regenera
archivos como `build_number.txt`, `build_info.h`, `*.meta.json`, etc. con
valores locales (timestamps, contadores, paths). Git los ve como modificados
y cualquier push desde una máquina pisa los valores de otra.

## La solución

Git tiene un mecanismo llamado **clean filter**: intercepta el contenido de un
archivo justo antes de guardarlo en el objeto store (`.git/objects`). El filtro
normaliza los valores volátiles a ceros canónicos. El archivo local conserva
sus valores reales; git nunca los ve.

```
tu archivo local          filtro clean             objeto en git
build_number: 134   →→→  build_number: 0    →→→   siempre igual
build_date: 2026-06-12    build_date: 1970-01-01    en todas las máquinas
```

El filtro `smudge` (checkout → disco) es `cat` — no toca nada. Cada máquina
compila con sus valores reales, git almacena solo la forma canónica.

## Archivos del sistema

```
.gitattributes                          ← asigna filtros a cada archivo
scripts/git-filters/
    setup.sh                            ← registra los filtros (correr una vez)
    clean-stamp.sh                      ← normaliza build_number.txt, VERSION
    clean-meta.py                       ← normaliza *.meta.json, build_info.json
    clean-header.sh                     ← normaliza build_info.h
    clean-pymod.sh                      ← normaliza brain/__build__.py
    clean-spec.sh                       ← normaliza brain/build_deploy/brain.spec
    clean-lockfile.py                   ← normaliza package-lock.json
    clean-tree.sh                       ← normaliza tree/metamorph_tree.txt
```

## Archivos cubiertos por los filtros

| Filtro | Archivos | Qué normaliza |
|---|---|---|
| `bloom-stamp` | `*/build_number.txt`, `*/build_number.effective.txt`, `installer/bootstrap/VERSION` | Enteros y contadores → `0` |
| `bloom-meta` | `*.meta.json`, `build_info.json`, `version.json`, `conductor/setup/package.json` | `build_number`, `build_date`, `built_at`, `platform`, `arch`, `git_commit` → valores canónicos |
| `bloom-header` | `installer/host/build_info.h` | `BUILD_NUMBER`, `BUILD_DATE`, `BUILD_TIME` → `0` / epoch |
| `bloom-pymod` | `brain/__build__.py` | `BUILD_NUMBER = N` → `BUILD_NUMBER = 0` |
| `bloom-spec` | `brain/build_deploy/brain.spec` | Rutas absolutas `$HOME` → `__HOME__` |
| `bloom-lockfile` | `package-lock.json` | Hashes `resolved`, `integrity` eliminados |
| `bloom-tree` | `tree/metamorph_tree.txt` | Timestamps y rutas absolutas eliminados |

## Setup inicial — correr una vez por clon

```bash
bash scripts/git-filters/setup.sh
```

Esto registra los filtros en `.git/config` local. Es configuración local de git,
no se propaga con push/pull — cada clon nuevo necesita correrlo.

Después del setup, forzar que git re-evalúe los archivos que ya estaban sucios:

```bash
git ls-files -m | xargs git rm --cached
git add .
git restore --staged .
```

## Flujo de trabajo diario

El flujo git es exactamente igual a antes. Los filtros operan de forma
transparente — no hay comandos nuevos que aprender.

### Pull

```bash
git pull
```

Si el pull falla por archivos locales modificados (artefactos de build),
descartarlos primero:

```bash
git restore brain/build_number.txt brain/build_number.effective.txt \
    installer/bootstrap/VERSION installer/bootstrap/bootstrap.meta.json
# ... o todos de una:
git ls-files -m | xargs git restore --
git pull
```

### Ver cambios propios

```bash
git status
```

Los artefactos de build ya no deberían aparecer. Si aparecen, los filtros
no están registrados en esa máquina — correr `setup.sh`.

### Commitear

```bash
git add src/mi_archivo.go
git add installer/micomponente/mi_script.sh
git commit -m "feat: descripción"
git push
```

Nunca usar `git add .` — puede incluir artefactos de build si los filtros
no están activos.

### Verificar que los filtros están activos

```bash
git config --list | grep "^filter\.bloom"
```

Debe mostrar los 7 filtros: `bloom-stamp`, `bloom-meta`, `bloom-header`,
`bloom-pymod`, `bloom-spec`, `bloom-lockfile`, `bloom-tree`.

## Consideraciones por plataforma

### Darwin y Linux
Python disponible como `python3`. El `setup.sh` lo detecta automáticamente.

### Windows (Git Bash)
Python puede estar disponible como `python` en lugar de `python3`.
Si `setup.sh` falla con `python3: command not found`, correr manualmente:

```bash
git config filter.bloom-meta.clean 'python "C:/ruta/al/repo/scripts/git-filters/clean-meta.py"'
git config filter.bloom-lockfile.clean 'python "C:/ruta/al/repo/scripts/git-filters/clean-lockfile.py"'
```

El `setup.sh` detecta esto automáticamente desde la v2 en adelante.

### CRLF en Windows
Git Bash puede mostrar warnings de `LF will be replaced by CRLF` al hacer
`git add`. Es normal y no afecta el funcionamiento de los filtros.

## Archivos que nunca se commitean manualmente

Estos archivos son generados por el sistema de build. Los filtros los manejan
solos — no hay que agregarlos a commits ni a `.gitignore`.

- `*/build_number.txt` y `*/build_number.effective.txt`
- `installer/bootstrap/VERSION`
- `*.meta.json`
- `installer/host/build_info.h`
- `brain/__build__.py`
- `brain/build_deploy/brain.spec`
- `package-lock.json`
- `tree/metamorph_tree.txt`

## Archivos grandes (binarios compilados)

GitHub rechaza archivos mayores a 100MB. Los binarios compilados van en
`.gitignore`, no en el repo.

El directorio `installer/termporal/` (con r) ya está en `.gitignore`.
Verificar que `installer/temporal/` (sin r) también esté cubierto si se usa.

## Setup en máquina nueva

```bash
git clone git@github.com:JoseVigil/bloom-development-extension.git
cd bloom-development-extension
bash scripts/git-filters/setup.sh
```

Listo. A partir de ahí el flujo es git normal.
