# Verificación — UI contenedora y puntos de entrada de Orrery bajo el encuadre estricto Location-first

**Tipo:** Verificación de sólo lectura [V] contra código real. No es diseño, no modifica el Gateway UX ya
propuesto, no reabre `LocationSnapshot v0.1` ni las investigaciones v0.2/v0.3.
**Fecha:** 2026-09-20.
**Encargada por:** José, mensaje directo — reorientar la auditoría de la UI contenedora y los puntos de
entrada bajo el encuadre estricto: *"Orrery describe estrictamente el territorio soberano, scopes, anchors,
ancestros y vecinos de un grado donde se encuentra el usuario, pero no interpreta para qué le servirá estar
ahí ni contiene lógica de mandatos, postulates o evaluación de gravity como objetos primarios de su contrato
de captura base."*
**Verifica contra código real:** `installer/conductor/workspace/core/orrery/src/main.ts` y `data.ts`;
`webview/app/src/lib/components/{NucleusPanel,ProjectsPanel,MandateTab,Sidebar}.svelte`;
`webview/app/src/lib/stores/docsGate.ts`; `webview/app/src/lib/api.ts`.
**No resuelve:** ninguna de las preguntas abiertas de `Investigacion_Orrery_Integracion_UI_Entrada_Salida_v0_3.md`
§7 ni de `Propuesta_Diseno_Orrery_GatewayUX_Onboarding_TransicionEspacial_v0_1.md` §8. Se limita a confirmar o
contradecir, con evidencia archivo+símbolo, lo que esos documentos asumen sobre el estado de la UI
contenedora.

---

## §0 — El invariante que gobierna esta verificación

`LocationSnapshot v0.1` lo fija de forma literal (línea 6): *"Orrery describe dónde está el usuario; no
interpreta para qué le servirá estar ahí."* El mensaje de José que origina esta verificación lo ratifica sin
matices y agrega la precisión operativa: Mandate/Intent/Gravity son "consumidores o vistas posibles sobre el
territorio, nunca su razón de ser" — formulación que coincide exactamente con `Investigacion_Orrery_
LocationFirst_Reorientacion_v0_2.md` §3 y no la contradice ni la reabre.

Bajo ese invariante, esta verificación responde una sola pregunta: **¿la UI contenedora, tal como existe hoy
en el repositorio, ya tiene los puntos de entrada, los datos y las restricciones que `LocationSnapshot`,
v0.2 y v0.3 asumen que tiene?** La respuesta corta, que se desarrolla abajo con evidencia: no. Ninguno de los
puntos de entrada candidatos tiene hoy conexión real con Orrery, y uno de ellos (Domain candidato vía picker
de Capa 0) está construido sobre una lectura del código que no coincide con lo que ese código hace.

---

## §1 — Hallazgo central: la integración Orrery↔UI contenedora no existe en código, en ningún sentido

Verificado por lectura completa de `main.ts` (70 líneas) y por revisión de todos los archivos de
`webview/app/src` relevados en esta y en la auditoría anterior:

- `main.ts` monta su escena completa sobre `document.querySelector('#app')` (línea 5) — es una aplicación
  standalone, sin ningún `import` desde `webview/app/src` ni ninguna referencia a Svelte, a `tabsStore`, a
  `mandateStore` ni a ningún componente del shell.
- Ningún componente de `webview/app/src` (`Sidebar.svelte`, `TabBar.svelte`, `NucleusPanel.svelte`,
  `ProjectsPanel.svelte`, `MandateTab.svelte`, `+layout.svelte`) importa, referencia o monta nada de
  `installer/conductor/workspace/core/orrery`.
- `webview/app/src/lib/api.ts` — el único cliente HTTP del shell — no tiene ningún endpoint relacionado con
  Location, `LocationSnapshot`, Orrery, Domain o Gravity. Su superficie completa es: `health`, `onboarding`,
  `nucleus` (`listNuclei`, `createNucleus`, `listNucleusProjects`), `profile`, `project` (sólo `addProject`),
  `github`, `intent`, `mandate`. Nada de esto transporta scope, `ProjectBinding`, ni ninguna referencia
  admisible bajo el JSON Schema de `LocationSnapshot` (Sección E del contrato).

**Consecuencia directa:** todo lo que `Investigacion_Orrery_Integracion_UI_Entrada_Salida_v0_3.md` §1.3 y
`Propuesta_Diseno_Orrery_GatewayUX_Onboarding_TransicionEspacial_v0_1.md` §2 describen como "puntos de
entrada candidatos, contra lo que ya existe en código" es, en rigor, un ejercicio de diseño sobre una
superficie de integración que hoy no existe en ningún punto — ni el gesto, ni el transporte de contexto, ni
un contenedor que pueda montar el `#app` de Orrery dentro del shell. Esto no invalida el diseño (es
internamente consistente con `LocationSnapshot` y no viola el invariante), pero cambia su naturaleza: no es
una propuesta de comportamiento sobre código existente, es una propuesta de comportamiento sobre una
integración enteramente por construir. Se señala para que la próxima especificación de implementación (v0.3
§7, secuencia recomendada, paso 2) sepa que no puede asumir ningún gancho previo.

