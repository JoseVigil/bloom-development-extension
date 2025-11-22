// src/utils/githubApi.ts
import { getGitHubHeaders } from './githubOAuth';

export interface GitHubOrg {
    login: string;
    description?: string;
}

export async function getUserOrgs(): Promise<GitHubOrg[]> {
    const headers = await getGitHubHeaders();
    const resp = await fetch('https://api.github.com/user/orgs', { headers });
    if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`Error obteniendo organizaciones: ${err}`);
    }
    return (await resp.json()) as GitHubOrg[];
}

export async function createNucleusRepo(orgLogin?: string): Promise<string> {
    const headers = await getGitHubHeaders();
    const repoName = `bloom-nucleus-${new Date().getFullYear()}`;

    const body = {
        name: repoName,
        description: 'Nucleus Project - Bloom BTIP Premium',
        private: false,
        auto_init: true,
        gitignore_template: 'Node'
    };

    const url = orgLogin
        ? `https://api.github.com/orgs/${orgLogin}/repos`
        : 'https://api.github.com/user/repos';

    const resp = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
    });

    if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`No se pudo crear el repositorio: ${err}`);
    }

    const data = await resp.json() as any;
    return data.html_url;
}