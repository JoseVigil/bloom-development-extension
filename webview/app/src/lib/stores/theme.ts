import { writable } from 'svelte/store';

export const theme = writable<'light' | 'dark'>('dark');

if (typeof window !== 'undefined') {
  theme.subscribe(value => {
    document.documentElement.classList.toggle('dark', value === 'dark');
    document.documentElement.classList.toggle('light', value === 'light');
  });
}