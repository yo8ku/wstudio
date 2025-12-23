/**
 * 行装饰器扩展
 * 功能：
 * 1. 在光标所在行的左侧显示拖拽手柄装饰器
 * 2. 点击装饰器弹出上下文菜单（转换格式、删除、复制、剪切、缩进等）
 * 3. 折叠/展开功能
 */

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet, EditorView } from '@tiptap/pm/view';
import { Node as ProseMirrorNode } from '@tiptap/pm/model';

export interface LineDecoratorOptions {
  className: string;
}

export const LineDecoratorPluginKey = new PluginKey('lineDecorator');

/**
 * 全局折叠状态存储（存储节点的结束位置，用于查找子内容）
 */
export const foldedNodeEnds = new Map<number, number>();

/**
 * 存储 EditorView 引用，用于触发更新
 */
let editorViewRef: EditorView | null = null;

/**
 * 获取 EditorView 引用
 */
export function getEditorViewRef(): EditorView | null {
  return editorViewRef;
}

/**
 * 当前显示的菜单元素
 */
let currentMenu: HTMLElement | null = null;

/**
 * 拖拽状态
 */
interface DragState {
  isDragging: boolean;
  nodePos: number;
  nodeSize: number;
  startY: number;
  dragIndicator: HTMLElement | null;
  targetPos: number | null;
  highlightOverlay: HTMLElement | null;
}

let dragState: DragState = {
  isDragging: false,
  nodePos: 0,
  nodeSize: 0,
  startY: 0,
  dragIndicator: null,
  targetPos: null,
  highlightOverlay: null,
};

/**
 * 可以作为"子内容"的块级元素类型
 */
const CHILD_CONTENT_TYPES = [
  'bulletList',
  'orderedList',
  'taskList',
  'blockquote',
  'codeBlock',
];

/**
 * 检查节点是否为可作为子内容的块级元素
 */
function isChildContentBlock(node: ProseMirrorNode): boolean {
  return CHILD_CONTENT_TYPES.includes(node.type.name);
}

/**
 * 检查节点文本是否以缩进开头（制表符或空格）
 */
function hasIndent(node: ProseMirrorNode): boolean {
  const text = node.textContent;
  return text.startsWith('\t') || text.startsWith('  ');
}

/**
 * 获取当前节点后面有缩进的连续节点
 */
function getIndentedContent(
  doc: ProseMirrorNode,
  nodeEndPos: number
): { hasIndented: boolean; indentedPositions: Array<{ start: number; end: number }> } {
  const $pos = doc.resolve(nodeEndPos);
  const parentNode = $pos.parent;
  const indexAfter = $pos.indexAfter();
  const indentedPositions: Array<{ start: number; end: number }> = [];

  let currentIndex = indexAfter;
  let currentPos = nodeEndPos;

  while (currentIndex < parentNode.childCount) {
    const nextNode = parentNode.child(currentIndex);

    // 检查节点是否有缩进
    if (hasIndent(nextNode)) {
      indentedPositions.push({
        start: currentPos,
        end: currentPos + nextNode.nodeSize,
      });
      currentPos += nextNode.nodeSize;
      currentIndex++;
    } else {
      break;
    }
  }

  return {
    hasIndented: indentedPositions.length > 0,
    indentedPositions,
  };
}

/**
 * 检查当前节点后面是否有子内容，并返回子内容的位置信息
 */
function getFollowingChildContent(
  doc: ProseMirrorNode,
  nodeEndPos: number
): { hasChild: boolean; childPositions: Array<{ start: number; end: number }> } {
  const $pos = doc.resolve(nodeEndPos);
  const parentNode = $pos.parent;
  const indexAfter = $pos.indexAfter();
  const childPositions: Array<{ start: number; end: number }> = [];

  let currentIndex = indexAfter;
  let currentPos = nodeEndPos;

  while (currentIndex < parentNode.childCount) {
    const nextNode = parentNode.child(currentIndex);

    if (isChildContentBlock(nextNode)) {
      childPositions.push({
        start: currentPos,
        end: currentPos + nextNode.nodeSize,
      });
      currentPos += nextNode.nodeSize;
      currentIndex++;
    } else {
      break;
    }
  }

  return {
    hasChild: childPositions.length > 0,
    childPositions,
  };
}

/**
 * 获取标题下的所有内容（直到遇到同级或更高级别的标题）
 */
function getHeadingContent(
  doc: ProseMirrorNode,
  headingPos: number,
  headingLevel: number
): { hasContent: boolean; contentPositions: Array<{ start: number; end: number }> } {
  const contentPositions: Array<{ start: number; end: number }> = [];
  let foundHeading = false;
  let stopCollecting = false;

  doc.forEach((node, pos) => {
    if (stopCollecting) return;

    if (pos === headingPos) {
      foundHeading = true;
      return;
    }

    if (foundHeading) {
      // 遇到同级或更高级别的标题时停止
      if (node.type.name === 'heading') {
        const level = node.attrs.level as number;
        if (level <= headingLevel) {
          stopCollecting = true;
          return;
        }
      }

      contentPositions.push({
        start: pos,
        end: pos + node.nodeSize,
      });
    }
  });

  return {
    hasContent: contentPositions.length > 0,
    contentPositions,
  };
}

/**
 * 切换折叠状态
 */
export function toggleFold(nodeStart: number, nodeEnd: number): void {
  if (foldedNodeEnds.has(nodeStart)) {
    foldedNodeEnds.delete(nodeStart);
  } else {
    foldedNodeEnds.set(nodeStart, nodeEnd);
  }

  if (editorViewRef) {
    const tr = editorViewRef.state.tr.setMeta(LineDecoratorPluginKey, { update: true });
    editorViewRef.dispatch(tr);
  }
}

/**
 * 检查节点是否已折叠
 */
export function isFolded(nodeStart: number): boolean {
  return foldedNodeEnds.has(nodeStart);
}

/**
 * 关闭当前菜单
 */
function closeMenu(): void {
  if (currentMenu) {
    // 保存滚动位置
    let scrollTop = 0;
    let scrollContainer: HTMLElement | null = null;
    
    if (editorViewRef) {
      const container = editorViewRef.dom.closest('.simple-editor-body') || 
                        editorViewRef.dom.closest('.tiptap-editor-body') ||
                        editorViewRef.dom.closest('.simple-editor-content') ||
                        editorViewRef.dom.closest('.tiptap-editor-content');
      if (container instanceof HTMLElement) {
        scrollContainer = container;
        scrollTop = container.scrollTop;
      }
    }
    
    currentMenu.remove();
    currentMenu = null;
    
    // 恢复滚动位置
    if (scrollContainer) {
      scrollContainer.scrollTop = scrollTop;
      requestAnimationFrame(() => {
        if (scrollContainer) {
          scrollContainer.scrollTop = scrollTop;
        }
      });
    }
  }
  document.removeEventListener('click', handleDocumentClick);
  document.removeEventListener('keydown', handleEscapeKey);
}

