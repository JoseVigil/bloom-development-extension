// src/api/adapters/AIRuntimeAdapter.ts

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
import { TwitterAuthStatus } from '../../../contracts/types';

/**
 * AIRuntimeAdapter - Unified adapter for all Brain CLI operations
 * 
 * Renombrado de BrainApiAdapter para reflejar que ya no está atado a Copilot.
 * Todos los comandos usan --json como flag global.
 */
export class AIRuntimeAdapter {

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

  static async intentAddTurn(params: {
    intentId: string;
    actor: 'user' | 'ai';
    content: string;
    nucleusPath: string;
    provider?: 'ollama' | 'gemini';
  }): Promise<BrainResult<Intent>> {
    const args: Record<string, any> = {
      '-i': params.intentId,
      '-a': params.actor,
      '-c': params.content,
      '-p': params.nucleusPath
    };

    if (params.provider) args['--provider'] = params.provider;

    return BrainExecutor.execute(['--json', 'intent', 'add-turn'], args);
  }

  // ============================================================================
  // PROJECT OPERATIONS (agregados para que coincida con project.routes.ts)
  // ============================================================================

  static async projectDetect(params: {
    parentPath: string;
    maxDepth?: number;
    strategy?: string;
    minConfidence?: 'high' | 'medium' | 'low';
  }): Promise<BrainResult<{ parent_path: string; projects_found: number; projects: any[] }>> {
    const args: Record<string, any> = { '-p': params.parentPath };
    if (params.maxDepth) args['--max-depth'] = params.maxDepth;
    if (params.strategy) args['--strategy'] = params.strategy;
    if (params.minConfidence) args['--min-confidence'] = params.minConfidence;

    return BrainExecutor.execute(['--json', 'project', 'detect'], args);
  }

  static async projectAdd(params: {
    projectPath: string;
    nucleusPath: string;
    name?: string;
    strategy?: string;
    description?: string;
    repoUrl?: string;
  }): Promise<BrainResult<{ name: string; path: string; strategy: string; nucleus_path: string }>> {
    const args: Record<string, any> = {
      '-p': params.projectPath,
      '-n': params.nucleusPath
    };
    if (params.name) args['--name'] = params.name;
    if (params.strategy) args['--strategy'] = params.strategy;
    if (params.description) args['--description'] = params.description;
    if (params.repoUrl) args['--repo-url'] = params.repoUrl;

    return BrainExecutor.execute(['--json', 'project', 'add'], args);
  }

  static async projectCloneAndAdd(params: {
    repoUrl: string;
    nucleusPath: string;
    destination?: string;
    name?: string;
    strategy?: string;
    onProgress?: (line: string) => void;
  }): Promise<BrainResult<{ cloned_path: string; repo_url: string; project: any }>> {
    const args: Record<string, any> = {
      '--repo': params.repoUrl,
      '-n': params.nucleusPath
    };
    if (params.destination) args['--destination'] = params.destination;
    if (params.name) args['--name'] = params.name;
    if (params.strategy) args['--strategy'] = params.strategy;

    return BrainExecutor.execute(['--json', 'project', 'clone-and-add'], args, { onProgress: params.onProgress });
  }

  // ============================================================================
  // GITHUB OPERATIONS (ejemplos, agrega los que falten)
  // ============================================================================

  static async githubAuthStatus(): Promise<BrainResult<GitHubAuthStatus>> {
    return BrainExecutor.execute(['--json', 'github', 'auth-status'], {});
  }

  static async githubAuthLogin(token: string): Promise<BrainResult<GitHubAuthStatus>> {
    return BrainExecutor.execute(['--json', 'github', 'auth-login'], { '-t': token });
  }

  // ============================================================================
  // GEMINI OPERATIONS (ya existían)
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

  // ============================================================================
  // OLLAMA OPERATIONS (nuevos - placeholders funcionales)
  // ============================================================================

  static async ollamaStatus(): Promise<BrainResult<{ running: boolean }>> {
    return BrainExecutor.execute(['--json', 'ollama', 'status'], {});
  }

  static async ollamaListModels(): Promise<BrainResult<{ models: any[] }>> {
    return BrainExecutor.execute(['--json', 'ollama', 'list-models'], {});
  }

  static async ollamaChat(params: {
    prompt: string;
    context?: Record<string, any>;
    model?: string;
    stream?: boolean;
  }): Promise<BrainResult<{ response: string; chunks?: string[] }>> {
    const args: Record<string, any> = { '--prompt': params.prompt };
    if (params.context) args['--context'] = JSON.stringify(params.context);
    if (params.model) args['--model'] = params.model;
    if (params.stream) args['--stream'] = true;

    return BrainExecutor.execute(['--json', 'ollama', 'chat'], args);
  }

  static async ollamaCancel(processId?: string): Promise<BrainResult<void>> {
    const args = processId ? { '--process-id': processId } : {};
    return BrainExecutor.execute(['--json', 'ollama', 'cancel'], args);
  }

  // ============================================================================
  // HEALTH OPERATIONS
  // ============================================================================

  static async healthFullStack(): Promise<BrainResult> {
    return BrainExecutor.execute(['--json', 'health', 'full-stack'], {});
  }

  static async healthOnboardingStatus(): Promise<BrainResult> {
    return BrainExecutor.execute(['--json', 'health', 'onboarding-status'], {});
  }

  static async healthWebSocketStatus(): Promise<BrainResult> {
    return BrainExecutor.execute(['--json', 'health', 'websocket-status'], {});
  }

  // Agrega aquí cualquier otro método que te falte del original
}