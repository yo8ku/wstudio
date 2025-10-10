export interface AccordionSectionProps {
  title: string;
  icon?: string;
  defaultExpanded?: boolean;
  actions?: AccordionAction[];
  children: React.ReactNode;
  onExpandChange?: (expanded: boolean) => void;
  resizable?: boolean;
  defaultHeight?: number;
  minHeight?: number;
  maxHeight?: number;
  onHeightChange?: (height: number) => void;
  flexGrow?: boolean; // 是否自动占据剩余空间（用于文件树）
  showResizeHandle?: boolean; // 是否显示拖动手柄（默认为 true）
}

export interface AccordionAction {
  id: string;
  icon: string;
  tooltip: string;
  onClick: () => void;
}

