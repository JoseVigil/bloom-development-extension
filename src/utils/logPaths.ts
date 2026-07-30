// src/utils/logPaths.ts
//
// Resuelve el directorio base de logs del ecosistema BloomNucleus, siguiendo
// la misma convención que usan brain/nucleus/sentinel/conductor:
//   <base_data_dir>/BloomNucleus/logs/<subsistema>/<subfolder>/
//
// Ver telemetry.json para ejemplos reales de paths ya en uso:
//   Linux:  /home/<user>/.local/share/BloomNucleus/logs/...
//
// Prioridad de resolución:
//   1. Variable de entorno BLOOM_LOGS_DIR (override explícito, útil en dev/testing)
//   2. Setting de VS Code `bloom.logsDir`
//   3. Default por plataforma (XDG_DATA_HOME en Linux, APPDATA en Windows, ~/Library/Application Support en macOS)

import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

let vscode: typeof import('vscode') | null = null;
try { vscode = require('vscode'); } catch { /* standalone mode, igual que en brainExecutor.ts */ }

function resolvePlatformDefaultDataDir(): string {
    const home = os.homedir();

    switch (process.platform) {
        case 'win32':
            // %LOCALAPPDATA% es lo que usa el resto del stack Go/Python para BloomNucleus
            return process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
        case 'darwin':
            return path.join(home, 'Library', 'Application Support');
        default:
            // Linux — respeta XDG_DATA_HOME si está seteado, si no ~/.local/share
            return process.env.XDG_DATA_HOME || path.join(home, '.local', 'share');
    }
}

/**
 * Devuelve el directorio raíz de logs: <data_dir>/BloomNucleus/logs
 * Lo crea si no existe (igual que hace `_get_log_path` en el patrón Python de la spec).
 */
export function resolveBaseLogsDir(): string {
    let base: string | undefined = process.env.BLOOM_LOGS_DIR;

    if (!base && vscode && vscode.workspace && typeof vscode.workspace.getConfiguration === 'function') {
        const config = vscode.workspace.getConfiguration('bloom');
        base = config.get<string>('logsDir') || undefined;
    }

    if (!base) {
        base = path.join(resolvePlatformDefaultDataDir(), 'BloomNucleus', 'logs');
    }

    return base;
}

/**
 * Devuelve el path completo del archivo de log de hoy para un módulo del
 * ecosistema `brain`, siguiendo la convención obligatoria de la spec:
 *   logs/brain/<subfolder>/brain_<modulo>_YYYYMMDD.log
 *
 * Usar solo para componentes que efectivamente viven dentro de brain/.
 */
export function getDailyLogPath(subfolder: string, moduleName: string): string {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD en UTC
    const logDir = path.join(resolveBaseLogsDir(), 'brain', subfolder);

    fs.mkdirSync(logDir, { recursive: true });

    return path.join(logDir, `brain_${moduleName}_${dateStr}.log`);
}

/**
 * Devuelve el path completo del archivo de log de hoy para un grupo/módulo
 * TOP-LEVEL, independiente del ecosistema `brain` (ej. la extensión de VS Code,
 * que es su propia aplicación, no un submódulo de brain):
 *   logs/<group>/<moduleName>_YYYYMMDD.log
 *
 * Crea el directorio si no existe.
 */
export function getDailyLogPathForGroup(group: string, moduleName: string): string {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD en UTC
    const logDir = path.join(resolveBaseLogsDir(), group);

    fs.mkdirSync(logDir, { recursive: true });

    return path.join(logDir, `${moduleName}_${dateStr}.log`);
}
