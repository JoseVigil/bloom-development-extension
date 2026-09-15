# ASM — Research de Consumo de Location v0.2

## 1. Alcance y exclusiones

**Estado:** revisión conceptual acotada sobre la [v0.1 aceptada](ASM_Location_Research_v0_1.md). Fecha: 2026-09-15. La v0.1 se conserva como base; esta revisión sustituye sus formulaciones sobre entrada, obligatoriedad del lead case, salidas, Impact, consulta Gravity y aceptación del empaquetado. Las demás reglas de consumo y degradación se mantienen.

El lead case se limita a actuar dentro de un Project: **Organization, Project, foco y declaración humana son obligatorios**. No se generaliza hacia otras ubicaciones. No se implementa código ni se congelan representaciones, APIs, transporte o persistencia. Los nombres `AssemblyRequest`, `AssemblyResult`, `PostulateProposal` e `ImpactRequest` designan contratos conceptuales candidatos.

Se mantienen separados **semantic_contract** (significado y obligaciones candidatas) y **availability_profile** (evidencia material y capacidades no verificadas). La aceptación conceptual de v0.1 no demuestra integración operativa.

**Evidencia puntual añadida o reconfirmada, mediante lectura estática:**

- [I1: contrato de Impact](../../../../installer/impact/internal/contracts/contract.go): `EvaluationRequest`, `Context`, `Posture`, `Snapshot`, `Assessment`.
- [I2: núcleo de evaluación](../../../../installer/impact/internal/evaluation/evaluate.go): `Evaluate`, `prepare`, `Decode`.
- [I3: límites documentados de Impact](../../../../installer/impact/README.md): entradas preparadas, cobertura relativa y responsabilidad del llamador.
- [G1: resolvedor interno Gravity](../../../../installer/nucleus/internal/gravity/resolver.go): `ResolveActive`, `ResolveInput`, `ResolveResult`.
- [G2: frontera pública de criterio Gravity](../../../../installer/nucleus/gravity/portable.go): interpretación y análisis de criterios ya situados, sin resolución de autoridad.
- [P1: PayloadBuilder](../../../../brain/core/context_planning/payload_builder.py): `build_from_plan` y `_extract_file`.

No se reabre el relevamiento general ni se ejecutan servicios. La base BISP y sus invariantes siguen siendo los documentados en v0.1 y su fuente obligatoria allí citada.

## 2. Contrato candidato: semantic_contract

### AssemblyRequest: dónde y qué permanecen separados

`AssemblyRequest` vincula Location con una declaración humana de trabajo. No incorpora esa declaración como si fuera parte de la captura espacial o estructural, ni deduce el objetivo desde el foco.

| Contenido conceptual de entrada | Obligación para el lead case |
|---|---|
| Location | Captura versionada e identificable de **dónde decidió actuar el usuario**, con Organization, Project y foco obligatorios, coherentes e inequívocos. Conserva anchors, relaciones, estados y evidencia recibidos. |
| Declaración humana | **Qué quiere hacer allí**, expresado por el humano y vinculado a esa captura. Obligatoria; una reformulación de ASM debe distinguirse del texto humano. |
| Restricciones | Condiciones y exclusiones de la solicitud, con origen. Diferenciar restricciones declaradas, ausencia explícita de restricciones adicionales y restricciones todavía desconocidas. La ausencia de texto no equivale a libertad ilimitada. |
| Provenance | Atribución separada de Location, declaración humana, restricciones y límites; mantener fuente y momento de captura cuando estén disponibles. Los aportes estructurales o inferidos no adquieren autoría humana. |
| Límites iniciales | Alcance autorizado dentro de Organization/Project, fuentes permitidas, límites de expansión, volumen/tiempo y condición de parada. Un límite no informado se registra como pendiente; ASM no lo inventa ni lo interpreta como ilimitado. |
| Correlación e interpretación | Vínculo inequívoco entre solicitud y captura, y versión interpretable del contrato de entrada. No se fija formato de identificador. |

El mínimo para ensamblar exige los cuatro elementos obligatorios y metadatos suficientes para interpretarlos y atribuirlos. Una solicitud incompleta admite diagnóstico. Antes de una adquisición o expansión deben estar definidos los límites que gobiernan esa acción. Organization/Project declarados delimitan el caso, pero no conceden permisos por sí solos.