---

## §2 — Verificación punto por punto de los puntos de entrada candidatos

| Candidato (v0.3 §1.3 / Propuesta §2) | Qué dice la investigación | Qué hay en código real | Verificación |
|---|---|---|---|
| Project vía `NucleusPanel.svelte`/`ProjectsPanel.svelte` | "Es hoy el único anchor admisible sin ambigüedad bajo `LocationSnapshot`" (Propuesta §2.1) | `ProjectsPanel.svelte` define `Project` como `{ id, name, path, strategy?, description? }` (líneas 17-23) — sin `tenantId`, sin `organizationId`, sin ninguna evidencia de `ProjectBinding`. `addProject()` en `api.ts` (líneas 404-412) sólo envía `project_path`/`nucleus_path`/`name`/`strategy` y no recibe binding de vuelta | **Parcialmente correcto, con gap no señalado por la Propuesta.** Project es, en efecto, el tipo de referencia más cercano a lo que `LocationSnapshot.scope` exige — pero el cliente hoy no tiene, ni pide al backend, ninguno de los campos que el JSON Schema del contrato requiere como obligatorios en `scope.binding_evidence` (`tenantId`, `organizationId`, `revision`, `claimedAt`, `checkedAt`, `validUntil` — ver `Orrery_LocationSnapshot_v0.md` Sección E, `projectBinding`). El anchor es admisible en el modelo de datos de backend citado por `LocationSnapshot` (`project_claim.go`), no en lo que hoy llega al cliente de UI |
| Domain candidato desde el picker de Capa 0 en `MandateTab` | "Puede detectar un Domain candidato" (Propuesta §2.2); "Un Domain candidato ya detectado" (v0.3 §1.3) | `docsGate.ts` completo: su único tipo de dato detectado es `DetectedDoc` (`relPath`, `name`, `kind: 'readme' | 'docs-dir-entry' | 'other'`, líneas 22-27). No existe ningún tipo `DomainCandidate`, ninguna función de detección de Domain, ni ninguna referencia a Domain en todo el archivo | **No corresponde a código real.** El picker migrado a `MandateTab.svelte` detecta y sube documentación (README, `docs/`) para que Fase 1 la lea — no detecta Domains candidatos. El concepto `DomainCandidate` sí existe en el repositorio (confirmado en la auditoría de Location, `ORRERY_LOCATION_MATERIAL_CLOSURE_v1_1.md` E14: `src/types/gen-state.types.ts`, y el comando de confirmación en `mandate_genesis_domains_cmd.go`), pero es un objeto de backend/Go sin ninguna superficie hoy en el picker de `webview/app`. Esta entrada candidata, tal como está descripta, no tiene ningún dato del lado cliente sobre el cual anclar el gesto |
| `Sidebar.svelte` — navegación general | "Da contexto de Organization, no un anchor específico" (v0.3 §1.3) | Confirmado en la auditoría anterior: `navItems` fijo (`/home`, `/nucleus`, `/profiles`, `/wisdom`), sin ningún ítem de Orrery ni de Location | **Correcto**, sin discrepancia |
| Ningún estado de ejecución de Mandate dispara el gesto (regla negativa, §2.4 Propuesta) | Invariante: el gesto nunca aparece por actividad/incidencia de un Mandate | Revisados `MandateTab.svelte`, `mandateStore.ts`, `LedgerPanel.svelte`: ninguno contiene lógica de badge, alerta o resaltado condicionado a `currentStatus`/`phase` que pudiera disparar un gesto de entrada a Orrery — porque, como dice §1, ese gesto no existe todavía en ningún lado, ni siquiera en su forma correcta | **Correcto por ausencia total**, no por una implementación que respete la regla — es una distinción importante: no hay nada que verificar todavía cumpliendo o incumpliendo la regla negativa, porque no hay ningún disparador construido |

### Nomenclatura: discrepancia menor entre la investigación y el propio código

`docsGate.ts` se autodenomina, en su comentario de cabecera (línea 3), *"pantalla de 'picker de Capa 1'"*
(cita textual, con comillas simples incluidas en el propio comentario, remitiendo a
`prompt-picker-capa1-frontend-v2.md`). Toda la línea de investigación de Orrery (v0.3 §1.3, Propuesta §2.2)
la llama consistentemente "picker de Capa 0". No es una discrepancia que cambie ninguna conclusión — ambos
se refieren al mismo componente, verificado por ruta de archivo — pero se señala porque una especificación de
implementación posterior que busque este componente por el nombre "Capa 0" en comentarios de código no lo va
a encontrar bajo ese nombre.

---

## §3 — Integridad de las citas de código de la Propuesta contra `main.ts` real

Se verificaron, línea por línea, las cuatro citas de código/comportamiento que
`Propuesta_Diseno_Orrery_GatewayUX_Onboarding_TransicionEspacial_v0_1.md` hace de `main.ts`:

