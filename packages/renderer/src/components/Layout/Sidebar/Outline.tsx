/**
 * 大纲组件
 * 显示当前文件的代码结构
 */

import React, { useState } from 'react';

interface OutlineItem {
  id: string;
  name: string;
  type: 'interface' | 'function' | 'component' | 'hook' | 'export';
  children?: OutlineItem[];
  isExpanded?: boolean;
}

export const Outline: React.FC = () => {
  const [outlineData, setOutlineData] = useState<OutlineItem[]>([
    {
      id: '1',
      name: 'IExplorerProps',
      type: 'interface',
    },
    {
      id: '2',
      name: 'ExplorerView',
      type: 'component',
      isExpanded: true,
      children: [
        {
          id: '2-1',
          name: 'useState',
          type: 'hook',
        },
        {
          id: '2-2',
          name: 'useEffect',
          type: 'hook',
        },
        {
          id: '2-3',
          name: 'handleNewFile',
          type: 'function',
        }
      ]
    },
    {
      id: '3',
      name: 'export default',
      type: 'export',
    }
  ]);

  const toggleItem = (id: string) => {
    const updateOutline = (items: OutlineItem[]): OutlineItem[] => {
      return items.map(item => {
        if (item.id === id) {
          return { ...item, isExpanded: !item.isExpanded };
        }
        if (item.children) {
          return { ...item, children: updateOutline(item.children) };
        }
        return item;
      });
    };
    setOutlineData(updateOutline(outlineData));
  };

  const getIcon = (type: OutlineItem['type']) => {
    switch (type) {
      case 'interface':
        return (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M11.5 7a.5.5 0 0 0-.5.5V9H5V7.5a.5.5 0 0 0-1 0v1a.5.5 0 0 0 .5.5h6a.5.5 0 0 0 .5-.5v-1a.5.5 0 0 0-.5-.5z" />
            <path d="M2.5 2A1.5 1.5 0 0 0 1 3.5v9A1.5 1.5 0 0 0 2.5 14h11a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 13.5 2h-11zm11 1a.5.5 0 0 1 .5.5v9a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5v-9a.5.5 0 0 1 .5-.5h11z" />
          </svg>
        );
      case 'component':
        return (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492zM5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0z" />
            <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52l-.094-.319zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.291c.415.764-.42 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.42-1.184-1.185l.159-.291A1.873 1.873 0 0 0 1.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 0 0 3.06 4.377l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.115l.094-.319z" />
          </svg>
        );
      case 'function':
      case 'hook':
        return (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M4.5 6a.5.5 0 0 0-.5.5v5a.5.5 0 0 0 1 0V11h1.5a2.5 2.5 0 1 0 0-5H4.5zm1.5 4H5V7h1a1.5 1.5 0 0 1 0 3z" />
            <path d="M9 6.5v5a.5.5 0 0 0 1 0v-5a.5.5 0 0 0-1 0zm2.5 0a.5.5 0 0 1 1 0v5a.5.5 0 0 1-1 0v-5z" />
          </svg>
        );
      case 'export':
        return (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1a.5.5 0 0 1 .5.5v11.793l3.146-3.147a.5.5 0 0 1 .708.708l-4 4a.5.5 0 0 1-.708 0l-4-4a.5.5 0 0 1 .708-.708L7.5 13.293V1.5A.5.5 0 0 1 8 1z" />
          </svg>
        );
      default:
        return null;
    }
  };

  const ChevronIcon = ({ isExpanded }: { isExpanded: boolean }) => (
    <svg 
      width="16" 
      height="16" 
      viewBox="0 0 16 16" 
      fill="currentColor"
      style={{ transform: isExpanded ? 'rotate(90deg)' : 'none' }}
    >
      <path d="M6 4l4 4-4 4V4z" />
    </svg>
  );

  const renderOutlineItem = (item: OutlineItem, level = 0) => {
    const hasChildren = item.children && item.children.length > 0;

    return (
      <div key={item.id} className="outline-node" style={{ position: 'relative' }}>
        <div
          className="outline-item"
          style={{ paddingLeft: `${level * 20 + 8}px` }}
          onClick={() => hasChildren && toggleItem(item.id)}
        >
          {level > 0 && (
            <div
              className="indent-guide"
              style={{
                position: 'absolute',
                left: `${(level - 1) * 20 + 12}px`,
                top: 0,
                bottom: 0,
                width: '1px',
                background: 'var(--indent-guide-bg, rgba(255, 255, 255, 0.08))'
              }}
            />
          )}
          {hasChildren ? (
            <span className="chevron">
              <ChevronIcon isExpanded={item.isExpanded || false} />
            </span>
          ) : (
            <span className="chevron-placeholder"></span>
          )}
          <span className="icon">{getIcon(item.type)}</span>
          <span className="name">{item.name}</span>
        </div>
        {hasChildren && item.isExpanded && (
          <>
            {item.children!.map(child => renderOutlineItem(child, level + 1))}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="outline">
      {outlineData.map(item => renderOutlineItem(item))}

      <style>{`
        .outline {
          padding: 0;
        }

        .outline-item {
          display: flex;
          align-items: center;
          padding: 0 6px 0 0;
          cursor: pointer;
          font-size: 13px;
          user-select: none;
          line-height: 20px;
        }

        .outline-item:hover {
          background: var(--hover-bg, rgba(255, 255, 255, 0.1));
        }

        .chevron {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          margin-right: 4px;
          opacity: 0.8;
          width: 16px;
          height: 16px;
        }

        .chevron-placeholder {
          display: inline-block;
          width: 16px;
          margin-right: 4px;
        }

        .icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          margin-right: 6px;
          width: 16px;
          height: 16px;
          color: var(--sidebar-fg, currentColor);
        }

        .name {
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-family: var(--font-mono, 'Consolas', monospace);
        }
      `}</style>
    </div>
  );
};
