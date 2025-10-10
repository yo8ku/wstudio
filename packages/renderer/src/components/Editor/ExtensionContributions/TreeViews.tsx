/**
 * 树视图组件
 */

import React from 'react';

interface TreeNode {
  id: string;
  label: string;
  children?: TreeNode[];
}

interface TreeViewsProps {
  data: TreeNode[];
}

export const TreeViews: React.FC<TreeViewsProps> = ({ data }) => {
  const renderNode = (node: TreeNode) => (
    <div key={node.id} className="tree-node">
      <span>{node.label}</span>
      {node.children && (
        <div className="tree-children">
          {node.children.map(renderNode)}
        </div>
      )}
    </div>
  );

  return (
    <div className="tree-view">
      {data.map(renderNode)}
    </div>
  );
};



