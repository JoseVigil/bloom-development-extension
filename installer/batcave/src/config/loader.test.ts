import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { loadConfig } from './loader.js';
import type { OrganizationContext } from '../utils/org-resolver.js';

describe('loadConfig — backend.base_url (§1.3)', () => {
  let tmpRoot: string;
  let org: OrganizationContext;
  const ENV_VAR = 'BATCAVE_BACKEND_BASE_URL';
  let originalEnvValue: string | undefined;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'batcave-loader-test-'));
    const nucleusRoot = join(tmpRoot, '.nucleus-acme');
    const configDir = join(nucleusRoot, '.batcave', 'config');
    mkdirSync(configDir, { recursive: true });

    org = {
      name: 'acme',
      fingerprint: 'bloom:org:acme',
      nucleusRoot,
      batcaveRoot: join(nucleusRoot, '.batcave'),
      ownershipPath: join(nucleusRoot, '.ownership.json'),
      alfredContractPath: join(nucleusRoot, '.core', '.ai_bot.sovereign.bl'),
      configPath: join(configDir, 'batcave.config.json')
    };

    originalEnvValue = process.env[ENV_VAR];
    delete process.env[ENV_VAR];
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
    if (originalEnvValue !== undefined) {
      process.env[ENV_VAR] = originalEnvValue;
    } else {
      delete process.env[ENV_VAR];
    }
  });

  it('fails explicitly when backend.base_url is missing from both file and env', async () => {
    await expect(loadConfig(org)).rejects.toThrow();
  });

  it('reads backend.base_url from the config file', async () => {
    writeFileSync(
      org.configPath,
      JSON.stringify({ backend: { base_url: 'https://backend.file.test' } })
    );

    const config = await loadConfig(org);
    expect(config.backend.base_url).toBe('https://backend.file.test');
  });

  it('reads backend.base_url from BATCAVE_BACKEND_BASE_URL, taking precedence over the file', async () => {
    writeFileSync(
      org.configPath,
      JSON.stringify({ backend: { base_url: 'https://backend.file.test' } })
    );
    process.env[ENV_VAR] = 'https://backend.env.test';

    const config = await loadConfig(org);
    expect(config.backend.base_url).toBe('https://backend.env.test');
  });

  it('rejects a non-URL value for backend.base_url', async () => {
    process.env[ENV_VAR] = 'not-a-url';
    await expect(loadConfig(org)).rejects.toThrow();
  });
});
