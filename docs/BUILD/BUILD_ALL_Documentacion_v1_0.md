# `build-all.py` — Documentación funcional

**Versión documentada:** con los dos controles de apagado de Brain/Nucleus agregados en esta sesión
(Control 1 en build, Control 2 en rollout)

---

## 1. Qué hace, en una frase

Compila los componentes Go/Node del ecosistema Bloom (Brain, Nucleus, Sentinel, Metamorph, Sensor,
Workspace, Setup, Bootstrap), y a los que corresponde, además los **rollea** — los copia desde el
directorio de salida del build hacia `NUCLEUS_HOME/bin/<componente>/`, que es de donde el sistema
instalado los toma en producción.

## 2. Flujo general de una corrida

```
1. Se arma la lista de pasos disponibles (all_steps): un tuple (key, nombre_display, función) por
   componente/tarea.
2. Se filtra esa lista según --only / --skip (ver §4).
3. Por cada paso, en orden:
     a. Se ejecuta la función de build correspondiente.
     b. Si el build fue exitoso Y el componente está en _ROLLOUT_GO_COMPONENTS
        ("metamorph", "nucleus", "brain", "sentinel") → se ejecuta rollout_component()
        inmediatamente después, en el mismo ciclo — build y rollout de un componente van
        pegados, no son pasos independientes que un usuario dispare por separado.
     c. Caso especial: si el paso fue "bootstrap", se ejecuta rollout_bootstrap() en vez de
        rollout_component() genérico.
4. Al final, se registra el PATH en ~/.zshrc y ~/.zshenv, y se imprime un resumen de resultados.
```

## 3. Componentes que buildea

| Componente | Función de build | ¿Rollea automáticamente? |
|---|---|---|
| `brain` | `build_brain()` — función dedicada, propia | Sí (`_ROLLOUT_GO_COMPONENTS`) |
| `nucleus` | `build_go_component("nucleus")` — función genérica compartida | Sí |
| `sentinel` | `build_go_component("sentinel")` | Sí |
| `metamorph` | `build_go_component("metamorph")` | Sí |
| `sensor` | `build_go_component("sensor")` | No (no está en `_ROLLOUT_GO_COMPONENTS`) |
| `bootstrap` | función propia (no cubierta en detalle en esta documentación) | Sí, vía `rollout_bootstrap()` |
| `setup`, `workspace` | `build_setup()`, `build_workspace()` | No |

`build_go_component(component)` es genérica — un mismo cuerpo de función sirve para varios
componentes, invocando el script de plataforma correspondiente (`build-component.sh` en
Linux/macOS, `build-component.bat` en Windows) con el nombre del componente como argumento.

## 4. Flags `--only` / `--skip`

Ambos toman una lista de `key` (los identificadores cortos: `brain`, `nucleus`, `sentinel`, etc.),
no el nombre display. `--only` restringe la corrida a esa lista; `--skip` la excluye. Se pueden
combinar. Si el resultado de aplicar ambos deja la lista de pasos vacía, el script termina sin
hacer nada (`sys.exit(0)`), con un aviso.

Importante: **`--only nucleus` no solo compila Nucleus — también dispara su rollout automático**,
porque el enganche build→rollout vive en el loop principal de `main()`, no dentro de la función de
build. No hace falta (ni existe) un flag separado para "solo build, sin rollout".

## 5. El mecanismo de rollout — `rollout_component()`

Copia `_DEV_BIN_BASE/<componente>/` → `NUCLEUS_HOME/bin/<componente>/`, con `dirs_exist_ok=True`
(sobreescribe lo que ya había).

**Manejo especial en Linux — "Text file busy":** sobreescribir un ejecutable que está en uso falla
con `[Errno 26] Text file busy`. El script evita esto haciendo `unlink()` del archivo destino antes
de copiar — el proceso que lo tiene abierto sigue sirviendo desde el inodo viejo, el nuevo binario
ocupa un inodo nuevo, y ambos coexisten sin conflicto **hasta que el proceso viejo termine**. Esto
evita el crash del copy, pero por sí solo no hace que el proceso viejo se entere de que hay un
binario nuevo — de ahí la necesidad de los controles de parada (§6).

## 6. Controles de apagado de servicio — agregados en esta sesión

### Por qué existen

