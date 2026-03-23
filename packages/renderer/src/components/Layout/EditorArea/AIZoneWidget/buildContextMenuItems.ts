/**
 * AIZoneWidget 上下文菜单构建兼容层。
 * 复用当前 AIInput 目录下的菜单构建实现，保持旧版内联聊天导入路径不变。
 */

export {
  buildContextMenuItems,
  buildLevel1MenuItems,
  buildLevel2MenuItems,
} from '../AIInput/buildContextMenuItems';
