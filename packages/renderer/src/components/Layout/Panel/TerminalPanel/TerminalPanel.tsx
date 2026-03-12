/**
 * TerminalPanel 终端面板组件。
 * 负责终端实例挂载、可见性切换以及首屏尺寸稳定化。
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TerminalSession } from './TerminalSession';
import 'xterm/css/xterm.css';
import './TerminalPanel.scss';

export type ShellType = 'powershell' | 'cmd' | 'bash' | 'git-bash';

const POWERSHELL_TERMINAL_COMMAND =
  'powershell.exe -NoLogo -NoExit';

export interface TerminalPanelRef {
  createNewTerminal: () => void;
  clearTerminal: () => void;
}

interface TerminalPanelProps {
  onRefChange?: (ref: TerminalPanelRef) => void;
  shell?: ShellType;
  isVisible?: boolean;
  isLiveResizing?: boolean;
}

export const TerminalPanel: React.FC<TerminalPanelProps> = ({
  onRefChange,
  shell: externalShell,
  isVisible = true,
  isLiveResizing = false,
}) => {
  const [shell, setShell] = useState<ShellType>(externalShell || 'powershell');
  const [session, setSession] = useState<TerminalSession | null>(null);
  const terminalContainerRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<TerminalSession | null>(null);
  const pendingCommandRef = useRef<string | null>(null);
  const isWindowResizingRef = useRef(false);
  const windowResizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    if (!session || !isVisible) {
      isWindowResizingRef.current = false;
      if (windowResizeTimerRef.current) {
        clearTimeout(windowResizeTimerRef.current);
        windowResizeTimerRef.current = null;
      }
      return;
    }

    const handleWindowResize = () => {
      isWindowResizingRef.current = true;

      if (windowResizeTimerRef.current) {
        clearTimeout(windowResizeTimerRef.current);
      }

      windowResizeTimerRef.current = setTimeout(() => {
        isWindowResizingRef.current = false;
        session.resize();
        windowResizeTimerRef.current = null;
      }, 120);
    };

    window.addEventListener('resize', handleWindowResize);

    return () => {
      window.removeEventListener('resize', handleWindowResize);
      if (windowResizeTimerRef.current) {
        clearTimeout(windowResizeTimerRef.current);
        windowResizeTimerRef.current = null;
      }
      isWindowResizingRef.current = false;
    };
  }, [isVisible, session]);

  useEffect(() => {
    if (!session) {
      return;
    }

    const pendingCommandTimer = setInterval(() => {
      if (!session.id || !pendingCommandRef.current) {
        return;
      }

      const terminalAPI = window.electron?.terminal;
      if (terminalAPI) {
        terminalAPI.write(session.id, pendingCommandRef.current + '\r');
        pendingCommandRef.current = null;
      }

      clearInterval(pendingCommandTimer);
    }, 200);

    return () => clearInterval(pendingCommandTimer);
  }, [session]);

  const getShellCommand = useCallback((shellType: ShellType): string => {
    switch (shellType) {
      case 'powershell':
        return POWERSHELL_TERMINAL_COMMAND;
      case 'cmd':
        return 'cmd.exe';
      case 'bash':
        return 'bash';
      case 'git-bash':
        return 'C:\\Program Files\\Git\\bin\\bash.exe';
      default:
        return POWERSHELL_TERMINAL_COMMAND;
    }
  }, []);

  const createTerminal = useCallback((shellType?: ShellType) => {
    const targetShell = shellType || shell;
    const nextSession = new TerminalSession({
      shell: getShellCommand(targetShell),
    });

    setSession(nextSession);
    return nextSession;
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

    const terminalAPI = window.electron?.terminal;
    if (!terminalAPI) {
      console.error('[TerminalPanel] terminalAPI unavailable');
      return;
    }

    const frameId = requestAnimationFrame(() => {
      if (mounted) {
        createTerminal();
      }
    });

    return () => {
      mounted = false;
      cancelAnimationFrame(frameId);
      sessionRef.current?.dispose();
    };
  }, [createTerminal]);

  useEffect(() => {
    if (!session || !terminalContainerRef.current) {
      return;
    }

    let primaryFrameId = 0;
    let secondaryFrameId = 0;
    let settleTimerId: ReturnType<typeof setTimeout> | null = null;

    terminalContainerRef.current.innerHTML = '';
    session.attachTo(terminalContainerRef.current);

    primaryFrameId = requestAnimationFrame(() => {
      session.resize(true);
      secondaryFrameId = requestAnimationFrame(() => {
        session.resize(true);
      });
    });
    settleTimerId = setTimeout(() => {
      session.resize(true);
    }, 120);

    return () => {
      cancelAnimationFrame(primaryFrameId);
      cancelAnimationFrame(secondaryFrameId);
      if (settleTimerId) {
        clearTimeout(settleTimerId);
      }
    };
  }, [session]);

  useEffect(() => {
    if (!session || !terminalContainerRef.current || !isVisible) {
      return;
    }

    let frameId: number | null = null;

    const resizeObserver = new ResizeObserver(() => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }

      frameId = requestAnimationFrame(() => {
        frameId = null;

        if (isLiveResizing) {
          session.fit();
          return;
        }

        if (isWindowResizingRef.current) {
          session.resize();
          return;
        }

        session.resize();
      });
    });

    resizeObserver.observe(terminalContainerRef.current);

    return () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
      resizeObserver.disconnect();
    };
  }, [isLiveResizing, isVisible, session]);

  useEffect(() => {
    if (!session || !isVisible || isLiveResizing) {
      return;
    }

    const frameId = requestAnimationFrame(() => {
      session.resize(true);
    });

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [isLiveResizing, isVisible, session]);

  useEffect(() => {
    const handleExecuteCommand = (event: CustomEvent<{ command: string }>) => {
      const currentSession = sessionRef.current;
      if (currentSession?.id) {
        const terminalAPI = window.electron?.terminal;
        if (terminalAPI) {
          terminalAPI.write(currentSession.id, event.detail.command + '\r');
        }
        return;
      }

      pendingCommandRef.current = event.detail.command;
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
