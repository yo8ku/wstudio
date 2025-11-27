/**
 * 图标系统使用示例
 * 展示如何在应用中使用图标系统
 */

import React, { useEffect } from 'react';
import { Icon, initIconSystem } from './index';

/**
 * 应用初始化示例
 * 在应用入口处初始化图标系统
 */
export function App() {
  useEffect(() => {
    // 初始化图标系统
    initIconSystem();
  }, []);

  return (
    <div className="app">
      <h1>图标系统示例</h1>
      <IconExamples />
    </div>
  );
}

/**
 * 基础图标示例
 */
export function IconExamples() {
  return (
    <div className="icon-examples">
      <h2>基础图标</h2>
      <div className="icon-grid">
        {/* 文件夹图标 */}
        <div className="icon-item">
          <Icon name="folder" size={24} color="#dcb67a" />
          <span>folder</span>
        </div>
        
        <div className="icon-item">
          <Icon name="folder-open" size={24} color="#dcb67a" />
          <span>folder-open</span>
        </div>

        {/* 文件图标 */}
        <div className="icon-item">
          <Icon name="file" size={24} color="#d4d4d4" />
          <span>file</span>
        </div>

        <div className="icon-item">
          <Icon name="file-code" size={24} color="#519aba" />
          <span>file-code</span>
        </div>

        {/* 编程语言图标 */}
        <div className="icon-item">
          <Icon name="file-js" size={24} color="#f1dd3f" />
          <span>JavaScript</span>
        </div>

        <div className="icon-item">
          <Icon name="file-ts" size={24} color="#3178c6" />
          <span>TypeScript</span>
        </div>

        <div className="icon-item">
          <Icon name="file-html" size={24} color="#e44d26" />
          <span>HTML</span>
        </div>

        <div className="icon-item">
          <Icon name="file-css" size={24} color="#42a5f5" />
          <span>CSS</span>
        </div>

        {/* 工具图标 */}
        <div className="icon-item">
          <Icon name="settings" size={24} color="#78909c" />
          <span>settings</span>
        </div>

        <div className="icon-item">
          <Icon name="terminal" size={24} color="#89e051" />
          <span>terminal</span>
        </div>

        <div className="icon-item">
          <Icon name="git" size={24} color="#f34f29" />
          <span>git</span>
        </div>

        <div className="icon-item">
          <Icon name="package" size={24} color="#8bc34a" />
          <span>package</span>
        </div>
      </div>
    </div>
  );
}

/**
 * 交互式图标示例
 */
export function InteractiveIconExample() {
  const [size, setSize] = React.useState(24);
  const [color, setColor] = React.useState('#007acc');

  return (
    <div className="interactive-example">
      <h2>交互式图标</h2>
      
      <div className="icon-display">
        <Icon name="folder" size={size} color={color} />
      </div>

      <div className="controls">
        <label>
          大小: {size}px
          <input
            type="range"
            min="12"
            max="64"
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
          />
        </label>

        <label>
          颜色:
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
          />
        </label>
      </div>
    </div>
  );
}

/**
 * 可点击图标示例
 */
export function ClickableIconExample() {
  const [clicked, setClicked] = React.useState(false);

  return (
    <div className="clickable-example">
      <h2>可点击图标</h2>
      
      <Icon
        name={clicked ? 'folder-open' : 'folder'}
        size={32}
        color="#dcb67a"
        onClick={() => setClicked(!clicked)}
        style={{ cursor: 'pointer' }}
      />
      
      <p>{clicked ? '文件夹已打开' : '点击打开文件夹'}</p>
    </div>
  );
}

/**
 * 自定义样式示例
 */
export function StyledIconExample() {
  return (
    <div className="styled-example">
      <h2>自定义样式</h2>
      
      <div className="icon-list">
        {/* 带背景的图标 */}
        <Icon
          name="settings"
          size={24}
          color="#fff"
          style={{
            backgroundColor: '#007acc',
            borderRadius: '4px',
            padding: '8px',
          }}
        />

        {/* 带边框的图标 */}
        <Icon
          name="terminal"
          size={24}
          color="#89e051"
          style={{
            border: '2px solid #89e051',
            borderRadius: '50%',
            padding: '8px',
          }}
        />

        {/* 带阴影的图标 */}
        <Icon
          name="git"
          size={24}
          color="#f34f29"
          style={{
            filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))',
          }}
        />

        {/* 旋转的图标 */}
        <Icon
          name="settings"
          size={24}
          color="#78909c"
          style={{
            animation: 'spin 2s linear infinite',
          }}
        />
      </div>
    </div>
  );
}

/**
 * 文件列表示例
 */
export function FileListExample() {
  const files = [
    { name: 'App.tsx', type: 'file' },
    { name: 'index.ts', type: 'file' },
    { name: 'components', type: 'folder', expanded: false },
    { name: 'utils', type: 'folder', expanded: true },
    { name: 'README.md', type: 'file' },
  ];

  return (
    <div className="file-list-example">
      <h2>文件列表</h2>
      
      <ul className="file-list">
        {files.map((file, index) => (
          <li key={index} className="file-list-item">
            <Icon
              name={
                file.type === 'folder'
                  ? file.expanded
                    ? 'folder-open'
                    : 'folder'
                  : 'file'
              }
              size={16}
              color={file.type === 'folder' ? '#dcb67a' : '#d4d4d4'}
            />
            <span>{file.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

