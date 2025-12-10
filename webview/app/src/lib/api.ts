let baseUrl = 'http://localhost:4123/api/v1';
const fallbackPorts = ['http://localhost:5888', 'http://localhost:48215'];

export function setBaseUrl(url: string) {
  baseUrl = url;
}

async function fetchWithFallback(endpoint: string, options: RequestInit = {}) {
  try {
    const response = await fetch(`${baseUrl}${endpoint}`, options);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response;
  } catch (error) {
    for (const fallback of fallbackPorts) {
      try {
        const response = await fetch(`${fallback}${endpoint}`, options);
        if (response.ok) return response;
      } catch {}
    }
    throw error;
  }
}

export interface BTIPNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: BTIPNode[];
}

export async function getTree(path: string = ''): Promise<BTIPNode[]> {
  const response = await fetchWithFallback(`/btip/explorer/tree?path=${encodeURIComponent(path)}`);
  return response.json();
}

export async function getFile(path: string): Promise<{ path: string; content: string; extension: string }> {
  const response = await fetchWithFallback(`/btip/explorer/file?path=${encodeURIComponent(path)}`);
  return response.json();
}

export async function getSystemStatus() {
  const response = await fetchWithFallback('/health');
  return response.json();
}

export async function getIntents() {
  const response = await fetchWithFallback('/intents/list');
  const data = await response.json();
  return data.intents || [];
}

export async function getIntent(id: string) {
  const response = await fetchWithFallback(`/intents/get?id=${encodeURIComponent(id)}`);
  return response.json();
}

export async function createIntentDoc(data: any) {
  const response = await fetchWithFallback('/intents/doc/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return response.json();
}

export async function estimateTokens(content: string) {
  const response = await fetchWithFallback('/doc/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content })
  });
  return response.json();
}

export async function runExecution(intentId: string, data: any) {
  const response = await fetchWithFallback(`/intents/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ intentId, ...data })
  });
  return response.json();
}

export async function getProfiles() {
  const response = await fetchWithFallback('/profiles');
  const data = await response.json();
  return data.profiles || [];
}

export async function refreshAccounts(profileId: string) {
  const response = await fetchWithFallback(`/profiles/${profileId}/refresh-accounts`, {
    method: 'POST'
  });
  return response.json();
}