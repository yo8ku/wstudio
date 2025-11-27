/**
 * Material 文件图标使用示例
 * 演示各种使用场景
 */

import React, { useState } from 'react';
import { MaterialFileIcon, MaterialFileIcons } from './index';

export const FileIconExample: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div style={{ padding: 20, fontFamily: 'system-ui', fontSize: 14 }}>
      <h2>Material 文件图标示例</h2>

      {/* 示例 1: 常见文件类型 */}
      <section style={{ marginBottom: 30 }}>
        <h3>常见文件类型</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
          {[
            'App.tsx',
            'index.js',
            'styles.css',
            'README.md',
            'package.json',
            'main.py',
            'app.vue',
            'data.json',
            'image.png',
            '.gitignore'
          ].map(fileName => (
            <div key={fileName} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <MaterialFileIcon fileName={fileName} size={16} />
              <span>{fileName}</span>
            </div>
          ))}
        </div>
      </section>

      {/* 示例 2: 文件夹 */}
      <section style={{ marginBottom: 30 }}>
        <h3>文件夹</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
          {[
            'src',
            'components',
            'node_modules',
            'public',
            '.git',
            '.vscode',
            'dist',
            'utils'
          ].map(folderName => (
            <div key={folderName} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <MaterialFileIcon folderName={folderName} isFolder size={16} />
              <span>{folderName}</span>
            </div>
          ))}
        </div>
      </section>

      {/* 示例 3: 文件夹展开/收起 */}
      <section style={{ marginBottom: 30 }}>
        <h3>文件夹展开/收起</h3>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            cursor: 'pointer',
            padding: 8,
            borderRadius: 4,
            backgroundColor: 'var(--vscode-list-hoverBackground, #f0f0f0)'
          }}
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <MaterialFileIcon
            folderName="src"
            isFolder
            isOpen={isExpanded}
            size={16}
          />
          <span>src (点击切换)</span>
        </div>
      </section>

      {/* 示例 4: 文件树模拟 */}
      <section style={{ marginBottom: 30 }}>
        <h3>文件树模拟</h3>
        <FileTreeDemo />
      </section>

      {/* 示例 5: 使用工具类 */}
      <section style={{ marginBottom: 30 }}>
        <h3>使用工具类获取图标信息</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div>
            <strong>App.tsx:</strong>
            <ul>
              <li>图标名: {MaterialFileIcons.getIcon({ fileName: 'App.tsx' })}</li>
              <li>CSS 类: {MaterialFileIcons.getIconClass({ fileName: 'App.tsx' })}</li>
              <li>路径: {MaterialFileIcons.getIconPath({ fileName: 'App.tsx' })}</li>
            </ul>
          </div>
          <div>
            <strong>components/ (展开):</strong>
            <ul>
              <li>图标名: {MaterialFileIcons.getIcon({ fileName: 'components', isFolder: true, isOpen: true })}</li>
              <li>CSS 类: {MaterialFileIcons.getIconClass({ fileName: 'components', isFolder: true, isOpen: true })}</li>
            </ul>
          </div>
        </div>
      </section>

      {/* 示例 6: 不同大小 */}
      <section style={{ marginBottom: 30 }}>
        <h3>不同图标大小</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <MaterialFileIcon fileName="index.ts" size={12} />
            <span>12px</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <MaterialFileIcon fileName="index.ts" size={16} />
            <span>16px</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <MaterialFileIcon fileName="index.ts" size={20} />
            <span>20px</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <MaterialFileIcon fileName="index.ts" size={24} />
            <span>24px</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <MaterialFileIcon fileName="index.ts" size={32} />
            <span>32px</span>
          </div>
        </div>
      </section>
    </div>
  );
};

// 文件树演示组件
interface TreeNode {
  name: string;
  type: 'file' | 'folder';
  children?: TreeNode[];
}

const FileTreeDemo: React.FC = () => {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['src']));

  const tree: TreeNode[] = [
    {
      name: 'src',
      type: 'folder',
      children: [
        {
          name: 'components',
          type: 'folder',
          children: [
            { name: 'App.tsx', type: 'file' },
            { name: 'Button.tsx', type: 'file' },
          ]
        },
        {
          name: 'utils',
          type: 'folder',
          children: [
            { name: 'helpers.ts', type: 'file' },
          ]
        },
        { name: 'index.ts', type: 'file' },
      ]
    },
    { name: 'package.json', type: 'file' },
    { name: 'README.md', type: 'file' },
  ];

  const toggleFolder = (name: string) => {
    setExpandedFolders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(name)) {
        newSet.delete(name);
      } else {
        newSet.add(name);
      }
      return newSet;
    });
  };

  const renderNode = (node: TreeNode, depth: number = 0) => {
    const isExpanded = expandedFolders.has(node.name);
    const paddingLeft = depth * 16;

    return (
      <div key={node.name}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 8px',
            paddingLeft: paddingLeft + 8,
            cursor: node.type === 'folder' ? 'pointer' : 'default',
            borderRadius: 4,
          }}
          onClick={() => node.type === 'folder' && toggleFolder(node.name)}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--vscode-list-hoverBackground, #f0f0f0)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          {node.type === 'folder' && (
            <span style={{ fontSize: 10, width: 12, textAlign: 'center' }}>
              {isExpanded ? '▼' : '▶'}
            </span>
          )}
          <MaterialFileIcon
            fileName={node.name}
            isFolder={node.type === 'folder'}
            isOpen={isExpanded}
            size={16}
          />
          <span>{node.name}</span>
        </div>
        {node.type === 'folder' && isExpanded && node.children && (
          <div>
            {node.children.map(child => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      style={{
        border: '1px solid var(--vscode-panel-border, #ddd)',
        borderRadius: 4,
        padding: 8,
        backgroundColor: 'var(--vscode-editor-background, white)',
      }}
    >
      {tree.map(node => renderNode(node))}
    </div>
  );
};

export default FileIconExample;
















