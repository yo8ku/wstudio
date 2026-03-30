/**
 * Terminal panel component.
 * Manages multiple terminal sessions, active terminal switching, and the terminal option sidebar.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ContextMenu, type ContextMenuItem } from '../../../Explorer/Common/ContextMenu';
import { Icon } from '../../../Icons';
import { DeleteIcon } from '../../../Icons/DeleteIcon';
import { useExplorerStore } from '../../../../stores/explorerStore';
import { TerminalSession, type TerminalSessionOptions } from './TerminalSession';
import 'xterm/css/xterm.css';
import './TerminalPanel.scss';

export type ShellType = 'powershell' | 'cmd' | 'bash' | 'git-bash';

const POWERSHELL_TERMINAL_COMMAND =
  'powershell.exe -NoLogo -NoExit -NoProfile';
const TERMINAL_SCROLLBAR_FADE_STEP = 0.01;
const TERMINAL_SCROLLBAR_FADE_INTERVAL = 10;
const TERMINAL_SCROLLBAR_VISIBLE_OPACITY = 1;
const TERMINAL_WHEEL_LINE_HEIGHT = 16;
const TERMINAL_VISIBILITY_SETTLE_RESIZE_DELAY = 240;
const TERMINAL_SIDEBAR_DEFAULT_WIDTH = 120;
const TERMINAL_SIDEBAR_MIN_WIDTH = 48;
const TERMINAL_SIDEBAR_MAX_WIDTH = 280;
const TERMINAL_SIDEBAR_COLLAPSED_WIDTH = 72;
const TERMINAL_SIDEBAR_RESIZE_DRAG_WIDTH = 4;
const TERMINAL_COLOR_OPTIONS = [
  { id: 'default', label: '默认颜色', value: null },
  { id: 'blue', label: '蓝色', value: '#4ea1ff' },
  { id: 'cyan', label: '青色', value: '#46c2ff' },
  { id: 'green', label: '绿色', value: '#4ec9b0' },
  { id: 'lime', label: '黄绿', value: '#97d26b' },
  { id: 'yellow', label: '黄色', value: '#e5c453' },
  { id: 'amber', label: '琥珀', value: '#d7ba7d' },
  { id: 'orange', label: '橙色', value: '#f39c6b' },
  { id: 'magenta', label: '洋红', value: '#c586c0' },
  { id: 'pink', label: '粉色', value: '#ff7ab6' },
  { id: 'purple', label: '紫色', value: '#9d7cd8' },
  { id: 'red', label: '红色', value: '#f48771' },
] as const;

interface TerminalScrollbarState {
  hasViewport: boolean;
  hasScrollableContent: boolean;
  trackTop: number;
  trackHeight: number;
  thumbTop: number;
  thumbHeight: number;
}

interface TerminalEntry {
  id: string;
  title: string;
  session: TerminalSession;
  accentColor?: string | null;
}

interface TerminalPanelPersistenceState {
  activeTerminalId: string | null;
  shell: ShellType;
  sidebarWidth: number;
  terminalEntries: TerminalEntry[];
  terminalSequence: number;
}

interface TerminalPanelWindow extends Window {
  __noteStudioTerminalPanelPersistence?: TerminalPanelPersistenceState;
  __noteStudioTerminalPanelUnloadCleanupInstalled?: boolean;
}

interface TerminalPanelProps {
  createRequestId?: number;
  shell?: ShellType;
  isVisible?: boolean;
  isLiveResizing?: boolean;
}

interface TerminalSessionViewProps {
  session: TerminalSession;
  isActive: boolean;
  isVisible: boolean;
  isLiveResizing: boolean;
}

const INITIAL_SCROLLBAR_STATE: TerminalScrollbarState = {
  hasViewport: false,
  hasScrollableContent: false,
  trackTop: 0,
  trackHeight: 0,
  thumbTop: 0,
  thumbHeight: 0,
};

const getTerminalPanelPersistenceState = (): TerminalPanelPersistenceState => {
  if (typeof window === 'undefined') {
    return {
      activeTerminalId: null,
      shell: 'powershell',
      sidebarWidth: TERMINAL_SIDEBAR_DEFAULT_WIDTH,
      terminalEntries: [],
      terminalSequence: 0,
    };
  }

  const terminalWindow = window as TerminalPanelWindow;
  if (!terminalWindow.__noteStudioTerminalPanelPersistence) {
    terminalWindow.__noteStudioTerminalPanelPersistence = {
      activeTerminalId: null,
      shell: 'powershell',
      sidebarWidth: TERMINAL_SIDEBAR_DEFAULT_WIDTH,
      terminalEntries: [],
      terminalSequence: 0,
    };
  }

  return terminalWindow.__noteStudioTerminalPanelPersistence;
};

const terminalPanelPersistence = getTerminalPanelPersistenceState();

const disposePersistentTerminalPanelSessions = (): void => {
  terminalPanelPersistence.terminalEntries.forEach((entry) => {
    entry.session.dispose({ destroyTerminal: true });
  });
  terminalPanelPersistence.terminalEntries = [];
  terminalPanelPersistence.activeTerminalId = null;
  terminalPanelPersistence.terminalSequence = 0;
};

if (typeof window !== 'undefined') {
  const terminalWindow = window as TerminalPanelWindow;
  if (!terminalWindow.__noteStudioTerminalPanelUnloadCleanupInstalled) {
    terminalWindow.__noteStudioTerminalPanelUnloadCleanupInstalled = true;
    window.addEventListener('beforeunload', disposePersistentTerminalPanelSessions);
  }
}

const isActionKey = (event: React.KeyboardEvent<HTMLElement>): boolean => (
  event.key === 'Enter' || event.key === ' '
);

export const TerminalSessionView: React.FC<TerminalSessionViewProps> = ({
  session,
  isActive,
  isVisible,
  isLiveResizing,
}) => {
  const terminalContainerRef = useRef<HTMLDivElement>(null);
  const attachedRef = useRef(false);
  const isWindowResizingRef = useRef(false);
  const windowResizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ptySyncSuppressedUntilRef = useRef(0);
  const viewportRef = useRef<HTMLElement | null>(null);
  const scrollbarFrameRef = useRef<number | null>(null);
  const scrollbarStateRef = useRef<TerminalScrollbarState>(INITIAL_SCROLLBAR_STATE);
  const isScrollbarDraggingRef = useRef(false);
  const dragStartYRef = useRef(0);
  const dragStartScrollTopRef = useRef(0);
  const fadeAnimationRef = useRef<number | null>(null);
  const [scrollbarState, setScrollbarState] = useState(INITIAL_SCROLLBAR_STATE);
  const [isScrollbarDragging, setIsScrollbarDragging] = useState(false);
  const [isTerminalHovered, setIsTerminalHovered] = useState(false);
  const [scrollbarThumbOpacity, setScrollbarThumbOpacity] = useState(0);

  useEffect(() => {
    scrollbarStateRef.current = scrollbarState;
  }, [scrollbarState]);

  const updateScrollbarState = useCallback(() => {
    const viewport = terminalContainerRef.current?.querySelector('.xterm-viewport');
    if (!(viewport instanceof HTMLElement)) {
      viewportRef.current = null;
      setScrollbarState((previousState) => (
        previousState.hasViewport ? INITIAL_SCROLLBAR_STATE : previousState
      ));
      return;
    }

    viewportRef.current = viewport;
    const trackTop = viewport.offsetTop;
    const trackHeight = viewport.clientHeight;
    const { clientHeight, scrollHeight, scrollTop } = viewport;
    const hasScrollableContent = scrollHeight - clientHeight > 1;

    let thumbHeight = 0;
    let thumbTop = trackTop;

    if (hasScrollableContent && trackHeight > 0 && scrollHeight > 0) {
      const nextThumbHeight = Math.min(
        trackHeight,
        Math.max(Math.round(trackHeight * (clientHeight / scrollHeight)), 24)
      );
      const maxScrollTop = scrollHeight - clientHeight;
      const maxThumbOffset = Math.max(trackHeight - nextThumbHeight, 0);

      thumbHeight = nextThumbHeight;
      thumbTop = trackTop + (
        maxScrollTop > 0
          ? (scrollTop / maxScrollTop) * maxThumbOffset
          : 0
      );
    }

    setScrollbarState((previousState) => {
      if (
        previousState.hasViewport
        && previousState.hasScrollableContent === hasScrollableContent
        && previousState.trackTop === trackTop
        && previousState.trackHeight === trackHeight
        && previousState.thumbTop === thumbTop
        && previousState.thumbHeight === thumbHeight
      ) {
        return previousState;
      }

      return {
        hasViewport: true,
        hasScrollableContent,
        trackTop,
        trackHeight,
        thumbTop,
        thumbHeight,
      };
    });
  }, []);

  const scheduleScrollbarStateUpdate = useCallback(() => {
    if (scrollbarFrameRef.current !== null) {
      cancelAnimationFrame(scrollbarFrameRef.current);
    }

    scrollbarFrameRef.current = requestAnimationFrame(() => {
      scrollbarFrameRef.current = null;
      updateScrollbarState();
    });
  }, [updateScrollbarState]);

  const fadeInScrollbarThumb = useCallback(() => {
    if (fadeAnimationRef.current !== null) {
      window.clearTimeout(fadeAnimationRef.current);
      fadeAnimationRef.current = null;
    }

    setScrollbarThumbOpacity(TERMINAL_SCROLLBAR_VISIBLE_OPACITY);
  }, []);

  const fadeOutScrollbarThumb = useCallback(() => {
    if (fadeAnimationRef.current !== null) {
      window.clearTimeout(fadeAnimationRef.current);
      fadeAnimationRef.current = null;
    }

    let currentOpacity = TERMINAL_SCROLLBAR_VISIBLE_OPACITY;

    const animate = () => {
      currentOpacity -= TERMINAL_SCROLLBAR_FADE_STEP;

      if (currentOpacity <= 0) {
        setScrollbarThumbOpacity(0);
        fadeAnimationRef.current = null;
        return;
      }

      setScrollbarThumbOpacity(currentOpacity);
      fadeAnimationRef.current = window.setTimeout(() => {
        animate();
      }, TERMINAL_SCROLLBAR_FADE_INTERVAL) as unknown as number;
    };

    animate();
  }, []);

  useEffect(() => {
    if (!isVisible || !terminalContainerRef.current || attachedRef.current) {
      return;
    }

    const currentContainer = terminalContainerRef.current;
    let primaryFrameId = 0;
    let secondaryFrameId = 0;
    let settleTimerId: ReturnType<typeof setTimeout> | null = null;

    currentContainer.innerHTML = '';
    session.attachTo(currentContainer);
    attachedRef.current = true;
    ptySyncSuppressedUntilRef.current = Date.now() + 180;

    primaryFrameId = requestAnimationFrame(() => {
      session.fit('view:attach:raf-1');
      session.refreshViewport('view:attach:raf-1');
      secondaryFrameId = requestAnimationFrame(() => {
        session.fit('view:attach:raf-2');
        session.refreshViewport('view:attach:raf-2');
      });
    });

    settleTimerId = setTimeout(() => {
      session.fit('view:attach:settle');
      session.refreshViewport('view:attach:settle');
    }, 120);

    return () => {
      cancelAnimationFrame(primaryFrameId);
      cancelAnimationFrame(secondaryFrameId);
      if (settleTimerId) {
        clearTimeout(settleTimerId);
      }
    };
  }, [isVisible, session]);

  useEffect(() => () => {
    const currentContainer = terminalContainerRef.current;
    if (!attachedRef.current || !currentContainer) {
      return;
    }

    attachedRef.current = false;
    session.detach(currentContainer);
  }, [session]);

  useEffect(() => {
    if (!attachedRef.current || !isActive || !isVisible) {
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
        session.resize(false, 'view:window-resize:settle');
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
  }, [isActive, isVisible, session]);

  useEffect(() => {
    if (!attachedRef.current || !terminalContainerRef.current || !isActive || !isVisible) {
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
          session.fit('view:resize-observer:live-resize');
          return;
        }

        if (isWindowResizingRef.current) {
          session.fit('view:resize-observer:window-resize');
          return;
        }

        if (Date.now() < ptySyncSuppressedUntilRef.current) {
          session.fit('view:resize-observer:pty-sync-suppressed');
          return;
        }

        session.resize(false, 'view:resize-observer');
      });
    });

    resizeObserver.observe(terminalContainerRef.current);

    return () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
      resizeObserver.disconnect();
    };
  }, [isActive, isLiveResizing, isVisible, session]);

  useEffect(() => {
    if (!attachedRef.current || !isActive || !isVisible) {
      viewportRef.current = null;
      setScrollbarState((previousState) => (
        previousState.hasViewport ? INITIAL_SCROLLBAR_STATE : previousState
      ));
      setIsTerminalHovered(false);
      setScrollbarThumbOpacity(0);
      return;
    }

    let frameId = 0;
    let resizeObserver: ResizeObserver | null = null;
    let boundViewport: HTMLElement | null = null;
    const terminal = session.getTerminal();
    const terminalScrollSubscription = terminal.onScroll(() => {
      session.logViewportDiagnostics('event:terminal:onScroll');
      scheduleScrollbarStateUpdate();
    });
    const terminalResizeSubscription = terminal.onResize(() => {
      session.logViewportDiagnostics('event:terminal:onResize');
      scheduleScrollbarStateUpdate();
    });

    const handleViewportScroll = () => {
      session.logViewportDiagnostics('event:viewport:scroll');
      scheduleScrollbarStateUpdate();
    };

    const bindViewport = () => {
      const viewport = terminalContainerRef.current?.querySelector('.xterm-viewport');
      if (!(viewport instanceof HTMLElement)) {
        frameId = requestAnimationFrame(bindViewport);
        return;
      }

      boundViewport = viewport;
      viewportRef.current = viewport;
      viewport.addEventListener('scroll', handleViewportScroll, { passive: true });

      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => {
          scheduleScrollbarStateUpdate();
        });
        resizeObserver.observe(viewport);
      }

      scheduleScrollbarStateUpdate();
    };

    bindViewport();

    return () => {
      cancelAnimationFrame(frameId);
      terminalScrollSubscription.dispose();
      terminalResizeSubscription.dispose();
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      if (boundViewport) {
        boundViewport.removeEventListener('scroll', handleViewportScroll);
      }
    };
  }, [isActive, isVisible, scheduleScrollbarStateUpdate]);

  useEffect(() => {
    if (!attachedRef.current || !isActive || !isVisible || !terminalContainerRef.current) {
      return;
    }

    const currentContainer = terminalContainerRef.current;

    const handleTerminalWheel = (event: WheelEvent) => {
      if (event.ctrlKey) {
        return;
      }

      const viewport = viewportRef.current;
      if (!(viewport instanceof HTMLElement)) {
        return;
      }

      const maxScrollTop = viewport.scrollHeight - viewport.clientHeight;
      if (maxScrollTop <= 0) {
        return;
      }

      let deltaY = event.deltaY;
      if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
        deltaY *= TERMINAL_WHEEL_LINE_HEIGHT;
      } else if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
        deltaY *= viewport.clientHeight;
      }

      if (!Number.isFinite(deltaY) || deltaY === 0) {
        return;
      }

      const nextScrollTop = Math.min(
        Math.max(viewport.scrollTop + deltaY, 0),
        maxScrollTop
      );

      if (nextScrollTop === viewport.scrollTop) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      viewport.scrollTop = nextScrollTop;
      fadeInScrollbarThumb();
      scheduleScrollbarStateUpdate();
    };

    currentContainer.addEventListener('wheel', handleTerminalWheel, {
      passive: false,
      capture: true,
    });

    return () => {
      currentContainer.removeEventListener('wheel', handleTerminalWheel, true);
    };
  }, [fadeInScrollbarThumb, isActive, isVisible, scheduleScrollbarStateUpdate]);

  useEffect(() => {
    if (!attachedRef.current || !isActive || !isVisible) {
      return;
    }

    let primaryFrameId = 0;
    let secondaryFrameId = 0;
    let settleTimerId: ReturnType<typeof setTimeout> | null = null;

    primaryFrameId = requestAnimationFrame(() => {
      session.fit('view:active:raf-1');
      session.refreshViewport('view:active:raf-1');
      secondaryFrameId = requestAnimationFrame(() => {
        session.fit('view:active:raf-2');
        session.refreshViewport('view:active:raf-2');
      });
    });

    settleTimerId = setTimeout(() => {
      session.fit('view:active:settle-pre-create');
      ptySyncSuppressedUntilRef.current = Date.now() + TERMINAL_VISIBILITY_SETTLE_RESIZE_DELAY;
      session.ensurePtyCreated();
      session.resize(false, 'view:active:settle-post-create');
      session.refreshViewport('view:active:settle-post-create');
      session.focus();
    }, TERMINAL_VISIBILITY_SETTLE_RESIZE_DELAY);

    return () => {
      cancelAnimationFrame(primaryFrameId);
      cancelAnimationFrame(secondaryFrameId);
      if (settleTimerId) {
        clearTimeout(settleTimerId);
      }
    };
  }, [isActive, isVisible, session]);

  const handleTerminalMouseEnter = useCallback(() => {
    setIsTerminalHovered(true);
    fadeInScrollbarThumb();
  }, [fadeInScrollbarThumb]);

  const handleTerminalMouseLeave = useCallback(() => {
    setIsTerminalHovered(false);
    if (isScrollbarDraggingRef.current) {
      return;
    }

    fadeOutScrollbarThumb();
  }, [fadeOutScrollbarThumb]);

  const handleScrollbarThumbMouseMove = useCallback((event: MouseEvent) => {
    if (!isScrollbarDraggingRef.current) {
      return;
    }

    const viewport = viewportRef.current;
    if (!(viewport instanceof HTMLElement)) {
      return;
    }

    const { trackHeight, thumbHeight } = scrollbarStateRef.current;
    const maxScrollTop = viewport.scrollHeight - viewport.clientHeight;
    const maxThumbOffset = Math.max(trackHeight - thumbHeight, 0);

    if (maxScrollTop <= 0 || maxThumbOffset <= 0) {
      return;
    }

    const deltaY = event.clientY - dragStartYRef.current;
    const nextScrollTop = Math.min(
      Math.max(
        dragStartScrollTopRef.current + (deltaY * maxScrollTop) / maxThumbOffset,
        0
      ),
      maxScrollTop
    );

    viewport.scrollTop = nextScrollTop;
    scheduleScrollbarStateUpdate();
  }, [scheduleScrollbarStateUpdate]);

  const handleScrollbarThumbMouseUp = useCallback(() => {
    if (!isScrollbarDraggingRef.current) {
      return;
    }

    isScrollbarDraggingRef.current = false;
    setIsScrollbarDragging(false);
    window.removeEventListener('mousemove', handleScrollbarThumbMouseMove);
    window.removeEventListener('mouseup', handleScrollbarThumbMouseUp);

    if (isTerminalHovered) {
      fadeInScrollbarThumb();
      return;
    }

    fadeOutScrollbarThumb();
  }, [fadeInScrollbarThumb, fadeOutScrollbarThumb, handleScrollbarThumbMouseMove, isTerminalHovered]);

  const handleScrollbarThumbMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const viewport = viewportRef.current;
    if (!(viewport instanceof HTMLElement) || !scrollbarStateRef.current.hasScrollableContent) {
      return;
    }

    isScrollbarDraggingRef.current = true;
    setIsScrollbarDragging(true);
    fadeInScrollbarThumb();
    dragStartYRef.current = event.clientY;
    dragStartScrollTopRef.current = viewport.scrollTop;

    window.addEventListener('mousemove', handleScrollbarThumbMouseMove);
    window.addEventListener('mouseup', handleScrollbarThumbMouseUp);
  }, [fadeInScrollbarThumb, handleScrollbarThumbMouseMove, handleScrollbarThumbMouseUp]);

  const handleScrollbarTrackMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) {
      return;
    }

    const viewport = viewportRef.current;
    const {
      hasScrollableContent,
      trackHeight,
      thumbHeight,
    } = scrollbarStateRef.current;
    if (
      !(viewport instanceof HTMLElement)
      || !hasScrollableContent
      || trackHeight <= 0
      || thumbHeight <= 0
    ) {
      return;
    }

    const maxScrollTop = viewport.scrollHeight - viewport.clientHeight;
    const maxThumbOffset = Math.max(trackHeight - thumbHeight, 0);
    if (maxScrollTop <= 0 || maxThumbOffset <= 0) {
      return;
    }

    const trackBounds = event.currentTarget.getBoundingClientRect();
    const thumbOffset = Math.min(
      Math.max(event.clientY - trackBounds.top - thumbHeight / 2, 0),
      maxThumbOffset
    );

    viewport.scrollTop = (thumbOffset / maxThumbOffset) * maxScrollTop;
    scheduleScrollbarStateUpdate();
  }, [scheduleScrollbarStateUpdate]);

  useEffect(() => () => {
    if (scrollbarFrameRef.current !== null) {
      cancelAnimationFrame(scrollbarFrameRef.current);
    }
  }, []);

  useEffect(() => () => {
    if (fadeAnimationRef.current !== null) {
      window.clearTimeout(fadeAnimationRef.current);
    }
  }, []);

  useEffect(() => () => {
    window.removeEventListener('mousemove', handleScrollbarThumbMouseMove);
    window.removeEventListener('mouseup', handleScrollbarThumbMouseUp);
  }, [handleScrollbarThumbMouseMove, handleScrollbarThumbMouseUp]);

  return (
    <div className={`terminal-panel-view${isActive ? ' active' : ''}`} aria-hidden={!isActive}>
      <div
        className="terminal-panel-content"
        onMouseEnter={handleTerminalMouseEnter}
        onMouseLeave={handleTerminalMouseLeave}
      >
        <div
          ref={terminalContainerRef}
          className="terminal-panel-xterm"
        />
        {scrollbarState.hasViewport && isActive && (
          <div
            className="terminal-panel-scrollbar"
            style={{
              top: scrollbarState.trackTop,
              height: scrollbarState.trackHeight,
            }}
            onMouseDown={handleScrollbarTrackMouseDown}
            aria-hidden="true"
          >
            <div
              className={`terminal-panel-scrollbar-thumb${isScrollbarDragging ? ' is-dragging' : ''}`}
              style={{
                top: Math.max(scrollbarState.thumbTop - scrollbarState.trackTop, 0),
                height: scrollbarState.thumbHeight,
                opacity: scrollbarState.hasScrollableContent ? scrollbarThumbOpacity : 0,
              }}
              onMouseDown={handleScrollbarThumbMouseDown}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export const TerminalPanel: React.FC<TerminalPanelProps> = ({
  createRequestId = 0,
  shell: externalShell,
  isVisible = true,
  isLiveResizing = false,
}) => {
  const { t } = useTranslation();
  const translateText = useCallback((key: string, defaultValue: string): string => (
    String(t(key, { defaultValue }))
  ), [t]);
  const getTerminalColorLabel = useCallback((colorId: string): string => {
    switch (colorId) {
      case 'default':
        return translateText('terminalPanel.colors.default', '默认颜色');
      case 'blue':
        return translateText('terminalPanel.colors.blue', '蓝色');
      case 'cyan':
        return translateText('terminalPanel.colors.cyan', '青色');
      case 'green':
        return translateText('terminalPanel.colors.green', '绿色');
      case 'lime':
        return translateText('terminalPanel.colors.lime', '黄绿');
      case 'yellow':
        return translateText('terminalPanel.colors.yellow', '黄色');
      case 'amber':
        return translateText('terminalPanel.colors.amber', '琥珀');
      case 'orange':
        return translateText('terminalPanel.colors.orange', '橙色');
      case 'magenta':
        return translateText('terminalPanel.colors.magenta', '洋红');
      case 'pink':
        return translateText('terminalPanel.colors.pink', '粉色');
      case 'purple':
        return translateText('terminalPanel.colors.purple', '紫色');
      case 'red':
      default:
        return translateText('terminalPanel.colors.red', '红色');
    }
  }, [translateText]);
  const workspacePath = useExplorerStore((state) => state.workspacePath);
  const [resolvedWorkspacePath, setResolvedWorkspacePath] = useState(() => workspacePath.trim());
  const [isWorkspacePathReady, setIsWorkspacePathReady] = useState(() => Boolean(workspacePath.trim()));
  const [shell, setShell] = useState<ShellType>(() => externalShell || terminalPanelPersistence.shell || 'powershell');
  const [terminalEntries, setTerminalEntries] = useState<TerminalEntry[]>(() => [...terminalPanelPersistence.terminalEntries]);
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(() => (
    terminalPanelPersistence.activeTerminalId
    ?? terminalPanelPersistence.terminalEntries[0]?.id
    ?? null
  ));
  const [sidebarWidth, setSidebarWidth] = useState(() => terminalPanelPersistence.sidebarWidth || TERMINAL_SIDEBAR_DEFAULT_WIDTH);
  const [isSidebarResizing, setIsSidebarResizing] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    position: { x: number; y: number };
    terminalId: string;
  } | null>(null);
  const [renamingTerminalId, setRenamingTerminalId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const pendingCommandRef = useRef<string | null>(null);
  const terminalEntriesRef = useRef<TerminalEntry[]>([]);
  const activeTerminalIdRef = useRef<string | null>(null);
  const terminalSequenceRef = useRef(terminalPanelPersistence.terminalSequence);
  const initialShellRef = useRef<ShellType>(externalShell || terminalPanelPersistence.shell || 'powershell');
  const lastCreateRequestIdRef = useRef(createRequestId);
  const sidebarResizeStartXRef = useRef(0);
  const sidebarResizeStartWidthRef = useRef(TERMINAL_SIDEBAR_DEFAULT_WIDTH);
  const isSidebarResizingRef = useRef(false);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const normalizedWorkspacePath = workspacePath.trim();
    if (normalizedWorkspacePath) {
      setResolvedWorkspacePath(normalizedWorkspacePath);
      setIsWorkspacePathReady(true);
      return;
    }

    const workspaceAPI = window.electron?.workspace;
    if (!workspaceAPI?.getDir) {
      setResolvedWorkspacePath('');
      setIsWorkspacePathReady(true);
      return;
    }

    let isMounted = true;
    setIsWorkspacePathReady(false);

    void workspaceAPI.getDir().then((result) => {
      if (!isMounted) {
        return;
      }

      const fallbackWorkspacePath = result?.success
        ? String(result.data || '').trim()
        : '';
      setResolvedWorkspacePath(fallbackWorkspacePath);
    }).catch(() => {
      if (!isMounted) {
        return;
      }

      setResolvedWorkspacePath('');
    }).finally(() => {
      if (isMounted) {
        setIsWorkspacePathReady(true);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [workspacePath]);

  useEffect(() => {
    terminalEntriesRef.current = terminalEntries;
    terminalPanelPersistence.terminalEntries = terminalEntries;
  }, [terminalEntries]);

  useEffect(() => {
    activeTerminalIdRef.current = activeTerminalId;
    terminalPanelPersistence.activeTerminalId = activeTerminalId;
  }, [activeTerminalId]);

  useEffect(() => {
    terminalPanelPersistence.shell = shell;
  }, [shell]);

  useEffect(() => {
    terminalPanelPersistence.sidebarWidth = sidebarWidth;
  }, [sidebarWidth]);

  const handleSidebarResizeMove = useCallback((event: MouseEvent) => {
    if (!isSidebarResizingRef.current) {
      return;
    }

    const delta = sidebarResizeStartXRef.current - event.clientX;
    const nextWidth = Math.min(
      Math.max(sidebarResizeStartWidthRef.current + delta, TERMINAL_SIDEBAR_MIN_WIDTH),
      TERMINAL_SIDEBAR_MAX_WIDTH
    );

    setSidebarWidth(nextWidth);
  }, []);

  const handleSidebarResizeEnd = useCallback(() => {
    if (!isSidebarResizingRef.current) {
      return;
    }

    isSidebarResizingRef.current = false;
    setIsSidebarResizing(false);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    window.removeEventListener('mousemove', handleSidebarResizeMove);
    window.removeEventListener('mouseup', handleSidebarResizeEnd);
  }, [handleSidebarResizeMove]);

  const handleSidebarResizeStart = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const handleBounds = event.currentTarget.getBoundingClientRect();
    const isWithinDragHandle = event.clientX >= handleBounds.left
      && event.clientX <= handleBounds.left + TERMINAL_SIDEBAR_RESIZE_DRAG_WIDTH;

    if (!isWithinDragHandle) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    isSidebarResizingRef.current = true;
    setIsSidebarResizing(true);
    sidebarResizeStartXRef.current = event.clientX;
    sidebarResizeStartWidthRef.current = sidebarWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', handleSidebarResizeMove);
    window.addEventListener('mouseup', handleSidebarResizeEnd);
  }, [handleSidebarResizeEnd, handleSidebarResizeMove, sidebarWidth]);

  useEffect(() => () => {
    handleSidebarResizeEnd();
  }, [handleSidebarResizeEnd]);

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

  const getShellDisplayName = useCallback((shellType: ShellType): string => {
    switch (shellType) {
      case 'powershell':
        return 'PowerShell';
      case 'cmd':
        return 'Command Prompt';
      case 'bash':
        return 'Bash';
      case 'git-bash':
        return 'Git Bash';
      default:
        return 'Terminal';
    }
  }, []);

  const buildTerminalEntry = useCallback((targetShell: ShellType): TerminalEntry => {
    terminalSequenceRef.current += 1;
    terminalPanelPersistence.terminalSequence = terminalSequenceRef.current;
    const sequence = terminalSequenceRef.current;
    const sessionOptions: TerminalSessionOptions = {
      shell: getShellCommand(targetShell),
      cwd: resolvedWorkspacePath || undefined,
    };

    return {
      id: `terminal-${sequence}-${Date.now()}`,
      title: getShellDisplayName(targetShell),
      session: new TerminalSession(sessionOptions),
    };
  }, [getShellCommand, getShellDisplayName, resolvedWorkspacePath]);

  const createTerminalEntry = useCallback((targetShell?: ShellType) => {
    const nextEntry = buildTerminalEntry(targetShell || shell);
    setTerminalEntries((previousEntries) => [...previousEntries, nextEntry]);
    setActiveTerminalId(nextEntry.id);
    return nextEntry;
  }, [buildTerminalEntry, shell]);

  const setActiveTerminal = useCallback((terminalId: string) => {
    if (!terminalEntriesRef.current.some((entry) => entry.id === terminalId)) {
      return;
    }

    setActiveTerminalId(terminalId);
  }, []);

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const handleCancelRename = useCallback(() => {
    setRenamingTerminalId(null);
    setRenameValue('');
  }, []);

  const handleStartRename = useCallback((terminalId: string) => {
    const targetEntry = terminalEntriesRef.current.find((entry) => entry.id === terminalId);
    if (!targetEntry) {
      return;
    }

    setSidebarWidth((previousWidth) => Math.max(previousWidth, TERMINAL_SIDEBAR_DEFAULT_WIDTH));
    setRenamingTerminalId(terminalId);
    setRenameValue(targetEntry.title);
    window.requestAnimationFrame(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    });
  }, []);

  const handleConfirmRename = useCallback((terminalId: string) => {
    const targetEntry = terminalEntriesRef.current.find((entry) => entry.id === terminalId);
    if (!targetEntry) {
      handleCancelRename();
      return;
    }

    const nextTitle = renameValue.trim();
    if (!nextTitle || nextTitle === targetEntry.title) {
      handleCancelRename();
      return;
    }

    setTerminalEntries((previousEntries) => previousEntries.map((entry) => (
      entry.id === terminalId
        ? { ...entry, title: nextTitle }
        : entry
    )));
    handleCancelRename();
  }, [handleCancelRename, renameValue]);

  const openTerminalContextMenu = useCallback((terminalId: string, position: { x: number; y: number }) => {
    if (!terminalEntriesRef.current.some((entry) => entry.id === terminalId)) {
      return;
    }

    if (renamingTerminalId) {
      handleCancelRename();
    }

    setContextMenu({
      position,
      terminalId,
    });
  }, [handleCancelRename, renamingTerminalId]);

  const handleOptionContextMenu = useCallback((event: React.MouseEvent<HTMLDivElement>, terminalId: string) => {
    event.preventDefault();
    event.stopPropagation();
    openTerminalContextMenu(terminalId, { x: event.clientX - 2, y: event.clientY });
  }, [openTerminalContextMenu]);

  const resolveSidebarOptionIdAtPoint = useCallback((clientX: number, clientY: number): string | null => {
    const matchedElement = document.elementsFromPoint(clientX, clientY).find(
      (element): element is HTMLElement => (
        element instanceof HTMLElement
        && element.matches('.terminal-panel-option[data-terminal-id]')
      )
    );

    return matchedElement?.dataset.terminalId ?? null;
  }, []);

  const handleSidebarContextShieldMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    handleCloseContextMenu();
  }, [handleCloseContextMenu]);

  const handleSidebarContextShieldContextMenu = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const terminalId = resolveSidebarOptionIdAtPoint(event.clientX, event.clientY);
    if (!terminalId) {
      handleCloseContextMenu();
      return;
    }

    openTerminalContextMenu(terminalId, { x: event.clientX - 2, y: event.clientY });
  }, [handleCloseContextMenu, openTerminalContextMenu, resolveSidebarOptionIdAtPoint]);

  const setTerminalAccentColor = useCallback((terminalId: string, accentColor: string | null) => {
    setTerminalEntries((previousEntries) => previousEntries.map((entry) => (
      entry.id === terminalId
        ? { ...entry, accentColor }
        : entry
    )));
  }, []);

  const moveTerminalToEditorTab = useCallback((terminalId: string) => {
    const currentEntries = terminalEntriesRef.current;
    const targetEntry = currentEntries.find((entry) => entry.id === terminalId);
    if (!targetEntry) {
      return;
    }

    window.dispatchEvent(new CustomEvent('open-terminal-tab', {
      detail: {
        id: `editor-terminal-${terminalId}`,
        path: `terminal:/${terminalId}`,
        title: targetEntry.title,
        terminalSession: targetEntry.session,
        accentColor: targetEntry.accentColor ?? null,
      },
    }));

    if (contextMenu?.terminalId === terminalId) {
      setContextMenu(null);
    }

    if (renamingTerminalId === terminalId) {
      handleCancelRename();
    }

    const removedIndex = currentEntries.findIndex((entry) => entry.id === terminalId);
    const remainingEntries = currentEntries.filter((entry) => entry.id !== terminalId);
    if (remainingEntries.length === 0) {
      const fallbackEntry = buildTerminalEntry(shell);
      setTerminalEntries([fallbackEntry]);
      setActiveTerminalId(fallbackEntry.id);
      return;
    }

    const currentActiveId = activeTerminalIdRef.current;
    let nextActiveId = currentActiveId;
    if (currentActiveId === terminalId) {
      const nextIndex = Math.min(removedIndex, remainingEntries.length - 1);
      nextActiveId = remainingEntries[nextIndex]?.id ?? remainingEntries[0].id;
    }

    setTerminalEntries(remainingEntries);
    setActiveTerminalId(nextActiveId);
  }, [buildTerminalEntry, contextMenu?.terminalId, handleCancelRename, renamingTerminalId, shell]);

  const removeTerminal = useCallback((terminalId: string) => {
    const currentEntries = terminalEntriesRef.current;
    const removedIndex = currentEntries.findIndex((entry) => entry.id === terminalId);
    if (removedIndex < 0) {
      return;
    }

    if (contextMenu?.terminalId === terminalId) {
      setContextMenu(null);
    }

    if (renamingTerminalId === terminalId) {
      handleCancelRename();
    }

    const removedEntry = currentEntries[removedIndex];
    removedEntry.session.dispose({ destroyTerminal: true });

    const remainingEntries = currentEntries.filter((entry) => entry.id !== terminalId);
    if (remainingEntries.length === 0) {
      const fallbackEntry = buildTerminalEntry(shell);
      setTerminalEntries([fallbackEntry]);
      setActiveTerminalId(fallbackEntry.id);
      return;
    }

    const currentActiveId = activeTerminalIdRef.current;
    let nextActiveId = currentActiveId;
    if (currentActiveId === terminalId) {
      const nextIndex = Math.min(removedIndex, remainingEntries.length - 1);
      nextActiveId = remainingEntries[nextIndex]?.id ?? remainingEntries[0].id;
    }

    setTerminalEntries(remainingEntries);
    setActiveTerminalId(nextActiveId);
  }, [buildTerminalEntry, contextMenu?.terminalId, handleCancelRename, renamingTerminalId, shell]);

  const getContextMenuItems = useCallback((terminalId: string): ContextMenuItem[] => {
    const targetEntry = terminalEntriesRef.current.find((entry) => entry.id === terminalId);
    if (!targetEntry) {
      return [];
    }

    return [
      {
        id: 'rename-terminal',
        label: '重命名',
        onClick: () => handleStartRename(terminalId),
      },
      {
        id: 'change-terminal-color',
        label: '修改颜色',
        submenuType: 'hover',
        submenu: TERMINAL_COLOR_OPTIONS.map((option) => ({
          id: `terminal-color-${option.id}`,
          label: option.label,
          colorDot: option.value ?? 'var(--ws-panel-border, #808080)',
          selected: (targetEntry.accentColor ?? null) === option.value,
          onClick: () => setTerminalAccentColor(terminalId, option.value),
        })),
      },
      {
        id: 'move-terminal-to-tab',
        label: '移动到标签页',
        onClick: () => moveTerminalToEditorTab(terminalId),
      },
      {
        id: 'separator-terminal-actions',
        label: '',
        separator: true,
      },
      {
        id: 'kill-terminal',
        label: '杀死终端',
        onClick: () => removeTerminal(terminalId),
      },
    ];
  }, [handleStartRename, moveTerminalToEditorTab, removeTerminal, setTerminalAccentColor]);

  const translateContextMenuItems = useCallback((items: ContextMenuItem[]): ContextMenuItem[] => (
    items.map((item) => {
      switch (item.id) {
        case 'rename-terminal':
          return { ...item, label: translateText('terminalPanel.contextMenu.rename', '重命名') };
        case 'change-terminal-color':
          return {
            ...item,
            label: translateText('terminalPanel.contextMenu.changeColor', '修改颜色'),
            submenu: item.submenu?.map((submenuItem) => {
              const colorId = submenuItem.id.startsWith('terminal-color-')
                ? submenuItem.id.slice('terminal-color-'.length)
                : submenuItem.id;
              return {
                ...submenuItem,
                label: getTerminalColorLabel(colorId),
              };
            }),
          };
        case 'move-terminal-to-tab':
          return { ...item, label: translateText('terminalPanel.contextMenu.moveToTab', '移动到标签页') };
        case 'kill-terminal':
          return { ...item, label: translateText('terminalPanel.contextMenu.kill', '杀死终端') };
        default:
          return item;
      }
    })
  ), [getTerminalColorLabel, translateText]);

  useEffect(() => {
    if (!externalShell || externalShell === shell) {
      return;
    }

    setShell(externalShell);
    terminalEntriesRef.current.forEach((entry) => {
      entry.session.dispose({ destroyTerminal: true });
    });
    terminalPanelPersistence.terminalEntries = [];
    terminalPanelPersistence.activeTerminalId = null;

    const nextEntry = buildTerminalEntry(externalShell);
    setTerminalEntries([nextEntry]);
    setActiveTerminalId(nextEntry.id);
  }, [buildTerminalEntry, externalShell, shell]);

  useEffect(() => {
    if (createRequestId === lastCreateRequestIdRef.current) {
      return;
    }

    lastCreateRequestIdRef.current = createRequestId;
    createTerminalEntry();
  }, [createRequestId, createTerminalEntry]);

  useEffect(() => {
    let mounted = true;

    const terminalAPI = window.electron?.terminal;
    if (!terminalAPI) {
      console.error('[TerminalPanel] terminalAPI unavailable');
      return;
    }

    const frameId = requestAnimationFrame(() => {
      if (!mounted || !isVisible || !isWorkspacePathReady || terminalEntriesRef.current.length > 0) {
        return;
      }

      const nextEntry = buildTerminalEntry(initialShellRef.current);
      setTerminalEntries([nextEntry]);
      setActiveTerminalId(nextEntry.id);
    });

    return () => {
      mounted = false;
      cancelAnimationFrame(frameId);
      terminalPanelPersistence.terminalEntries = terminalEntriesRef.current;
      terminalPanelPersistence.activeTerminalId = activeTerminalIdRef.current;
      terminalPanelPersistence.shell = shell;
      terminalPanelPersistence.sidebarWidth = sidebarWidth;
      terminalPanelPersistence.terminalSequence = terminalSequenceRef.current;
    };
  }, [buildTerminalEntry, isVisible, isWorkspacePathReady, shell, sidebarWidth]);

  useEffect(() => {
    if (terminalEntries.length === 0) {
      setActiveTerminalId(null);
      return;
    }

    if (!activeTerminalId || !terminalEntries.some((entry) => entry.id === activeTerminalId)) {
      setActiveTerminalId(terminalEntries[0].id);
    }
  }, [activeTerminalId, terminalEntries]);

  const activeTerminalEntry = useMemo(() => (
    terminalEntries.find((entry) => entry.id === activeTerminalId) ?? null
  ), [activeTerminalId, terminalEntries]);
  const shouldShowSidebar = terminalEntries.length > 1;
  const isSidebarCollapsed = sidebarWidth <= TERMINAL_SIDEBAR_COLLAPSED_WIDTH;
  const isSidebarContextMenuOpen = contextMenu !== null;

  useEffect(() => {
    if (!isVisible || !activeTerminalEntry) {
      return;
    }

    let frameId = 0;
    let settleTimerId: ReturnType<typeof setTimeout> | null = null;

    frameId = requestAnimationFrame(() => {
      activeTerminalEntry.session.resize(false, 'view:sidebar-layout-change:raf');
    });

    settleTimerId = setTimeout(() => {
      activeTerminalEntry.session.resize(false, 'view:sidebar-layout-change:settle');
    }, 120);

    return () => {
      cancelAnimationFrame(frameId);
      if (settleTimerId) {
        clearTimeout(settleTimerId);
      }
    };
  }, [activeTerminalEntry, isVisible, shouldShowSidebar, sidebarWidth]);

  useEffect(() => {
    if (!shouldShowSidebar) {
      handleSidebarResizeEnd();
      handleCloseContextMenu();
      handleCancelRename();
    }
  }, [handleCancelRename, handleCloseContextMenu, handleSidebarResizeEnd, shouldShowSidebar]);

  useEffect(() => {
    if (contextMenu && !terminalEntries.some((entry) => entry.id === contextMenu.terminalId)) {
      handleCloseContextMenu();
    }
  }, [contextMenu, handleCloseContextMenu, terminalEntries]);

  useEffect(() => {
    if (renamingTerminalId && !terminalEntries.some((entry) => entry.id === renamingTerminalId)) {
      handleCancelRename();
    }
  }, [handleCancelRename, renamingTerminalId, terminalEntries]);

  useEffect(() => {
    if (!isSidebarContextMenuOpen) {
      return;
    }

    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement && activeElement.closest('.terminal-panel-sidebar')) {
      activeElement.blur();
    }
  }, [isSidebarContextMenuOpen]);

  useEffect(() => {
    if (!activeTerminalEntry) {
      return;
    }

    const pendingCommandTimer = setInterval(() => {
      if (!activeTerminalEntry.session.id || !pendingCommandRef.current) {
        return;
      }

      const terminalAPI = window.electron?.terminal;
      if (terminalAPI) {
        terminalAPI.write(activeTerminalEntry.session.id, pendingCommandRef.current + '\r');
        pendingCommandRef.current = null;
      }

      clearInterval(pendingCommandTimer);
    }, 200);

    return () => clearInterval(pendingCommandTimer);
  }, [activeTerminalEntry]);

  useEffect(() => {
    const handleExecuteCommand = (event: CustomEvent<{ command: string }>) => {
      const terminalAPI = window.electron?.terminal;
      if (activeTerminalEntry?.session.id && terminalAPI) {
        terminalAPI.write(activeTerminalEntry.session.id, event.detail.command + '\r');
        return;
      }

      pendingCommandRef.current = event.detail.command;
    };

    window.addEventListener('terminal:execute-command', handleExecuteCommand as EventListener);
    return () => {
      window.removeEventListener('terminal:execute-command', handleExecuteCommand as EventListener);
    };
  }, [activeTerminalEntry]);

  return (
    <div
      className="terminal-panel"
      style={{ '--terminal-sidebar-width': `${sidebarWidth}px` } as React.CSSProperties}
    >
      <div className={`terminal-panel-main${shouldShowSidebar ? ' terminal-panel-main--with-sidebar' : ''}`}>
        {terminalEntries.map((entry) => (
          <TerminalSessionView
            key={entry.id}
            session={entry.session}
            isActive={entry.id === activeTerminalId}
            isVisible={isVisible && entry.id === activeTerminalId}
            isLiveResizing={isLiveResizing && entry.id === activeTerminalId}
          />
        ))}
      </div>

      {shouldShowSidebar && (
        <>
          <div
            className={`terminal-panel-sidebar-resize-handle${isSidebarResizing ? ' is-resizing' : ''}`}
            onMouseDown={handleSidebarResizeStart}
            aria-hidden="true"
          />

          <div
            className={`terminal-panel-sidebar${isSidebarCollapsed ? ' terminal-panel-sidebar--collapsed' : ''}${isSidebarContextMenuOpen ? ' terminal-panel-sidebar--menu-open' : ''}`}
            style={{ width: `${sidebarWidth}px` }}
          >
            <div className="terminal-panel-sidebar-list">
              {isSidebarContextMenuOpen && (
                <div
                  className="terminal-panel-sidebar-context-shield"
                  aria-hidden="true"
                  onMouseDown={handleSidebarContextShieldMouseDown}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onContextMenu={handleSidebarContextShieldContextMenu}
                />
              )}
              {terminalEntries.map((entry) => (
                (() => {
                  const isRenaming = renamingTerminalId === entry.id;
                  const isContextMenuOpen = contextMenu?.terminalId === entry.id;
                  const shouldShowContextMenuOutline = isContextMenuOpen && entry.id !== activeTerminalId;

                  return (
                    <div
                      key={entry.id}
                      className={`terminal-panel-option${entry.id === activeTerminalId ? ' active' : ''}${isRenaming ? ' terminal-panel-option--renaming' : ''}${shouldShowContextMenuOutline ? ' terminal-panel-option--context-open' : ''}`}
                      data-terminal-id={entry.id}
                      style={{
                        '--terminal-option-accent': entry.accentColor ?? 'currentColor',
                      } as React.CSSProperties}
                      role={isRenaming ? undefined : 'button'}
                      tabIndex={isRenaming || isSidebarContextMenuOpen ? -1 : 0}
                      onClick={isRenaming ? undefined : () => {
                        if (isSidebarContextMenuOpen) {
                          return;
                        }

                        setActiveTerminal(entry.id);
                      }}
                      onContextMenu={(event) => handleOptionContextMenu(event, entry.id)}
                      onKeyDown={isRenaming ? undefined : (event) => {
                        if (isSidebarContextMenuOpen) {
                          event.preventDefault();
                          return;
                        }

                        if (!isActionKey(event)) {
                          return;
                        }

                        event.preventDefault();
                        setActiveTerminal(entry.id);
                      }}
                      title={entry.title}
                    >
                      <div className="terminal-panel-option-main">
                        <Icon
                          name="terminal"
                          size={18}
                          className="terminal-panel-option-icon"
                        />
                        {isRenaming ? (
                          <input
                            ref={renameInputRef}
                            className="terminal-panel-option-rename-input"
                            value={renameValue}
                            onChange={(event) => setRenameValue(event.target.value)}
                            onBlur={() => handleConfirmRename(entry.id)}
                            onClick={(event) => event.stopPropagation()}
                            onMouseDown={(event) => event.stopPropagation()}
                            onContextMenu={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                            }}
                            onKeyDown={(event) => {
                              event.stopPropagation();

                              if (event.key === 'Enter') {
                                event.preventDefault();
                                handleConfirmRename(entry.id);
                                return;
                              }

                              if (event.key === 'Escape') {
                                event.preventDefault();
                                handleCancelRename();
                              }
                            }}
                          />
                        ) : (
                          <span className="terminal-panel-option-label">{entry.title}</span>
                        )}
                        <div
                          className="terminal-panel-option-close"
                          role="button"
                          tabIndex={isSidebarContextMenuOpen ? -1 : 0}
                          onClick={(event) => {
                            event.stopPropagation();

                            if (isSidebarContextMenuOpen) {
                              return;
                            }

                            removeTerminal(entry.id);
                          }}
                          onKeyDown={(event) => {
                            if (isSidebarContextMenuOpen) {
                              event.preventDefault();
                              event.stopPropagation();
                              return;
                            }

                            if (!isActionKey(event)) {
                              return;
                            }

                            event.preventDefault();
                            event.stopPropagation();
                            removeTerminal(entry.id);
                          }}
                          title={translateText('terminalPanel.actions.kill', '杀死终端')}
                        >
                          <DeleteIcon size={18} />
                        </div>
                      </div>
                    </div>
                  );
                })()
              ))}
            </div>
          </div>
        </>
      )}

      {contextMenu && (
        <ContextMenu
          items={translateContextMenuItems(getContextMenuItems(contextMenu.terminalId))}
          position={contextMenu.position}
          horizontalAnchor="right"
          onClose={handleCloseContextMenu}
        />
      )}
    </div>
  );
};
