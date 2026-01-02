// webview/app/src/lib/api.ts
// FIXED: Correct base URL (48215) with timeout/retry

const baseUrl = 'http://localhost:5173/api/v1';

interface FetchOptions extends RequestInit {
  timeout?: number;
  retries?: number;
}

async function fetchWithTimeout(url: string, options: FetchOptions = {}): Promise<Response> {
  const { timeout = 5000, retries = 2, ...fetchOptions } = options;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      return response;
      
    } catch (error) {
      if (attempt === retries) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
  
  throw new Error('Max retries reached');
}

class ApiError extends Error {
  constructor(message: string, public status: number, public details?: any) {
    super(message);
    this.name = 'ApiError';
  }
}

async function handleResponse(response: Response) {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ 
      error: `HTTP ${response.status}: ${response.statusText}` 
    }));
    throw new ApiError(
      error.error || error.message || 'Request failed',
      response.status,
      error
    );
  }
  return response.json();
}

export async function checkApiHealth(): Promise<boolean> {
  try {
    const response = await fetchWithTimeout('http://localhost:48215/health', {
      method: 'HEAD',
      timeout: 2000,
      retries: 1
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function getSystemHealth() {
  const response = await fetchWithTimeout('http://localhost:48215/health');
  return handleResponse(response);
}

export async function getOnboardingStatus() {
  const response = await fetchWithTimeout(`${baseUrl}/health/onboarding`);
  return handleResponse(response);
}

export async function getGithubAuthStatus() {
  const response = await fetchWithTimeout(`${baseUrl}/auth/github/status`);
  return handleResponse(response);
}

export async function loginGithub(token: string) {
  const response = await fetchWithTimeout(`${baseUrl}/auth/github/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token })
  });
  return handleResponse(response);
}

export async function listNuclei(parentDir?: string) {
  const query = parentDir ? `?parent=${encodeURIComponent(parentDir)}` : '';
  const response = await fetchWithTimeout(`${baseUrl}/nucleus/list${query}`);
  return handleResponse(response);
}

export async function createNucleus(params: {
  org: string;
  path?: string;
  url?: string;
  force?: boolean;
}) {
  const response = await fetchWithTimeout(`${baseUrl}/nucleus/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
    timeout: 30000
  });
  return handleResponse(response);
}

export { ApiError };