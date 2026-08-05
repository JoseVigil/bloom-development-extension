# Brief de Contexto — Proyecto Harness (para separar de Alfred sin perder capacidad de merge)

> Este documento existe porque la sesión de Claude que propuso "sacá el harness a un repo
> separado" no tenía visibilidad de BTIPS v6.0 ni de BATCAVE_ARCHITECTURE.md. Su
> recomendación de fondo (repo separado, no tocar Alfred) es correcta — pero necesita estos
> cinco bloques de contexto para no diseñar algo que luego sea imposible de enlazar.
>
> Nota agregada 2026-08-05: la decisión final fue construir el harness DENTRO de este repo
> (`bloom-development-extension/agentic-harness/`), no en un repo separado — ver
> `DECISION-live-source.md` en esta misma carpeta. El razonamiento de este brief sobre forma,
> invariantes y separación de autoridad sigue aplicando igual; lo único que cambió es que
> "separado" ahora es una carpeta lógica dentro del mismo repo, no un repo físicamente aparte.

---

## 0. La idea central, primero

**Alfred ya es la prueba de que "separado pero enlazable" funciona en este sistema.**
Alfred vive en Batcave — un control plane remoto, en otro repo, corriendo en GitHub
Codespaces, sin acceso local privilegiado — y sin embargo opera el Nucleus local sin
comprometer su autoridad. Lo logra siguiendo tres reglas, no por magia arquitectónica:

1. Nunca firma nada (`Nucleus local (firma el intent) ← AUTORIDAD SIEMPRE LOCAL`).
2. Nunca ejecuta directamente — traduce intención en intent/Mandate y lo **enruta**.
3. Todo su conocimiento de negocio viene de un contrato externo cargado en runtime
   (`.ai_bot.sovereign.bl`), nunca hardcodeado en su propio código.

El proyecto harness nuevo debería copiar exactamente este mismo patrón: repo propio,
sin autoridad, sin datos de negocio embebidos, hablando con el resto del sistema a
través de contratos versionados. Si hace esto, "enlazarlo después" es un problema de
configuración (apuntar el cliente a un Nucleus real), no de reescritura.

---

## 1. Qué es Alfred (para que la sesión no lo trate como "un bot cualquiera")

- Alfred es el **agente remoto soberano** del ecosistema Bloom. Corre en Batcave
  (GitHub Codespaces), no en la máquina local.
- No es un chatbot genérico: tiene **conocimiento total del modelo de negocio de la
  organización** vía un archivo de contrato — `.ai_bot.sovereign.bl` — que contiene:
  - descripción del modelo de negocio en lenguaje natural,
  - reglas de gobernanza (qué puede hacer sin aprobación humana),
  - mapa de proyectos activos y su estado,
  - capacidades habilitadas para esa instancia,
  - usuarios autorizados y sus niveles de permiso (Master / Architect / Specialist).
- Ese archivo vive en `.nucleus-{organization}/.core/.ai_bot.sovereign.bl` y **nunca
  se carga desde fuera del Nucleus de la organización** (`INVARIANT-ALF-004`).
- La cadena de autoridad es siempre: `mobile → Alfred (interpreta) → BlindJudge (valida
  autoridad) → Nucleus local (firma) → Brain (ejecuta) → resultado en streaming`.
  Alfred nunca está en la posición de firmar ni ejecutar.

**Consecuencia directa para el harness:** todo lo que hoy es "restricción de plataforma
y modelo" de Alfred no vive en su código — vive en ese archivo `.bl` externo, cargado
en runtime, específico de la organización. Eso es lo que la otra sesión no podía saber
sin este doc, y es la pieza que **no se replica copiando código**: se replica
construyendo el mismo mecanismo de carga de contrato, apuntado (por ahora) a un
contrato de prueba/mock.

---

## 2. Los invariantes no negociables (tomados literal de BATCAVE_ARCHITECTURE.md §11)

```
INVARIANT-ORG-001: Sin nombres de organización hardcodeados
INVARIANT-ORG-002: Todos los paths derivan de OrganizationContext
INVARIANT-ORG-003: Configs cargan desde archivos org-específicos
INVARIANT-ORG-004: Logs segregados por organización
INVARIANT-ORG-005: Endpoints namespaciados por organización
INVARIANT-ORG-006: Runtime data aislado por organización
INVARIANT-ORG-007: .ownership.json es la fuente de verdad de identidad
INVARIANT-ALF-001: Alfred solo opera bajo un contrato soberano válido
INVARIANT-ALF-002: Cada instrucción remota pasa por BlindJudge antes de llegar a Alfred
INVARIANT-ALF-003: Alfred no ejecuta intents directamente — los enruta a Nucleus local
INVARIANT-ALF-004: El contrato .ai_bot.sovereign.bl nunca se carga desde fuera del Nucleus org
```

Si el harness nuevo respeta la **forma** de estos invariantes (no los valores, la
forma), queda estructuralmente compatible desde el día uno. Concretamente:

