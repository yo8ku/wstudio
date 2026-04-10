/**
 * Renders a plugin-contributed workspace view inside the editor area and
 * relays the minimal interactive events back to the plugin runtime.
 */

import React from 'react';
import type { PluginUiEntrySnapshot } from '@note-studio/shared';
import { Icon } from '../../../Icons/Icon';
import { notification } from '../../../Notification';
import { usePluginUiEntries } from '../../../../hooks/usePluginUiEntries';
import { pluginUIService } from '../../../../services/PluginUIService';
import { ContextMenu, type ContextMenuItem } from '../../../Explorer/Common/ContextMenu';
import './PluginRuntimeView.scss';

const PLUGIN_RUNTIME_NODE_ID_ATTRIBUTE = 'data-plugin-runtime-node-id';
const PLUGIN_RUNTIME_AUTOFOCUS_ATTRIBUTE = 'data-plugin-runtime-autofocus';
const PLUGIN_RUNTIME_EDITING_ATTRIBUTE = 'data-plugin-runtime-editing';
const PLUGIN_RUNTIME_STICK_BOTTOM_ATTRIBUTE = 'data-plugin-runtime-stick-bottom';
const PLUGIN_CANVAS_NODE_ROOT_ATTRIBUTE = 'data-plugin-canvas-node-root';
const PLUGIN_RUNTIME_DISPATCH_VIEW_EVENT_CHANNEL = 'plugin-runtime:dispatch-view-event';
const WORKSPACE_FILE_DRAG_MIME_TYPE = 'application/x-note-studio-file-path';
const WORKSPACE_FILE_DROP_TYPES = [
  WORKSPACE_FILE_DRAG_MIME_TYPE,
  'text/plain',
  'text/uri-list',
] as const;

interface PluginRuntimeViewProps {
  readonly leafId: string;
  readonly title: string;
  readonly viewType: string;
  readonly sourcePath?: string | null;
  readonly html: string;
}

interface PluginRuntimeViewEventPayload {
  readonly leafId: string;
  readonly nodeId: string;
  readonly type: string;
  readonly key?: string;
  readonly clientX?: number;
  readonly clientY?: number;
  readonly button?: number;
  readonly elementX?: number;
  readonly elementY?: number;
  readonly deltaX?: number;
  readonly deltaY?: number;
  readonly surfaceWidth?: number;
  readonly surfaceHeight?: number;
  readonly value?: string;
  readonly checked?: boolean;
  readonly dataTransferTypes?: readonly string[];
  readonly dataTransferText?: string;
  readonly dataTransferUriList?: string;
  readonly dataTransferWorkspaceFilePath?: string;
}

interface ActiveEditableSnapshot {
  readonly nodeId: string;
  readonly tagName: 'INPUT' | 'TEXTAREA' | 'SELECT';
  readonly value: string;
  readonly selectionStart?: number;
  readonly selectionEnd?: number;
}

interface ActiveFocusableSnapshot {
  readonly nodeId: string;
}

interface CompositionStateSnapshot {
  readonly nodeId: string;
  readonly active: boolean;
}

function normalizeRuntimeMarkup(markup: string): string {
  return markup.replace(/ data-plugin-runtime-node-id="[^"]*"/g, '');
}

function resolveFileExtension(sourcePath: string | null | undefined): string | null {
  if (!sourcePath) {
    return null;
  }

  const normalizedPath = sourcePath.trim();
  const fileName = normalizedPath.split(/[\\/]/).at(-1) ?? '';
  const dotIndex = fileName.lastIndexOf('.');

  if (dotIndex < 0 || dotIndex === fileName.length - 1) {
    return null;
  }

  return fileName.slice(dotIndex + 1).toLowerCase();
}

function isCanvasRuntimeView(viewType: string, sourcePath: string | null | undefined): boolean {
  const normalizedViewType = viewType.trim().toLowerCase();
  const sourceExtension = resolveFileExtension(sourcePath);

  if (sourceExtension === 'canvas' || sourceExtension === 'canvs') {
    return true;
  }

  return normalizedViewType.includes('canvas') || normalizedViewType.includes('whiteboard');
}

function matchesPluginEntryScope(
  entry: PluginUiEntrySnapshot,
  viewType: string,
  sourcePath: string | null | undefined,
): boolean {
  const scope = entry.scope;

  if (scope === null) {
    return true;
  }

  if (scope.viewType !== undefined && scope.viewType !== viewType) {
    return false;
  }

  if (scope.fileExtensions === undefined || scope.fileExtensions.length === 0) {
    return true;
  }

  const sourceExtension = resolveFileExtension(sourcePath);

  if (sourceExtension === null) {
    return false;
  }

  return scope.fileExtensions.some((extension) => extension.replace(/^\./, '').toLowerCase() === sourceExtension);
}

