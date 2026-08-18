'use strict';

/**
 * shared/onboarding-schema.js
 *
 * Esquema multi-organización / multi-proyecto para `onboarding.organizations[]`
 * dentro de nucleus.json. Reemplaza los campos planos workspace_path,
 * workspace_org, project_path, project_name y genesis_mandate_id — que hoy
 * viven sueltos en la raíz de `onboarding` y solo pueden representar UNA
 * organización con UN proyecto activo — por un array de organizaciones, cada
 * una con su propio array de proyectos anidado.
 *
 * Regla central: un proyecto no puede existir fuera de una organización.
 * `organizations[]` es el ÚNICO lugar donde vive `workspace_path` — nunca
 * más un campo suelto en la raíz de onboarding.
 *
 * Forma resultante:
 *   onboarding.organizations = [
 *     {
 *       org_slug: "elias-repos",
 *       workspace_path: "/home/jose/repos/elias-repos",
 *       created_at: "...",
 *       projects: [
 *         {
 *           project_id: "uuid",
 *           project_name: "sample_project",
 *           project_path: "/home/jose/repos/elias-repos/sample_project",
 *           genesis_mandate_id: "uuid-o-null",
 *           created_at: "...",
 *         },
 *       ],
 *     },
 *   ]
 *   onboarding.active_org_slug = "elias-repos"       // puntero, no duplicado
 *   onboarding.active_project_id = "uuid"             // puntero, no duplicado
 *
 * Campos que a propósito NO se mueven adentro de una org (quedan en la raíz
 * de onboarding, tal como están hoy): completed, started, started_at,
 * updated_at, completed_steps, github_app_token, vault_initialized,
 * google_account, ai_provider_key, completed_at, workspace_url, current_step,
 * github_username, github_org (los dos últimos son datos de identidad de
 * GitHub para UI de resume, no de la organización-workspace).
 *
 * Motivo: github_app_auth / vault_init / google_auth / ai_provider_setup son
 * conexiones de CUENTA del usuario — con multi-org siguen siendo una sola
 * conexión compartida por todas las organizaciones, no algo que tenga sentido
 * duplicar por org. Si el producto llegara a necesitar credenciales
 * distintas por organización, es una migración de esquema aparte y
 * deliberada — no un efecto colateral de este cambio. Marcado explícitamente
 * acá para que quede documentada la decisión, no perdida en un commit.
 */

const crypto = require('crypto');

/**
 * Migra in-place un objeto `onboarding` del esquema plano viejo al nuevo
 * esquema anidado. Idempotente — si ya no quedan campos planos, es un no-op
 * salvo por garantizar que `organizations` exista como array.
 *
 * IMPORTANTE: esta función NO escribe a disco. El caller decide cuándo
 * persistir (o, en el caso de resolution-engine.js, directamente no
 * persiste nunca — la migración ahí es solo para poder leer datos viejos).
 *
 * @param {object} onboarding  onboarding.* de nucleus.json ya parseado
 * @returns {object} el mismo objeto, mutado
 */
function migrateToNestedSchema(onboarding) {
  if (!onboarding) return onboarding;

  if (!Array.isArray(onboarding.organizations)) {
    onboarding.organizations = [];
  }

  const hadFlatWorkspace = !!onboarding.workspace_path;
  if (hadFlatWorkspace) {
    const orgSlug = onboarding.workspace_org || `workspace-${Date.now()}`;
    let org = onboarding.organizations.find(o => o.org_slug === orgSlug);
    if (!org) {
      org = {
        org_slug: orgSlug,
        workspace_path: onboarding.workspace_path,
        created_at: onboarding.started_at || new Date().toISOString(),
        projects: [],
      };
      onboarding.organizations.push(org);
    }

    if (onboarding.project_path || onboarding.project_name) {
      org.projects.push({
        project_id: crypto.randomUUID(),
        project_name: onboarding.project_name || null,
        project_path: onboarding.project_path || null,
        genesis_mandate_id: onboarding.genesis_mandate_id || null,
        created_at: onboarding.started_at || new Date().toISOString(),
      });
    }

    onboarding.active_org_slug = onboarding.active_org_slug || orgSlug;
    if (org.projects.length && !onboarding.active_project_id) {
      onboarding.active_project_id = org.projects[org.projects.length - 1].project_id;
    }

    // Los campos planos quedan supersedidos — se borran para que no quede
    // un estado ambiguo (dato duplicado en dos formas a la vez).
    delete onboarding.workspace_path;
    delete onboarding.workspace_org;
    delete onboarding.project_path;
    delete onboarding.project_name;
    delete onboarding.genesis_mandate_id;
  }

  return onboarding;
}

function getOrgBySlug(onboarding, orgSlug) {
  return (onboarding.organizations || []).find(o => o.org_slug === orgSlug) || null;
}

function getActiveOrg(onboarding) {
  if (!onboarding?.active_org_slug) return null;
  return getOrgBySlug(onboarding, onboarding.active_org_slug);
}

/**
 * Busca una org por slug; si no existe, la crea. Siempre deja
 * `active_org_slug` apuntando a esta org (mismo comportamiento que el
 * código viejo, que asumía "la última org tocada es la activa").
 */
