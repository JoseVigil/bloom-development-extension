// src/extension.ts - COMPLETO con todas las funcionalidades

import 'module-alias/register';
import * as vscode from 'vscode';
import * as path from 'path';
import { BloomApiServer } from './api/server';
import { WebSocketManager } from './server/WebSocketManager';
import { BrainExecutor } from './utils/brainExecutor';
import { HostExecutor } from './host/HostExecutor';

let apiServer: BloomApiServer | null = null;
let wsManager: WebSocketManager;
let outputChannel: vscode.OutputChannel;

export async function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel('Bloom');
  outputChannel.show();
  outputChannel.appendLine('🚀 Bloom Extension Activating...');

  try {
    // 0. CRITICAL: Initialize BrainExecutor FIRST
    outputChannel.appendLine('[1/5] Initializing Brain CLI...');
    const brainPath = path.join(context.extensionPath, 'brain', 'brain.py');
    const pythonPath = 'python';
    
    BrainExecutor.initialize(context.extensionPath);
    outputChannel.appendLine('✅ Brain CLI initialized');
    outputChannel.appendLine(`   Path: ${brainPath}`);

    // 1. Start WebSocket Manager
    outputChannel.appendLine('[2/5] Starting WebSocket Manager...');
    wsManager = WebSocketManager.getInstance();
    await wsManager.start();
    outputChannel.appendLine('✅ WebSocket server running on ws://localhost:4124');

    // 2. Attach HostExecutor
    outputChannel.appendLine('[3/5] Attaching HostExecutor...');
    const hostExecutor = new HostExecutor(context);
    wsManager.attachHost(hostExecutor);
    await hostExecutor.start();
    outputChannel.appendLine('✅ HostExecutor attached and started');
    context.subscriptions.push({ dispose: () => hostExecutor.stop() });

    // 3. Start Fastify API Server
    outputChannel.appendLine('[4/5] Starting Bloom API Server...');
    apiServer = new BloomApiServer({
      port: 48215,
      wsManager: wsManager,
      context: context,
      outputChannel: outputChannel
    });
    await apiServer.start();
    outputChannel.appendLine('✅ API server running on http://localhost:48215');
    outputChannel.appendLine('📚 Swagger docs: http://localhost:48215/api/docs');

    // 4. Register commands
    outputChannel.appendLine('[5/5] Registering commands...');
    registerCommands(context);
    outputChannel.appendLine('✅ Commands registered');

    // 5. Show notification
    outputChannel.appendLine('═══════════════════════════════════════');
    outputChannel.appendLine('🎉 Bloom Extension Activated Successfully!');
    outputChannel.appendLine('');
    outputChannel.appendLine('Quick Test:');
    outputChannel.appendLine('  curl http://localhost:48215/api/v1/health');
    outputChannel.appendLine('  wscat -c ws://localhost:4124');
    
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

  } catch (error: any) {
    outputChannel.appendLine(`❌ Activation failed: ${error.message}`);
    outputChannel.appendLine(`Stack: ${error.stack}`);
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
          ['--json', 'nucleus', 'create'],
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
          ['--json', 'intent', 'create'],
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
}