import { BrainExecutor } from '../../utils/brainExecutor';
import type { 
  BrainResult, 
  Nucleus, 
  Intent, 
  DetectedProject, 
  LinkedProject, 
  OnboardingState,
  ChromeProfile,
  AIAccount, // FIXED: Changed from AiAccount to AIAccount
  GitHubAuthStatus,
  GitHubRepository,
  GitHubOrganization
} from '../../../contracts/types';

/**
 * BrainApiAdapter - Unified adapter for all Brain CLI operations
 * 
 * CRITICAL CHANGES:
 * - Removed all local schema imports and .parse() calls
 * - All methods return Promise<BrainResult<T>> with T from contracts/types
 * - Added Intent workflow methods (state, submit, approve, cancel, recover)
 * - Preserved all existing GitHub, Gemini, Profile methods
 */
export class BrainApiAdapter {
  
  // ============================================================================
  // NUCLEUS OPERATIONS
  // ============================================================================
  
  static async nucleusList(parentDir?: string): Promise<BrainResult<{ nuclei: Nucleus[] }>> {
    return BrainExecutor.execute(['nucleus', 'list'], parentDir ? { '-d': parentDir } : {});
  }
  
  static async nucleusGet(nucleusPath: string): Promise<BrainResult<Nucleus>> {
    return BrainExecutor.execute(['nucleus', 'get'], { '-p': nucleusPath });
  }
  
  static async nucleusCreate(params: {
    org: string;
    path?: string;
    url?: string;
    force?: boolean;
    onProgress?: (line: string) => void;
  }): Promise<BrainResult<Nucleus>> {
    const args: Record<string, any> = { '-o': params.org };
    if (params.path) args['-p'] = params.path;
    if (params.url) args['--url'] = params.url;
    if (params.force) args['-f'] = true;
    
    return BrainExecutor.execute(['nucleus', 'create'], args, { onProgress: params.onProgress });
  }
  
  static async nucleusDelete(nucleusPath: string, force?: boolean): Promise<BrainResult<void>> {
    const args: Record<string, any> = { '-p': nucleusPath };
    if (force) args['-f'] = true;
    return BrainExecutor.execute(['nucleus', 'delete'], args);
  }
  
  static async nucleusSync(nucleusPath: string, skipGit?: boolean): Promise<BrainResult<void>> {
    const args: Record<string, any> = { '-p': nucleusPath };
    if (skipGit) args['--skip-git'] = true;
    return BrainExecutor.execute(['nucleus', 'sync'], args);
  }
  
  static async nucleusListProjects(nucleusPath: string, strategy?: string): Promise<BrainResult<{ projects: LinkedProject[] }>> {
    const args: Record<string, any> = { '-p': nucleusPath };
    if (strategy) args['-s'] = strategy;
    return BrainExecutor.execute(['nucleus', 'list-projects'], args);
  }

  static async nucleusOnboardingStatus(path: string): Promise<BrainResult<OnboardingState>> {
    return BrainExecutor.execute(['nucleus', 'onboarding-status'], { '-p': path });
  }

  static async nucleusOnboardingComplete(
    path: string, 
    step: keyof OnboardingState['steps']
  ): Promise<BrainResult<void>> {
    return BrainExecutor.execute(['nucleus', 'onboarding-complete'], {
      '-p': path,
      '--step': step
    });
  }
  
  // ============================================================================
  // INTENT OPERATIONS
  // ============================================================================
  
  static async intentList(nucleusPath: string, type?: 'dev' | 'doc'): Promise<BrainResult<{ intents: Intent[] }>> {
    const args: Record<string, any> = { '-p': nucleusPath };
    if (type) args['-t'] = type;
    return BrainExecutor.execute(['intent', 'list'], args);
  }
  
  static async intentGet(intentId: string, nucleusPath: string): Promise<BrainResult<Intent>> {
    return BrainExecutor.execute(['intent', 'get'], { '-i': intentId, '-p': nucleusPath });
  }
  
  static async intentCreate(params: {
    type: 'dev' | 'doc';
    name: string;
    files: string[];
    nucleusPath: string;
    problem?: string;
    expectedOutput?: string;
  }): Promise<BrainResult<Intent>> {
    const args: Record<string, any> = {
      '-t': params.type,
      '-n': params.name,
      '-f': params.files.join(','),
      '-p': params.nucleusPath
    };
    
    if (params.problem) args['--problem'] = params.problem;
    if (params.expectedOutput) args['--expected-output'] = params.expectedOutput;
    
    return BrainExecutor.execute(['intent', 'create'], args);
  }
  
