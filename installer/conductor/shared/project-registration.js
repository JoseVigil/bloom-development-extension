'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
  getOrCreateProject,
  migrateToNestedSchema,
  validateActiveOrganizationIdentity,
} = require('./onboarding-schema');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function canonicalPath(value) {
  const resolved = path.resolve(value);
  const real = fs.existsSync(resolved) ? fs.realpathSync.native(resolved) : resolved;
  return process.platform === 'win32' ? real.toLowerCase() : real;
}

function samePath(left, right) {
  return canonicalPath(left) === canonicalPath(right);
}

function writeAtomic(file, data) {
  const temporary = `${file}.tmp-${process.pid}-${crypto.randomUUID()}`;
  let descriptor;
  try {
    descriptor = fs.openSync(temporary, 'wx', 0o600);
    fs.writeFileSync(descriptor, JSON.stringify(data, null, 2));
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temporary, file);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

function readSelection(nucleusJsonPath) {
  const data = JSON.parse(fs.readFileSync(nucleusJsonPath, 'utf8'));
  data.onboarding = data.onboarding || {};
  migrateToNestedSchema(data.onboarding);
  const org = validateActiveOrganizationIdentity(data.onboarding);
  const matches = data.onboarding.organizations.filter(item => item.org_slug === org.org_slug);
  if (matches.length !== 1 || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(org.org_slug) ||
      !path.isAbsolute(org.workspace_path)) {
    throw new Error('project_registration_organization_ambiguous');
  }
  if (!Array.isArray(org.projects)) org.projects = [];
  const ids = new Set();
  const paths = new Set();
  for (const project of org.projects) {
    if (!UUID.test(project.project_id) || ids.has(project.project_id)) throw new Error('project_id_catalog_conflict');
    ids.add(project.project_id);
    if (project.project_path) {
      if (!path.isAbsolute(project.project_path)) throw new Error('project_path_must_be_absolute');
      const location = canonicalPath(project.project_path);
      if (paths.has(location)) throw new Error('project_path_id_conflict');
      paths.add(location);
    }
  }
  return { data, org };
}

function materialPlan(org, project) {
  if (!project.project_path) return null; // Remote selection has no local material location yet.
  if (!UUID.test(project.project_id) || !path.isAbsolute(project.project_path)) {
    throw new Error('project_registration_identity_invalid');
  }
  const directory = fs.statSync(project.project_path);
  if (!directory.isDirectory()) throw new Error('project_registration_path_not_directory');
  const root = path.join(org.workspace_path, '.bloom', `.nucleus-${org.org_slug}`);
  const catalogPath = path.join(root, '.core', '.nucleus-config.json');
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  if (!Array.isArray(catalog.projects)) throw new Error('material_project_catalog_invalid');
  let exact = 0;
  for (const entry of catalog.projects) {
    const entryPath = entry.absolutePath || (entry.localPath && path.resolve(root, entry.localPath));
    const sameId = entry.id === project.project_id;
    const sameLocation = entryPath && path.isAbsolute(entryPath) && samePath(entryPath, project.project_path);
    if (sameId && sameLocation) exact++;
    else if (sameId || sameLocation) throw new Error('material_project_catalog_conflict');
  }
  if (exact > 1) throw new Error('material_project_entry_duplicate');
  if (exact === 1) return { catalogPath, catalog, changed: false };
  const now = new Date().toISOString();
  catalog.projects.push({
    id: project.project_id,
    name: project.project_name,
    strategy: 'generic',
    localPath: path.relative(root, project.project_path),
    absolutePath: path.resolve(project.project_path),
    status: 'active',
    discoveredAt: now,
    lastScannedAt: now,
    metadata: { hasBloomConfig: false, isGitRepo: false, estimatedSize: 0 },
  });
  return { catalogPath, catalog, changed: true };
}

function registerSelectedProject(nucleusJsonPath, { projectName, projectPath }) {
  if (typeof projectName !== 'string' || !projectName.trim()) throw new Error('project_name_required');
  if (projectPath && !path.isAbsolute(projectPath)) throw new Error('project_path_must_be_absolute');
  const { data, org } = readSelection(nucleusJsonPath);
  const named = org.projects.filter(item => item.project_name === projectName);
  if (named.length > 1) throw new Error('project_name_ambiguous');
  const prior = named[0];
  const priorPath = prior?.project_path || null;
  if (prior && (!UUID.test(prior.project_id) ||
      (prior.project_path && projectPath && !samePath(prior.project_path, projectPath)))) {
    throw new Error('project_id_or_path_conflict');
  }
  if (projectPath && org.projects.some(item => item !== prior && item.project_path && samePath(item.project_path, projectPath))) {
    throw new Error('project_path_id_conflict');
  }
  const previousActive = data.onboarding.active_project_id;
  const project = getOrCreateProject(data.onboarding, org, { projectName, projectPath: projectPath || null });
  const plan = materialPlan(org, project); // Validate both catalogs before either write.
  const steps = data.onboarding.completed_steps || [];
  const stepMissing = !steps.includes('project_select');
  if (stepMissing) steps.push('project_select');
  data.onboarding.completed_steps = steps;
  const changed = !prior || previousActive !== project.project_id || stepMissing || (!priorPath && !!projectPath);
  if (changed) {
    data.onboarding.updated_at = new Date().toISOString();
    writeAtomic(nucleusJsonPath, data);
  }
  // If this write fails, nucleus.json retains the same canonical ID and a
  // repeated selection can safely finish the material write.
  if (plan?.changed) writeAtomic(plan.catalogPath, plan.catalog);
  return { projectId: project.project_id, projectName: project.project_name,
    projectPath: project.project_path, materialCatalogPath: plan?.catalogPath || null };
}

function reconcileExistingProject(nucleusJsonPath, projectId) {
  const { data, org } = readSelection(nucleusJsonPath);
  if (!UUID.test(projectId) || data.onboarding.active_project_id !== projectId) {
    throw new Error('selected_project_id_mismatch');
  }
  const matches = org.projects.filter(item => item.project_id === projectId);
  if (matches.length !== 1 || !matches[0].project_path) throw new Error('selected_project_ambiguous');
  const plan = materialPlan(org, matches[0]);
  if (plan.changed) writeAtomic(plan.catalogPath, plan.catalog);
  return { projectId, projectPath: matches[0].project_path, changed: plan.changed };
}

module.exports = { registerSelectedProject, reconcileExistingProject };