Si cambia la declaración humana, se conserva su nueva atribución y relación con la solicitud previa. Si cambia el foco, se requiere una captura nueva del productor; ASM no reescribe Location. Esta entrada deja de ser el supuesto S1 de v0.1 y pasa a ser un contrato candidato solicitado explícitamente.

### AssemblyResult y PostulateProposal

| Contrato | Contenido conceptual | Límite de responsabilidad |
|---|---|---|
| `AssemblyResult` | Correlación con solicitud/captura; contexto adquirido y seleccionado; evidencia y provenance; cobertura del objetivo; contradicciones; limitaciones; adquisiciones y decisiones pendientes; conciliación entre plan y payload; readiness justificada. Incluye resultados de Gravity/Impact cuando se hayan obtenido, con sus límites. | Expresa lo conocido y la suficiencia del ensamblado. Puede existir bloqueado y no implica que haya una propuesta. |
| `PostulateProposal` | Formulación candidata derivada de un `AssemblyResult` identificado; declaración humana que atiende; alcance; fundamentos vinculados a evidencia; restricciones/Postures aplicables; consecuencias evaluadas o indeterminadas; limitaciones y decisiones pendientes. | ASM puede formularla; **no puede adoptarla ni sellarla**. Readiness no constituye aprobación ni autoridad. |

Readiness conserva los rótulos conceptuales preparado, preparado con límites y bloqueado. Se refiere al alcance declarado de la solicitud. Preparado con límites exige que ningún faltante invalide ese alcance. Un elemento crítico ausente obliga a bloqueado. Una contradicción no resuelta bloquea si compromete la formulación; las demás permanecen visibles.

Un resultado preparado habilita la formulación candidata, no la obliga. Un resultado bloqueado conserva diagnóstico y trabajo independiente; no habilita presentar una propuesta como lista. `PostulateProposal` no sustituye ni oculta el resultado que la fundamenta.

### ImpactRequest: evaluación sobre contexto preparado

`ImpactRequest` expresa conceptualmente lo que ASM necesita entregar para pedir una evaluación. No reemplaza el contrato físico existente de Impact ni fija cómo mapearlo.

| Contenido conceptual | Significado y responsabilidad de preparación |
|---|---|
| Pregunta de evaluación | Qué consecuencia o condición se solicita evaluar, con semántica identificable y resultado esperado; ASM no presupone soporte de cualquier pregunta. |
| Sujeto, scope y objetivo | Contexto compartido de aplicación, vinculado a Organization, Project, foco y declaración humana de `AssemblyRequest`. |
| Criterios/Postures | Conjunto aplicable obtenido del resolvedor normativo, con expresiones, referencias y roles necesarios para la evaluación. Un criterio candidato se distingue de uno vigente. |
| Resolución normativa | Resultado de la consulta Gravity, su scope, momento, referencias y evidencia de selección; no basta una cadena que declare autoridad. |
| Contexto y evidencia preparados | Hechos, observaciones o extractos pertinentes, unidades cuando correspondan, momento observado, fuentes y revisiones externas verificadas o marcadas como no verificadas. |
| Cobertura y faltantes | Qué parte de la pregunta cubre la evidencia; material ausente, ambiguo, desactualizado o no soportado; contradicciones que afecten la interpretación. |
| Provenance y correlación | Vínculo a la solicitud y al estado de ensamblado utilizado; trazabilidad de cada criterio/hecho a su fuente. No exige un `AssemblyResult` final previo ni un ciclo entre salidas. |
| Límites de uso | Alcance de validez, restricciones y condiciones que exigen reevaluar ante cambios de contexto, evidencia o resolución. |

ASM prepara o solicita la adquisición previa. **El núcleo de Impact no resuelve anchors ni adquiere evidencia; evalúa el contexto suministrado.** Sus conclusiones se incorporan al `AssemblyResult` conservando cobertura e indeterminaciones. No se interpreta una evaluación parcial como ausencia de impacto ni como permiso para actuar.

### Gravity: consulta al resolvedor normativo

ASM formula una consulta mediante **scope, momento y referencias**:

- **Scope:** Organization, Project, foco y delimitación pertinente a la solicitud.
- **Momento:** instante o corte de vigencia sobre el que se necesita la resolución; distinto del instante en que ASM recibe la respuesta.
- **Referencias:** recursos y antecedentes normativos pertinentes, con identidad y revisión cuando existan. Son entradas para resolver, no una selección de autoridad realizada por ASM.

El resultado requerido conceptualmente contiene **Postures aplicables, resolución y evidencia**: qué conjunto aplica al scope/momento, cómo quedó resuelta su aplicabilidad, referencias de soporte, cobertura y eventuales impedimentos. Si falta capacidad temporal, evidencia o resolución suficiente, se declara esa limitación; no se simula una respuesta histórica.

ASM conserva y consume el resultado. **ASM no recalcula Gravity**, precedencias, autoridad o aplicabilidad a partir de similitud o contenido aislado. Una lista vacía sin evidencia de resolución completa no demuestra que no haya Postures aplicables.

## 3. Contrato candidato: availability_profile

| Evidencia material | Qué demuestra | Qué no garantiza |
|---|---|---|
| I1: `EvaluationRequest` | Entradas de pregunta, contexto, Postures y snapshot; observaciones con referencia y momento. | Recepción directa del `ImpactRequest` conceptual ni adquisición de fuentes. |
| I2: `Evaluate` y `prepare` | Núcleo sobre entrada explícita, copia de datos, digest de entrada normalizada, validaciones y evaluación. | Autoridad del conjunto recibido, completitud de selección o autenticidad de evidencia externa. |
| I1: `Assessment` | Findings, referencias, evidencia mecánica, cobertura, indeterminación y condiciones de reevaluación. | Provenance estructurada end-to-end o revisiones externas verificables. Referencias textuales, timestamps y digest no certifican esas propiedades. |
| I2: `Decode` y evaluadores incluidos | Rechazo de campos desconocidos del envelope; los evaluadores actuales rechazan extensiones no admitidas. | Que baste agregar campos de provenance al JSON para integrar el contrato conceptual. El mapeo queda pendiente. |
| G1: `ResolveActive` | Resolución interna sobre estructura y sesión, filtrado de Postures activas/aplicables y devolución de Postures recopiladas con cache. | Una interfaz general ya disponible para ASM que acepte scope/momento/referencias y devuelva evidencia de revisión completa. |
| G2: frontera pública | Interpretación y análisis de criterios ya situados. | Resolución normativa: no sustituye al resolvedor de G1 ni al contrato candidato de consulta. |
| P1: `_extract_file` y bucles de ensamblado | Si falta contenido, devuelve `None`; el bucle incorpora solo resultados presentes, también en prioridad crítica. | Inclusión de todos los elementos críticos ni bloqueo explícito por cada omisión. |

Impact es materialmente más concreto que lo registrado en v0.1: existe un núcleo que recibe contexto preparado. Su disponibilidad en una integración ASM y la trazabilidad externa siguen sin demostrarse. No se ejecutó una evaluación ni se certificaron servicios disponibles.

## 4. Checklist de responsabilidad ASM (puntos 1–12, cada uno como subsección)

Las respuestas siguientes precisan la base v0.1 para este lead case; las reglas no modificadas de validación, adquisición y provenance siguen vigentes.

### 1. Campos mínimos que ASM necesita para comenzar

**semantic_contract:** `AssemblyRequest` interpretable y correlacionado, con Organization, Project, foco y declaración humana obligatorios; atribución suficiente y restricciones/límites explícitos o marcados como pendientes. Sin los cuatro obligatorios, solo diagnóstico. Sin límites suficientes para una acción, esa acción no comienza.

**availability_profile:** no se verificó un productor físico de `AssemblyRequest`; no confundir el mínimo exigido con garantía de captura.

### 2. Cuáles son obligatorios, cuáles opcionales, cuáles expandibles

**semantic_contract:** los cuatro elementos anteriores son obligatorios sin excepción en este lead case. Anchors adicionales y antecedentes son opcionales mientras ninguna conclusión dependa de ellos. Contexto derivado puede expandirse dentro de los límites iniciales. La criticidad depende de la conclusión; no se rebaja para evitar un bloqueo.

**availability_profile:** una referencia mencionada no demuestra contenido disponible ni permiso de acceso.

