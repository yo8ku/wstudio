import { FileTreeNode } from './types';

/**
 * 键盘处理器
 * 处理文件树中的键盘操作
 */
export class KeyboardHandler {
  /**
   * 处理键盘事件
   */
  handleKeyDown(
    event: React.KeyboardEvent,
    selectedNode: FileTreeNode | null,
    callbacks: {
      onEnter?: (node: FileTreeNode) => void;
      onDelete?: (node: FileTreeNode) => void;
      onRename?: (node: FileTreeNode) => void;
      onArrowUp?: () => void;
      onArrowDown?: () => void;
      onArrowLeft?: (node: FileTreeNode) => void;
      onArrowRight?: (node: FileTreeNode) => void;
    }
  ): void {
    if (!selectedNode) return;

    switch (event.key) {
      case 'Enter':
        event.preventDefault();
        callbacks.onEnter?.(selectedNode);
        break;

      case 'Delete':
      case 'Backspace':
        event.preventDefault();
        callbacks.onDelete?.(selectedNode);
        break;

      case 'F2':
        event.preventDefault();
        callbacks.onRename?.(selectedNode);
        break;

      case 'ArrowUp':
        event.preventDefault();
        callbacks.onArrowUp?.();
        break;

      case 'ArrowDown':
        event.preventDefault();
        callbacks.onArrowDown?.();
        break;

      case 'ArrowLeft':
        event.preventDefault();
        callbacks.onArrowLeft?.(selectedNode);
        break;

      case 'ArrowRight':
        event.preventDefault();
        callbacks.onArrowRight?.(selectedNode);
        break;

      default:
        break;
    }
  }

  /**
   * 获取可见节点列表（用于上下导航）
   */
  getVisibleNodes(rootNode: FileTreeNode): FileTreeNode[] {
    const visible: FileTreeNode[] = [];
    
    const traverse = (node: FileTreeNode) => {
      visible.push(node);
      if (node.type === 'directory' && node.isExpanded && node.children) {
        node.children.forEach(traverse);
      }
    };

    if (rootNode.children) {
      rootNode.children.forEach(traverse);
    }

    return visible;
  }

  /**
   * 获取下一个节点
   */
  getNextNode(currentNode: FileTreeNode, visibleNodes: FileTreeNode[]): FileTreeNode | null {
    const currentIndex = visibleNodes.findIndex(n => n.path === currentNode.path);
    if (currentIndex < visibleNodes.length - 1) {
      return visibleNodes[currentIndex + 1];
    }
    return null;
  }

  /**
   * 获取上一个节点
   */
  getPreviousNode(currentNode: FileTreeNode, visibleNodes: FileTreeNode[]): FileTreeNode | null {
    const currentIndex = visibleNodes.findIndex(n => n.path === currentNode.path);
    if (currentIndex > 0) {
      return visibleNodes[currentIndex - 1];
    }
    return null;
  }
}

export default KeyboardHandler;


