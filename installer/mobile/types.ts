
export interface AppFeature {
  title: string;
  description: string;
  complexity: 'Low' | 'Medium' | 'High';
}

export interface TechStack {
  platform: string;
  framework: string;
  language: string;
  networking: string;
  security: string;
  pros: string[];
}

export interface ProjectSpec {
  name: string;
  description: string;
  mythology: string;
  features: AppFeature[];
  techStacks: TechStack[];
  integrationDetails: {
    restPort: string;
    wsPort: string;
    authMethod: string;
  };
  roadmap: {
    phase: string;
    tasks: string[];
  }[];
}