/**
 * 处理文档点击事件（关闭菜单）
 */
function handleDocumentClick(e: MouseEvent): void {
  if (currentMenu && !currentMenu.contains(e.target as Node)) {
    closeMenu();
  }
}

/**
 * 处理 ESC 键（关闭菜单）
 */
function handleEscapeKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    closeMenu();
  }
}

/**
 * 创建拖拽指示器
 */
function createDragIndicator(): HTMLElement {
  const indicator = document.createElement('div');
  indicator.className = 'line-decorator-drag-indicator';
  
  // 创建文本预览元素
  const textPreview = document.createElement('div');
  textPreview.className = 'line-decorator-drag-text';
  indicator.appendChild(textPreview);
  
  return indicator;
}

/**
 * 获取被拖拽节点的文本内容
 */
function getDraggedNodeText(view: EditorView, nodePos: number): string {
  const { doc } = view.state;
  const $pos = doc.resolve(nodePos);
  const node = $pos.nodeAfter;
  
  if (!node) return '';
  
  // 获取文本内容，限制长度
  const text = node.textContent.trim();
  const maxLength = 50;
  
  if (text.length > maxLength) {
    return text.substring(0, maxLength) + '...';
  }
  
  return text || '(空块)';
}

/**
 * 获取鼠标位置对应的目标节点位置
 */
function getTargetPosFromY(view: EditorView, y: number, sourcePos: number): number | null {
  const { doc } = view.state;
  let targetPos: number | null = null;
  let minDistance = Infinity;

  doc.forEach((node, pos) => {
    // 跳过源节点
    if (pos === sourcePos) return;

    const coords = view.coordsAtPos(pos);
    const nodeEnd = pos + node.nodeSize;
    const endCoords = view.coordsAtPos(nodeEnd);

    // 计算节点中心 Y 坐标
    const centerY = (coords.top + endCoords.bottom) / 2;
    const distance = Math.abs(y - centerY);

    if (distance < minDistance) {
      minDistance = distance;
      // 如果鼠标在节点上半部分，插入到节点前面；否则插入到节点后面
      targetPos = y < centerY ? pos : nodeEnd;
    }
  });

  return targetPos;
}

/**
 * 更新拖拽指示器位置
 */
function updateDragIndicator(view: EditorView, targetPos: number): void {
  if (!dragState.dragIndicator) return;

  try {
    const coords = view.coordsAtPos(targetPos);
    const editorRect = view.dom.getBoundingClientRect();

    dragState.dragIndicator.style.top = `${coords.top}px`;
    dragState.dragIndicator.style.left = `${editorRect.left}px`;
    dragState.dragIndicator.style.width = `${editorRect.width}px`;
    dragState.dragIndicator.style.display = 'block';
  } catch {
    dragState.dragIndicator.style.display = 'none';
  }
}

/**
 * 滚动容器引用
 */
let scrollContainerRef: Element | null = null;

/**
 * 处理拖拽开始
 */
function handleDragStart(view: EditorView, nodePos: number, nodeSize: number, e: MouseEvent): void {
  e.preventDefault();
  e.stopPropagation();

  // 初始化拖拽状态
  dragState = {
    isDragging: true,
    nodePos,
    nodeSize,
    startY: e.clientY,
    dragIndicator: createDragIndicator(),
    targetPos: null,
    highlightOverlay: null,
  };

  // 高亮被拖动的节点
  highlightDraggedNode(view, nodePos);

  if (dragState.dragIndicator) {
    // 设置文本预览内容
    const textPreview = dragState.dragIndicator.querySelector('.line-decorator-drag-text');
    if (textPreview) {
      textPreview.textContent = getDraggedNodeText(view, nodePos);
    }
    document.body.appendChild(dragState.dragIndicator);
  }
  document.body.style.cursor = 'grabbing';

  // 添加拖拽中的类名
  view.dom.classList.add('is-dragging');

  // 获取滚动容器引用（用于自动滚动）
  scrollContainerRef = view.dom.closest('.tiptap-editor-content') || view.dom.closest('.simple-editor-content');

  document.addEventListener('mousemove', handleDragMove);
  document.addEventListener('mouseup', handleDragEnd);
}

/**
 * 高亮被拖动的节点（包括折叠的子内容）
 * 使用覆盖图层方式实现高亮效果
 */
function highlightDraggedNode(view: EditorView, nodePos: number): void {
  const { doc } = view.state;
  const $pos = doc.resolve(nodePos);
  const node = $pos.nodeAfter;

  if (!node) return;

  const nodeEnd = nodePos + node.nodeSize;

  // 收集所有需要高亮的节点位置
  const positions: Array<{ start: number; end: number }> = [{ start: nodePos, end: nodeEnd }];

  // 检查是否有子内容需要高亮
  const childInfo = getFollowingChildContent(doc, nodeEnd);
  if (childInfo.hasChild) {
    positions.push(...childInfo.childPositions);
  }

  // 创建覆盖图层
  createHighlightOverlay(view, positions);
}

/**
 * 创建高亮覆盖图层
 */
function createHighlightOverlay(view: EditorView, positions: Array<{ start: number; end: number }>): void {
  // 移除旧的覆盖图层
  removeHighlight();

  // 获取滚动容器
  const editorContainer = view.dom;
  const scrollContainer = editorContainer.closest('.tiptap-editor-content') || 
                          editorContainer.closest('.simple-editor-content');
  
  if (!scrollContainer || !(scrollContainer instanceof HTMLElement)) return;

  const scrollContainerRect = scrollContainer.getBoundingClientRect();
  const scrollTop = scrollContainer.scrollTop;

  // 计算所有节点的边界框（相对于滚动容器）
  let minTop = Infinity;
  let maxBottom = -Infinity;

  positions.forEach(({ start, end }) => {
    try {
      const startCoords = view.coordsAtPos(start);
      const endCoords = view.coordsAtPos(end);

      // 转换为相对于滚动容器的坐标（加上滚动偏移）
      minTop = Math.min(minTop, startCoords.top - scrollContainerRect.top + scrollTop);
      maxBottom = Math.max(maxBottom, endCoords.bottom - scrollContainerRect.top + scrollTop);
    } catch {
      // 忽略错误
    }
  });

  if (minTop === Infinity || maxBottom === -Infinity) return;

  // 创建覆盖图层元素（放到滚动容器内部）
  const overlay = document.createElement('div');
  overlay.className = 'line-decorator-highlight-overlay';
  overlay.style.position = 'absolute';
  overlay.style.top = `${minTop - 4}px`;
  overlay.style.left = '16px';
  overlay.style.right = '16px';
  overlay.style.height = `${maxBottom - minTop + 8}px`;
  overlay.style.pointerEvents = 'none';
  overlay.style.zIndex = '100';
  overlay.style.borderRadius = '4px';
  overlay.style.border = '2px solid var(--ws-focusBorder)';
  overlay.style.boxShadow = '0 0 8px var(--ws-focusBorder)';

  // 确保滚动容器有相对定位
  scrollContainer.style.position = 'relative';
  scrollContainer.appendChild(overlay);
  dragState.highlightOverlay = overlay;
}

