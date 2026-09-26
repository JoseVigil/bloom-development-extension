'use strict';

const assert = require('assert');
const {
  getOrCreateOrg,
  validateActiveOrganizationIdentity,
} = require('../../shared/onboarding-schema');

const ORGANIZATION_ID = 'b539171c-e3d3-4231-bf32-a94e92330d12';

function onboarding(overrides = {}) {
  return {
    backend_identity_org_id: ORGANIZATION_ID,
    organizations: [],
    ...overrides,
  };
}

{
  const state = onboarding({
    organizations: [
      { org_slug: 'other', organization_id: 'org-other', workspace_path: 'C:\\other', projects: [] },
    ],
  });
  const target = getOrCreateOrg(state, 'eias-repos', {
    workspacePath: 'C:\\repos\\eias-repos',
    organizationId: ORGANIZATION_ID,
  });
  assert.strictEqual(target.organization_id, ORGANIZATION_ID);
  assert.strictEqual(state.organizations[0].organization_id, 'org-other');
  assert.strictEqual(state.active_org_slug, 'eias-repos');
  assert.strictEqual(validateActiveOrganizationIdentity(state), target);
}

{
  const state = onboarding({
    organizations: [
      { org_slug: 'other', organization_id: ORGANIZATION_ID, workspace_path: 'C:\\other', projects: [] },
    ],
  });
  assert.throws(
    () => getOrCreateOrg(state, 'eias-repos', {
      workspacePath: 'C:\\repos\\eias-repos',
      organizationId: ORGANIZATION_ID,
    }),
    /ya está vinculado/
  );
}

{
  const state = onboarding({
    active_org_slug: 'eias-repos',
    organizations: [
      { org_slug: 'eias-repos', organization_id: 'different-id', workspace_path: 'C:\\repos\\eias-repos', projects: [] },
    ],
  });
  assert.throws(
    () => getOrCreateOrg(state, 'eias-repos', { organizationId: ORGANIZATION_ID }),
    /otro organization_id/
  );
  assert.throws(() => validateActiveOrganizationIdentity(state), /organization_id_mismatch/);
}

{
  const state = onboarding({
    active_org_slug: 'eias-repos',
    organizations: [
      { org_slug: 'eias-repos', workspace_path: 'C:\\repos\\eias-repos', projects: [] },
    ],
  });
  assert.throws(() => validateActiveOrganizationIdentity(state), /organization_id_missing/);
}

console.log('organization identity link: OK');
