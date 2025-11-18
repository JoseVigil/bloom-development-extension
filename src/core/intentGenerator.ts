import * as vscode from 'vscode';
import { IntentFormData } from '../models/intent';
import { Logger } from '../utils/logger';

export class IntentGenerator {
    constructor(private logger: Logger) {}

    async generateIntent(
        data: IntentFormData,
        files: string[],
        outputPath: vscode.Uri
    ): Promise<void> {
        this.logger.info('Generando intent.bl');

        let content = this.generateHeader(data);
        content += this.generateProblem(data);
        content += this.generateCurrentBehavior(data);
        content += this.generateDesiredBehavior(data);
        content += this.generateExpectedOutput(data);
        content += this.generateConsiderations(data);
        content += this.generateFilesList(files);
        content += this.generateFooter();

        await vscode.workspace.fs.writeFile(
            outputPath,
            new TextEncoder().encode(content)
        );

        this.logger.info('intent.bl generado exitosamente');
    }

    private generateHeader(data: IntentFormData): string {
        return `# ${data.name}\n\n` +
               `**Generado:** ${new Date().toLocaleString()}\n` +
               `**Bloom Version:** 1.0.0\n\n` +
               `---\n\n`;
    }

    private generateProblem(data: IntentFormData): string {
        return `## Problema\n${data.problem}\n\n`;
    }

    private generateCurrentBehavior(data: IntentFormData): string {
        if (!data.currentBehavior || data.currentBehavior.length === 0) {
            return '';
        }

        let section = `## Comportamiento Actual\n\n`;
        data.currentBehavior.forEach((item: string, index: number) => {
            section += `${index + 1}. ${item}\n`;
        });
        section += `\n`;

        return section;
    }

    private generateDesiredBehavior(data: IntentFormData): string {
        if (!data.desiredBehavior || data.desiredBehavior.length === 0) {
            return '';
        }

        let section = `## Comportamiento Deseado\n\n`;
        data.desiredBehavior.forEach((item: string, index: number) => {
            section += `${index + 1}. ${item}\n`;
        });
        section += `\n`;

        return section;
    }

    private generateExpectedOutput(data: IntentFormData): string {
        return `## Salida Esperada del Modelo\n${data.expectedOutput}\n\n`;
    }

    private generateConsiderations(data: IntentFormData): string {
        if (!data.considerations || data.considerations.trim().length === 0) {
            return '';
        }

        return `## Consideraciones\n${data.considerations}\n\n`;
    }

    private generateFilesList(files: string[]): string {
        let section = `## Archivos Incluidos\n\n`;
        section += `Total: ${files.length} archivo(s)\n\n`;

        files.forEach(file => {
            section += `- \`${file}\`\n`;
        });

        section += `\n`;
        return section;
    }

    private generateFooter(): string {
        return `---\n\n` +
               `**Nota:** Este archivo fue generado automáticamente por Bloom.\n` +
               `Para más información, consulta la documentación en codebase.md\n`;
    }
}