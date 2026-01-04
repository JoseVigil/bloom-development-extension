import { BrainExecutor } from '../../utils/brainExecutor';
import type {
  BrainResult,
  Nucleus,
  Intent,
  DetectedProject,
  LinkedProject,
  OnboardingState,
  ChromeProfile,
  AIAccount,
  GitHubAuthStatus,
  GitHubRepository,
  GitHubOrganization
} from '../../../contracts/types';

/**
 * BrainApiAdapter - Unified adapter for all Brain CLI operations
 * 
 * CRITICAL FIX:
 * - All commands now use --json as GLOBAL flag (before category)
 * - Format: python -m brain --json <category> <command> [ARGS]
 * - Added comprehensive logging for debugging
 */
export class BrainApiAdapter {

  // ============================================================================
  // NUCLEUS OPERATIONS
  // ============================================================================

  static async nucleusList(parentDir?: string): Promise<BrainResult<{ nuclei: Nucleus[] }>> {
    return BrainExecutor.execute(['--json', 'nucleus', 'list'], parentDir ? { '-d': parentDir } : {});
  }

  static async nucleusGet(nucleusPath: string): Promise<BrainResult<Nucleus>> {
    return BrainExecutor.execute(['--json', 'nucleus', 'get'], { '-p': nucleusPath });
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

    return BrainExecutor.execute(['--json', 'nucleus', 'create'], args, { onProgress: params.onProgress });
  }

  static async nucleusDelete(nucleusPath: string, force?: boolean): Promise<BrainResult<void>> {
    const args: Record<string, any> = { '-p': nucleusPath };
    if (force) args['-f'] = true;
    return BrainExecutor.execute(['--json', 'nucleus', 'delete'], args);
  }

  static async nucleusSync(nucleusPath: string, skipGit?: boolean): Promise<BrainResult<void>> {
    const args: Record<string, any> = { '-p': nucleusPath };
    if (skipGit) args['--skip-git'] = true;
    return BrainExecutor.execute(['--json', 'nucleus', 'sync'], args);
  }

  static async nucleusListProjects(nucleusPath: string, strategy?: string): Promise<BrainResult<{ projects: LinkedProject[] }>> {
    const args: Record<string, any> = { '-p': nucleusPath };
    if (strategy) args['-s'] = strategy;
    return BrainExecutor.execute(['--json', 'nucleus', 'list-projects'], args);
  }

  static async nucleusOnboardingStatus(path: string): Promise<BrainResult<OnboardingState>> {
    return BrainExecutor.execute(['--json', 'nucleus', 'onboarding-status'], { '-p': path });
  }

