# Roadmap coordinado — Wisdom, impacto local, AITAP y ejecución de Mandates v0.1

**Fecha:** 2026-10-22. **Estado:** plan de producto y verificación; no acredita implementación ni ejecución de los pasos pendientes. **Decide:** José Vigil. **Dueño de la experiencia:** CORE.

## 1. Punto de partida comprobado

El PASS Darwin `G-20261021-165144` demostró, sólo en su instalación separada, la selección explícita de Genesis 1.0.0 en Wisdom, una descarga, un recibo, una definición materializada y una instancia con `mandate_state.json` en `installed`. Tras el reinicio persistió la instalación y no hubo `mandate.json` ni workflows. No demostró preparación, impacto, configuración de AITAP, aprobación, activación o ejecución. La corrida Windows de RUNNER CORE sigue bloqueada antes de abrir Core: el servicio del supervisor permanece vivo sin abrir su puerto HTTP (`functional_port_not_ready`). Ninguno de esos resultados autoriza a declarar Genesis ejecutado.

Fuentes de contraste: [estado del gate Darwin](Estado_Gate_Wisdom_Darwin_Traspaso_Codex_v1_0.md), [plan del gate G](Plan_Gate_G_Wisdom_Darwin_Separada_v0_1.md), [diseño anterior de instalación y preparación](Diseno_Recepcion_Instalacion_y_Retiro_Automatizaciones_Genesis_v0_2.md) y código de la [UI de Wisdom](../../../webview/app/src/routes/wisdom/+page.svelte), el [bridge de Core](../../../installer/conductor/workspace/core/ipc/wisdom-offer-handlers.js) y el [comando de oferta de Nucleus](../../../installer/nucleus/internal/orchestration/commands/mandate_offer_cmd.go). Estos documentos pueden describir estados futuros; ante divergencias, se verifica el código y una corrida real.

## 2. Recorrido objetivo y límite de cada transición

| Etapa | Gesto o condición | Dueño principal | Evidencia durable y límite |
|---|---|---|---|
| 0. Consultar Wisdom | El Paladín abre Core y navega a Wisdom | CORE presenta; Nucleus consulta Backend | Ver ofertas e instalaciones no crea, descarga, instala ni ejecuta un Mandate. |
| 1. Seleccionar e instalar | El Paladín elige Genesis 1.0.0 para un proyecto elegible y confirma | CORE conduce; Nucleus descarga y verifica | Coinciden id, versión y digest de oferta, entrega, recibo y definición. Una instancia queda `installed` e inactiva; cero workflows. Éste es el alcance demostrado por G en Darwin, no en Windows. |
| 2. Evaluar impacto local | El Paladín solicita analizar el Mandate instalado contra el estado local de su organización y proyectos | CORE presenta; el servicio de impacto, Wisdom y Gravity aportan evaluación; Nucleus gobierna la decisión | Informe reproducible que identifica fuentes, versiones, proyectos examinados, colisiones, incertidumbres y resultado. El análisis local es el primer alcance: la evaluación remota futura no sustituye la comprobación empírica local. La integración de este paso aún no está demostrada. |
| 2a. Omitir impacto en desarrollo | Gesto explícito de José en un entorno de desarrollo | CORE registra; Nucleus aplica la política | Queda un registro inequívoco de `omitido en desarrollo`, actor, entorno, instancia y momento. Jamás se presenta como `sin colisiones` o `validado`. La posibilidad y su alcance en otros entornos requieren contrato de producto. |
| 3. Preparar | El Paladín confirma los documentos y contexto del proyecto que se incorporarán | CORE conduce; Genesis Mandate y Nucleus definen y producen el contrato | Se congela la entrada acordada y se firma el contrato local; el estado sigue inactivo y sin workflow. El diseño previo propone `prepared`, pero su implementación y relación exacta con impacto deben verificarse. |
| 4. Configurar abastecimiento por Intent | El Paladín elige proveedor y modelo entre las opciones que AITAP permite para cada Intent que lo requiera | CORE presenta; AITAP evalúa opciones; Nucleus conserva el vínculo autorizado | Mapeo completo por Intent vinculado a la identidad y digest de la instancia preparada, con política, credencial referenciada, privacidad, límites y presupuesto. Ninguna inferencia ocurre para completar la selección. |
| 5. Autorizar y activar | Actos humanos y de Authority definidos para el Mandate | Genesis Mandate y Nucleus; CORE muestra y solicita cada acto | Recibos y estados distintos para aprobación y activación. Ni instalar, ni validar impacto, ni elegir grifos activan automáticamente el Mandate. |
| 6. Ejecutar | Gesto o disparador explícito autorizado, posterior a los gates anteriores | Nucleus/Brain orquestan; AITAP abastece los Intents | Se crea el workflow una sola vez; cada Intent usa una ruta permitida y su consumo queda contabilizado. Éste es un gate posterior, no una consecuencia del PASS de instalación. |

