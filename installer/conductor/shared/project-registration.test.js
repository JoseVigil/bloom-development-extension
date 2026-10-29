'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { registerSelectedProject, reconcileExistingProject } = require('./project-registration');

const PROJECT_ID = '19d4b147-15f0-4989-a258-08dd332b4a57';
const OTHER_ID = 'f24b601a-d2b8-4ded-95ae-f9ee0d3c8428';

function fixture({ selected = false, materialProjects = [] } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'project-registration-'));
  const workspace = path.join(root, 'workspace');
  const projectPath = path.join(workspace, 'sample_project');
  const nucleusRoot = path.join(workspace, '.bloom', '.nucleus-elias-repos');
  const catalogPath = path.join(nucleusRoot, '.core', '.nucleus-config.json');
  fs.mkdirSync(projectPath, { recursive: true });
  fs.mkdirSync(path.dirname(catalogPath), { recursive: true });
  const nucleusPath = path.join(root, 'nucleus.json');
  fs.writeFileSync(nucleusPath, JSON.stringify({ onboarding: {
    active_org_slug: 'elias-repos', backend_identity_org_id: 'org-id',
    ...(selected ? { active_project_id: PROJECT_ID, completed_steps: ['project_select'] } : {}),
    organizations: [{ org_slug: 'elias-repos', organization_id: 'org-id', workspace_path: workspace,
      projects: selected ? [{ project_id: PROJECT_ID, project_name: 'sample_project', project_path: projectPath }] : [] }],
  } }));
  fs.writeFileSync(catalogPath, JSON.stringify({ metadata: { preserved: true }, projects: materialProjects }));
  return { root, workspace, projectPath, nucleusPath, catalogPath };
}

test('alta conserva el mismo ID en ambos catálogos y la repetición no escribe de nuevo', t => {
  const prior = { id: OTHER_ID, name: 'unrelated', absolutePath: path.join(os.tmpdir(), 'other') };
  const f = fixture({ materialProjects: [prior] });
  t.after(() => fs.rmSync(f.root, { recursive: true, force: true }));
  const first = registerSelectedProject(f.nucleusPath, { projectName: 'sample_project', projectPath: f.projectPath });
  assert.match(first.projectId, /^[0-9a-f-]{36}$/);
  const nucleus = JSON.parse(fs.readFileSync(f.nucleusPath));
  const project = nucleus.onboarding.organizations[0].projects[0];
  const material = JSON.parse(fs.readFileSync(f.catalogPath));
  assert.equal(project.project_id, first.projectId);
  assert.equal(material.projects[1].id, first.projectId);
  assert.equal(material.projects[1].absolutePath, f.projectPath);
  assert.deepEqual(material.projects[0], prior);
  assert.deepEqual(material.metadata, { preserved: true });
  const beforeNucleus = fs.readFileSync(f.nucleusPath);
  const beforeMaterial = fs.readFileSync(f.catalogPath);
  assert.equal(registerSelectedProject(f.nucleusPath, { projectName: 'sample_project', projectPath: f.projectPath }).projectId, first.projectId);
  assert.deepEqual(fs.readFileSync(f.nucleusPath), beforeNucleus);
  assert.deepEqual(fs.readFileSync(f.catalogPath), beforeMaterial);
});

test('reanudación incorpora el ID canónico existente sin crear otro ni tocar otros proyectos', t => {
  const prior = { id: OTHER_ID, name: 'unrelated', absolutePath: path.join(os.tmpdir(), 'other') };
  const f = fixture({ selected: true, materialProjects: [prior] });
  t.after(() => fs.rmSync(f.root, { recursive: true, force: true }));
  const beforeNucleus = fs.readFileSync(f.nucleusPath);
  assert.deepEqual(reconcileExistingProject(f.nucleusPath, PROJECT_ID),
    { projectId: PROJECT_ID, projectPath: f.projectPath, changed: true });
  assert.equal(reconcileExistingProject(f.nucleusPath, PROJECT_ID).changed, false);
  assert.deepEqual(fs.readFileSync(f.nucleusPath), beforeNucleus);
  const material = JSON.parse(fs.readFileSync(f.catalogPath));
  assert.equal(material.projects.length, 2);
  assert.deepEqual(material.projects[0], prior);
  assert.equal(material.projects[1].id, PROJECT_ID);
});

test('conflictos de ID o ruta se rechazan sin modificar ningún catálogo', t => {
  for (const collision of [
    f => ({ id: PROJECT_ID, absolutePath: path.join(f.workspace, 'other') }),
    f => ({ id: OTHER_ID, absolutePath: f.projectPath }),
  ]) {
    const f = fixture({ selected: true });
    t.after(() => fs.rmSync(f.root, { recursive: true, force: true }));
    fs.writeFileSync(f.catalogPath, JSON.stringify({ projects: [collision(f)] }));
    const beforeNucleus = fs.readFileSync(f.nucleusPath);
    const beforeMaterial = fs.readFileSync(f.catalogPath);
    assert.throws(() => reconcileExistingProject(f.nucleusPath, PROJECT_ID), /material_project_catalog_conflict/);
    assert.throws(() => registerSelectedProject(f.nucleusPath, { projectName: 'sample_project', projectPath: f.projectPath }), /material_project_catalog_conflict/);
    assert.deepEqual(fs.readFileSync(f.nucleusPath), beforeNucleus);
    assert.deepEqual(fs.readFileSync(f.catalogPath), beforeMaterial);
  }
});

test('la selección rechaza colisiones del catálogo de Conductor sin reidentificar el proyecto', t => {
  const f = fixture({ selected: true });
  t.after(() => fs.rmSync(f.root, { recursive: true, force: true }));
  const original = JSON.parse(fs.readFileSync(f.nucleusPath));
  const entries = original.onboarding.organizations[0].projects;
  entries.push({ project_id: OTHER_ID, project_name: 'other', project_path: f.projectPath });
  fs.writeFileSync(f.nucleusPath, JSON.stringify(original));
  const beforeNucleus = fs.readFileSync(f.nucleusPath);
  const beforeMaterial = fs.readFileSync(f.catalogPath);
  assert.throws(() => registerSelectedProject(f.nucleusPath,
    { projectName: 'sample_project', projectPath: f.projectPath }), /project_path_id_conflict/);
  assert.deepEqual(fs.readFileSync(f.nucleusPath), beforeNucleus);
  assert.deepEqual(fs.readFileSync(f.catalogPath), beforeMaterial);
});
