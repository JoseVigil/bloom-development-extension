// ipc/health-handlers.js — Bloom Conductor
// Handler: nucleus:health
// Mapea nucleus --json health → IPC renderer

'use strict';

const { ipcMain } = require('electron');

/**
 * registerHealthHandlers(execNucleus)
 *
 * Registra el handler nucleus:health.
 * Recibe execNucleus como dependencia para mantener
 * la misma instancia que usa el resto del Conductor.
 *
 * Comando real:
 *   nucleus --json health
 *
 * JSON Response shape (nucleus.exe):
 * {
 *   "success": false,
 *   "state": "DEGRADED",
 *   "error": "...",
 *   "timestamp": 1740000000,
 *   "components": {
 *     "temporal":       { "healthy": true,  "state": "RUNNING",      "port": 7233,  "latency_ms": 4 },
 *     "worker":         { "healthy": false, "state": "DISCONNECTED",  "error": "..." },
 *     "brain_service":  { "healthy": false, "state": "UNREACHABLE",  "port": 5678,  "error": "..." },
 *     ...
 *   },
 *   "brain_last_errors": { ... }
 * }
 *
 * Shape devuelta al renderer:
 * {
 *   success: true,
 *   health: {
 *     status:           "healthy" | "degraded" | "unhealthy",
 *     all_services_ok:  boolean,
 *     state:            string,       // raw del binario
 *     error:            string|null,
 *     timestamp:        number,
 *     services:         { [name]: string },  // mapa simplificado para la UI
 *     components:       object,              // raw completo para debug
 *     brain_last_errors: object|null
 *   }
 * }
 */
function registerHealthHandlers(execNucleus) {

  ipcMain.handle('nucleus:health', async () => {
    try {
      const raw = await execNucleus(['--json', 'health'], 15000);

      // ── Normalizar estado global ──────────────────────────────────────
      // nucleus devuelve "success": false cuando hay componentes unhealthy,
      // pero eso no es un error de ejecución — es el resultado esperado.
      const state      = (raw.state || '').toUpperCase();
      const allOk      = !!(raw.success);
      const status     = allOk
        ? 'healthy'
        : state === 'DEGRADED' ? 'degraded' : 'unhealthy';

      // ── Mapa simplificado para la UI de conductor.html ────────────────
      // conductor.html espera: { [serviceName]: string (descripción) }
      const services = {};
      if (raw.components && typeof raw.components === 'object') {
        for (const [name, info] of Object.entries(raw.components)) {
          if (!info || typeof info !== 'object') continue;

          const parts = [info.state || (info.healthy ? 'OK' : 'ERROR')];
          if (info.port)       parts.push(`port ${info.port}`);
          if (info.latency_ms !== undefined) parts.push(`${info.latency_ms}ms`);
          if (info.pid)        parts.push(`pid ${info.pid}`);
          if (info.error)      parts.push(`⚠ ${info.error}`);
          if (info.profiles_count !== undefined) parts.push(`profiles: ${info.profiles_count}`);

          services[name] = parts.join(' · ');
        }
      }

      return {
        success: true,
        health: {
          status,
          all_services_ok:   allOk,
          state:             raw.state   || null,
          error:             raw.error   || null,
          timestamp:         raw.timestamp || null,
          services,
          components:        raw.components        || null,
          brain_last_errors: raw.brain_last_errors || null
        }
      };

    } catch (err) {
      // execNucleus lanza si hay timeout o el proceso no arranca.
      // No lanzamos — devolvemos error estructurado para que la UI
      // muestre "Error" en lugar de crashear.
      return {
        success: false,
        error:   err.message,
        health: {
          status:          'unhealthy',
          all_services_ok: false,
          state:           'UNREACHABLE',
          error:           err.message,
          services:        { nucleus: `⚠ ${err.message}` },
          components:      null,
          brain_last_errors: null
        }
      };
    }
  });

}

module.exports = { registerHealthHandlers };