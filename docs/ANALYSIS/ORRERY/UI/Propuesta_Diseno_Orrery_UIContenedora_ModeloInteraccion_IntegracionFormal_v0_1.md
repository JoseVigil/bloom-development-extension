# Propuesta de Diseño — Modelo de Interacción de la UI Contenedora de Orrery e Integración Formal con el Core (v0.1)

**Tipo:** [D] Diseño de UX / modelo de interacción / contrato de integración. No implementa código. No reabre LocationSnapshot v0.1 ni ninguna decisión ya ratificada; construye sobre ellas.
**Fecha:** 2026-09-20
**Encargado por:** José, mensaje directo (reorientación explícita del cowork hacia diseño exclusivo de UX/interacción/integración formal, bajo el principio Location-First).
**Reemplaza en alcance, no en contenido, a:** `Propuesta_Diseno_Orrery_GatewayUX_Onboarding_TransicionEspacial_v0_1.md` — esa propuesta queda vigente y se retoma aquí; este documento la extiende para resolver, a nivel de diseño formal, los gaps de integración que la verificación de código (`Investigacion_Orrery_Verificacion_UIContenedora_PuntosEntrada_LocationFirst_v0_1.md`) dejó marcados sin resolver.

---

## 0. El invariante que gobierna todo este documento

Cita textual de José, que es la única fuente de autoridad para cada decisión de este documento:

> "Orrery describe estrictamente el territorio soberano, scopes, anchors, ancestros y vecinos de un grado donde se encuentra el usuario, pero no interpreta para qué le servirá estar ahí ni contiene lógica de mandatos, postulates o evaluación de gravity como objetos primarios de su contrato de captura base."

De esto se desprenden dos reglas de diseño que gobiernan cada sección siguiente:

- **Regla de frontera (semántica):** ninguna decisión de este documento puede convertir a Orrery en un visor de mandatos/postulates/gravity. Cuando una vista de esas capas se apoya sobre Orrery, Orrery presta territorio; la capa consumidora aporta su propio significado desde afuera.
- **Regla de contrato (formal):** la única estructura de datos que cruza la frontera hacia Orrery es LocationSnapshot (o una proyección estricta de él). Ningún otro tipo de dato — mandato, intent, draft, evento — entra al motor espacial como objeto primario.

Este documento no vuelve a justificar estas reglas; las aplica.

---

## 1. Qué queda firme del corpus previo (sin reabrir)

| Decisión | Origen | Estado |
|---|---|---|
| LocationSnapshot es la única fuente de verdad de Orrery; Orrery no interpreta propósito | `Orrery_LocationSnapshot_v0.md` §A-D, ratificado por José | Firme |
| Mandate/Intent/Gravity son consumidores/vistas sobre territorio, nunca razón de ser de Orrery | v0.2 §3, reforzado por el mensaje de reorientación | Firme |
| El "camino de un grado" (anchors, ancestros, vecinos directos) es el límite de expansión de una snapshot | LocationSnapshot §C, D | Firme |
| Los estados de resolución (`resolved`/`changed`/`stale`/`missing`/`unauthorized`/`ambiguous`/`unsupported`/`unverifiable`) nunca modifican la captura original | LocationSnapshot §C | Firme |
| El prototipo `main.ts`/`data.ts` es un motor de cámara/selección reutilizable, con datos 100% simulados | Verificación §5, confirmado en código real | Firme |
| La integración Orrery↔UI contenedora no existe hoy en código (ni imports, ni endpoints) | Verificación §1 | Firme — es el punto de partida de este diseño, no una discrepancia a resolver por otro lado |
| Ningún gesto de UI dispara transición a Orrery a partir de actividad de mandato | v0.3, Verificación §2 | Firme, se mantiene como regla negativa |

Lo que este documento hace que el corpus previo no hacía: convierte los "puntos de entrada candidatos" (Project, Sidebar) y los gaps de plomería (ProjectBinding, Domain candidato, punto de montaje) en un **modelo de interacción único y una especificación de contrato formal**, en vez de dejarlos como preguntas abiertas o hipótesis no ratificadas.

