# Procedimiento: actualizar `server-bootstrap.js` con `build-all.py`

> Reemplaza la recomendación anterior de `npm run build:bundle` + `nucleus service
> restart-bootstrap` a mano. Ese camino deja el artefacto en
> `installer/native/bin/bootstrap/` pero **no lo copia a `NUCLEUS_HOME/bin/bootstrap/`**,
> que es de donde `bootControlPlane()` realmente lo lee en runtime. `build-all.py --only
> bootstrap` hace las dos cosas en un solo comando.

---

## 0. El comando (idéntico en Linux, Windows y macOS)

```bash
python3 build-all.py --only bootstrap
```

En Windows, según cómo tengas el PATH, puede ser `python` en vez de `python3`. Correrlo
siempre desde la **raíz del repo** (`ROOT`), porque el script importa
`scripts.capture_versions` con path relativo.

---

## 1. Qué hace exactamente (leyendo `build_bootstrap()` en el script)

```
Paso 0/5  npm install en webview/app/     ← solo si node_modules falta o package.json
                                             es más nuevo que node_modules/.package-lock.json
Paso 1/5  python3 version-bootstrap.py    ← incrementa build_number en bootstrap.meta.json
Paso 1.5  npm install en ROOT/            ← mismo chequeo de mtime, evita TS2688 (@types/* faltantes)
Paso 2/5  npm run compile                 ← TypeScript → out/ (bundle.js depende de esto)
Paso 3/5  npm run build:bundle            ← esbuild genera bundle.js directo en
                                             installer/native/bin/bootstrap/
Paso 4/5  copiar static/                  ← installer/bootstrap/static/ → bin nativo (swagger-ui)
Paso 5/5  copiar runtime files            ← bootstrap.meta.json, server-bootstrap.js, VERSION,
                                             bundle.js.map, version-bootstrap.py

── Rollout automático (solo si los 5 pasos anteriores OK) ──
  installer/native/bin/bootstrap/  →  NUCLEUS_HOME/bin/bootstrap/
```

El rollout es la parte que se pierde si corrés los pasos a mano con `npm run build:bundle`
suelto — por eso el comando único es preferible para probar un cambio real.

**Importante:** `--only bootstrap` **no** requiere nada de `builds/windows/` ni
`builds/unix/` (esos scripts son solo para los componentes Go — nucleus, sentinel,
metamorph, sensor). Bootstrap es 100% Python + npm, así que este comando corre igual de
liviano en las tres plataformas sin depender de compiladores nativos.

---

## 2. Prerrequisitos por plataforma

| Requisito | Linux | macOS | Windows |
|---|---|---|---|
| Python 3 | `python3` en PATH | `python3` en PATH | `python` o `python3` en PATH |
| Node/npm | `npm` en PATH | `npm` en PATH | `npm.cmd` (el script ya lo resuelve solo) |
| `node_modules` en ROOT y `webview/app/` | Se instalan solos si faltan (pasos 0 y 1.5) | ídem | ídem |

No hace falta nada más específico de plataforma para este comando puntual.

---

## 3. Dónde mirar el resultado

### 3.1 En la salida de consola

Al final de los 5 pasos vas a ver:

```
✅ bootstrap build: N archivo(s) → .../installer/native/bin/bootstrap/
```

y después, en la sección de rollout:

```
── Rollout: sincronizando bootstrap a NUCLEUS_HOME ──
Copiando bootstrap: .../installer/native/bin/bootstrap/ → NUCLEUS_HOME/bin/bootstrap/
  ✅ bootstrap: N archivo(s) → NUCLEUS_HOME/bin/bootstrap/
```

Si el segundo bloque **no aparece**, el rollout falló o se saltó — no reinicies el
Control Plane todavía, revisá el error arriba primero.

### 3.2 Confirmar que el archivo realmente cambió en destino

`NUCLEUS_HOME` varía por plataforma (ver tabla abajo). Comparar el build number entre
origen y destino es la forma más rápida de confirmar que el rollout copió la versión nueva:

```bash
# Origen (recién buildeado)
cat installer/native/bin/bootstrap/bootstrap.meta.json | grep build_number

# Destino (lo que el servicio realmente va a ejecutar)
cat "$NUCLEUS_HOME/bin/bootstrap/bootstrap.meta.json" | grep build_number
```

Los dos números deben coincidir.

### 3.3 Tabla de `NUCLEUS_HOME` por plataforma

Resuelto por `_resolve_nucleus_home()` en el propio `build-all.py`:

| Plataforma | Path por defecto | Override |
|---|---|---|
| Windows | `%LOCALAPPDATA%\BloomNucleus` | env `BLOOM_NUCLEUS_HOME` |
| macOS | `~/Library/BloomNucleus` | env `BLOOM_NUCLEUS_HOME` |
| Linux | `${XDG_DATA_HOME:-~/.local/share}/BloomNucleus` | env `BLOOM_NUCLEUS_HOME` |

Si tenés `BLOOM_NUCLEUS_HOME` seteado en tu entorno, ese gana en las tres plataformas —
confirmalo con `echo $BLOOM_NUCLEUS_HOME` (bash) / `echo $env:BLOOM_NUCLEUS_HOME`
(PowerShell) antes de buscar el path por defecto.

---

## 4. Reiniciar el Control Plane con el bundle nuevo

Una vez confirmado el rollout (paso 3.2), reiniciar solo bootstrap sin tocar el resto del
stack:

```bash
nucleus service restart-bootstrap
nucleus --json service restart-bootstrap   # si querés pid/state en JSON
```

Verificar:

```bash
nucleus service status
nucleus health --component control_plane
```

---

## 5. Checklist para probar el procedimiento de punta a punta

- [ ] Hacer un cambio trivial y verificable en `server-bootstrap.js` (ej: un `console.log`
      con un string único, o un comentario con timestamp)
- [ ] `python3 build-all.py --only bootstrap`
- [ ] Confirmar los 5 pasos OK + bloque de rollout en la salida
- [ ] Comparar `build_number` origen vs. destino (sección 3.2)
- [ ] `nucleus service restart-bootstrap`
- [ ] `nucleus health --component control_plane` → `healthy: true`, `state: RUNNING`
- [ ] Confirmar el cambio real: revisar
      `NUCLEUS_HOME/logs/nucleus/control_plane/nucleus_control_plane_YYYYMMDD.log`
      y buscar el `console.log` o comentario que agregaste (o su efecto observable)

Repetir el mismo checklist en las otras dos plataformas usando el mismo comando — el único
paso que cambia entre plataformas es dónde mirás `NUCLEUS_HOME` (tabla 3.3).

---

## 6. Nota al margen

Si en algún momento necesitás rebuildear también el binario `nucleus` (no solo bootstrap),
es otro `--only`:

```bash
python3 build-all.py --only nucleus
```

Ese sí depende de `builds/windows/build-component.bat` o `builds/unix/build-component.sh`
según plataforma. Para bootstrap solo, como está en este documento, no hace falta.
