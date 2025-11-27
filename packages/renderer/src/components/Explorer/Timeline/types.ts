export interface TimelineItem {
  id: string;
  label: string;
  description?: string;
  timestamp: number;
  source: string; // 'git', 'local-history', etc.
  icon?: string;
  detail?: string;
  relativeTime?: string;
  contextValue?: string;
}

export interface TimelineAction {
  id: string;
  icon: string;
  tooltip: string;
  onClick: () => void;
}

export interface TimelineFilter {
  source?: string[];
  dateRange?: {
    start: Date;
    end: Date;
  };
}





















