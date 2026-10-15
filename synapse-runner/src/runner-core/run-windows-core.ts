import * as path from 'node:path';
import { assembleWindowsIsolatedRoot, inspectWorkspaceSource } from './windows-isolated-root-assembler';
import { GoWindowsNativePrototype, launchWindowsCorePrototype } from './windows-isolated-launcher';

export async function runWindowsCore(executable: string): Promise<void> {
  inspectWorkspaceSource(executable);
  const helperDir = path.win32.resolve(__dirname, '..', '..', 'native', 'windows-core-isolation');
  const native = new GoWindowsNativePrototype(helperDir);
  // Native ACL readback and restricted-child fixture probes precede any copy.
  const preparedRoot = await native.prepareRoot();
  const assembled = assembleWindowsIsolatedRoot({ executable, preparedRoot });
  const launched = await launchWindowsCorePrototype(native, assembled.root, assembled.executable);
  process.stdout.write(JSON.stringify({ runId: assembled.runId, root: assembled.root, pid: launched.pid }) + '\n');
}

if (require.main === module) {
  const executable = process.argv[2];
  if (!executable) {
    process.stderr.write('usage: run-windows-core <workspace-executable>\n');
    process.exitCode = 2;
  } else {
    runWindowsCore(executable).catch((error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 3;
    });
  }
}
