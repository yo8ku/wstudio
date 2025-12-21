/**
 * 行装饰器扩展
 * 功能：在光标所在行的左侧显示拖拽手柄装饰器
 * 折叠图标显示条件：
 * 1. 当前行是标题（heading）
 * 2. 当前行后面紧跟着子内容（列表、引用等）
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
const foldedNodeEnds = new Map<number, number>(); // nodeStart -> nodeEnd

/**
 * 存储 EditorView 引用，用于触发更新
 */
let editorViewRef: EditorView | null = null;

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
 * 本身就支持折叠的块级元素类型
 */
const FOLDABLE_BLOCK_TYPES = ['heading'];

/**
 * 检查节点是否为可作为子内容的块级元素
 */
function isChildContentBlock(node: ProseMirrorNode): boolean {
  return CHILD_CONTENT_TYPES.includes(node.type.name);
}

/**
 * 检查节点是否为本身就支持折叠的块级元素
 */
function isFoldableBlock(node: ProseMirrorNode): boolean {
  return FOLDABLE_BLOCK_TYPES.includes(node.type.name);
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
 * 切换折叠状态
 */
function toggleFold(nodeStart: number, nodeEnd: number): void {
  if (foldedNodeEnds.has(nodeStart)) {
    foldedNodeEnds.delete(nodeStart);
  } else {
    foldedNodeEnds.set(nodeStart, nodeEnd);
  }
  
  // 触发编辑器重新渲染装饰器
  if (editorViewRef) {
    const tr = editorViewRef.state.tr.setMeta(LineDecoratorPluginKey, { update: true });
    editorViewRef.dispatch(tr);
  }
}

/**
 * 创建装饰器 widget DOM 元素
 */
function createDecoratorWidget(
  className: string,
  showFoldIcon: boolean,
  nodeStart: number,
  nodeEnd: number,
  isFolded: boolean
): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = `${className}${showFoldIcon ? ' has-fold-icon' : ''}`;

  // 拖拽手柄图标
  const gripIcon = document.createElement('div');
  gripIcon.className = 'grip-icon';
  gripIcon.setAttribute('role', 'button');
  gripIcon.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="9" cy="12" r="1"/>
      <circle cx="9" cy="5" r="1"/>
      <circle cx="9" cy="19" r="1"/>
      <circle cx="15" cy="12" r="1"/>
      <circle cx="15" cy="5" r="1"/>
      <circle cx="15" cy="19" r="1"/>
    </svg>
  `;
  wrapper.appendChild(gripIcon);

  // 折叠/展开图标
  if (showFoldIcon) {
    const foldIcon = document.createElement('div');
    foldIcon.className = 'fold-icon';
    foldIcon.setAttribute('role', 'button');
    foldIcon.setAttribute('data-folded', String(isFolded));
    foldIcon.innerHTML = `
      <svg class="fold-icon-expanded" viewBox="0 0 16 16" fill="currentColor">
        <path d="M4.427 7.427l3.396 3.396a.25.25 0 0 0 .354 0l3.396-3.396A.25.25 0 0 0 11.396 7H4.604a.25.25 0 0 0-.177.427z"/>
      </svg>
      <svg class="fold-icon-collapsed" viewBox="0 0 16 16" fill="currentColor">
        <path fill-rule="evenodd" clip-rule="evenodd" d="M10.072 8.024L5.715 3.667l.618-.62L11 7.716v.618L6.333 13l-.618-.619 4.357-4.357z"/>
      </svg>
    `;

    // 点击折叠/展开
    foldIcon.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleFold(nodeStart, nodeEnd);
    });

    wrapper.appendChild(foldIcon);
  }

  return wrapper;
}


export const LineDecorator = Extension.create<LineDecoratorOptions>({
  name: 'lineDecorator',

  addOptions() {
    return {
      className: 'line-decorator',
    };
  },

  addProseMirrorPlugins() {
    const { className } = this.options;

    return [
      new Plugin({
        key: LineDecoratorPluginKey,
        view(view) {
          editorViewRef = view;
          return {
            destroy() {
              editorViewRef = null;
            },
          };
        },
        props: {
          decorations(state) {
            const { selection, doc } = state;
            const decorations: Decoration[] = [];

            // 首先，遍历所有折叠的位置，为其子内容添加隐藏装饰器
            foldedNodeEnds.forEach((nodeEnd, nodeStart) => {
              // 检查位置是否有效
              if (nodeEnd > doc.content.size) {
                foldedNodeEnds.delete(nodeStart);
                return;
              }
              
              try {
                const { childPositions } = getFollowingChildContent(doc, nodeEnd);
                
                childPositions.forEach(({ start, end }) => {
                  const hideDecoration = Decoration.node(start, end, {
                    class: 'folded-content',
                    style: 'display: none !important;',
                  });
                  decorations.push(hideDecoration);
                });
              } catch {
                // 位置无效，从折叠列表中移除
                foldedNodeEnds.delete(nodeStart);
              }
            });

            // 然后，为当前光标所在行添加装饰器
            const $pos = selection.$from;
            const depth = $pos.depth;

            if (depth === 0) {
              return DecorationSet.create(doc, decorations);
            }

            let currentDepth = depth;
            let currentNode = $pos.node(currentDepth);

            while (currentDepth > 0 && currentNode && !currentNode.isBlock) {
              currentDepth--;
              currentNode = $pos.node(currentDepth);
            }

            if (currentDepth > 0 && currentNode && currentNode.isBlock) {
              const nodeStart = $pos.before(currentDepth);
              const nodeEnd = nodeStart + currentNode.nodeSize;

              const topLevelNode = depth >= 1 ? $pos.node(1) : null;
              const isHeading = topLevelNode && isFoldableBlock(topLevelNode) && currentDepth === 1;

              // 获取子内容信息
              const { hasChild } = getFollowingChildContent(doc, nodeEnd);
              const showFoldIcon = isHeading || hasChild;

              // 检查当前节点是否处于折叠状态
              const isFolded = foldedNodeEnds.has(nodeStart);

              const nodeClass = showFoldIcon
                ? 'has-line-decorator has-fold-control'
                : 'has-line-decorator';

              const decoration = Decoration.node(nodeStart, nodeEnd, { class: nodeClass });
              decorations.push(decoration);

              const widgetDecoration = Decoration.widget(
                nodeStart + 1,
                () => createDecoratorWidget(className, showFoldIcon, nodeStart, nodeEnd, isFolded),
                { side: -1, key: `line-decorator-${nodeStart}` }
              );
              decorations.push(widgetDecoration);
            }

            return DecorationSet.create(doc, decorations);
          },
        },
      }),
    ];
  },
});

export default LineDecorator;
