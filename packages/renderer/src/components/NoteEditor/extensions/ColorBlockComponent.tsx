/**
 * 颜色块 React 组件
 * 功能：渲染带背景色的块级容器
 * 描述：使用 React Node View 实现，避免装饰器导致的布局抖动
 */

import { NodeViewContent, NodeViewWrapper, NodeViewProps } from '@tiptap/react';
import './ColorBlock.scss';

export const ColorBlockComponent = ({ node }: NodeViewProps) => {
  const backgroundColor = node.attrs.backgroundColor as string;

  return (
    <NodeViewWrapper
      className="color-block-wrapper"
      style={{ 
        '--color-block-bg': backgroundColor,
      } as React.CSSProperties}
    >
      <NodeViewContent className="color-block-content" />
    </NodeViewWrapper>
  );
};

export default ColorBlockComponent;
