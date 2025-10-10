import { FileTreeNode } from './types';

/**
 * 拖拽处理器
 * 处理文件树中的拖拽操作
 */
export class DragDropHandler {
  private draggedNode: FileTreeNode | null = null;
  private dropTarget: FileTreeNode | null = null;

  /**
   * 开始拖拽
   */
  handleDragStart(node: FileTreeNode, event: React.DragEvent): void {
    this.draggedNode = node;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', node.path);
    
    // 添加拖拽样式
    const target = event.currentTarget as HTMLElement;
    target.classList.add('dragging');
  }

  /**
   * 拖拽经过
   */
  handleDragOver(node: FileTreeNode, event: React.DragEvent): void {
    event.preventDefault();
    
    // 不能拖拽到自己身上
    if (this.draggedNode && this.draggedNode.path === node.path) {
      return;
    }

    // 只能拖拽到文件夹
    if (node.type !== 'directory') {
      return;
    }

    this.dropTarget = node;
    event.dataTransfer.dropEffect = 'move';
  }

  /**
   * 拖拽进入
   */
  handleDragEnter(node: FileTreeNode, event: React.DragEvent): void {
    if (node.type === 'directory' && this.draggedNode?.path !== node.path) {
      const target = event.currentTarget as HTMLElement;
      target.classList.add('drag-over');
    }
  }

  /**
   * 拖拽离开
   */
  handleDragLeave(event: React.DragEvent): void {
    const target = event.currentTarget as HTMLElement;
    target.classList.remove('drag-over');
  }

  /**
   * 放置
   */
  handleDrop(node: FileTreeNode, event: React.DragEvent, onDrop?: (target: FileTreeNode, source: FileTreeNode) => void): void {
    event.preventDefault();
    
    const target = event.currentTarget as HTMLElement;
    target.classList.remove('drag-over');

    if (this.draggedNode && this.dropTarget && onDrop) {
      onDrop(this.dropTarget, this.draggedNode);
    }

    this.reset();
  }

  /**
   * 拖拽结束
   */
  handleDragEnd(event: React.DragEvent): void {
    const target = event.currentTarget as HTMLElement;
    target.classList.remove('dragging');
    this.reset();
  }

  /**
   * 重置状态
   */
  private reset(): void {
    this.draggedNode = null;
    this.dropTarget = null;
  }
}

export default DragDropHandler;





