  static async intentLock(intentId: string, nucleusPath: string): Promise<BrainResult<void>> {
    return BrainExecutor.execute(['intent', 'lock'], { '-i': intentId, '-p': nucleusPath });
  }
  
  static async intentUnlock(intentId: string, nucleusPath: string, force?: boolean): Promise<BrainResult<void>> {
    const args: Record<string, any> = { '-i': intentId, '-p': nucleusPath };
    if (force) args['--force'] = true;
    return BrainExecutor.execute(['intent', 'unlock'], args);
  }

  // NEW: Intent workflow methods (Addendum requirement)
  static async intentState(intentId: string, nucleusPath: string): Promise<BrainResult<Intent>> {
    return BrainExecutor.execute(['intent', 'state'], { '-i': intentId, '-p': nucleusPath });
  }

  static async intentSubmit(intentId: string, nucleusPath: string): Promise<BrainResult<void>> {
    return BrainExecutor.execute(['intent', 'submit'], { '-i': intentId, '-p': nucleusPath });
  }

  static async intentApprove(intentId: string, nucleusPath: string): Promise<BrainResult<void>> {
    // IMPORTANT: Uses 'merge' command per Addendum
    return BrainExecutor.execute(['intent', 'merge'], { '-i': intentId, '-p': nucleusPath });
  }

  static async intentCancel(intentId: string, nucleusPath: string): Promise<BrainResult<void>> {
    // IMPORTANT: Uses 'unlock' with '--cleanup' per Addendum
    return BrainExecutor.execute(['intent', 'unlock'], { 
      '-i': intentId, 
      '-p': nucleusPath,
      '--cleanup': true 
    });
  }

  static async intentRecover(intentId: string, nucleusPath: string): Promise<BrainResult<void>> {
    return BrainExecutor.execute(['intent', 'recover'], { '-i': intentId, '-p': nucleusPath });
  }
  
  static async intentAddTurn(params: {
    intentId: string;
    actor: 'user' | 'ai';
    content: string;
    nucleusPath: string;
  }): Promise<BrainResult<void>> {
    return BrainExecutor.execute(['intent', 'add-turn'], {
      '-i': params.intentId,
      '-a': params.actor,
      '-c': params.content,
      '-p': params.nucleusPath
    });
  }
  
  static async intentFinalize(intentId: string, nucleusPath: string): Promise<BrainResult<void>> {
    return BrainExecutor.execute(['intent', 'finalize'], { '-i': intentId, '-p': nucleusPath });
  }
  
  static async intentDelete(intentId: string, nucleusPath: string, force?: boolean): Promise<BrainResult<void>> {
    const args: Record<string, any> = { '-i': intentId, '-p': nucleusPath };
    if (force) args['--force'] = true;
    return BrainExecutor.execute(['intent', 'delete'], args);
  }
  
  static async intentUpdate(params: {
    intentId: string;
    nucleusPath: string;
    name?: string;
    files?: string[];
    addFiles?: string[];
    removeFiles?: string[];
  }): Promise<BrainResult<void>> {
    const args: Record<string, any> = {
      '-i': params.intentId,
      '-p': params.nucleusPath
    };
    
    if (params.name) args['-n'] = params.name;
    if (params.files) args['--files'] = params.files.join(',');
    if (params.addFiles) args['--add-files'] = params.addFiles.join(',');
    if (params.removeFiles) args['--remove-files'] = params.removeFiles.join(',');
    
    return BrainExecutor.execute(['intent', 'update'], args);
  }
  
  // ============================================================================
  // PROJECT OPERATIONS
  // ============================================================================
  
  static async projectDetect(params: {
    parentPath: string;
    maxDepth?: number;
    strategy?: string;
    minConfidence?: 'high' | 'medium' | 'low';
  }): Promise<BrainResult<{ projects: DetectedProject[] }>> {
    const args: Record<string, any> = {};
    if (params.maxDepth) args['-d'] = params.maxDepth.toString();
    if (params.strategy) args['-s'] = params.strategy;
    if (params.minConfidence) args['-c'] = params.minConfidence;
    
    return BrainExecutor.execute(['project', 'detect', params.parentPath], args);
  }
  