/**
 * 移除拖动高亮
 */
function removeHighlight(): void {
  if (dragState.highlightOverlay) {
    dragState.highlightOverlay.remove();
    dragState.highlightOverlay = null;
  }
}

/**
 * 处理拖拽移动
 */
function handleDragMove(e: MouseEvent): void {
  if (!dragState.isDragging || !editorViewRef) return;

  // 自动滚动：当鼠标接近滚动容器边缘时自动滚动
  if (scrollContainerRef instanceof HTMLElement) {
    const containerRect = scrollContainerRef.getBoundingClientRect();
    const scrollThreshold = 50; // 距离边缘多少像素开始滚动
    const scrollSpeed = 10; // 滚动速度

    if (e.clientY < containerRect.top + scrollThreshold) {
      // 向上滚动
      scrollContainerRef.scrollTop -= scrollSpeed;
    } else if (e.clientY > containerRect.bottom - scrollThreshold) {
      // 向下滚动
      scrollContainerRef.scrollTop += scrollSpeed;
    }
  }

  const targetPos = getTargetPosFromY(editorViewRef, e.clientY, dragState.nodePos);

  if (targetPos !== null && targetPos !== dragState.targetPos) {
    dragState.targetPos = targetPos;
    updateDragIndicator(editorViewRef, targetPos);
  }
}

/**
 * 处理拖拽结束
 */
function handleDragEnd(): void {
  if (!dragState.isDragging || !editorViewRef) {
    cleanupDrag();
    return;
  }

  const view = editorViewRef;
  const { nodePos, targetPos } = dragState;

  // 清理拖拽状态
  cleanupDrag();

  // 如果没有有效的目标位置，不执行移动
  if (targetPos === null) {
    return;
  }

  // 执行节点移动（包括子内容）
  const { state, dispatch } = view;
  const { doc } = state;

  try {
    const $sourcePos = doc.resolve(nodePos);
    const sourceNode = $sourcePos.nodeAfter;

    if (!sourceNode) return;

    const nodeEnd = nodePos + sourceNode.nodeSize;

    // 收集所有需要移动的节点（当前节点 + 子内容）
    const nodesToMove: Array<{ node: typeof sourceNode; start: number; end: number }> = [
      { node: sourceNode, start: nodePos, end: nodeEnd }
    ];

    // 检查是否有子内容需要一起移动
    const childInfo = getFollowingChildContent(doc, nodeEnd);
    if (childInfo.hasChild) {
      childInfo.childPositions.forEach(({ start, end }) => {
        const $childPos = doc.resolve(start);
        const childNode = $childPos.nodeAfter;
        if (childNode) {
          nodesToMove.push({ node: childNode, start, end });
        }
      });
    }

    // 计算总的移动范围
    const totalStart = nodesToMove[0].start;
    const totalEnd = nodesToMove[nodesToMove.length - 1].end;
    const totalSize = totalEnd - totalStart;

    // 如果目标位置在源节点范围内，不执行移动
    if (targetPos >= totalStart && targetPos <= totalEnd) {
      return;
    }

    // 收集所有节点
    const allNodes = nodesToMove.map(item => item.node);

    // 计算调整后的目标位置（考虑删除源节点后的位置变化）
    let adjustedTargetPos = targetPos;
    if (targetPos > totalStart) {
      adjustedTargetPos = targetPos - totalSize;
    }

    // 创建事务
    const tr = state.tr;

    // 先删除所有源节点
    tr.delete(totalStart, totalEnd);

    // 然后在目标位置插入所有节点
    allNodes.forEach((node, index) => {
      tr.insert(adjustedTargetPos + (index > 0 ? allNodes.slice(0, index).reduce((sum, n) => sum + n.nodeSize, 0) : 0), node);
    });

    dispatch(tr);
  } catch (error) {
    console.error('拖拽移动失败:', error);
  }
}

/**
 * 清理拖拽状态
 */
function cleanupDrag(): void {
  if (dragState.dragIndicator) {
    dragState.dragIndicator.remove();
  }

  document.body.style.cursor = '';

  if (editorViewRef) {
    editorViewRef.dom.classList.remove('is-dragging');
  }

  // 清除滚动容器引用
  scrollContainerRef = null;

  // 移除拖动高亮
  removeHighlight();

  dragState = {
    isDragging: false,
    nodePos: 0,
    nodeSize: 0,
    startY: 0,
    dragIndicator: null,
    targetPos: null,
    highlightOverlay: null,
  };

  document.removeEventListener('mousemove', handleDragMove);
  document.removeEventListener('mouseup', handleDragEnd);
}

/**
 * 菜单项配置
 */
interface MenuItem {
  label: string;
  action?: string;
  submenu?: MenuItem[];
  divider?: boolean;
  type?: 'color'; // 特殊类型：颜色选择器
  colorType?: 'text' | 'background'; // 颜色类型
}

/**
 * 预设文本颜色（深色系，适合文字）
 */
const TEXT_COLORS = [
  { name: '默认', color: '' },
  { name: '灰色', color: '#6b7280' },
  { name: '棕色', color: '#92400e' },
  { name: '红色', color: '#dc2626' },
  { name: '橙色', color: '#ea580c' },
  { name: '蓝色', color: '#2563eb' },
  { name: '紫色', color: '#7c3aed' },
];

/**
 * 预设背景颜色（浅色系，适合高亮）
 */
const BACKGROUND_COLORS = [
  { name: '默认', color: '' },
  { name: '浅黄', color: 'rgba(253, 224, 71, 0.4)' },
  { name: '浅绿', color: 'rgba(134, 239, 172, 0.4)' },
  { name: '浅蓝', color: 'rgba(147, 197, 253, 0.4)' },
  { name: '浅粉', color: 'rgba(249, 168, 212, 0.4)' },
  { name: '浅紫', color: 'rgba(196, 181, 253, 0.4)' },
  { name: '浅橙', color: 'rgba(253, 186, 116, 0.4)' },
];

/**
 * 获取菜单配置
 */