function removeRepeatedChildSequence(rootElement: Element): boolean {
  const childElements = [...rootElement.children];

  if (childElements.length < 2 || childElements.length % 2 !== 0) {
    return false;
  }

  const midpoint = childElements.length / 2;
  const firstHalf = childElements.slice(0, midpoint).map((element) => normalizeRuntimeMarkup(element.outerHTML));
  const secondHalf = childElements.slice(midpoint).map((element) => normalizeRuntimeMarkup(element.outerHTML));
  const isRepeatedSequence = firstHalf.every((markup, index) => markup === secondHalf[index]);

  if (!isRepeatedSequence) {
    return false;
  }

  secondHalf.forEach((_markup, index) => {
    childElements[midpoint + index]?.remove();
  });

  return true;
}

function sanitizeRepeatedMarkupTree(rootElement: Element): boolean {
  let changed = false;

  for (const childElement of [...rootElement.children]) {
    if (sanitizeRepeatedMarkupTree(childElement)) {
      changed = true;
    }
  }

  const seenChildFingerprints = new Set<string>();

  for (const childElement of [...rootElement.children]) {
    const fingerprint = normalizeRuntimeMarkup(childElement.outerHTML);

    if (seenChildFingerprints.has(fingerprint)) {
      childElement.remove();
      changed = true;
      continue;
    }

    seenChildFingerprints.add(fingerprint);
  }

  if (removeRepeatedChildSequence(rootElement)) {
    changed = true;
  }

  return changed;
}

function sanitizeTopLevelDuplicateRoots(bodyElement: HTMLElement): boolean {
  const childElements = [...bodyElement.children];

  if (childElements.length < 2) {
    return false;
  }

  let changed = false;
  const seenFingerprints = new Set<string>();

  for (const childElement of childElements) {
    const fingerprint = normalizeRuntimeMarkup(childElement.outerHTML);

    if (seenFingerprints.has(fingerprint)) {
      childElement.remove();
      changed = true;
      continue;
    }

    seenFingerprints.add(fingerprint);
  }

  const remainingChildren = [...bodyElement.children];

  if (remainingChildren.length >= 2 && remainingChildren.length % 2 === 0) {
    const midpoint = remainingChildren.length / 2;
    const firstHalf = remainingChildren
      .slice(0, midpoint)
      .map((element) => normalizeRuntimeMarkup(element.outerHTML));
    const secondHalf = remainingChildren
      .slice(midpoint)
      .map((element) => normalizeRuntimeMarkup(element.outerHTML));
    const isRepeatedSequence = firstHalf.every((markup, index) => markup === secondHalf[index]);

    if (isRepeatedSequence) {
      secondHalf.forEach((_markup, index) => {
        remainingChildren[midpoint + index]?.remove();
      });
      changed = true;
    }
  }

  return changed;
}

function sanitizePluginRuntimeHtml(html: string): string {
  if (html.trim().length === 0) {
    return html;
  }

  const parser = new DOMParser();
  const parsedDocument = parser.parseFromString(html, 'text/html');
  const bodyElement = parsedDocument.body;
  const topLevelElements = [...bodyElement.children];

  if (topLevelElements.length === 0) {
    return html;
  }

  let changed = sanitizeTopLevelDuplicateRoots(bodyElement);

  for (const childElement of [...bodyElement.children]) {
    if (sanitizeRepeatedMarkupTree(childElement)) {
      changed = true;
    }
  }

  return changed ? bodyElement.innerHTML : html;
}

function resolveRuntimeNodeId(target: EventTarget | null): string | null {
  const targetElement = target instanceof Element
    ? target
    : target instanceof Node
      ? target.parentElement
      : null;

  if (targetElement === null) {
    return null;
  }

  const matchedElement = targetElement.closest(`[${PLUGIN_RUNTIME_NODE_ID_ATTRIBUTE}]`);
  if (matchedElement === null) {
    return null;
  }

  return matchedElement.getAttribute(PLUGIN_RUNTIME_NODE_ID_ATTRIBUTE);
}

function resolveRuntimeTargetElement(target: EventTarget | null): HTMLElement | null {
  const targetElement = target instanceof Element
    ? target
    : target instanceof Node
      ? target.parentElement
      : null;

  if (targetElement === null) {
    return null;
  }

  const matchedElement = targetElement.closest(`[${PLUGIN_RUNTIME_NODE_ID_ATTRIBUTE}]`);
  return matchedElement instanceof HTMLElement ? matchedElement : null;
}

