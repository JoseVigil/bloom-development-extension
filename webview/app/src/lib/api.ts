// webview/app/src/lib/api.ts
// UPDATED VERSION with all required exports for enhanced onboarding components

const API_BASE_URL = 'http://localhost:48215/api/v1';
const WS_BASE_URL = 'ws://localhost:4124';

console.log('🔡 [API] Configuration:', {
  API_BASE_URL,
  WS_BASE_URL,
  environment: import.meta.env.MODE
});

// ============================================================================
// ERROR CLASSES
// ============================================================================

export class ApiError extends Error {
  constructor(
    public message: string,
    public status: number,
    public details?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class NetworkError extends Error {
  constructor(message: string, public originalError?: Error) {
    super(message);
    this.name = 'NetworkError';
  }
}

// ============================================================================
// RESPONSE HANDLER
// ============================================================================

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let errorDetails;
    try {
      errorDetails = await response.json();
    } catch {
      errorDetails = { error: response.statusText };
    }

    const message = errorDetails.detail || errorDetails.error || `HTTP ${response.status}`;
    throw new ApiError(message, response.status, errorDetails);
  }

  if (response.status === 204) {
    return {} as T;
  }

  try {
    return await response.json();
  } catch {
    throw new ApiError('Invalid JSON response', response.status);
  }
}

// ============================================================================
// FETCH WITH TIMEOUT
// ============================================================================

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeout: number = 10000
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error instanceof Error && error.name === 'AbortError') {
      throw new NetworkError(`Request timeout after ${timeout}ms`);
    }
    
    throw new NetworkError(
      'Network request failed - Backend may be offline',
      error instanceof Error ? error : undefined
    );
  }
}

// ============================================================================
// HEALTH CHECKS
// ============================================================================

export async function checkApiHealth(): Promise<boolean> {
  try {
    console.log('🔍 [API] Checking backend health...');
    const response = await fetchWithTimeout(`${API_BASE_URL}/health`, { method: 'HEAD' }, 3000);
    
    if (response.ok) {
      console.log('✅ [API] Backend is healthy');
      return true;
    }
    
    console.warn('⚠️ [API] Backend returned non-OK status:', response.status);
    return false;
  } catch (error) {
    console.warn('❌ [API] Backend is offline:', error instanceof Error ? error.message : 'Unknown error');
    return false;
  }
}

export async function checkWebSocketHealth(): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      console.log('🔍 [WS] Checking WebSocket health...');
      const ws = new WebSocket(WS_BASE_URL);

      ws.onopen = () => {
        console.log('✅ [WS] WebSocket is healthy');
        ws.close();
        resolve(true);
      };

      ws.onerror = () => {
        console.warn('❌ [WS] WebSocket is offline');
        resolve(false);
      };

      setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          ws.close();
          resolve(false);
        }
      }, 3000);
    } catch (error) {
      console.warn('❌ [WS] WebSocket check failed:', error);
      resolve(false);
    }
  });
}

// ============================================================================
// SYSTEM HEALTH API
// ============================================================================

export interface SystemHealth {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  services: {
    api?: { status: string; latency?: number };
    websocket?: { status: string; connected?: boolean };
    brain?: { status: string; version?: string };
  };
}

export async function getSystemHealth(): Promise<SystemHealth> {
  console.log('🔡 [API] Fetching system health...');
  
  try {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/health`,
      { method: 'GET' },
      5000
    );
    
    const data = await handleResponse<SystemHealth>(response);
    console.log('✅ [API] System health received:', data);
    return data;
  } catch (error) {
    console.error('❌ [API] Failed to get system health:', error);
    
    return {
      status: 'error',
      timestamp: new Date().toISOString(),
      services: {
        api: { status: 'offline' },
        websocket: { status: 'offline' },
        brain: { status: 'unknown' }
      }
    };
  }
}

// ============================================================================
// ONBOARDING API
// ============================================================================

export interface OnboardingStatus {
  completed: boolean;
  current_step: string;
  details?: {
    github?: { authenticated: boolean };
    gemini?: { configured: boolean };
    nucleus?: { exists: boolean };
    projects?: { linked: boolean };
  };
}

export async function getOnboardingStatus(): Promise<OnboardingStatus> {
  console.log('🔡 [API] Fetching onboarding status...');
  
  const response = await fetchWithTimeout(
    `${API_BASE_URL}/health/onboarding`,
    { method: 'GET' },
    5000
  );
  
  const data = await handleResponse<OnboardingStatus>(response);
  console.log('✅ [API] Onboarding status received:', data);
  return data;
}

export async function getOnboardingStatusSafe(): Promise<OnboardingStatus> {
  try {
    return await getOnboardingStatus();
  } catch (error) {
    console.error('❌ [API] Failed to get onboarding status:', error);
    
    return {
      completed: false,
      current_step: 'welcome',
      details: {
        github: { authenticated: false },
        gemini: { configured: false },
        nucleus: { exists: false },
        projects: { linked: false },
      }
    };
  }
}

// ============================================================================
// GENERIC API METHODS
// ============================================================================

export async function apiGet<T>(endpoint: string): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  console.log('🔡 [API] GET:', url);
  
  const response = await fetchWithTimeout(url, { method: 'GET' });
  return handleResponse<T>(response);
}

export async function apiPost<T>(endpoint: string, data?: any): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  console.log('🔡 [API] POST:', url);
  
  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: data ? JSON.stringify(data) : undefined,
  });
  
  return handleResponse<T>(response);
}

export async function apiPut<T>(endpoint: string, data?: any): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  console.log('🔡 [API] PUT:', url);
  
  const response = await fetchWithTimeout(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: data ? JSON.stringify(data) : undefined,
  });
  
  return handleResponse<T>(response);
}

export async function apiDelete<T>(endpoint: string): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  console.log('🔡 [API] DELETE:', url);
  
  const response = await fetchWithTimeout(url, { method: 'DELETE' });
  return handleResponse<T>(response);
}

// ============================================================================
// WEBSOCKET HELPER
// ============================================================================

export function createWebSocket(path: string = ''): WebSocket {
  const url = `${WS_BASE_URL}${path}`;
  console.log('🔌 [WS] Creating WebSocket:', url);
  return new WebSocket(url);
}

// ============================================================================
// ADDITIONAL SYSTEM METHODS
// ============================================================================

export async function isApiAvailable(): Promise<boolean> {
  return checkApiHealth();
}

export async function getApiVersion(): Promise<{ version: string; build?: string }> {
  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}/version`, { method: 'GET' }, 3000);
    return handleResponse(response);
  } catch (error) {
    console.warn('❌ [API] Failed to get version:', error);
    return { version: 'unknown' };
  }
}