function getMenuConfig(): MenuItem[] {
  return [
    {
      label: '转换为',
      submenu: [
        { label: '标题 1', action: 'heading1' },
        { label: '标题 2', action: 'heading2' },
        { label: '标题 3', action: 'heading3' },
        { label: '段落', action: 'paragraph' },
        { label: '无序列表', action: 'bulletList' },
        { label: '有序列表', action: 'orderedList' },
        { label: '任务列表', action: 'taskList' },
        { label: '引用', action: 'blockquote' },
        { label: '代码块', action: 'codeBlock' },
      ],
    },
    {
      label: '颜色',
      type: 'color',
    },
    { label: '', divider: true },
    { label: '删除', action: 'delete' },
    { label: '复制', action: 'copy' },
    { label: '剪切', action: 'cut' },
    { label: '', divider: true },
    {
      label: '缩进',
      submenu: [
        { label: '增加缩进', action: 'indent' },
        { label: '减少缩进', action: 'outdent' },
      ],
    },
  ];
}

/**
 * 执行菜单操作
 */
function executeMenuAction(view: EditorView, action: string, nodePos: number): void {
  const { state, dispatch } = view;
  const { tr } = state;
  const $pos = state.doc.resolve(nodePos);
  const node = $pos.nodeAfter;

  if (!node) return;

  const nodeStart = nodePos;
  const nodeEnd = nodePos + node.nodeSize;

  switch (action) {
    case 'heading1':
    case 'heading2':
    case 'heading3': {
      const level = parseInt(action.replace('heading', ''), 10);
      const headingType = state.schema.nodes.heading;
      if (headingType) {
        const content = node.content;
        const newNode = headingType.create({ level }, content);
        tr.replaceWith(nodeStart, nodeEnd, newNode);
        dispatch(tr);
      }
      break;
    }
    case 'paragraph': {
      const paragraphType = state.schema.nodes.paragraph;
      if (paragraphType) {
        const content = node.content;
        const newNode = paragraphType.create(null, content);
        tr.replaceWith(nodeStart, nodeEnd, newNode);
        dispatch(tr);
      }
      break;
    }
    case 'bulletList': {
      const bulletListType = state.schema.nodes.bulletList;
      const listItemType = state.schema.nodes.listItem;
      const paragraphType = state.schema.nodes.paragraph;
      if (bulletListType && listItemType && paragraphType) {
        const content = node.content;
        const listItem = listItemType.create(null, paragraphType.create(null, content));
        const newNode = bulletListType.create(null, listItem);
        tr.replaceWith(nodeStart, nodeEnd, newNode);
        dispatch(tr);
      }
      break;
    }
    case 'orderedList': {
      const orderedListType = state.schema.nodes.orderedList;
      const listItemType = state.schema.nodes.listItem;
      const paragraphType = state.schema.nodes.paragraph;
      if (orderedListType && listItemType && paragraphType) {
        const content = node.content;
        const listItem = listItemType.create(null, paragraphType.create(null, content));
        const newNode = orderedListType.create(null, listItem);
        tr.replaceWith(nodeStart, nodeEnd, newNode);
        dispatch(tr);
      }
      break;
    }
    case 'taskList': {
      const taskListType = state.schema.nodes.taskList;
      const taskItemType = state.schema.nodes.taskItem;
      const paragraphType = state.schema.nodes.paragraph;
      if (taskListType && taskItemType && paragraphType) {
        const content = node.content;
        const taskItem = taskItemType.create({ checked: false }, paragraphType.create(null, content));
        const newNode = taskListType.create(null, taskItem);
        tr.replaceWith(nodeStart, nodeEnd, newNode);
        dispatch(tr);
      }
      break;
    }
    case 'blockquote': {
      const blockquoteType = state.schema.nodes.blockquote;
      const paragraphType = state.schema.nodes.paragraph;
      if (blockquoteType && paragraphType) {
        const content = node.content;
        const newNode = blockquoteType.create(null, paragraphType.create(null, content));
        tr.replaceWith(nodeStart, nodeEnd, newNode);
        dispatch(tr);
      }
      break;
    }
    case 'codeBlock': {
      const codeBlockType = state.schema.nodes.codeBlock;
      if (codeBlockType) {
        const textContent = node.textContent;
        const newNode = codeBlockType.create(null, state.schema.text(textContent));
        tr.replaceWith(nodeStart, nodeEnd, newNode);
        dispatch(tr);
      }
      break;
    }
    case 'delete': {
      tr.delete(nodeStart, nodeEnd);
      dispatch(tr);
      break;
    }
    case 'copy': {
      const slice = state.doc.slice(nodeStart, nodeEnd);
      const text = slice.content.textBetween(0, slice.content.size, '\n');
      navigator.clipboard.writeText(text);
      break;
    }
    case 'cut': {
      const slice = state.doc.slice(nodeStart, nodeEnd);
      const text = slice.content.textBetween(0, slice.content.size, '\n');
      navigator.clipboard.writeText(text);
      tr.delete(nodeStart, nodeEnd);
      dispatch(tr);
      break;
    }
    case 'indent': {
      // 增加缩进 - 将当前块包装在列表中或增加列表层级
      const bulletListType = state.schema.nodes.bulletList;
      const listItemType = state.schema.nodes.listItem;
      if (bulletListType && listItemType && node.type.name !== 'bulletList' && node.type.name !== 'orderedList') {
        const listItem = listItemType.create(null, node);
        const newNode = bulletListType.create(null, listItem);
        tr.replaceWith(nodeStart, nodeEnd, newNode);
        dispatch(tr);
      }
      break;
    }
    case 'outdent': {
      // 减少缩进 - 如果在列表中，提升层级
      if (node.type.name === 'bulletList' || node.type.name === 'orderedList') {
        const firstItem = node.firstChild;
        if (firstItem && firstItem.firstChild) {
          tr.replaceWith(nodeStart, nodeEnd, firstItem.firstChild);
          dispatch(tr);
        }
      }
      break;
    }
  }

  closeMenu();
}

/**
 * 应用文本颜色到节点
 */
function applyTextColor(view: EditorView, nodePos: number, color: string): void {
  const { state, dispatch } = view;
  const $pos = state.doc.resolve(nodePos);
  const node = $pos.nodeAfter;

  if (!node) return;

  // 计算节点内文本的范围（排除节点本身的边界）
  const nodeStart = nodePos + 1; // 节点内部开始位置
  const nodeEnd = nodePos + node.nodeSize - 1; // 节点内部结束位置

  // 确保有文本内容
  if (nodeStart >= nodeEnd) return;

  const tr = state.tr;

  if (color) {
    // 应用颜色 - 使用 textStyle mark
    const textStyleMark = state.schema.marks.textStyle;
    if (textStyleMark) {
      tr.addMark(nodeStart, nodeEnd, textStyleMark.create({ color }));
    }
  } else {
    // 移除颜色
    const textStyleMark = state.schema.marks.textStyle;
    if (textStyleMark) {
      tr.removeMark(nodeStart, nodeEnd, textStyleMark);
    }
  }

  dispatch(tr);
  closeMenu();
}