  static async projectAdd(params: {
    projectPath: string;
    nucleusPath: string;
    name?: string;
    strategy?: string;
    description?: string;
    repoUrl?: string;
  }): Promise<BrainResult<LinkedProject>> {
    const args: Record<string, any> = { '-n': params.nucleusPath };
    if (params.name) args['--name'] = params.name;
    if (params.strategy) args['--strategy'] = params.strategy;
    if (params.description) args['--description'] = params.description;
    if (params.repoUrl) args['--repo-url'] = params.repoUrl;
    
    return BrainExecutor.execute(['project', 'add', params.projectPath], args);
  }
  
  static async projectCloneAndAdd(params: {
    repoUrl: string;
    nucleusPath: string;
    destination?: string;
    name?: string;
    strategy?: string;
    onProgress?: (line: string) => void;
  }): Promise<BrainResult<{ project: LinkedProject }>> {
    const args: Record<string, any> = {};
    if (params.destination) args['-d'] = params.destination;
    if (params.name) args['--name'] = params.name;
    if (params.strategy) args['--strategy'] = params.strategy;
    
    return BrainExecutor.execute(
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
  // PROFILE OPERATIONS (Preserved from legacy)
  // ============================================================================
  
  static async profileList(): Promise<BrainResult<{ profiles: ChromeProfile[] }>> {
    return BrainExecutor.execute(['profile', 'list'], {});
  }
  
  static async profileCreate(alias: string): Promise<BrainResult<ChromeProfile>> {
    return BrainExecutor.execute(['profile', 'create', alias], {});
  }
  
  static async profileDestroy(profileId: string, force?: boolean): Promise<BrainResult<void>> {
    const args: Record<string, any> = {};
    if (force) args['-f'] = true;
    return BrainExecutor.execute(['profile', 'destroy', profileId], args);
  }
  
  static async profileRefreshAccounts(profileId: string): Promise<BrainResult<{ accounts: AIAccount[] }>> {
    return BrainExecutor.execute(['profile', 'accounts-refresh', profileId], {});
  }
  
  static async profileAccountsRegister(
    profileId: string, 
    provider: string, 
    email: string
  ): Promise<BrainResult<void>> {
    return BrainExecutor.execute(
      ['profile', 'accounts-register', profileId, provider, email],
      {}
    );
  }
  
  // ============================================================================
  // GITHUB OPERATIONS (Preserved from legacy)
  // ============================================================================
  
  static async githubAuthStatus(): Promise<BrainResult<GitHubAuthStatus>> {
    return BrainExecutor.execute(['github', 'auth-status'], {});
  }
  
  static async githubAuthLogin(token: string): Promise<BrainResult<GitHubAuthStatus>> {
    return BrainExecutor.execute(['github', 'auth-login'], { '-t': token });
  }

  static async githubAuthLogout(): Promise<BrainResult<void>> {
    return BrainExecutor.execute(['github', 'auth-logout'], {});
  }
  
  static async githubOrgsList(): Promise<BrainResult<{ organizations: GitHubOrganization[] }>> {
    return BrainExecutor.execute(['github', 'orgs-list'], {});
  }
  
  static async githubReposList(org?: string): Promise<BrainResult<{ repositories: GitHubRepository[] }>> {
    const args: Record<string, any> = {};
    if (org) args['--org'] = org;
    return BrainExecutor.execute(['github', 'repos-list'], args);
  }

  static async githubReposCreate(options: {
    name: string;
    org?: string;
    description?: string;
    private?: boolean;
  }): Promise<BrainResult<{ repo: GitHubRepository }>> {
    const args: string[] = ['github', 'repos', 'create', options.name];
    const params: Record<string, any> = {};
    
    if (options.org) params['--org'] = options.org;
    if (options.description) params['--description'] = options.description;
    if (options.private) params['--private'] = true;

    return BrainExecutor.execute(args, params);
  }
  
  // ============================================================================
  // GEMINI OPERATIONS (Preserved from legacy)
  // ============================================================================
  
  static async geminiKeysAdd(
    profile: string, 
    key: string, 
    priority?: number
  ): Promise<BrainResult<void>> {
    const args: Record<string, any> = { '-p': profile, '-k': key };
    if (priority !== undefined) args['--priority'] = priority.toString();
    return BrainExecutor.execute(['gemini', 'keys-add'], args);
  }
  
  static async geminiKeysList(): Promise<BrainResult<{ keys: any[] }>> {
    return BrainExecutor.execute(['gemini', 'keys-list'], {});
  }
  
  static async geminiKeysValidate(profile: string): Promise<BrainResult<{ valid: boolean }>> {
    return BrainExecutor.execute(['gemini', 'keys-validate', profile], {});
  }
}