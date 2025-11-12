/**
 * 常用片段面板组件
 * 功能：管理和显示代码片段
 * 描述：支持搜索、添加、编辑和使用代码片段
 */

import React, { useState, useCallback } from 'react';
import './SnippetsPanel.scss';

interface Snippet {
  id: string;
  title: string;
  description: string;
  code: string;
  language: string;
}

export const SnippetsPanel: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [snippets, setSnippets] = useState<Snippet[]>([
    {
      id: '1',
      title: 'React Component',
      description: 'Basic React functional component template',
      code: `import React from 'react';\n\ninterface Props {\n  // Add your props here\n}\n\nexport const Component: React.FC<Props> = (props) => {\n  return (\n    <div>\n      {/* Your component content */}\n    </div>\n  );\n};`,
      language: 'tsx'
    },
    {
      id: '2',
      title: 'useState Hook',
      description: 'React useState hook example',
      code: `const [state, setState] = useState<Type>(initialValue);`,
      language: 'tsx'
    },
    {
      id: '3',
      title: 'useEffect Hook',
      description: 'React useEffect hook example',
      code: `useEffect(() => {\n  // Effect logic here\n  \n  return () => {\n    // Cleanup logic\n  };\n}, [dependencies]);`,
      language: 'tsx'
    },
    {
      id: '4',
      title: 'Try-Catch',
      description: 'Error handling with try-catch',
      code: `try {\n  // Code that might throw an error\n} catch (error) {\n  console.error('Error:', error);\n}`,
      language: 'typescript'
    },
    {
      id: '5',
      title: 'Async Function',
      description: 'Async/await function template',
      code: `async function asyncFunction() {\n  try {\n    const result = await someAsyncOperation();\n    return result;\n  } catch (error) {\n    console.error('Error:', error);\n    throw error;\n  }\n}`,
      language: 'typescript'
    }
  ]);

  // 过滤片段
  const filteredSnippets = snippets.filter(snippet => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      snippet.title.toLowerCase().includes(query) ||
      snippet.description.toLowerCase().includes(query) ||
      snippet.code.toLowerCase().includes(query)
    );
  });

  // 复制到剪贴板
  const handleCopy = useCallback((code: string) => {
    navigator.clipboard.writeText(code).then(() => {
      // TODO: 显示成功提示
      console.log('Copied to clipboard');
    }).catch(err => {
      console.error('Failed to copy:', err);
    });
  }, []);

  // 插入到编辑器
  const handleInsert = useCallback((code: string) => {
    // TODO: 集成 Monaco 编辑API 插入代码
    console.log('Insert code:', code);
    handleCopy(code);
  }, [handleCopy]);

  // 添加新片段
  const handleAddSnippet = useCallback(async () => {
    console.log('[SnippetsPanel] 打开命令中心添加片段...');
    
    // 动态导入SnippetsCommandProvider
    const { SnippetsCommandProvider } = await import('../../../../command-center/SnippetsCommandProvider');
    
    // 使用静态方法显示片段选择器（会自动添加事件监听器）
    await SnippetsCommandProvider.showSnippetSelector();
  }, []);

  return (
    <div className="snippets-panel">
      {/* 工具栏*/}
      <div className="snippets-panel-toolbar">
        <input
          type="text"
          className="snippets-panel-search"
          placeholder="搜索片段..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <button 
          className="snippets-panel-add-btn"
          onClick={handleAddSnippet}
        >
          添加片段
        </button>
      </div>

      {/* 内容区域 */}
      <div className="snippets-panel-content">
        {filteredSnippets.length > 0 ? (
          <div className="snippets-panel-list">
            {filteredSnippets.map((snippet) => (
              <div 
                key={snippet.id} 
                className="snippets-panel-item"
                onClick={() => handleInsert(snippet.code)}
              >
                <div className="snippets-panel-item-header">
                  <div className="snippets-panel-item-title">{snippet.title}</div>
                  <div className="snippets-panel-item-language">{snippet.language}</div>
                </div>
                <div className="snippets-panel-item-description">
                  {snippet.description}
                </div>
                <div className="snippets-panel-item-code">
                  {snippet.code}
                </div>
                <div className="snippets-panel-item-actions">
                  <button
                    className="snippets-panel-item-action-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCopy(snippet.code);
                    }}
                  >
                    复制
                  </button>
                  <button
                    className="snippets-panel-item-action-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleInsert(snippet.code);
                    }}
                  >
                    插入
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="snippets-panel-empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
            <div className="snippets-panel-empty-title">
              {searchQuery ? '未找到匹配的片段' : '暂无代码片段'}
            </div>
            <div className="snippets-panel-empty-description">
              {searchQuery ? '尝试使用其他关键词搜索 ': "点击`添加片段`创建您的第一个代码片"}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};