### 3. Qué contenido necesita por valor y qué puede recibir como referencia

**semantic_contract:** declaración humana, restricciones y límites deben ser interpretables en la entrada; Location puede vincularse por referencia a una captura recuperable sin ambigüedad. La evidencia extensa puede referenciarse, pero su contenido pertinente debe materializarse antes de sustentar una conclusión o solicitar Impact. Conservar fuente y revisión.

**availability_profile:** el núcleo de Impact recibe valores preparados; sus referencias no activan recuperación de anchors ni evidencia.

### 4. Qué validaciones realiza ASM al recibir Location

**semantic_contract:** validar captura y `AssemblyRequest`, coherencia Organization–Project–foco, vínculo y autoría de declaración humana, permisos, estados, revisiones, restricciones y límites. Contrastar contenido planificado con el realmente ensamblado antes de establecer readiness.

**availability_profile:** las validaciones de Impact no sustituyen estas comprobaciones externas.

### 5. Qué estados degradados permiten continuar y bajo qué condición

**semantic_contract:** se conserva la matriz de v0.1 §5: omitir complementos faltantes/no soportados; limitar lo stale a uso histórico; comparar changed; no elegir ambiguous por inferencia; no eludir unauthorized. Continuar solo con conclusiones independientes suficientemente respaldadas.

**availability_profile:** la evidencia requerida puede seguir inaccesible aunque Impact produzca un assessment sobre otros datos.

### 6. Cuándo ASM debe detenerse o pedir intervención humana

**semantic_contract:** bloquear si falta un obligatorio, evidencia crítica, resolución normativa necesaria o inclusión crítica del payload. Pedir intervención para cambiar declaración, foco o límites, o resolver ambigüedad humana. Ni readiness ni un assessment favorable autorizan adopción/sellado.

**availability_profile:** fallos de servicio y capacidades no soportadas permanecen explícitos, sin convertirlos en resultados favorables.

### 7. Cómo ASM solicita expansión/adquisición de información SIN modificar Location

**semantic_contract:** solicitud separada, correlacionada a `AssemblyRequest` y Location, con falta concreta, motivo, criticidad y límite. Las respuestas amplían el contexto de trabajo con provenance propia. No se alteran captura ni declaración humana.

**availability_profile:** Impact no ejecuta esas solicitudes; el canal de adquisición sigue pendiente de integración.

### 8. Cómo recupera Domains, Genes, archivos, documentación, Gravity y demás contexto

**semantic_contract:** mantener la adquisición autorizada de v0.1. Consultar Gravity al resolvedor normativo por scope/momento/referencias; obtener Postures, resolución y evidencia. Preparar luego `ImpactRequest` con material ya obtenido. ASM no recalcula Gravity.

**availability_profile:** G1 demuestra un resolvedor interno, no la integración de esa consulta conceptual; I1–I3 demuestran evaluación sobre datos preparados, no adquisición.

### 9. Cómo jerarquiza y empaqueta ese contexto usando el mecanismo común de Intents

**semantic_contract:** mantener plan de contexto y texto ordenado del mecanismo común BISP. Se añade una condición de aceptación obligatoria: **todo elemento crítico planificado debe quedar incluido o producir un bloqueo trazable**. La verificación precisa está en §5.

**availability_profile:** P1 todavía permite omitir una entrada crítica ausente; esta revisión documenta la condición, no la implementa.

### 10. Cómo conserva provenance y trazabilidad end-to-end

**semantic_contract:** conectar declaración humana y captura → adquisición → contenido/revisión → resolución Gravity → entrada y assessment de Impact, cuando corresponda → selección/payload → `AssemblyResult` → `PostulateProposal`. Marcar desconocidos y distinguir inferencia de aporte humano. Cada omisión crítica conserva su dependencia y causa.

**availability_profile:** el digest de Impact identifica la entrada procesada; no verifica por sí mismo las revisiones externas ni sustituye esa cadena. Su evidencia mecánica no equivale a provenance estructurada.

### 11. Qué resultado estructurado produce ASM antes de proponer un Postulate

**semantic_contract:** produce `AssemblyResult` con contexto, evidencia, cobertura, contradicciones, limitaciones y readiness. Solo después puede formular un `PostulateProposal` diferenciado y fundamentado. Un resultado bloqueado sigue siendo un resultado útil, pero no una propuesta lista.

