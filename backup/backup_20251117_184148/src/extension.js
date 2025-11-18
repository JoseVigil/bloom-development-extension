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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const openMarkdownPreview_1 = require("./commands/openMarkdownPreview");
const generateIntent_1 = require("./commands/generateIntent");
const openIntent_1 = require("./commands/openIntent");
const copyContextToClipboard_1 = require("./commands/copyContextToClipboard");
const deleteIntent_1 = require("./commands/deleteIntent");
const logger_1 = require("./utils/logger");
const metadataManager_1 = require("./core/metadataManager");
const contextGatherer_1 = require("./core/contextGatherer");
const tokenEstimator_1 = require("./core/tokenEstimator");
const intentTreeProvider_1 = require("./providers/intentTreeProvider");
function activate(context) {
    const logger = new logger_1.Logger();
    logger.info('Bloom plugin v2.0 activado');
    const metadataManager = new metadataManager_1.MetadataManager(logger);
    const contextGatherer = new contextGatherer_1.ContextGatherer(logger);
    const tokenEstimator = new tokenEstimator_1.TokenEstimator();
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
        const intentTreeProvider = new intentTreeProvider_1.IntentTreeProvider(workspaceFolder, logger, metadataManager);
        vscode.window.registerTreeDataProvider('bloomIntents', intentTreeProvider);
        (0, openIntent_1.registerOpenIntent)(context, logger, metadataManager);
        (0, copyContextToClipboard_1.registerCopyContextToClipboard)(context, logger, contextGatherer, tokenEstimator);
        (0, deleteIntent_1.registerDeleteIntent)(context, logger, intentTreeProvider);
    }
    (0, openMarkdownPreview_1.registerOpenMarkdownPreview)(context, logger);
    (0, generateIntent_1.registerGenerateIntent)(context, logger);
    logger.info('Todos los comandos registrados exitosamente');
}
function deactivate() { }
//# sourceMappingURL=extension.js.map