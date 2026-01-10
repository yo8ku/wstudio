/**
 * 终端面板组件
 * 功能：集成真实终端功能，支持命令执行和输出显示
 * 描述：基于 xterm.js 和 node-pty 的真实终端界面，支持命令历史
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { TerminalSession } from './TerminalSession';
import { TerminalHistory } from './TerminalHistory';
import { Resizer } from './Resizer';
import 'xterm/css/xterm.css';
import './TerminalPanel.scss';

export type ShellType = 'powershell' | 'cmd' | 'bash' | 'git-bash';

export interface TerminalPanelRef {
  createNewTerminal: () => void;
  clearTerminal: () => void;
}

interface TerminalPanelProps {
  onRefChange?: (ref: TerminalPanelRef) => void;
  shell?: ShellType;
  onShellChange?: (shell: ShellType) => void;
}

export const TerminalPanel: React.FC<TerminalPanelProps> = ({ onRefChange, shell: externalShell }) => {
  const [shell, setShell] = useState<ShellType>(externalShell || 'powershell');
  const [session, setSession] = useState<TerminalSession | null>(null);
  const [commandHistory, setCommandHistory] = useState<string[]>([]); // 命令历史列表
  const [historyWidth, setHistoryWidth] = useState(231); // 历史侧边栏宽度
  const terminalContainerRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<TerminalSession | null>(null);
  const pendingCommandRef = useRef<string | null>(null);

  // 同步 session 到 ref
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  // 轮询检查待执行命令（当 session.id 异步设置后执行）
  useEffect(() => {
    if (!session) return;
    
    const checkPendingCommand = setInterval(() => {
      if (session.id && pendingCommandRef.current) {
        const terminalAPI = window.electron?.terminal;
        if (terminalAPI) {
          terminalAPI.write(session.id, pendingCommandRef.current + '\r');
          console.log('[TerminalPanel] 执行待处理命令:', pendingCommandRef.current);
          pendingCommandRef.current = null;
        }
        clearInterval(checkPendingCommand);
      }
    }, 200);

    return () => clearInterval(checkPendingCommand);
  }, [session]);

  // 更新命令历史（从 session 获取）
  const updateCommandHistory = useCallback(() => {
    if (session) {
      const commands = session.getCommandHistory();
      // 倒序显示，最新的在前面
      setCommandHistory([...commands].reverse());
    }
  }, [session]);

  // 同步外部 shell 状态 - 当 shell 改变时重新创建终端
  useEffect(() => {
    if (externalShell && externalShell !== shell) {
      setShell(externalShell);
      // 销毁旧终端并创建新终端
      if (session) {
        session.dispose();
      }
      createTerminal(externalShell);
    }
  }, [externalShell]);

  // 获取 Shell 命令
  const getShellCommand = useCallback((shellType: ShellType): string => {
    switch (shellType) {
      case 'powershell':
        return 'powershell.exe';
      case 'cmd':
        return 'cmd.exe';
      case 'bash':
        return 'bash';
      case 'git-bash':
        return 'C:\\Program Files\\Git\\bin\\bash.exe';
      default:
        return 'powershell.exe';
    }
  }, []);

  // 创建终端
  const createTerminal = useCallback((shellType?: ShellType) => {
    const targetShell = shellType || shell;
    const newSession = new TerminalSession({
      shell: getShellCommand(targetShell),
    });
    setSession(newSession);
    return newSession;
  }, [shell, getShellCommand]);

  // 重新创建终端（清空并重新初始化）
  const createNewTerminal = useCallback(() => {
    if (session) {
      session.dispose();
    }
    createTerminal();
  }, [session, createTerminal]);

  // 初始化：创建终端
  useEffect(() => {
    let mounted = true;
    
    const tryCreateTerminal = () => {
      if (!mounted) return;
      
      const terminalAPI = window.electron?.terminal;
      if (!terminalAPI) {
        console.error('[TerminalPanel] terminalAPI 未定义');
        return;
      }
      
      // 创建终端
      createTerminal();
    };
    
    // 延迟一小段时间确保 DOM 准备好
    setTimeout(tryCreateTerminal, 100);

    // 组件卸载时销毁终端
    return () => {
      mounted = false;
      if (session) {
        session.dispose();
      }
    };
  }, []);

  // 挂载终端到 DOM
  useEffect(() => {
    if (session && terminalContainerRef.current) {
      // 清空容器
      terminalContainerRef.current.innerHTML = '';
      // 挂载终端
      session.attachTo(terminalContainerRef.current);
      
      // 窗口大小变化时调整终端大小
      const handleResize = () => {
        session.resize();
      };
      window.addEventListener('resize', handleResize);
      
      // 延迟调整大小（确保 DOM 已渲染）
      setTimeout(() => handleResize(), 100);
      
      // 定时更新命令历史（每秒检查一次）
      const historyTimer = setInterval(() => {
        updateCommandHistory();
      }, 1000);
      
      return () => {
        window.removeEventListener('resize', handleResize);
        clearInterval(historyTimer);
      };
    }
  }, [session, updateCommandHistory]);

  // 监听容器大小变化（ResizeObserver）- 使用防抖避免频繁触发
  useEffect(() => {
    if (session && terminalContainerRef.current) {
      let resizeTimeout: NodeJS.Timeout | null = null;
      
      const resizeObserver = new ResizeObserver(() => {
        // 清除之前的定时器
        if (resizeTimeout) {
          clearTimeout(resizeTimeout);
        }
        
        // 使用防抖：300ms 后才执行 resize
        resizeTimeout = setTimeout(() => {
          session.resize();
        }, 300);
      });

      resizeObserver.observe(terminalContainerRef.current);

      return () => {
        if (resizeTimeout) {
          clearTimeout(resizeTimeout);
        }
        resizeObserver.disconnect();
      };
    }
  }, [session]);

  // 监听外部命令执行事件
  useEffect(() => {
    const handleExecuteCommand = (event: CustomEvent<{ command: string }>) => {
      const currentSession = sessionRef.current;
      if (currentSession && currentSession.id) {
        const terminalAPI = window.electron?.terminal;
        if (terminalAPI) {
          // 写入命令并执行（添加回车）
          terminalAPI.write(currentSession.id, event.detail.command + '\r');
          console.log('[TerminalPanel] 执行命令:', event.detail.command);
        }
      } else {
        // session 还未就绪，保存命令待后续执行
        pendingCommandRef.current = event.detail.command;
        console.log('[TerminalPanel] 终端未就绪，命令已保存待执行:', event.detail.command);
      }
    };

    window.addEventListener('terminal:execute-command', handleExecuteCommand as EventListener);
    return () => {
      window.removeEventListener('terminal:execute-command', handleExecuteCommand as EventListener);
    };
  }, []); // 移除 session 依赖，使用 ref

  // 清除当前终端
  const handleClear = useCallback(() => {
    if (session) {
      session.clear();
    }
  }, [session]);

  // 清空命令历史
  const clearHistory = useCallback(() => {
    setCommandHistory([]);
    // 也可以清空 session 中的历史，但这里不清空，让用户可以继续用上下键浏览
  }, []);

  // 点击命令：填充到终端
  const selectCommand = useCallback((command: string) => {
    if (session && session.id) {
      const terminalAPI = window.electron?.terminal;
      if (terminalAPI) {
        // 直接写入命令到终端（不会自动执行）
        terminalAPI.write(session.id, command);
      }
    }
  }, [session]);


  // 调整历史侧边栏宽度
  const handleResize = useCallback((delta: number) => {
    setHistoryWidth(prev => {
      const newWidth = prev - delta; // 注意方向是反的
      return Math.max(200, Math.min(500, newWidth)); // 限制在 200-500px
    });
  }, []);

  // 暴露方法给父组件
  useEffect(() => {
    if (onRefChange) {
      onRefChange({
        createNewTerminal,
        clearTerminal: handleClear,
      });
    }
  }, [onRefChange, createNewTerminal, handleClear]);

  return (
    <div className="terminal-panel">
      {/* 终端内容 */}
      <div className="terminal-panel-content">
        <div 
          ref={terminalContainerRef} 
          className="terminal-panel-xterm"
        />
      </div>

      {/* 分隔条 */}
      <Resizer onResize={handleResize} direction="vertical" />

      {/* 右侧边栏 - 命令历史 */}
      <div 
        className="terminal-panel-sidebar"
        style={{ width: `${historyWidth}px` }}
      >
        <TerminalHistory
          commands={commandHistory}
          onSelectCommand={selectCommand}
          onClearHistory={clearHistory}
        />
      </div>
    </div>
  );
};