`Genesis` es el label de la definición publicada, no una instrucción implícita de creación o arranque. Abrir Core y terminar onboarding son operaciones de lectura respecto de los Mandates.

## 3. Contrato del impacto local que hay que diseñar

La entrada mínima es la definición instalada y verificada, su proyecto y organización, y una fotografía identificable del estado local de Wisdom, Gravity y los proyectos afectados. La salida debe distinguir **sin colisión demostrada**, **colisión detectada**, **evidencia insuficiente** y **omitido en desarrollo**. Un resultado ausente o incierto no se convierte en aprobación por defecto. El informe conserva la procedencia de las fuentes y el digest de la definición para evitar aplicar un resultado viejo a otra versión.

El análisis debe responder qué cambiaría o competiría en objetivos, prioridades, restricciones y relaciones entre proyectos de la organización. Una primera implementación puede cubrir sólo detectores existentes y declarar expresamente sus límites; no debe prometer cobertura territorial, jerárquica o cualitativa que aún no haya sido construida. El informe, su persistencia, caducidad y política de bloqueo son decisiones de contrato pendientes. El gate de desarrollo permite a José continuar registrando el salto; no falsea el dictamen ni demuestra que no hay impacto.

## 4. Coordinación y orden de trabajo

1. **CORE** diseña los estados y gestos desde `installed` hasta ejecución: detalle de la instancia, análisis u omisión de impacto, preparación, selección de grifos por Intent, actos de autorización y arranque. Debe mostrar motivos de bloqueo y estado durable tras reinicio.
2. **Genesis Mandate** define qué Intents y entradas exige la versión instalada, cuándo existe el contrato preparado, qué digest ata impacto y abastecimiento, y qué condiciones habilitan aprobación, activación y ejecución. Evita introducir workflows durante instalación o preparación.
3. **Nucleus / Impact / Wisdom / Gravity** definen el análisis local y su evidencia; Nucleus gobierna la transición, registra el resultado u omisión permitida y rechaza estados incompletos. La comprobación de colisiones consume datos locales reales, no una respuesta simulada del RUNNER.
4. **AITAP** expone opciones elegibles por Intent según política, credencial de Vault, privacidad y presupuesto; registra la elección y, al ejecutar, devuelve proveedor/modelo efectivos y contabilidad. CORE no inventa proveedores ni elude sus decisiones.
5. **Authority / Backend** resuelven la vigencia de la emisión que hoy vence a los cuatro minutos y puede deshabilitar la instalación en Wisdom. Esa fricción de producto se mantiene separada de las pruebas del RUNNER.
6. **RUNNER CORE** primero recupera el gate Windows de apertura sin POST automático; luego reproduce la instalación inactiva en raíz aislada. Sólo después agrega gates observacionales para impacto, omisión de desarrollo, preparación, AITAP y ejecución, conforme cada capacidad de producto exista. RUNNER no escribe recibos, estados, informes de impacto ni rutas AITAP en nombre del producto.

CORE coordina el diseño de la UI con Genesis Mandate, Nucleus, AITAP y RUNNER antes de codificar cada transición. Los contratos y estados acordados se pasan entre works; un PASS de un gate no sustituye la evidencia del siguiente.

## 5. Gates de RUNNER CORE y criterios de avance