function resolveCanvasNodeRootElement(target: EventTarget | null): HTMLElement | null {
  const targetElement = target instanceof Element
    ? target
    : target instanceof Node
      ? target.parentElement
      : null;

  if (targetElement === null) {
    return null;
  }

  const matchedElement = targetElement.closest(`[${PLUGIN_CANVAS_NODE_ROOT_ATTRIBUTE}="true"]`);
  return matchedElement instanceof HTMLElement ? matchedElement : null;
}

function resolveScrollableRuntimeTextarea(target: EventTarget | null): HTMLTextAreaElement | null {
  if (target instanceof HTMLTextAreaElement) {
    return target;
  }

  const targetElement = target instanceof Element
    ? target
    : target instanceof Node
      ? target.parentElement
      : null;

  if (targetElement === null) {
    return null;
  }

  const matchedElement = targetElement.closest('textarea');
  return matchedElement instanceof HTMLTextAreaElement ? matchedElement : null;
}

function shouldPreserveNativeRuntimeScroll(
  target: EventTarget | null,
): boolean {
  const textareaTarget = resolveScrollableRuntimeTextarea(target);

  if (textareaTarget === null) {
    return false;
  }

  return textareaTarget.scrollHeight > textareaTarget.clientHeight
    || textareaTarget.scrollWidth > textareaTarget.clientWidth;
}

function resolveValueSnapshot(
  target: EventTarget | null,
): Pick<PluginRuntimeViewEventPayload, 'value' | 'checked'> {
  if (target instanceof HTMLInputElement) {
    return {
      value: target.value,
      checked: target.type === 'checkbox' || target.type === 'radio' ? target.checked : undefined,
    };
  }

  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
    return {
      value: target.value,
    };
  }

  return {};
}

function hasWorkspaceFileDropPayload(dataTransfer: DataTransfer | null): boolean {
  if (dataTransfer === null) {
    return false;
  }

  const dragPayloadTypes = Array.from(dataTransfer.types);
  return WORKSPACE_FILE_DROP_TYPES.some((type) => dragPayloadTypes.includes(type));
}

function readDataTransferValue(dataTransfer: DataTransfer, type: string): string | undefined {
  const value = dataTransfer.getData(type);
  return value.trim().length > 0 ? value : undefined;
}

function createDataTransferSnapshot(
  dataTransfer: DataTransfer,
): Pick<
  PluginRuntimeViewEventPayload,
  | 'dataTransferTypes'
  | 'dataTransferText'
  | 'dataTransferUriList'
  | 'dataTransferWorkspaceFilePath'
> {
  return {
    dataTransferTypes: Array.from(dataTransfer.types),
    dataTransferText: readDataTransferValue(dataTransfer, 'text/plain'),
    dataTransferUriList: readDataTransferValue(dataTransfer, 'text/uri-list'),
    dataTransferWorkspaceFilePath: readDataTransferValue(dataTransfer, WORKSPACE_FILE_DRAG_MIME_TYPE),
  };
}

function focusEditableRuntimeElement(target: HTMLElement): boolean {
  const editableTarget = target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
    ? target
    : target.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select');

  if (editableTarget === null) {
    return false;
  }

  try {
    editableTarget.focus({ preventScroll: true });
  } catch {
    editableTarget.focus();
  }

  if (editableTarget instanceof HTMLInputElement || editableTarget instanceof HTMLTextAreaElement) {
    const cursorOffset = editableTarget.value.length;

    applyEditableSelection(editableTarget, cursorOffset, cursorOffset);
  }

  return true;
}

function applyEditableSelection(
  target: HTMLInputElement | HTMLTextAreaElement,
  selectionStart: number,
  selectionEnd: number,
): void {
  try {
    target.setSelectionRange(selectionStart, selectionEnd);
  } catch {
    return;
  }

  if (target instanceof HTMLInputElement && selectionStart === selectionEnd) {
    target.scrollLeft = selectionEnd >= target.value.length ? target.scrollWidth : target.scrollLeft;
  }

  if (target instanceof HTMLTextAreaElement && selectionStart === selectionEnd) {
    target.scrollLeft = selectionEnd >= target.value.length ? target.scrollWidth : target.scrollLeft;
    target.scrollTop = target.scrollHeight > (target.clientHeight + 1) && selectionEnd >= target.value.length
      ? target.scrollHeight
      : 0;
  }

  window.requestAnimationFrame(() => {
    if (!target.isConnected || document.activeElement !== target) {
      return;
    }

    try {
      target.setSelectionRange(selectionStart, selectionEnd);
    } catch {
      return;
    }

    if (target instanceof HTMLInputElement && selectionStart === selectionEnd) {
      target.scrollLeft = selectionEnd >= target.value.length ? target.scrollWidth : target.scrollLeft;
    }

    if (target instanceof HTMLTextAreaElement && selectionStart === selectionEnd) {
      target.scrollLeft = selectionEnd >= target.value.length ? target.scrollWidth : target.scrollLeft;
      target.scrollTop = target.scrollHeight > (target.clientHeight + 1) && selectionEnd >= target.value.length
        ? target.scrollHeight
        : 0;
    }
  });
}