**availability_profile:** ambos contratos siguen siendo conceptuales; no se afirma que haya productores o serializaciones implementados.

### 12. Qué parte corresponde a ASM y qué parte permanece en Location, Gravity, Impact, Intent o Postulate

**semantic_contract:** Already/Location conserva la captura; el humano aporta la declaración. ASM consume, adquiere por canales autorizados, ensambla y puede formular. Gravity resuelve lo normativo; Impact evalúa contexto preparado; Intent mantiene el mecanismo común de empaquetado. La adopción y el sellado de la propuesta permanecen fuera de ASM.

**availability_profile:** el núcleo de Impact y las piezas Gravity/PayloadBuilder existen según las fuentes puntuales; los contratos integrales de intercambio y su validación no están demostrados.

## 5. Política de degradación y expansión

**semantic_contract:** se conserva la política de siete estados de v0.1. La solicitud de expansión queda subordinada a los límites iniciales de `AssemblyRequest`. Una falta de cobertura de Impact o de resolución Gravity bloquea solo cuando es indispensable para la conclusión pretendida; siempre debe figurar en el resultado.

**Condición de aceptación del empaquetado:** comparar los elementos críticos del plan con el payload efectivamente entregable, después de extracción, selección, recortes y ensamblado:

1. Para cada elemento crítico, identificar su inclusión efectiva y localización en el payload, con contenido pertinente, fuente y revisión/evidencia requerida.
2. Si no puede demostrarse esa inclusión, producir un bloqueo trazable: elemento planificado, motivo de criticidad, causa de omisión, conclusión afectada y adquisición o decisión requerida.
3. Cualquier bloqueo crítico fija readiness en bloqueado e impide presentar `PostulateProposal` como lista. No basta un warning, un contador de archivos o una mención nominal sin contenido suficiente.
4. No rebajar prioridad ni sustituir una revisión silenciosamente para pasar la comprobación. Una sustitución requiere evidencia de suficiencia y trazabilidad; si cambia el alcance humano, requiere decisión explícita.

Una deduplicación puede satisfacer varias entradas solo si queda demostrada su correspondencia con el contenido incluido. Un extracto es admisible si conserva lo necesario para la conclusión. Una referencia desnuda no cubre contenido crítico requerido por valor.

**availability_profile:** el comportamiento observado de P1 no satisface por sí solo esta condición. No se han modificado sus bucles, reportes o interfaces.

## 6. Recorrido completo: Location → validación → adquisición → jerarquización → ensamblado → propuesta

**semantic_contract — recorrido candidato:**

1. Recibir `AssemblyRequest`: Location identifica dónde; declaración humana expresa qué; restricciones, provenance y límites acompañan sin confundirse.
2. Validar los obligatorios, alcance, permisos y dependencias críticas.
3. Adquirir evidencia y consultar al resolvedor Gravity mediante scope, momento y referencias. Registrar Postures, resolución y evidencia o impedimentos.
4. Cuando la pregunta lo requiera, preparar `ImpactRequest` y consumir su assessment sin ampliar la cobertura que reporta. Impact no realiza la adquisición anterior.
5. Jerarquizar y ensamblar por el mecanismo común; conciliar todo elemento crítico con el payload o emitir bloqueo.
6. Emitir `AssemblyResult` con cobertura, contradicciones, limitaciones y readiness.
7. Si hay suficiencia para ello, formular `PostulateProposal` vinculada al resultado. ASM no adopta ni sella.

Cambios de evidencia, resolución o declaración invalidan las conclusiones dependientes y pueden exigir nueva evaluación y ensamblado. No alteran retroactivamente Location.

**availability_profile:** este recorrido es candidato. La existencia de piezas de evaluación y empaquetado no prueba una conexión end-to-end.

## 7. Ejemplos (Location sano / Location degradado)

Escenarios hipotéticos [SUPUESTO S2], sin identidades concretas inventadas. Ambos contienen Organization, Project, foco y una declaración humana: “Analizar la coherencia entre el foco y su documentación”. Restricciones y límites de adquisición están declarados para el caso.

### Location sano