  static async nucleusOnboardingComplete(
    path: string,
    step: keyof OnboardingState['steps']
  ): Promise<BrainResult<void>> {
    return BrainExecutor.execute(['--json', 'nucleus', 'onboarding-complete'], {
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
    return BrainExecutor.execute(['--json', 'intent', 'list'], args);
  }

  static async intentGet(intentId: string, nucleusPath: string): Promise<BrainResult<Intent>> {
    return BrainExecutor.execute(['--json', 'intent', 'get'], { '-i': intentId, '-p': nucleusPath });
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

    return BrainExecutor.execute(['--json', 'intent', 'create'], args);
  }

  static async intentLock(intentId: string, nucleusPath: string): Promise<BrainResult<void>> {
    return BrainExecutor.execute(['--json', 'intent', 'lock'], { '-i': intentId, '-p': nucleusPath });
  }

  static async intentUnlock(intentId: string, nucleusPath: string, force?: boolean): Promise<BrainResult<void>> {
    const args: Record<string, any> = { '-i': intentId, '-p': nucleusPath };
    if (force) args['--force'] = true;
    return BrainExecutor.execute(['--json', 'intent', 'unlock'], args);
  }

  static async intentState(intentId: string, nucleusPath: string): Promise<BrainResult<Intent>> {
    return BrainExecutor.execute(['--json', 'intent', 'state'], { '-i': intentId, '-p': nucleusPath });
  }

  static async intentSubmit(intentId: string, nucleusPath: string): Promise<BrainResult<void>> {
    return BrainExecutor.execute(['--json', 'intent', 'submit'], { '-i': intentId, '-p': nucleusPath });
  }

  static async intentApprove(intentId: string, nucleusPath: string): Promise<BrainResult<void>> {
    return BrainExecutor.execute(['--json', 'intent', 'merge'], { '-i': intentId, '-p': nucleusPath });
  }

  static async intentCancel(intentId: string, nucleusPath: string): Promise<BrainResult<void>> {
    return BrainExecutor.execute(['--json', 'intent', 'unlock'], {
      '-i': intentId,
      '-p': nucleusPath,
      '--cleanup': true
    });
  }

  static async intentRecover(intentId: string, nucleusPath: string): Promise<BrainResult<void>> {
    return BrainExecutor.execute(['--json', 'intent', 'recover'], { '-i': intentId, '-p': nucleusPath });
  }

  static async intentAddTurn(params: {
    intentId: string;
    actor: 'user' | 'ai';
    content: string;
    nucleusPath: string;
  }): Promise<BrainResult<void>> {
    return BrainExecutor.execute(['--json', 'intent', 'add-turn'], {
      '-i': params.intentId,
      '-a': params.actor,
      '-c': params.content,
      '-p': params.nucleusPath
    });
  }

  static async intentFinalize(intentId: string, nucleusPath: string): Promise<BrainResult<void>> {
    return BrainExecutor.execute(['--json', 'intent', 'finalize'], { '-i': intentId, '-p': nucleusPath });
  }

  static async intentDelete(intentId: string, nucleusPath: string, force?: boolean): Promise<BrainResult<void>> {
    const args: Record<string, any> = { '-i': intentId, '-p': nucleusPath };
    if (force) args['--force'] = true;
    return BrainExecutor.execute(['--json', 'intent', 'delete'], args);
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

    return BrainExecutor.execute(['--json', 'intent', 'update'], args);
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

    return BrainExecutor.execute(['--json', 'project', 'detect', params.parentPath], args);
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

    return BrainExecutor.execute(['--json', 'project', 'add', params.projectPath], args);
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
      ['--json', 'project', 'clone-and-add', params.repoUrl],
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

  static async profileList(): Promise<BrainResult<{ profiles: ChromeProfile[] }>> {
    return BrainExecutor.execute(['--json', 'profile', 'list'], {});
  }

  static async profileCreate(alias: string): Promise<BrainResult<ChromeProfile>> {
    return BrainExecutor.execute(['--json', 'profile', 'create', alias], {});
  }

  static async profileDestroy(profileId: string, force?: boolean): Promise<BrainResult<void>> {
    const args: Record<string, any> = {};
    if (force) args['-f'] = true;
    return BrainExecutor.execute(['--json', 'profile', 'destroy', profileId], args);
  }

  static async profileRefreshAccounts(profileId: string): Promise<BrainResult<{ accounts: AIAccount[] }>> {
    return BrainExecutor.execute(['--json', 'profile', 'accounts-refresh', profileId], {});
  }

  static async profileAccountsRegister(
    profileId: string,
    provider: string,
    email: string
  ): Promise<BrainResult<void>> {
    return BrainExecutor.execute(
      ['--json', 'profile', 'accounts-register', profileId, provider, email],
      {}
    );
  }

  // ============================================================================
  // GITHUB OPERATIONS
  // ============================================================================

  static async githubAuthStatus(): Promise<BrainResult<GitHubAuthStatus>> {
    return BrainExecutor.execute(['--json', 'github', 'auth-status'], {});
  }

  static async githubAuthLogin(token: string): Promise<BrainResult<GitHubAuthStatus>> {
    return BrainExecutor.execute(['--json', 'github', 'auth-login'], { '-t': token });
  }

  static async githubAuthLogout(): Promise<BrainResult<void>> {
    return BrainExecutor.execute(['--json', 'github', 'auth-logout'], {});
  }

  static async githubOrgsList(): Promise<BrainResult<{ organizations: GitHubOrganization[] }>> {
    return BrainExecutor.execute(['--json', 'github', 'orgs-list'], {});
  }

  static async githubReposList(org?: string): Promise<BrainResult<{ repositories: GitHubRepository[] }>> {
    const args: Record<string, any> = {};
    if (org) args['--org'] = org;
    return BrainExecutor.execute(['--json', 'github', 'repos-list'], args);
  }

  static async githubReposCreate(options: {
    name: string;
    org?: string;
    description?: string;
    private?: boolean;
  }): Promise<BrainResult<{ repo: GitHubRepository }>> {
    const args: string[] = ['--json', 'github', 'repos', 'create', options.name];
    const params: Record<string, any> = {};

    if (options.org) params['--org'] = options.org;
    if (options.description) params['--description'] = options.description;
    if (options.private) params['--private'] = true;

    return BrainExecutor.execute(args, params);
  }

  // ============================================================================
  // GEMINI OPERATIONS
  // ============================================================================

  static async geminiKeysAdd(
    profile: string,
    key: string,
    priority?: number
  ): Promise<BrainResult<void>> {
    const args: Record<string, any> = { '-p': profile, '-k': key };
    if (priority !== undefined) args['--priority'] = priority.toString();
    return BrainExecutor.execute(['--json', 'gemini', 'keys-add'], args);
  }

  static async geminiKeysList(): Promise<BrainResult<{ keys: any[] }>> {
    return BrainExecutor.execute(['--json', 'gemini', 'keys-list'], {});
  }

  static async geminiKeysValidate(profile: string): Promise<BrainResult<{ valid: boolean }>> {
    return BrainExecutor.execute(['--json', 'gemini', 'keys-validate', profile], {});
  }

  // ============================================================================
  // HEALTH OPERATIONS
  // ============================================================================

  /**
   * Execute full-stack health check.
   * Maps to: python -m brain --json health full-stack
   */
  static async healthFullStack(): Promise<BrainResult> {
    return BrainExecutor.execute(['--json', 'health', 'full-stack'], {});
  }

  /**
   * Execute onboarding status.
   * Maps to: python -m brain --json health onboarding-status
   */
  static async healthOnboardingStatus(): Promise<BrainResult> {
    return BrainExecutor.execute(['--json', 'health', 'onboarding-status'], {});
  }

  /**
   * Execute WebSocket status status.
   * Maps to: python -m brain --json health websocket-status
   */
  static async healthWebSocketStatus(): Promise<BrainResult> {
    return BrainExecutor.execute(['--json', 'health', 'websocket-status'], {});
  }
}