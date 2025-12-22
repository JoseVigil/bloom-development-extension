import { BrainExecutor } from '../../utils/brainExecutor';
import {
  NucleusListResultSchema,
  NucleusGetResultSchema,
  NucleusCreateResultSchema,
  IntentListResultSchema,
  IntentGetResultSchema,
  IntentCreateResultSchema,
  IntentLockResultSchema,
  IntentFinalizeResultSchema,
  ProfileListResultSchema,
  ProjectDetectResultSchema
} from '../../types/brain-schemas';

/**
 * Unified adapter for all Brain CLI operations
 * All API routes should use this instead of calling BrainExecutor directly
 */
export class BrainApiAdapter {
  
  // ============================================================================
  // NUCLEUS OPERATIONS
  // ============================================================================
  
  static async nucleusList(parentDir?: string) {
    const result = await BrainExecutor.execute(
      ['nucleus', 'list'],
      parentDir ? { '-d': parentDir } : {}
    );
    
    return NucleusListResultSchema.parse(result);
  }
  
  static async nucleusGet(nucleusPath: string) {
    const result = await BrainExecutor.execute(
      ['nucleus', 'get'],
      { '-p': nucleusPath }
    );
    
    return NucleusGetResultSchema.parse(result);
  }
  
  static async nucleusCreate(params: {
    org: string;
    path?: string;
    url?: string;
    force?: boolean;
    onProgress?: (line: string) => void;
  }) {
    const args: Record<string, any> = { '-o': params.org };
    if (params.path) args['-p'] = params.path;
    if (params.url) args['--url'] = params.url;
    if (params.force) args['-f'] = true;
    
    const result = await BrainExecutor.execute(
      ['nucleus', 'create'],
      args,
      { onProgress: params.onProgress }
    );
    
    return NucleusCreateResultSchema.parse(result);
  }
  
  static async nucleusDelete(nucleusPath: string, force?: boolean) {
    const args: Record<string, any> = { '-p': nucleusPath };
    if (force) args['-f'] = true;
    
    return await BrainExecutor.execute(['nucleus', 'delete'], args);
  }
  
  static async nucleusSync(nucleusPath: string, skipGit?: boolean) {
    const args: Record<string, any> = { '-p': nucleusPath };
    if (skipGit) args['--skip-git'] = true;
    
    return await BrainExecutor.execute(['nucleus', 'sync'], args);
  }
  
  static async nucleusListProjects(nucleusPath: string, strategy?: string) {
    const args: Record<string, any> = { '-p': nucleusPath };
    if (strategy) args['-s'] = strategy;
    
    return await BrainExecutor.execute(['nucleus', 'list-projects'], args);
  }
  
  // ============================================================================
  // INTENT OPERATIONS
  // ============================================================================
  
  static async intentList(nucleusPath: string, type?: 'dev' | 'doc') {
    const args: Record<string, any> = { '-p': nucleusPath };
    if (type) args['-t'] = type;
    
    const result = await BrainExecutor.execute(['intent', 'list'], args);
    return IntentListResultSchema.parse(result);
  }
  
  static async intentGet(intentId: string, nucleusPath: string) {
    const result = await BrainExecutor.execute(
      ['intent', 'get'],
      { '-i': intentId, '-p': nucleusPath }
    );
    
    return IntentGetResultSchema.parse(result);
  }
  
  static async intentCreate(params: {
    type: 'dev' | 'doc';
    name: string;
    files: string[];
    nucleusPath: string;
  }) {
    const result = await BrainExecutor.execute(
      ['intent', 'create'],
      {
        '-t': params.type,
        '-n': params.name,
        '-f': params.files.join(','),
        '-p': params.nucleusPath
      }
    );
    
    return IntentCreateResultSchema.parse(result);
  }
  
  static async intentLock(intentId: string, nucleusPath: string) {
    const result = await BrainExecutor.execute(
      ['intent', 'lock'],
      { '-i': intentId, '-p': nucleusPath }
    );
    
    return IntentLockResultSchema.parse(result);
  }
  
  static async intentUnlock(intentId: string, nucleusPath: string, force?: boolean) {
    const args: Record<string, any> = { '-i': intentId, '-p': nucleusPath };
    if (force) args['--force'] = true;
    
    return await BrainExecutor.execute(['intent', 'unlock'], args);
  }
  
  static async intentAddTurn(params: {
    intentId: string;
    actor: 'user' | 'ai';
    content: string;
    nucleusPath: string;
  }) {
    return await BrainExecutor.execute(
      ['intent', 'add-turn'],
      {
        '-i': params.intentId,
        '-a': params.actor,
        '-c': params.content,
        '-p': params.nucleusPath
      }
    );
  }
  
  static async intentFinalize(intentId: string, nucleusPath: string) {
    const result = await BrainExecutor.execute(
      ['intent', 'finalize'],
      { '-i': intentId, '-p': nucleusPath }
    );
    
    return IntentFinalizeResultSchema.parse(result);
  }
  
