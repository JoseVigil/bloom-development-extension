import * as vscode from 'vscode';
import * as path from 'path';
import { IntentFormData } from '../ui/intentFormPanel';

export class Validator {
    private readonly INVALID_CHARS = /[\/\\:*?"<>|]/;
    private readonly MAX_NAME_LENGTH = 100;
    private readonly MIN_TEXT_LENGTH = 10;

    validateIntentForm(data: IntentFormData, workspaceFolder: vscode.WorkspaceFolder): string[] {
        const errors: string[] = [];

        // Validar nombre
        if (!data.name || data.name.trim().length === 0) {
            errors.push('El nombre del intent es obligatorio');
        } else if (this.INVALID_CHARS.test(data.name)) {
            errors.push('El nombre del intent no puede contener caracteres especiales: / \\ : * ? " < > |');
        } else if (data.name.length > this.MAX_NAME_LENGTH) {
            errors.push(`El nombre del intent no puede exceder ${this.MAX_NAME_LENGTH} caracteres`);
        } else {
            // Verificar que no existe carpeta con ese nombre
            const intentPath = path.join(workspaceFolder.uri.fsPath, '.bloom', 'intents', data.name);
            try {
                const fs = require('fs');
                if (fs.existsSync(intentPath)) {
                    errors.push(`Ya existe una carpeta con el nombre "${data.name}" en intents/`);
                }
            } catch (error) {
                // Si hay error al verificar, continuar
            }
        }

        // Validar problema
        if (!data.problem || data.problem.trim().length === 0) {
            errors.push('El campo "Problema" es obligatorio');
        } else if (data.problem.trim().length < this.MIN_TEXT_LENGTH) {
            errors.push(`El campo "Problema" debe tener al menos ${this.MIN_TEXT_LENGTH} caracteres`);
        }

        // Validar contexto
        if (!data.context || data.context.trim().length === 0) {
            errors.push('El campo "Contexto" es obligatorio');
        } else if (data.context.trim().length < this.MIN_TEXT_LENGTH) {
            errors.push(`El campo "Contexto" debe tener al menos ${this.MIN_TEXT_LENGTH} caracteres`);
        }

        // Validar comportamiento actual
        if (!data.currentBehavior || data.currentBehavior.length === 0) {
            errors.push('Debes agregar al menos un comportamiento actual');
        } else if (data.currentBehavior.some(item => item.trim().length === 0)) {
            errors.push('Todos los items de comportamiento actual deben tener contenido');
        }

        // Validar comportamiento deseado
        if (!data.desiredBehavior || data.desiredBehavior.length === 0) {
            errors.push('Debes agregar al menos un comportamiento deseado');
        } else if (data.desiredBehavior.some(item => item.trim().length === 0)) {
            errors.push('Todos los items de comportamiento deseado deben tener contenido');
        }

        // Validar objetivo
        if (!data.objective || data.objective.trim().length === 0) {
            errors.push('El campo "Objetivo" es obligatorio');
        } else if (data.objective.trim().length < this.MIN_TEXT_LENGTH) {
            errors.push(`El campo "Objetivo" debe tener al menos ${this.MIN_TEXT_LENGTH} caracteres`);
        }

        // Validar salida esperada
        if (!data.expectedOutput || data.expectedOutput.trim().length === 0) {
            errors.push('El campo "Salida Esperada del Modelo" es obligatorio');
        } else if (data.expectedOutput.trim().length < this.MIN_TEXT_LENGTH) {
            errors.push(`El campo "Salida Esperada del Modelo" debe tener al menos ${this.MIN_TEXT_LENGTH} caracteres`);
        }

        // Validar listas opcionales (si tienen items, no deben estar vacíos)
        if (data.scope && data.scope.length > 0) {
            if (data.scope.some(item => item.trim().length === 0)) {
                errors.push('Los items de alcance y restricciones no pueden estar vacíos');
            }
        }

        if (data.tests && data.tests.length > 0) {
            if (data.tests.some(item => item.trim().length === 0)) {
                errors.push('Los items de tests/validación no pueden estar vacíos');
            }
        }

        return errors;
    }

    sanitizeFileName(name: string): string {
        return name.replace(this.INVALID_CHARS, '-').toLowerCase();
    }
}