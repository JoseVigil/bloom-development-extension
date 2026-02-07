import path from 'path';
import type { OrganizationContext } from '../utils/org-resolver.js';

export class PathResolver {
  constructor(private org: OrganizationContext) {}
  
  // Core paths
  get nucleus(): string {
    return this.org.nucleusRoot;
  }
  
  get batcave(): string {
    return this.org.batcaveRoot;
  }
  
  get ownership(): string {
    return this.org.ownershipPath;
  }
  
  get alfredContract(): string {
    return this.org.alfredContractPath;
  }
  
  // Batcave internal paths
  get batcaveData(): string {
    return path.join(this.org.batcaveRoot, '.data');
  }
  
  get batcaveLogs(): string {
    return path.join(this.org.batcaveRoot, '.logs');
  }
  
  get batcaveConfig(): string {
    return this.org.configPath;
  }
  
  // Governance paths
  get governance(): string {
    return path.join(this.org.nucleusRoot, '.governance');
  }
  
  get securityStandards(): string {
    return path.join(this.governance, '.security', '.security-standards.bl');
  }
  
  // Intent paths
  get intents(): string {
    return path.join(this.org.nucleusRoot, '.intents');
  }
  
  // Reports paths
  get reports(): string {
    return path.join(this.org.nucleusRoot, 'reports');
  }
  
  get exports(): string {
    return path.join(this.reports, 'exports');
  }
  
  // Dynamic data paths
  tunnelState(tunnelId: string): string {
    return path.join(this.batcaveData, 'tunnels', `${tunnelId}.json`);
  }
  
  sessionData(sessionId: string): string {
    return path.join(this.batcaveData, 'sessions', `${sessionId}.json`);
  }
  
  nonceCache(nonceId: string): string {
    return path.join(this.batcaveData, 'nonces', `${nonceId}.json`);
  }
  
  // Log paths
  governanceLog(date: string): string {
    return path.join(this.batcaveLogs, 'governance', `${date}.log`);
  }
  
  securityLog(date: string): string {
    return path.join(this.batcaveLogs, 'security', `${date}.log`);
  }
  
  relayLog(date: string): string {
    return path.join(this.batcaveLogs, 'relay', `${date}.log`);
  }
}
