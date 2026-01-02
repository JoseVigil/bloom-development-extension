import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

export function resolveBloomPython(): string {
  const home = os.homedir();

  const pythonPath =
    process.platform === 'win32'
      ? path.join(
          home,
          'AppData',
          'Local',
          'BloomNucleus',
          'engine',
          'runtime',
          'python.exe'
        )
      : path.join(
          home,
          'Library',
          'Application Support',
          'BloomNucleus',
          'engine',
          'runtime',
          'bin',
          'python3'
        );

  if (!fs.existsSync(pythonPath)) {
    throw new Error(
      `Bloom Python runtime not found at expected path: ${pythonPath}`
    );
  }

  return pythonPath;
}