function clearEditableRuntimeFocus(surfaceElement: HTMLElement, activeElement: Element | null): void {
  if (!(activeElement instanceof HTMLElement)) {
    return;
  }

  if (!surfaceElement.contains(activeElement)) {
    return;
  }

  const runtimeEditable = activeElement instanceof HTMLInputElement
    || activeElement instanceof HTMLTextAreaElement
    || activeElement instanceof HTMLSelectElement;

  if (!runtimeEditable) {
    return;
  }

  activeElement.blur();
  surfaceElement.focus();
}

function syncDisplayRuntimeTextareaViewport(surfaceElement: HTMLElement): void {
  const displayTextareas = surfaceElement.querySelectorAll<HTMLTextAreaElement>(
    `textarea[${PLUGIN_RUNTIME_STICK_BOTTOM_ATTRIBUTE}="true"]`,
  );

  for (const textareaElement of displayTextareas) {
    const applyBottomViewport = (): void => {
      if (!textareaElement.isConnected) {
        return;
      }

      textareaElement.scrollTop = Math.max(0, textareaElement.scrollHeight - textareaElement.clientHeight);
    };

    applyBottomViewport();
    window.requestAnimationFrame(applyBottomViewport);
  }
}

function isRuntimeElementVisible(target: HTMLElement): boolean {
  if (target.getClientRects().length === 0) {
    return false;
  }

  const computedStyle = window.getComputedStyle(target);
  return computedStyle.display !== 'none' && computedStyle.visibility !== 'hidden';
}

function captureActiveEditableSnapshot(target: EventTarget | null): ActiveEditableSnapshot | null {
  if (target instanceof HTMLInputElement) {
    return {
      nodeId: target.getAttribute(PLUGIN_RUNTIME_NODE_ID_ATTRIBUTE) ?? '',
      tagName: 'INPUT',
      value: target.value,
      selectionStart: target.selectionStart ?? undefined,
      selectionEnd: target.selectionEnd ?? undefined,
    };
  }

  if (target instanceof HTMLTextAreaElement) {
    return {
      nodeId: target.getAttribute(PLUGIN_RUNTIME_NODE_ID_ATTRIBUTE) ?? '',
      tagName: 'TEXTAREA',
      value: target.value,
      selectionStart: target.selectionStart ?? undefined,
      selectionEnd: target.selectionEnd ?? undefined,
    };
  }

  if (target instanceof HTMLSelectElement) {
    return {
      nodeId: target.getAttribute(PLUGIN_RUNTIME_NODE_ID_ATTRIBUTE) ?? '',
      tagName: 'SELECT',
      value: target.value,
    };
  }

  return null;
}