function getOrCreateOrg(onboarding, orgSlug, { workspacePath } = {}) {
  migrateToNestedSchema(onboarding);
  let org = getOrgBySlug(onboarding, orgSlug);
  if (!org) {
    org = {
      org_slug: orgSlug,
      workspace_path: workspacePath || null,
      created_at: new Date().toISOString(),
      projects: [],
    };
    onboarding.organizations.push(org);
  } else if (workspacePath) {
    org.workspace_path = workspacePath;
  }
  onboarding.active_org_slug = orgSlug;
  return org;
}

/**
 * switchActiveOrg(onboarding, orgSlug)
 *
 * Etapa 5 (ORGANIZATION_SWITCH_IMPLEMENTATION_STATUS.md). A diferencia
 * de getOrCreateOrg(), NUNCA crea la organización si no existe — un switch
 * a una org inexistente tiene que fallar de forma explícita (§4.1 de
 * ORGANIZATION_SWITCH_PROTOCOL.md: "si no hay .nucleus-{org_slug} con
 * .ownership.json válido, el switch tiene que fallar... no en silencio"),
 * no crearla como sí hace el flujo de onboarding (donde "no existe todavía"
 * es el caso normal, no un error).
 *
 * G7 (docs/GOVERNANCE/SWITCH-ORG/ORGANIZATION_SWITCH_ARCHITECTURE.md): esta función sigue
 * siendo, a propósito, un primitivo "tonto" de persistencia — igual que
 * getOrCreateOrg(). NO consulta G2 acá adentro. El caller
 * (main_conductor.js#handleSwitchOrganization) es quien tiene que haber
 * consultado `nucleus governance can-switch-org` ANTES de llamar a esta
 * función, y bracketarla con `begin-drain`/`end-drain`. Meter esa guarda
 * acá adentro mezclaría la decisión ("¿se puede?") con la persistencia
 * ("escribir el puntero"), que es exactamente la separación que G7 pide
 * mantener.
 *
 * @throws {Error} si orgSlug no existe en onboarding.organizations — el
 *   caller debe capturarlo y comunicar el fallo explícito (no reintentar
 *   en silencio, no crear la org).
 */
function switchActiveOrg(onboarding, orgSlug) {
  migrateToNestedSchema(onboarding);
  const org = getOrgBySlug(onboarding, orgSlug);
  if (!org) {
    throw new Error(`switchActiveOrg: la organización "${orgSlug}" no existe localmente`);
  }
  onboarding.active_org_slug = orgSlug;
  return org;
}

function getActiveProject(onboarding) {
  const org = getActiveOrg(onboarding);
  if (!org || !onboarding.active_project_id) return null;
  return (org.projects || []).find(p => p.project_id === onboarding.active_project_id) || null;
}

/**
 * Busca un proyecto dentro de `org` por project_id (preferido) o por
 * project_name (fallback, para callers que todavía no tienen un id — ej.
 * select-project la primera vez que se elige un proyecto). Si no existe, lo
 * crea. Siempre deja `active_project_id` apuntando a este proyecto.
 */
function getOrCreateProject(onboarding, org, { projectId, projectName, projectPath } = {}) {
  if (!org) {
    throw new Error('getOrCreateProject: se necesita una organización — un proyecto no puede existir sin colgar de una org');
  }
  org.projects = org.projects || [];

  let project = null;
  if (projectId) {
    project = org.projects.find(p => p.project_id === projectId);
  }
  if (!project && projectName) {
    project = org.projects.find(p => p.project_name === projectName);
  }
  if (!project) {
    project = {
      project_id: projectId || crypto.randomUUID(),
      project_name: projectName || null,
      project_path: projectPath || null,
      genesis_mandate_id: null,
      created_at: new Date().toISOString(),
    };
    org.projects.push(project);
  } else {
    if (projectName) project.project_name = projectName;
    if (projectPath) project.project_path = projectPath;
  }

  onboarding.active_project_id = project.project_id;
  return project;
}

/**
 * Construye una vista PLANA de compatibilidad, solo en memoria, para que
 * el motor de resume (resolution-engine.js → step-verifiers.js) pueda
 * seguir leyendo `onboarding.workspace_path` / `onboarding.workspace_org` /
 * `onboarding.project_path` / `onboarding.project_name` /
 * `onboarding.genesis_mandate_id` exactamente como antes, sin saber nada de
 * `organizations[]`. Proyecta esos cinco campos desde la org/proyecto
 * ACTIVOS. Nunca se escribe a disco — es una copia descartable.
 *
 * Esto es lo que evita tener que tocar step-verifiers.js (fs_marker,
 * json_field, json_field_any) para nada: siguen viendo el mismo objeto
 * plano de siempre.
 */
function buildFlatOnboardingView(onboarding) {
  if (!onboarding) return onboarding;
  const flat = { ...onboarding };

  const org = getActiveOrg(onboarding);
  if (org) {
    flat.workspace_path = org.workspace_path || null;
    flat.workspace_org  = org.org_slug || null;
  }

  const project = getActiveProject(onboarding);
  if (project) {
    flat.project_path = project.project_path || null;
    flat.project_name = project.project_name || null;
    flat.genesis_mandate_id = project.genesis_mandate_id || null;
  }

  return flat;
}

module.exports = {
  migrateToNestedSchema,
  getOrgBySlug,
  getActiveOrg,
  getOrCreateOrg,
  switchActiveOrg,
  getActiveProject,
  getOrCreateProject,
  buildFlatOnboardingView,
};
