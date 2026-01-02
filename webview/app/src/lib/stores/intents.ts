import { writable } from 'svelte/store';
import { listIntents, getIntent, createIntent, finalizeIntent } from '$lib/api';

interface Intent {
  id: string;
  type: 'dev' | 'doc';
  name: string;
  profile?: string;
  project?: string;
  derivedFrom?: string;
  status: string;
  briefing?: {
    problem: string;
    expectedOutput: string;
    currentBehavior: string;
    desiredBehavior: string;
    considerations: string;
  };
  questions?: Array<{ label: string; answer: string }>;
  turns?: any[];
  briefingSummary?: string;
  files?: string[];
}

interface IntentsState {
  list: Intent[];
  current: Intent | null;
  wizardState: 'briefing' | 'questions' | 'refinement';
  nucleusPath: string;
}

function createIntentsStore() {
  const { subscribe, set, update } = writable<IntentsState>({
    list: [],
    current: null,
    wizardState: 'briefing',
    nucleusPath: '' // Debe ser configurado por el usuario
  });

  return {
    subscribe,
    
    setNucleusPath(path: string) {
      update(state => ({ ...state, nucleusPath: path }));
    },
    
    async load(nucleusPath?: string) {
      try {
        let path = nucleusPath;
        if (!path) {
          // Obtener el path del estado
          const state = await new Promise<IntentsState>(resolve => {
            const unsubscribe = subscribe(s => {
              unsubscribe();
              resolve(s);
            });
          });
          path = state.nucleusPath;
        }
        
        if (!path) {
          console.warn('No nucleus path provided');
          return [];
        }
        
        const result = await listIntents(path);
        const intents = result.intents || [];
        update(state => ({ ...state, list: intents }));
        return intents;
      } catch (error) {
        console.error('Failed to load intents:', error);
        return [];
      }
    },
    
    async loadIntent(id: string, nucleusPath: string) {
      try {
        const intent = await getIntent(id, nucleusPath);
        update(state => ({ ...state, current: intent }));
      } catch (error) {
        console.error('Failed to load intent:', error);
      }
    },
    
    createNew() {
      const newIntent: Intent = {
        id: 'new',
        type: 'doc',
        name: 'New Intent',
        profile: 'main',
        project: '',
        status: 'draft',
        briefing: {
          problem: '',
          expectedOutput: '',
          currentBehavior: '',
          desiredBehavior: '',
          considerations: ''
        },
        questions: [
          { label: 'Question 1', answer: '' },
          { label: 'Question 2', answer: '' },
          { label: 'Question 3', answer: '' },
          { label: 'Question 4', answer: '' },
          { label: 'Question 5', answer: '' }
        ],
        turns: [],
        files: []
      };
      update(state => ({ ...state, current: newIntent, wizardState: 'briefing' }));
    },
    
    setWizardState(wizardState: 'briefing' | 'questions' | 'refinement') {
      update(state => ({ ...state, wizardState }));
    },
    
    async execute(intentId: string, nucleusPath: string) {
      try {
        // Por ahora solo retornamos un mensaje, ya que runExecution no existe en la API
        console.log('Execution started for intent:', intentId);
        // Aquí podrías usar lockIntent y addIntentTurn si es necesario
        return { status: 'started' };
      } catch (error) {
        console.error('Execution failed:', error);
        throw error;
      }
    },
    
    async finalize(intentId: string, nucleusPath: string) {
      try {
        await finalizeIntent(intentId, nucleusPath);
        console.log('Intent finalized:', intentId);
      } catch (error) {
        console.error('Finalization failed:', error);
        throw error;
      }
    },
    
    async addTurn(intentId: string, turn: any) {
      update(state => {
        if (state.current && state.current.id === intentId) {
          return {
            ...state,
            current: {
              ...state.current,
              turns: [...(state.current.turns || []), turn]
            }
          };
        }
        return state;
      });
      
      // Simulate AI response
      setTimeout(() => {
        const aiTurn = {
          id: Date.now().toString(),
          actor: 'ai',
          content: 'Processing your request...',
          timestamp: new Date().toISOString()
        };
        update(state => {
          if (state.current && state.current.id === intentId) {
            return {
              ...state,
              current: {
                ...state.current,
                turns: [...(state.current.turns || []), aiTurn]
              }
            };
          }
          return state;
        });
      }, 1000);
    }
  };
}

export const intentsStore = createIntentsStore();