/**
 * 应用文本颜色预览（不关闭菜单）
 */
function applyTextColorPreview(view: EditorView, nodePos: number, color: string): void {
  const { state, dispatch } = view;
  const $pos = state.doc.resolve(nodePos);
  const node = $pos.nodeAfter;

  if (!node) return;

  const nodeStart = nodePos + 1;
  const nodeEnd = nodePos + node.nodeSize - 1;

  if (nodeStart >= nodeEnd) return;

  const tr = state.tr;
  const textStyleMark = state.schema.marks.textStyle;
  if (textStyleMark) {
    tr.addMark(nodeStart, nodeEnd, textStyleMark.create({ color }));
  }

  dispatch(tr);
}

/**
 * 获取块的完整范围（包括子内容）
 */
function getBlockRange(
  doc: ProseMirrorNode,
  nodePos: number,
  node: ProseMirrorNode
): { start: number; end: number } {
  const nodeEnd = nodePos + node.nodeSize;
  let blockEnd = nodeEnd;

  // 检查标题内容
  if (node.type.name === 'heading') {
    const headingLevel = node.attrs.level as number;
    const headingContent = getHeadingContent(doc, nodePos, headingLevel);
    if (headingContent.hasContent && headingContent.contentPositions.length > 0) {
      const lastContent = headingContent.contentPositions[headingContent.contentPositions.length - 1];
      blockEnd = lastContent.end;
    }
  } else {
    // 检查子内容
    const childInfo = getFollowingChildContent(doc, nodeEnd);
    if (childInfo.hasChild && childInfo.childPositions.length > 0) {
      const lastChild = childInfo.childPositions[childInfo.childPositions.length - 1];
      blockEnd = lastChild.end;
    } else {
      // 检查缩进内容
      const indentedInfo = getIndentedContent(doc, nodeEnd);
      if (indentedInfo.hasIndented && indentedInfo.indentedPositions.length > 0) {
        const lastIndented = indentedInfo.indentedPositions[indentedInfo.indentedPositions.length - 1];
        blockEnd = lastIndented.end;
      }
    }
  }

  return { start: nodePos, end: blockEnd };
}

/**
 * 应用背景颜色到整个块（使用 ColorBlock 包裹）
 */
function applyBackgroundColor(view: EditorView, nodePos: number, color: string): void {
  const { state } = view;
  const { doc } = state;
  const $pos = doc.resolve(nodePos);
  const node = $pos.nodeAfter;

  if (!node) {
    closeMenu();
    return;
  }

  // 保存滚动位置
  const scrollContainer = view.dom.closest('.simple-editor-body') || 
                          view.dom.closest('.tiptap-editor-body');
  const scrollTop = scrollContainer instanceof HTMLElement ? scrollContainer.scrollTop : 0;

  // 检查当前节点是否已经在 colorBlock 中
  let inColorBlock = false;
  let colorBlockDepth = -1;
  for (let depth = $pos.depth; depth >= 0; depth--) {
    const parentNode = $pos.node(depth);
    if (parentNode.type.name === 'colorBlock') {
      inColorBlock = true;
      colorBlockDepth = depth;
      break;
    }
  }

  if (color) {
    if (inColorBlock && colorBlockDepth >= 0) {
      // 已经在 colorBlock 中，更新背景色
      const parentStart = $pos.before(colorBlockDepth);
      const tr = state.tr;
      tr.setNodeMarkup(parentStart, undefined, { backgroundColor: color });
      view.dispatch(tr);
    } else {
      // 不在 colorBlock 中，创建新的 colorBlock
      const blockRange = getBlockRange(doc, nodePos, node);
      const colorBlockType = state.schema.nodes.colorBlock;
      if (colorBlockType) {
        const tr = state.tr;
        const slice = doc.slice(blockRange.start, blockRange.end);
        const colorBlockNode = colorBlockType.create({ backgroundColor: color }, slice.content);
        tr.replaceWith(blockRange.start, blockRange.end, colorBlockNode);
        view.dispatch(tr);
      }
    }
  } else {
    // 移除背景色 - 检查当前节点是否在 colorBlock 中
    if (inColorBlock && colorBlockDepth >= 0) {
      const parentNode = $pos.node(colorBlockDepth);
      const parentStart = $pos.before(colorBlockDepth);
      const parentEnd = $pos.after(colorBlockDepth);
      
      const tr = state.tr;
      // 用 colorBlock 的内容替换 colorBlock 本身
      tr.replaceWith(parentStart, parentEnd, parentNode.content);
      view.dispatch(tr);
    }
  }

  // 恢复滚动位置
  if (scrollContainer instanceof HTMLElement) {
    scrollContainer.scrollTop = scrollTop;
    requestAnimationFrame(() => {
      if (scrollContainer instanceof HTMLElement) {
        scrollContainer.scrollTop = scrollTop;
      }
    });
  }

  closeMenu();
}

/**
 * 应用背景颜色预览（使用 ColorBlock，不关闭菜单）
 */
function applyBackgroundColorPreview(view: EditorView, nodePos: number, color: string): void {
  const { state } = view;
  const { doc } = state;
  const $pos = doc.resolve(nodePos);
  const node = $pos.nodeAfter;

  if (!node) return;

  // 保存滚动位置
  const scrollContainer = view.dom.closest('.simple-editor-body') || 
                          view.dom.closest('.tiptap-editor-body');
  const scrollTop = scrollContainer instanceof HTMLElement ? scrollContainer.scrollTop : 0;

  // 检查当前节点是否已经在 colorBlock 中
  let inColorBlock = false;
  let colorBlockDepth = -1;
  for (let depth = $pos.depth; depth >= 0; depth--) {
    const parentNode = $pos.node(depth);
    if (parentNode.type.name === 'colorBlock') {
      inColorBlock = true;
      colorBlockDepth = depth;
      break;
    }
  }

  if (color) {
    if (inColorBlock && colorBlockDepth >= 0) {
      // 已经在 colorBlock 中，更新背景色
      const parentStart = $pos.before(colorBlockDepth);
      const tr = state.tr;
      tr.setNodeMarkup(parentStart, undefined, { backgroundColor: color });
      tr.setMeta('addToHistory', false);
      view.dispatch(tr);
    } else {
      // 不在 colorBlock 中，创建新的 colorBlock
      const blockRange = getBlockRange(doc, nodePos, node);
      const colorBlockType = state.schema.nodes.colorBlock;
      if (colorBlockType) {
        const tr = state.tr;
        const slice = doc.slice(blockRange.start, blockRange.end);
        const colorBlockNode = colorBlockType.create({ backgroundColor: color }, slice.content);
        tr.replaceWith(blockRange.start, blockRange.end, colorBlockNode);
        tr.setMeta('addToHistory', false);
        view.dispatch(tr);
      }
    }
  } else {
    // 移除背景色
    if (inColorBlock && colorBlockDepth >= 0) {
      const parentNode = $pos.node(colorBlockDepth);
      const parentStart = $pos.before(colorBlockDepth);
      const parentEnd = $pos.after(colorBlockDepth);
      
      const tr = state.tr;
      tr.replaceWith(parentStart, parentEnd, parentNode.content);
      tr.setMeta('addToHistory', false);
      view.dispatch(tr);
    }
  }

  // 恢复滚动位置
  if (scrollContainer instanceof HTMLElement) {
    scrollContainer.scrollTop = scrollTop;
  }
}

