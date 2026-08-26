# PALADIN — Fundación, partición PALADIN/SOVEREIGN y roadmap preliminar

**Versión:** v0.1  
**Fecha:** 2026-08-26  
**Estado:** PRELIMINAR — documento de apertura, análisis y preparación de decisiones  
**Autoridad de producto y arquitectura:** José Vigil  
**Alcance:** PALADIN, SOVEREIGN y la composición técnica que Metamorph deberá materializar  
**Efecto de este documento:** no autoriza implementación ni cierra las decisiones marcadas como abiertas

---

## 1. Propósito

Este documento da comienzo al desarrollo de **PALADIN**, el producto Cognituum para desarrolladores e ingenieros, y expone el problema completo que debe resolverse al distinguirlo de **SOVEREIGN**, la forma corporativa de la plataforma.

Su objetivo inmediato es permitir que una sesión posterior —incluida una sesión cloud sin acceso inicial a todo el contexto local— pueda comprender:

1. qué valor humano y técnico entrega PALADIN;
2. por qué Alfred es una parte esencial de esa experiencia;
3. por qué PALADIN y SOVEREIGN no deberían convertirse accidentalmente en dos plataformas divergentes;
4. qué responsabilidad concreta podría asumir Metamorph;
5. qué daños colaterales puede producir la partición;
6. qué preguntas de gobernanza deben cerrarse antes de implementar;
7. cómo investigar, diseñar, probar y desplegar la capacidad sin comprometer seguridad, conocimiento ni continuidad operativa.

La tesis de partida es deliberadamente exigente:

> PALADIN no es una edición reducida de Cognituum. Es la forma en que Cognituum acompaña al ingeniero como sujeto soberano de su práctica, conserva su criterio y le permite convertir intención técnica en Mandates locales con la compañía de Alfred.

---

## 2. La caricia al ingeniero

La industria suele ofrecerle al ingeniero una herramienta que completa código, responde preguntas o ejecuta tareas. PALADIN pretende entregar algo distinto: continuidad para su criterio técnico.

La “caricia” no consiste en ocultar la complejidad ni en sustituir al profesional. Consiste en retirar fricción sin retirarle soberanía:

- poder trabajar localmente, incluso cuando la organización no sea el sujeto de la instalación;
- convertir una intención todavía imperfecta en un Mandate durable;
- preservar decisiones, restricciones, hallazgos y evidencia más allá de una conversación o de un modelo particular;
- recibir de Alfred una interfaz humana y conversacional que ayude a pensar, formular y continuar;
- usar inteligencia local cuando corresponda y servicios de frontera solamente mediante rutas explícitas;
- conservar autoría, trazabilidad y capacidad de revisar lo que el sistema propone o ejecuta.

PALADIN y Alfred forman, por tanto, una pareja de producto:

```text
Ingeniero
   │ expresa intención, criterio y restricciones
   ▼
Alfred
   │ conversa, ayuda a formular y acompaña
   ▼
Mandate / BISP
   │ conserva intención y trabajo durable
   ▼
Cognituum local
   │ gobierna, ejecuta, observa y aprende
   ▼
Wisdom del ingeniero
```

Alfred no reemplaza a Brain ni es una interfaz decorativa. La arquitectura vigente lo reconoce como orquestador de primer nivel y como una instancia por dispositivo. En PALADIN debe actuar como presencia cercana al ingeniero, mientras Nucleus conserva los límites de autoridad y AITAP, cuando esté implementado, conserva Gateway, Vault por referencia y Accounting para inteligencia de frontera.

### 2.1 Promesa preliminar de PALADIN

PALADIN debería permitir que el ingeniero:

- cree y continúe Mandates en su entorno local;
- converse con Alfred sin convertir al renderer en custodio de secretos;
- elija o reciba rutas de inteligencia compatibles con sus políticas;
- conserve Wisdom personal y evidencia técnica;
- inspeccione qué está instalado, activo, autorizado y saludable;
- actualice el sistema sin reconstruir manualmente toda su instalación;
- pueda incorporarse posteriormente a una organización sin que su identidad personal desaparezca ni que sus activos cambien de dueño de manera implícita.

