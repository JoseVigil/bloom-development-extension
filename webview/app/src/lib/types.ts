export interface FeedEntry {
  id: string;
  category: string;
  event: string;
  data: Record<string, any>;
  profile_id: string | null;
  timestamp: number;
  level: 'info' | 'success' | 'warn' | 'error';
}