  static async intentDelete(intentId: string, nucleusPath: string, force?: boolean) {
    const args: Record<string, any> = { '-i': intentId, '-p': nucleusPath };
    if (force) args['--force'] = true;
    
    return await BrainExecutor.execute(['intent', 'delete'], args);
  }
  
  static async intentUpdate(params: {
    intentId: string;
    nucleusPath: string;
    name?: string;
    files?: string[];
    addFiles?: string[];
    removeFiles?: string[];
  }) {
    const args: Record<string, any> = {
      '-i': params.intentId,
      '-p': params.nucleusPath
    };
    
    if (params.name) args['-n'] = params.name;
    if (params.files) args['--files'] = params.files.join(',');
    if (params.addFiles) args['--add-files'] = params.addFiles.join(',');
    if (params.removeFiles) args['--remove-files'] = params.removeFiles.join(',');
    
    return await BrainExecutor.execute(['intent', 'update'], args);
  }
  
  // ============================================================================
  // PROJECT OPERATIONS
  // ============================================================================
  
  static async projectDetect(params: {
    parentPath: string;
    maxDepth?: number;
    strategy?: string;
    minConfidence?: 'high' | 'medium' | 'low';
  }) {
    const args: Record<string, any> = {};
    if (params.maxDepth) args['-d'] = params.maxDepth.toString();
    if (params.strategy) args['-s'] = params.strategy;
    if (params.minConfidence) args['-c'] = params.minConfidence;
    
    const result = await BrainExecutor.execute(
      ['project', 'detect', params.parentPath],
      args
    );
    
    return ProjectDetectResultSchema.parse(result);
  }
  
  static async projectAdd(params: {
    projectPath: string;
    nucleusPath: string;
    name?: string;
    strategy?: string;
    description?: string;
    repoUrl?: string;
  }) {
    const args: Record<string, any> = { '-n': params.nucleusPath };
    if (params.name) args['--name'] = params.name;
    if (params.strategy) args['--strategy'] = params.strategy;
    if (params.description) args['--description'] = params.description;
    if (params.repoUrl) args['--repo-url'] = params.repoUrl;
    
    return await BrainExecutor.execute(
      ['project', 'add', params.projectPath],
      args
    );
  }
  
  static async projectCloneAndAdd(params: {
    repoUrl: string;
    nucleusPath: string;
    destination?: string;
    name?: string;
    strategy?: string;
    onProgress?: (line: string) => void;
  }) {
    const args: Record<string, any> = {};
    if (params.destination) args['-d'] = params.destination;
    if (params.name) args['--name'] = params.name;
    if (params.strategy) args['--strategy'] = params.strategy;
    
    return await BrainExecutor.execute(
      ['project', 'clone-and-add', params.repoUrl],
      args,
      { 
        cwd: params.nucleusPath,
        onProgress: params.onProgress,
        timeout: 180000 
      }
    );
  }
  
  // ============================================================================
  // PROFILE OPERATIONS
  // ============================================================================
  
  static async profileList() {
    const result = await BrainExecutor.execute(['profile', 'list'], {});
    return ProfileListResultSchema.parse(result);
  }
  
  static async profileCreate(alias: string) {
    return await BrainExecutor.execute(['profile', 'create', alias], {});
  }
  
  static async profileDestroy(profileId: string, force?: boolean) {
    const args: Record<string, any> = {};
    if (force) args['-f'] = true;
    
    return await BrainExecutor.execute(['profile', 'destroy', profileId], args);
  }
  
  static async profileAccountsRegister(profileId: string, provider: string, email: string) {
    return await BrainExecutor.execute(
      ['profile', 'accounts-register', profileId, provider, email],
      {}
    );
  }
  
  // ============================================================================
  // GITHUB OPERATIONS
  // ============================================================================
  
  static async githubAuthStatus() {
    return await BrainExecutor.execute(['github', 'auth-status'], {});
  }
  
  static async githubAuthLogin(token: string) {
    return await BrainExecutor.execute(['github', 'auth-login'], { '-t': token });
  }
  
  static async githubOrgsList() {
    return await BrainExecutor.execute(['github', 'orgs-list'], {});
  }
  
  static async githubReposList(org?: string) {
    const args: Record<string, any> = {};
    if (org) args['--org'] = org;
    
    return await BrainExecutor.execute(['github', 'repos-list'], args);
  }
  
  // ============================================================================
  // GEMINI OPERATIONS
  // ============================================================================
  
  static async geminiKeysAdd(profile: string, key: string, priority?: number) {
    const args: Record<string, any> = { '-p': profile, '-k': key };
    if (priority !== undefined) args['--priority'] = priority.toString();
    
    return await BrainExecutor.execute(['gemini', 'keys-add'], args);
  }
  
  static async geminiKeysList() {
    return await BrainExecutor.execute(['gemini', 'keys-list'], {});
  }
  
  static async geminiKeysValidate(profile: string) {
    return await BrainExecutor.execute(['gemini', 'keys-validate', profile], {});
  }
}