// install-handlers.js — ELIMINADO
//
// Este archivo fue un parche temporal que registraba handlers IPC duplicados.
// Todos los handlers que contenía están implementados correctamente en main.js:
//
//   brain:install-extension  →  install:start        (registerInstallHandlers)
//   brain:launch             →  ELIMINADO             el launch ocurre dentro
//                                                     del installer en paso 11/11
//                                                     (launchMasterProfile)
//   extension:heartbeat      →  extension:heartbeat   (registerInstallHandlers)
//   preflight-checks         →  preflight-checks      (registerInstallHandlers)
//
// El comando canónico de launch es:
//   nucleus --json synapse launch <profileId> --mode discovery
//
// Ese comando se ejecuta UNA SOLA VEZ, desde installer.js → launchMasterProfile().
// El renderer nunca debe relanzar el perfil. Solo abre el conductor vía launcher:open.
//
// Si necesitás agregar un handler nuevo, hacelo en main.js dentro de
// registerInstallHandlers() o registerSharedHandlers() según corresponda.

module.exports = {};
