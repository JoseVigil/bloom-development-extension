export interface SystemStatus {
  plugin: boolean;
  host: boolean;
  extension: boolean;
}

export interface Nucleus {
  id: string;
  name: string;
}

export interface Project {
  id: string;
  name: string;
  nucleusId: string;
}