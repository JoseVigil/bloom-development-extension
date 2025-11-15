import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { IntentFormData } from '../ui/intentFormPanel';

export class IntentGenerator {
    constructor(private logger: Logger) {}

    async generateIntent(
        data: IntentFormData,
        filePaths: string[],
        outputPath: vscode.Uri
    ): Promise<void> {
        this.logger.info(`Generando intent.bl en ${outputPath.fsPath}`);

        try {
            const content = this.buildIntentContent(data, filePaths);
            const contentBytes = new TextEncoder().encode(content);
            
            await vscode.workspace.fs.writeFile(outputPath, contentBytes);
            
            this.logger.info('intent.bl generado exitosamente');
        } catch (error) {
            this.logger.error('Error al generar intent.bl', error as Error);
            throw error;
        }
    }

    private buildIntentContent(data: IntentFormData, filePaths: string[]): string {
        let content = `# INTENT - ${data.name}\n\n`;

        // Problema
        content += `## Problema\n${data.problem}\n\n`;

        // Contexto
        content += `## Contexto\n${data.context}\n\n`;

        // Comportamiento Actual
        content += `## Comportamiento Actual\n`;
        data.currentBehavior.forEach((item, index) => {
            content += `${index + 1}. ${item}\n`;
        });
        content += '\n';

        // Comportamiento Deseado
        content += `## Comportamiento Deseado\n`;
        data.desiredBehavior.forEach((item, index) => {
            content += `${index + 1}. ${item}\n`;
        });
        content += '\n';

        // Objetivo
        content += `## Objetivo\n${data.objective}\n\n`;

        // Archivos incluidos
        content += `## Archivos incluidos en codebase.tar.gz\n`;
        filePaths.forEach(filePath => {
            content += `- ${filePath}\n`;
        });
        content += '\n';

        // Alcance y Restricciones
        if (data.scope && data.scope.length > 0) {
            content += `## Alcance y Restricciones\n`;
            data.scope.forEach(item => {
                content += `- ${item}\n`;
            });
            content += '\n';
        } else {
            content += `## Alcance y Restricciones\nNo especificado\n\n`;
        }

        // Hipótesis / Consideraciones
        if (data.considerations && data.considerations.trim().length > 0) {
            content += `## Hipótesis / Consideraciones\n${data.considerations}\n\n`;
        } else {
            content += `## Hipótesis / Consideraciones\nNo especificado\n\n`;
        }

        // Tests / Validación
        if (data.tests && data.tests.length > 0) {
            content += `## Tests / Validación Necesaria\n`;
            data.tests.forEach(item => {
                content += `- [ ] ${item}\n`;
            });
            content += '\n';
        } else {
            content += `## Tests / Validación Necesaria\nNo especificado\n\n`;
        }

        // Salida Esperada
        content += `## Salida Esperada del Modelo\n${data.expectedOutput}\n\n`;

        // Footer
        content += `---\nbloom/v1\nincludes_archive: "codebase.tar.gz"\n`;

        return content;
    }
}