// src/utils/nucleusTelemetry.ts
//
// Equivalente TypeScript del patrón Core Layer descrito en
// BLOOM_NUCLEUS_LOGGING_SPEC.md ("_register_log_stream"), adaptado de
// `subprocess.run(["nucleus", "telemetry", "register", ...])` a `spawn`.
//
// REGLA DE ORO DE LA SPEC: nunca modificar telemetry.json directamente.
// Nucleus es el único writer autorizado — este helper solo invoca su CLI.

import { spawn } from 'child_process';

let vscode: typeof import('vscode') | null = null;
try { vscode = require('vscode'); } catch { /* standalone mode */ }

export interface RegisterLogStreamOptions {
    stream: string;          // stream_id — lowercase snake_case, estable, nunca renombrar
    label: string;
    path: string | string[]; // string simple o array (múltiples paths del mismo proceso continuo)
    priority: 1 | 2 | 3;
    categories: string[];    // una o más de: brain, sentinel, nucleus, synapse, conductor, launcher, build, vscode
    source: string;          // qué binario escribe el stream: nucleus, sentinel, brain, conductor, launcher, host, vscode
    description: string;     // obligatorio — quién escribe y qué captura
}

function resolveNucleusExecutable(): string {
    // Mismo criterio de resolución que BrainExecutor.initialize() para brain.executable:
    // env var primero (deploy/CI-friendly), después setting de VS Code, con 'nucleus' como
    // último fallback (asume que está en PATH).
    const envExe = process.env.BLOOM_NUCLEUS_EXE;
    if (envExe) return envExe;

    if (vscode && vscode.workspace && typeof vscode.workspace.getConfiguration === 'function') {
        const config = vscode.workspace.getConfiguration('bloom');
        const configured = config.get<string>('nucleus.executable');
        if (configured) return configured;
    }

    return 'nucleus';
}

/**
 * Registra (o actualiza) un stream de logging en telemetry.json via `nucleus telemetry register`.
 *
 * Fire-and-forget por diseño: si Nucleus no está corriendo (ej. usuario recién instaló
 * la extensión y todavía no bootstrapeó el ecosistema), el registro falla silenciosamente
 * y se loguea un warning — el archivo de log local se sigue escribiendo igual, así que
 * no perdemos datos, solo visibilidad centralizada hasta que Nucleus esté disponible.
 *
 * Llamar una vez por sesión de activación (ver extension.ts), no en cada operación.
 */
export function registerLogStream(options: RegisterLogStreamOptions): Promise<boolean> {
    return new Promise((resolve) => {
        const exe = resolveNucleusExecutable();

        const args: string[] = [
            'telemetry', 'register',
            '--stream', options.stream,
            '--label', options.label,
            '--priority', String(options.priority),
            '--source', options.source,
            '--description', options.description,
        ];

        const paths = Array.isArray(options.path) ? options.path : [options.path];
        for (const p of paths) {
            args.push('--path', p.replace(/\\/g, '/'));
        }

        for (const category of options.categories) {
            args.push('--category', category);
        }

        const proc = spawn(exe, args);

        let stderr = '';
        proc.stderr.on('data', (data) => { stderr += data.toString(); });

        proc.on('close', (code) => {
            if (code === 0) {
                resolve(true);
            } else {
                console.warn(`[nucleusTelemetry] No se pudo registrar el stream '${options.stream}' (exit ${code}): ${stderr.trim()}`);
                resolve(false);
            }
        });

        proc.on('error', (err) => {
            // nucleus no está en PATH / no instalado — no es fatal para la extensión.
            console.warn(`[nucleusTelemetry] Nucleus no disponible para registrar '${options.stream}': ${err.message}`);
            resolve(false);
        });
    });
}
