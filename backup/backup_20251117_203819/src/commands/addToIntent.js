"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerAddToIntent = registerAddToIntent;
const vscode = __importStar(require("vscode"));
const metadataManager_1 = require("../core/metadataManager");
const codebaseGenerator_1 = require("../core/codebaseGenerator");
const intentGenerator_1 = require("../core/intentGenerator");
const intentSession_1 = require("../core/intentSession");
const path = __importStar(require("path"));
function registerAddToIntent(context, logger) {
    const disposable = vscode.commands.registerCommand('bloom.addToIntent', async (uri, selectedUris) => {
        logger.info('Ejecutando comando: Bloom: Add to Intent');
        let files = [];
        if (selectedUris && selectedUris.length > 0) {
            files = selectedUris;
        }
        else if (uri) {
            files = [uri];
        }
        if (files.length === 0) {
            vscode.window.showErrorMessage('No hay archivos seleccionados.');
            return;
        }
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('No hay workspace abierto.');
            return;
        }
        const intentsPath = path.join(workspaceFolder.uri.fsPath, '.bloom', 'intents');
        try {
            const intentDirs = await vscode.workspace.fs.readDirectory(vscode.Uri.file(intentsPath));
            const intentNames = intentDirs
                .filter(([name, type]) => type === vscode.FileType.Directory)
                .map(([name]) => name);
            if (intentNames.length === 0) {
                vscode.window.showInformationMessage('No hay intents disponibles.');
                return;
            }
            const selected = await vscode.window.showQuickPick(intentNames, {
                placeHolder: 'Selecciona el intent al que agregar archivos'
            });
            if (!selected)
                return;
            const intentFolder = vscode.Uri.file(path.join(intentsPath, selected));
            const metadataManager = new metadataManager_1.MetadataManager(logger);
            const codebaseGenerator = new codebaseGenerator_1.CodebaseGenerator();
            const intentGenerator = new intentGenerator_1.IntentGenerator(logger);
            const session = await intentSession_1.IntentSession.forIntent(selected, workspaceFolder, metadataManager, codebaseGenerator, intentGenerator, logger);
            await session.addFiles(files);
            vscode.window.showInformationMessage(`✅ ${files.length} archivo(s) agregado(s) a '${selected}'`);
        }
        catch (error) {
            vscode.window.showErrorMessage(`Error: ${error}`);
            logger.error('Error en addToIntent', error);
        }
    });
    context.subscriptions.push(disposable);
    logger.info('Comando "bloom.addToIntent" registrado');
}
//# sourceMappingURL=addToIntent.js.map