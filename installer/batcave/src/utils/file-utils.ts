// File utilities
// TODO: Implement common file operations

import { access, mkdir, readFile, writeFile } from 'fs/promises';
import { constants } from 'fs';

export async function ensureDirectory(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function readJsonFile<T>(filePath: string): Promise<T> {
  const content = await readFile(filePath, 'utf-8');
  return JSON.parse(content);
}

export async function writeJsonFile<T>(filePath: string, data: T): Promise<void> {
  await writeFile(filePath, JSON.stringify(data, null, 2));
}
