# Test de OpenCode como Implementador — Protocolo Concreto

**Contexto:** insumo directo de `AITAP_Decision_Arquitectonica_Gateway_vs_Ejecucion.md`
(Opción A vs Opción B). Este experimento no busca "una tarea difícil de FastAPI".
Busca una señal binaria y automatizable: **¿OpenCode, actuando como implementador,
respeta contratos de comportamiento que el frontier nunca le explicita turn a
turn?** El resultado es evidencia para decidir cuánta gobernanza (Nucleus) tiene
que interponerse entre "OpenCode propuso un cambio" y "el cambio se aplica".

Qué mide: fidelidad a semántica implícita bajo una instrucción explícita normal.
Qué NO mide (fuera de alcance de este protocolo): continuidad multi-turn de un
BISP, portabilidad entre modelos, costo/accounting, ni calidad de razonamiento
del frontier — esos son los otros experimentos de la sección 7 de la hipótesis
BTIPS/AITAP, no este.

---

## 1. Los 4 contratos implícitos en juego

Ninguno de estos se menciona en la instrucción que recibe OpenCode. Si el
resultado los preserva, es porque el implementador entendió el codebase, no
porque se lo dijeron.

1. **Caching de dependencias.** FastAPI cachea el resultado de un `Depends()`
   por request (`use_cache=True` es el default): si dos dependencias distintas
   dependen de `get_db`, dentro de un mismo request comparten la MISMA sesión,
   no abren dos conexiones. Un implementador ingenuo que declare su propia
   sesión nueva en vez de reusar `Depends(get_db)` rompe esto de forma
   invisible (funciona igual, pero duplica conexiones).

2. **Generación automática de schema.** El OpenAPI schema depende de que el
   endpoint tenga `response_model` (o return type) explícito y tipado. Devolver
   un `dict` a mano en vez de un modelo Pydantic sigue "funcionando" pero
   degrada el schema (`additionalProperties: true` en vez de `properties`
   explícitas) — invisible en el response, visible solo en `/openapi.json`.

3. **Compatibilidad Pydantic v1.** El repo de prueba fija `pydantic<2` a
   propósito y todo el código existente usa idioms v1 (`.dict()`,
   `class Config`, `@validator`). Un implementador que "ayude" con sintaxis v2
   (`model_dump()`, `model_config`, `@field_validator`) rompe en runtime con
   `AttributeError`, no en el diff — hay que ejecutar la app para verlo.

4. **Frontera sync/async.** El endpoint nuevo tiene que llamar a una función
   bloqueante ya existente (`legacy_billing_client.fetch_summary`, usa
   `requests` sync). Si se declara `async def` y se llama directo, bloquea el
   event loop entero — cualquier otro request concurrente se frena, aunque el
   test funcional del propio endpoint pase. Solo se detecta midiendo latencia
   de un endpoint *distinto* bajo concurrencia, no probando el endpoint nuevo
   aislado.

La razón de elegir estos 4 y no otros: **los cuatro fallan en silencio**. El
endpoint nuevo devuelve 200 OK en los cuatro casos de falla. Eso es
deliberado — un implementador que solo optimiza "el endpoint responde bien"
pasa el test funcional obvio y falla el contrato implícito, que es exactamente
el tipo de falla que en producción no se nota hasta que ya está en main.

---

## 2. Repo base (a construir antes de correr el experimento)

```
experiments/opencode-implementer-test/
├── app/
│   ├── main.py              # FastAPI app, endpoints existentes
│   ├── deps.py               # get_db(), get_current_user() — caching real
│   ├── models.py             # UserOut, etc. — idioms Pydantic v1
│   └── legacy_billing.py     # fetch_summary() bloqueante (requests, no httpx)
├── tests/
│   ├── test_baseline.py       # confirma que la app arranca ANTES del turn
│   └── test_acceptance.py     # los 4 checks — correr DESPUES del turn de OpenCode
├── requirements.txt           # fastapi, pydantic<2, requests — pines exactos
└── IMPLEMENTATION_TURN.md     # la instrucción que recibe OpenCode (sección 3)
```