export async function pingApi(): Promise<number> {
  const start = performance.now();
  try {
    await fetchWithTimeout(`${API_BASE_URL}/health`, { method: 'HEAD' }, 3000);
    return Math.round(performance.now() - start);
  } catch {
    return -1;
  }
}

// ============================================================================
// GEMINI API (REQUIRED FOR ENHANCED COMPONENTS)
// ============================================================================

export async function addGeminiKey(params: {
  profile: string;
  key: string;
  priority?: number;
}): Promise<any> {
  console.log('🔡 [API] Adding Gemini key for profile:', params.profile);
  return apiPost('/auth/gemini/add-key', params);
}

export async function listGeminiKeys(): Promise<any> {
  console.log('🔡 [API] Listing Gemini keys');
  return apiGet('/auth/gemini/keys');
}

export async function validateGeminiKey(profile: string): Promise<any> {
  console.log('🔡 [API] Validating Gemini key for profile:', profile);
  return apiPost('/auth/gemini/validate', { profile });
}

// ============================================================================
// NUCLEUS API (REQUIRED FOR ENHANCED COMPONENTS)
// ============================================================================

export async function listNuclei(parentDir?: string): Promise<any> {
  const params = parentDir ? `?parent=${encodeURIComponent(parentDir)}` : '';
  console.log('🔡 [API] Listing nuclei:', parentDir || 'default');
  return apiGet(`/nucleus/list${params}`);
}

export async function createNucleus(params: {
  org: string;
  path?: string;
  url?: string;
  force?: boolean;
}): Promise<any> {
  console.log('🔡 [API] Creating nucleus:', params.org);
  return apiPost('/nucleus/create', params);
}

export async function listNucleusProjects(nucleusPath: string, strategy?: string): Promise<any> {
  const params = strategy 
    ? `?path=${encodeURIComponent(nucleusPath)}&strategy=${strategy}` 
    : `?path=${encodeURIComponent(nucleusPath)}`;
  console.log('🔡 [API] Listing nucleus projects:', nucleusPath);
  return apiGet(`/nucleus/projects${params}`);
}

// ============================================================================
// PROJECT API (REQUIRED FOR ENHANCED COMPONENTS)
// ============================================================================

export async function addProject(params: {
  project_path: string;
  nucleus_path: string;
  name?: string;
  strategy?: string;
}): Promise<any> {
  console.log('🔡 [API] Adding project:', params.project_path);
  return apiPost('/project/add', params);
}

// ============================================================================
// GITHUB API (ADDITIONAL HELPER)
// ============================================================================

export async function githubLogin(token: string): Promise<any> {
  console.log('🔡 [API] GitHub login attempt');
  return apiPost('/auth/github/login', { token });
}

export async function githubStatus(): Promise<any> {
  console.log('🔡 [API] Fetching GitHub status');
  return apiGet('/auth/github/status');
}

// ============================================================================
// INTENT API
// ============================================================================

export async function listIntents(nucleusPath?: string): Promise<any> {
  const params = nucleusPath ? `?nucleus=${encodeURIComponent(nucleusPath)}` : '';
  return apiGet(`/intents${params}`);
}

export async function getIntent(id: string, nucleusPath?: string): Promise<any> {
  const params = nucleusPath ? `?nucleus=${encodeURIComponent(nucleusPath)}` : '';
  return apiGet(`/intents/${id}${params}`);
}

export async function createIntent(data: any): Promise<any> {
  return apiPost('/intents', data);
}

export async function finalizeIntent(id: string, nucleusPath?: string): Promise<any> {
  const params = nucleusPath ? `?nucleus=${encodeURIComponent(nucleusPath)}` : '';
  return apiPost(`/intents/${id}/finalize${params}`);
}

// ============================================================================
// BTIP TYPES
// ============================================================================

export interface BTIPNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: BTIPNode[];
}

// ============================================================================
// EXPORTS
// ============================================================================

export { API_BASE_URL, WS_BASE_URL };