Estas capacidades son intención de producto. Su contrato final, UX, modelo comercial y secuencia de implementación siguen abiertos.

---

## 3. Contexto de mercado real

La distinción entre una experiencia individual y otra organizacional es una necesidad observable del mercado, no una anomalía de Cognituum.

GitHub ofrece planes de Copilot para individuos y para organizaciones. Su propia comparación identifica como diferencias centrales de la oferta organizacional la administración de licencias, la administración de políticas y determinadas protecciones institucionales; también ofrece control centralizado de acceso y políticas para miembros de una organización. Esto demuestra que el valor corporativo no consiste solamente en “más inteligencia”, sino en gobierno y administración colectiva. Fuente: [GitHub Copilot — planes](https://github.com/features/copilot/plans) y [documentación oficial de planes](https://docs.github.com/en/copilot/get-started/plans).

JetBrains también distingue usuarios individuales y organizaciones. En organizaciones administradas, un administrador puede conceder o revocar acceso a IA y controlar recursos compartidos o límites por usuario. Fuente: [JetBrains AI — licencias y suscripciones](https://www.jetbrains.com/help/ai-assistant/licensing-and-subscriptions.html).

La señal de mercado es clara:

- el individuo busca potencia, continuidad y control directo de su herramienta;
- la organización necesita además identidad institucional, políticas, administración, auditoría, costos, cumplimiento y revocación;
- separar ofertas puede ser correcto comercialmente;
- duplicar el núcleo técnico para representar esa separación suele multiplicar deuda, incompatibilidades y superficie de seguridad.

PALADIN tiene una oportunidad de diferenciación: no limitarse a completar código o chatear. Su propuesta puede centrarse en la preservación de sabiduría técnica, la formulación durable de Mandates, el trabajo local y la relación continua con Alfred. SOVEREIGN puede agregar gobierno institucional sin convertir esa capacidad personal en un privilegio reservado a empresas.

Este contexto no define precios, licencias ni packaging comercial. Es evidencia para entender el problema, no una decisión comercial.

---

## 4. Una plataforma, dos productos

Los nombres vigentes para este análisis son:

| Producto | Sujeto principal | Promesa distintiva preliminar |
|---|---|---|
| **PALADIN** | Ingeniero, desarrollador o profesional individual | Mandates locales, Alfred por dispositivo, continuidad de criterio y Wisdom personal |
| **SOVEREIGN** | Organización | Capacidades Cognituum más identidad institucional, miembros, roles, políticas, auditoría, coordinación y gobierno del conocimiento |

La separación de producto no debería implicar automáticamente:

- dos repositorios;
- dos implementaciones de Nucleus;
- dos Alfred incompatibles;
- dos formatos de Mandate;
- dos modelos de Wisdom;
- dos cadenas de rollout;
- dos protocolos de evidencia;
- dos plataformas que evolucionan a velocidades distintas.

La hipótesis arquitectónica más segura es **un núcleo compartido y composiciones diferentes**.

```text
                        Cognituum Core compartido
            ┌──────────────────────┴──────────────────────┐
            │                                             │
      PALADIN composition                         SOVEREIGN composition
      sujeto individual                           sujeto organizacional
      Alfred por dispositivo                      Alfred por dispositivo
      Wisdom personal                             Wisdom personal + institucional
      políticas personales                        roles, grants, auditoría y control
```

La palabra “composición” es todavía una herramienta de análisis. El nombre final del contrato y su representación requieren aprobación de José.

---

## 5. Frontera de responsabilidades propuesta

La partición solamente será sostenible si no se confunden decisión y materialización.

### 5.1 Nucleus

Nucleus debe conservar la autoridad sobre:

- identidad del sujeto;
- pertenencia y contexto organizacional;
- roles, grants y políticas;
- capacidades autorizadas;
- vigencia, revocación y auditoría;
- autorización de cambios con efectos reales;
- ownership de conocimiento según los contratos que se aprueben.

### 5.2 Metamorph

Metamorph debe ser investigado como responsable de materializar una composición autorizada:

- inspeccionar estado actual;
- calcular diferencias contra el estado deseado;
- verificar artefactos, versión, plataforma, digest y compatibilidad;
- ordenar paradas y arranques según dependencias;
- instalar, actualizar o retirar componentes;
- preservar servicios que estaban activos;
- ejecutar health checks;
- restaurar o hacer rollback ante fallos;
- emitir recibos y evidencia de la reconciliación.

Metamorph no debe decidir si una persona “merece” PALADIN o SOVEREIGN, ni derivar permisos a partir de los archivos presentes.

### 5.3 Installer/Setup

Installer/Setup debe conservar instalación inicial, privilegios del sistema, ACL, registro de servicios y el sustrato mínimo necesario para iniciar onboarding. Debe resolverse qué parte es bootstrap neutral y qué parte llega después mediante Metamorph.

### 5.4 Alfred

Alfred debe permanecer por dispositivo y separado del custodio angosto de gobernanza Alfred-Go. En PALADIN es central para la experiencia del ingeniero, pero no debe:

- custodiar credenciales de proveedores dentro del renderer;
- inventar autorización;
- absorber Vault;
- simular AITAP como si estuviera implementado;
- asumir que una identidad de organización equivale a una identidad de dispositivo.

### 5.5 Batcave y SOVEREIGN

Batcave puede resultar relevante como fuente remota de política organizacional, autorización o distribución, pero la cadena exacta todavía está abierta. Debe preservarse el principio vigente: Batcave autoriza y enruta; Nucleus firma o ejecuta dentro de su frontera. No debe asumirse todavía quién firma el futuro documento de composición.

---

## 6. Estado técnico real que condiciona la partición

La capacidad no parte de una hoja en blanco.

### 6.1 Metamorph hoy

El rollout actual de Metamorph está construido alrededor de un catálogo estático `allComponents` en `installer/metamorph/internal/maintenance/rollout.go`. Cada componente declara origen, destino y, cuando corresponde, hooks de pre-deploy, post-deploy, restauración y filtro de plataforma.

Esto permite rollout explícito de componentes, pero todavía no constituye un motor de composición PALADIN/SOVEREIGN:

- la selección global está codificada en el binario;
- no existe todavía un contrato de producto/composición firmado;
- `generate-manifest` declara que no está implementado;
- el descubrimiento remoto de manifests de IonPump está señalado para una fase posterior;
- varios componentes poseen lifecycle específico y no pueden tratarse como copias equivalentes;
- retirar un componente no tiene aún la semántica de migración, conservación y ownership que esta partición necesita.

Metamorph ya tiene capacidades valiosas —inspección, rollout, rollback y reconciliación parcial—, pero no debe presentarse como terminado para este nuevo objetivo.

### 6.2 Alfred hoy

Alfred conversa actualmente mediante Ollama local como opción por defecto o Gemini directo como camino transicional opt-in. Su emisión hacia AITAP está diseñada, pero el motor real de routing de AITAP no está implementado y la recepción estructurada permanece condicionada por contratos pendientes.

Por ello, prometer PALADIN + Alfred no puede confundirse con declarar completo el circuito productivo de inteligencia, identidad de dispositivo y accounting.

### 6.3 Organización y Mandates

El repositorio ya contiene un modelo de cambio de organización con drenado de trabajo no terminal. Esa experiencia evidencia que cambiar de sujeto no es actualizar una preferencia visual: puede existir trabajo durable en Temporal, estado local, Vault, ownership, endpoints y Mandates en ejecución.

La transición PALADIN/SOVEREIGN debe reutilizar esas invariantes cuando correspondan, sin asumir que “cambiar de organización” y “cambiar de producto/composición” son la misma operación.

---

## 7. El problema de la partición

La partición tiene al menos cinco dimensiones diferentes:

1. **Producto:** qué promesa recibe el ingeniero y qué agrega la organización.
2. **Comercial:** quién compra, asigna, administra o revoca acceso.
3. **Identidad:** quién es el sujeto de cada acción y de cada activo.
4. **Autorización:** qué capacidades puede ejercer ese sujeto.
5. **Distribución:** qué componentes y configuraciones existen físicamente.

Si estas dimensiones se comprimen en una única bandera, por ejemplo `edition=paladin`, aparecen errores graves:

- una modificación comercial puede cambiar permisos técnicos sin un grant;
- un archivo residual puede conservar capacidades organizacionales;
- un fallo de rollout puede dejar una composición híbrida;
- una revocación remota puede destruir o bloquear datos personales;
- un downgrade puede ser usado para evadir auditoría;
- el sistema puede creer que está en PALADIN mientras servicios SOVEREIGN siguen activos;
- dos formatos de Mandate pueden divergir y volver imposible una transición limpia.

La distinción mínima necesaria es:

| Plano | Pregunta | Autoridad candidata |
|---|---|---|
| Identidad | ¿Quién actúa? | Nucleus / sistema de identidad autorizado |
| Política | ¿Qué puede hacer? | Nucleus mediante grants y políticas |
| Composición | ¿Qué debe estar instalado? | Estado deseado autorizado, materializado por Metamorph |
| Estado operativo | ¿Qué está realmente funcionando? | Metamorph + health de cada componente |
| Datos | ¿De quién es y qué debe conservarse? | Gobernanza de dominio; nunca inferido por rollout |

---

## 8. Daños colaterales y registro preliminar de riesgos

Escala cualitativa: **Crítico**, **Alto**, **Medio** o **Bajo**. La prioridad final requiere threat modeling y diseño aprobado.

| Riesgo | Severidad inicial | Daño posible | Mitigación que debe investigarse |
|---|---|---|---|
| Fork técnico PALADIN/SOVEREIGN | Crítico | Drift de contratos, parches y seguridad; doble certificación; migraciones incompatibles | Core único, manifests declarativos y matriz de compatibilidad compartida |
| Metamorph convertido en autoridad | Crítico | Escalada de privilegios instalando componentes como sustituto de grants | Nucleus autoriza; Metamorph verifica y materializa sin conceder capacidades |
| Composición híbrida tras fallo | Crítico | Servicios de ambas formas activos, puertos ocupados, comportamiento indeterminado | Plan transaccional, journal durable, health, rollback y recibo final inequívoco |
| Borrado o cambio de ownership | Crítico | Pérdida de Mandates, Wisdom, evidencia o conocimiento institucional | Separar lifecycle de binarios y lifecycle de datos; migraciones explícitas y autorizadas |
| Revocación mientras hay trabajo activo | Crítico | Mandates truncados, corrupción de workflows o ejecución sin autoridad vigente | Drenado, cancelación gobernada, fencing y políticas de continuidad/expiración |
| Downgrade como evasión | Crítico | Evitar auditoría o controles SOVEREIGN pasando a PALADIN | Transición autorizada, auditada y fail-closed; no aceptar bandera local unilateral |
| Trust chain débil | Crítico | Manifest o artefacto adulterado; rollback malicioso; replay | Firma, digest, anti-replay, expiry, trust roots y provenance de artefactos |
| Bootstrap circular | Alto | Metamorph necesita una decisión de Nucleus antes de que ambos estén listos | Sustrato neutral mínimo y onboarding con estados durables |
| Servicios y watchdogs divergentes | Alto | Procesos huérfanos, relanzamientos durante rollout, archivos bloqueados | Lifecycle por plataforma, ownership verificable y espera por condición, no sleeps arbitrarios |
| Secretos filtrados entre sujetos | Crítico | Credenciales personales visibles para la organización o viceversa | Vault user-scoped, references, migración explícita y renderer sin secretos |
| Identidad de Alfred incompleta | Alto | Dispositivo no revocable o conversación atribuida al sujeto incorrecto | Alta y revocación por dispositivo, separadas de identidad organizacional |
| Configuración compartida accidental | Alto | Endpoint, provider, org activa o política incorrectos después de transición | Config versionada por scope, resolución única de contexto y validación post-switch |
| Incompatibilidad de versiones | Alto | Nucleus interpreta una composición que Metamorph no entiende | Versionado de schema, minimum versions, negociación y rechazo seguro |
| Rollback hacia estado no autorizado | Alto | Restaurar binarios sanos pero políticas vencidas o revocadas | Rollback técnico condicionado por autorización vigente y receipt correlacionado |
| Offline ambiguo | Alto | SOVEREIGN opera indefinidamente con grants vencidos o PALADIN queda inutilizable | Política explícita de lease, grace period, caché verificable y operaciones permitidas offline |
| Doble accounting | Medio/Alto | Costos personales cargados a la organización o inversamente | Correlación por sujeto, dispositivo, provider/model y grant efectivo |
| Telemetría y privacidad | Alto | Información personal enviada a control institucional sin base autorizada | Clasificación de datos, consentimiento, minimización y routing por scope |
| UX confusa | Medio | Usuario desconoce producto, sujeto o destino de su Wisdom | Mostrar composición, identidad activa, ownership y efecto antes de cada transición |
| Explosión de matriz de pruebas | Alto | Combinaciones OS/arquitectura/producto/transición imposibles de certificar | Núcleo común, fixtures de manifests y matriz de estados/transiciones priorizada |
| Dependencia del repositorio fuente | Alto | Rollout productivo depende de paths de desarrollo o artefactos no publicados | Canal de distribución firmado, staging seguro y separación dev/production |
| Hardcode de dos productos | Medio/Alto | Una tercera composición exige reescribir Metamorph | Contrato genérico de composición, sin convertir nombres comerciales en lógica profunda |

### 8.1 Riesgo sistémico principal

El mayor riesgo no es que falle una copia de archivos. Es producir dos verdades simultáneas:

```text
Nucleus cree que el sujeto tiene una política
Metamorph cree que la máquina tiene otra composición
los datos conservan un tercer ownership
los servicios ejecutan un cuarto estado residual
```

El diseño debe hacer observable esa divergencia y bloquear operaciones sensibles hasta reconciliarla.

---

## 9. Transiciones que deben diseñarse antes de la instalación final

No alcanza con definir una instalación limpia de cada producto. Deben existir contratos para:

### 9.1 Instalación nueva de PALADIN

```text
Setup instala sustrato neutral
→ onboarding identifica al ingeniero
→ Nucleus establece identidad y políticas locales
→ se autoriza composición PALADIN
→ Metamorph materializa y verifica
→ Alfred queda disponible
→ creación local de Mandate se certifica
```

### 9.2 Instalación nueva de SOVEREIGN

Debe agregar enrollment institucional, trust remoto, políticas, auditoría y pertenencia sin crear un Nucleus semánticamente distinto.

### 9.3 PALADIN → SOVEREIGN

Debe decidir explícitamente:

- qué identidad sigue siendo personal;
- qué Mandates permanecen personales;
- qué puede proponerse para promoción institucional;
- quién acepta la transferencia;
- cómo se registran consentimiento y evidencia;
- qué ocurre con providers, costos, Vault y Alfred;
- cómo se drena trabajo local antes de cambiar composición.

### 9.4 SOVEREIGN → PALADIN

No puede equivaler a desinstalar módulos corporativos. Debe resolver revocación, exportación permitida, retención institucional, secretos, auditoría, trabajo en curso y continuidad del conocimiento personal.

### 9.5 Organización A → Organización B

Debe permanecer separado de PALADIN/SOVEREIGN. Cambiar de organización no necesariamente cambia de producto; cambiar de producto no necesariamente cambia de organización en el mismo instante.

### 9.6 Recuperación después de un fallo

Cada transición necesita un estado durable que permita responder:

- qué se intentaba hacer;
- quién lo autorizó;
- qué componentes alcanzaron a cambiar;
- qué servicios estaban activos;
- qué datos no debían tocarse;
- si corresponde continuar, revertir o pedir intervención.

---

## 10. Contrato preliminar de composición

Sin cerrar nombre ni schema, el futuro contrato debería poder representar:

- `composition_id` y versión;
- producto solicitado: PALADIN o SOVEREIGN como metadata de producto, no como única fuente de lógica;
- sujeto y referencia de identidad;
- referencia de política/grant que autoriza la reconciliación;
- issuer, firma, issued-at, expiry y protección anti-replay;
- plataforma, arquitectura y canal;
- componentes requeridos, opcionales y prohibidos;
- versiones, digests y provenance;
- dependencias y orden de lifecycle;
- health probes y criterios de aceptación;
- política de configuración;
- política de retiro sin inferir borrado de datos;
- versión mínima compatible de Nucleus y Metamorph;
- target de rollback;
- correlation ID y requisitos de evidencia.

Debe distinguirse entre:

1. **manifest deseado**, que expresa el objetivo autorizado;
2. **plan de reconciliación**, calculado para esa máquina;
3. **receipt**, que demuestra qué ocurrió realmente;
4. **estado observado**, obtenido por inspección posterior.

Ninguno de estos artefactos sustituye el grant de runtime de Nucleus.

---

## 11. Roadmap preliminar

### Fase P0 — Gobernanza y lenguaje

- Confirmar PALADIN y SOVEREIGN como productos y delimitar qué significa “versión”.
- Definir sujetos, ownership y autoridad.
- Resolver qué decisiones son locales y cuáles requieren control institucional.
- Definir principios de transición y no destrucción de conocimiento.

**Gate:** no diseñar schema definitivo antes de cerrar autoridad y ownership.

### Fase P1 — Inventario y mapa de composición

- Inventariar componentes actuales de Metamorph, Setup y servicios por plataforma.
- Clasificar shared core, PALADIN-only, SOVEREIGN-only y configuration-only.
- Identificar datos, secretos, puertos, procesos hijos, watchdogs y dependencias.
- Reconstruir paths de instalación, build y actualización productiva.

**Gate:** ningún componente se clasifica solamente por su nombre; debe justificarse por responsabilidad y amenaza.

### Fase P2 — Contratos

- Diseñar manifest deseado, plan, receipt y observed state.
- Diseñar firma, anti-replay, expiry y compatibilidad.
- Diseñar grants Nucleus → Metamorph y límites de privilegio.
- Diseñar estados de transición y recovery.

**Gate:** threat model y revisión de gobernanza.

### Fase P3 — Metamorph como reconciliador

- Reemplazar selección rígida por composición declarativa sin romper `rollout --only` de mantenimiento.
- Incorporar plan/dry-run legible.
- Journal durable, idempotencia y rollback.
- Ownership verificable de procesos y servicios.
- Verificación post-deploy y recibos firmados o correlacionables.

**Gate:** simulación y pruebas de fallos antes de tocar una instalación real.

### Fase P4 — Experiencia PALADIN

- Onboarding individual.
- Alfred por dispositivo con identidad revocable.
- Creación local de Mandates.
- Wisdom personal y evidencia.
- Visualización clara de identidad, composición y salud.

### Fase P5 — Experiencia SOVEREIGN

- Enrollment institucional.
- Roles, políticas, auditoría y accounting organizacional.
- Conocimiento institucional y promoción explícita.
- Administración de dispositivos y revocación.

### Fase P6 — Transiciones y certificación

- PALADIN → SOVEREIGN.
- SOVEREIGN → PALADIN.
- Organización A → B sin confundir producto y organización.
- Offline, expiry, revocación y disaster recovery.
- Windows, macOS y Linux.

---

## 12. Estrategia preliminar de pruebas

La certificación final debe cubrir más que “el comando terminó con éxito”.

### 12.1 Invariantes

- Un mismo formato de Mandate conserva significado en ambos productos.
- Alfred conserva identidad de dispositivo y nunca expone secretos al renderer.
- Nucleus deniega capacidades no autorizadas aunque el binario exista.
- Metamorph no instala una composición sin evidencia de autoridad válida.
- Un fallo no deja servicios previamente activos detenidos sin recuperación explícita.
- Ningún cambio de composición borra datos por inferencia.
- Rollback no restaura una autorización vencida.
- El estado observado coincide con el receipt o produce una alerta de drift.

### 12.2 Matriz mínima

- instalación limpia PALADIN;
- instalación limpia SOVEREIGN;
- upgrade dentro de cada producto;
- transición en ambas direcciones;
- transición con Mandate activo;
- fallo de descarga, firma, copia, servicio y health check;
- pérdida de conectividad antes y después de la autorización;
- manifest vencido, repetido, adulterado o incompatible;
- proceso ajeno usando un puerto esperado;
- reinicio de máquina a mitad de reconciliación;
- preservación de Wisdom personal e institucional;
- validación Windows, macOS y Linux.

---

## 13. Decisiones de gobernanza que la sesión cloud debe producir

La próxima sesión debe devolver decisiones explícitas, no solamente recomendaciones generales:

1. ¿PALADIN y SOVEREIGN son productos, composiciones, licencias o una combinación de esos conceptos?
2. ¿Cuál es el sustrato neutral que siempre se instala?
3. ¿Quién es la fuente autoritativa de identidad antes y después del enrollment?
4. ¿Quién emite y firma el estado deseado que recibe Metamorph?
5. ¿Qué puede hacer PALADIN completamente offline?
6. ¿Qué ocurre cuando una autorización SOVEREIGN expira o es revocada?
7. ¿Qué componentes son realmente exclusivos y cuáles son shared core con gates?
8. ¿Cómo se adquiere, promueve, exporta o retiene Wisdom?
9. ¿Puede una organización exigir una composición administrada y bloquear desviaciones locales?
10. ¿Qué evidencia debe conservarse de cada transición?
11. ¿Cómo se distinguen rollback técnico, downgrade comercial y salida institucional?
12. ¿Qué compatibilidad debe existir entre versiones de Nucleus, Metamorph, Alfred y schemas?

---

## 14. Criterio preliminar de éxito

PALADIN será una realidad cuando un ingeniero pueda instalar Cognituum, ser reconocido como sujeto personal, conversar con Alfred, crear y continuar Mandates localmente, conservar su Wisdom, inspeccionar su sistema y actualizarlo mediante Metamorph sin depender de una organización.

SOVEREIGN será una evolución coherente cuando una organización pueda agregar gobierno institucional, no apropiarse silenciosamente de la identidad personal del ingeniero ni exigir un fork del núcleo.

La partición será técnicamente sana cuando:

```text
una plataforma
+ dos promesas de producto claras
+ identidad y ownership explícitos
+ autorización fail-closed
+ composición declarativa y verificable
+ transiciones recuperables
= PALADIN y SOVEREIGN sin fracturar Cognituum
```

---

## 15. Declaración de apertura

PALADIN comienza con una ambición concreta: que la potencia de Cognituum no pertenezca únicamente a una estructura corporativa, sino que pueda acompañar al ingeniero allí donde piensa y construye.

Alfred le ofrece conversación y presencia. Mandates le ofrecen continuidad. Wisdom impide que el criterio conquistado desaparezca con la sesión. Nucleus preserva autoridad. Metamorph hace posible que esa arquitectura llegue a una máquina real, evolucione y se recupere.

SOVEREIGN no debe negar esa soberanía individual; debe permitir que muchas soberanías colaboren bajo reglas institucionales explícitas. La maravilla tecnológica no será producir dos instaladores. Será sostener dos formas legítimas de habitar Cognituum sin quebrar su núcleo, perder conocimiento ni confundir poder operativo con autoridad.

Ese es el trabajo que comienza aquí.
