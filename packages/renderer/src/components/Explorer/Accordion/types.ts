import type { ReactNode } from 'react';

export interface AccordionSectionProps {
  title: string;
  icon?: ReactNode;
  defaultExpanded?: boolean;
  actions?: AccordionAction[];
  children: React.ReactNode;
  onExpandChange?: (expanded: boolean) => void;
  resizable?: boolean;
  defaultHeight?: number;
  minHeight?: number;
  maxHeight?: number;
  onHeightChange?: (height: number) => void;
  flexGrow?: boolean;
  showResizeHandle?: boolean;
}

export interface AccordionAction {
  id: string;
  icon: ReactNode;
  tooltip: string;
  onClick: () => void;
}