---

## 2. Modelo de interacción de la UI contenedora

### 2.1 Los dos regímenes de la UI

La UI contenedora (Workspace Core) opera en dos regímenes de interacción, nunca simultáneos:

1. **Régimen Panel** — el estado por defecto. Paneles 2D, estáticos, transaccionales: `NucleusPanel`, `ProjectsPanel`, `MandateTab`, `LedgerPanel`, navegación por `Sidebar`. El usuario opera sobre listas, formularios, tabs. Es el régimen que existe hoy en código.
2. **Régimen Espacial** — Orrery en pantalla completa (o en el contenedor dominante de la ventana). El usuario navega territorio: anchors, ancestros, vecinos. No hay paneles transaccionales superpuestos de forma persistente.

No existe un tercer régimen "híbrido" donde Orrery conviva con paneles de mandato abiertos permanentemente. Esto es deliberado: mezclar los dos regímenes es exactamente el "shock cognitivo" que José pide evitar, y es también la vía más directa para que Orrery empiece a acumular lógica de mandato por presión de conveniencia de UI. La frontera semántica se protege primero con una frontera de layout.

### 2.2 Qué puede aparecer *sobre* el régimen espacial, y bajo qué regla

José pidió precisión sobre "cómo se estructura y presenta este espacio". La regla es:

- Elementos de **orientación** (breadcrumb de ubicación actual, botón de retorno, indicador de foco) pueden superponerse a Orrery como capa de UI ligera (HUD), porque describen la posición del usuario en el territorio — son metadata de Location, no de mandato.
- Elementos de **contenido de una capa consumidora** (detalle de un mandato, estado de un postulate, valor de gravity) **no** se superponen de forma persistente. Si una capa consumidora necesita mostrar detalle, lo hace en un panel que se abre *sobre* el régimen espacial como overlay modal, con su propio cierre explícito — nunca fusionado permanentemente al lienzo. Al cerrarse el overlay, el usuario vuelve a ver territorio puro, no una vista contaminada de mandato.

Esta regla resuelve la tensión que dejó abierta la hipótesis "Mandate como objetivo visualizado" (v0.3 §2, no ratificada): un mandato puede *marcarse* sobre el territorio (un marcador estático, ubicado en las coordenadas de su Location asociada) sin que Orrery pase a "contener" lógica de mandato — el marcador es una anotación que una capa consumidora dibuja sobre territorio ajeno, igual que una capa de tráfico se dibuja sobre un mapa sin que el mapa deje de ser un mapa. Esto sigue sin estar ratificado como decisión de producto; se ofrece aquí como el patrón de interacción que sí respeta el invariante, para cuando José decida si la funcionalidad en sí se construye.

### 2.3 Qué persiste al cruzar entre regímenes

| Elemento | Persiste al entrar a Orrery | Persiste al volver al Panel |
|---|---|---|
| Tab/panel activo antes de la transición | No se destruye, queda en espera | Se restaura exactamente como estaba |
| Selección de Location actual | N/A (se construye al entrar) | Se retiene como "última ubicación visitada" para la próxima entrada |
| Estado de scroll/formulario en un panel | Se congela | Se restaura |
| WebSocket / reconciliación de mandatos en curso | Sigue activo en segundo plano (no se pausa) | Sin cambios — nunca se pausó |

La fila del WebSocket es importante: el régimen espacial no debe convertirse en una razón para detener la reconciliación de mandatos que ya corre en `+layout.svelte`. Orrery no consume esos eventos, pero tampoco los bloquea.

---

## 3. Gateway UX — especificación de tránsito (entrada, foco, salida simétrica)

### 3.1 Punto de entrada único, con dos formas de invocación

Sobre la base de la Propuesta v0.1 y la verificación de código, se fija un único modelo de entrada con dos superficies de invocación, ambas convergiendo al mismo mecanismo:

**A. Entrada desde `Sidebar.svelte`** — un ítem de navegación de primer nivel ("Orrery" o el nombre que se defina), al mismo nivel que Home/Nucleus/Profiles/Wisdom. Es la entrada *sin* contexto de Location predeterminado: al entrar así, Orrery resuelve la última ubicación visitada (§2.3) o, si no hay una, la ubicación raíz del tenant/organización activos.

**B. Entrada contextual desde `ProjectsPanel.svelte`** — una acción explícita sobre un Project ya seleccionado ("Ver en Orrery" o equivalente), que entra directamente enfocado en la Location de ese Project. Esta es la entrada que la Propuesta v0.1 y v0.3 llamaban "candidato viable"; aquí se formaliza como la vía contextual, condicionada al contrato de §4.1 (evidencia de `ProjectBinding`).

Se descarta formalmente la tercera vía que proponían v0.3/Propuesta v0.1 ("Domain candidato" vía el picker de `docsGate.ts`): la verificación de código confirmó que no tiene correlato — `docsGate` es exclusivamente un picker de documentos (Capa 1 en su propio código), no un selector de territorio. Forzar una entrada a Orrery desde ahí requeriría inventarle a `docsGate` una responsabilidad que no tiene y que no le corresponde. Si en el futuro se necesita una entrada por Domain, debe nacer como su propia superficie, no montarse sobre el picker de documentos.

### 3.2 La secuencia de tránsito

1. **Disparo** — el usuario activa A o B.
2. **Congelamiento del panel** — el régimen Panel se congela (no se desmonta) tal como está.
3. **Transición visual** — un desvanecimiento/zoom breve (no instantáneo, no una carga de página) que comunica "entramos a otro tipo de espacio", no "cambiamos de pantalla". El HUD de orientación (§2.2) aparece al final de la transición, no antes.
4. **Resolución de foco inicial** (detalle en 3.3).
5. Orrery queda activo, régimen Espacial puro.

Simétricamente para la salida:

1. **Disparo de salida** — un control de retorno explícito, siempre visible en el HUD (nunca un gesto implícito como "click afuera" o "Esc", que en un lienzo 3D es ambiguo con deselección).
2. **Transición visual inversa** — mismo lenguaje visual que la entrada, en reversa.
3. **Restauración del panel** — el régimen Panel se restaura exactamente como estaba (§2.3).

### 3.3 Foco inicial: regla determinística, no heurística

José pide precisión sobre "cómo se maneja el foco inicial". La regla:

- **Entrada tipo B (contextual)**: el foco inicial es el anchor correspondiente a la Location del Project seleccionado. No hay ambigüedad — la Location que originó la entrada es el foco.
- **Entrada tipo A (Sidebar)**: el foco inicial es la última ubicación visitada por ese usuario en esa sesión (§2.3); si no existe, el anchor raíz del scope soberano activo (Tenant/Organization actual). Nunca "el centro del universo visible" ni una posición de cámara arbitraria — el foco siempre resuelve a una Location real y nombrable, consistente con que Orrery no tiene estado sin territorio.
- En ambos casos, la cámara no arranca ya "parada sobre" el anchor: arranca con el mismo comportamiento de interpolación que ya existe en `main.ts` (el foco es un destino de vuelo, no un teleport), preservando el motor de cámara actual como reutilizable sin modificarlo.

### 3.4 Onboarding: primera vez vs. subsecuentes

La Propuesta v0.1 ya identificó la necesidad de un onboarding distinto para la primera entrada. Se formaliza así:

- **Primera entrada de un usuario a Orrery** (sin ubicación previa registrada en absoluto): antes de resolver foco por §3.3, se muestra una capa de orientación mínima — no un tutorial de features, sino una explicación de qué está viendo (territorio soberano, no una vista de trabajo) y del control de retorno. Se descarta explícitamente cualquier onboarding que mencione mandatos, postulates o gravity — el onboarding enseña a leer territorio, no a operar sobre él.
- **Entradas subsecuentes**: sin onboarding, van directo a §3.2. La capa de orientación de la primera vez no vuelve a aparecer salvo que el usuario la reabra explícitamente (p. ej. desde un ítem de ayuda en el HUD).

---

## 4. Integración formal con el core: el contrato de frontera

