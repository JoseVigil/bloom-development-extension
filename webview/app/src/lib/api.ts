const baseUrl = 'http://localhost:48215/api/v1';

// ============================================================================
// ERROR HANDLING
// ============================================================================

class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function handleResponse(response: Response) {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new ApiError(
      error.error || error.message || 'Request failed',
      response.status,
      error
    );
  }
  return response.json();
}

// ============================================================================
// NUCLEUS API
// ============================================================================

export async function listNuclei(parentDir?: string) {
  const query = parentDir ? `?parent=${encodeURIComponent(parentDir)}` : '';
  const response = await fetch(`${baseUrl}/nucleus/list${query}`);
  return handleResponse(response);
}

export async function getNucleus(nucleusPath: string) {
  const response = await fetch(
    `${baseUrl}/nucleus/get?path=${encodeURIComponent(nucleusPath)}`
  );
  return handleResponse(response);
}

export async function createNucleus(params: {
  org: string;
  path?: string;
  url?: string;
  force?: boolean;
}) {
  const response = await fetch(`${baseUrl}/nucleus/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  return handleResponse(response);
}

export async function deleteNucleus(nucleusPath: string, force?: boolean) {
  const response = await fetch(`${baseUrl}/nucleus/delete`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: nucleusPath, force })
  });
  return handleResponse(response);
}

export async function syncNucleus(nucleusPath: string, skipGit?: boolean) {
  const response = await fetch(`${baseUrl}/nucleus/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: nucleusPath, skip_git: skipGit })
  });
  return handleResponse(response);
}

export async function listNucleusProjects(nucleusPath: string, strategy?: string) {
  const query = new URLSearchParams({ path: nucleusPath });
  if (strategy) query.set('strategy', strategy);
  
  const response = await fetch(`${baseUrl}/nucleus/projects?${query}`);
  return handleResponse(response);
}

// ============================================================================
// INTENT API
// ============================================================================

export async function listIntents(nucleusPath: string, type?: 'dev' | 'doc') {
  const query = new URLSearchParams({ nucleus: nucleusPath });
  if (type) query.set('type', type);
  
  const response = await fetch(`${baseUrl}/intent/list?${query}`);
  return handleResponse(response);
}

export async function getIntent(intentId: string, nucleusPath: string) {
  const query = new URLSearchParams({ id: intentId, nucleus: nucleusPath });
  const response = await fetch(`${baseUrl}/intent/get?${query}`);
  return handleResponse(response);
}

export async function createIntent(params: {
  type: 'dev' | 'doc';
  name: string;
  files: string[];
  nucleus: string;
}) {
  const response = await fetch(`${baseUrl}/intent/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  return handleResponse(response);
}

export async function lockIntent(intentId: string, nucleusPath: string) {
  const response = await fetch(`${baseUrl}/intent/lock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: intentId, nucleus: nucleusPath })
  });
  return handleResponse(response);
}

export async function unlockIntent(
  intentId: string,
  nucleusPath: string,
  force?: boolean
) {
  const response = await fetch(`${baseUrl}/intent/unlock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: intentId, nucleus: nucleusPath, force })
  });
  return handleResponse(response);
}

export async function addIntentTurn(params: {
  id: string;
  actor: 'user' | 'ai';
  content: string;
  nucleus: string;
}) {
  const response = await fetch(`${baseUrl}/intent/add-turn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  return handleResponse(response);
}

export async function finalizeIntent(intentId: string, nucleusPath: string) {
  const response = await fetch(`${baseUrl}/intent/finalize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: intentId, nucleus: nucleusPath })
  });
  return handleResponse(response);
}

export async function deleteIntent(
  intentId: string,
  nucleusPath: string,
  force?: boolean
) {
  const response = await fetch(`${baseUrl}/intent/delete`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: intentId, nucleus: nucleusPath, force })
  });
  return handleResponse(response);
}

// ============================================================================
// PROJECT API
// ============================================================================

export async function detectProjects(params: {
  parent_path: string;
  max_depth?: number;
  strategy?: string;
  min_confidence?: 'high' | 'medium' | 'low';
}) {
  const response = await fetch(`${baseUrl}/project/detect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  return handleResponse(response);
}

export async function addProject(params: {
  project_path: string;
  nucleus_path: string;
  name?: string;
  strategy?: string;
  description?: string;
  repo_url?: string;
}) {
  const response = await fetch(`${baseUrl}/project/add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  return handleResponse(response);
}

export async function cloneAndAddProject(params: {
  repo_url: string;
  nucleus_path: string;
  destination?: string;
  name?: string;
  strategy?: string;
}) {
  const response = await fetch(`${baseUrl}/project/clone-and-add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  return handleResponse(response);
}

// ============================================================================
// PROFILE API
// ============================================================================

export async function listProfiles() {
  const response = await fetch(`${baseUrl}/profile/list`);
  return handleResponse(response);
}

export async function createProfile(alias: string) {
  const response = await fetch(`${baseUrl}/profile/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ alias })
  });
  return handleResponse(response);
}

export async function validateProfile(profileId: string) {
  const response = await fetch(`${baseUrl}/profile/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: profileId })
  });
  return handleResponse(response);
}

export async function registerAccount(params: {
  profile_id: string;
  provider: string;
  email: string;
}) {
  const response = await fetch(`${baseUrl}/profile/account/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  return handleResponse(response);
}

export async function deleteProfile(profileId: string, force?: boolean) {
  const query = force ? '?force=true' : '';
  const response = await fetch(`${baseUrl}/profile/${profileId}${query}`, {
    method: 'DELETE'
  });
  return handleResponse(response);
}

// ============================================================================
// AUTH API
// ============================================================================

export async function getGithubAuthStatus() {
  const response = await fetch(`${baseUrl}/auth/github/status`);
  return handleResponse(response);
}

export async function loginGithub(token: string) {
  const response = await fetch(`${baseUrl}/auth/github/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token })
  });
  return handleResponse(response);
}

export async function listGithubOrgs() {
  const response = await fetch(`${baseUrl}/auth/github/orgs`);
  return handleResponse(response);
}

export async function listGithubRepos(org?: string) {
  const query = org ? `?org=${encodeURIComponent(org)}` : '';
  const response = await fetch(`${baseUrl}/auth/github/repos${query}`);
  return handleResponse(response);
}

export async function addGeminiKey(params: {
  profile: string;
  key: string;
  priority?: number;
}) {
  const response = await fetch(`${baseUrl}/auth/gemini/key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  return handleResponse(response);
}

export async function listGeminiKeys() {
  const response = await fetch(`${baseUrl}/auth/gemini/keys`);
  return handleResponse(response);
}

export async function validateGeminiKey(profile: string) {
  const response = await fetch(`${baseUrl}/auth/gemini/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile })
  });
  return handleResponse(response);
}

// ============================================================================
// SYSTEM API
// ============================================================================

export async function getSystemHealth() {
  const response = await fetch('http://localhost:48215/health');
  return response.json();
}

// Export error class for handling
export { ApiError };