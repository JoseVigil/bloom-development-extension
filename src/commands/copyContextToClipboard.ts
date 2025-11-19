import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { ContextGatherer } from '../core/contextGatherer';
import { TokenEstimator } from '../utils/tokenEstimator';
import { IntentTreeItem } from '../providers/intentTreeProvider';
import { joinPath } from '../utils/uriHelper';

export function registerCopyContextToClipboard(
    context: vscode.ExtensionContext,
    logger: Logger,
    contextGatherer: ContextGatherer    
): void {
    const disposable = vscode.commands.registerCommand(
        'bloom.copyContextToClipboard',
        async (treeItem: IntentTreeItem) => {
            try {
                const pyramidalContext = await contextGatherer.gatherPyramidalContext(
                    treeItem.intent.folderUri.fsPath
                );
                
                const intentPath = joinPath(treeItem.intent.folderUri, 'intent.bl');
                const intentContent = await vscode.workspace.fs.readFile(intentPath);
                const intentText = new TextDecoder().decode(intentContent);
                
                const codebasePath = joinPath(
                    treeItem.intent.folderUri,
                    'codebase.md'
                );
                const codebaseContent = await vscode.workspace.fs.readFile(codebasePath);
                const codebaseText = new TextDecoder().decode(codebaseContent);
                
                let fullContext = contextGatherer.buildContextMarkdown(pyramidalContext);
                fullContext += intentText;
                fullContext += '\n\n---\n\n';
                fullContext += '# CODEBASE RELEVANTE\n\n';
                fullContext += codebaseText;
                fullContext += '\n\n---\n\n';
                fullContext += '## INSTRUCCIONES PARA LA IA\n\n';
                fullContext += '- NO escribas guías ni summaries innecesarios\n';
                fullContext += '- Dame SOLO el código completo y funcional\n';
                fullContext += '- NUNCA uses "//rest of your code" o similares\n';
                fullContext += '- Si modificas varios archivos, devuelve TODOS los archivos COMPLETOS\n';
                fullContext += '- Sigue estrictamente las reglas y estándares definidos arriba\n';
                
                await vscode.env.clipboard.writeText(fullContext);
                
                // ✅ Usar la nueva API estática
                const totalTokens = TokenEstimator.estimateFromText(fullContext);
                const totalChars = fullContext.length;
                
                const action = await vscode.window.showInformationMessage(
                    `📋 Contexto copiado\n${totalChars.toLocaleString()} chars | ~${totalTokens.toLocaleString()} tokens`,
                    'Abrir Claude.ai'
                );
                
                if (action === 'Abrir Claude.ai') {
                    await vscode.env.openExternal(vscode.Uri.parse('https://claude.ai/new'));
                }
                
                logger.info(`Contexto copiado: ${totalChars} chars, ${totalTokens} tokens`);
                
            } catch (error) {
                vscode.window.showErrorMessage(`Error: ${(error as Error).message}`);
                logger.error('Error en copyContextToClipboard', error as Error);
            }
        }
    );
    
    context.subscriptions.push(disposable);
    logger.info('Comando "bloom.copyContextToClipboard" registrado');
}