Esta sección resuelve, a nivel de diseño (nunca de código), los tres gaps de plomería que dejó marcados la verificación.

### 4.1 Gap: el cliente no tiene evidencia de `ProjectBinding`

**Diseño de contrato, no de implementación:** la UI contenedora necesita, para ofrecer la entrada tipo B (§3.1.B) y para que Orrery pueda resolver la Location de un Project, una proyección cliente del binding soberano — como mínimo: `tenantId`, `organizationId`, y el estado de resolución del binding (uno de los ocho estados ya definidos en LocationSnapshot §C, reutilizados aquí sin redefinir). Este documento no especifica el endpoint ni el shape exacto del payload — eso es tarea de una spec de implementación posterior — pero fija el requisito: sin esta evidencia, la entrada tipo B no puede ofrecerse (debe degradarse a tipo A) y debe *decirlo*, no fingir una Location.

### 4.2 Gap: no existe tipo de "Domain candidato" en el cliente

Resuelto por diseño en §3.1: se descarta esa vía de entrada tal como estaba planteada. No hace falta resolver el gap porque se resuelve el problema que lo generaba. Si en el futuro se decide una entrada por Domain, nace como su propia superficie con su propio contrato — no hereda este gap por arrastre.

### 4.3 Gap: no existe punto de montaje del shell para `main.ts`

**Diseño de contrato:** el régimen Espacial (§2.1) necesita un contenedor de layout de nivel superior en `+layout.svelte` — hermano del contenedor de paneles, no anidado dentro de él — que se activa/desactiva como unidad al cruzar el Gateway (§3.2). Este documento fija la relación estructural (un contenedor de régimen, exclusivo con el contenedor de paneles, montado/desmontado por la transición de §3.2) sin especificar el mecanismo Svelte concreto — eso pertenece a la spec de implementación.

### 4.4 Qué cruza la frontera y en qué dirección

| Dirección | Qué cruza | Qué NO cruza |
|---|---|---|
| Panel → Orrery | LocationSnapshot (o su proyección mínima), foco inicial (§3.3) | Datos de mandato, intent, gravity, drafts |
| Orrery → Panel | Evento de salida (control de retorno accionado) + última Location visitada (para §2.3) | Ninguna interpretación de "qué hizo" el usuario en el espacio — Orrery no reporta intención, solo posición |
| Capa consumidora → Orrery (overlay, §2.2) | Coordenadas de anotación (ubicación de un marcador) | Lógica de evaluación, estado en vivo, narrativa de progreso |

La última fila es la que impide, de raíz, que un futuro overlay de mandatos "se cuele" como lógica primaria de Orrery: el contrato solo permite que una capa consumidora le diga a Orrery *dónde* dibujar algo, nunca *qué significa* ese algo.

---

## 5. Fuera de alcance de este documento

- No se especifica el shape exacto de ningún payload (JSON Schema, endpoint, contrato TypeScript) — eso es spec de implementación, explícitamente pedida por José como "sin caer en implementaciones de código prematuras".
- No se resuelven las preguntas abiertas de v0.3 §7 que no estén directamente atadas al modelo de interacción o al contrato de frontera (p. ej. la relación con Assembly/ASEM/Postulate sigue fuera de foco, tal como ya estaba delimitado).
- No se diseña la funcionalidad de "mandato como marcador visualizado" — se ofrece el patrón de interacción que la haría compatible con el invariante (§2.2), pero la decisión de construirla o no sigue sin ratificar.
- No se toca ni se propone solución para el gap documental de `ProjectID` (Fase 1 de esta serie de investigaciones) — sigue fuera de este alcance, tal como en las entregas anteriores.

---

## 6. Continuidad

Este documento deja tres insumos listos para una futura spec de implementación (no incluida aquí): el contrato de evidencia de `ProjectBinding` en cliente (§4.1), la estructura de montaje del contenedor de régimen espacial (§4.3), y la regla de foco inicial determinística (§3.3). Cuando José decida avanzar a esa etapa, estos tres puntos son el punto de partida directo.
