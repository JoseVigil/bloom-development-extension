import * as vscode from 'vscode';
import { BloomApiServer } from './api/server';
import { WebSocketManager } from './server/WebSocketManager';
import { BrainExecutor } from './utils/brainExecutor';

let apiServer: BloomApiServer | null = null;
let wsManager: WebSocketManager | null = null;
let outputChannel: vscode.OutputChannel;

export async function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel('Bloom');
  outputChannel.appendLine('🚀 Bloom Extension Activating...');

  try {
    // 1. Initialize Brain Executor
    outputChannel.appendLine('Initializing Brain CLI...');
    await BrainExecutor.initialize(context.extensionPath);
    outputChannel.appendLine('✅ Brain CLI initialized');

    // 2. Start WebSocket Manager
    outputChannel.appendLine('Starting WebSocket Manager...');
    wsManager = WebSocketManager.getInstance();
    await wsManager.start();
    outputChannel.appendLine(`✅ WebSocket server running on ws://localhost:4124`);

    // 3. Start Fastify API Server
    outputChannel.appendLine('Starting Bloom API Server...');
    apiServer = new BloomApiServer({
      port: 48215,
      wsManager: wsManager,
      context: context,
      outputChannel: outputChannel
    });
    await apiServer.start();
    outputChannel.appendLine(`✅ API server running on http://localhost:48215`);
    outputChannel.appendLine(`📚 Swagger docs: http://localhost:48215/api/docs`);

    // 4. Register commands
    registerCommands(context);

    // 5. Show notification
    vscode.window.showInformationMessage(
      'Bloom is ready! Open the UI to get started.',
      'Open UI',
      'View Docs'
    ).then(selection => {
      if (selection === 'Open UI') {
        vscode.env.openExternal(vscode.Uri.parse('http://localhost:5173'));
      } else if (selection === 'View Docs') {
        vscode.env.openExternal(vscode.Uri.parse('http://localhost:48215/api/docs'));
      }
    });

    outputChannel.appendLine('✅ Bloom Extension Activated Successfully!');

  } catch (error: any) {
    outputChannel.appendLine(`❌ Activation failed: ${error.message}`);
    vscode.window.showErrorMessage(`Bloom activation failed: ${error.message}`);
    throw error;
  }
}

export async function deactivate() {
  outputChannel.appendLine('🛑 Bloom Extension Deactivating...');

  try {
    if (apiServer) {
      await apiServer.stop();
      outputChannel.appendLine('✅ API server stopped');
    }

    if (wsManager) {
      await wsManager.stop();
      outputChannel.appendLine('✅ WebSocket server stopped');
    }

    outputChannel.appendLine('✅ Bloom Extension Deactivated');
  } catch (error: any) {
    outputChannel.appendLine(`❌ Deactivation error: ${error.message}`);
  }
}

function registerCommands(context: vscode.ExtensionContext) {
  // Command: Open Bloom UI
  context.subscriptions.push(
    vscode.commands.registerCommand('bloom.openUI', () => {
      vscode.env.openExternal(vscode.Uri.parse('http://localhost:5173'));
    })
  );

  // Command: Open API Docs
  context.subscriptions.push(
    vscode.commands.registerCommand('bloom.openApiDocs', () => {
      vscode.env.openExternal(vscode.Uri.parse('http://localhost:48215/api/docs'));
    })
  );

  // Command: Restart Servers
  context.subscriptions.push(
    vscode.commands.registerCommand('bloom.restartServers', async () => {
      try {
        outputChannel.appendLine('🔄 Restarting servers...');
        
        if (apiServer) {
          await apiServer.stop();
          await apiServer.start();
        }
        
        if (wsManager) {
          await wsManager.stop();
          await wsManager.start();
        }
        
        vscode.window.showInformationMessage('Bloom servers restarted successfully');
        outputChannel.appendLine('✅ Servers restarted');
      } catch (error: any) {
        vscode.window.showErrorMessage(`Failed to restart: ${error.message}`);
        outputChannel.appendLine(`❌ Restart failed: ${error.message}`);
      }
    })
  );

  // Command: Show Server Status
  context.subscriptions.push(
    vscode.commands.registerCommand('bloom.showStatus', () => {
      const apiRunning = apiServer?.isRunning() || false;
      const wsStatus = wsManager?.currentStatus() || { clients: 0, activeProcesses: 0 };
      
      const statusMessage = `
Bloom Status:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
API Server: ${apiRunning ? '✅ Running' : '❌ Stopped'}
  Port: ${apiServer?.getPort() || 'N/A'}
  Docs: http://localhost:48215/api/docs

WebSocket Server: ${wsStatus.clients > 0 ? '✅ Active' : '⚠️ No clients'}
  Port: 4124
  Connected Clients: ${wsStatus.clients}
  Active Processes: ${wsStatus.activeProcesses}

UI: http://localhost:5173
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      `.trim();
      
      vscode.window.showInformationMessage(statusMessage, { modal: true });
    })
  );

  // Command: Create Nucleus
  context.subscriptions.push(
    vscode.commands.registerCommand('bloom.createNucleus', async () => {
      const org = await vscode.window.showInputBox({
        prompt: 'Enter organization name',
        placeHolder: 'e.g., MyCompany'
      });
      
      if (!org) return;
      
      const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspacePath) {
        vscode.window.showErrorMessage('No workspace folder open');
        return;
      }
      
      try {
        const result = await BrainExecutor.execute(
          ['nucleus', 'create'],
          { '-o': org, '-p': workspacePath }
        );
        
        if (result.status === 'success') {
          vscode.window.showInformationMessage(`Nucleus created: ${org}`);
          outputChannel.appendLine(`✅ Nucleus created: ${JSON.stringify(result.data)}`);
        } else {
          vscode.window.showErrorMessage(`Failed to create nucleus: ${result.error}`);
        }
      } catch (error: any) {
        vscode.window.showErrorMessage(`Error: ${error.message}`);
      }
    })
  );

  // Command: Create Intent
  context.subscriptions.push(
    vscode.commands.registerCommand('bloom.createIntent', async () => {
      const type = await vscode.window.showQuickPick(['dev', 'doc'], {
        placeHolder: 'Select intent type'
      });
      
      if (!type) return;
      
      const name = await vscode.window.showInputBox({
        prompt: 'Enter intent name',
        placeHolder: 'e.g., Fix authentication flow'
      });
      
      if (!name) return;
      
      const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspacePath) {
        vscode.window.showErrorMessage('No workspace folder open');
        return;
      }
      
      try {
        const result = await BrainExecutor.execute(
          ['intent', 'create'],
          { '-t': type, '-n': name, '-p': workspacePath, '-f': '' }
        );
        
        if (result.status === 'success') {
          vscode.window.showInformationMessage(`Intent created: ${name}`);
          outputChannel.appendLine(`✅ Intent created: ${JSON.stringify(result.data)}`);
        } else {
          vscode.window.showErrorMessage(`Failed to create intent: ${result.error}`);
        }
      } catch (error: any) {
        vscode.window.showErrorMessage(`Error: ${error.message}`);
      }
    })
  );

  outputChannel.appendLine('✅ Commands registered');
}