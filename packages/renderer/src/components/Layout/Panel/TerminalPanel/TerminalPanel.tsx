import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TerminalSession } from './TerminalSession';
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
}

export const TerminalPanel: React.FC<TerminalPanelProps> = ({ onRefChange, shell: externalShell }) => {
  const [shell, setShell] = useState<ShellType>(externalShell || 'powershell');
  const [session, setSession] = useState<TerminalSession | null>(null);
  const terminalContainerRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<TerminalSession | null>(null);
  const pendingCommandRef = useRef<string | null>(null);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    if (!session) {
      return;
    }

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

  const createTerminal = useCallback((shellType?: ShellType) => {
    const targetShell = shellType || shell;
    const newSession = new TerminalSession({
      shell: getShellCommand(targetShell),
    });

    setSession(newSession);
    return newSession;
  }, [getShellCommand, shell]);

  useEffect(() => {
    if (externalShell && externalShell !== shell) {
      setShell(externalShell);
      sessionRef.current?.dispose();
      createTerminal(externalShell);
    }
  }, [createTerminal, externalShell, shell]);

  const createNewTerminal = useCallback(() => {
    sessionRef.current?.dispose();
    createTerminal();
  }, [createTerminal]);

  useEffect(() => {
    let mounted = true;

    const tryCreateTerminal = () => {
      if (!mounted) {
        return;
      }

      const terminalAPI = window.electron?.terminal;
      if (!terminalAPI) {
        console.error('[TerminalPanel] terminalAPI 未定义');
        return;
      }

      createTerminal();
    };

    setTimeout(tryCreateTerminal, 100);

    return () => {
      mounted = false;
      sessionRef.current?.dispose();
    };
  }, []);

  useEffect(() => {
    if (!session || !terminalContainerRef.current) {
      return;
    }

    terminalContainerRef.current.innerHTML = '';
    session.attachTo(terminalContainerRef.current);

    const handleWindowResize = () => {
      session.resize();
    };

    window.addEventListener('resize', handleWindowResize);
    setTimeout(() => handleWindowResize(), 100);

    return () => {
      window.removeEventListener('resize', handleWindowResize);
    };
  }, [session]);

  useEffect(() => {
    if (!session || !terminalContainerRef.current) {
      return;
    }

    let resizeTimeout: NodeJS.Timeout | null = null;

    const resizeObserver = new ResizeObserver(() => {
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }

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
  }, [session]);

  useEffect(() => {
    const handleExecuteCommand = (event: CustomEvent<{ command: string }>) => {
      const currentSession = sessionRef.current;
      if (currentSession && currentSession.id) {
        const terminalAPI = window.electron?.terminal;
        if (terminalAPI) {
          terminalAPI.write(currentSession.id, event.detail.command + '\r');
          console.log('[TerminalPanel] 执行命令:', event.detail.command);
        }
        return;
      }

      pendingCommandRef.current = event.detail.command;
      console.log('[TerminalPanel] 终端未就绪，命令已保存待执行:', event.detail.command);
    };

    window.addEventListener('terminal:execute-command', handleExecuteCommand as EventListener);
    return () => {
      window.removeEventListener('terminal:execute-command', handleExecuteCommand as EventListener);
    };
  }, []);

  const handleClear = useCallback(() => {
    sessionRef.current?.clear();
  }, []);

  useEffect(() => {
    if (!onRefChange) {
      return;
    }

    onRefChange({
      createNewTerminal,
      clearTerminal: handleClear,
    });
  }, [createNewTerminal, handleClear, onRefChange]);

  return (
    <div className="terminal-panel">
      <div className="terminal-panel-content">
        <div
          ref={terminalContainerRef}
          className="terminal-panel-xterm"
        />
      </div>
    </div>
  );
};