/**
 * 将十六进制颜色转换为 RGBA
 */
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * 创建颜色选择器子菜单（二级菜单，分组显示文本颜色和背景颜色）
 */
function createColorSubmenu(
  view: EditorView,
  nodePos: number,
  parentMenuItem: HTMLElement
): HTMLElement {
  const submenu = document.createElement('div');
  submenu.className = 'line-decorator-submenu line-decorator-color-submenu';

  // 文本颜色分组
  const textColorGroup = document.createElement('div');
  textColorGroup.className = 'color-group';

  const textColorLabel = document.createElement('div');
  textColorLabel.className = 'color-group-label';
  textColorLabel.textContent = '文本颜色';
  textColorGroup.appendChild(textColorLabel);

  const textColorList = document.createElement('div');
  textColorList.className = 'color-preset-row';

  TEXT_COLORS.forEach(({ name, color }) => {
    const colorItem = document.createElement('div');
    colorItem.className = 'color-preset-item';
    colorItem.title = name;

    // 文本颜色用字母 A 标识
    const colorLetter = document.createElement('span');
    colorLetter.className = 'color-letter';
    colorLetter.textContent = 'A';
    
    if (color) {
      colorLetter.style.color = color;
    } else {
      colorLetter.classList.add('color-letter-default');
    }

    colorItem.appendChild(colorLetter);
    
    colorItem.addEventListener('click', (e) => {
      e.stopPropagation();
      applyTextColor(view, nodePos, color);
    });

    textColorList.appendChild(colorItem);
  });

  // 自定义文本颜色
  const textCustomItem = document.createElement('div');
  textCustomItem.className = 'color-preset-item color-custom-item';
  textCustomItem.title = '自定义';

  const textCustomInput = document.createElement('input');
  textCustomInput.type = 'color';
  textCustomInput.className = 'color-custom-input';
  textCustomInput.value = '#000000';

  // 实时预览：拖动色板时实时更新颜色
  textCustomInput.addEventListener('input', (e) => {
    const target = e.target as HTMLInputElement;
    applyTextColorPreview(view, nodePos, target.value);
  });

  textCustomInput.addEventListener('change', (e) => {
    const target = e.target as HTMLInputElement;
    applyTextColor(view, nodePos, target.value);
  });

  textCustomInput.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  textCustomItem.appendChild(textCustomInput);
  textColorList.appendChild(textCustomItem);

  textColorGroup.appendChild(textColorList);
  submenu.appendChild(textColorGroup);

  // 分隔线
  const divider = document.createElement('div');
  divider.className = 'color-group-divider';
  submenu.appendChild(divider);

  // 背景颜色分组
  const bgColorGroup = document.createElement('div');
  bgColorGroup.className = 'color-group';

  const bgColorLabel = document.createElement('div');
  bgColorLabel.className = 'color-group-label';
  bgColorLabel.textContent = '背景颜色';
  bgColorGroup.appendChild(bgColorLabel);

  const bgColorList = document.createElement('div');
  bgColorList.className = 'color-preset-row';

  BACKGROUND_COLORS.forEach(({ name, color }) => {
    const colorItem = document.createElement('div');
    colorItem.className = 'color-preset-item';
    colorItem.title = name;

    // 背景颜色用圆形标识
    const colorCircle = document.createElement('span');
    colorCircle.className = 'color-circle';
    
    if (color) {
      colorCircle.style.backgroundColor = color;
    } else {
      colorCircle.classList.add('color-circle-default');
    }

    colorItem.appendChild(colorCircle);
    
    colorItem.addEventListener('click', (e) => {
      e.stopPropagation();
      applyBackgroundColor(view, nodePos, color);
    });

    bgColorList.appendChild(colorItem);
  });

  // 自定义背景颜色
  const bgCustomItem = document.createElement('div');
  bgCustomItem.className = 'color-preset-item color-custom-item';
  bgCustomItem.title = '自定义';

  const bgCustomInput = document.createElement('input');
  bgCustomInput.type = 'color';
  bgCustomInput.className = 'color-custom-input';
  bgCustomInput.value = '#ffff00';

  // 实时预览：拖动色板时实时更新颜色
  bgCustomInput.addEventListener('input', (e) => {
    const target = e.target as HTMLInputElement;
    const customColor = hexToRgba(target.value, 0.4);
    applyBackgroundColorPreview(view, nodePos, customColor);
  });

  bgCustomInput.addEventListener('change', (e) => {
    const target = e.target as HTMLInputElement;
    const customColor = hexToRgba(target.value, 0.4);
    applyBackgroundColor(view, nodePos, customColor);
  });

  bgCustomInput.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  bgCustomItem.appendChild(bgCustomInput);
  bgColorList.appendChild(bgCustomItem);

  bgColorGroup.appendChild(bgColorList);
  submenu.appendChild(bgColorGroup);

  // 添加位置检测：当鼠标悬停时检测空间并调整位置
  parentMenuItem.addEventListener('mouseenter', () => {
    requestAnimationFrame(() => {
      adjustSubmenuPosition(submenu);
    });
  });

  return submenu;
}

/**
 * 调整子菜单位置（检测空间不足时向上显示）
 */
function adjustSubmenuPosition(submenu: HTMLElement): void {
  const rect = submenu.getBoundingClientRect();
  const viewportHeight = window.innerHeight;
  const spaceBelow = viewportHeight - rect.top;
  const spaceAbove = rect.top;

  // 如果下方空间不足，且上方空间更大，则向上显示
  if (rect.height > spaceBelow && spaceAbove > spaceBelow) {
    submenu.classList.add('placement-top');
  } else {
    submenu.classList.remove('placement-top');
  }
}

/**
 * 创建菜单元素
 */