- No hardcodear el nombre de organización/proyecto en ningún path — usar una función
  tipo `resolveOrganization()` / `OrganizationContext` desde el inicio, aunque hoy
  resuelva a un mock local.
- El harness nunca debe tener una función que "firme" un intent. Si necesita simular
  la firma para testear, que sea un stub explícitamente marcado como no-autoritativo
  (`signed_by: "mock-nucleus"` o similar), nunca algo que en el flujo real podría
  confundirse con autoridad real.
- Loggear igual que Batcave: `.logs/{governance,security,relay}`, cada entry
  etiquetada con organización/timestamp/actor. Esto es literalmente la pieza de
  "trace exportable" que la recomendación original ya pedía — no hay que inventarla,
  hay que copiar el shape que el sistema ya usa.

---

## 3. El contrato estructural que si no se respeta, no hay merge posible

De `contracts_tree.txt` (`bloom-development-extension/contracts/`):

```
errors.ts | state-machines.ts | types.ts | websocket-protocol.ts
```

Este paquete es el contrato compartido que **todo** lo que hable con Bloom debe
consumir. No es opcional y no se reinventa: `state-machines.ts` define las máquinas de
estado válidas, `websocket-protocol.ts` el protocolo de mensajes, `types.ts` las formas
de datos. **Cualquier repo nuevo que quiera eventualmente enlazarse tiene que importar
(o vendorizar, versionado) este paquete desde el día uno** — aunque al principio solo
lo use contra un mock. Si el harness define su propio protocolo de mensajes "por
ahora, ya lo migro después", el después no existe: vas a tener dos protocolos y una
migración de facto, no un merge.

Además, el patrón de pipeline es idéntico en **todos** los tipos de intent, tanto a
nivel Project (`bloom_project_tree.txt`) como a nivel Nucleus
(`bloom_nucleus_tree.txt`):

```
.{fase}/
  ├── .payload.json
  ├── .index.json
  └── .response/
      ├── .raw_output.txt
      ├── .report.json
      └── .staging/
```

Esto se llama contrato BISP (Bloom Intent... Structured Payload, por el nombre que
aparece en el sistema — "BISP") y es la interfaz mínima entre cualquier ejecutor
(Brain, o el harness) y el filesystem de intents. Si el harness produce logs o
resultados con otra forma, es un ejecutor incompatible aunque funcione perfecto de
forma aislada.

**Regla operativa para la otra sesión:** el harness no necesita implementar `.dev/`,
`.ing/`, `.dis/`, etc. completos. Pero cualquier artefacto que produzca — logs, trace,
resultado de una tarea — debería poder mapearse 1:1 a la forma `payload → index →
response/{raw_output, report, staging}` sin rediseño. Es barato hacerlo así desde el
principio y carísimo migrarlo después.

---

## 4. Jerarquía de autoridad que el harness debe reflejar, no reinventar

```
Nivel 1 — Nucleus     → Autoridad, gobernanza, routing, firma
Nivel 2 — Mandate     → Entidad estratégica firmada, versionada
Nivel 3 — Action      → Unidad semántica dentro del Mandate
Nivel 4 — Intent      → Unidad ejecutable concreta (exp / cor / dev / doc / inf)
```

Un Mandate **nunca ejecuta lógica directamente** — "solo orquesta, siempre a través de
Nucleus". Esto importa para el harness porque valida la pieza 3 de la recomendación
original ("loop de tools con permisos"): ese gate de aprobación no es una feature de
UX linda, es *el mismo principio de autoridad que sostiene todo Bloom* — nada ejecuta
sin pasar por un punto de validación que no es el propio agente. Si diseñás el gate del
harness con ese principio en mente (el harness propone, nunca decide por sí mismo en
acciones sensibles), cuando lo enlaces al sistema real ese gate es directamente
reemplazable por BlindJudge sin cambiar la forma del código que lo rodea.

**Nota importante — lo que las tres trees documentan que BTIPS v6.0 todavía no cubre:**
`bloom_nucleus_tree.txt` ya incluye `.mandates/.{id}/.genes/.{gen-id}/` (con `gen.json`,
`gen_state.json`, `.history/.delta_N/`) y `bloom_project_tree.txt` ya incluye los tipos
de intent `.ing/` (que reemplazó a `.gen/`) y `.dis/` (Discovery, séptimo tipo, para
reestructuración de topología de Dominios). Ninguno de estos tres aparece en
BTIPS_Bloom_Technical_Intent_Package_v6_0.md, que solo documenta `exp / inf / cor / dev
/ doc`. Es decir: **las trees representan una capa de evolución del sistema posterior a
este BTIPS.** Si la otra sesión diseña algo asumiendo que solo existen 5 tipos de
intent, va a estar un paso atrás del estado real del sistema. Vale la pena que sepas
esto vos también antes de que la sesión nueva arranque, porque puede llevar a
decisiones de nomenclatura incompatibles (p. ej. si el harness terminara siendo un tipo
de intent nuevo, tendría que nacer sabiendo que `.ing/` y `.dis/` ya existen, no
inventar un octavo tipo con otro nombre para lo mismo).