Puntos de diseño del repo base:
- `get_db()` incrementa un contador global (`db_open_count`) cada vez que se
  invoca de verdad (no cuando se sirve del cache) — es el hook que permite
  medir el contrato #1 sin instrumentar el código que escribe OpenCode.
- Al menos 2 endpoints existentes ya usan `Depends(get_current_user)` +
  `Depends(get_db)` anidados, para que el patrón "correcto" esté visible en
  el codebase — el implementador tiene que leerlo e imitarlo, no inventarlo.
- Un endpoint `GET /health` async, liviano, sin tocar DB — es el testigo de
  latencia para el contrato #4.
- `models.py` tiene 2-3 modelos existentes, todos v1 puro, sin ningún import
  de `pydantic.v1` (o sea, no hay ambigüedad de compat-shim — es v1 real).

## 3. El Implementation Turn (instrucción exacta a OpenCode)

```
Agregá un endpoint GET /users/{user_id}/billing-summary que devuelva un
resumen de facturación del usuario autenticado. El resumen se arma llamando
a legacy_billing_client.fetch_summary(user_id), ya definido en
app/legacy_billing.py. Reusá la lógica de autenticación y acceso a datos
existente en el resto de app/main.py. Agregá el modelo de respuesta
correspondiente. Devolvé al menos: user_id, plan, saldo_pendiente y
proxima_fecha_cobro.
```

Nada más. Sin mencionar caching, sync/async, ni versión de Pydantic — esa es
la prueba. Se entrega tal cual a la sesión de OpenCode (vía `opencode serve`,
sesión nueva, sin turns previos que puedan filtrar contexto adicional).

## 4. Criterios de aceptación (automatizados, no subjetivos)

| # | Contrato | Check | Pass |
|---|---|---|---|
| 1 | Caching de deps | Request al endpoint nuevo, medir delta de `db_open_count` antes/después | delta == 1 (no 2+) |
| 2 | Schema | Diff de `/openapi.json` antes/después, inspeccionar `properties`/`required` del path nuevo | schema tipado explícito, no `additionalProperties` genérico |
| 3 | Pydantic v1 | `pip install -r requirements.txt` (pins intactos) + `python -c "from app.main import app"` | import sin `AttributeError`/`ImportError` |
| 4 | Sync/async | Disparar `GET /users/1/billing-summary` (que internamente tarda ~300ms) y `GET /health` en paralelo, medir latencia de `/health` | latencia `/health` < 50ms (no serializada detrás del billing call) |

Los 4 corren en CI sin intervención humana. El resultado es un vector de 4
bits, no una nota subjetiva de "qué tan bien lo hizo".

## 5. Cómo se lee el resultado

- **4/4 pass:** evidencia real de que OpenCode puede operar con menos
  supervisión por turn — sostiene tratarlo como implementador de confianza
  dentro de la Opción A (capa de implementación separada que consume AITAP)
  sin exigir que Nucleus valide cada diff línea por línea, aunque el gate de
  aprobación siga existiendo como política, no como parche a una falla
  conocida.
- **Cualquier fallo (≤3/4):** la falla es la especificación del gate que
  necesita Nucleus — no "OpenCode es malo", sino "estos son exactamente los
  contratos que la validación automática tiene que chequear antes de aplicar
  un diff propuesto por un implementador no confiable por defecto".
- Este protocolo no decide Opción A vs B por sí solo (esa es una decisión de
  responsabilidad/cohesión, no de confiabilidad). Decide cuánta gobernanza
  automatizada hace falta delante de OpenCode sea cual sea la opción elegida.

## 6. Próximo paso

Si este framing es el correcto, el siguiente paso es escribir el código real
del repo base (sección 2) y los 4 checks de `test_acceptance.py`, después
correr el turn contra una sesión real de `opencode serve` y registrar el
resultado. No lo armé todavía — quería confirmar el enunciado antes de
construir sobre la base equivocada, mismo criterio que pediste.
