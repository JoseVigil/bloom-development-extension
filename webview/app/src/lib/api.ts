const BASE_URL = 'http://localhost:5888/btip';

export async function getSystemStatus() {
  const response = await fetch(`${BASE_URL}/system/status`);
  return response.json();
}

export async function saveGeminiToken(token: string) {
  const response = await fetch(`${BASE_URL}/system/set-gemini-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token })
  });
  return response.json();
}

export async function getNucleusList() {
  const response = await fetch(`${BASE_URL}/nucleus/list`);
  return response.json();
}

export async function createNucleus(name: string) {
  const response = await fetch(`${BASE_URL}/nucleus/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
  return response.json();
}

export async function getProjects(nucleusId: string) {
  const response = await fetch(`${BASE_URL}/projects/list?nucleusId=${nucleusId}`);
  return response.json();
}

export async function createProject(nucleusId: string, name: string) {
  const response = await fetch(`${BASE_URL}/projects/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nucleusId, name })
  });
  return response.json();
}

export async function isGithubAuthenticated() {
  const response = await fetch(`${BASE_URL}/auth/github/status`);
  return response.json();
}

export interface BTIPNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: BTIPNode[];
}
export interface BTIPFile {
  path: string;
  content: string;
  extension: string;
}
let baseUrl = 'http://localhost:48215';
export function setBaseUrl(url: string): void {
  baseUrl = url;
}
export async function getTree(path: string = ''): Promise<BTIPNode[]> {
  const url = `${baseUrl}/btip/explorer/tree${path ? `?path=${encodeURIComponent(path)}` : ''}`;
  const response = await fetch(url);
 
  if (!response.ok) {
    throw new Error(`Failed to fetch tree: ${response.statusText}`);
  }
 
  return response.json();
}
export async function getFile(path: string): Promise<BTIPFile> {
  const url = `${baseUrl}/btip/explorer/file?path=${encodeURIComponent(path)}`;
  const response = await fetch(url);
 
  if (!response.ok) {
    throw new Error(`Failed to fetch file: ${response.statusText}`);
  }
 
  return response.json();
}
export async function refresh(): Promise<void> {
  const url = `${baseUrl}/btip/explorer/refresh`;
  const response = await fetch(url, { method: 'POST' });
 
  if (!response.ok) {
    throw new Error(`Failed to refresh: ${response.statusText}`);
  }
}