Sin esto, reconstruir Brain o Nucleus dejaba el proceso viejo corriendo en memoria (gestionado por
systemd `--user` en Linux, con `Restart=on-failure`) mientras el binario nuevo ya estaba en disco —
el proceso viejo nunca se enteraba de la actualización, y cualquier intento posterior de relanzar el
servicio limpio chocaba contra el puerto que el viejo nunca soltó (mismo síntoma que
`Address already in use` documentado en `brain-troubleshooting.md` §0).

### Los dos puntos de control (por qué son dos y no uno)

- **Control 1 — en el build** (`build_brain()` para Brain; dentro de `build_go_component()`,
  condicionado a `component == "nucleus"`, para Nucleus). Se ejecuta como primer paso de la
  función, antes de compilar.
- **Control 2 — en el rollout** (`rollout_component()`, condicionado a `component in ("brain",
  "nucleus")`). Se ejecuta como primer paso de la función, antes de copiar archivos.

Ambos controles llaman a las mismas funciones de apagado — no hay lógica duplicada, solo dos puntos
de invocación. El Control 2 es **idempotente** respecto al Control 1: si el servicio ya fue parado
en el build, el segundo intento no hace nada nuevo (los helpers detectan "no hay nada corriendo"
como caso válido, no como error). La razón de tener los dos, y no solo uno: build y rollout están
hoy pegados en el mismo ciclo de `main()` (§2), pero el Control 2 es una red de seguridad
independiente para cualquier escenario futuro donde el rollout se dispare sin pasar por el build de
este script — por ejemplo, un flujo de Metamorph que rollee binarios ya compilados (ver el prompt
adjunto, `METAMORPH_Stop_Services_Prompt_v1_0.md`).

### Cómo se detiene cada servicio

**Brain** (`_stop_running_brain_service()`):
1. Linux: `systemctl --user stop com.bloom.brain` — nombre de unit confirmado contra la instalación
   real (`service-installer-brain-linux.js`).
2. Red de seguridad adicional en Linux/macOS: `fuser -k 5678/tcp`, por si quedó algo suelto fuera
   del control de systemd (por ejemplo, levantado a mano con `nohup`, ver
   `brain-troubleshooting.md` §4).
3. macOS: `launchctl stop com.bloom.brain` — label asumido por convención, no confirmado.
4. Windows: `nssm stop com.bloom.brain` — asumido por convención, no confirmado.
5. `sleep(2)` después de parar — race condition confirmada: el kernel puede tardar en liberar el
   socket tras el kill/stop, aunque el proceso ya no aparezca listado (ver
   `brain-troubleshooting.md` §0).

**Nucleus** (`_stop_running_nucleus_service()`):
1. Mecanismo primario: el comando nativo `nucleus service stop` (vía `shutil.which("nucleus")`,
   evita asumir que está en un path fijo). Preferido sobre systemctl porque es un shutdown
   gestionado — apaga los procesos hijos de forma prolija (`temporal_server`, `nucleus_worker`,
   `control_plane_api`, y `brain_server` si fue adoptado por el supervisor de Nucleus) en vez de un
   corte abrupto.
2. Red de seguridad: `systemctl --user stop com.bloom.nucleus` en Linux — **nombre de unit NO
   confirmado**, asumido por simetría con `com.bloom.brain`. Ajustar si difiere. Equivalentes en
   macOS (`launchctl`) y Windows (`nssm`), también sin confirmar.
3. Mismo `sleep(2)` post-stop que Brain, misma razón.

### Caveat abierto, no resuelto en este parche

El supervisor de Nucleus tiene su propia función `startBrainServer()` que puede levantar Brain como
proceso hijo directo, independiente del unit systemd standalone `com.bloom.brain`. Es decir, existen
dos caminos posibles por los que Brain puede terminar corriendo. Este parche no resuelve esa
duplicidad — solo garantiza que cada mecanismo conocido (el unit standalone y el proceso maestro de
Nucleus) se apague antes de reconstruirse. Queda como tema aparte a resolver cuando se audite
`service.go` con más profundidad.

## 7. Qué NO cubre esto todavía

- **Metamorph** — mencionado explícitamente como fuera de alcance por decisión del usuario en esta
  sesión ("otro tema, más adelante"). Ver el prompt adjunto para encarar esa pieza en otra sesión.
- **El instalador** (`installer.js`) — si la reinstalación real del sistema pasa por el instalador
  empaquetado sin recompilar vía `build-all.py`, estos controles no se disparan. Ese es el ítem 6.6
  ya identificado en el roadmap (falta un "detener servicios existentes" del lado del instalador,
  no solo del lado del build).