| Cita de la Propuesta | Línea real en `main.ts` | Resultado |
|---|---|---|
| `§3.2` — mecanismo de interpolación (`smooth = 1 - Math.exp(-dt*7)`, `target.lerp`, `distance = pc.math.lerp(...)`) | Línea 58, `app.on('update', ...)` | **Exacta**, carácter por carácter salvo espaciado |
| `§3.2` — `desiredDistance`: `15` para Domain, `12` para otros tipos, vía `$('focus').onclick` | Línea 45 | **Exacta** |
| `§3.3` — estado neutro del panel inspector ("Un mundo por recorrer" / "Acercate a un territorio o seleccioná un elemento...") | Línea 10 | **Exacta** |
| `§5.1` — botón `#focus` resetea la cámara dentro de Orrery, no saca al usuario de la experiencia | Línea 45 (mismo handler; sin ninguna llamada a navegación, cierre de vista o comunicación con un contenedor externo) | **Exacta** |
| `§4.2` — panel inferior "Simulación del trabajo" con Play/Pausa, timeline de 30s, y `marker` narrando `route` ("Intent 1 · Inspeccionar identidad" → "Mandate 2 · Compartir conocimiento" → "Artifact disponible") | Líneas 11, 54-63 (`stage`, `route`, `marker`) | **Exacta** — se confirma además que esta narración de proceso, correctamente identificada por v0.2 §2 y la Propuesta §4.2 como algo que debe salir de la superficie de Gateway/Onboarding, sigue viva sin cambios en el prototipo real: nadie la retiró todavía, porque nadie ha tocado código bajo esta línea de investigación (es, por diseño, de sólo lectura) |

No se encontró ninguna cita inexacta o desactualizada. La Propuesta describe con precisión el código que
efectivamente existe hoy — el gap no está en la lectura del prototipo, está en la ausencia total de una capa
de integración alrededor de él (§1).

---

## §4 — Qué significa esto para "diseñar con absoluta precisión el Mecanismo de Tránsito"

La Propuesta ya cumple, dentro de su propio alcance, con el encuadre estricto: no le asigna a Orrery ningún
rol de interpretación de propósito, no convierte Mandate/Postulate/Gravity en objetos primarios del gesto de
entrada, y su regla negativa (§2.4) prohíbe explícitamente que la actividad de un Mandate dispare el gesto.
Bajo el invariante que ratifica el mensaje de José, la Propuesta no tiene ninguna violación que señalar.

Lo que esta verificación agrega es una precisión distinta, de plomería, no de encuadre: **ninguno de los dos
anchors que la Propuesta necesita para funcionar (Project con `ProjectBinding`, Domain candidato) tiene hoy
representación completa en el cliente de la UI contenedora**, y **no existe ningún punto del shell que pueda
montar o invocar Orrery**. Esto no es un defecto de la Propuesta — la Propuesta es explícita en que describe
comportamiento, no código (§7, "cualquier decisión de framework/implementación... esta propuesta describe
comportamiento, no código") — pero sí es información que una futura especificación de implementación
necesita antes de estimarse como "sólo conectar el gesto": hace falta, como mínimo y sin que esta
verificación lo diseñe:

1. Que el cliente reciba `ProjectBinding` (o su evidencia equivalente) al listar/seleccionar un Project —
   hoy `listNucleusProjects`/`addProject` no lo transportan.
2. Que exista, del lado cliente, algún tipo de dato para un Domain candidato si esa entrada (Propuesta §2.2,
   marcada como condicionada en el propio documento) llega a habilitarse — hoy no existe ninguno.
3. Un punto de montaje del shell (ruta, panel o modal) donde la escena de `main.ts` pueda cargarse — hoy no
   existe ninguno; el prototipo corre aislado.

Ninguno de estos tres puntos es una decisión de diseño de UX — son gaps de datos/plomería que no cambian el
Gateway UX propuesto, pero que sí determinan si esa propuesta puede implementarse "ya" o si primero necesita
un encargo de integración previo. Se registran, no se resuelven.

---

## §5 — Qué queda confirmado sin necesidad de releer

Por economía, no se repite acá lo que la auditoría anterior (`Cierre_Investigacion_Auditoria_Estado_UI_
Puente_CoreUIRedesign_v1_0.md`) y las investigaciones v0.2/v0.3 ya establecieron y esta verificación no
contradice: SESSION como corrida de `MandateExecutionWorkflow`; `mandateStore.ts` como única fuente de verdad
del estado de un Mandate; el motor de cámara/selección de `main.ts` como capa de interacción genuinamente
reutilizable; los datos de `data.ts` como simulados y no promovibles automáticamente a referencias canónicas
(ahora reforzado también por `LocationSnapshot` §A.8: *"sus objetos de demostración no pueden convertirse
automáticamente en referencias canónicas"*).

---

## §6 — Fuera de alcance de esta verificación

No se diseñó ni se modificó el Gateway UX ya propuesto. No se resolvieron las preguntas de v0.3 §7 ni de la
Propuesta §8 — siguen pendientes de decisión de José. No se tocó código. No se propuso solución a los tres
gaps de plomería de §4 — se registran como lo que le falta a la superficie de integración, no como un
encargo que esta verificación esté abriendo por cuenta propia.
