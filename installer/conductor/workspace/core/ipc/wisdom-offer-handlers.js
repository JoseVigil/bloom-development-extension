'use strict';

// Wisdom — oferta de Mandate. Core presenta; Nucleus lee Backend, verifica e instala.
//
// Las lecturas son independientes entre sí: el catálogo remoto, las instalaciones
// locales y la elegibilidad de los proyectos se piden por separado, así un fallo
// remoto no oculta el estado local. Ninguna lectura descarga ni instala nada: la
// única escritura es core:wisdom-install, que sólo se invoca desde el gesto
// explícito del Paladín sobre un proyecto elegible.

const fs = require('fs');
const { ipcMain } = require('electron');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SEMVER = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
const HEX64 = /^[0-9a-f]{64}$/;

function activeOrganization(nucleusConfigPath) {
  const config = JSON.parse(fs.readFileSync(nucleusConfigPath, 'utf8'));
  const slug = config.onboarding?.active_org_slug || null;
  const org = (config.onboarding?.organizations || []).find(o => o.org_slug === slug) || null;
  if (!slug || !org) throw new Error('active_organization_unavailable');
  return { slug, projects: (org.projects || []).filter(p => UUID.test(p.project_id || '')) };
}

function cliFailure(result, fallback) {
  return { ok: false, error: result?.error || { code: fallback, message: fallback } };
}

function errorResult(error, code) {
  // execNucleus resuelve con el JSON aunque el proceso salga con 1; sólo rechaza
  // si no hubo JSON (timeout, binario ausente).
  return { ok: false, error: { code, message: error?.message || String(error) } };
}

function registerWisdomOfferHandlers(execNucleus, nucleusConfigPath, logger = console) {
  ipcMain.handle('core:wisdom-offers-read', async () => {
    try {
      const result = await execNucleus(['--json', 'mandate', 'offer', 'list'], 30000);
      if (!result?.ok || result.schema !== 'bloom.mandate-offer-cli/v1') return cliFailure(result, 'catalog_unavailable');
      return { ok: true, catalog: result.result };
    } catch (error) {
      logger.warn('[WISDOM] catálogo no disponible:', error.message);
      return errorResult(error, 'catalog_unavailable');
    }
  });

  ipcMain.handle('core:wisdom-installations-read', async () => {
    try {
      const result = await execNucleus(['--json', 'mandate', 'offer', 'installed'], 15000);
      if (!result?.ok || result.schema !== 'bloom.mandate-offer-cli/v1') return cliFailure(result, 'installations_unavailable');
      return { ok: true, installations: result.result?.installations || [] };
    } catch (error) {
      logger.warn('[WISDOM] instalaciones no disponibles:', error.message);
      return errorResult(error, 'installations_unavailable');
    }
  });

  ipcMain.handle('core:wisdom-projects-read', async () => {
    try {
      const org = activeOrganization(nucleusConfigPath);
      const projects = [];
      for (const project of org.projects) {
        let evidence = null;
        try {
          const result = await execNucleus(['--json', 'authority', 'context-read', org.slug, project.project_id], 30000);
          evidence = result?.evidence?.schema === 'bloom.confirmed-context/v1' ? result.evidence : null;
        } catch (error) {
          logger.warn('[WISDOM] context-read no disponible:', error.message);
        }
        const binding = evidence?.projectBinding?.status || 'not_evaluable';
        const location = evidence?.localLocation?.status || 'not_evaluable';
        const continuity = evidence?.projectIdContinuity?.status || 'not_evaluable';
        const eligible = binding === 'bound' && location === 'present' && continuity === 'matched';
        const reason = eligible ? null
          : (evidence?.projectBinding?.reason || evidence?.localLocation?.reason || evidence?.projectIdContinuity?.reason || 'context_unavailable');
        projects.push({ projectId: project.project_id, name: project.project_name || project.project_id, eligible, binding, location, continuity, reason });
      }
      return { ok: true, orgSlug: org.slug, projects };
    } catch (error) {
      logger.warn('[WISDOM] proyectos no disponibles:', error.message);
      return errorResult(error, 'projects_unavailable');
    }
  });

  ipcMain.handle('core:wisdom-install', async (_event, selection) => {
    const { definitionId, version, digest, projectId } = selection || {};
    if (!UUID.test(definitionId || '') || !SEMVER.test(version || '') || !HEX64.test(digest || '') || !UUID.test(projectId || '')) {
      return { ok: false, error: { code: 'invalid_selection', message: 'invalid_selection' } };
    }
    try {
      const org = activeOrganization(nucleusConfigPath);
      if (!org.projects.some(p => p.project_id === projectId)) {
        return { ok: false, error: { code: 'project_not_in_active_organization', message: 'project_not_in_active_organization' } };
      }
      logger.info?.(`[WISDOM] instalación explícita definition=${definitionId} version=${version} digest=${digest} project=${projectId}`);
      const result = await execNucleus(['--json', 'mandate', 'offer', 'install',
        '--definition', definitionId, '--version', version, '--digest', digest, '--project', projectId], 120000);
      if (!result?.ok || result.schema !== 'bloom.mandate-offer-cli/v1') return cliFailure(result, 'install_failed');
      return { ok: true, install: result.result };
    } catch (error) {
      logger.warn('[WISDOM] instalación falló:', error.message);
      return errorResult(error, 'install_failed');
    }
  });
}

module.exports = { registerWisdomOfferHandlers };
