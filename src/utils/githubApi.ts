// src/utils/githubApi.ts
import { getGitHubHeaders } from './githubOAuth';

// ============================================================================
// INTERFACES
// ============================================================================

export interface GitHubOrg {
    login: string;
    id: number;
    avatar_url: string;
    description?: string | null;
}

export interface GitHubRepo {
    id: number;
    name: string;
    full_name: string;
    description: string | null;
    clone_url: string;
    html_url: string;
    stargazers_count: number;
    updated_at: string;
    language: string | null;
    private: boolean;
}

// ============================================================================
// FUNCIONES EXISTENTES (de tu código original)
// ============================================================================

/**
 * Obtiene las organizaciones del usuario actual
 */
export async function getUserOrgs(): Promise<GitHubOrg[]> {
    const headers = await getGitHubHeaders();
    const resp = await fetch('https://api.github.com/user/orgs', { headers });
    
    if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`Error obteniendo organizaciones: ${err}`);
    }
    
    return (await resp.json()) as GitHubOrg[];
}

/**
 * Crea un repositorio Nucleus en GitHub
 * (Función original de tu código)
 */
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

// ============================================================================
// NUEVAS FUNCIONES (para manageProject.ts)
// ============================================================================

/**
 * Obtiene los repositorios de una organización O usuario personal
 * Detecta automáticamente si es org o user
 */
export async function getOrgRepos(orgOrUser: string): Promise<GitHubRepo[]> {
    const headers = await getGitHubHeaders();
    
    // Primero intentar como organización
    let resp = await fetch(
        `https://api.github.com/orgs/${orgOrUser}/repos?per_page=100&sort=updated`,
        { headers }
    );
    
    // Si falla (404), intentar como usuario personal
    if (!resp.ok && resp.status === 404) {
        // Verificar si es el usuario actual
        const userResp = await fetch('https://api.github.com/user', { headers });
        if (userResp.ok) {
            const currentUser = await userResp.json() as any;
            
            // Si el nombre coincide con el usuario actual, obtener sus repos
            if (currentUser.login.toLowerCase() === orgOrUser.toLowerCase()) {
                resp = await fetch(
                    'https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner',
                    { headers }
                );
            }
        }
    }
    
    if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`Error obteniendo repositorios de ${orgOrUser}: ${err}`);
    }
    
    return (await resp.json()) as GitHubRepo[];
}

/**
 * Obtiene los repositorios del usuario personal (no organizaciones)
 */
export async function getUserRepos(): Promise<GitHubRepo[]> {
    const headers = await getGitHubHeaders();
    
    const resp = await fetch(
        'https://api.github.com/user/repos?per_page=100&sort=updated',
        { headers }
    );
    
    if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`Error obteniendo repositorios personales: ${err}`);
    }
    
    return (await resp.json()) as GitHubRepo[];
}

/**
 * Obtiene un repositorio específico
 */
export async function getRepo(owner: string, repo: string): Promise<GitHubRepo> {
    const headers = await getGitHubHeaders();
    
    const resp = await fetch(
        `https://api.github.com/repos/${owner}/${repo}`,
        { headers }
    );
    
    if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`Error obteniendo repositorio ${owner}/${repo}: ${err}`);
    }
    
    return (await resp.json()) as GitHubRepo;
}

/**
 * Crea un nuevo repositorio en una organización
 */
export async function createOrgRepo(
    org: string,
    name: string,
    description?: string,
    isPrivate: boolean = false
): Promise<GitHubRepo> {
    const headers = await getGitHubHeaders();
    
    const resp = await fetch(
        `https://api.github.com/orgs/${org}/repos`,
        {
            method: 'POST',
            headers,
            body: JSON.stringify({
                name,
                description,
                private: isPrivate,
                auto_init: true
            })
        }
    );
    
    if (!resp.ok) {
        const err = await resp.text();
        let errorMessage = `Error creando repositorio ${name} en ${org}`;
        
        try {
            const errorData = JSON.parse(err);
            if (errorData.message) {
                errorMessage = errorData.message;
            }
        } catch {
            errorMessage += `: ${err}`;
        }
        
        throw new Error(errorMessage);
    }
    
    return (await resp.json()) as GitHubRepo;
}

/**
 * Verifica si un repositorio existe
 */
export async function repoExists(owner: string, repo: string): Promise<boolean> {
    try {
        await getRepo(owner, repo);
        return true;
    } catch {
        return false;
    }
}