# OpenCode — runtime first-party de Cognituum

**Estado:** corrección normativa y auditoría de implementación  
**Fecha:** 2026-08-20  
**Fuente madre:** `COGNITUUM_RESPONSIBILITY_BOUNDARIES.md`

## Clasificación obligatoria

OpenCode es `first_party_runtime`: una aplicación y servicio distribuido que
Cognituum instala, configura, descubre, supervisa y actualiza. No es un
Intelligence Provider y no es una integración externa equivalente a Codex CLI
o Claude Code CLI.

| Dimensión | Valor |
|---|---|
| Runtime | `opencode` |
| Runtime kind | `first_party_runtime` |
| Instalación/servicio | Setup/Installer |
| Rollout/actualización/compatibilidad | Metamorph |
| Ejecución neutral | Executor, aplicación first-party de Execution Layer |
| Runtimes externos | Codex CLI y Claude Code CLI vía Executor Runtime Discovery |
| Inteligencia efectiva | provider/backend + model separados, nunca `OpenCode` |

## Estado implementado observado

- Setup empaqueta y copia el binario a `BloomNucleus/bin/opencode`:
  `installer/conductor/setup/package.json:169-170` e
  `install/installer.js:988-1005`.
- Setup instala el servicio por plataforma y verifica el puerto 4096:
  `installer.js:1398-1439,1502-1523,1698-1700`.
- En Windows se observó `BloomOpencodeService` en ejecución automática,
  OpenCode 1.18.18 y `127.0.0.1:4096` escuchando.
- Metamorph registra `opencode` en rollout y contiene stop/remove/copy/
  reinstall/start más readiness TCP:
  `installer/metamorph/internal/maintenance/rollout_opencode.go:48-54,142-271`.

## Estado parcial, roto o no implementado

- **BROKEN:** Metamorph busca el source en
  `installer/opencode/<platform>/opencode`, pero el asset real está bajo
  `installer/native/opencode/win64`; el rollout no puede copiar desde el árbol
  actual (`rollout_opencode.go:59-72`).
- **NO IMPLEMENTADO:** OpenCode no figura en inspection/managed inventory de
  Metamorph; faltan versión instalada, latest, drift y compatibilidad.
- **PARCIAL:** health sólo comprueba TCP abierto; no valida API, identidad,
  versión, capabilities ni backend de inteligencia.
- **NO IMPLEMENTADO:** Execution core, integración neutral de OpenCode y
  adapters externos CLIS.
- **NO IMPLEMENTADO:** Accounting/Vault con provider/model efectivo detrás de
  OpenCode.
- **RIESGO OBSERVADO:** el log informó que `OPENCODE_SERVER_PASSWORD` no está
  configurado; el servicio Windows corre como `LocalSystem`. Loopback reduce
  exposición de red pero no resuelve autenticación ni least privilege.

## Contratos y pruebas afectados

- Routing debe separar `runtime` de `effective_intelligence`.
- Capability Registry debe publicar ownership, service/version, health,
  compatibilidad y procedencia del descriptor.
- Evidence debe reemplazar `runtime.provider` por identidad/clase de runtime y
  agregar provider/backend/model efectivo por referencia auditable.
- EXC-001..010 conservan el mismo puerto neutral, pero la batería debe sumar
  lifecycle/discovery/update/auth/backend-attribution de OpenCode.
- Setup requiere E2E cross-platform y health semántico.
- Metamorph requiere pruebas de source path, registration, rollout, service,
  version discovery y compatibility.

## Decisiones pendientes

1. Ruta canónica del asset y manifest de compatibilidad/versiones.
2. Si instalar OpenCode sigue siendo un milestone no crítico del producto; que
   sea first-party no lo vuelve dependencia obligatoria de cada Intent.
3. Dueño de generar, rotar e inyectar `OPENCODE_SERVER_PASSWORD`.
4. Identidad de servicio least-privilege en lugar de `LocalSystem`.
5. Contrato de health semántico y compatibilidad OpenCode ↔ adapter ↔ API.
6. Versión nueva de Routing/Evidence; no mutar silenciosamente v1.

Esta publicación corrige el status documental. No corrige todavía el path de
Metamorph, la autenticación ni los contratos ejecutables: requieren work y gate
propios.