function createMenuElement(view: EditorView, nodePos: number, x: number, y: number): HTMLElement {
  const menu = document.createElement('div');
  menu.className = 'line-decorator-menu';
  menu.style.position = 'fixed';
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  menu.style.zIndex = '10000';

  const menuConfig = getMenuConfig();

  menuConfig.forEach((item) => {
    if (item.divider) {
      const divider = document.createElement('div');
      divider.className = 'line-decorator-menu-divider';
      menu.appendChild(divider);
      return;
    }

    const menuItem = document.createElement('div');
    menuItem.className = 'line-decorator-menu-item';

    // 处理颜色菜单（二级菜单，分组显示）
    if (item.type === 'color') {
      menuItem.classList.add('has-submenu');
      menuItem.innerHTML = `
        <span class="menu-item-label">${item.label}</span>
        <span class="menu-item-arrow">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <path d="M6.427 4.427l3.396 3.396a.25.25 0 0 1 0 .354l-3.396 3.396A.25.25 0 0 1 6 11.396V4.604a.25.25 0 0 1 .427-.177z"/>
          </svg>
        </span>
      `;

      const colorSubmenu = createColorSubmenu(view, nodePos, menuItem);
      menuItem.appendChild(colorSubmenu);
    } else if (item.submenu) {
      menuItem.classList.add('has-submenu');
      menuItem.innerHTML = `
        <span class="menu-item-label">${item.label}</span>
        <span class="menu-item-arrow">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <path d="M6.427 4.427l3.396 3.396a.25.25 0 0 1 0 .354l-3.396 3.396A.25.25 0 0 1 6 11.396V4.604a.25.25 0 0 1 .427-.177z"/>
          </svg>
        </span>
      `;

      const submenu = document.createElement('div');
      submenu.className = 'line-decorator-submenu';

      item.submenu.forEach((subItem) => {
        if (subItem.action) {
          const subMenuItem = document.createElement('div');
          subMenuItem.className = 'line-decorator-menu-item';
          subMenuItem.textContent = subItem.label;
          subMenuItem.addEventListener('click', (e) => {
            e.stopPropagation();
            executeMenuAction(view, subItem.action as string, nodePos);
          });
          submenu.appendChild(subMenuItem);
        }
      });

      menuItem.appendChild(submenu);
    } else {
      menuItem.textContent = item.label;
      menuItem.addEventListener('click', (e) => {
        e.stopPropagation();
        if (item.action) {
          executeMenuAction(view, item.action, nodePos);
        }
      });
    }

    menu.appendChild(menuItem);
  });

  return menu;
}

/**
 * 显示上下文菜单
 */
function showContextMenu(view: EditorView, nodePos: number, x: number, y: number): void {
  closeMenu();

  const menu = createMenuElement(view, nodePos, x, y);
  document.body.appendChild(menu);
  currentMenu = menu;

  // 确保菜单不超出视口
  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) {
    menu.style.left = `${window.innerWidth - rect.width - 8}px`;
  }
  if (rect.bottom > window.innerHeight) {
    menu.style.top = `${window.innerHeight - rect.height - 8}px`;
  }

  // 延迟添加事件监听，避免立即触发
  setTimeout(() => {
    document.addEventListener('click', handleDocumentClick);
    document.addEventListener('keydown', handleEscapeKey);
  }, 0);
}

/**
 * 创建行装饰器 Widget
 */
