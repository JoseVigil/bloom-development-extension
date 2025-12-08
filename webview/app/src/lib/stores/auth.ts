import { writable } from 'svelte/store';

export const githubAuthenticated = writable<boolean>(false);
export const geminiToken = writable<string | null>(null);