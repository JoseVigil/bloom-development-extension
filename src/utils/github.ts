// src/utils/github.ts
import * as vscode from 'vscode';

const GITHUB_API = 'https://api.github.com';

export interface GitHubOrg {
    login: string;
    avatar_url?: string;
    description?: string;
}

export async function getUserOrgs(githubUsername: string): Promise<GitHubOrg[]> {
    const token = await getGitHubToken();
    const username = githubUsername.replace('@', '').trim();
    if (!username) throw new Error('Usuario de GitHub requerido');

    const headers: Record<string, string> = {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Bloom-VSCode-Extension'
    };

    const userResp = await fetch(`${GITHUB_API}/users/${username}`, { headers });
    if (!userResp.ok) throw new Error(`Usuario @${username} no encontrado`);

    const orgsResp = await fetch(`${GITHUB_API}/users/${username}/orgs`, { headers });
    if (!orgsResp.ok) {
        const err = await orgsResp.text();
        throw new Error(`Error obteniendo organizaciones: ${err}`);
    }

    // ←←← TIPADO SEGURO
    const rawOrgs = await orgsResp.json();
    return rawOrgs as GitHubOrg[];
}

export async function createNucleusRepo(org?: string): Promise<string> {
    const token = await getGitHubToken();
    const repoName = `bloom-nucleus-${new Date().getFullYear()}`;

    const headers: Record<string, string> = {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json'
    };

    const body = {
        name: repoName,
        description: 'Nucleus Project - Bloom BTIP Premium',
        private: false,
        auto_init: true,
        gitignore_template: 'Node'
    };

    const url = org ? `${GITHUB_API}/orgs/${org}/repos` : `${GITHUB_API}/user/repos`;

    const resp = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
    });

    if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`No se pudo crear el repositorio: ${err}`);
    }

    // ←←← TIPADO SEGURO
    const data = await resp.json() as any;
    return data.html_url as string;
}

async function getGitHubToken(): Promise<string> {
    let token = vscode.workspace.getConfiguration('bloom').get<string>('githubToken');
    if (token) return token.trim();

    token = process.env.GITHUB_TOKEN;
    if (token) return token;

    throw new Error(
        'GitHub Token no configurado.\n' +
        '→ Settings → Bloom → GitHub Token'
    );
}