**semantic_contract:** todas las referencias declaran `resolved`. ASM valida, adquiere la documentación y consulta Gravity para el scope y momento pertinentes. Si corresponde evaluar consecuencias, entrega a Impact el contexto ya preparado.

**availability_profile del ejemplo:** las fuentes autorizadas responden con evidencia suficiente; el resolvedor entrega Postures, resolución y soporte; la eventual evaluación conserva sus límites. Son condiciones del escenario, no disponibilidad real certificada.

**Resultado:** si cada crítico del plan está incluido, `AssemblyResult` puede quedar preparado. ASM puede formular un `PostulateProposal` sustentado, sin adopción ni sellado. Si el builder omite una pieza crítica, incluso con Location sano, el resultado debe quedar bloqueado con causa trazable.

### Location degradado

**semantic_contract:** un antecedente complementario declara `missing`, la documentación necesaria `stale` y una relación que determina qué documentación corresponde `ambiguous`.

**availability_profile del ejemplo:** no se recupera el antecedente; solo hay documentación histórica y dos interpretaciones posibles de la relación.

**Respuesta diferenciada:** omitir el antecedente con cobertura limitada; solicitar documentación vigente; pedir desambiguación sin escoger por similitud. Un assessment de Impact sobre los hechos restantes no resuelve esos faltantes ni recupera los anchors.

**Resultado:** `AssemblyResult` bloqueado para afirmar coherencia actual. Contiene evidencia parcial, cobertura, ambigüedad y acciones pendientes; no hay `PostulateProposal` lista. Tras resolver los dos faltantes críticos y verificar inclusión en el payload, puede quedar preparado con límites por el antecedente omitido. Location original permanece intacto.

## 8. Condiciones pendientes antes de integrar físicamente ASM con Location

Se conservan los pendientes no modificados de v0.1. Esta revisión concreta las siguientes condiciones:

| Condición de aceptación | Evidencia requerida |
|---|---|
| Entrada del lead case | Rechazo trazable para ensamblado cuando falte Organization, Project, foco o declaración humana; separación verificable entre captura y declaración. |
| Restricciones, provenance y límites | Procedencia distinguible y acciones de adquisición limitadas explícitamente; desconocidos no tratados como permisos. |
| Salidas separadas | `AssemblyResult` inspeccionable aun bloqueado; `PostulateProposal` vinculada a su fundamento, sin adopción/sellado por ASM. |
| Integración Impact | Mapeo revisado desde el contenido conceptual al contrato soportado, sin pérdida silenciosa; adquisición previa; provenance y revisiones externas verificables o limitadas explícitamente. |
| Consulta Gravity | Resolvedor accesible que reciba el alcance temporal y referencial necesario y devuelva Postures, resolución y evidencia; impedimentos explícitos cuando no pueda hacerlo. |
| Inclusión crítica | Prueba de correspondencia elemento por elemento entre plan y payload; cualquier ausencia crítica genera bloqueo trazable y readiness bloqueada. |

Casos mínimos de aceptación para P1: contenido crítico inexistente; contenido crítico perdido por recorte; referencia presente sin contenido necesario; deduplicación con correspondencia demostrada; todos los críticos incluidos. Los tres primeros deben bloquear, el cuarto requiere evidencia de cobertura y el último permite continuar con las demás validaciones. Son criterios propuestos, no pruebas ejecutadas.

## 9. Supuestos utilizados (si los hubo, etiquetados [SUPUESTO])

- **S1 de v0.1 elevado a contrato candidato:** el objetivo externo deja de ser supuesto y queda expresado como declaración humana en `AssemblyRequest`, por instrucción explícita de esta revisión.
- **[SUPUESTO S2]** Los ejemplos disponen de las respuestas y evidencias indicadas únicamente para examinar el comportamiento candidato. No describen una instalación real.
- **S3 de v0.1 precisado:** los límites de Impact ahora tienen soporte material I1–I3; la consulta normativa Gravity y la separación formulación/adopción/sellado se expresan conforme a esta revisión. Las interfaces físicas pendientes se registran como pendientes, no como capacidades asumidas.

No se asume soporte fuera de Project, provenance integral en Impact, recuperación por sus referencias, consulta temporal general ya implementada en Gravity ni cumplimiento actual de la condición de inclusión crítica.