---

## 5. El Marketplace de Mandates — por qué esto es más que un detalle de arquitectura

Esta es la pieza que probablemente más te sirva para la narrativa de portfolio, aparte
de la técnica:

> "Un Mandate publicado en el marketplace **nunca puede asumir acceso a recursos
> propietarios del vendor**. Solo puede asumir que el Nucleus del comprador tiene los
> tipos de intent necesarios y los datos que el comprador decide proveer."

Esta restricción de diseño — portabilidad sin dependencia de recursos propietarios —
es exactamente la misma disciplina que necesitás para que tu portfolio no filtre datos
reales de negocio/contratos de tu organización. Si diseñás el harness con esa misma
restricción (nunca asume acceso a nada propietario, solo a contratos de tipos e
interfaces), obtenés dos cosas al mismo tiempo: (a) un repo público seguro de mostrar
en entrevista, y (b) un artefacto que en teoría podría venderse/adoptarse como un
Mandate más si algún día quisieras publicarlo — literalmente cumple la misma condición
de diseño que el sistema exige para sus productos reales.

---

## 6. Qué SÍ replicar vs qué NUNCA debe entrar al repo separado

| Replicar (forma, estructura, contratos) | Nunca incluir (datos reales) |
|---|---|
| `contracts/` (`state-machines.ts`, `types.ts`, `websocket-protocol.ts`) — vendorizado o importado | Contenido real de `.ai_bot.sovereign.bl` de tu organización |
| Forma del pipeline BISP (`payload/index/response`) | Datos reales de clientes, contratos comerciales, `.ownership.json` real |
| Patrón `OrganizationContext` / resolución dinámica de paths | Cualquier API key, `.env.{organization}` real |
| Estructura de logs multi-tenant (`governance/security/relay`) | Nombres reales de organización/proyectos internos |
| El principio de autoridad (nunca firma, nunca ejecuta sin gate) | El árbol de Mandates/Genes real de producción |

El contrato de negocio se **mockea con la misma forma pero contenido ficticio** — un
`.ai_bot.sovereign.bl` de ejemplo con una organización inventada. Esto resuelve el
problema que vos señalaste (Alfred ya tiene restricciones que la sesión anterior no
conocía) sin exponer nada real: la sesión nueva no necesita saber el contenido de tu
contrato real, necesita saber que **existe un contrato externo con esa forma** y que el
harness debe cargarlo en runtime, no asumir su contenido en el código.

---

## 7. Respuesta directa a las dos preguntas originales

**¿Se puede crear separado y quedar enlazable después?**
Sí, y el patrón para lograrlo ya está probado dentro del propio sistema — es
literalmente cómo Alfred/Batcave se relaciona con Nucleus. La condición es que el
harness consuma los contratos compartidos (`contracts/`) y respete la forma BISP y el
principio de autoridad (nunca firma, nunca ejecuta directo) desde el día uno. Lo que
NO se puede hacer es diseñar el harness con su propio protocolo ad hoc "por ahora" —
eso es lo único que garantiza que después sea un fork, no un merge.

**¿Vale la pena hacerlo con Claude Code como proyecto separado?**
Sí, con más razón ahora que sabés que hay precedente arquitectónico exacto para esto.
De hecho es mejor ángulo narrativo para portfolio: no es "armé un harness genérico",
es "diseñé un agente remoto siguiendo el mismo patrón de separación autoridad/ejecución
que usa el sistema de producción del que se desprende" — y podés hablar de eso sin
mostrar una línea de código propietario, porque lo que estás replicando es la forma,
no los datos.

---

## 8. Checklist concreto

- [ ] Consumir `contracts/` (errors.ts, state-machines.ts, types.ts,
      websocket-protocol.ts) desde el día uno — en este proyecto, por path relativo en
      vivo (`../contracts/`), no vendorizado.
- [ ] Implementar `OrganizationContext` + resolución dinámica de paths desde el día 1
      (sin nombres hardcodeados), aunque resuelva a una org de prueba.
- [ ] Todo output/log del harness debe poder expresarse en la forma
      `payload.json / index.json / response/{raw_output.txt, report.json, staging/}`.
- [ ] El harness nunca firma nada — cualquier "aprobación" que simule debe estar
      claramente marcada como no-autoritativa.
- [ ] El harness nunca ejecuta acciones sensibles sin pasar por un gate separado
      (equivalente conceptual a BlindJudge), aunque el gate sea un stub simple al
      principio.
- [ ] El conocimiento de "negocio" (reglas, permisos, contexto organizacional) vive en
      un archivo de contrato externo cargado en runtime — nunca hardcodeado en el
      código del harness. Usar `context/mock-nucleus/` como contrato mock con datos
      ficticios.
- [ ] Logging segregado y con actor/timestamp, en carpetas equivalentes a
      `governance/security/relay`.
- [ ] Ningún dato real de tu organización (contratos, clientes, `.ownership.json`,
      API keys) entra a los tests o fixtures. Todo mock.
