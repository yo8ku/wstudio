/**
 * 状态栏组件
 * 功能：显示编辑器状态、扩展信息等
 */

import React, { useState, useEffect } from 'react';
import { BackgroundCoverControl } from '../BackgroundCover';
import './StatusBar.scss';

interface StatusBarProps {
}

export const StatusBar: React.FC<StatusBarProps> = () => {
  const [backgroundEnabled, setBackgroundEnabled] = useState(false);

  // 监听背景扩展的状态
  useEffect(() => {
    const checkBackgroundStatus = async () => {
      try {
        const electronAPI = (window as any).electronAPI;
        if (electronAPI && electronAPI.extension) {
          const extensions = await electronAPI.extension.list();
          const backgroundExt = extensions.find((ext: any) => 
            ext.id === 'shalldie-background' || ext.name === 'Background'
          );
          setBackgroundEnabled(backgroundExt?.enabled ?? false);
        }
      } catch (error) {
        console.error('[StatusBar] 检查背景扩展状态失败:', error);
      }
    };

    checkBackgroundStatus();
  }, []);

  // 切换背景扩展
  const toggleBackground = async () => {
    try {
      const electronAPI = (window as any).electronAPI;
      if (electronAPI && electronAPI.extension) {
        const extensions = await electronAPI.extension.list();
        const backgroundExt = extensions.find((ext: any) => 
          ext.id === 'shalldie-background' || ext.name === 'Background'
        );
        
        if (backgroundExt) {
          const newEnabled = !backgroundEnabled;
          await electronAPI.extension.toggle(backgroundExt.id, newEnabled);
          setBackgroundEnabled(newEnabled);
          console.log('[StatusBar] 背景扩展已', newEnabled ? '启用' : '禁用');
        }
      }
    } catch (error) {
      console.error('[StatusBar] 切换背景扩展失败:', error);
    }
  };

  return (
    <div className="status-bar">
      {/* 左侧：扩展状态 */}
      <div className="status-bar-left">
        {/* Background Cover 控制 */}
        <BackgroundCoverControl showInStatusBar={true} />
        
        {/* Background 扩展状态（shalldie-background）*/}
        <button 
          className={`status-bar-extension-btn ${backgroundEnabled ? 'enabled' : 'disabled'}`}
          onClick={toggleBackground}
          title={`Background 扩展: ${backgroundEnabled ? '已启用' : '已禁用'}\n点击切换`}
        >
          <svg 
            className="extension-icon"
            width="12"
            height="12"
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" 
            />
          </svg>
          <span className="extension-text">
            Background {backgroundEnabled ? '✓' : '✗'}
          </span>
        </button>
      </div>

      {/* 右侧：编辑器状态 */}
      <div className="status-bar-right">
        {/* 光标位置 */}
        <span className="status-bar-text">Ln 1, Col 1</span>
        
        {/* 文件编码 */}
        <button className="status-bar-info-btn">
          UTF-8
        </button>
        
        {/* 行尾序列 */}
        <button className="status-bar-info-btn">
          LF
        </button>
        
        {/* 语言模式 */}
        <button className="status-bar-info-btn">
          Markdown
        </button>

        {/* 通知 */}
        <button className="status-bar-icon-btn" title="通知">
          <svg className="status-bar-icon" width="12" height="12" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
          </svg>
        </button>

        {/* 反馈 */}
        <button className="status-bar-icon-btn" title="反馈">
          <svg className="status-bar-icon" width="12" height="12" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
          </svg>
        </button>
      </div>
    </div>
  );
};
