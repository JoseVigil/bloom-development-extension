import { IntentFormData } from '../models/intent';

export interface ValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
}

// ✅ Exportar la clase como "Validator" también para compatibilidad
export class IntentValidator {
    private readonly MIN_TEXT_LENGTH = 10;
    private readonly MAX_NAME_LENGTH = 50;
    private readonly MAX_TEXT_LENGTH = 10000;

    validate(data: IntentFormData): ValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];

        this.validateName(data, errors);
        this.validateProblem(data, errors);
        this.validateExpectedOutput(data, errors);
        this.validateBehaviors(data, warnings);
        this.validateConsiderations(data, warnings);
        this.validateFiles(data, errors);

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    private validateName(data: IntentFormData, errors: string[]): void {
        if (!data.name || data.name.trim().length === 0) {
            errors.push('El nombre es obligatorio');
        } else if (data.name.length > this.MAX_NAME_LENGTH) {
            errors.push(`El nombre no puede exceder ${this.MAX_NAME_LENGTH} caracteres`);
        } else if (!/^[a-z0-9-]+$/.test(data.name)) {
            errors.push('El nombre solo puede contener letras minúsculas, números y guiones');
        }
    }

    private validateProblem(data: IntentFormData, errors: string[]): void {
        if (!data.problem || data.problem.trim().length === 0) {
            errors.push('La descripción del problema es obligatoria');
        } else if (data.problem.trim().length < this.MIN_TEXT_LENGTH) {
            errors.push(`El problema debe tener al menos ${this.MIN_TEXT_LENGTH} caracteres`);
        } else if (data.problem.length > this.MAX_TEXT_LENGTH) {
            errors.push(`El problema no puede exceder ${this.MAX_TEXT_LENGTH} caracteres`);
        }
    }

    private validateExpectedOutput(data: IntentFormData, errors: string[]): void {
        if (!data.expectedOutput || data.expectedOutput.trim().length === 0) {
            errors.push('La salida esperada es obligatoria');
        } else if (data.expectedOutput.trim().length < this.MIN_TEXT_LENGTH) {
            errors.push(`La salida esperada debe tener al menos ${this.MIN_TEXT_LENGTH} caracteres`);
        } else if (data.expectedOutput.length > this.MAX_TEXT_LENGTH) {
            errors.push(`La salida esperada no puede exceder ${this.MAX_TEXT_LENGTH} caracteres`);
        }
    }

    private validateBehaviors(data: IntentFormData, warnings: string[]): void {
        if (data.currentBehavior && data.currentBehavior.length > 0) {
            if (data.currentBehavior.some((item: string) => item.trim().length === 0)) {
                warnings.push('Algunos comportamientos actuales están vacíos');
            }
        }

        if (data.desiredBehavior && data.desiredBehavior.length > 0) {
            if (data.desiredBehavior.some((item: string) => item.trim().length === 0)) {
                warnings.push('Algunos comportamientos deseados están vacíos');
            }
        }
    }

    private validateConsiderations(data: IntentFormData, warnings: string[]): void {
        if (data.considerations && data.considerations.trim().length > this.MAX_TEXT_LENGTH) {
            warnings.push(`Las consideraciones son muy largas (máx: ${this.MAX_TEXT_LENGTH} caracteres)`);
        }
    }

    private validateFiles(data: IntentFormData, errors: string[]): void {
        if (!data.selectedFiles || data.selectedFiles.length === 0) {
            errors.push('Debes seleccionar al menos un archivo');
        } else if (data.selectedFiles.length > 1000) {
            errors.push('Has seleccionado demasiados archivos (máximo: 1000)');
        }
    }
}

// ✅ Export alias para compatibilidad con imports existentes
export { IntentValidator as Validator };