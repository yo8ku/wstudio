/**
 * EditorArea 模块导出
 * 功能：统一管理编辑器相关组件的导出
 * 描述：提供模块化的导出接口，便于其他模块引用
 */

export { MonacoEditor } from './MonacoEditor';
export { MonacoContextMenu } from './MonacoContextMenu';
export { useMonacoContextMenu } from './useMonacoContextMenu';
export { GhostTextWidget } from './GhostTextWidget';
export { AIZoneWidget } from './AIZoneWidget';
export type { MenuItem, MenuGroup } from './MonacoContextMenu';

// 主编辑器区域组件
export { EditorArea } from './EditorArea';
export { EditorGroup } from './EditorGroup';

