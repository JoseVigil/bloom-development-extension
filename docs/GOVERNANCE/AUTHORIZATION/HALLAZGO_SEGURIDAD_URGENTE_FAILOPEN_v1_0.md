# Hallazgo de Seguridad Urgente — Fail-Open de Rol y Creación de Mandates sin Gate

**Estado:** Reporte urgente, independiente del Módulo de Autorización de Nucleus (en diseño). No esperar
al módulo completo para tratar esto.
**Origen:** descubrimiento de solo lectura sobre el repo real (ver hallazgos §7.A y §7.G).
**Alcance de este documento:** solo señalar y acotar el fix. No se autoriza a rediseñar el sistema de
roles ni a introducir un nuevo mecanismo de autorización — eso es trabajo del módulo, separado y
posterior.

---

## 1. Fail-open: ausencia de marcador concede Master

**Ubicación:** `installer/nucleus/internal/core/metadata.go`, función que resuelve el rol efectivo
(alrededor de L77–96, según el descubrimiento).

**Comportamiento actual:** el rol efectivo se calcula por la presencia de archivos marcador (`.master`,
`.specialist`) en el filesystem local. Si no se encuentra ninguno de los dos, la función **retorna
`RoleMaster`**, no `RoleUnknown` ni un rol restringido.

**Por qué es grave:** cualquier proceso, entorno, o instalación donde por la razón que sea no exista el
marcador —una instalación nueva sin bootstrap completo, un contexto donde el marcador se borró o no se
copió, un error de configuración— queda con el rol de máximo privilegio del sistema, no con "sin acceso".
Es el patrón inverso al que debería tener cualquier control de acceso: la ausencia de prueba de identidad
debería denegar, no conceder el nivel más alto.

**Consumidores afectados** (todos heredan este comportamiento sin saberlo):
- `ownership.go` L242–289 (`team add`), L328–377 (`team remove`) — exigen Master, pero "Master" puede ser
  el resultado de que no había marcador, no de que alguien realmente lo sea.
- `blueprint.go` L211 (`sync-push`) — mismo problema.
- `vault.go` L51–62 (`Authorize()`) — el Vault Gate, que es el único control con enforcement probado en
  todo el sistema, hereda esta misma falla en su raíz.

**Corrección propuesta (acotada, sin rediseñar el sistema de roles):**
Invertir el default: ausencia de marcador → `RoleUnknown` (o el rol más restrictivo existente), nunca
`RoleMaster`. No agregar un rol nuevo, no tocar el esquema de `.ownership.json`, no introducir `Architect`
— eso queda para el módulo. Este es un cambio de una sola condición, no una reforma.

**Advertencia de compatibilidad:** este es un cambio de comportamiento observable. Cualquier instalación
que hoy funcione "por accidente" gracias al fail-open (procesos sin marcador que dependían de obtener
Master) va a empezar a fallar con el fix. Antes de aplicarlo, confirmar si existen instalaciones activas
en ese estado y decidir si necesitan migración explícita (crear el marcador) antes del despliegue del fix.

---

## 2. Creación de Mandates sin control de rol

**Ubicación:**
- `installer/nucleus/internal/orchestration/commands/mandate.go` — `mandate create` (L59–101, L129–175) y
  `mandate genesis` (L259–332+).
- `src/api/handlers/create-mandate.handler.ts` L20.

**Comportamiento actual:** ninguno de los tres caminos llama a `GetUserRole` ni a ningún equivalente antes
de crear y persistir un `mandate.json` con `status: signed`. No hay verificación de Master, de identidad,
ni de firma real antes de esa escritura.

**Por qué es grave:** el propio ecosistema define a los Mandates como *"la unidad de ejecución estratégica
más alta del sistema"* y reserva su creación a Master (`BTIPS v7.0` §9.5, `.ai_bot.sovereign.bl` según el
descubrimiento). Hoy esa restricción no existe en el código que efectivamente escribe Mandates — es una
afirmación documental sin enforcement.

**Corrección propuesta (acotada):**
Agregar, en los tres puntos de entrada, la misma verificación de rol que ya usan `team add`/`team remove`
y el Vault Gate (reutilizar el patrón existente, no inventar uno nuevo). No resolver todavía "quién puede
instalar un Mandate raíz" ni la relación con `parent_mandates" — eso depende del módulo completo y de
definir primero qué significa "Mandate raíz" en código, cosa que hoy tampoco existe.

---

## 3. Lo que este reporte NO pide

- No pide reconciliar los tres schemas incompatibles de `.ownership.json` (Go / supervisor / TypeScript)
  — es un problema real, pero de arquitectura, no de seguridad urgente; queda para el módulo.
- No pide introducir el rol `Architect`.
- No pide conectar `team_members[].role` con el rol efectivo — mismo motivo.
- No pide implementar `cor`/`validate_and_sign`/`CorNucleusRecord` ni las reglas de `mrg` — son specs sin
  código, tratamiento de diseño completo, no un parche urgente.

Mezclar esto con el trabajo del módulo completo sería repetir el problema de origen: parches locales
resolviendo de forma dispersa lo que corresponde a un solo lugar. Este reporte pide exactamente dos
cambios acotados, con el patrón de rol que ya existe, nada más.
