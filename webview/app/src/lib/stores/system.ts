import { writable } from 'svelte/store';

export interface SystemStatus {
  plugin: boolean;
  host: boolean;
  extension: boolean;
  profiles?: any[];
  accounts?: any[];
}

function createSystemStore() {
  const { subscribe, set, update } = writable<SystemStatus>({
    plugin: false,
    host: false,
    extension: false,
    profiles: [],
    accounts: []
  });

  return {
    subscribe,
    set,
    update,
    setProfiles: (profiles: any[]) => update(s => ({ ...s, profiles })),
    setAccounts: (accounts: any[]) => update(s => ({ ...s, accounts }))
  };
}

export const systemStatus = createSystemStore();