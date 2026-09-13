# Cierre — Investigación de escala de usuarios, catálogo completo de roles y nomenclatura de `AGENT_ISSUER_ROLE`

**Para:** Génesis Control
**De:** cowork de Investigación
**Fecha:** 2026-09-12
**Estado:** cerrado — decisión tomada, con una salvedad de archivo señalada en la última sección (no
bloquea el cierre, pero corresponde dejarla registrada, no ocultarla).

---

## Qué se investigó

Dos rondas, en secuencia: (1) escala real de usuarios de BTIPS — founder solo, equipo chico/mediano,
organización grande — y dónde encaja nombrar la designación de agentes dentro de esa escala; (2)
catálogo completo de roles organizacionales, contrastado contra la industria (GitHub, Google
Workspace, Slack, Notion, Linear, Kubernetes RBAC), para no decidir el nombre de un permiso aislado
sin mirar el catálogo entero.

## Qué se aprobó (José, 2026-09-12)

1. `AGENT_ISSUER_ROLE` deja de ser un rol aparte. El permiso técnico `agent.issuer.designate` se
   empaqueta dentro de roles ya existentes o nuevos — nunca como rol de un solo permiso.
2. Dos roles built-in nuevos, **nombres primera pasada, no finales:** `delegate` (administración
   operativa acotada, `vault.*`/`executor.*`) y `scoped_admin` (administración de `authority.*`
   acotada a un proyecto).
3. `agent.issuer.designate` vive dentro de `master` (founder solo) y dentro de `scoped_admin` (equipo
   chico/mediano y organización grande). El primer lugar (`master`) es una lectura razonada de la
   investigación, no una frase textual de la aprobación — queda marcada como asunción a confirmar en
   `Encargo_Diseno_Contratos_Nacimiento_Agente_Orbital_v0_2.md`, sin que eso reabra la investigación.

## Estado de las dos investigaciones originales

- **`Investigacion_Catalogo_Completo_Roles_Organizacionales_v0_1.md` — cerrada, decisión tomada.**
  Guardada en el repo real (`docs/ANALYSIS/BACKEND/ROLES/`, commit `26fb03d`) y, a partir de este
  cierre, en el proyecto BTIPS en la misma ruta corregida (ver salvedad de archivo, abajo).
- **`Investigacion_Escala_Usuarios_Nomenclatura_AGENT_ISSUER_ROLE_v0_1.md` — cerrada en cuanto a la
  decisión que produjo; el documento en sí no se localizó.** Se buscó en el repo real (`git log --all`
  sobre todo el historial, cero commits que agreguen un archivo con ese nombre o variantes) y en el
  proyecto BTIPS (no está en el listado). Su contenido no se perdió — está citado y absorbido en
  detalle dentro de `Investigacion_Catalogo_Completo_Roles_Organizacionales_v0_1.md` (arquetipos §1,
  hipótesis de `agent_sponsor` como permiso §6.5) — pero como pieza archivada, propia, con su propio
  nombre de archivo, no existe en ningún lado que se haya podido verificar. No se inventa ni se asume
  que existe en otro repositorio o carpeta no conectada a esta sesión.

## Confirmación de ruta en el proyecto BTIPS

`Investigacion_Catalogo_Completo_Roles_Organizacionales_v0_1.md` quedó re-guardada en
`ANALYSIS/BACKEND/ROLES/` (ortografía corregida, igual que en el repo real) y se eliminó la copia
anterior bajo la ruta con el typo `ANAYSIS/BACKEND/ROLES/`. `Encargo_Diseno_Contratos_Nacimiento_Agente_Orbital_v0_2.md`
se guardó como documento nuevo bajo `ANALYSIS/GRAVITY/ORBITAL/`, con la misma ortografía corregida —
reemplaza en contenido a `Encargo_Diseno_Nacimiento_Agente_Orbital_EnfoqueA_v0_1.md` (v0.1, que queda
en su ruta original, con el typo heredado de esa fecha, como registro histórico — no se reescribe
retroactivamente).

## Explícitamente fuera de este cierre — no confundir con pendiente de esta investigación

1. Nombres finales de `delegate`/`scoped_admin` — siguen siendo primera pasada.
2. Re-verificación técnica contra el repo real (`decision.go`, `snapshot.go`, `actor_proof.go`,
   `identity.go`, `temporal_client.go`, y el archivo de `RoleAssignment`/enforcement de scope,
   todavía no identificado) — hilo técnico separado, no de investigación.
3. Custodia de la clave efímera durante el turno — sigue sin decidirse.
4. La confirmación pendiente de José sobre si `agent.issuer.designate` va en `master` **y**
   `scoped_admin`, o solo en `scoped_admin` (arriba, §3 de lo aprobado).

## La salvedad, dicha una sola vez y sin dramatizarla

El documento fuente de la primera investigación (2026-09-11) no está archivado en ningún lugar
verificable. Si existe en algún otro repositorio, carpeta local no conectada a esta sesión, o
conversación de otra plataforma, vale la pena recuperarlo y guardarlo con su propio nombre — el
contenido no se perdió (vive citado en la segunda investigación), pero la trazabilidad de "qué
documento exacto aprobó José el 2026-09-11" hoy depende enteramente de las citas de un documento
distinto. Esto no bloquea el cierre que pide Génesis Control — se deja registrado para que quien
reciba este cierre no asuma que el archivo existe en algún lado sin haberlo verificado.
