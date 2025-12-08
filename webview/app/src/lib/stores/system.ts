import { writable } from 'svelte/store';
import type { SystemStatus } from '../types';

export const systemStatus = writable<SystemStatus>({
  plugin: false,
  host: false,
  extension: false
});