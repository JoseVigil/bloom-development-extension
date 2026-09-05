import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { PathResolver } from '../config/paths.js';
import { createBatcaveLoggers } from './logging.js';
import type { OrganizationContext } from '../utils/org-resolver.js';

function readJsonLines(path: string): any[] {
  return readFileSync(path, 'utf-8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

describe('createBatcaveLoggers', () => {
  let tmpRoot: string;
  let org: OrganizationContext;
  let paths: PathResolver;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'batcave-logging-test-'));
    org = {
      name: 'acme',
      fingerprint: 'bloom:org:acme',
      nucleusRoot: join(tmpRoot, '.nucleus-acme'),
      batcaveRoot: join(tmpRoot, '.nucleus-acme', '.batcave'),
      ownershipPath: join(tmpRoot, '.nucleus-acme', '.ownership.json'),
      alfredContractPath: join(tmpRoot, '.nucleus-acme', '.core', '.ai_bot.sovereign.bl'),
      configPath: join(tmpRoot, '.nucleus-acme', '.batcave', 'config', 'batcave.config.json')
    };
    paths = new PathResolver(org);
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('writes each stream to the path PathResolver resolves', () => {
    const loggers = createBatcaveLoggers(org, paths);
    const date = new Date().toISOString().split('T')[0];

    loggers.governance.info({ event: 'server_started' }, 'governance entry');
    loggers.security.warn({ event: 'backend_unreachable' }, 'security entry');
    loggers.relay.info({ event: 'proxied_request' }, 'relay entry');

    const governanceLines = readJsonLines(paths.governanceLog(date));
    const securityLines = readJsonLines(paths.securityLog(date));
    const relayLines = readJsonLines(paths.relayLog(date));

    expect(governanceLines).toHaveLength(1);
    expect(securityLines).toHaveLength(1);
    expect(relayLines).toHaveLength(1);
  });

  it('tags every entry with organization and fingerprint', () => {
    const loggers = createBatcaveLoggers(org, paths);
    const date = new Date().toISOString().split('T')[0];

    loggers.relay.info({ event: 'proxied_request' }, 'relay entry');

    const [entry] = readJsonLines(paths.relayLog(date));
    expect(entry.organization).toBe('acme');
    expect(entry.fingerprint).toBe('bloom:org:acme');
    expect(entry.log_type).toBe('relay');
  });

  it('does not mix entries from different streams into the same file', () => {
    const loggers = createBatcaveLoggers(org, paths);
    const date = new Date().toISOString().split('T')[0];

    loggers.governance.info({}, 'only governance');
    loggers.security.info({}, 'only security');

    const governanceLines = readJsonLines(paths.governanceLog(date));
    const securityLines = readJsonLines(paths.securityLog(date));

    expect(governanceLines.every((l) => l.log_type === 'governance')).toBe(true);
    expect(securityLines.every((l) => l.log_type === 'security')).toBe(true);
  });
});
