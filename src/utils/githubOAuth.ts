// src/utils/githubOAuth.ts
import * as vscode from 'vscode';

const GITHUB_AUTH_PROVIDER_ID = 'github';
const SCOPES = ['repo', 'read:org', 'user:email'];

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

export async function getGitHubSession(): Promise<vscode.AuthenticationSession> {
    const session = await vscode.authentication.getSession(GITHUB_AUTH_PROVIDER_ID, SCOPES, {
        createIfNone: true
    });

    if (!session) {
        throw new Error('No se pudo autenticar con GitHub');
    }

    return session;
}

export async function getGitHubToken(): Promise<string> {
    const session = await getGitHubSession();
    return session.accessToken;
}

export async function getGitHubHeaders(): Promise<Record<string, string>> {
    const token = await getGitHubToken();
    return {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'Bloom-VSCode-Extension'
    };
}