| Gate | PASS observable | FAIL o detención |
|---|---|---|
| W0 — apertura | Core y Wisdom abren en R con datos sintéticos; onboarding, apertura, recarga y reinicio causan cero POST, descargas, instalaciones y workflows | Servicio, UI o identidad ambiguos; cualquier efecto automático |
| W1 — instalación inactiva | Selección y confirmación reales; un GET de bytes, recibo y definición válidos, una instancia `installed`; persistencia y cero workflows tras reinicio | Duplicación, digest divergente, dependencia del workspace productivo o ejecución temprana |
| W2 — impacto | Informe local atribuible a instancia, definición y fotografía de organización; colisiones e incertidumbre visibles; rechazo de un resultado obsoleto | Informe sin fuentes, sin vínculo a digest o colisión ignorada |
| W2-dev — omisión | Sólo en desarrollo autorizado; registro durable de la omisión, nunca etiquetada como PASS de impacto | Omisión silenciosa o disponible fuera de su política |
| W3 — preparación | Entradas mostradas y congeladas por el producto; contrato firmado, estado preparado e inactivo; cero workflows | RUNNER compone el contrato o faltan entradas y aun así se avanza |
| W4 — AITAP | Cada Intent exigido tiene elección válida y vinculada al contrato; cero inferencias antes de elegir | Opción no autorizada aceptada, referencia de credencial ausente o Intent sin abastecimiento |
| W5 — autorización y ejecución | Recibos requeridos, activación explícita, un workflow, ejecución de Intents con ruta efectiva y contabilidad verificadas | Duplicación, inferencia anticipada, cambio de proveedor no autorizado o falta de accounting |

Cada gate usa organización, proyecto, identidad, Backend, puertos y datos exclusivamente sintéticos dentro de R. Registra rutas, hashes y procesos productivos antes y después; conserva journal y logs descartables ante FAIL. Un bloqueo en W0 o W1 detiene los gates posteriores. No se compone un PASS de evidencias obtenidas en corridas separadas si el criterio exige una sola cadena.

## 6. Decisiones que José debe cerrar antes de la implementación posterior

1. ¿La validación de impacto se efectúa sobre la definición descargada **antes** de escribir `installed`, o sobre la instancia **instalada e inactiva**? Este roadmap usa la segunda para conservar el alcance del PASS Darwin, pero no fija el contrato definitivo.
2. ¿Qué resultados de impacto bloquean avance, quién puede aceptar una colisión y cuánto dura la validez del informe cuando cambian proyectos, Wisdom, Gravity o la definición?
3. ¿La omisión queda limitada a José y entornos de desarrollo, y qué evidencia firma o autoriza ese acto?
4. ¿Preparación precede siempre a la elección de AITAP, y qué digest y versión fijan el mapeo por Intent cuando el contrato se recompone?
5. ¿Qué Intents exigen elección humana, cuáles admiten una opción por defecto y qué ocurre si AITAP deja de considerar válida una elección antes de ejecutar?
6. ¿Qué acto humano inicia el workflow tras aprobación y activación, y cómo se garantiza idempotencia después de un reinicio o un clic repetido?

Hasta cerrar estas decisiones y pasar los gates de producto, el estado correcto tras W1 es **instalado e inactivo**. El objetivo del roadmap es avanzar de ahí hacia una ejecución autorizada y abastecida, sin hacer que RUNNER supla capacidades que todavía no existen.

## 7. Decisión acotada de Impact para la corrida de desarrollo del 28/10/2026

José Vigil ratificó omitir el análisis de Impact **únicamente** para la corrida de desarrollo de la instancia `94cb7ee2-6377-4fb6-a695-da0566f9093f`. La denominación visible del acto es **“Impact omitido en desarrollo”**. Actor: José Vigil. Entorno: desarrollo. Esta decisión no es una evaluación favorable, no acredita ausencia de colisiones y no constituye una regla para otros Mandates. La autorización consta en el mensaje de José en este Work del 28/10/2026; este registro conserva la decisión, pero no sustituye el futuro recibo de producto de W2-dev.

El contrato local de esa instancia está firmado y preparado con digest `860bf610e1d3cfdc5e82bf33533f07dd1c25cb82d9bb8a25e885e6970cf798f2`. El gate W4 no tiene PASS: la política inmutable referida por el contrato fija `intelligence_supply.budget.mandate_id` en `4e028a82-3f94-48ab-957d-116340dbcc7f`, distinto del ID de la instancia, y el registry marca la salud de los runtimes como `unknown` y su conformidad como `NOT_RUN`. No se debe presentar este registro como una selección de proveedores ni activar o ejecutar la instancia por él.
