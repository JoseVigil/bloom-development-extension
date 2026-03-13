// src/managers/HeadlessUserManager.ts
//
// Versión headless de UserManager para el Control Plane standalone.
// No depende de VSCode API — usa fs/path para persistir estado en disco.
// Compatible con la interface que espera server-bootstrap.js y server.ts.

import * as fs from 'fs';
import * as path from 'path';

// ============================================================
// Types — espejados de userManager.ts para compatibilidad
// ============================================================

export interface BloomUser {
  githubUsername: string;
  githubOrg: string;
  allOrgs: string[];
  registeredAt: number;
}

export interface HeadlessUserManagerConfig {
  /** Directorio donde se persiste el estado del usuario (e.g. LOCALAPPDATA/BloomNucleus/users) */
  storageDir: string;
}

// ============================================================
// HeadlessUserManager
// ============================================================

/**
 * UserManager headless para el Control Plane (server-bootstrap.js).
 *
 * Reemplaza a UserManager cuando NO hay contexto de VSCode.
 * Persiste datos en JSON plano dentro de storageDir.
 *
 * Compatibilidad con server.ts: expone los mismos métodos que
 * UserManager usa internamente (getUser, saveUser, isRegistered,
 * getGithubToken, setGithubToken, getGithubUsername, getGithubOrgs,
 * isGithubAuthenticated).
 */
export class HeadlessUserManager {
  private readonly storageDir: string;
  private readonly userFilePath: string;
  private readonly secretsFilePath: string;

  constructor(config: HeadlessUserManagerConfig) {
    this.storageDir = config.storageDir;
    this.userFilePath = path.join(this.storageDir, 'user.json');
    this.secretsFilePath = path.join(this.storageDir, 'secrets.json');
    this.ensureStorageDir();
  }

  // ============================================================
  // Core — getUser / saveUser / isRegistered / clear
  // ============================================================

  getUser(): BloomUser | null {
    try {
      if (!fs.existsSync(this.userFilePath)) return null;
      const raw = fs.readFileSync(this.userFilePath, 'utf8');
      const data = JSON.parse(raw);
      return data?.['bloom.user.v3'] ?? null;
    } catch {
      return null;
    }
  }

  async saveUser(data: {
    githubUsername: string;
    githubOrg?: string;
    allOrgs?: string[];
  }): Promise<void> {
    const clean = data.githubUsername.trim().replace('@', '');
    const finalUser: BloomUser = {
      githubUsername: clean,
      githubOrg: data.githubOrg?.trim() || clean,
      allOrgs: data.allOrgs || [clean],
      registeredAt: Date.now(),
    };

    const existing = this.readUserFile();
    existing['bloom.user.v3'] = finalUser;
    this.writeUserFile(existing);
  }

  isRegistered(): boolean {
    const user = this.getUser();
    return !!user?.githubUsername && !!user?.allOrgs?.length;
  }

  async clear(): Promise<void> {
    const existing = this.readUserFile();
    delete existing['bloom.user.v3'];
    this.writeUserFile(existing);
    this.writeSecretsFile({});
  }

  // ============================================================
  // GitHub OAuth
  // ============================================================

  async setGithubToken(token: string): Promise<void> {
    const secrets = this.readSecretsFile();
    secrets['bloom.github.token'] = token;
    this.writeSecretsFile(secrets);
  }

  async getGithubToken(): Promise<string | undefined> {
    const secrets = this.readSecretsFile();
    return secrets['bloom.github.token'] ?? undefined;
  }

  async setGithubUser(username: string, orgs: string[]): Promise<void> {
    await this.saveUser({
      githubUsername: username,
      githubOrg: orgs[0] || username,
      allOrgs: orgs,
    });
  }

  async getGithubUsername(): Promise<string | undefined> {
    return this.getUser()?.githubUsername;
  }

  async getGithubOrgs(): Promise<string[]> {
    return this.getUser()?.allOrgs || [];
  }

  async isGithubAuthenticated(): Promise<boolean> {
    const token = await this.getGithubToken();
    const user = this.getUser();
    return !!token && !!user?.githubUsername;
  }

  // ============================================================
  // Gemini API Key
  // ============================================================

  async setGeminiApiKey(apiKey: string): Promise<void> {
    const secrets = this.readSecretsFile();
    secrets['bloom.gemini.apiKey'] = apiKey;
    this.writeSecretsFile(secrets);
  }

  async getGeminiApiKey(): Promise<string | undefined> {
    const secrets = this.readSecretsFile();
    return secrets['bloom.gemini.apiKey'] ?? undefined;
  }

  async isGeminiConfigured(): Promise<boolean> {
    const key = await this.getGeminiApiKey();
    return !!key;
  }

  // ============================================================
  // Compat estático (usado por algunos routes que llaman UserManager.getUserData())
  // ============================================================

  static async getUserData(): Promise<BloomUser | null> {
    // En modo headless no hay singleton global — devolvemos null.
    // Los routes que usan esto deberían recibirlo via deps injection.
    return null;
  }

  // ============================================================
  // Private helpers
  // ============================================================

  private ensureStorageDir(): void {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
  }

  private readUserFile(): Record<string, unknown> {
    try {
      if (!fs.existsSync(this.userFilePath)) return {};
      return JSON.parse(fs.readFileSync(this.userFilePath, 'utf8'));
    } catch {
      return {};
    }
  }

  private writeUserFile(data: Record<string, unknown>): void {
    fs.writeFileSync(this.userFilePath, JSON.stringify(data, null, 2), 'utf8');
  }

  private readSecretsFile(): Record<string, string> {
    try {
      if (!fs.existsSync(this.secretsFilePath)) return {};
      return JSON.parse(fs.readFileSync(this.secretsFilePath, 'utf8'));
    } catch {
      return {};
    }
  }

  private writeSecretsFile(data: Record<string, string>): void {
    // Permiso restringido: solo propietario puede leer
    fs.writeFileSync(this.secretsFilePath, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600 });
  }
}