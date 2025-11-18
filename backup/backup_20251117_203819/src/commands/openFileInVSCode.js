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
exports.registerOpenFileInVSCode = registerOpenFileInVSCode;
const vscode = __importStar(require("vscode"));
function registerOpenFileInVSCode(context, logger) {
    const disposable = vscode.commands.registerCommand('bloom.openFileInVSCode', async (fileUri) => {
        logger.info(`Abriendo archivo en VSCode: ${fileUri.fsPath}`);
        try {
            const document = await vscode.workspace.openTextDocument(fileUri);
            await vscode.window.showTextDocument(document, {
                viewColumn: vscode.ViewColumn.Two,
                preserveFocus: false
            });
        }
        catch (error) {
            vscode.window.showErrorMessage(`Error abriendo archivo: ${error}`);
            logger.error('Error abriendo archivo', error);
        }
    });
    context.subscriptions.push(disposable);
    logger.info('Comando "bloom.openFileInVSCode" registrado');
}
//# sourceMappingURL=openFileInVSCode.js.map