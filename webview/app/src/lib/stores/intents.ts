import { writable } from 'svelte/store';
import { getIntents, getIntent, createIntentDoc, runExecution } from '$lib/api';

interface Intent {
  id: string;
  type: 'DEV' | 'DOC';
  title: string;
  profile: string;
  project: string;
  derivedFrom?: string;
  status: string;
  briefing: {
    problem: string;
    expectedOutput: string;
    currentBehavior: string;
    desiredBehavior: string;
    considerations: string;
  };
  questions: Array<{ label: string; answer: string }>;
  turns?: any[];
  briefingSummary?: string;
}

interface IntentsState {
  list: Intent[];
  current: Intent | null;
  wizardState: 'briefing' | 'questions' | 'refinement';
}

function createIntentsStore() {
  const { subscribe, set, update } = writable<IntentsState>({
    list: [],
    current: null,
    wizardState: 'briefing'
  });

  return {
    subscribe,
    
    async load() {
      try {
        const intents = await getIntents();
        update(state => ({ ...state, list: intents }));
      } catch (error) {
        console.error('Failed to load intents:', error);
      }
    },
    
    async loadIntent(id: string) {
      try {
        const intent = await getIntent(id);
        update(state => ({ ...state, current: intent }));
      } catch (error) {
        console.error('Failed to load intent:', error);
      }
    },
    
    createNew() {
      const newIntent: Intent = {
        id: 'new',
        type: 'DOC',
        title: 'New Intent',
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
        turns: []
      };
      update(state => ({ ...state, current: newIntent, wizardState: 'briefing' }));
    },
    
    setWizardState(wizardState: 'briefing' | 'questions' | 'refinement') {
      update(state => ({ ...state, wizardState }));
    },
    
    async execute(intentId: string) {
      try {
        const result = await runExecution(intentId, {});
        // Update state with result
        console.log('Execution result:', result);
      } catch (error) {
        console.error('Execution failed:', error);
        throw error;
      }
    },
    
    async finalize(intentId: string) {
      // Finalize intent
      console.log('Finalizing intent:', intentId);
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
          id: Date.now(),
          actor: 'AI',
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