function createLineDecoratorWidget(
  view: EditorView,
  nodePos: number,
  showFoldIcon: boolean,
  isFolded: boolean,
  showGripIcon: boolean = true
): HTMLElement {
  // 创建一个不占用空间的包装器 - 使用 display: contents
  const wrapper = document.createElement('span');
  wrapper.className = 'line-decorator-wrapper';

  const container = document.createElement('div');
  container.className = 'line-decorator';

  if (showFoldIcon && showGripIcon) {
    container.classList.add('has-fold-icon');
  } else if (showFoldIcon && !showGripIcon) {
    container.classList.add('fold-only');
  }

  // 拖拽手柄图标（外侧）
  if (showGripIcon) {
    const gripIcon = document.createElement('div');
    gripIcon.className = 'grip-icon';
    gripIcon.setAttribute('role', 'button');
    gripIcon.setAttribute('tabindex', '0');
    gripIcon.setAttribute('aria-label', '拖拽或点击打开菜单');
    gripIcon.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
        <circle cx="5" cy="4" r="1.5"/>
        <circle cx="11" cy="4" r="1.5"/>
        <circle cx="5" cy="8" r="1.5"/>
        <circle cx="11" cy="8" r="1.5"/>
        <circle cx="5" cy="12" r="1.5"/>
        <circle cx="11" cy="12" r="1.5"/>
      </svg>
    `;

    let mouseDownTime = 0;
    let mouseDownPos = { x: 0, y: 0 };

    gripIcon.addEventListener('mousedown', (e) => {
      mouseDownTime = Date.now();
      mouseDownPos = { x: e.clientX, y: e.clientY };

      // 获取节点大小
      const state = view.state;
      const $pos = state.doc.resolve(nodePos);
      const node = $pos.nodeAfter;
      const nodeSize = node ? node.nodeSize : 0;

      // 延迟启动拖拽，区分点击和拖拽
      const checkDrag = (moveE: MouseEvent) => {
        const dx = Math.abs(moveE.clientX - mouseDownPos.x);
        const dy = Math.abs(moveE.clientY - mouseDownPos.y);

        // 如果移动超过 5px，开始拖拽
        if (dx > 5 || dy > 5) {
          document.removeEventListener('mousemove', checkDrag);
          document.removeEventListener('mouseup', handleMouseUp);
          handleDragStart(view, nodePos, nodeSize, e);
        }
      };

      const handleMouseUp = () => {
        document.removeEventListener('mousemove', checkDrag);
        document.removeEventListener('mouseup', handleMouseUp);

        // 如果是快速点击（小于 200ms），显示菜单
        if (Date.now() - mouseDownTime < 200) {
          const rect = gripIcon.getBoundingClientRect();
          showContextMenu(view, nodePos, rect.left, rect.bottom + 4);
        }
      };

      document.addEventListener('mousemove', checkDrag);
      document.addEventListener('mouseup', handleMouseUp);
    });

    container.appendChild(gripIcon);
  }

  // 折叠图标（内侧，靠近文本）
  if (showFoldIcon) {
    const foldIcon = document.createElement('div');
    foldIcon.className = 'fold-icon';
    foldIcon.setAttribute('role', 'button');
    foldIcon.setAttribute('tabindex', '0');
    foldIcon.setAttribute('aria-label', isFolded ? '展开' : '折叠');

    // 根据折叠状态显示不同图标
    if (isFolded) {
      // 向右三角形（折叠状态）
      foldIcon.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M6.427 4.427l3.396 3.396a.25.25 0 0 1 0 .354l-3.396 3.396A.25.25 0 0 1 6 11.396V4.604a.25.25 0 0 1 .427-.177z"/>
        </svg>
      `;
    } else {
      // 向下三角形（展开状态）
      foldIcon.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M4.427 7.427l3.396 3.396a.25.25 0 0 0 .354 0l3.396-3.396A.25.25 0 0 0 11.396 7H4.604a.25.25 0 0 0-.177.427z"/>
        </svg>
      `;
    }

    foldIcon.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const state = view.state;
      const $pos = state.doc.resolve(nodePos);
      const node = $pos.nodeAfter;

      if (!node) return;

      const nodeEnd = nodePos + node.nodeSize;
      toggleFold(nodePos, nodeEnd);
    });

    container.appendChild(foldIcon);
  }

  wrapper.appendChild(container);
  return wrapper;
}

/**
 * 行装饰器扩展
 */
export const LineDecorator = Extension.create<LineDecoratorOptions>({
  name: 'lineDecorator',

  addOptions() {
    return {
      className: 'has-line-decorator',
    };
  },

  addProseMirrorPlugins() {
    const pluginKey = LineDecoratorPluginKey;

    return [
      // 行装饰器插件 - 在选择变化时更新
      new Plugin({
        key: pluginKey,
        state: {
          init() {
            return DecorationSet.empty;
          },
          apply(tr, oldState) {
            const meta = tr.getMeta(pluginKey);
            if (meta?.update || tr.docChanged || tr.selectionSet) {
              return DecorationSet.empty;
            }
            return oldState;
          },
        },
        props: {
          decorations(state) {
            const { doc, selection } = state;
            const decorations: Decoration[] = [];
            const view = editorViewRef;

            if (!view) return DecorationSet.empty;

            // 获取当前光标所在的顶层块节点
            const $pos = selection.$head;
            let currentBlockPos: number | null = null;
            let currentBlockNode: ProseMirrorNode | null = null;

            // 找到光标所在的顶层块节点（跳过 colorBlock）
            for (let depth = $pos.depth; depth >= 0; depth--) {
              const node = $pos.node(depth);
              // 跳过 colorBlock，找到真正的内容节点
              if (node.type.name === 'colorBlock') {
                continue;
              }
              if (depth === 1 || (depth > 1 && $pos.node(depth - 1).type.name === 'colorBlock')) {
                currentBlockPos = $pos.before(depth);
                currentBlockNode = node;
                break;
              }
            }

            // 为当前行添加装饰器
            if (currentBlockPos !== null && currentBlockNode !== null) {
              const nodeEnd = currentBlockPos + currentBlockNode.nodeSize;

              // 检查当前节点是否在 colorBlock 中
              let isInColorBlock = false;
              for (let depth = $pos.depth; depth >= 0; depth--) {
                if ($pos.node(depth).type.name === 'colorBlock') {
                  isInColorBlock = true;
                  break;
                }
              }

              // 检查是否可以折叠
              let canFold = false;
              
              // 只有不在 colorBlock 中时才检查折叠
              if (!isInColorBlock) {
                const childInfo = getFollowingChildContent(doc, nodeEnd);
                const indentedInfo = getIndentedContent(doc, nodeEnd);

                if (childInfo.hasChild) {
                  canFold = true;
                } else if (indentedInfo.hasIndented) {
                  canFold = true;
                } else if (currentBlockNode.type.name === 'heading') {
                  const headingLevel = currentBlockNode.attrs.level as number;
                  const headingContent = getHeadingContent(doc, currentBlockPos, headingLevel);
                  canFold = headingContent.hasContent;
                }
              }

              const isFoldedState = foldedNodeEnds.has(currentBlockPos);

              // 添加类名装饰
              decorations.push(
                Decoration.node(currentBlockPos, nodeEnd, {
                  class: canFold
                    ? 'has-line-decorator has-fold-control'
                    : 'has-line-decorator',
                })
              );

              // 在节点内部添加 widget
              const widgetPos = currentBlockPos + 1;
              const widget = Decoration.widget(
                widgetPos,
                () =>
                  createLineDecoratorWidget(
                    view,
                    currentBlockPos as number,
                    canFold,
                    isFoldedState,
                    true
                  ),
                {
                  side: -1,
                  key: `line-decorator-${currentBlockPos}-${isFoldedState ? 'folded' : 'expanded'}`,
                }
              );
              decorations.push(widget);
            }

            // 为所有折叠的块添加隐藏装饰和折叠指示器
            foldedNodeEnds.forEach((_nodeEnd, nodeStart) => {
              if (nodeStart >= doc.content.size) {
                foldedNodeEnds.delete(nodeStart);
                return;
              }

              const $nodePos = doc.resolve(nodeStart);
              const node = $nodePos.nodeAfter;

              if (!node) {
                foldedNodeEnds.delete(nodeStart);
                return;
              }

              const actualNodeEnd = nodeStart + node.nodeSize;

              if (node.type.name === 'heading') {
                const headingLevel = node.attrs.level as number;
                const headingContent = getHeadingContent(doc, nodeStart, headingLevel);

                if (headingContent.hasContent) {
                  headingContent.contentPositions.forEach(({ start, end }) => {
                    if (start < doc.content.size && end <= doc.content.size) {
                      decorations.push(
                        Decoration.node(start, end, {
                          class: 'folded-content',
                        })
                      );
                    }
                  });
                }

                decorations.push(
                  Decoration.node(nodeStart, actualNodeEnd, {
                    class: 'heading-collapsed',
                  })
                );
              } else {
                const indentedInfo = getIndentedContent(doc, actualNodeEnd);
                const childInfo = getFollowingChildContent(doc, actualNodeEnd);

                if (indentedInfo.hasIndented) {
                  indentedInfo.indentedPositions.forEach(({ start, end }) => {
                    if (start < doc.content.size && end <= doc.content.size) {
                      decorations.push(
                        Decoration.node(start, end, {
                          class: 'folded-content',
                        })
                      );
                    }
                  });
                } else if (childInfo.hasChild) {
                  childInfo.childPositions.forEach(({ start, end }) => {
                    if (start < doc.content.size && end <= doc.content.size) {
                      decorations.push(
                        Decoration.node(start, end, {
                          class: 'folded-content',
                        })
                      );
                    }
                  });
                }

                decorations.push(
                  Decoration.node(nodeStart, actualNodeEnd, {
                    class: 'heading-collapsed',
                  })
                );
              }

              if (nodeStart !== currentBlockPos) {
                decorations.push(
                  Decoration.node(nodeStart, actualNodeEnd, {
                    class: 'has-line-decorator',
                  })
                );

                const indicatorWidgetPos = nodeStart + 1;
                const indicatorWidget = Decoration.widget(
                  indicatorWidgetPos,
                  () => createLineDecoratorWidget(view, nodeStart, true, true, false),
                  {
                    side: -1,
                    key: `fold-indicator-${nodeStart}`,
                  }
                );
                decorations.push(indicatorWidget);
              }
            });

            return DecorationSet.create(doc, decorations);
          },
        },
        view(view) {
          editorViewRef = view;
          return {
            destroy() {
              editorViewRef = null;
              foldedNodeEnds.clear();
              closeMenu();
            },
          };
        },
      }),
    ];
  },
});