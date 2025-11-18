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
exports.registerGenerateIntent = registerGenerateIntent;
const vscode = __importStar(require("vscode"));
const intentFormPanel_1 = require("../ui/intentFormPanel");
const path = __importStar(require("path"));
function registerGenerateIntent(context, logger) {
    const disposable = vscode.commands.registerCommand('bloom.generateIntent', async (uri, selectedUris) => {
        logger.info('Ejecutando comando: Bloom: Generate Intent');
        // Obtener archivos seleccionados
        let files = [];
        if (selectedUris && selectedUris.length > 0) {
            files = selectedUris;
        }
        else if (uri) {
            files = [uri];
        }
        // Validar que hay archivos seleccionados
        if (files.length === 0) {
            vscode.window.showErrorMessage('Por favor selecciona al menos un archivo antes de generar un intent.');
            logger.warn('No hay archivos seleccionados');
            return;
        }
        logger.info(`Archivos seleccionados: ${files.length}`);
        // Validar límite de archivos
        if (files.length > 1000) {
            vscode.window.showErrorMessage(`Has seleccionado ${files.length} archivos. El límite máximo es 1000.`);
            logger.warn(`Límite de archivos excedido: ${files.length}`);
            return;
        }
        // Obtener workspace folder
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('No hay workspace abierto.');
            logger.error('No hay workspace folder');
            return;
        }
        // Convertir URIs a rutas relativas
        const relativePaths = files.map(file => {
            return path.relative(workspaceFolder.uri.fsPath, file.fsPath);
        });
        logger.info(`Rutas relativas: ${relativePaths.join(', ')}`);
        // Abrir formulario de intent
        const formPanel = new intentFormPanel_1.IntentFormPanel(context, logger, workspaceFolder, files, relativePaths);
        formPanel.show();
    });
    context.subscriptions.push(disposable);
    logger.info('Comando "bloom.generateIntent" registrado');
}
//# sourceMappingURL=generateIntent.js.map