export const PluginRuntimeView: React.FC<PluginRuntimeViewProps> = ({
  leafId,
  title,
  viewType,
  sourcePath,
  html,
}) => {
  const canvasRuntimeView = React.useMemo(
    () => isCanvasRuntimeView(viewType, sourcePath),
    [sourcePath, viewType],
  );
  const sanitizedHtml = React.useMemo(() => sanitizePluginRuntimeHtml(html), [html]);
  const surfaceRef = React.useRef<HTMLDivElement | null>(null);
  const activeEditableSnapshotRef = React.useRef<ActiveEditableSnapshot | null>(null);
  const activeFocusableSnapshotRef = React.useRef<ActiveFocusableSnapshot | null>(null);
  const activeCompositionRef = React.useRef<CompositionStateSnapshot | null>(null);
  const [hostContextMenuPosition, setHostContextMenuPosition] = React.useState<{ x: number; y: number } | null>(null);
  const canvasToolbarEntries = usePluginUiEntries('canvasToolbar');
  const canvasTitleBarEntries = usePluginUiEntries('canvasTitleBar');
  const canvasContextMenuEntries = usePluginUiEntries('canvasContextMenu');
  const scopedCanvasToolbarEntries = React.useMemo(
    () => canvasToolbarEntries.filter((entry) => matchesPluginEntryScope(entry, viewType, sourcePath)),
    [canvasToolbarEntries, sourcePath, viewType],
  );
  const scopedCanvasTitleBarEntries = React.useMemo(
    () => canvasTitleBarEntries.filter((entry) => matchesPluginEntryScope(entry, viewType, sourcePath)),
    [canvasTitleBarEntries, sourcePath, viewType],
  );
  const scopedCanvasContextMenuEntries = React.useMemo(
    () => canvasContextMenuEntries.filter((entry) => matchesPluginEntryScope(entry, viewType, sourcePath)),
    [canvasContextMenuEntries, sourcePath, viewType],
  );
  const dispatchViewEvent = React.useCallback((payload: PluginRuntimeViewEventPayload): void => {
    void window.electron?.ipcRenderer.invoke(PLUGIN_RUNTIME_DISPATCH_VIEW_EVENT_CHANNEL, payload);
  }, []);
  const executePluginUiEntry = React.useCallback(async (entryId: string): Promise<void> => {
    try {
      await pluginUIService.executeEntry(entryId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notification.error(`执行插件白板入口失败: ${message}`);
    }
  }, []);
  const hostContextMenuItems = React.useMemo<ContextMenuItem[]>(() => (
    scopedCanvasContextMenuEntries.map((entry) => ({
      id: entry.id,
      label: entry.title,
      icon: entry.icon ?? undefined,
      onClick: () => {
        void executePluginUiEntry(entry.id);
      },
    }))
  ), [executePluginUiEntry, scopedCanvasContextMenuEntries]);

  const resolveElementCoordinateSnapshot = React.useCallback((
    target: EventTarget | null,
    clientX: number,
    clientY: number,
  ): {
    readonly elementX?: number;
    readonly elementY?: number;
  } => {
    const targetElement = target instanceof Element ? target : null;

    if (targetElement === null) {
      return {};
    }

    const bounds = targetElement.getBoundingClientRect();

    return {
      elementX: clientX - bounds.left,
      elementY: clientY - bounds.top,
    };
  }, []);
  const resolveSurfaceSizeSnapshot = React.useCallback(():
    Pick<PluginRuntimeViewEventPayload, 'surfaceWidth' | 'surfaceHeight'> => {
      const surfaceBounds = surfaceRef.current?.getBoundingClientRect();

      return {
        surfaceWidth: surfaceBounds?.width ?? undefined,
        surfaceHeight: surfaceBounds?.height ?? undefined,
      };
    },
  []);

  const handleMouseEvent = React.useCallback((
    type: 'click' | 'dblclick' | 'mousedown' | 'mouseup' | 'mousemove' | 'contextmenu',
    event: React.MouseEvent<HTMLDivElement>,
  ): void => {
    const runtimeTargetElement = resolveRuntimeTargetElement(event.target)
      ?? surfaceRef.current?.querySelector<HTMLElement>(`[${PLUGIN_RUNTIME_NODE_ID_ATTRIBUTE}]`)
      ?? null;
    const canvasNodeRootElement = resolveCanvasNodeRootElement(event.target);
    const nodeId = runtimeTargetElement?.getAttribute(PLUGIN_RUNTIME_NODE_ID_ATTRIBUTE) ?? null;

    if (nodeId === null) {
      return;
    }

    activeFocusableSnapshotRef.current = {
      nodeId,
    };

    const activeEditableSnapshot = captureActiveEditableSnapshot(event.target);
    if (activeEditableSnapshot !== null && activeEditableSnapshot.nodeId.length > 0) {
      activeEditableSnapshotRef.current = activeEditableSnapshot;
    } else if (
      type !== 'mousemove'
      && type !== 'mouseup'
      && surfaceRef.current !== null
      && document.activeElement !== surfaceRef.current
    ) {
      surfaceRef.current.focus();
    }

    dispatchViewEvent({
      leafId,
      nodeId,
      type,
      clientX: event.clientX,
      clientY: event.clientY,
      button: event.button,
      ...resolveElementCoordinateSnapshot(
        canvasNodeRootElement ?? runtimeTargetElement ?? event.target,
        event.clientX,
        event.clientY,
      ),
      ...resolveSurfaceSizeSnapshot(),
    });
  }, [dispatchViewEvent, leafId, resolveElementCoordinateSnapshot, resolveSurfaceSizeSnapshot]);

  const handleInputEvent = React.useCallback((
    type: 'input' | 'change',
    event: React.FormEvent<HTMLDivElement>,
  ): void => {
    const nodeId = resolveRuntimeNodeId(event.target);

    if (nodeId === null) {
      return;
    }

    const activeEditableSnapshot = captureActiveEditableSnapshot(event.target);
    if (activeEditableSnapshot !== null && activeEditableSnapshot.nodeId.length > 0) {
      activeEditableSnapshotRef.current = activeEditableSnapshot;
    }

    if (type === 'input' && activeCompositionRef.current?.nodeId === nodeId && activeCompositionRef.current.active) {
      return;
    }

    dispatchViewEvent({
      leafId,
      nodeId,
      type,
      ...resolveSurfaceSizeSnapshot(),
      ...resolveValueSnapshot(event.target),
    });
  }, [dispatchViewEvent, leafId, resolveSurfaceSizeSnapshot]);

  const handleCompositionEvent = React.useCallback((
    type: 'compositionstart' | 'compositionend',
    event: React.CompositionEvent<HTMLDivElement>,
  ): void => {
    const nodeId = resolveRuntimeNodeId(event.target);

    if (nodeId === null) {
      return;
    }

    const activeEditableSnapshot = captureActiveEditableSnapshot(event.target);
    if (activeEditableSnapshot !== null && activeEditableSnapshot.nodeId.length > 0) {
      activeEditableSnapshotRef.current = activeEditableSnapshot;
    }

    if (type === 'compositionstart') {
      activeCompositionRef.current = {
        nodeId,
        active: true,
      };
      return;
    }

    activeCompositionRef.current = null;
    dispatchViewEvent({
      leafId,
      nodeId,
      type: 'input',
      ...resolveSurfaceSizeSnapshot(),
      ...resolveValueSnapshot(event.target),
    });
  }, [dispatchViewEvent, leafId, resolveSurfaceSizeSnapshot]);

  const handleKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLDivElement>): void => {
    const targetNodeId = resolveRuntimeNodeId(event.target);
    const activeElementNodeId = resolveRuntimeNodeId(document.activeElement);
    const nodeId = targetNodeId
      ?? activeElementNodeId
      ?? activeFocusableSnapshotRef.current?.nodeId
      ?? null;

    if (nodeId === null) {
      return;
    }

    const activeEditableSnapshot = captureActiveEditableSnapshot(event.target);
    if (activeEditableSnapshot !== null && activeEditableSnapshot.nodeId.length > 0) {
      activeEditableSnapshotRef.current = activeEditableSnapshot;
    }

    if (
      activeEditableSnapshot !== null
      && (
        event.nativeEvent.isComposing
        || (activeCompositionRef.current?.nodeId === nodeId && activeCompositionRef.current.active)
      )
    ) {
      return;
    }

    dispatchViewEvent({
      leafId,
      nodeId,
      type: 'keydown',
      key: event.key,
      ...resolveSurfaceSizeSnapshot(),
    });
  }, [dispatchViewEvent, leafId, resolveSurfaceSizeSnapshot]);

  const handleKeyUp = React.useCallback((event: React.KeyboardEvent<HTMLDivElement>): void => {
    const targetNodeId = resolveRuntimeNodeId(event.target);
    const activeElementNodeId = resolveRuntimeNodeId(document.activeElement);
    const nodeId = targetNodeId
      ?? activeElementNodeId
      ?? activeFocusableSnapshotRef.current?.nodeId
      ?? null;

    if (nodeId === null) {
      return;
    }

    const activeEditableSnapshot = captureActiveEditableSnapshot(event.target);
    if (activeEditableSnapshot !== null && activeEditableSnapshot.nodeId.length > 0) {
      activeEditableSnapshotRef.current = activeEditableSnapshot;
    }

    dispatchViewEvent({
      leafId,
      nodeId,
      type: 'keyup',
      key: event.key,
      ...resolveSurfaceSizeSnapshot(),
    });
  }, [dispatchViewEvent, leafId, resolveSurfaceSizeSnapshot]);

  const handleWheel = React.useCallback((event: WheelEvent): void => {
    if (shouldPreserveNativeRuntimeScroll(event.target)) {
      return;
    }

    const nodeId = resolveRuntimeNodeId(event.target);

    if (nodeId === null) {
      return;
    }

    event.preventDefault();
    dispatchViewEvent({
      leafId,
      nodeId,
      type: 'wheel',
      clientX: event.clientX,
      clientY: event.clientY,
      deltaX: event.deltaX,
      deltaY: event.deltaY,
      ...resolveElementCoordinateSnapshot(event.target, event.clientX, event.clientY),
      ...resolveSurfaceSizeSnapshot(),
    });
  }, [dispatchViewEvent, leafId, resolveElementCoordinateSnapshot, resolveSurfaceSizeSnapshot]);

  const handleWorkspaceFileDragOver = React.useCallback((event: React.DragEvent<HTMLDivElement>): void => {
    if (!hasWorkspaceFileDropPayload(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleWorkspaceFileDrop = React.useCallback((event: React.DragEvent<HTMLDivElement>): void => {
    if (!hasWorkspaceFileDropPayload(event.dataTransfer)) {
      return;
    }

    const runtimeTargetElement = resolveRuntimeTargetElement(event.target);
    const nodeId = runtimeTargetElement?.getAttribute(PLUGIN_RUNTIME_NODE_ID_ATTRIBUTE) ?? null;

    if (nodeId === null) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';

    dispatchViewEvent({
      leafId,
      nodeId,
      type: 'drop',
      clientX: event.clientX,
      clientY: event.clientY,
      button: event.button,
      ...resolveElementCoordinateSnapshot(event.target, event.clientX, event.clientY),
      ...resolveSurfaceSizeSnapshot(),
      ...createDataTransferSnapshot(event.dataTransfer),
    });
  }, [dispatchViewEvent, leafId, resolveElementCoordinateSnapshot, resolveSurfaceSizeSnapshot]);

  const handleContextMenu = React.useCallback((event: React.MouseEvent<HTMLDivElement>): void => {
    event.preventDefault();

    if (scopedCanvasContextMenuEntries.length > 0) {
      event.stopPropagation();
      setHostContextMenuPosition({
        x: event.clientX,
        y: event.clientY,
      });
      return;
    }

    handleMouseEvent('contextmenu', event);
  }, [handleMouseEvent, scopedCanvasContextMenuEntries.length]);

  const renderHostAction = React.useCallback((entry: PluginUiEntrySnapshot): React.ReactElement => (
    <div
      key={entry.id}
      className="plugin-runtime-view__host-action"
      role="button"
      tabIndex={0}
      title={entry.tooltip ?? entry.title}
      onClick={() => {
        void executePluginUiEntry(entry.id);
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') {
          return;
        }

        event.preventDefault();
        void executePluginUiEntry(entry.id);
      }}
    >
      <Icon name={entry.icon ?? 'extensions'} size={14} />
      <span>{entry.text ?? entry.title}</span>
    </div>
  ), [executePluginUiEntry]);

  React.useEffect(() => {
    const surfaceElement = surfaceRef.current;

    if (surfaceElement === null) {
      return undefined;
    }

    const listener = (event: WheelEvent): void => {
      handleWheel(event);
    };
    surfaceElement.addEventListener('wheel', listener, { passive: false });

    return () => {
      surfaceElement.removeEventListener('wheel', listener);
    };
  }, [handleWheel]);

  React.useLayoutEffect(() => {
    const activeEditableSnapshot = activeEditableSnapshotRef.current;
    const activeFocusableSnapshot = activeFocusableSnapshotRef.current;
    const surfaceElement = surfaceRef.current;

    if (surfaceElement === null) {
      return;
    }

    syncDisplayRuntimeTextareaViewport(surfaceElement);

    const autoFocusTarget = surfaceElement.querySelector<HTMLElement>(`[${PLUGIN_RUNTIME_AUTOFOCUS_ATTRIBUTE}="true"]`);
    if (
      autoFocusTarget !== null
      && isRuntimeElementVisible(autoFocusTarget)
      && focusEditableRuntimeElement(autoFocusTarget)
    ) {
      activeEditableSnapshotRef.current = captureActiveEditableSnapshot(autoFocusTarget);
      return;
    }

    if (activeEditableSnapshot !== null) {
      const targetElement = surfaceElement.querySelector<HTMLElement>(
        `[${PLUGIN_RUNTIME_NODE_ID_ATTRIBUTE}="${activeEditableSnapshot.nodeId}"]`,
      );

      if (targetElement === null) {
        clearEditableRuntimeFocus(surfaceElement, document.activeElement);
        activeEditableSnapshotRef.current = null;
      } else if (!isRuntimeElementVisible(targetElement)) {
        clearEditableRuntimeFocus(surfaceElement, document.activeElement);
        activeEditableSnapshotRef.current = null;
      } else if (targetElement.dataset.pluginRuntimeEditing !== 'true') {
        clearEditableRuntimeFocus(surfaceElement, targetElement);
        activeEditableSnapshotRef.current = null;
      } else if (
        activeEditableSnapshot.tagName === 'INPUT'
        && targetElement instanceof HTMLInputElement
      ) {
        if (targetElement.value !== activeEditableSnapshot.value) {
          targetElement.value = activeEditableSnapshot.value;
        }

        targetElement.focus();
        if (
          activeEditableSnapshot.selectionStart !== undefined
          && activeEditableSnapshot.selectionEnd !== undefined
        ) {
          applyEditableSelection(
            targetElement,
            activeEditableSnapshot.selectionStart,
            activeEditableSnapshot.selectionEnd,
          );
        }
        return;
      } else if (
        activeEditableSnapshot.tagName === 'TEXTAREA'
        && targetElement instanceof HTMLTextAreaElement
      ) {
        if (targetElement.value !== activeEditableSnapshot.value) {
          targetElement.value = activeEditableSnapshot.value;
        }

        targetElement.focus();
        if (
          activeEditableSnapshot.selectionStart !== undefined
          && activeEditableSnapshot.selectionEnd !== undefined
        ) {
          applyEditableSelection(
            targetElement,
            activeEditableSnapshot.selectionStart,
            activeEditableSnapshot.selectionEnd,
          );
        }
        return;
      } else if (
        activeEditableSnapshot.tagName === 'SELECT'
        && targetElement instanceof HTMLSelectElement
      ) {
        if (targetElement.value !== activeEditableSnapshot.value) {
          targetElement.value = activeEditableSnapshot.value;
        }

        targetElement.focus();
        return;
      }
    }

    if (activeFocusableSnapshot === null) {
      return;
    }

    const focusTargetElement = surfaceElement.querySelector<HTMLElement>(
      `[${PLUGIN_RUNTIME_NODE_ID_ATTRIBUTE}="${activeFocusableSnapshot.nodeId}"]`,
    );

    if (focusTargetElement === null) {
      activeFocusableSnapshotRef.current = null;
      return;
    }

    if (document.activeElement !== surfaceElement) {
      surfaceElement.focus();
    }
  }, [sanitizedHtml]);

  if (sanitizedHtml.trim().length === 0) {
    return (
      <div className="plugin-runtime-view plugin-runtime-view--empty">
        <div className="plugin-runtime-view__empty">
          <strong>{title}</strong>
          <p>当前插件视图还没有可显示的内容。</p>
          <p>视图类型：{viewType}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`plugin-runtime-view ${canvasRuntimeView ? 'plugin-runtime-view--canvas' : ''}`}>
      <div
        ref={surfaceRef}
        className={`plugin-runtime-view__surface ${canvasRuntimeView ? 'plugin-runtime-view__surface--canvas' : ''}`}
        data-view-type={viewType}
        tabIndex={0}
        onClick={(event) => handleMouseEvent('click', event)}
        onDoubleClick={(event) => handleMouseEvent('dblclick', event)}
        onMouseDown={(event) => handleMouseEvent('mousedown', event)}
        onMouseMove={(event) => handleMouseEvent('mousemove', event)}
        onMouseUp={(event) => handleMouseEvent('mouseup', event)}
        onContextMenu={handleContextMenu}
        onInput={(event) => handleInputEvent('input', event)}
        onChange={(event) => handleInputEvent('change', event)}
        onCompositionStart={(event) => handleCompositionEvent('compositionstart', event)}
        onCompositionEnd={(event) => handleCompositionEvent('compositionend', event)}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        onDragEnter={handleWorkspaceFileDragOver}
        onDragOver={handleWorkspaceFileDragOver}
        onDrop={handleWorkspaceFileDrop}
        dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
      />
      {!canvasRuntimeView && (scopedCanvasToolbarEntries.length > 0 || scopedCanvasTitleBarEntries.length > 0) && (
        <div className="plugin-runtime-view__host-chrome">
          {scopedCanvasToolbarEntries.length > 0 && (
            <div className="plugin-runtime-view__host-toolbar">
              {scopedCanvasToolbarEntries.map(renderHostAction)}
            </div>
          )}
          {scopedCanvasTitleBarEntries.length > 0 && (
            <div className="plugin-runtime-view__host-title-actions">
              {scopedCanvasTitleBarEntries.map(renderHostAction)}
            </div>
          )}
        </div>
      )}
      {hostContextMenuPosition !== null && hostContextMenuItems.length > 0 && (
        <ContextMenu
          items={hostContextMenuItems}
          position={hostContextMenuPosition}
          onClose={() => setHostContextMenuPosition(null)}
        />
      )}
    </div>
  );
};
