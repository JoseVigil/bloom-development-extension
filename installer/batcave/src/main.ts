import { resolveOrganization } from './utils/org-resolver.js';
import { PathResolver } from './config/paths.js';
import { loadConfig, getCodespaceUrl } from './config/loader.js';
import { startServer } from './server/http-server.js';

async function main() {
  console.log('🦇 BATCAVE - Sovereign Control Plane');
  console.log('=====================================\n');
  
  try {
    // Resolve organization
    console.log('🔍 Resolving organization...');
    const org = await resolveOrganization();
    console.log(`✓ Organization: ${org.name}`);
    console.log(`✓ Fingerprint: ${org.fingerprint}`);
    console.log(`✓ Nucleus: ${org.nucleusRoot}\n`);
    
    // Initialize path resolver
    const paths = new PathResolver(org);
    console.log('📁 Path resolver initialized');
    console.log(`  • Batcave: ${paths.batcave}`);
    console.log(`  • Config: ${paths.batcaveConfig}`);
    console.log(`  • Ownership: ${paths.ownership}\n`);
    
    // Load configuration
    console.log('⚙️  Loading configuration...');
    const config = await loadConfig(org);
    console.log(`✓ REST Port: ${config.server?.port_rest}`);
    console.log(`✓ WSS Port: ${config.server?.port_wss}`);
    console.log(`✓ Log Level: ${config.logging?.level}\n`);
    
    // Check if running in Codespace
    const restUrl = getCodespaceUrl(config.server?.port_rest || 48215);
    const wssUrl = getCodespaceUrl(config.server?.port_wss || 4124);
    
    if (restUrl) {
      console.log('🌐 GitHub Codespace detected');
      console.log(`  • REST: ${restUrl}`);
      console.log(`  • WSS: ${wssUrl}\n`);
    }
    
    console.log('✅ BATCAVE initialized successfully');
    console.log('\n🚀 Ready to start server...');
    
    await startServer(org, paths, config);
    
  } catch (error) {
    console.error('❌ Initialization failed:', error);
    process.exit(1);
  }
}

main();
