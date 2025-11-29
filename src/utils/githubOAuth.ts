// src/utils/githubOAuth.ts
import * as vscode from 'vscode';

const GITHUB_AUTH_PROVIDER_ID = 'github';
const SCOPES = ['repo', 'read:org', 'user:email'];

// Cache para el token (en memoria)
let cachedToken: string | null = null;

/**
 * Guarda el token en cache para uso posterior
 */
export function setGitHubToken(token: string): void {
    cachedToken = token;
}

/**
 * Obtiene el token guardado en cache (desde memoria)
 * Para obtener un token fresco desde VSCode, usar getGitHubTokenFromSession()
 */
export function getCachedGitHubToken(): string | null {
    return cachedToken;
}

/**
 * Obtiene la sesión de GitHub desde VSCode
 */
export async function getGitHubSession(): Promise<vscode.AuthenticationSession> {
    const session = await vscode.authentication.getSession(GITHUB_AUTH_PROVIDER_ID, SCOPES, {
        createIfNone: true
    });

    if (!session) {
        throw new Error('No se pudo autenticar con GitHub');
    }

    return session;
}

/**
 * Obtiene el token de acceso desde la sesión de VSCode y lo guarda en cache
 */
export async function getGitHubTokenFromSession(): Promise<string> {
    const session = await getGitHubSession();
    const token = session.accessToken;
    
    // Guardar en cache automáticamente
    setGitHubToken(token);
    
    return token;
}

/**
 * Obtiene headers para peticiones a la API de GitHub
 */
export async function getGitHubHeaders(): Promise<Record<string, string>> {
    const token = await getGitHubTokenFromSession();
    return {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'Bloom-VSCode-Extension'
    };
}

/**
 * Obtiene el usuario actual de GitHub
 * Ahora guarda el token automáticamente en cache
 */
export async function getCurrentGitHubUser(): Promise<{
    login: string;
    name?: string;
    email?: string | null;
}> {
    const headers = await getGitHubHeaders();
    const resp = await fetch('https://api.github.com/user', { headers });
    if (!resp.ok) throw new Error('Error obteniendo datos del usuario');
    const data = await resp.json() as any;

    if (!data.email) {
        const emailsResp = await fetch('https://api.github.com/user/emails', { headers });
        if (emailsResp.ok) {
            const emails = await emailsResp.json() as any[];
            const primary = emails.find((e: any) => e.primary && e.verified);
            if (primary) data.email = primary.email;
        }
    }

    return {
        login: data.login,
        name: data.name || data.login,
        email: data.email || null
    };
}

/**
 * Versión alternativa que retorna tanto el usuario como el token explícitamente
 */
export async function getCurrentGitHubUserWithToken(): Promise<{
    user: {
        login: string;
        name?: string;
        email?: string | null;
    };
    token: string;
}> {
    const session = await getGitHubSession();
    const token = session.accessToken;
    setGitHubToken(token);
    
    const headers = {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'Bloom-VSCode-Extension'
    };
    
    const resp = await fetch('https://api.github.com/user', { headers });
    if (!resp.ok) throw new Error('Error obteniendo datos del usuario');
    const data = await resp.json() as any;

    if (!data.email) {
        const emailsResp = await fetch('https://api.github.com/user/emails', { headers });
        if (emailsResp.ok) {
            const emails = await emailsResp.json() as any[];
            const primary = emails.find((e: any) => e.primary && e.verified);
            if (primary) data.email = primary.email;
        }
    }

    const user = {
        login: data.login,
        name: data.name || data.login,
        email: data.email || null
    };

    return { user, token };
}