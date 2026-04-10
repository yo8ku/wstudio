/**
 * 假白板最小演示插件：
 * 用于验证插件 ItemView 在主区域的最小白板承载能力，包含节点编辑与独立场景文件持久化。
 */
import {
  ItemView,
  Menu,
  Notice,
  Plugin,
  SuggestModal,
  TFile,
  type TAbstractFile,
  type JsonObject,
  type JsonValue,
  type PluginFailureContext,
  type UrlMetadataResult,
  type ViewStateResult,
  type WorkspaceLeaf,
} from '@note-studio/plugin';

const DEMO_VIEW_TYPE = 'wstudio-demo-canvas-host-view';
const DEMO_TITLE = '假白板最小演示';
const SCENE_FOLDER_PATH = 'plugin-api-demo/canvas-host';
const SCENE_FILE_PATH = `${SCENE_FOLDER_PATH}/fake-whiteboard.canvas`;
const CANVAS_FILE_EXTENSIONS = ['canvas', 'canvs'] as const;

const OPEN_DEMO_COMMAND_ID = 'open-fake-canvas-demo';
const CREATE_NEW_SCENE_FILE_COMMAND_ID = 'create-fake-canvas-scene-file';
const RESET_SCENE_COMMAND_ID = 'reset-fake-canvas-demo';
const ADD_NODE_COMMAND_ID = 'add-fake-canvas-node';
const ADD_CONNECTED_NODE_COMMAND_ID = 'add-linked-fake-canvas-node';
const ADD_NOTE_NODE_COMMAND_ID = 'add-fake-canvas-note-node';
const ADD_FILE_NODE_COMMAND_ID = 'add-fake-canvas-file-node';
const ADD_URL_NODE_COMMAND_ID = 'add-fake-canvas-url-node';
const ADD_GROUP_NODE_COMMAND_ID = 'add-fake-canvas-group-node';
const REMOVE_SELECTED_NODE_COMMAND_ID = 'remove-selected-fake-canvas-node';
const REMOVE_SELECTED_LINES_COMMAND_ID = 'remove-selected-fake-canvas-lines';
const SAVE_SCENE_COMMAND_ID = 'save-fake-canvas-scene';
const LOAD_SCENE_COMMAND_ID = 'load-fake-canvas-scene';
const OPEN_SCENE_FILE_COMMAND_ID = 'open-fake-canvas-scene-file';
const WORKSPACE_FILE_DRAG_MIME_TYPE = 'application/x-note-studio-file-path';
const CANVAS_COMMAND_CATEGORY = '白板';

const TEXT_NODE_WIDTH = 220;
const TEXT_NODE_HEIGHT = 44;
const TEXT_NODE_MULTI_LINE_HEIGHT = 72;
const TEXT_NODE_LINE_HEIGHT = 28;
const CARD_WIDTH = 248;
const CARD_HEIGHT = 148;
const GROUP_NODE_WIDTH = 420;
const GROUP_NODE_HEIGHT = 280;
const FLOATING_PANEL_WIDTH = 220;
const FLOATING_PANEL_INSET = 16;
const GROUP_NODE_PADDING = 36;
const PERSISTENT_SELECTION_BOX_PADDING = 10;
const MIN_NODE_WIDTH = 180;
const MIN_NODE_HEIGHT = 96;
const NODE_RESIZE_FRAME_OUTSET = 8;
const NODE_RESIZE_EDGE_HIT_SIZE = 2;
const NODE_RESIZE_CORNER_HIT_SIZE = 6;
const COMPACT_TEXT_NODE_RESIZE_FRAME_OUTSET = 4;
const COMPACT_TEXT_NODE_RESIZE_EDGE_HIT_SIZE = 1;
const COMPACT_TEXT_NODE_RESIZE_CORNER_HIT_SIZE = 4;
const NODE_BORDER_WIDTH = '2px';
const SELECTED_NODE_OUTLINE_WIDTH = '2px';
const SELECTED_NODE_BORDER_COLOR = 'var(--ws-focus-border, var(--focus-border, #007acc))';
const GROUP_NODE_Z_INDEX = '0';
const NODE_BASE_Z_INDEX = '1';
const NODE_SELECTED_Z_INDEX = '2';
const NODE_ACTIVE_Z_INDEX = '3';
const AUTO_SAVE_DELAY_MS = 420;
const MIN_SCALE = 0.5;
const MAX_SCALE = 2;
const HOST_MOUSE_POINTER_ID = 1;
const NODE_DOUBLE_CLICK_THRESHOLD_MS = 360;
const NODE_DOUBLE_CLICK_DISTANCE_THRESHOLD = 8;
const NODE_ACTIVATION_DEBOUNCE_MS = 320;
const CANVAS_SCHEMA_KIND = 'wstudio.canvas';
const CANVAS_SCHEMA_VERSION = 2;
const LEGACY_CANVAS_SCHEMA_VERSION = 1;
const CANVAS_SCHEMA_GENERATOR = 'wstudio-plugin-demo-canvas-host';

type ViewConstructorArgument = string | number | boolean | bigint | symbol | object | null | undefined;
type NodeId = string;
type CanvasNodeType = 'text' | 'note' | 'file' | 'url' | 'group';
type DragMode = 'none' | 'node' | 'pan' | 'select' | 'selection-box' | 'resize';
type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
type WorkspaceFileNodeType = 'note' | 'file';
type ScenePoint = { readonly x: number; readonly y: number };
const RESIZE_DIRECTIONS: readonly ResizeDirection[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

interface ResizeHitAreaMetrics {
  readonly frameOutset: number;
  readonly edgeHitSize: number;
  readonly cornerHitSize: number;
}

interface HostAugmentedMouseEvent extends MouseEvent {
  readonly elementX?: number;
  readonly elementY?: number;
  readonly deltaX?: number;
  readonly deltaY?: number;
  readonly surfaceWidth?: number;
  readonly surfaceHeight?: number;
}

interface CanvasNodeState {
  readonly id: NodeId;
  readonly type: CanvasNodeType;
  readonly title: string;
  readonly body: string;
  readonly accent: string;
  readonly shadow: string;
  readonly x: number;
  readonly y: number;
  readonly targetPath?: string;
  readonly url?: string;
  readonly width?: number;
  readonly height?: number;
  readonly groupId?: NodeId;
}

interface CanvasLineState {
  readonly id: string;
  readonly from: NodeId;
  readonly to: NodeId;
  readonly label: string;
}

interface CanvasLineRuntime {
  readonly holderEl: HTMLElement;
  readonly lineEl: HTMLElement;
  readonly labelEl: HTMLElement;
}

interface CanvasNodeRuntime {
  readonly nodeEl: HTMLElement;
  readonly resizeFrameEl: HTMLElement;
  readonly contentShellEl: HTMLElement;
  readonly typeEl: HTMLElement;
  readonly titleEl: HTMLElement;
  readonly metaEl: HTMLElement;
  readonly bodyEl: HTMLElement;
  readonly urlPreviewEl: HTMLElement;
  readonly inlineEditTriggerEl: HTMLElement;
  readonly inlineEditorEl: HTMLElement | null;
  readonly inlineTitleInputEl: HTMLInputElement | HTMLTextAreaElement;
  readonly inlineUrlInputEl: HTMLInputElement;
  readonly inlineBodyInputEl: HTMLTextAreaElement;
  readonly inlineHintEl: HTMLElement;
  readonly resizeHandleEl: HTMLElement;
  readonly resizeHitAreaEls: Readonly<Record<ResizeDirection, HTMLElement>>;
}

interface CanvasSelectionSnapshot {
  readonly selectedNodeId: NodeId | null;
  readonly selectedNodeIds: readonly NodeId[];
  readonly inlineEditingNodeId: NodeId | null;
  readonly persistentSelectionBoxActive: boolean;
}

interface SceneRenderOptions {
  readonly syncStructure?: boolean;
  readonly nodeIds?: readonly NodeId[];
  readonly lineIds?: readonly string[];
  readonly viewport?: boolean;
  readonly selectionBox?: boolean;
  readonly scale?: boolean;
  readonly source?: boolean;
  readonly summary?: boolean;
  readonly inspector?: boolean;
  readonly file?: boolean;
  readonly refreshFileLists?: boolean;
  readonly boxSelectionChip?: boolean;
  readonly recovery?: boolean;
}

interface CanvasViewStateSnapshot {
  readonly source: string;
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly selectedNodeId: string | null;
  readonly nextNodeSerial: number;
  readonly nodes: readonly CanvasNodeState[];
  readonly lines: readonly CanvasLineState[];
}

interface PersistedCanvasMetadata {
  readonly title: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly source: string;
  readonly generator: string;
  readonly migratedFromVersion: number | null;
}

interface PersistedCanvasViewport {
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

interface PersistedCanvasSelection {
  readonly selectedNodeId: string | null;
}

interface PersistedCanvasNode {
  readonly id: NodeId;
  readonly type: CanvasNodeType;
  readonly title: string;
  readonly body: string;
  readonly accent: string;
  readonly shadow: string;
  readonly x: number;
  readonly y: number;
  readonly targetPath?: string;
  readonly url?: string;
  readonly width?: number;
  readonly height?: number;
  readonly groupId?: NodeId;
}

interface PersistedCanvasEdge {
  readonly id: string;
  readonly from: NodeId;
  readonly to: NodeId;
  readonly label: string;
}

interface PersistedCanvasSceneDocument {
  readonly nextNodeSerial: number;
  readonly nodes: readonly PersistedCanvasNode[];
  readonly edges: readonly PersistedCanvasEdge[];
}

interface PersistedCanvasSceneFile {
  readonly kind: typeof CANVAS_SCHEMA_KIND;
  readonly version: typeof CANVAS_SCHEMA_VERSION;
  readonly metadata: PersistedCanvasMetadata;
  readonly viewport: PersistedCanvasViewport;
  readonly selection: PersistedCanvasSelection;
  readonly scene: PersistedCanvasSceneDocument;
}

interface LoadedCanvasDocumentResult {
  readonly snapshot: CanvasViewStateSnapshot;
  readonly metadata: PersistedCanvasMetadata;
}

type AutoSaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error';
type CanvasRecoveryMode = 'normal' | 'invalid' | 'readonly';
type UrlPreviewStatus = 'loading' | 'ready' | 'error';

interface UrlPreviewState {
  readonly url: string;
  readonly status: UrlPreviewStatus;
  readonly metadata: UrlMetadataResult | null;
  readonly errorMessage: string | null;
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }

  if (value > max) {
    return max;
  }

  return value;
}

function isJsonObjectValue(value: JsonValue | object | null | undefined): value is JsonObject {
  return value !== null && value !== undefined && typeof value === 'object' && !Array.isArray(value);
}

function readJsonObjectValue(state: JsonObject, key: string): JsonObject | null {
  const value = state[key];
  return isJsonObjectValue(value) ? value : null;
}

function readStringValue(state: JsonObject, key: string, fallback: string): string {
  const value = state[key];
  return typeof value === 'string' ? value : fallback;
}

function readNumberValue(state: JsonObject, key: string, fallback: number): number {
  const value = state[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readBooleanValue(state: JsonObject, key: string, fallback: boolean): boolean {
  const value = state[key];
  return typeof value === 'boolean' ? value : fallback;
}

function readNullableStringValue(state: JsonObject, key: string, fallback: string | null): string | null {
  const value = state[key];

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  return fallback;
}

function resolveWorkspaceLeaf(args: readonly ViewConstructorArgument[]): WorkspaceLeaf {
  const leaf = args[0] ?? null;

  if (typeof leaf !== 'object' || leaf === null) {
    throw new Error('FakeCanvasView requires a workspace leaf.');
  }

  return leaf as WorkspaceLeaf;
}

function createTextBlock(text: string, fontSize: string, fontWeight: string): HTMLElement {
  const element = document.createElement('div');
  element.textContent = text;
  element.style.fontSize = fontSize;
  element.style.fontWeight = fontWeight;
  return element;
}

function formatTimestamp(date: Date): string {
  return date.toLocaleString('zh-CN', { hour12: false });
}

function padDatePart(value: number): string {
  return value.toString().padStart(2, '0');
}

function extractCanvasFileName(filePath: string): string {
  const fileName = filePath
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
    .at(-1);

  return fileName ?? 'untitled.canvas';
}

function extractCanvasTitle(filePath: string): string {
  const fileName = extractCanvasFileName(filePath);
  const dotIndex = fileName.lastIndexOf('.');
  return dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
}

function isCanvasFileExtension(extension: string): boolean {
  return CANVAS_FILE_EXTENSIONS.includes(extension.toLowerCase() as (typeof CANVAS_FILE_EXTENSIONS)[number]);
}

function extractPathFileName(filePath: string): string {
  return filePath
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
    .at(-1) ?? filePath;
}

function extractPathBasename(filePath: string): string {
  const fileName = extractPathFileName(filePath);
  const dotIndex = fileName.lastIndexOf('.');
  return dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
}

function createCanvasMetadata(
  filePath: string,
  source: string,
  createdAt: string,
  updatedAt: string,
  migratedFromVersion: number | null,
): PersistedCanvasMetadata {
  return {
    title: extractCanvasTitle(filePath),
    createdAt,
    updatedAt,
    source,
    generator: CANVAS_SCHEMA_GENERATOR,
    migratedFromVersion,
  };
}

function readCanvasNodeTypeValue(state: JsonObject, key: string, fallback: CanvasNodeType): CanvasNodeType {
  const value = state[key];

  switch (value) {
    case 'note':
    case 'file':
    case 'url':
    case 'group':
    case 'text':
      return value;
    default:
      return fallback;
  }
}

function getNodeTypeLabel(type: CanvasNodeType): string {
  switch (type) {
    case 'note':
      return '笔记';
    case 'file':
      return '文件';
    case 'url':
      return 'URL';
    case 'group':
      return '分组';
    default:
      return '文本';
  }
}

function getNodeReferenceText(node: CanvasNodeState): string | null {
  switch (node.type) {
    case 'note':
      return `目标笔记：${node.targetPath ?? '未设置'}`;
    case 'file':
      return `目标文件：${node.targetPath ?? '未设置'}`;
    case 'url':
      return `目标链接：${node.url ?? '未设置'}`;
    case 'group':
      return '分组节点：用于承载一组白板卡片';
    default:
      return null;
  }
}

function isWorkspaceFileNode(node: CanvasNodeState): boolean {
  return node.type === 'note' || node.type === 'file';
}

function isSupportedExternalUrl(value: string): boolean {
  try {
    const parsedUrl = new URL(value);
    return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
  } catch {
    return false;
  }
}

function normalizeExternalUrlInput(value: string): string | null {
  const trimmedValue = value.trim();

  if (trimmedValue.length === 0) {
    return null;
  }

  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmedValue)
    ? trimmedValue
    : `https://${trimmedValue}`;

  try {
    const parsedUrl = new URL(candidate);

    if ((parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') || parsedUrl.hostname.trim().length === 0) {
      return null;
    }

    return parsedUrl.toString();
  } catch {
    return null;
  }
}

function formatExternalUrlHost(value: string): string {
  try {
    return new URL(value).hostname;
  } catch {
    return value;
  }
}

function normalizeDroppedWorkspacePath(value: string): string | null {
  const candidate = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !line.startsWith('#'));

  if (candidate === undefined) {
    return null;
  }

  return candidate.replace(/\\/g, '/').replace(/^\/+/, '');
}

function readDroppedWorkspacePath(dataTransfer: DataTransfer): string | null {
  const dragPayloadTypes = [
    WORKSPACE_FILE_DRAG_MIME_TYPE,
    'text/plain',
    'text/uri-list',
  ];

  for (const payloadType of dragPayloadTypes) {
    if (!Array.from(dataTransfer.types).includes(payloadType)) {
      continue;
    }

    const droppedPath = normalizeDroppedWorkspacePath(dataTransfer.getData(payloadType));

    if (droppedPath !== null) {
      return droppedPath;
    }
  }

  return null;
}

function createDefaultNodes(): readonly CanvasNodeState[] {
  return [
    {
      id: 'start',
      type: 'text',
      title: '欢迎',
      body: '作为入口节点，表示当前白板视图已经具备最小交互承载能力。',
      accent: 'linear-gradient(135deg, rgba(14,165,233,0.24), rgba(59,130,246,0.12))',
      shadow: 'rgba(2, 132, 199, 0.18)',
      x: 140,
      y: 120,
    },
    {
      id: 'idea',
      type: 'note',
      title: '思路卡片',
      body: '这是一个笔记节点，用于验证白板可以承载笔记引用类卡片。',
      accent: 'linear-gradient(135deg, rgba(45,212,191,0.24), rgba(16,185,129,0.12))',
      shadow: 'rgba(13, 148, 136, 0.16)',
      x: 520,
      y: 200,
      targetPath: 'notes/canvas-idea.md',
    },
    {
      id: 'task',
      type: 'file',
      title: '下一步',
      body: '这是一个文件节点，用于验证白板可以保存和恢复文件引用卡片。',
      accent: 'linear-gradient(135deg, rgba(250,204,21,0.24), rgba(249,115,22,0.12))',
      shadow: 'rgba(234, 88, 12, 0.15)',
      x: 900,
      y: 340,
      targetPath: 'attachments/canvas-host-roadmap.pdf',
    },
    {
      id: 'reference-url',
      type: 'url',
      title: '参考链接',
      body: '',
      accent: 'linear-gradient(135deg, rgba(168,85,247,0.24), rgba(59,130,246,0.12))',
      shadow: 'rgba(109, 40, 217, 0.18)',
      x: 560,
      y: 480,
      groupId: 'group-demo',
    },
    {
      id: 'group-demo',
      type: 'group',
      title: '扩展分组',
      body: '这是一个分组节点，用于验证 Canvas 风格的容器类卡片。',
      accent: 'linear-gradient(135deg, rgba(148,163,184,0.18), rgba(51,65,85,0.16))',
      shadow: 'rgba(15, 23, 42, 0.18)',
      x: 500,
      y: 430,
      width: 560,
      height: 280,
    },
  ];
}

function createDefaultLines(): readonly CanvasLineState[] {
  return [
    {
      id: 'line-start-idea',
      from: 'start',
      to: 'idea',
      label: '承载链路',
    },
    {
      id: 'line-idea-task',
      from: 'idea',
      to: 'task',
      label: '继续推进',
    },
    {
      id: 'line-task-url',
      from: 'task',
      to: 'reference-url',
      label: '参考资料',
    },
    {
      id: 'line-url-group',
      from: 'reference-url',
      to: 'group-demo',
      label: '归入分组',
    },
  ];
}

function createInitialViewState(source: string): CanvasViewStateSnapshot {
  return {
    source,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    selectedNodeId: 'start',
    nextNodeSerial: 1,
    nodes: createDefaultNodes(),
    lines: createDefaultLines(),
  };
}

function createViewStateJson(
  snapshot: CanvasViewStateSnapshot,
  sceneFileExists: boolean,
  lastSavedAt: string | null,
  lastLoadedAt: string | null,
  sceneFileMessage: string,
): JsonObject {
  return {
    source: snapshot.source,
    scale: snapshot.scale,
    offsetX: snapshot.offsetX,
    offsetY: snapshot.offsetY,
    selectedNodeId: snapshot.selectedNodeId,
    nextNodeSerial: snapshot.nextNodeSerial,
    nodes: snapshot.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      title: node.title,
      body: node.body,
      accent: node.accent,
      shadow: node.shadow,
      x: node.x,
      y: node.y,
      targetPath: node.targetPath ?? null,
      url: node.url ?? null,
      width: node.width ?? null,
      height: node.height ?? null,
      groupId: node.groupId ?? null,
    })),
    lines: snapshot.lines.map((line) => ({
      id: line.id,
      from: line.from,
      to: line.to,
      label: line.label,
    })),
    sceneFileExists,
    lastSavedAt,
    lastLoadedAt,
    sceneFileMessage,
  };
}

function updateNodePosition(
  nodes: readonly CanvasNodeState[],
  targetId: NodeId,
  x: number,
  y: number,
): readonly CanvasNodeState[] {
  return nodes.map((node) => {
    if (node.id !== targetId) {
      return node;
    }

    return {
      ...node,
      x,
      y,
    };
  });
}

function updateNodeContent(
  nodes: readonly CanvasNodeState[],
  targetId: NodeId,
  patch: Pick<CanvasNodeState, 'title' | 'body'>,
): readonly CanvasNodeState[] {
  return nodes.map((node) => {
    if (node.id !== targetId) {
      return node;
    }

    return {
      ...node,
      title: patch.title,
      body: patch.body,
    };
  });
}

function findNode(nodes: readonly CanvasNodeState[], targetId: NodeId): CanvasNodeState {
  const node = nodes.find((item) => item.id === targetId);

  if (node === undefined) {
    throw new Error(`Missing canvas node: ${targetId}`);
  }

  return node;
}

function defaultNodeWidthForType(type: CanvasNodeType): number {
  switch (type) {
    case 'text':
      return TEXT_NODE_WIDTH;
    case 'group':
      return GROUP_NODE_WIDTH;
    default:
      return CARD_WIDTH;
  }
}

function defaultNodeHeightForType(type: CanvasNodeType): number {
  switch (type) {
    case 'text':
      return TEXT_NODE_HEIGHT;
    case 'group':
      return GROUP_NODE_HEIGHT;
    default:
      return CARD_HEIGHT;
  }
}

function minNodeWidthForType(type: CanvasNodeType): number {
  switch (type) {
    case 'text':
      return 120;
    case 'group':
      return 240;
    default:
      return MIN_NODE_WIDTH;
  }
}

function minNodeHeightForType(type: CanvasNodeType): number {
  switch (type) {
    case 'text':
      return TEXT_NODE_HEIGHT;
    case 'group':
      return 180;
    default:
      return MIN_NODE_HEIGHT;
  }
}

function resolveTextNodeTitleInputMetrics(isExpandedTextNode: boolean): {
  readonly minHeight: string;
  readonly height: string;
  readonly padding: string;
} {
  if (isExpandedTextNode) {
    return {
      minHeight: `${TEXT_NODE_HEIGHT}px`,
      height: '100%',
      padding: '8px 10px',
    };
  }

  return {
    minHeight: `${TEXT_NODE_LINE_HEIGHT}px`,
    height: `${TEXT_NODE_LINE_HEIGHT}px`,
    padding: '0 10px',
  };
}

function resolveResizeHitAreaMetrics(node: CanvasNodeState): ResizeHitAreaMetrics {
  if (node.type === 'text' && nodeHeight(node) <= TEXT_NODE_HEIGHT) {
    return {
      frameOutset: COMPACT_TEXT_NODE_RESIZE_FRAME_OUTSET,
      edgeHitSize: COMPACT_TEXT_NODE_RESIZE_EDGE_HIT_SIZE,
      cornerHitSize: COMPACT_TEXT_NODE_RESIZE_CORNER_HIT_SIZE,
    };
  }

  return {
    frameOutset: NODE_RESIZE_FRAME_OUTSET,
    edgeHitSize: NODE_RESIZE_EDGE_HIT_SIZE,
    cornerHitSize: NODE_RESIZE_CORNER_HIT_SIZE,
  };
}

function resolveResizeDirectionFromLocalPoint(
  localX: number,
  localY: number,
  width: number,
  height: number,
  metrics: ResizeHitAreaMetrics,
): ResizeDirection | null {
  const nearLeft = localX <= metrics.edgeHitSize;
  const nearRight = localX >= width - metrics.edgeHitSize;
  const nearTop = localY <= metrics.edgeHitSize;
  const nearBottom = localY >= height - metrics.edgeHitSize;
  const nearCornerLeft = localX <= metrics.cornerHitSize;
  const nearCornerRight = localX >= width - metrics.cornerHitSize;
  const nearCornerTop = localY <= metrics.cornerHitSize;
  const nearCornerBottom = localY >= height - metrics.cornerHitSize;

  if (nearCornerTop && nearCornerLeft) {
    return 'nw';
  }

  if (nearCornerTop && nearCornerRight) {
    return 'ne';
  }

  if (nearCornerBottom && nearCornerLeft) {
    return 'sw';
  }

  if (nearCornerBottom && nearCornerRight) {
    return 'se';
  }

  if (nearTop) {
    return 'n';
  }

  if (nearBottom) {
    return 's';
  }

  if (nearLeft) {
    return 'w';
  }

  if (nearRight) {
    return 'e';
  }

  return null;
}

function resolveResizeCursor(direction: ResizeDirection): string {
  switch (direction) {
    case 'n':
    case 's':
      return 'ns-resize';
    case 'e':
    case 'w':
      return 'ew-resize';
    case 'ne':
    case 'sw':
      return 'nesw-resize';
    case 'nw':
    case 'se':
      return 'nwse-resize';
  }
}

function resolveNodeZIndex(
  node: CanvasNodeState,
  isSelected: boolean,
  isActive: boolean,
): string {
  if (isActive) {
    return NODE_ACTIVE_Z_INDEX;
  }

  if (node.type === 'group') {
    return GROUP_NODE_Z_INDEX;
  }

  return isSelected ? NODE_SELECTED_Z_INDEX : NODE_BASE_Z_INDEX;
}

function nodeWidth(node: CanvasNodeState): number {
  return node.width ?? defaultNodeWidthForType(node.type);
}

function nodeHeight(node: CanvasNodeState): number {
  return node.height ?? defaultNodeHeightForType(node.type);
}

function nodeCenterX(node: CanvasNodeState): number {
  return node.x + nodeWidth(node) / 2;
}

function nodeCenterY(node: CanvasNodeState): number {
  return node.y + nodeHeight(node) / 2;
}

function isPointInsideNode(point: ScenePoint, node: CanvasNodeState): boolean {
  return (
    point.x >= node.x
    && point.x <= node.x + nodeWidth(node)
    && point.y >= node.y
    && point.y <= node.y + nodeHeight(node)
  );
}

function readAugmentedEventNumber(
  event: Event,
  key: 'elementX' | 'elementY' | 'deltaX' | 'deltaY' | 'surfaceWidth' | 'surfaceHeight',
): number | null {
  const value = (event as HostAugmentedMouseEvent)[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readEventClientCoordinate(
  event: Event,
  key: 'clientX' | 'clientY',
): number {
  const value = (event as Event & Partial<Record<'clientX' | 'clientY', number>>)[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function createNodeAccent(serial: number): {
  readonly accent: string;
  readonly shadow: string;
} {
  const presets = [
    {
      accent: 'linear-gradient(135deg, rgba(168,85,247,0.24), rgba(59,130,246,0.12))',
      shadow: 'rgba(109, 40, 217, 0.18)',
    },
    {
      accent: 'linear-gradient(135deg, rgba(251,191,36,0.24), rgba(244,114,182,0.12))',
      shadow: 'rgba(234, 88, 12, 0.16)',
    },
    {
      accent: 'linear-gradient(135deg, rgba(34,197,94,0.24), rgba(59,130,246,0.12))',
      shadow: 'rgba(22, 163, 74, 0.16)',
    },
  ];

  return presets[(serial - 1) % presets.length] ?? presets[0];
}

function createNodeContent(
  type: CanvasNodeType,
  serial: number,
  anchorTitle?: string,
): Pick<CanvasNodeState, 'title' | 'body' | 'targetPath' | 'url'> {
  const anchorSuffix = anchorTitle === undefined ? '' : `，从“${anchorTitle}”延伸`;

  switch (type) {
    case 'note':
      return {
        title: `笔记节点 ${serial}`,
        body: `这是新增的笔记节点${anchorSuffix}，后续可在 P1-02 接入双向跳转。`,
        targetPath: `notes/canvas-note-${serial}.md`,
      };
    case 'file':
      return {
        title: `文件节点 ${serial}`,
        body: `这是新增的文件节点${anchorSuffix}，用于验证文件引用类卡片的保存与恢复。`,
        targetPath: `attachments/canvas-file-${serial}.pdf`,
      };
    case 'url':
      return {
        title: `URL 节点 ${serial}`,
        body: '',
      };
    case 'group':
      return {
        title: `分组节点 ${serial}`,
        body: `这是新增的分组节点${anchorSuffix}，用于验证容器类卡片的基础承载。`,
      };
    default:
      return {
        title: '',
        body: '',
      };
  }
}

function readNodeArrayValue(state: JsonObject, key: string): readonly CanvasNodeState[] | null {
  const value = state[key];

  if (!Array.isArray(value)) {
    return null;
  }

  const parsedNodes: CanvasNodeState[] = [];

  for (const item of value) {
    if (!isJsonObjectValue(item)) {
      continue;
    }

    const id = typeof item.id === 'string' ? item.id : '';
    const type = readCanvasNodeTypeValue(item, 'type', 'text');
    const title = typeof item.title === 'string' ? item.title : '';
    const body = typeof item.body === 'string' ? item.body : '';
    const accent = typeof item.accent === 'string' ? item.accent : '';
    const shadow = typeof item.shadow === 'string' ? item.shadow : '';
    const x = typeof item.x === 'number' && Number.isFinite(item.x) ? item.x : Number.NaN;
    const y = typeof item.y === 'number' && Number.isFinite(item.y) ? item.y : Number.NaN;
    const targetPath = typeof item.targetPath === 'string' && item.targetPath.trim().length > 0
      ? item.targetPath
      : undefined;
    const url = typeof item.url === 'string' && item.url.trim().length > 0
      ? item.url
      : undefined;
    const width = typeof item.width === 'number' && Number.isFinite(item.width) && item.width > 0
      ? item.width
      : undefined;
    const height = typeof item.height === 'number' && Number.isFinite(item.height) && item.height > 0
      ? item.height
      : undefined;
    const groupId = typeof item.groupId === 'string' && item.groupId.trim().length > 0
      ? item.groupId
      : undefined;

    if (
      id.length === 0
      || accent.length === 0
      || shadow.length === 0
      || Number.isNaN(x)
      || Number.isNaN(y)
    ) {
      continue;
    }

    parsedNodes.push({
      id,
      type,
      title,
      body,
      accent,
      shadow,
      x,
      y,
      ...(targetPath === undefined ? {} : { targetPath }),
      ...(url === undefined ? {} : { url }),
      ...(width === undefined ? {} : { width }),
      ...(height === undefined ? {} : { height }),
      ...(groupId === undefined ? {} : { groupId }),
    });
  }

  return parsedNodes.length > 0 ? parsedNodes : null;
}

function readLineArrayValue(state: JsonObject, key: string): readonly CanvasLineState[] | null {
  const value = state[key];

  if (!Array.isArray(value)) {
    return null;
  }

  const parsedLines: CanvasLineState[] = [];

  for (const item of value) {
    if (!isJsonObjectValue(item)) {
      continue;
    }

    const id = typeof item.id === 'string' ? item.id : '';
    const from = typeof item.from === 'string' ? item.from : '';
    const to = typeof item.to === 'string' ? item.to : '';
    const label = typeof item.label === 'string' ? item.label : '';

    if (id.length === 0 || from.length === 0 || to.length === 0 || label.length === 0) {
      continue;
    }

    parsedLines.push({
      id,
      from,
      to,
      label,
    });
  }

  return parsedLines.length > 0 ? parsedLines : null;
}

function createLegacyNodeState(state: JsonObject): readonly CanvasNodeState[] {
  const defaultNodes = createDefaultNodes();
  const startNode = findNode(defaultNodes, 'start');
  const ideaNode = findNode(defaultNodes, 'idea');
  const taskNode = findNode(defaultNodes, 'task');

  return [
    {
      ...startNode,
      x: readNumberValue(state, 'startX', startNode.x),
      y: readNumberValue(state, 'startY', startNode.y),
    },
    {
      ...ideaNode,
      x: readNumberValue(state, 'ideaX', ideaNode.x),
      y: readNumberValue(state, 'ideaY', ideaNode.y),
    },
    {
      ...taskNode,
      x: readNumberValue(state, 'taskX', taskNode.x),
      y: readNumberValue(state, 'taskY', taskNode.y),
    },
  ];
}

function createSceneSnapshotFromState(state: JsonObject, fallbackSource: string): CanvasViewStateSnapshot {
  return {
    source: readStringValue(state, 'source', fallbackSource),
    scale: clamp(readNumberValue(state, 'scale', 1), MIN_SCALE, MAX_SCALE),
    offsetX: readNumberValue(state, 'offsetX', 0),
    offsetY: readNumberValue(state, 'offsetY', 0),
    selectedNodeId: readNullableStringValue(state, 'selectedNodeId', 'start'),
    nextNodeSerial: Math.max(1, Math.round(readNumberValue(state, 'nextNodeSerial', 1))),
    nodes: readNodeArrayValue(state, 'nodes') ?? createLegacyNodeState(state),
    lines: readLineArrayValue(state, 'lines') ?? createDefaultLines(),
  };
}

function createLoadedCanvasDocumentFromLegacyState(
  state: JsonObject,
  filePath: string,
  fallbackSource: string,
): LoadedCanvasDocumentResult {
  const sceneState = readJsonObjectValue(state, 'scene');

  if (sceneState === null) {
    throw new Error('白板文件缺少 scene 字段。');
  }

  const savedAtValue = readStringValue(state, 'savedAt', new Date().toISOString());
  const snapshot = createSceneSnapshotFromState(sceneState, fallbackSource);

  return {
    snapshot,
    metadata: createCanvasMetadata(
      filePath,
      snapshot.source,
      savedAtValue,
      savedAtValue,
      LEGACY_CANVAS_SCHEMA_VERSION,
    ),
  };
}

function createLoadedCanvasDocumentFromCurrentState(
  state: JsonObject,
  filePath: string,
  fallbackSource: string,
): LoadedCanvasDocumentResult {
  const metadataState = readJsonObjectValue(state, 'metadata');
  const viewportState = readJsonObjectValue(state, 'viewport');
  const selectionState = readJsonObjectValue(state, 'selection');
  const sceneState = readJsonObjectValue(state, 'scene');

  if (
    metadataState === null
    || viewportState === null
    || selectionState === null
    || sceneState === null
  ) {
    throw new Error('白板文件缺少 metadata / viewport / selection / scene 字段。');
  }

  const createdAtValue = readStringValue(metadataState, 'createdAt', new Date().toISOString());
  const updatedAtValue = readStringValue(metadataState, 'updatedAt', createdAtValue);
  const sourceValue = readStringValue(metadataState, 'source', fallbackSource);
  const migratedFromVersionValue = readNumberValue(metadataState, 'migratedFromVersion', -1);
  const snapshot: CanvasViewStateSnapshot = {
    source: sourceValue,
    scale: clamp(readNumberValue(viewportState, 'scale', 1), MIN_SCALE, MAX_SCALE),
    offsetX: readNumberValue(viewportState, 'offsetX', 0),
    offsetY: readNumberValue(viewportState, 'offsetY', 0),
    selectedNodeId: readNullableStringValue(selectionState, 'selectedNodeId', 'start'),
    nextNodeSerial: Math.max(1, Math.round(readNumberValue(sceneState, 'nextNodeSerial', 1))),
    nodes: readNodeArrayValue(sceneState, 'nodes') ?? createDefaultNodes(),
    lines: readLineArrayValue(sceneState, 'edges') ?? createDefaultLines(),
  };

  return {
    snapshot,
    metadata: createCanvasMetadata(
      filePath,
      sourceValue,
      createdAtValue,
      updatedAtValue,
      migratedFromVersionValue >= 0 ? migratedFromVersionValue : null,
    ),
  };
}

function parseCanvasDocument(
  raw: string,
  filePath: string,
  fallbackSource: string,
): LoadedCanvasDocumentResult {
  const parsed = JSON.parse(raw) as JsonValue;

  if (!isJsonObjectValue(parsed)) {
    throw new Error('白板文件不是有效的对象结构。');
  }

  const versionValue = readNumberValue(parsed, 'version', 0);

  if (
    versionValue === CANVAS_SCHEMA_VERSION
    && readStringValue(parsed, 'kind', '') === CANVAS_SCHEMA_KIND
  ) {
    return createLoadedCanvasDocumentFromCurrentState(parsed, filePath, fallbackSource);
  }

  if (versionValue === LEGACY_CANVAS_SCHEMA_VERSION) {
    return createLoadedCanvasDocumentFromLegacyState(parsed, filePath, fallbackSource);
  }

  throw new Error(`不支持的白板文件版本：${versionValue}`);
}

function serializeSceneForFile(
  scene: CanvasViewStateSnapshot,
  filePath: string = SCENE_FILE_PATH,
  metadata: PersistedCanvasMetadata | null = null,
): string {
  const timestamp = new Date().toISOString();
  const payload: PersistedCanvasSceneFile = {
    kind: CANVAS_SCHEMA_KIND,
    version: CANVAS_SCHEMA_VERSION,
    metadata: createCanvasMetadata(
      filePath,
      scene.source,
      metadata?.createdAt ?? timestamp,
      timestamp,
      metadata?.migratedFromVersion ?? null,
    ),
    viewport: {
      scale: scene.scale,
      offsetX: scene.offsetX,
      offsetY: scene.offsetY,
    },
    selection: {
      selectedNodeId: scene.selectedNodeId,
    },
    scene: {
      nextNodeSerial: scene.nextNodeSerial,
      nodes: scene.nodes.map((node) => ({
        id: node.id,
        type: node.type,
        title: node.title,
        body: node.body,
        accent: node.accent,
        shadow: node.shadow,
        x: node.x,
        y: node.y,
        ...(node.targetPath === undefined ? {} : { targetPath: node.targetPath }),
        ...(node.url === undefined ? {} : { url: node.url }),
        ...(node.width === undefined ? {} : { width: node.width }),
        ...(node.height === undefined ? {} : { height: node.height }),
        ...(node.groupId === undefined ? {} : { groupId: node.groupId }),
      })),
      edges: scene.lines.map((line) => ({
        id: line.id,
        from: line.from,
        to: line.to,
        label: line.label,
      })),
    },
  };

  return `${JSON.stringify(payload, null, 2)}\n`;
}

async function ensureFolderPath(view: FakeCanvasView, targetPath: string): Promise<void> {
  const segments = targetPath
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
  let current = '';

  for (const segment of segments) {
    current = current.length === 0 ? segment : `${current}/${segment}`;

    if (view.app.vault.getFolderByPath(current) !== null) {
      continue;
    }

    await view.app.vault.createFolder(current);
  }
}

function createPlainTextPreview(raw: string, limit = 360): string {
  const withoutFrontmatter = raw.replace(/^---[\s\S]*?---\s*/, '');
  const plainText = withoutFrontmatter
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/[*_~>#-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (plainText.length <= limit) {
    return plainText.length === 0 ? '该笔记暂无可预览文本。' : plainText;
  }

  return `${plainText.slice(0, limit).trim()}...`;
}

class WorkspaceFileNodeSuggestModal extends SuggestModal<TFile> {
  public constructor(
    app: Plugin['app'],
    private readonly nodeType: WorkspaceFileNodeType,
    private readonly files: readonly TFile[],
    private readonly chooseFile: (file: TFile) => void,
  ) {
    super(app);
    this.limit = 80;
    this.emptyStateText = nodeType === 'note'
      ? '当前工作区没有可选择的 Markdown 笔记。'
      : '当前工作区没有可选择的文件。';
    this.setTitle(nodeType === 'note' ? '选择工作区笔记文件' : '选择工作区文件');
    this.setPlaceholder(nodeType === 'note' ? '搜索笔记名或路径' : '搜索文件名或路径');
    this.setInstructions([
      { command: 'Enter', purpose: '创建指向当前高亮文件的白板节点' },
      { command: 'Click', purpose: '创建指向所选文件的白板节点' },
    ]);
  }

  public override getSuggestions(query: string): readonly TFile[] {
    const normalizedQuery = query.trim().toLowerCase();

    if (normalizedQuery.length === 0) {
      return this.files;
    }

    return this.files.filter((file) => {
      return `${file.basename} ${file.name} ${file.path}`.toLowerCase().includes(normalizedQuery);
    });
  }

  public override renderSuggestion(file: TFile, el: HTMLElement): void {
    const titleEl = document.createElement('strong');
    titleEl.textContent = file.basename.length > 0 ? file.basename : file.name;

    const pathEl = document.createElement('div');
    pathEl.textContent = file.path;

    const metaEl = document.createElement('small');
    metaEl.textContent = this.nodeType === 'note'
      ? 'Markdown 笔记'
      : `.${file.extension || 'file'} 文件`;

    el.append(titleEl, pathEl, metaEl);
  }

  public override onChooseSuggestion(file: TFile): void {
    this.chooseFile(file);
  }
}

class UrlNodeAddressSuggestModal extends SuggestModal<string> {
  public constructor(
    app: Plugin['app'],
    title: string,
    private readonly actionLabel: string,
    initialUrl: string | undefined,
    private readonly chooseUrl: (url: string) => void,
  ) {
    super(app);
    this.limit = 1;
    this.emptyStateText = '输入有效的 http 或 https 链接后按 Enter 确认。';
    this.inputEl.value = initialUrl ?? '';
    this.setTitle(title);
    this.setPlaceholder('输入 URL 地址');
    this.setInstructions([
      { command: 'Enter', purpose: actionLabel },
      { command: 'Esc', purpose: '取消' },
    ]);
  }

  public override getSuggestions(query: string): readonly string[] {
    const normalizedUrl = normalizeExternalUrlInput(query);
    return normalizedUrl === null ? [] : [normalizedUrl];
  }

  public override renderSuggestion(url: string, el: HTMLElement): void {
    const titleEl = document.createElement('strong');
    titleEl.textContent = this.actionLabel;

    const urlEl = document.createElement('div');
    urlEl.textContent = url;

    const metaEl = document.createElement('small');
    metaEl.textContent = `内嵌网页：${formatExternalUrlHost(url)}`;

    el.append(titleEl, urlEl, metaEl);
  }

  public override onChooseSuggestion(url: string): void {
    this.chooseUrl(url);
  }
}

class FakeCanvasView extends ItemView {
  private source = '未设置';
  private canvasFilePath = SCENE_FILE_PATH;
  private canvasFile: TFile | null = null;
  private canvasMetadata: PersistedCanvasMetadata | null = null;
  private scale = 1;
  private offsetX = 0;
  private offsetY = 0;
  private nodes: readonly CanvasNodeState[] = createDefaultNodes();
  private lines: readonly CanvasLineState[] = createDefaultLines();
  private selectedNodeId: NodeId | null = 'start';
  private selectedNodeIds: readonly NodeId[] = ['start'];
  private inlineEditingNodeId: NodeId | null = null;
  private nextNodeSerial = 1;
  private dragMode: DragMode = 'none';
  private activeNodeId: NodeId | null = null;
  private lastNodePointerDownId: NodeId | null = null;
  private lastNodePointerDownAt = 0;
  private lastNodePointerDownX = 0;
  private lastNodePointerDownY = 0;
  private lastNodeActivationId: NodeId | null = null;
  private lastNodeActivationAt = 0;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragOriginNodeX = 0;
  private dragOriginNodeY = 0;
  private dragOriginNodePositions: ReadonlyMap<NodeId, ScenePoint> = new Map();
  private resizeDirection: ResizeDirection | null = null;
  private resizeOriginNodeX = 0;
  private resizeOriginNodeY = 0;
  private resizeOriginWidth = CARD_WIDTH;
  private resizeOriginHeight = CARD_HEIGHT;
  private dragOriginOffsetX = 0;
  private dragOriginOffsetY = 0;
  private dropTargetGroupId: NodeId | null = null;
  private interactionOriginClientX = 0;
  private interactionOriginClientY = 0;
  private lastViewportWidth = 0;
  private lastViewportHeight = 0;
  private selectionStartSceneX = 0;
  private selectionStartSceneY = 0;
  private selectionCurrentSceneX = 0;
  private selectionCurrentSceneY = 0;
  private pointerCaptureOwnerEl: HTMLElement | null = null;
  private spacePanPressed = false;
  private boxSelectionEnabled = true;
  private persistentSelectionBoxActive = false;
  private sceneFileExists = false;
  private lastSavedAt: string | null = null;
  private lastLoadedAt: string | null = null;
  private sceneFileMessage = '独立场景文件尚未创建。';
  private autoSaveState: AutoSaveState = 'idle';
  private autoSaveErrorMessage: string | null = null;
  private autoSaveHandle: ReturnType<typeof setTimeout> | null = null;
  private recoveryMode: CanvasRecoveryMode = 'normal';
  private recoveryErrorMessage: string | null = null;
  private recoveryRawContent: string | null = null;
  private recoveryTextVisible = false;

  private rootEl: HTMLElement | null = null;
  private viewportEl: HTMLElement | null = null;
  private sceneEl: HTMLElement | null = null;
  private selectionBoxEl: HTMLElement | null = null;
  private summaryEl: HTMLElement | null = null;
  private scaleEl: HTMLElement | null = null;
  private sourceEl: HTMLElement | null = null;
  private recoveryPanelEl: HTMLElement | null = null;
  private recoveryTitleEl: HTMLElement | null = null;
  private recoveryMessageEl: HTMLElement | null = null;
  private recoveryToggleRawEl: HTMLElement | null = null;
  private recoveryRawTextEl: HTMLElement | null = null;
  private boxSelectionChipEl: HTMLElement | null = null;
  private selectedMetaEl: HTMLElement | null = null;
  private titleInputEl: HTMLInputElement | null = null;
  private urlLabelEl: HTMLElement | null = null;
  private urlInputEl: HTMLInputElement | null = null;
  private bodyLabelEl: HTMLElement | null = null;
  private bodyInputEl: HTMLTextAreaElement | null = null;
  private fileMetaEl: HTMLElement | null = null;
  private recentFilesEl: HTMLElement | null = null;
  private allFilesEl: HTMLElement | null = null;
  private readonly nodeRuntimes = new Map<NodeId, CanvasNodeRuntime>();
  private readonly lineRuntimes = new Map<string, CanvasLineRuntime>();
  private readonly urlPreviewStates = new Map<NodeId, UrlPreviewState>();

  public constructor(...args: ViewConstructorArgument[]) {
    super(resolveWorkspaceLeaf(args));
    this.icon = 'layout-dashboard';
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
      this.handleVaultRename(file, oldPath);
    }));
    this.registerEvent(this.app.vault.on('delete', (file) => {
      this.syncFileReferenceStatusForPath(file.path);
    }));
    this.registerEvent(this.app.vault.on('create', (file) => {
      this.syncFileReferenceStatusForPath(file.path);
    }));
  }

  public getViewType(): string {
    return DEMO_VIEW_TYPE;
  }

  public getDisplayText(): string {
    const fileName = this.canvasFilePath.split('/').filter((segment) => segment.length > 0).at(-1) ?? '';
    return fileName.length > 0 ? fileName : DEMO_TITLE;
  }

  public getState(): JsonObject {
    return {
      file: this.canvasFilePath,
      source: this.source,
      scale: this.scale,
      offsetX: this.offsetX,
      offsetY: this.offsetY,
      selectedNodeId: this.selectedNodeId,
      nextNodeSerial: this.nextNodeSerial,
      nodes: this.nodes.map((node) => ({
        id: node.id,
        title: node.title,
        body: node.body,
        accent: node.accent,
        shadow: node.shadow,
        x: node.x,
        y: node.y,
        type: node.type,
        ...(node.targetPath === undefined ? {} : { targetPath: node.targetPath }),
        ...(node.url === undefined ? {} : { url: node.url }),
        ...(node.width === undefined ? {} : { width: node.width }),
        ...(node.height === undefined ? {} : { height: node.height }),
        ...(node.groupId === undefined ? {} : { groupId: node.groupId }),
      })),
      lines: this.lines.map((line) => ({
        id: line.id,
        from: line.from,
        to: line.to,
        label: line.label,
      })),
      sceneFileExists: this.sceneFileExists,
      lastSavedAt: this.lastSavedAt,
      lastLoadedAt: this.lastLoadedAt,
      sceneFileMessage: this.sceneFileMessage,
      recoveryMode: this.recoveryMode,
      recoveryErrorMessage: this.recoveryErrorMessage,
    };
  }

  public async setState(state: JsonObject, _result: ViewStateResult): Promise<void> {
    const nextSource = readStringValue(state, 'source', this.source);
    const nextFilePath = readStringValue(state, 'file', this.canvasFilePath);
    const hasExplicitScene = Array.isArray(state.nodes) && Array.isArray(state.lines);
    let snapshot = createSceneSnapshotFromState(state, nextSource);
    let sceneFileExists = readBooleanValue(state, 'sceneFileExists', this.sceneFileExists);
    let lastSavedAt = readNullableStringValue(state, 'lastSavedAt', this.lastSavedAt);
    let lastLoadedAt = readNullableStringValue(state, 'lastLoadedAt', this.lastLoadedAt);
    let sceneFileMessage = readStringValue(state, 'sceneFileMessage', this.sceneFileMessage);
    let canvasMetadata = this.canvasMetadata;
    let recoveryMode: CanvasRecoveryMode = 'normal';
    let recoveryErrorMessage: string | null = null;
    let recoveryRawContent: string | null = null;

    this.source = nextSource;
    this.canvasFilePath = nextFilePath;
    this.canvasFile = this.app.vault.getFileByPath(nextFilePath);

    if (!hasExplicitScene) {
      try {
        const fileSnapshot = await this.readSnapshotFromCanvasFile(nextFilePath, nextSource);

        if (fileSnapshot !== null) {
          snapshot = fileSnapshot.snapshot;
          canvasMetadata = fileSnapshot.metadata;
          sceneFileExists = true;
          lastLoadedAt = formatTimestamp(new Date());
          sceneFileMessage = `已从 ${nextFilePath} 加载白板文件。`;
        } else {
          snapshot = createInitialViewState(nextSource);
          canvasMetadata = null;
          sceneFileExists = false;
          sceneFileMessage = '当前白板文件尚未创建，已回退到默认画布。';
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : '未知错误';
        snapshot = createInitialViewState(`恢复失败：${nextSource}`);
        canvasMetadata = null;
        sceneFileExists = this.app.vault.getFileByPath(nextFilePath) !== null;
        lastLoadedAt = null;
        sceneFileMessage = `白板文件恢复失败，已进入只读恢复模式：${errorMessage}`;
        recoveryMode = 'invalid';
        recoveryErrorMessage = errorMessage;
        recoveryRawContent = await this.readCanvasRawContent(nextFilePath);
      }
    }

    this.applySnapshot(snapshot);
    this.canvasMetadata = canvasMetadata;
    this.sceneFileExists = sceneFileExists;
    this.lastSavedAt = lastSavedAt;
    this.lastLoadedAt = lastLoadedAt;
    this.sceneFileMessage = sceneFileMessage;
    this.recoveryMode = recoveryMode;
    this.recoveryErrorMessage = recoveryErrorMessage;
    this.recoveryRawContent = recoveryRawContent;
    this.recoveryTextVisible = false;
    this.autoSaveState = recoveryMode === 'normal' ? (sceneFileExists ? 'saved' : 'idle') : 'error';
    this.autoSaveErrorMessage = recoveryMode === 'normal' ? null : recoveryErrorMessage;
    this.cancelAutoSaveHandle();
    this.ensureViewDom();
    this.syncScene();
  }

  public override onOpen(): void {
    this.ensureViewDom();
    this.syncScene();
    void this.refreshSceneFileStatus();
  }

  public override onClose(): void {
    if (this.autoSaveHandle !== null) {
      void this.flushAutoSave('关闭视图前自动保存', '关闭视图前已自动保存到');
    }

    this.finishPointerInteraction();
    this.contentEl.replaceChildren();
  }

  private applySnapshot(snapshot: CanvasViewStateSnapshot): void {
    this.source = snapshot.source;
    this.scale = snapshot.scale;
    this.offsetX = snapshot.offsetX;
    this.offsetY = snapshot.offsetY;
    this.nodes = snapshot.nodes;
    this.lines = snapshot.lines;
    this.selectedNodeId = snapshot.selectedNodeId;
    this.selectedNodeIds = snapshot.selectedNodeId === null ? [] : [snapshot.selectedNodeId];
    this.persistentSelectionBoxActive = false;
    this.nextNodeSerial = snapshot.nextNodeSerial;
    this.expandGroupsToFitMembers(this.nodes.filter((node) => node.type === 'group').map((node) => node.id));

    if (this.selectedNodeId !== null && this.nodes.every((node) => node.id !== this.selectedNodeId)) {
      this.selectedNodeId = this.nodes[0]?.id ?? null;
      this.selectedNodeIds = this.selectedNodeId === null ? [] : [this.selectedNodeId];
    }

    if (this.inlineEditingNodeId !== null && this.nodes.every((node) => node.id !== this.inlineEditingNodeId)) {
      this.inlineEditingNodeId = null;
    }
  }

  private async readSnapshotFromCanvasFile(
    filePath: string,
    fallbackSource: string,
  ): Promise<LoadedCanvasDocumentResult | null> {
    const file = this.app.vault.getFileByPath(filePath);

    if (file === null) {
      this.canvasMetadata = null;
      this.canvasFile = null;
      return null;
    }

    this.canvasFile = file;
    const raw = await this.app.vault.read(file);
    return parseCanvasDocument(raw, filePath, fallbackSource);
  }

  private async readCanvasRawContent(filePath: string): Promise<string | null> {
    const file = this.app.vault.getFileByPath(filePath);

    if (file === null) {
      return null;
    }

    try {
      return await this.app.vault.read(file);
    } catch {
      return null;
    }
  }

  private isCanvasReadOnly(): boolean {
    return this.recoveryMode !== 'normal';
  }

  private clearCanvasRecoveryState(): void {
    this.recoveryMode = 'normal';
    this.recoveryErrorMessage = null;
    this.recoveryRawContent = null;
    this.recoveryTextVisible = false;
  }

  private enterInvalidCanvasRecovery(errorMessage: string, rawContent: string | null): void {
    this.recoveryMode = 'invalid';
    this.recoveryErrorMessage = errorMessage;
    this.recoveryRawContent = rawContent;
    this.recoveryTextVisible = false;
    this.autoSaveState = 'error';
    this.autoSaveErrorMessage = errorMessage;
    this.sceneFileMessage = `白板文件恢复失败，已进入只读恢复模式：${errorMessage}`;
  }

  private enterReadOnlyCanvasRecovery(errorMessage: string): void {
    this.recoveryMode = 'readonly';
    this.recoveryErrorMessage = errorMessage;
    this.recoveryRawContent = null;
    this.recoveryTextVisible = false;
    this.autoSaveState = 'error';
    this.autoSaveErrorMessage = errorMessage;
    this.sceneFileMessage = `白板已进入只读保护：${errorMessage}`;
  }

  private guardWritableCanvas(actionLabel: string): boolean {
    if (!this.isCanvasReadOnly()) {
      return true;
    }

    new Notice(`${DEMO_TITLE}：当前白板处于只读恢复模式，不能${actionLabel}。请先修复文件后重新加载，或新建白板文件。`, 2800);
    this.syncScene({
      recovery: true,
      file: true,
      summary: true,
      inspector: true,
    });
    return false;
  }

  public resetScene(): void {
    if (!this.guardWritableCanvas('重置画布')) {
      return;
    }

    const nextState = createInitialViewState(this.source);
    this.applySnapshot(nextState);
    this.finishPointerInteraction();
    this.markSceneChanged({
      syncStructure: true,
      viewport: true,
      selectionBox: true,
      scale: true,
      source: true,
      summary: true,
      inspector: true,
      file: true,
    });
  }

  private listWorkspaceFilesForNodeType(nodeType: WorkspaceFileNodeType): readonly TFile[] {
    const files = nodeType === 'note'
      ? this.app.vault.getMarkdownFiles()
      : this.app.vault.getFiles();

    return [...files].sort((left, right) => left.path.localeCompare(right.path, 'zh-CN'));
  }

  private openWorkspaceFileNodePicker(
    nodeType: WorkspaceFileNodeType,
    scenePosition: ScenePoint | undefined,
    anchorNode: CanvasNodeState | null,
  ): void {
    const files = this.listWorkspaceFilesForNodeType(nodeType);

    if (files.length === 0) {
      new Notice(
        nodeType === 'note'
          ? `${DEMO_TITLE}: 当前工作区没有可选择的 Markdown 笔记。`
          : `${DEMO_TITLE}: 当前工作区没有可选择的文件。`,
        2400,
      );
      return;
    }

    const modal = new WorkspaceFileNodeSuggestModal(
      this.app,
      nodeType,
      files,
      (file) => {
        void this.addWorkspaceFileNode(file, nodeType, scenePosition, anchorNode);
      },
    );
    modal.open();
  }

  private openUrlNodeAddressPicker(
    scenePosition: ScenePoint | undefined,
    anchorNode: CanvasNodeState | null,
  ): void {
    const modal = new UrlNodeAddressSuggestModal(
      this.app,
      '新增 URL 节点',
      '创建 URL 节点',
      undefined,
      (url) => {
        this.addUrlNode(url, scenePosition, anchorNode);
      },
    );
    modal.open();
  }

  private openUrlNodeAddressEditor(node: CanvasNodeState): void {
    if (node.type !== 'url') {
      return;
    }

    if (!this.guardWritableCanvas('编辑 URL 地址')) {
      return;
    }

    const modal = new UrlNodeAddressSuggestModal(
      this.app,
      '修改 URL 地址',
      '更新 URL 地址',
      node.url,
      (url) => {
        this.updateUrlNodeAddress(node.id, url);
      },
    );
    modal.open();
  }

  private updateUrlNodeAddress(nodeId: NodeId, url: string): void {
    if (!this.guardWritableCanvas('编辑 URL 地址')) {
      return;
    }

    const nextUrl = normalizeExternalUrlInput(url);

    if (nextUrl === null) {
      new Notice(`${DEMO_TITLE}: URL 节点链接无效。`, 2200);
      return;
    }

    const targetNode = this.nodes.find((node) => node.id === nodeId) ?? null;

    if (targetNode === null || targetNode.type !== 'url' || targetNode.url === nextUrl) {
      return;
    }

    this.urlPreviewStates.delete(nodeId);
    this.nodes = this.nodes.map((node) => {
      if (node.id !== nodeId || node.type !== 'url') {
        return node;
      }

      return {
        ...node,
        body: '',
        url: nextUrl,
      };
    });
    this.setSelectedNodes([nodeId], nodeId);
    this.inlineEditingNodeId = null;
    this.markSceneChanged({
      nodeIds: [nodeId],
      summary: true,
      inspector: true,
    });
  }

  private addUrlNode(
    url: string,
    scenePosition: ScenePoint | undefined,
    anchorNode: CanvasNodeState | null,
  ): void {
    if (!this.guardWritableCanvas('新增 URL 节点')) {
      return;
    }

    const accent = createNodeAccent(this.nextNodeSerial);
    const nextNodeId = `node-${this.nextNodeSerial}`;
    const nodeContent = createNodeContent('url', this.nextNodeSerial, anchorNode?.title);
    const shouldCenterViewport = scenePosition === undefined && anchorNode === null;
    const nextPosition = scenePosition ?? (
      anchorNode === null
        ? this.resolveCenteredScenePosition('url')
        : { x: anchorNode.x + 320, y: anchorNode.y + 140 }
    );
    const nextNode: CanvasNodeState = {
      id: nextNodeId,
      type: 'url',
      title: nodeContent.title,
      body: '',
      accent: accent.accent,
      shadow: accent.shadow,
      x: nextPosition.x,
      y: nextPosition.y,
      url,
    };
    const nextLine: CanvasLineState | null = anchorNode === null
      ? null
      : {
          id: `line-${anchorNode.id}-${nextNodeId}`,
          from: anchorNode.id,
          to: nextNodeId,
          label: '新建连线',
        };

    this.nextNodeSerial += 1;
    this.nodes = [...this.nodes, nextNode];
    this.lines = nextLine === null ? this.lines : [...this.lines, nextLine];
    this.setSelectedNodes([nextNodeId], nextNodeId);
    if (shouldCenterViewport) {
      this.centerViewportOnNode(nextNode);
    }
    this.markSceneChanged({
      syncStructure: true,
      viewport: shouldCenterViewport,
      summary: true,
      inspector: true,
    });
  }

  private async createWorkspaceFileNodeBody(
    file: TFile,
    nodeType: WorkspaceFileNodeType,
    anchorNode: CanvasNodeState | null,
  ): Promise<string> {
    const anchorSuffix = anchorNode === null ? '' : `，从“${anchorNode.title}”连接`;

    if (nodeType === 'file') {
      return `已链接当前工作区文件：${file.path}${anchorSuffix}`;
    }

    try {
      const raw = await this.app.vault.cachedRead(file);
      return createPlainTextPreview(raw);
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      new Notice(`${DEMO_TITLE}: 读取笔记预览失败：${message}`, 2400);
      return `已链接当前工作区笔记：${file.path}${anchorSuffix}`;
    }
  }

  private async addWorkspaceFileNode(
    file: TFile,
    nodeType: WorkspaceFileNodeType,
    scenePosition: ScenePoint | undefined,
    anchorNode: CanvasNodeState | null,
  ): Promise<void> {
    if (!this.guardWritableCanvas('新增文件节点')) {
      return;
    }

    const serial = this.nextNodeSerial;
    const accent = createNodeAccent(serial);
    const nextNodeId = `node-${serial}`;
    const nextBody = await this.createWorkspaceFileNodeBody(file, nodeType, anchorNode);
    const shouldCenterViewport = scenePosition === undefined && anchorNode === null;
    const nextPosition = scenePosition ?? (
      anchorNode === null
        ? this.resolveCenteredScenePosition(nodeType)
        : { x: anchorNode.x + 320, y: anchorNode.y + 140 }
    );
    const nextNode: CanvasNodeState = {
      id: nextNodeId,
      type: nodeType,
      title: file.basename.length > 0 ? file.basename : file.name,
      body: nextBody,
      accent: accent.accent,
      shadow: accent.shadow,
      x: nextPosition.x,
      y: nextPosition.y,
      targetPath: file.path,
    };

    this.nextNodeSerial += 1;
    this.nodes = [...this.nodes, nextNode];
    if (shouldCenterViewport) {
      this.centerViewportOnNode(nextNode);
    }

    if (anchorNode !== null) {
      this.lines = [
        ...this.lines,
        {
          id: `line-${anchorNode.id}-${nextNodeId}`,
          from: anchorNode.id,
          to: nextNodeId,
          label: '新建连线',
        },
      ];
    }

    this.setSelectedNodes([nextNodeId], nextNodeId);
    this.markSceneChanged({
      syncStructure: true,
      viewport: shouldCenterViewport,
      summary: true,
      inspector: true,
    });
  }

  private resolveWorkspaceFileNodeType(file: TFile): WorkspaceFileNodeType {
    return file.extension.toLowerCase() === 'md' ? 'note' : 'file';
  }

  private resolveTargetPathAfterVaultRename(targetPath: string, oldPath: string, newPath: string): string | null {
    if (targetPath === oldPath) {
      return newPath;
    }

    const oldPathPrefix = `${oldPath}/`;

    if (!targetPath.startsWith(oldPathPrefix)) {
      return null;
    }

    return `${newPath}/${targetPath.slice(oldPathPrefix.length)}`;
  }

  private resolveNodeTitleAfterVaultRename(node: CanvasNodeState, oldPath: string, nextFile: TFile | null): string {
    if (nextFile === null) {
      return node.title;
    }

    const oldFileName = extractPathFileName(oldPath);
    const oldBasename = extractPathBasename(oldPath);

    if (node.title !== oldFileName && node.title !== oldBasename && node.title.trim().length > 0) {
      return node.title;
    }

    return nextFile.basename.length > 0 ? nextFile.basename : nextFile.name;
  }

  private handleVaultRename(file: TAbstractFile, oldPath: string): void {
    const changedNodeIds: NodeId[] = [];

    this.nodes = this.nodes.map((node) => {
      if (!isWorkspaceFileNode(node) || node.targetPath === undefined) {
        return node;
      }

      const nextTargetPath = this.resolveTargetPathAfterVaultRename(node.targetPath, oldPath, file.path);

      if (nextTargetPath === null) {
        return node;
      }

      const nextFile = this.app.vault.getFileByPath(nextTargetPath);
      changedNodeIds.push(node.id);
      return {
        ...node,
        title: this.resolveNodeTitleAfterVaultRename(node, oldPath, nextFile),
        targetPath: nextTargetPath,
      };
    });

    if (changedNodeIds.length === 0) {
      return;
    }

    this.markSceneChanged({
      nodeIds: changedNodeIds,
      summary: true,
      inspector: true,
    });
  }

  private syncFileReferenceStatusForPath(path: string): void {
    const affectedNodeIds = this.nodes
      .filter((node) => (
        isWorkspaceFileNode(node)
        && node.targetPath !== undefined
        && (node.targetPath === path || node.targetPath.startsWith(`${path}/`))
      ))
      .map((node) => node.id);

    if (affectedNodeIds.length === 0) {
      return;
    }

    this.syncScene({
      nodeIds: affectedNodeIds,
      inspector: true,
      summary: true,
    });
  }

  private canAcceptWorkspaceFileDrop(dataTransfer: DataTransfer | null): boolean {
    if (dataTransfer === null) {
      return false;
    }

    const dragPayloadTypes = Array.from(dataTransfer.types);
    return dragPayloadTypes.includes(WORKSPACE_FILE_DRAG_MIME_TYPE)
      || dragPayloadTypes.includes('text/plain')
      || dragPayloadTypes.includes('text/uri-list');
  }

  private resolveWorkspaceFileFromDrop(dataTransfer: DataTransfer | null): TFile | null {
    if (dataTransfer === null) {
      return null;
    }

    const droppedPath = readDroppedWorkspacePath(dataTransfer);

    if (droppedPath === null) {
      return null;
    }

    return this.app.vault.getFileByPath(droppedPath);
  }

  private resolveScenePointFromMouseEvent(event: MouseEvent): ScenePoint | null {
    const viewportLocal = this.resolveViewportLocalPoint(event, false);

    if (viewportLocal === null) {
      return null;
    }

    return this.resolveScenePointFromViewportLocal(viewportLocal);
  }

  private captureViewportMetricsFromEvent(event: Event): void {
    const surfaceWidth = readAugmentedEventNumber(event, 'surfaceWidth');
    const surfaceHeight = readAugmentedEventNumber(event, 'surfaceHeight');

    if (surfaceWidth !== null && surfaceWidth > 0) {
      this.lastViewportWidth = surfaceWidth;
    }

    if (surfaceHeight !== null && surfaceHeight > 0) {
      this.lastViewportHeight = surfaceHeight;
    }
  }

  private resolvePreferredViewportCenterLocalPoint(): ScenePoint {
    const viewportWidth = Math.max(
      this.lastViewportWidth,
      this.viewportEl?.clientWidth ?? 0,
      CARD_WIDTH,
    );
    const viewportHeight = Math.max(
      this.lastViewportHeight,
      this.viewportEl?.clientHeight ?? 0,
      CARD_HEIGHT,
    );
    const reservedRightWidth = Math.min(
      viewportWidth / 3,
      FLOATING_PANEL_WIDTH + (FLOATING_PANEL_INSET * 2),
    );
    const usableWidth = Math.max(viewportWidth - reservedRightWidth, CARD_WIDTH);

    return {
      x: usableWidth / 2,
      y: viewportHeight / 2,
    };
  }

  private resolveCenteredScenePosition(nodeType: CanvasNodeType): ScenePoint {
    const viewportCenter = this.resolvePreferredViewportCenterLocalPoint();
    const sceneCenter = this.resolveScenePointFromViewportLocal(viewportCenter);
    const nodeWidthValue = defaultNodeWidthForType(nodeType);
    const nodeHeightValue = defaultNodeHeightForType(nodeType);

    return {
      x: sceneCenter.x - (nodeWidthValue / 2),
      y: sceneCenter.y - (nodeHeightValue / 2),
    };
  }

  private centerViewportOnNode(node: CanvasNodeState): void {
    const viewportCenter = this.resolvePreferredViewportCenterLocalPoint();
    this.offsetX = viewportCenter.x - (nodeCenterX(node) * this.scale);
    this.offsetY = viewportCenter.y - (nodeCenterY(node) * this.scale);
  }

  private focusInlineTitleInput(inputEl: HTMLInputElement | HTMLTextAreaElement): void {
    const compatibleInput = inputEl as (HTMLInputElement | HTMLTextAreaElement) & {
      focus?: (options?: FocusOptions) => void;
      select?: () => void;
      setSelectionRange?: (start: number, end: number) => void;
    };

    if (typeof compatibleInput.focus === 'function') {
      try {
        compatibleInput.focus({ preventScroll: true });
      } catch {
        compatibleInput.focus();
      }
    }

    if (typeof compatibleInput.setSelectionRange === 'function') {
      const cursorOffset = compatibleInput.value.length;
      compatibleInput.setSelectionRange(cursorOffset, cursorOffset);
      return;
    }

    compatibleInput.select?.();
  }

  private focusInlineEditorForNode(nodeId: NodeId): void {
    setTimeout(() => {
      const nodeRuntime = this.nodeRuntimes.get(nodeId) ?? null;

      if (nodeRuntime === null) {
        return;
      }

      this.focusInlineTitleInput(nodeRuntime.inlineTitleInputEl);
    }, 0);
  }

  private focusElementWithoutScroll(target: HTMLElement | null): void {
    if (target === null) {
      return;
    }

    try {
      target.focus({ preventScroll: true });
    } catch {
      target.focus();
    }
  }

  private bringNodeIdsToFront(nodeIds: readonly NodeId[]): boolean {
    if (nodeIds.length === 0) {
      return false;
    }

    const targetNodeIds = new Set(nodeIds);
    const nextNodes = [
      ...this.nodes.filter((node) => !targetNodeIds.has(node.id)),
      ...this.nodes.filter((node) => targetNodeIds.has(node.id)),
    ];

    if (
      nextNodes.length === this.nodes.length
      && nextNodes.every((node, index) => node.id === this.nodes[index]?.id)
    ) {
      return false;
    }

    this.nodes = nextNodes;
    return true;
  }

  private resolveTextNodeRequiredHeight(nodeId: NodeId): number | null {
    const runtime = this.nodeRuntimes.get(nodeId) ?? null;

    if (runtime === null || !(runtime.inlineTitleInputEl instanceof HTMLTextAreaElement)) {
      return null;
    }

    return Math.ceil(runtime.inlineTitleInputEl.scrollHeight) > TEXT_NODE_LINE_HEIGHT
      ? TEXT_NODE_MULTI_LINE_HEIGHT
      : TEXT_NODE_HEIGHT;
  }

  private resolveMinimumNodeHeight(node: CanvasNodeState): number {
    if (node.type !== 'text') {
      return minNodeHeightForType(node.type);
    }

    return this.resolveTextNodeRequiredHeight(node.id) ?? TEXT_NODE_HEIGHT;
  }

  private syncTextNodeDisplayViewport(
    node: CanvasNodeState,
    runtime: CanvasNodeRuntime,
    isInlineEditing: boolean,
  ): void {
    if (node.type !== 'text' || !(runtime.inlineTitleInputEl instanceof HTMLTextAreaElement)) {
      return;
    }

    runtime.inlineTitleInputEl.style.overflowY = isInlineEditing && nodeHeight(node) > TEXT_NODE_HEIGHT
      ? 'auto'
      : 'hidden';

    if (isInlineEditing) {
      return;
    }

    runtime.inlineTitleInputEl.scrollTop = runtime.inlineTitleInputEl.scrollHeight;
  }

  private expandTextNodeToFitContent(nodeId: NodeId): readonly NodeId[] {
    const node = this.nodes.find((item) => item.id === nodeId) ?? null;

    if (node === null || node.type !== 'text') {
      return [];
    }

    const requiredHeight = this.resolveTextNodeRequiredHeight(nodeId);

    if (requiredHeight === null || nodeHeight(node) >= requiredHeight) {
      return [];
    }

    this.nodes = this.nodes.map((item) => {
      if (item.id !== nodeId) {
        return item;
      }

      return {
        ...item,
        height: requiredHeight,
      };
    });

    const expandedGroupIds = this.expandGroupsToFitMembers(this.collectParentGroupIdsForNodes([nodeId]));
    return [nodeId, ...expandedGroupIds];
  }

  private syncViewportCursor(): void {
    if (this.viewportEl === null) {
      return;
    }

    if (this.dragMode === 'pan' || this.dragMode === 'selection-box') {
      this.viewportEl.style.cursor = 'grabbing';
      return;
    }

    if (this.dragMode === 'select') {
      this.viewportEl.style.cursor = 'crosshair';
      return;
    }

    if (this.spacePanPressed) {
      this.viewportEl.style.cursor = 'grab';
      return;
    }

    this.viewportEl.style.cursor = 'default';
  }

  private canDragPersistentSelectionBox(): boolean {
    return this.persistentSelectionBoxActive
      && this.selectedNodeIds.length > 1
      && !this.isCanvasReadOnly()
      && this.inlineEditingNodeId === null;
  }

  private resolveResizeDirectionForNodeEvent(
    event: MouseEvent,
    node: CanvasNodeState,
    isInlineEditing: boolean,
    isReadOnly: boolean,
  ): ResizeDirection | null {
    if (isInlineEditing || isReadOnly) {
      return null;
    }

    const elementX = readAugmentedEventNumber(event, 'elementX');
    const elementY = readAugmentedEventNumber(event, 'elementY');

    if (elementX === null || elementY === null) {
      return null;
    }

    return resolveResizeDirectionFromLocalPoint(
      elementX,
      elementY,
      nodeWidth(node),
      nodeHeight(node),
      resolveResizeHitAreaMetrics(node),
    );
  }

  private startNodeResizeInteraction(
    event: MouseEvent,
    nodeId: NodeId,
    currentNode: CanvasNodeState,
    direction: ResizeDirection,
    pointerOwnerEl: HTMLElement,
  ): void {
    event.preventDefault();
    event.stopPropagation();
    if (!this.guardWritableCanvas('调整节点大小')) {
      return;
    }

    const previousSelection = this.captureSelectionSnapshot();
    const zOrderChanged = this.bringNodeIdsToFront([nodeId]);
    this.setSelectedNodes([nodeId], nodeId);
    this.inlineEditingNodeId = null;
    this.activeNodeId = nodeId;
    this.dragMode = 'resize';
    this.resizeDirection = direction;
    this.dragStartX = event.clientX;
    this.dragStartY = event.clientY;
    this.resizeOriginNodeX = currentNode.x;
    this.resizeOriginNodeY = currentNode.y;
    this.resizeOriginWidth = nodeWidth(currentNode);
    this.resizeOriginHeight = nodeHeight(currentNode);
    this.pointerCaptureOwnerEl = pointerOwnerEl;
    pointerOwnerEl.setPointerCapture(HOST_MOUSE_POINTER_ID);
    pointerOwnerEl.style.cursor = resolveResizeCursor(direction);
    this.syncScene({
      syncStructure: zOrderChanged,
      nodeIds: this.collectSelectionAffectedNodeIds(previousSelection),
      inspector: true,
      summary: true,
    });
  }

  private applyResizeHitAreaLayout(
    targetEl: HTMLElement,
    direction: ResizeDirection,
    metrics: ResizeHitAreaMetrics,
  ): void {
    const frameOutset = metrics.frameOutset;
    const edgeSize = metrics.edgeHitSize * 2;
    const edgeSpan = edgeSize + frameOutset;
    const cornerSpan = metrics.cornerHitSize + frameOutset;
    const edgeInset = cornerSpan;

    targetEl.style.position = 'absolute';
    targetEl.style.background = 'transparent';
    targetEl.style.zIndex = '6';
    targetEl.style.cursor = resolveResizeCursor(direction);
    targetEl.style.pointerEvents = 'auto';

    switch (direction) {
      case 'n':
        targetEl.style.left = `${edgeInset}px`;
        targetEl.style.right = `${edgeInset}px`;
        targetEl.style.top = '0';
        targetEl.style.height = `${edgeSpan}px`;
        return;
      case 's':
        targetEl.style.left = `${edgeInset}px`;
        targetEl.style.right = `${edgeInset}px`;
        targetEl.style.bottom = '0';
        targetEl.style.height = `${edgeSpan}px`;
        return;
      case 'e':
        targetEl.style.top = `${edgeInset}px`;
        targetEl.style.bottom = `${edgeInset}px`;
        targetEl.style.right = '0';
        targetEl.style.width = `${edgeSpan}px`;
        return;
      case 'w':
        targetEl.style.top = `${edgeInset}px`;
        targetEl.style.bottom = `${edgeInset}px`;
        targetEl.style.left = '0';
        targetEl.style.width = `${edgeSpan}px`;
        return;
      case 'ne':
        targetEl.style.top = '0';
        targetEl.style.right = '0';
        targetEl.style.width = `${cornerSpan}px`;
        targetEl.style.height = `${cornerSpan}px`;
        return;
      case 'nw':
        targetEl.style.top = '0';
        targetEl.style.left = '0';
        targetEl.style.width = `${cornerSpan}px`;
        targetEl.style.height = `${cornerSpan}px`;
        return;
      case 'se':
        targetEl.style.right = '0';
        targetEl.style.bottom = '0';
        targetEl.style.width = `${cornerSpan}px`;
        targetEl.style.height = `${cornerSpan}px`;
        return;
      case 'sw':
        targetEl.style.left = '0';
        targetEl.style.bottom = '0';
        targetEl.style.width = `${cornerSpan}px`;
        targetEl.style.height = `${cornerSpan}px`;
        return;
    }
  }

  private resolveNodeCursor(
    _isSelected: boolean,
    isInlineEditing: boolean,
    isReadOnly: boolean,
  ): 'default' | 'pointer' | 'not-allowed' {
    if (isReadOnly) {
      return 'not-allowed';
    }

    if (!isInlineEditing) {
      return 'default';
    }

    return 'default';
  }

  private releaseSpacePanPress(): void {
    if (!this.spacePanPressed) {
      return;
    }

    this.spacePanPressed = false;

    if (this.dragMode === 'pan') {
      this.finishPointerInteraction();
      return;
    }

    this.syncViewportCursor();
  }

  private handleWorkspaceFileDragOver(event: DragEvent): void {
    if (!this.canAcceptWorkspaceFileDrop(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (event.dataTransfer !== null) {
      event.dataTransfer.dropEffect = event.dataTransfer.effectAllowed === 'move' ? 'move' : 'copy';
    }
  }

  private handleWorkspaceFileDrop(event: DragEvent): void {
    if (!this.canAcceptWorkspaceFileDrop(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const file = this.resolveWorkspaceFileFromDrop(event.dataTransfer);

    if (file === null) {
      new Notice(`${DEMO_TITLE}: 拖入项不是当前工作区文件，无法创建白板节点。`, 2400);
      return;
    }

    const scenePoint = this.resolveScenePointFromMouseEvent(event);
    void this.addWorkspaceFileNode(
      file,
      this.resolveWorkspaceFileNodeType(file),
      scenePoint ?? undefined,
      null,
    );
  }

  public addStandaloneNode(
    scenePosition?: ScenePoint,
    nodeType: CanvasNodeType = 'text',
  ): void {
    if (!this.guardWritableCanvas('新增节点')) {
      return;
    }

    if (nodeType === 'note' || nodeType === 'file') {
      this.openWorkspaceFileNodePicker(nodeType, scenePosition, null);
      return;
    }

    if (nodeType === 'url') {
      this.openUrlNodeAddressPicker(scenePosition, null);
      return;
    }

    const accent = createNodeAccent(this.nextNodeSerial);
    const nodeContent = createNodeContent(nodeType, this.nextNodeSerial);
    const nextPosition = scenePosition ?? this.resolveCenteredScenePosition(nodeType);
    const shouldCenterViewport = scenePosition === undefined;
    const nextNode: CanvasNodeState = {
      id: `node-${this.nextNodeSerial}`,
      type: nodeType,
      title: nodeContent.title,
      body: nodeType === 'group' ? '' : nodeContent.body,
      accent: accent.accent,
      shadow: accent.shadow,
      x: nextPosition.x,
      y: nextPosition.y,
      ...(nodeContent.targetPath === undefined ? {} : { targetPath: nodeContent.targetPath }),
      ...(nodeContent.url === undefined ? {} : { url: nodeContent.url }),
      ...(nodeType === 'group' ? { width: GROUP_NODE_WIDTH, height: GROUP_NODE_HEIGHT } : {}),
    };

    this.nextNodeSerial += 1;
    this.nodes = [...this.nodes, nextNode];
    this.setSelectedNodes([nextNode.id], nextNode.id);
    if (shouldCenterViewport) {
      this.centerViewportOnNode(nextNode);
    }
    if (nodeType === 'text') {
      this.inlineEditingNodeId = nextNode.id;
    }
    this.markSceneChanged({
      syncStructure: true,
      viewport: shouldCenterViewport,
      summary: true,
      inspector: true,
    });
    if (nodeType === 'text') {
      this.focusInlineEditorForNode(nextNode.id);
    }
  }

  public addConnectedNode(
    scenePosition?: ScenePoint,
    nodeType: CanvasNodeType = 'text',
  ): void {
    if (!this.guardWritableCanvas('新增连接节点')) {
      return;
    }

    const anchorNode = this.resolveSelectedNode() ?? this.nodes[this.nodes.length - 1] ?? null;

    if (nodeType === 'note' || nodeType === 'file') {
      this.openWorkspaceFileNodePicker(nodeType, scenePosition, anchorNode);
      return;
    }

    if (nodeType === 'url') {
      if (anchorNode === null) {
        this.openUrlNodeAddressPicker(scenePosition, null);
        return;
      }

      this.openUrlNodeAddressPicker(scenePosition, anchorNode);
      return;
    }

    if (anchorNode === null) {
      this.addStandaloneNode(scenePosition, nodeType);
      return;
    }

    const accent = createNodeAccent(this.nextNodeSerial);
    const nextNodeId = `node-${this.nextNodeSerial}`;
    const nodeContent = createNodeContent(nodeType, this.nextNodeSerial, anchorNode.title);
    const nextPosition = scenePosition ?? {
      x: anchorNode.x + 320,
      y: anchorNode.y + 140,
    };
    const nextNode: CanvasNodeState = {
      id: nextNodeId,
      type: nodeType,
      title: nodeContent.title,
      body: nodeType === 'group' ? '' : nodeContent.body,
      accent: accent.accent,
      shadow: accent.shadow,
      x: nextPosition.x,
      y: nextPosition.y,
      ...(nodeContent.targetPath === undefined ? {} : { targetPath: nodeContent.targetPath }),
      ...(nodeContent.url === undefined ? {} : { url: nodeContent.url }),
      ...(nodeType === 'group' ? { width: GROUP_NODE_WIDTH, height: GROUP_NODE_HEIGHT } : {}),
    };
    const nextLine: CanvasLineState = {
      id: `line-${anchorNode.id}-${nextNodeId}`,
      from: anchorNode.id,
      to: nextNodeId,
      label: '新建连线',
    };

    this.nextNodeSerial += 1;
    this.nodes = [...this.nodes, nextNode];
    this.lines = [...this.lines, nextLine];
    this.setSelectedNodes([nextNodeId], nextNodeId);
    if (nodeType === 'text') {
      this.inlineEditingNodeId = nextNodeId;
    }
    this.markSceneChanged({
      syncStructure: true,
      summary: true,
      inspector: true,
    });
    if (nodeType === 'text') {
      this.focusInlineEditorForNode(nextNodeId);
    }
  }

  public removeSelectedNode(): void {
    if (!this.guardWritableCanvas('删除节点')) {
      return;
    }

    const selectedNode = this.resolveSelectedNode();

    if (selectedNode === null) {
      new Notice(`${DEMO_TITLE}：请先选中一个节点。`, 1800);
      return;
    }

    const selectedIdSet = new Set(this.selectedNodeIds.length > 0 ? this.selectedNodeIds : [selectedNode.id]);
    const removedGroupIds = new Set(
      this.nodes
        .filter((node) => selectedIdSet.has(node.id) && node.type === 'group')
        .map((node) => node.id),
    );
    this.nodes = this.nodes
      .filter((node) => !selectedIdSet.has(node.id))
      .map((node) => (
        node.groupId !== undefined && removedGroupIds.has(node.groupId)
          ? this.createNodeWithoutGroupId(node)
          : node
      ));
    this.lines = this.lines.filter((line) => !selectedIdSet.has(line.from) && !selectedIdSet.has(line.to));
    this.setSelectedNodes(this.nodes[0] === undefined ? [] : [this.nodes[0].id], this.nodes[0]?.id ?? null);
    this.finishPointerInteraction();
    this.markSceneChanged({
      syncStructure: true,
      summary: true,
      inspector: true,
    });
  }

  public removeSelectedNodeLines(): void {
    if (!this.guardWritableCanvas('删除连线')) {
      return;
    }

    const selectedNode = this.resolveSelectedNode();

    if (selectedNode === null) {
      new Notice(`${DEMO_TITLE}：请先选中一个节点。`, 1800);
      return;
    }

    const selectedIdSet = new Set(this.selectedNodeIds.length > 0 ? this.selectedNodeIds : [selectedNode.id]);
    this.lines = this.lines.filter((line) => !selectedIdSet.has(line.from) && !selectedIdSet.has(line.to));
    this.markSceneChanged({
      syncStructure: true,
      summary: true,
      inspector: true,
    });
  }

  public updateSelectedNodeTitle(value: string): void {
    if (!this.guardWritableCanvas('编辑节点标题')) {
      return;
    }

    if (this.selectedNodeIds.length !== 1) {
      return;
    }

    const selectedNode = this.resolveSelectedNode();

    if (selectedNode === null) {
      return;
    }

    const nextTitle = value.trim().length > 0 ? value : '';
    if (selectedNode.title === nextTitle) {
      return;
    }

    this.nodes = updateNodeContent(this.nodes, selectedNode.id, {
      title: nextTitle,
      body: selectedNode.body,
    });
    const autoExpandedNodeIds = this.expandTextNodeToFitContent(selectedNode.id);
    const changedNodeIds = [...new Set([selectedNode.id, ...autoExpandedNodeIds])];
    this.markSceneChanged({
      nodeIds: changedNodeIds,
      lineIds: this.collectLineIdsForNodeIds(changedNodeIds),
      summary: true,
      inspector: true,
    });
  }

  public updateSelectedNodeBody(value: string): void {
    if (!this.guardWritableCanvas('编辑节点正文')) {
      return;
    }

    if (this.selectedNodeIds.length !== 1) {
      return;
    }

    const selectedNode = this.resolveSelectedNode();

    if (selectedNode === null) {
      return;
    }

    if (selectedNode.type === 'group') {
      return;
    }

    if (selectedNode.type === 'url') {
      return;
    }

    if (selectedNode.body === value) {
      return;
    }

    this.nodes = updateNodeContent(this.nodes, selectedNode.id, {
      title: selectedNode.title,
      body: value,
    });
    this.markSceneChanged({
      nodeIds: [selectedNode.id],
      inspector: true,
    });
  }

  public updateSelectedNodeUrl(value: string): void {
    if (this.selectedNodeIds.length !== 1) {
      return;
    }

    const selectedNode = this.resolveSelectedNode();

    if (selectedNode === null || selectedNode.type !== 'url') {
      return;
    }

    this.updateUrlNodeAddress(selectedNode.id, value);
  }

  public async saveSceneFile(): Promise<void> {
    if (!this.guardWritableCanvas('保存白板文件')) {
      return;
    }

    await this.flushAutoSave('手动保存', '已手动保存到');
    this.syncScene({
      file: true,
      refreshFileLists: true,
    });
  }

  public async loadSceneFile(): Promise<void> {
    let snapshot: LoadedCanvasDocumentResult | null = null;

    try {
      snapshot = await this.readSnapshotFromCanvasFile(this.canvasFilePath, '从白板文件加载');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      const rawContent = await this.readCanvasRawContent(this.canvasFilePath);
      this.enterInvalidCanvasRecovery(errorMessage, rawContent);
      this.sceneFileExists = this.app.vault.getFileByPath(this.canvasFilePath) !== null;
      this.canvasMetadata = null;
      this.finishPointerInteraction();
      new Notice(`${DEMO_TITLE}：白板文件恢复失败，已进入只读恢复模式。`, 2800);
      this.syncScene();
      return;
    }

    if (snapshot === null) {
      new Notice(`${DEMO_TITLE}：当前还没有白板文件，请先点击“保存到文件”。`, 2200);
      this.sceneFileExists = false;
      this.canvasMetadata = null;
      this.sceneFileMessage = '当前白板文件尚未创建。';
      this.clearCanvasRecoveryState();
      this.syncScene({
        file: true,
        refreshFileLists: true,
        recovery: true,
      });
      return;
    }

    this.applySnapshot(snapshot.snapshot);
    this.canvasMetadata = snapshot.metadata;
    this.source = '从白板文件加载';
    this.sceneFileExists = true;
    this.lastLoadedAt = formatTimestamp(new Date());
    this.sceneFileMessage = `已从 ${this.canvasFilePath} 重新加载白板文件。`;
    this.clearCanvasRecoveryState();
    this.autoSaveState = 'saved';
    this.autoSaveErrorMessage = null;
    this.cancelAutoSaveHandle();
    this.finishPointerInteraction();
    this.syncScene();
  }

  public async openSceneFile(): Promise<void> {
    if (this.autoSaveState === 'pending') {
      await this.flushAutoSave('打开白板文件前自动保存', '打开白板文件前已自动保存到');
    }

    const file = await this.ensureSceneFileExists();
    await this.openCanvasFile(file, '打开白板文件');
  }

  public async openSpecificSceneFile(file: TFile, source: string): Promise<void> {
    if (this.autoSaveState === 'pending') {
      await this.flushAutoSave('切换白板文件前自动保存', '切换白板文件前已自动保存到');
    }

    await this.openCanvasFile(file, source);
  }

  private resetViewport(): void {
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.markSceneChanged({
      viewport: true,
      selectionBox: true,
      scale: true,
      summary: true,
    });
  }

  private moveSelectedNodesBy(deltaX: number, deltaY: number): void {
    if (this.selectedNodeIds.length === 0) {
      return;
    }

    const movedNodeIds = this.collectGroupAwareMoveNodeIds(this.selectedNodeIds);
    const selectedIds = new Set(movedNodeIds);
    this.nodes = this.nodes.map((node) => {
      if (!selectedIds.has(node.id)) {
        return node;
      }

      return {
        ...node,
        x: node.x + deltaX,
        y: node.y + deltaY,
      };
    });
    this.markSceneChanged({
      nodeIds: movedNodeIds,
      lineIds: this.collectLineIdsForNodeIds(movedNodeIds),
      summary: true,
      inspector: true,
    });
  }

  private isInlineEditorEventTarget(target: EventTarget | null): boolean {
    return (
      target instanceof HTMLElement
      && target.dataset.inlineEditorInteractive === 'true'
    );
  }

  private handleCanvasKeydown(event: KeyboardEvent): void {
    this.captureViewportMetricsFromEvent(event);

    if (this.isInlineEditorEventTarget(event.target)) {
      const inlineEditorTarget = event.target;
      const isInlineTitleEditorTarget = inlineEditorTarget instanceof HTMLElement
        && inlineEditorTarget.dataset.role === 'inline-title-input';
      const shouldExitInlineEditing = event.key === 'Escape'
        || (
          event.key === 'Enter'
          && !event.isComposing
          && (
            inlineEditorTarget instanceof HTMLInputElement
            || (
              inlineEditorTarget instanceof HTMLTextAreaElement
              && isInlineTitleEditorTarget
            )
          )
        );

      if (shouldExitInlineEditing) {
        event.preventDefault();
        const previousSelection = this.captureSelectionSnapshot();
        this.inlineEditingNodeId = null;
        this.syncScene({
          nodeIds: this.collectSelectionAffectedNodeIds(previousSelection),
          inspector: true,
          summary: true,
        });
      }
      return;
    }

    if (event.code === 'Space' || event.key === ' ') {
      event.preventDefault();

      if (!this.spacePanPressed) {
        this.spacePanPressed = true;
        this.syncViewportCursor();
      }
      return;
    }

    switch (event.key) {
      case 'Delete':
      case 'Backspace':
        event.preventDefault();
        this.removeSelectedNode();
        return;
      case 'Escape':
        event.preventDefault();
        {
          const previousSelection = this.captureSelectionSnapshot();
          this.inlineEditingNodeId = null;
          this.setSelectedNodes([], null);
          this.syncScene({
            nodeIds: this.collectSelectionAffectedNodeIds(previousSelection),
            inspector: true,
            summary: true,
          });
        }
        return;
      case 'Enter':
        if (this.selectedNodeIds.length === 1 && this.selectedNodeId !== null) {
          event.preventDefault();
          this.enterInlineEdit(this.selectedNodeId);
        }
        return;
      case 'ArrowLeft':
        event.preventDefault();
        this.moveSelectedNodesBy(-16, 0);
        return;
      case 'ArrowRight':
        event.preventDefault();
        this.moveSelectedNodesBy(16, 0);
        return;
      case 'ArrowUp':
        event.preventDefault();
        this.moveSelectedNodesBy(0, -16);
        return;
      case 'ArrowDown':
        event.preventDefault();
        this.moveSelectedNodesBy(0, 16);
        return;
      case '+':
      case '=':
        event.preventDefault();
        this.scale = clamp(Number((this.scale + 0.08).toFixed(2)), MIN_SCALE, MAX_SCALE);
        this.markSceneChanged({
          viewport: true,
          selectionBox: true,
          scale: true,
          summary: true,
        });
        return;
      case '-':
      case '_':
        event.preventDefault();
        this.scale = clamp(Number((this.scale - 0.08).toFixed(2)), MIN_SCALE, MAX_SCALE);
        this.markSceneChanged({
          viewport: true,
          selectionBox: true,
          scale: true,
          summary: true,
        });
        return;
      case '0':
        event.preventDefault();
        this.resetViewport();
        return;
      default:
        return;
    }
  }

  private handleCanvasKeyup(event: KeyboardEvent): void {
    this.captureViewportMetricsFromEvent(event);

    if (this.isInlineEditorEventTarget(event.target)) {
      return;
    }

    if (event.code === 'Space' || event.key === ' ') {
      event.preventDefault();
      this.releaseSpacePanPress();
    }
  }

  private bindCanvasKeyboardTarget(targetEl: HTMLElement): void {
    this.registerDomEvent(targetEl, 'keydown', (event: KeyboardEvent) => {
      this.handleCanvasKeydown(event);
    });
    this.registerDomEvent(targetEl, 'keyup', (event: KeyboardEvent) => {
      this.handleCanvasKeyup(event);
    });
  }

  private openViewportContextMenu(event: MouseEvent): void {
    event.preventDefault();
    const viewportLocal = this.resolveViewportLocalPoint(event, false);
    const scenePoint = viewportLocal === null
      ? null
      : this.resolveScenePointFromViewportLocal(viewportLocal);
    const menu = new Menu();

    menu.addItem((item) => {
      item.setTitle('新增卡片');
      item.onClick(() => {
        this.addStandaloneNode(scenePoint ?? undefined);
      });
    });
    menu.addItem((item) => {
      item.setTitle('新增连接卡片');
      item.setDisabled(this.resolveSelectedNode() === null);
      item.onClick(() => {
        this.addConnectedNode(scenePoint ?? undefined);
      });
    });
    menu.addItem((item) => {
      item.setTitle('新增笔记节点');
      item.onClick(() => {
        this.addStandaloneNode(scenePoint ?? undefined, 'note');
      });
    });
    menu.addItem((item) => {
      item.setTitle('新增文件节点');
      item.onClick(() => {
        this.addStandaloneNode(scenePoint ?? undefined, 'file');
      });
    });
    menu.addItem((item) => {
      item.setTitle('新增 URL 节点');
      item.onClick(() => {
        this.addStandaloneNode(scenePoint ?? undefined, 'url');
      });
    });
    menu.addItem((item) => {
      item.setTitle('新增分组节点');
      item.onClick(() => {
        this.addStandaloneNode(scenePoint ?? undefined, 'group');
      });
    });
    menu.addSeparator();
    menu.addItem((item) => {
      item.setTitle(this.boxSelectionEnabled ? '关闭框选' : '开启框选');
      item.setChecked(this.boxSelectionEnabled);
      item.onClick(() => {
        this.boxSelectionEnabled = !this.boxSelectionEnabled;
        if (!this.boxSelectionEnabled && this.dragMode === 'select') {
          this.finishPointerInteraction();
          this.syncScene({
            boxSelectionChip: true,
            selectionBox: true,
          });
          return;
        }

        this.syncViewportCursor();
        this.syncScene({
          boxSelectionChip: true,
          selectionBox: true,
        });
      });
    });
    menu.addItem((item) => {
      item.setTitle('重置视口');
      item.onClick(() => {
        this.resetViewport();
      });
    });
    menu.addSeparator();
    menu.addItem((item) => {
      item.setTitle('保存到文件');
      item.onClick(() => {
        void this.saveSceneFile();
      });
    });
    menu.addItem((item) => {
      item.setTitle('从文件加载');
      item.onClick(() => {
        void this.loadSceneFile();
      });
    });
    menu.addItem((item) => {
      item.setTitle('打开场景文件');
      item.onClick(() => {
        void this.openSceneFile();
      });
    });

    menu.showAtMouseEvent(event);
  }

  private openNodeContextMenu(nodeId: NodeId, event: MouseEvent): void {
    event.preventDefault();
    const previousSelection = this.captureSelectionSnapshot();
    this.setSelectedNodes([nodeId], nodeId);
    const selectionChanged = this.hasSelectionStateChanged(previousSelection);
    const selectionNodeIds = this.collectSelectionAffectedNodeIds(previousSelection);

    if (selectionChanged) {
      this.markSceneChanged({
        nodeIds: selectionNodeIds,
        inspector: true,
        summary: true,
      });
    } else {
      this.syncScene({
        nodeIds: selectionNodeIds,
      });
    }

    const selectedNode = this.resolveSelectedNode();
    const scenePoint = selectedNode === null
      ? undefined
      : { x: selectedNode.x + 320, y: selectedNode.y + 140 };
    const menu = new Menu();

    menu.addItem((item) => {
      item.setTitle(selectedNode?.type === 'url' ? '编辑 URL 地址' : '卡片内编辑');
      item.onClick(() => {
        if (selectedNode?.type === 'url') {
          this.openUrlNodeAddressEditor(selectedNode);
          return;
        }

        this.enterInlineEdit(nodeId);
      });
    });
    if (selectedNode?.type === 'url') {
      menu.addItem((item) => {
        item.setTitle('打开 URL 链接');
        item.setDisabled(selectedNode.url === undefined || !isSupportedExternalUrl(selectedNode.url));
        item.onClick(() => {
          void this.openNodeUrlTarget(selectedNode);
        });
      });
    }
    menu.addItem((item) => {
      item.setTitle('新增连接卡片');
      item.onClick(() => {
        this.addConnectedNode(scenePoint);
      });
    });
    menu.addItem((item) => {
      item.setTitle('新增连接笔记');
      item.onClick(() => {
        this.addConnectedNode(scenePoint, 'note');
      });
    });
    menu.addItem((item) => {
      item.setTitle('新增连接文件');
      item.onClick(() => {
        this.addConnectedNode(scenePoint, 'file');
      });
    });
    menu.addItem((item) => {
      item.setTitle('新增连接 URL');
      item.onClick(() => {
        this.addConnectedNode(scenePoint, 'url');
      });
    });
    menu.addItem((item) => {
      item.setTitle('新增连接分组');
      item.onClick(() => {
        this.addConnectedNode(scenePoint, 'group');
      });
    });
    menu.addSeparator();
    menu.addItem((item) => {
      item.setTitle('删除选中卡片');
      item.onClick(() => {
        this.removeSelectedNode();
      });
    });
    menu.addItem((item) => {
      item.setTitle('删除关联连线');
      item.onClick(() => {
        this.removeSelectedNodeLines();
      });
    });

    menu.showAtMouseEvent(event);
  }

  private async openCanvasFile(file: TFile, source: string): Promise<void> {
    await this.openCanvasFileInLeaf(this.leaf, file, source);
  }

  private async openCanvasFileInLeaf(leaf: WorkspaceLeaf, file: TFile, source: string): Promise<void> {
    await leaf.setViewState({
      type: DEMO_VIEW_TYPE,
      active: true,
      state: {
        file: file.path,
        source,
      },
    });
    await this.app.workspace.revealLeaf(leaf);
  }

  private hasBrokenNodeReference(node: CanvasNodeState): boolean {
    if (isWorkspaceFileNode(node)) {
      return node.targetPath === undefined || this.app.vault.getFileByPath(node.targetPath) === null;
    }

    if (node.type === 'url') {
      return node.url === undefined || !isSupportedExternalUrl(node.url);
    }

    return false;
  }

  private resolveNodeReferenceText(node: CanvasNodeState): string | null {
    const referenceText = getNodeReferenceText(node);

    if (!this.hasBrokenNodeReference(node)) {
      return referenceText;
    }

    return `${referenceText ?? '节点引用'}（目标不存在或无效）`;
  }

  private queueUrlPreview(node: CanvasNodeState): void {
    if (node.type !== 'url' || node.url === undefined || !isSupportedExternalUrl(node.url)) {
      return;
    }

    const currentState = this.urlPreviewStates.get(node.id) ?? null;

    if (currentState !== null && currentState.url === node.url) {
      return;
    }

    const previewUrl = node.url;
    this.urlPreviewStates.set(node.id, {
      url: previewUrl,
      status: 'loading',
      metadata: null,
      errorMessage: null,
    });
    void this.loadUrlPreview(node.id, previewUrl).catch((error) => {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      this.urlPreviewStates.set(node.id, {
        url: previewUrl,
        status: 'error',
        metadata: null,
        errorMessage,
      });
      this.syncScene({
        nodeIds: [node.id],
      });
    });
  }

  private async loadUrlPreview(nodeId: NodeId, url: string): Promise<void> {
    try {
      const metadata = await this.app.urlMetadata.fetch(url);
      const currentNode = this.nodes.find((node) => node.id === nodeId) ?? null;

      if (currentNode === null || currentNode.type !== 'url' || currentNode.url !== url) {
        return;
      }

      this.urlPreviewStates.set(nodeId, {
        url,
        status: metadata.status === 'ok' ? 'ready' : 'error',
        metadata,
        errorMessage: metadata.errorMessage,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      const currentNode = this.nodes.find((node) => node.id === nodeId) ?? null;

      if (currentNode === null || currentNode.type !== 'url' || currentNode.url !== url) {
        return;
      }

      this.urlPreviewStates.set(nodeId, {
        url,
        status: 'error',
        metadata: null,
        errorMessage,
      });
    }

    this.syncScene({
      nodeIds: [nodeId],
    });
  }

  private createUrlPreviewText(text: string, opacity = '0.78', fontWeight = '400'): HTMLElement {
    const textEl = document.createElement('div');
    textEl.textContent = text;
    textEl.style.opacity = opacity;
    textEl.style.fontWeight = fontWeight;
    textEl.style.lineHeight = '1.5';
    textEl.style.fontSize = '12px';
    textEl.style.whiteSpace = 'pre-wrap';
    textEl.style.overflow = 'hidden';
    textEl.style.overflowWrap = 'anywhere';
    return textEl;
  }

  private createUrlPreviewFrame(url: string, title: string): HTMLElement {
    const iframeEl = document.createElement('iframe');
    iframeEl.setAttribute('src', url);
    iframeEl.setAttribute('sandbox', 'allow-scripts');
    iframeEl.setAttribute('credentialless', '');
    iframeEl.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    iframeEl.setAttribute('loading', 'lazy');
    iframeEl.setAttribute('title', title);
    iframeEl.setAttribute('autocomplete', 'off');
    iframeEl.style.display = 'block';
    iframeEl.style.width = '100%';
    iframeEl.style.height = '100%';
    iframeEl.style.minHeight = '0';
    iframeEl.style.border = '0';
    iframeEl.style.borderRadius = '10px';
    iframeEl.style.background = '#fff';
    iframeEl.style.pointerEvents = 'none';
    return iframeEl;
  }

  private syncUrlPreviewRuntime(node: CanvasNodeState, runtime: CanvasNodeRuntime): void {
    if (node.type !== 'url') {
      runtime.urlPreviewEl.style.display = 'none';
      runtime.urlPreviewEl.replaceChildren();
      runtime.urlPreviewEl.dataset.previewSignature = '';
      return;
    }

    runtime.urlPreviewEl.style.display = 'flex';

    if (node.url === undefined || !isSupportedExternalUrl(node.url)) {
      const signature = `invalid:${node.url ?? ''}`;

      if (runtime.urlPreviewEl.dataset.previewSignature !== signature) {
        runtime.urlPreviewEl.dataset.previewSignature = signature;
        runtime.urlPreviewEl.replaceChildren(
          this.createUrlPreviewText('URL 预览不可用：链接格式无效。', '0.9', '700'),
        );
      }
      return;
    }

    const directFrameSignature = `direct-frame:${node.url}`;

    if (runtime.urlPreviewEl.dataset.previewSignature !== directFrameSignature) {
      runtime.urlPreviewEl.dataset.previewSignature = directFrameSignature;
      runtime.urlPreviewEl.replaceChildren(this.createUrlPreviewFrame(node.url, node.title));
    }
  }

  private async openNodeFileTarget(node: CanvasNodeState): Promise<void> {
    if (node.targetPath === undefined) {
      new Notice(`${DEMO_TITLE}: 当前节点没有目标文件。`, 2200);
      return;
    }

    const file = this.app.vault.getFileByPath(node.targetPath);

    if (file === null) {
      new Notice(`${DEMO_TITLE}: 目标文件不存在：${node.targetPath}`, 2600);
      return;
    }

    const leaf = this.app.workspace.getLeaf('tab');

    if (isCanvasFileExtension(file.extension)) {
      await this.openCanvasFileInLeaf(leaf, file, `白板节点：${node.title}`);
      return;
    }

    await leaf.openFile(file, {
      active: true,
      state: {
        source: `白板节点：${node.title}`,
      },
    });
    await this.app.workspace.revealLeaf(leaf);
  }

  private async openNodeUrlTarget(node: CanvasNodeState): Promise<void> {
    if (node.url === undefined) {
      new Notice(`${DEMO_TITLE}: 当前 URL 节点没有目标链接。`, 2200);
      return;
    }

    if (!isSupportedExternalUrl(node.url)) {
      new Notice(`${DEMO_TITLE}: URL 节点链接无效：${node.url}`, 2600);
      return;
    }

    try {
      await this.app.shell.openExternal(node.url);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      new Notice(`${DEMO_TITLE}: 打开 URL 失败：${errorMessage}`, 2600);
    }
  }

  private async activateNode(nodeId: NodeId): Promise<void> {
    const now = Date.now();

    if (
      this.lastNodeActivationId === nodeId
      && now - this.lastNodeActivationAt <= NODE_ACTIVATION_DEBOUNCE_MS
    ) {
      return;
    }

    this.lastNodeActivationId = nodeId;
    this.lastNodeActivationAt = now;
    const node = this.nodes.find((item) => item.id === nodeId) ?? null;

    if (node === null) {
      return;
    }

    if (node.type === 'note' || node.type === 'file') {
      await this.openNodeFileTarget(node);
      return;
    }

    if (node.type === 'url') {
      this.openUrlNodeAddressEditor(node);
      return;
    }

    if (node.type === 'group') {
      const memberIds = this.nodes
        .filter((item) => item.groupId === node.id)
        .map((item) => item.id);

      this.setSelectedNodes([node.id, ...memberIds], node.id);
      this.syncScene({
        nodeIds: [node.id, ...memberIds],
        inspector: true,
        summary: true,
      });
      return;
    }

    this.enterInlineEdit(node.id);
  }

  public async createAndOpenNewSceneFile(): Promise<void> {
    if (this.autoSaveState === 'pending') {
      await this.flushAutoSave('新建白板文件前自动保存', '新建白板文件前已自动保存到');
    }

    const nextFilePath = await this.createUniqueSceneFilePath();
    const nextSnapshot = createInitialViewState('新建白板文件');
    const payload = serializeSceneForFile(nextSnapshot, nextFilePath, null);
    const file = await this.app.vault.create(nextFilePath, payload);
    const leaf = this.app.workspace.getLeaf('tab');

    await leaf.openFile(file, {
      active: true,
      state: {
        source: '新建白板文件',
      },
    });
    await this.app.workspace.revealLeaf(leaf);
  }

  private createCurrentSnapshot(source: string): CanvasViewStateSnapshot {
    return {
      source,
      scale: this.scale,
      offsetX: this.offsetX,
      offsetY: this.offsetY,
      selectedNodeId: this.selectedNodeId,
      nextNodeSerial: this.nextNodeSerial,
      nodes: this.nodes,
      lines: this.lines,
    };
  }

  private async refreshSceneFileStatus(): Promise<void> {
    const file = this.app.vault.getFileByPath(this.canvasFilePath);
    this.canvasFile = file;
    this.sceneFileExists = file !== null;

    if (file === null) {
      this.canvasMetadata = null;
      this.clearCanvasRecoveryState();
      this.sceneFileMessage = '独立场景文件尚未创建。';
      this.autoSaveState = 'idle';
      this.autoSaveErrorMessage = null;
      this.syncScene({
        file: true,
        refreshFileLists: true,
        recovery: true,
      });
      return;
    }

    try {
      const raw = await this.app.vault.read(file);
      const parsed = parseCanvasDocument(raw, file.path, this.source);
      this.canvasMetadata = parsed.metadata;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      const rawContent = await this.readCanvasRawContent(file.path);
      this.canvasMetadata = null;
      this.enterInvalidCanvasRecovery(errorMessage, rawContent);
      this.syncScene({
        file: true,
        refreshFileLists: true,
        recovery: true,
      });
      return;
    }

    this.sceneFileMessage = `独立文件已存在：${file.path}`;
    this.clearCanvasRecoveryState();
    this.autoSaveState = 'saved';
    this.autoSaveErrorMessage = null;
    this.syncScene({
      file: true,
      refreshFileLists: true,
      recovery: true,
    });
  }

  private async ensureSceneFolder(): Promise<void> {
    await ensureFolderPath(this, SCENE_FOLDER_PATH);
  }

  private async createUniqueSceneFilePath(): Promise<string> {
    await this.ensureSceneFolder();
    const now = new Date();
    const stamp = `${now.getFullYear()}${padDatePart(now.getMonth() + 1)}${padDatePart(now.getDate())}-${padDatePart(now.getHours())}${padDatePart(now.getMinutes())}${padDatePart(now.getSeconds())}`;
    let suffixIndex = 0;

    while (true) {
      const suffix = suffixIndex === 0 ? '' : `-${suffixIndex + 1}`;
      const nextPath = `${SCENE_FOLDER_PATH}/whiteboard-${stamp}${suffix}.canvas`;

      if (this.app.vault.getFileByPath(nextPath) === null) {
        return nextPath;
      }

      suffixIndex += 1;
    }
  }

  private listCanvasFiles(): readonly TFile[] {
    const sceneFolder = this.app.vault.getFolderByPath(SCENE_FOLDER_PATH);
    const collectedFiles: TFile[] = [];

    const visitFolder = (folder: import('@note-studio/plugin').TFolder): void => {
      for (const child of folder.children) {
        if (child instanceof TFile) {
          if (isCanvasFileExtension(child.extension)) {
            collectedFiles.push(child);
          }
          continue;
        }

        visitFolder(child as import('@note-studio/plugin').TFolder);
      }
    };

    if (sceneFolder !== null) {
      visitFolder(sceneFolder);
      return collectedFiles.sort((left, right) => right.stat.mtime - left.stat.mtime);
    }

    const normalizedSceneFolderMarker = `/${SCENE_FOLDER_PATH}/`;

    return this.app.vault
      .getFiles()
      .filter((file) => {
        if (!isCanvasFileExtension(file.extension)) {
          return false;
        }

        const normalizedPath = file.path.replace(/\\/g, '/');
        return normalizedPath.startsWith(`${SCENE_FOLDER_PATH}/`)
          || normalizedPath.includes(normalizedSceneFolderMarker);
      })
      .sort((left, right) => right.stat.mtime - left.stat.mtime);
  }

  private listRecentCanvasFiles(): readonly TFile[] {
    const recentPaths = [
      this.canvasFilePath,
      ...this.app.workspace.getLastOpenFiles(),
    ];
    const filesByPath = new Map(this.listCanvasFiles().map((file) => [file.path, file] as const));
    const recentFiles: TFile[] = [];
    const seen = new Set<string>();

    for (const pathValue of recentPaths) {
      if (seen.has(pathValue)) {
        continue;
      }

      seen.add(pathValue);
      const file = filesByPath.get(pathValue) ?? null;

      if (file === null) {
        continue;
      }

      recentFiles.push(file);
    }

    return recentFiles.slice(0, 6);
  }

  private async ensureSceneFileExists(): Promise<TFile> {
    const existingFile = this.app.vault.getFileByPath(this.canvasFilePath);

    if (existingFile !== null) {
      this.canvasFile = existingFile;
      return existingFile;
    }

    return this.writeSceneFile('首次创建独立文件');
  }

  private async writeSceneFile(source: string): Promise<TFile> {
    if (this.isCanvasReadOnly()) {
      throw new Error('当前白板处于只读恢复模式，已阻止覆盖原始文件。');
    }

    await this.ensureSceneFolder();

    const timestamp = new Date().toISOString();
    const nextMetadata = createCanvasMetadata(
      this.canvasFilePath,
      source,
      this.canvasMetadata?.createdAt ?? timestamp,
      timestamp,
      this.canvasMetadata?.migratedFromVersion ?? null,
    );
    const payload = serializeSceneForFile(this.createCurrentSnapshot(source), this.canvasFilePath, nextMetadata);
    const existingFile = this.app.vault.getFileByPath(this.canvasFilePath);

    if (existingFile !== null) {
      await this.app.vault.modify(existingFile, payload);
      this.canvasFile = existingFile;
      this.canvasMetadata = nextMetadata;
      return existingFile;
    }

    const createdFile = await this.app.vault.create(this.canvasFilePath, payload);
    this.canvasFile = createdFile;
    this.canvasMetadata = nextMetadata;
    return createdFile;
  }

  private cancelAutoSaveHandle(): void {
    if (this.autoSaveHandle === null) {
      return;
    }

    clearTimeout(this.autoSaveHandle);
    this.autoSaveHandle = null;
  }

  private scheduleAutoSave(): void {
    if (this.isCanvasReadOnly()) {
      this.cancelAutoSaveHandle();
      this.autoSaveState = 'error';
      this.autoSaveErrorMessage = this.recoveryErrorMessage ?? '当前白板处于只读恢复模式。';
      this.syncFilePanel();
      this.syncRecoveryPanel();
      return;
    }

    if (this.canvasFilePath.trim().length === 0) {
      return;
    }

    this.cancelAutoSaveHandle();
    this.autoSaveState = 'pending';
    this.autoSaveErrorMessage = null;
    this.autoSaveHandle = setTimeout(() => {
      void this.flushAutoSave('自动保存', '已自动保存到');
    }, AUTO_SAVE_DELAY_MS);
    this.syncFilePanel();
  }

  private async flushAutoSave(source: string, successPrefix: string): Promise<void> {
    this.cancelAutoSaveHandle();

    if (this.isCanvasReadOnly()) {
      this.autoSaveState = 'error';
      this.autoSaveErrorMessage = this.recoveryErrorMessage ?? '当前白板处于只读恢复模式。';
      this.syncScene({
        file: true,
        recovery: true,
      });
      return;
    }

    if (this.autoSaveState === 'saving') {
      return;
    }

    this.autoSaveState = 'saving';
    this.autoSaveErrorMessage = null;
    this.syncFilePanel();

    try {
      const file = await this.writeSceneFile(source);
      this.sceneFileExists = true;
      this.lastSavedAt = formatTimestamp(new Date());
      this.sceneFileMessage = `${successPrefix} ${file.path}`;
      this.clearCanvasRecoveryState();
      this.autoSaveState = 'saved';
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      this.enterReadOnlyCanvasRecovery(errorMessage);
      new Notice(`${DEMO_TITLE}：自动保存失败，已切换为只读保护。`, 3200);
    }

    this.syncScene({
      file: true,
      refreshFileLists: true,
      recovery: true,
    });
  }

  private markSceneChanged(options?: SceneRenderOptions): void {
    this.syncScene(options);
    this.scheduleAutoSave();
  }

  private ensureViewDom(): void {
    if (this.rootEl !== null) {
      if (this.contentEl.firstChild !== this.rootEl || this.contentEl.childNodes.length !== 1) {
        this.contentEl.replaceChildren(this.rootEl);
      }

      return;
    }

    this.rootEl = document.createElement('div');
    this.rootEl.style.position = 'relative';
    this.rootEl.style.display = 'flex';
    this.rootEl.style.width = '100%';
    this.rootEl.style.height = '100%';
    this.rootEl.style.minWidth = '0';
    this.rootEl.style.minHeight = '0';
    this.rootEl.style.overflow = 'hidden';

    const floatingPanelEl = document.createElement('div');
    floatingPanelEl.style.position = 'absolute';
    floatingPanelEl.style.top = `${FLOATING_PANEL_INSET}px`;
    floatingPanelEl.style.right = `${FLOATING_PANEL_INSET}px`;
    floatingPanelEl.style.bottom = `${FLOATING_PANEL_INSET}px`;
    floatingPanelEl.style.width = `${FLOATING_PANEL_WIDTH}px`;
    floatingPanelEl.style.maxWidth = `calc(100% - ${FLOATING_PANEL_INSET * 2}px)`;
    floatingPanelEl.style.display = 'flex';
    floatingPanelEl.style.flexDirection = 'column';
    floatingPanelEl.style.gap = '12px';
    floatingPanelEl.style.pointerEvents = 'none';
    floatingPanelEl.style.zIndex = '12';

    const statusPanelEl = document.createElement('div');
    statusPanelEl.style.display = 'flex';
    statusPanelEl.style.flexDirection = 'column';
    statusPanelEl.style.gap = '6px';
    statusPanelEl.style.padding = '12px 14px';
    statusPanelEl.style.borderRadius = '16px';
    statusPanelEl.style.border = '1px solid rgba(255,255,255,0.12)';
    statusPanelEl.style.background = 'rgba(15,23,42,0.78)';
    statusPanelEl.style.backdropFilter = 'blur(14px)';
    (statusPanelEl.style as CSSStyleDeclaration & { webkitBackdropFilter?: string }).webkitBackdropFilter = 'blur(14px)';
    statusPanelEl.style.pointerEvents = 'auto';

    this.sourceEl = document.createElement('div');
    this.sourceEl.style.fontSize = '12px';
    this.sourceEl.style.lineHeight = '1.5';
    this.sourceEl.style.opacity = '0.72';

    this.recoveryPanelEl = document.createElement('div');
    this.recoveryPanelEl.style.display = 'none';
    this.recoveryPanelEl.style.flexDirection = 'column';
    this.recoveryPanelEl.style.gap = '10px';
    this.recoveryPanelEl.style.padding = '14px';
    this.recoveryPanelEl.style.borderRadius = '14px';
    this.recoveryPanelEl.style.border = '1px solid var(--ws-inputValidation-errorBorder, rgba(248,113,113,0.72))';
    this.recoveryPanelEl.style.background = 'var(--ws-inputValidation-errorBackground, rgba(127,29,29,0.22))';
    this.recoveryPanelEl.style.pointerEvents = 'auto';

    this.recoveryTitleEl = document.createElement('div');
    this.recoveryTitleEl.style.fontWeight = '700';
    this.recoveryPanelEl.append(this.recoveryTitleEl);

    this.recoveryMessageEl = document.createElement('div');
    this.recoveryMessageEl.style.lineHeight = '1.6';
    this.recoveryMessageEl.style.opacity = '0.86';
    this.recoveryPanelEl.append(this.recoveryMessageEl);

    const recoveryActionEl = document.createElement('div');
    recoveryActionEl.style.display = 'flex';
    recoveryActionEl.style.flexWrap = 'wrap';
    recoveryActionEl.style.gap = '8px';
    recoveryActionEl.append(
      this.createToolChip('重新加载白板文件', () => {
        void this.loadSceneFile();
      }),
    );
    this.recoveryToggleRawEl = this.createToolChip('查看原始文本', () => {
      this.recoveryTextVisible = !this.recoveryTextVisible;
      this.syncRecoveryPanel();
    });
    recoveryActionEl.append(this.recoveryToggleRawEl);
    this.recoveryPanelEl.append(recoveryActionEl);

    this.recoveryRawTextEl = document.createElement('pre');
    this.recoveryRawTextEl.style.display = 'none';
    this.recoveryRawTextEl.style.maxHeight = '220px';
    this.recoveryRawTextEl.style.overflow = 'auto';
    this.recoveryRawTextEl.style.margin = '0';
    this.recoveryRawTextEl.style.padding = '12px';
    this.recoveryRawTextEl.style.borderRadius = '10px';
    this.recoveryRawTextEl.style.border = '1px solid var(--ws-panel-border, rgba(255,255,255,0.12))';
    this.recoveryRawTextEl.style.background = 'var(--ws-editor-background, rgba(15,23,42,0.64))';
    this.recoveryRawTextEl.style.whiteSpace = 'pre-wrap';
    this.recoveryRawTextEl.style.userSelect = 'text';
    this.recoveryPanelEl.append(this.recoveryRawTextEl);

    const toolbarEl = document.createElement('div');
    toolbarEl.style.display = 'flex';
    toolbarEl.style.flex = '1';
    toolbarEl.style.flexDirection = 'column';
    toolbarEl.style.alignItems = 'stretch';
    toolbarEl.style.gap = '8px';
    toolbarEl.style.minHeight = '0';
    toolbarEl.style.padding = '12px';
    toolbarEl.style.overflow = 'auto';
    toolbarEl.style.borderRadius = '16px';
    toolbarEl.style.border = '1px solid rgba(255,255,255,0.12)';
    toolbarEl.style.background = 'rgba(15,23,42,0.78)';
    toolbarEl.style.backdropFilter = 'blur(14px)';
    (toolbarEl.style as CSSStyleDeclaration & { webkitBackdropFilter?: string }).webkitBackdropFilter = 'blur(14px)';
    toolbarEl.style.pointerEvents = 'auto';

    toolbarEl.append(
      this.createToolChip('新建白板文件', () => {
        void this.createAndOpenNewSceneFile();
      }),
      this.createToolChip('新增卡片', () => {
        this.addStandaloneNode();
      }),
      this.createToolChip('新增连接卡片', () => {
        this.addConnectedNode();
      }),
      this.createToolChip('新增笔记节点', () => {
        this.addStandaloneNode(undefined, 'note');
      }),
      this.createToolChip('新增文件节点', () => {
        this.addStandaloneNode(undefined, 'file');
      }),
      this.createToolChip('新增 URL 节点', () => {
        this.addStandaloneNode(undefined, 'url');
      }),
      this.createToolChip('新增分组节点', () => {
        this.addStandaloneNode(undefined, 'group');
      }),
      this.createToolChip('删除选中卡片', () => {
        this.removeSelectedNode();
      }),
      this.createToolChip('删除选中连线', () => {
        this.removeSelectedNodeLines();
      }),
      this.createToolChip('保存到文件', () => {
        void this.saveSceneFile();
      }),
      this.createToolChip('从文件加载', () => {
        void this.loadSceneFile();
      }),
      this.createToolChip('打开白板文件', () => {
        void this.openSceneFile();
      }),
      this.createToolChip('放大', () => {
        this.scale = clamp(Number((this.scale + 0.1).toFixed(2)), MIN_SCALE, MAX_SCALE);
        this.markSceneChanged({
          viewport: true,
          selectionBox: true,
          scale: true,
          summary: true,
        });
      }),
      this.createToolChip('缩小', () => {
        this.scale = clamp(Number((this.scale - 0.1).toFixed(2)), MIN_SCALE, MAX_SCALE);
        this.markSceneChanged({
          viewport: true,
          selectionBox: true,
          scale: true,
          summary: true,
        });
      }),
      this.createToolChip('左移', () => {
        this.offsetX -= 40;
        this.markSceneChanged({
          viewport: true,
          selectionBox: true,
          summary: true,
        });
      }),
      this.createToolChip('右移', () => {
        this.offsetX += 40;
        this.markSceneChanged({
          viewport: true,
          selectionBox: true,
          summary: true,
        });
      }),
      this.createToolChip('上移', () => {
        this.offsetY -= 40;
        this.markSceneChanged({
          viewport: true,
          selectionBox: true,
          summary: true,
        });
      }),
      this.createToolChip('下移', () => {
        this.offsetY += 40;
        this.markSceneChanged({
          viewport: true,
          selectionBox: true,
          summary: true,
        });
      }),
      this.createToolChip('重置', () => {
        this.resetScene();
      }),
    );

    this.boxSelectionChipEl = this.createToolChip('框选：开', () => {
      this.boxSelectionEnabled = !this.boxSelectionEnabled;

      if (!this.boxSelectionEnabled && this.dragMode === 'select') {
        this.finishPointerInteraction();
      } else {
        this.syncViewportCursor();
      }

      this.syncScene({
        boxSelectionChip: true,
        selectionBox: true,
      });
    });
    toolbarEl.append(this.boxSelectionChipEl);

    this.scaleEl = document.createElement('div');
    this.scaleEl.style.fontSize = '12px';
    this.scaleEl.style.lineHeight = '1.5';
    this.scaleEl.style.opacity = '0.78';
    statusPanelEl.append(this.sourceEl, this.scaleEl);

    this.viewportEl = document.createElement('div');
    this.viewportEl.style.position = 'relative';
    this.viewportEl.style.flex = '1';
    this.viewportEl.style.minHeight = '0';
    this.viewportEl.style.overflow = 'hidden';
    this.viewportEl.style.border = 'none';
    this.viewportEl.style.borderRadius = '0';
    this.viewportEl.style.backgroundColor = 'rgba(15,23,42,0.82)';
    this.viewportEl.style.backgroundImage = [
      'linear-gradient(rgba(148,163,184,0.1) 1px, transparent 1px)',
      'linear-gradient(90deg, rgba(148,163,184,0.1) 1px, transparent 1px)',
      'linear-gradient(rgba(148,163,184,0.04) 1px, transparent 1px)',
      'linear-gradient(90deg, rgba(148,163,184,0.04) 1px, transparent 1px)',
    ].join(', ');
    this.viewportEl.style.backgroundSize = '120px 120px, 120px 120px, 24px 24px, 24px 24px';
    this.viewportEl.style.backgroundPosition = '-1px -1px, -1px -1px, -1px -1px, -1px -1px';
    this.viewportEl.style.userSelect = 'none';
    this.viewportEl.setAttribute('tabindex', '0');
    this.syncViewportCursor();
    this.registerDomEvent(this.viewportEl, 'mousedown', (event: MouseEvent) => {
      if (event.button !== 0) {
        return;
      }

      if (event.target !== this.viewportEl && event.target !== this.sceneEl) {
        return;
      }

      event.preventDefault();
      this.focusElementWithoutScroll(this.viewportEl);
      const viewportLocal = this.resolveViewportLocalPoint(event, false);

      if (viewportLocal === null) {
        return;
      }

      const shouldStartPan = this.spacePanPressed;
      const shouldStartSelection = !shouldStartPan && this.boxSelectionEnabled;

      if (!shouldStartPan && !shouldStartSelection) {
        return;
      }

      this.interactionOriginClientX = event.clientX - viewportLocal.x;
      this.interactionOriginClientY = event.clientY - viewportLocal.y;
      this.activeNodeId = null;

      const previousSelection = this.captureSelectionSnapshot();

      if (shouldStartSelection) {
        const scenePoint = this.resolveScenePointFromViewportLocal(viewportLocal);
        this.dragMode = 'select';
        this.selectionStartSceneX = scenePoint.x;
        this.selectionStartSceneY = scenePoint.y;
        this.selectionCurrentSceneX = scenePoint.x;
        this.selectionCurrentSceneY = scenePoint.y;
        this.setSelectedNodes([], null);
      } else {
        this.dragMode = 'pan';
        this.dragStartX = event.clientX;
        this.dragStartY = event.clientY;
        this.dragOriginOffsetX = this.offsetX;
        this.dragOriginOffsetY = this.offsetY;
      }
      this.pointerCaptureOwnerEl = this.viewportEl;
      this.viewportEl?.setPointerCapture(HOST_MOUSE_POINTER_ID);

      this.syncViewportCursor();

      const selectionChanged = shouldStartSelection && this.hasSelectionStateChanged(previousSelection);
      const selectionNodeIds = shouldStartSelection
        ? this.collectSelectionAffectedNodeIds(previousSelection)
        : [];

      if (selectionChanged) {
        this.markSceneChanged({
          nodeIds: selectionNodeIds,
          selectionBox: true,
          summary: true,
          inspector: true,
        });
        return;
      }

      this.syncScene({
        nodeIds: selectionNodeIds,
        selectionBox: true,
      });
    });
    this.registerDomEvent(this.viewportEl, 'mousemove', (event: MouseEvent) => {
      if (this.dragMode !== 'pan') {
        return;
      }

      this.handlePointerMove(event);
    });
    this.registerDomEvent(this.viewportEl, 'mouseup', () => {
      if (this.dragMode !== 'pan' && this.dragMode !== 'select') {
        return;
      }

      this.finishPointerInteraction();
    });
    this.registerDomEvent(this.viewportEl, 'wheel', (event: WheelEvent) => {
      event.preventDefault();
      const viewportLocal = this.resolveViewportLocalPoint(event, false);

      if (viewportLocal === null) {
        return;
      }

      const scenePoint = this.resolveScenePointFromViewportLocal(viewportLocal);
      const deltaY = readAugmentedEventNumber(event, 'deltaY') ?? 0;
      const nextScale = clamp(
        Number((this.scale + (deltaY < 0 ? 0.08 : -0.08)).toFixed(2)),
        MIN_SCALE,
        MAX_SCALE,
      );

      if (nextScale === this.scale) {
        return;
      }

      this.scale = nextScale;
      this.offsetX = viewportLocal.x - (scenePoint.x * this.scale);
      this.offsetY = viewportLocal.y - (scenePoint.y * this.scale);
      this.markSceneChanged({
        viewport: true,
        selectionBox: true,
        scale: true,
        summary: true,
      });
    });
    this.registerDomEvent(this.viewportEl, 'contextmenu', (event: MouseEvent) => {
      if (event.target !== this.viewportEl && event.target !== this.sceneEl) {
        return;
      }

      this.openViewportContextMenu(event);
    });
    this.bindCanvasKeyboardTarget(this.viewportEl);
    this.registerDomEvent(this.viewportEl, 'dragover', (event: DragEvent) => {
      this.handleWorkspaceFileDragOver(event);
    });
    this.registerDomEvent(this.viewportEl, 'drop', (event: DragEvent) => {
      this.handleWorkspaceFileDrop(event);
    });

    this.sceneEl = document.createElement('div');
    this.sceneEl.style.position = 'absolute';
    this.sceneEl.style.left = '0';
    this.sceneEl.style.top = '0';
    this.sceneEl.style.width = '1800px';
    this.sceneEl.style.height = '1100px';
    this.sceneEl.style.transformOrigin = 'top left';

    this.selectionBoxEl = document.createElement('div');
    this.selectionBoxEl.style.position = 'absolute';
    this.selectionBoxEl.style.display = 'none';
    this.selectionBoxEl.style.left = '0';
    this.selectionBoxEl.style.top = '0';
    this.selectionBoxEl.style.width = '0';
    this.selectionBoxEl.style.height = '0';
    this.selectionBoxEl.style.border = '1px dashed rgba(125, 211, 252, 0.92)';
    this.selectionBoxEl.style.background = 'rgba(14, 165, 233, 0.12)';
    this.selectionBoxEl.style.pointerEvents = 'none';
    this.selectionBoxEl.style.zIndex = '4';
    this.registerDomEvent(this.selectionBoxEl, 'mousedown', (event: MouseEvent) => {
      if (event.button !== 0 || !this.canDragPersistentSelectionBox()) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      const selectionBoxEl = this.selectionBoxEl;

      if (selectionBoxEl === null) {
        return;
      }

      this.focusElementWithoutScroll(this.viewportEl);
      const zOrderChanged = this.bringNodeIdsToFront(this.selectedNodeIds);
      this.dragMode = 'selection-box';
      this.dragStartX = event.clientX;
      this.dragStartY = event.clientY;
      this.dragOriginNodePositions = this.captureDragOriginPositionsForNodeIds(this.selectedNodeIds);
      this.pointerCaptureOwnerEl = selectionBoxEl;
      selectionBoxEl.setPointerCapture(HOST_MOUSE_POINTER_ID);
      this.syncViewportCursor();
      this.syncScene({
        syncStructure: zOrderChanged,
        nodeIds: [...this.dragOriginNodePositions.keys()],
        selectionBox: true,
      });
    });

    const helperCardEl = document.createElement('div');
    helperCardEl.textContent = '按住空格并拖动画布空白区域可以平移；单击节点会选中卡片，双击普通节点进入编辑，双击 URL 节点会弹窗修改地址；点击空白处会退出编辑状态。';
    helperCardEl.style.position = 'absolute';
    helperCardEl.style.left = '48px';
    helperCardEl.style.top = '40px';
    helperCardEl.style.padding = '12px 14px';
    helperCardEl.style.borderRadius = '12px';
    helperCardEl.style.background = 'rgba(15, 23, 42, 0.72)';
    helperCardEl.style.border = '1px solid rgba(255,255,255,0.1)';
    helperCardEl.style.maxWidth = '420px';
    helperCardEl.style.lineHeight = '1.6';

    this.sceneEl.append(helperCardEl);
    this.viewportEl.append(this.sceneEl, this.selectionBoxEl);

    const controlPanelEl = document.createElement('div');
    controlPanelEl.style.display = 'grid';
    controlPanelEl.style.gridTemplateColumns = 'minmax(280px, 420px) minmax(260px, 1fr)';
    controlPanelEl.style.gap = '16px';

    const editorPanelEl = document.createElement('div');
    editorPanelEl.style.display = 'flex';
    editorPanelEl.style.flexDirection = 'column';
    editorPanelEl.style.gap = '12px';
    editorPanelEl.style.padding = '14px';
    editorPanelEl.style.borderRadius = '14px';
    editorPanelEl.style.background = 'rgba(255,255,255,0.04)';
    editorPanelEl.style.border = '1px solid rgba(255,255,255,0.08)';

    this.selectedMetaEl = document.createElement('div');
    this.selectedMetaEl.style.opacity = '0.78';
    this.selectedMetaEl.style.lineHeight = '1.6';
    editorPanelEl.append(this.selectedMetaEl);

    const titleLabelEl = document.createElement('label');
    titleLabelEl.textContent = '节点标题';
    titleLabelEl.style.display = 'flex';
    titleLabelEl.style.flexDirection = 'column';
    titleLabelEl.style.gap = '6px';
    titleLabelEl.style.fontSize = '13px';
    titleLabelEl.style.opacity = '0.86';

    this.titleInputEl = document.createElement('input');
    this.titleInputEl.type = 'text';
    this.titleInputEl.setAttribute('spellcheck', 'false');
    this.titleInputEl.setAttribute('autocorrect', 'off');
    this.titleInputEl.setAttribute('autocapitalize', 'off');
    this.titleInputEl.placeholder = '请先选中一个节点';
    this.titleInputEl.style.minHeight = '36px';
    this.titleInputEl.style.padding = '0 12px';
    this.titleInputEl.style.borderRadius = '10px';
    this.titleInputEl.style.border = '1px solid rgba(255,255,255,0.12)';
    this.titleInputEl.style.background = 'rgba(255,255,255,0.04)';
    this.titleInputEl.style.color = 'inherit';
    this.registerDomEvent(this.titleInputEl, 'input', () => {
      this.updateSelectedNodeTitle(this.titleInputEl?.value ?? '');
    });
    titleLabelEl.append(this.titleInputEl);
    editorPanelEl.append(titleLabelEl);

    const urlLabelEl = document.createElement('label');
    urlLabelEl.textContent = 'URL 链接地址';
    urlLabelEl.style.display = 'none';
    urlLabelEl.style.flexDirection = 'column';
    urlLabelEl.style.gap = '6px';
    urlLabelEl.style.fontSize = '13px';
    urlLabelEl.style.opacity = '0.86';

    this.urlInputEl = document.createElement('input');
    this.urlInputEl.type = 'url';
    this.urlInputEl.placeholder = '输入 URL 地址';
    this.urlInputEl.style.minHeight = '36px';
    this.urlInputEl.style.padding = '0 12px';
    this.urlInputEl.style.borderRadius = '10px';
    this.urlInputEl.style.border = '1px solid rgba(255,255,255,0.12)';
    this.urlInputEl.style.background = 'rgba(255,255,255,0.04)';
    this.urlInputEl.style.color = 'inherit';
    this.registerDomEvent(this.urlInputEl, 'input', () => {
      this.updateSelectedNodeUrl(this.urlInputEl?.value ?? '');
    });
    urlLabelEl.append(this.urlInputEl);
    this.urlLabelEl = urlLabelEl;
    editorPanelEl.append(urlLabelEl);

    const bodyLabelEl = document.createElement('label');
    bodyLabelEl.textContent = '节点正文';
    bodyLabelEl.style.display = 'flex';
    bodyLabelEl.style.flexDirection = 'column';
    bodyLabelEl.style.gap = '6px';
    bodyLabelEl.style.fontSize = '13px';
    bodyLabelEl.style.opacity = '0.86';

    this.bodyInputEl = document.createElement('textarea');
    this.bodyInputEl.placeholder = '请先选中一个节点';
    this.bodyInputEl.style.minHeight = '120px';
    this.bodyInputEl.style.padding = '12px';
    this.bodyInputEl.style.borderRadius = '10px';
    this.bodyInputEl.style.border = '1px solid rgba(255,255,255,0.12)';
    this.bodyInputEl.style.background = 'rgba(255,255,255,0.04)';
    this.bodyInputEl.style.color = 'inherit';
    this.bodyInputEl.style.resize = 'vertical';
    this.registerDomEvent(this.bodyInputEl, 'input', () => {
      this.updateSelectedNodeBody(this.bodyInputEl?.value ?? '');
    });
    bodyLabelEl.append(this.bodyInputEl);
    this.bodyLabelEl = bodyLabelEl;
    editorPanelEl.append(bodyLabelEl);

    const filePanelEl = document.createElement('div');
    filePanelEl.style.display = 'flex';
    filePanelEl.style.flexDirection = 'column';
    filePanelEl.style.gap = '12px';
    filePanelEl.style.padding = '14px';
    filePanelEl.style.borderRadius = '14px';
    filePanelEl.style.background = 'rgba(255,255,255,0.04)';
    filePanelEl.style.border = '1px solid rgba(255,255,255,0.08)';

    this.fileMetaEl = document.createElement('div');
    this.fileMetaEl.style.opacity = '0.8';
    this.fileMetaEl.style.lineHeight = '1.7';
    filePanelEl.append(this.fileMetaEl);

    const recentFilesTitleEl = document.createElement('div');
    recentFilesTitleEl.textContent = '最近打开白板';
    recentFilesTitleEl.style.fontWeight = '600';
    recentFilesTitleEl.style.marginTop = '12px';
    filePanelEl.append(recentFilesTitleEl);

    this.recentFilesEl = document.createElement('div');
    this.recentFilesEl.style.display = 'flex';
    this.recentFilesEl.style.flexDirection = 'column';
    this.recentFilesEl.style.gap = '8px';
    filePanelEl.append(this.recentFilesEl);

    const allFilesTitleEl = document.createElement('div');
    allFilesTitleEl.textContent = '白板文件列表';
    allFilesTitleEl.style.fontWeight = '600';
    allFilesTitleEl.style.marginTop = '12px';
    filePanelEl.append(allFilesTitleEl);

    this.allFilesEl = document.createElement('div');
    this.allFilesEl.style.display = 'flex';
    this.allFilesEl.style.flexDirection = 'column';
    this.allFilesEl.style.gap = '8px';
    filePanelEl.append(this.allFilesEl);

    const fileActionHintEl = document.createElement('div');
    fileActionHintEl.textContent = '建议流程：先点“新建白板文件”建立主文件；之后对白板的拖拽、缩放、选中与内容编辑都会自动保存。也可以随时点“保存到文件 / 从文件加载 / 打开白板文件”做手动验证。';
    fileActionHintEl.style.opacity = '0.72';
    fileActionHintEl.style.lineHeight = '1.6';
    fileActionHintEl.style.marginTop = '12px';
    filePanelEl.append(fileActionHintEl);

    controlPanelEl.append(editorPanelEl, filePanelEl);

    this.summaryEl = document.createElement('div');
    this.summaryEl.style.opacity = '0.8';
    this.summaryEl.style.lineHeight = '1.7';
    statusPanelEl.append(this.summaryEl);

    // Keep the document-level drag fallback while the host-side pointer
    // capture bridge is being hardened for all plugin-rendered views.
    this.registerDomEvent(document, 'mousemove', (event: MouseEvent) => {
      this.handlePointerMove(event);
    });
    this.registerDomEvent(document, 'mouseup', () => {
      this.finishPointerInteraction();
    });
    this.registerDomEvent(document, 'keyup', (event: KeyboardEvent) => {
      this.handleCanvasKeyup(event);
    });

    floatingPanelEl.append(this.recoveryPanelEl, statusPanelEl, toolbarEl);
    this.rootEl.append(this.viewportEl, floatingPanelEl);
    this.contentEl.replaceChildren(this.rootEl);
  }

  private createNodeCard(node: CanvasNodeState): CanvasNodeRuntime {
    const isTextNode = node.type === 'text';
    const isExpandedTextNode = isTextNode && nodeHeight(node) > TEXT_NODE_HEIGHT;
    const shouldCenterCompactTextNode = isTextNode && !isExpandedTextNode;
    const resizeHitAreaMetrics = resolveResizeHitAreaMetrics(node);
    const isSelected = this.selectedNodeIds.includes(node.id);
    const isInlineEditing = this.inlineEditingNodeId === node.id;
    const isReadOnly = this.isCanvasReadOnly();
    const initialResizeCursor = this.dragMode === 'resize'
      && this.activeNodeId === node.id
      && this.resizeDirection !== null
      ? resolveResizeCursor(this.resizeDirection)
      : null;
    const nodeEl = document.createElement('div');
    nodeEl.style.position = 'absolute';
    nodeEl.style.left = `${node.x}px`;
    nodeEl.style.top = `${node.y}px`;
    nodeEl.style.width = `${nodeWidth(node)}px`;
    nodeEl.style.minHeight = `${nodeHeight(node)}px`;
    nodeEl.style.height = !isTextNode || isExpandedTextNode ? `${nodeHeight(node)}px` : '';
    nodeEl.style.padding = '0';
    nodeEl.style.borderRadius = isTextNode ? '10px' : '12px';
    nodeEl.style.background = isTextNode
      ? 'var(--ws-input-background, rgba(15,23,42,0.52))'
      : node.accent;
    nodeEl.style.border = `${NODE_BORDER_WIDTH} solid ${isSelected
      ? 'transparent'
      : isTextNode
        ? 'var(--ws-input-border, rgba(255,255,255,0.16))'
        : 'rgba(255,255,255,0.16)'
    }`;
    nodeEl.style.outline = isSelected ? `${SELECTED_NODE_OUTLINE_WIDTH} solid ${SELECTED_NODE_BORDER_COLOR}` : 'none';
    nodeEl.style.outlineOffset = isSelected ? '0' : '0';
    nodeEl.style.boxShadow = isTextNode ? 'none' : `0 20px 40px ${node.shadow}`;
    nodeEl.style.cursor = initialResizeCursor ?? this.resolveNodeCursor(isSelected, isInlineEditing, isReadOnly);
    nodeEl.style.userSelect = 'none';
    nodeEl.style.boxSizing = 'border-box';
    nodeEl.style.overflow = 'visible';
    nodeEl.style.display = shouldCenterCompactTextNode ? 'flex' : 'block';
    nodeEl.style.flexDirection = shouldCenterCompactTextNode ? 'column' : '';
    nodeEl.style.justifyContent = shouldCenterCompactTextNode ? 'center' : '';
    nodeEl.style.zIndex = resolveNodeZIndex(node, isSelected, false);
    nodeEl.setAttribute('tabindex', '0');
    nodeEl.dataset.pluginCanvasNodeRoot = 'true';

    const resizeFrameEl = document.createElement('div');
    resizeFrameEl.dataset.role = 'resize-frame';
    resizeFrameEl.dataset.inlineEditorInteractive = 'true';
    resizeFrameEl.style.position = 'absolute';
    resizeFrameEl.style.left = `-${resizeHitAreaMetrics.frameOutset}px`;
    resizeFrameEl.style.top = `-${resizeHitAreaMetrics.frameOutset}px`;
    resizeFrameEl.style.right = `-${resizeHitAreaMetrics.frameOutset}px`;
    resizeFrameEl.style.bottom = `-${resizeHitAreaMetrics.frameOutset}px`;
    resizeFrameEl.style.background = 'transparent';
    resizeFrameEl.style.pointerEvents = 'none';
    resizeFrameEl.style.zIndex = '6';

    const contentShellEl = document.createElement('div');
    contentShellEl.dataset.role = 'content-shell';
    contentShellEl.style.width = '100%';
    contentShellEl.style.height = !isTextNode || isExpandedTextNode ? '100%' : 'auto';
    contentShellEl.style.padding = isTextNode ? '0' : '18px';
    contentShellEl.style.boxSizing = 'border-box';
    contentShellEl.style.display = 'flex';
    contentShellEl.style.flexDirection = 'column';
    contentShellEl.style.justifyContent = 'flex-start';
    contentShellEl.style.overflow = 'hidden';
    contentShellEl.style.borderRadius = 'inherit';

    const nodeTypeEl = document.createElement('div');
    nodeTypeEl.dataset.role = 'type-display';
    nodeTypeEl.textContent = getNodeTypeLabel(node.type);
    nodeTypeEl.style.display = 'inline-flex';
    nodeTypeEl.style.width = 'fit-content';
    nodeTypeEl.style.minHeight = '24px';
    nodeTypeEl.style.alignItems = 'center';
    nodeTypeEl.style.marginBottom = '10px';
    nodeTypeEl.style.padding = '0 8px';
    nodeTypeEl.style.borderRadius = '999px';
    nodeTypeEl.style.border = '1px solid rgba(255,255,255,0.18)';
    nodeTypeEl.style.background = 'rgba(15,23,42,0.26)';
    nodeTypeEl.style.fontSize = '12px';
    nodeTypeEl.style.fontWeight = '700';
    nodeTypeEl.style.pointerEvents = 'none';

    const nodeTitleEl = document.createElement('div');
    nodeTitleEl.dataset.role = 'title-display';
    nodeTitleEl.textContent = node.title;
    nodeTitleEl.style.display = isTextNode ? 'none' : 'block';
    nodeTitleEl.style.fontSize = '20px';
    nodeTitleEl.style.fontWeight = '700';
    nodeTitleEl.style.marginBottom = '8px';
    nodeTitleEl.style.pointerEvents = 'none';

    const nodeMetaEl = document.createElement('div');
    nodeMetaEl.dataset.role = 'meta-display';
    nodeMetaEl.textContent = this.resolveNodeReferenceText(node) ?? '';
    nodeMetaEl.style.display = nodeMetaEl.textContent.length > 0 ? 'block' : 'none';
    nodeMetaEl.style.marginBottom = '8px';
    nodeMetaEl.style.fontSize = '12px';
    nodeMetaEl.style.lineHeight = '1.5';
    nodeMetaEl.style.opacity = '0.72';
    nodeMetaEl.style.whiteSpace = 'pre-wrap';
    nodeMetaEl.style.pointerEvents = 'none';

    const nodeBodyEl = document.createElement('div');
    nodeBodyEl.dataset.role = 'body-display';
    nodeBodyEl.textContent = node.body;
    nodeBodyEl.style.lineHeight = '1.6';
    nodeBodyEl.style.opacity = '0.84';
    nodeBodyEl.style.whiteSpace = 'pre-wrap';
    nodeBodyEl.style.pointerEvents = 'none';

    const urlPreviewEl = document.createElement('div');
    urlPreviewEl.dataset.role = 'url-preview';
    urlPreviewEl.style.display = 'none';
    urlPreviewEl.style.flexDirection = 'column';
    urlPreviewEl.style.gap = '8px';
    urlPreviewEl.style.marginTop = '12px';
    urlPreviewEl.style.padding = '10px';
    urlPreviewEl.style.borderRadius = '12px';
    urlPreviewEl.style.border = '1px solid var(--ws-panel-border, rgba(255,255,255,0.14))';
    urlPreviewEl.style.background = 'var(--ws-editorWidget-background, rgba(15,23,42,0.32))';
    urlPreviewEl.style.flex = '1 1 auto';
    urlPreviewEl.style.minHeight = '0';
    urlPreviewEl.style.overflow = 'hidden';
    urlPreviewEl.style.boxSizing = 'border-box';

    const inlineEditTriggerEl = document.createElement('div');
    inlineEditTriggerEl.dataset.role = 'inline-edit-trigger';
    inlineEditTriggerEl.textContent = '卡片内编辑';
    inlineEditTriggerEl.setAttribute('role', 'button');
    inlineEditTriggerEl.tabIndex = 0;
    inlineEditTriggerEl.dataset.inlineEditorInteractive = 'true';
    inlineEditTriggerEl.style.display = 'none';
    inlineEditTriggerEl.style.alignItems = 'center';
    inlineEditTriggerEl.style.justifyContent = 'center';
    inlineEditTriggerEl.style.width = 'fit-content';
    inlineEditTriggerEl.style.minHeight = '28px';
    inlineEditTriggerEl.style.marginTop = '12px';
    inlineEditTriggerEl.style.padding = '0 10px';
    inlineEditTriggerEl.style.borderRadius = '999px';
    inlineEditTriggerEl.style.border = '1px solid rgba(255,255,255,0.18)';
    inlineEditTriggerEl.style.background = 'rgba(15,23,42,0.36)';
    inlineEditTriggerEl.style.cursor = 'pointer';
    inlineEditTriggerEl.style.fontSize = '12px';
    inlineEditTriggerEl.style.opacity = '0.9';
    this.registerDomEvent(inlineEditTriggerEl, 'click', () => {
      this.enterInlineEdit(node.id);
    });
    this.registerDomEvent(inlineEditTriggerEl, 'keydown', (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== ' ') {
        return;
      }

      event.preventDefault();
      this.enterInlineEdit(node.id);
    });

    const inlineEditorEl = isTextNode ? null : document.createElement('div');
    if (inlineEditorEl !== null) {
      inlineEditorEl.dataset.role = 'inline-editor';
      inlineEditorEl.style.display = isInlineEditing ? 'flex' : 'none';
      inlineEditorEl.style.flexDirection = 'column';
      inlineEditorEl.style.flex = '1 1 auto';
      inlineEditorEl.style.gap = '8px';
      inlineEditorEl.style.marginTop = '4px';
      inlineEditorEl.style.justifyContent = 'flex-start';
    }

    const inlineTitleInputEl = isTextNode
      ? document.createElement('textarea')
      : document.createElement('input');
    const textNodeTitleInputMetrics = resolveTextNodeTitleInputMetrics(isExpandedTextNode);
    inlineTitleInputEl.dataset.role = 'inline-title-input';
    inlineTitleInputEl.dataset.inlineEditorInteractive = 'true';
    if (inlineTitleInputEl instanceof HTMLInputElement) {
      inlineTitleInputEl.type = 'text';
    } else {
      inlineTitleInputEl.dataset.customScrollbar = isExpandedTextNode ? 'true' : 'false';
      inlineTitleInputEl.rows = 1;
      inlineTitleInputEl.wrap = 'soft';
      inlineTitleInputEl.style.resize = 'none';
      inlineTitleInputEl.style.overflowY = isExpandedTextNode ? 'auto' : 'hidden';
      inlineTitleInputEl.style.overflowX = 'hidden';
      inlineTitleInputEl.style.whiteSpace = 'pre-wrap';
      inlineTitleInputEl.style.overflowWrap = 'anywhere';
      inlineTitleInputEl.style.wordBreak = 'break-word';
    }
    inlineTitleInputEl.setAttribute('spellcheck', 'false');
    inlineTitleInputEl.setAttribute('autocorrect', 'off');
    inlineTitleInputEl.setAttribute('autocapitalize', 'off');
    inlineTitleInputEl.style.minHeight = isTextNode
      ? textNodeTitleInputMetrics.minHeight
      : '32px';
    inlineTitleInputEl.style.minWidth = isTextNode ? '0' : '';
    inlineTitleInputEl.style.height = isTextNode
      ? textNodeTitleInputMetrics.height
      : '32px';
    inlineTitleInputEl.style.width = isTextNode ? '' : '100%';
    inlineTitleInputEl.style.boxSizing = 'border-box';
    inlineTitleInputEl.style.margin = '0';
    inlineTitleInputEl.style.padding = isTextNode ? textNodeTitleInputMetrics.padding : '0 10px';
    inlineTitleInputEl.style.borderRadius = isTextNode ? '0' : '10px';
    inlineTitleInputEl.style.border = isTextNode ? 'none' : '1px solid rgba(255,255,255,0.16)';
    inlineTitleInputEl.style.background = isTextNode ? 'transparent' : 'rgba(15,23,42,0.36)';
    inlineTitleInputEl.style.color = 'inherit';
    inlineTitleInputEl.style.fontSize = isTextNode ? '15px' : '14px';
    inlineTitleInputEl.style.fontWeight = isTextNode ? '500' : '400';
    inlineTitleInputEl.style.lineHeight = isTextNode ? `${TEXT_NODE_LINE_HEIGHT}px` : 'normal';
    inlineTitleInputEl.style.caretColor = isTextNode
      ? isInlineEditing ? 'var(--ws-input-foreground, inherit)' : 'transparent'
      : 'currentColor';
    inlineTitleInputEl.readOnly = isTextNode ? !isInlineEditing : false;
    inlineTitleInputEl.style.pointerEvents = isTextNode && !isInlineEditing ? 'none' : 'auto';
    inlineTitleInputEl.style.cursor = isTextNode && !isInlineEditing ? 'inherit' : 'text';
    inlineTitleInputEl.style.outline = 'none';
    inlineTitleInputEl.tabIndex = isTextNode && !isInlineEditing ? -1 : 0;
    if (isTextNode && !isInlineEditing) {
      inlineTitleInputEl.dataset.pluginRuntimeStickBottom = 'true';
    }
    if (isInlineEditing) {
      inlineTitleInputEl.dataset.pluginRuntimeAutofocus = 'true';
      inlineTitleInputEl.dataset.pluginRuntimeEditing = 'true';
    }
    this.registerDomEvent(inlineTitleInputEl, 'focus', () => {
      const previousSelection = this.captureSelectionSnapshot();
      const nextInlineEditingNodeId = node.type === 'text' ? node.id : this.inlineEditingNodeId;
      const shouldSyncSelection = previousSelection.selectedNodeId !== node.id
        || previousSelection.selectedNodeIds.length !== 1
        || previousSelection.selectedNodeIds[0] !== node.id
        || previousSelection.inlineEditingNodeId !== nextInlineEditingNodeId;

      if (!shouldSyncSelection) {
        return;
      }

      this.setSelectedNodes([node.id], node.id);
      this.inlineEditingNodeId = nextInlineEditingNodeId;
      this.syncScene({
        nodeIds: this.collectSelectionAffectedNodeIds(previousSelection),
        inspector: true,
        summary: true,
      });
    });
    this.registerDomEvent(inlineTitleInputEl, 'input', () => {
      this.selectedNodeId = node.id;
      this.inlineEditingNodeId = node.id;
      this.updateSelectedNodeTitle(inlineTitleInputEl.value);
    });

    const inlineUrlInputEl = document.createElement('input');
    inlineUrlInputEl.dataset.role = 'inline-url-input';
    inlineUrlInputEl.dataset.inlineEditorInteractive = 'true';
    inlineUrlInputEl.type = 'url';
    inlineUrlInputEl.setAttribute('spellcheck', 'false');
    inlineUrlInputEl.setAttribute('autocorrect', 'off');
    inlineUrlInputEl.setAttribute('autocapitalize', 'off');
    inlineUrlInputEl.placeholder = '输入 URL 地址';
    inlineUrlInputEl.style.display = 'none';
    inlineUrlInputEl.style.minHeight = '32px';
    inlineUrlInputEl.style.padding = '0 10px';
    inlineUrlInputEl.style.borderRadius = '10px';
    inlineUrlInputEl.style.border = '1px solid rgba(255,255,255,0.16)';
    inlineUrlInputEl.style.background = 'rgba(15,23,42,0.36)';
    inlineUrlInputEl.style.color = 'inherit';
    this.registerDomEvent(inlineUrlInputEl, 'input', () => {
      this.selectedNodeId = node.id;
      this.inlineEditingNodeId = node.id;
      this.updateSelectedNodeUrl(inlineUrlInputEl.value);
    });

    const inlineBodyInputEl = document.createElement('textarea');
    inlineBodyInputEl.dataset.role = 'inline-body-input';
    inlineBodyInputEl.dataset.inlineEditorInteractive = 'true';
    inlineBodyInputEl.setAttribute('spellcheck', 'false');
    inlineBodyInputEl.setAttribute('autocorrect', 'off');
    inlineBodyInputEl.setAttribute('autocapitalize', 'off');
    inlineBodyInputEl.style.minHeight = '78px';
    inlineBodyInputEl.style.padding = '10px';
    inlineBodyInputEl.style.borderRadius = '10px';
    inlineBodyInputEl.style.border = '1px solid rgba(255,255,255,0.16)';
    inlineBodyInputEl.style.background = 'rgba(15,23,42,0.36)';
    inlineBodyInputEl.style.color = 'inherit';
    inlineBodyInputEl.style.resize = 'vertical';
    this.registerDomEvent(inlineBodyInputEl, 'input', () => {
      this.selectedNodeId = node.id;
      this.inlineEditingNodeId = node.id;
      this.updateSelectedNodeBody(inlineBodyInputEl.value);
    });

    const inlineHintEl = document.createElement('div');
    inlineHintEl.dataset.role = 'inline-edit-hint';
    inlineHintEl.textContent = '当前卡片正在就地编辑';
    inlineHintEl.style.fontSize = '12px';
    inlineHintEl.style.opacity = '0.72';
    inlineHintEl.style.display = isTextNode ? 'none' : 'block';
    inlineHintEl.style.pointerEvents = 'none';

    if (isTextNode) {
      contentShellEl.append(inlineTitleInputEl);
    } else if (inlineEditorEl !== null) {
      inlineEditorEl.append(inlineTitleInputEl, inlineUrlInputEl, inlineBodyInputEl, inlineHintEl);
    }
    const resizeHandleEl = document.createElement('div');
    resizeHandleEl.dataset.role = 'resize-handle';
    resizeHandleEl.dataset.inlineEditorInteractive = 'true';
    resizeHandleEl.style.position = 'absolute';
    resizeHandleEl.style.right = '8px';
    resizeHandleEl.style.bottom = '8px';
    resizeHandleEl.style.width = '14px';
    resizeHandleEl.style.height = '14px';
    resizeHandleEl.style.borderRight = '2px solid rgba(255,255,255,0.72)';
    resizeHandleEl.style.borderBottom = '2px solid rgba(255,255,255,0.72)';
    resizeHandleEl.style.cursor = 'nwse-resize';
    resizeHandleEl.style.opacity = '0.86';
    resizeHandleEl.style.display = 'none';
    this.registerDomEvent(resizeHandleEl, 'mousedown', (event: MouseEvent) => {
      if (event.button !== 0) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      if (!this.guardWritableCanvas('调整节点大小')) {
        return;
      }

      const currentNode = findNode(this.nodes, node.id);
      this.startNodeResizeInteraction(event, node.id, currentNode, 'se', resizeHandleEl);
    });

    const resizeHitAreaEls = RESIZE_DIRECTIONS.reduce<Record<ResizeDirection, HTMLElement>>((result, direction) => {
      const handleEl = document.createElement('div');
      handleEl.dataset.role = `resize-hit-${direction}`;
      handleEl.dataset.inlineEditorInteractive = 'true';
      this.applyResizeHitAreaLayout(handleEl, direction, resizeHitAreaMetrics);
      handleEl.style.display = isInlineEditing || isReadOnly ? 'none' : 'block';
      this.registerDomEvent(handleEl, 'mousedown', (event: MouseEvent) => {
        if (event.button !== 0) {
          return;
        }

        const currentNode = findNode(this.nodes, node.id);
        this.startNodeResizeInteraction(event, node.id, currentNode, direction, handleEl);
      });
      result[direction] = handleEl;
      return result;
    }, {
      n: document.createElement('div'),
      s: document.createElement('div'),
      e: document.createElement('div'),
      w: document.createElement('div'),
      ne: document.createElement('div'),
      nw: document.createElement('div'),
      se: document.createElement('div'),
      sw: document.createElement('div'),
    });

    resizeFrameEl.append(...RESIZE_DIRECTIONS.map((direction) => resizeHitAreaEls[direction]));

    if (isTextNode) {
      nodeEl.append(contentShellEl, resizeFrameEl);
    } else {
      if (inlineEditorEl === null) {
        throw new Error('Block node inline editor is required.');
      }
      contentShellEl.append(
        nodeTypeEl,
        nodeTitleEl,
        nodeMetaEl,
        nodeBodyEl,
        urlPreviewEl,
        inlineEditTriggerEl,
        inlineEditorEl,
      );
      nodeEl.append(contentShellEl, resizeHandleEl, resizeFrameEl);
    }
    this.registerDomEvent(nodeEl, 'mousedown', (event: MouseEvent) => {
      if (event.button !== 0) {
        return;
      }

      const eventTarget = event.target;

      if (
        eventTarget instanceof HTMLElement
        && eventTarget.dataset.inlineEditorInteractive === 'true'
      ) {
        return;
      }

      const now = Date.now();
      const repeatedPrimaryDown = this.lastNodePointerDownId === node.id
        && (now - this.lastNodePointerDownAt) <= NODE_DOUBLE_CLICK_THRESHOLD_MS
        && Math.abs(event.clientX - this.lastNodePointerDownX) <= NODE_DOUBLE_CLICK_DISTANCE_THRESHOLD
        && Math.abs(event.clientY - this.lastNodePointerDownY) <= NODE_DOUBLE_CLICK_DISTANCE_THRESHOLD;

      this.lastNodePointerDownId = node.id;
      this.lastNodePointerDownAt = now;
      this.lastNodePointerDownX = event.clientX;
      this.lastNodePointerDownY = event.clientY;

      if (repeatedPrimaryDown) {
        event.preventDefault();
        const previousSelection = this.captureSelectionSnapshot();
        const zOrderChanged = this.bringNodeIdsToFront([node.id]);
        this.setSelectedNodes([node.id], node.id);
        this.inlineEditingNodeId = null;
        this.activeNodeId = null;
        this.dragMode = 'none';
        const selectionChanged = this.hasSelectionStateChanged(previousSelection);

        if (selectionChanged) {
          this.syncScene({
            syncStructure: zOrderChanged,
            nodeIds: this.collectSelectionAffectedNodeIds(previousSelection),
            inspector: true,
            summary: true,
          });
        }

        void this.activateNode(node.id);
        return;
      }

      const currentNode = findNode(this.nodes, node.id);
      const currentIsReadOnly = this.isCanvasReadOnly();
      const currentIsInlineEditing = this.inlineEditingNodeId === node.id
        && this.selectedNodeId === node.id
        && this.selectedNodeIds.length === 1
        && !currentIsReadOnly;
      const resizeDirection = this.resolveResizeDirectionForNodeEvent(
        event,
        currentNode,
        currentIsInlineEditing,
        currentIsReadOnly,
      );

      if (resizeDirection !== null) {
        event.preventDefault();
        const previousSelection = this.captureSelectionSnapshot();
        const zOrderChanged = this.bringNodeIdsToFront([node.id]);
        this.setSelectedNodes([node.id], node.id);
        this.inlineEditingNodeId = null;
        this.activeNodeId = node.id;
        this.dragMode = 'resize';
        this.resizeDirection = resizeDirection;
        this.dragStartX = event.clientX;
        this.dragStartY = event.clientY;
        this.resizeOriginNodeX = currentNode.x;
        this.resizeOriginNodeY = currentNode.y;
        this.resizeOriginWidth = nodeWidth(currentNode);
        this.resizeOriginHeight = nodeHeight(currentNode);
        this.pointerCaptureOwnerEl = nodeEl;
        nodeEl.setPointerCapture(HOST_MOUSE_POINTER_ID);
        nodeEl.style.cursor = resolveResizeCursor(resizeDirection);
        this.syncScene({
          syncStructure: zOrderChanged,
          nodeIds: this.collectSelectionAffectedNodeIds(previousSelection),
          inspector: true,
          summary: true,
        });
        return;
      }

      event.preventDefault();
      const previousSelection = this.captureSelectionSnapshot();
      const zOrderChanged = this.bringNodeIdsToFront([node.id]);
      this.setSelectedNodes([node.id], node.id);
      this.inlineEditingNodeId = null;
      this.activeNodeId = node.id;
      this.dragMode = 'node';
      this.dragStartX = event.clientX;
      this.dragStartY = event.clientY;
      this.dragOriginNodeX = currentNode.x;
      this.dragOriginNodeY = currentNode.y;
      this.dragOriginNodePositions = this.captureDragOriginPositions(node.id);
      this.interactionOriginClientX = event.clientX;
      this.interactionOriginClientY = event.clientY;
      this.pointerCaptureOwnerEl = nodeEl;
      nodeEl.setPointerCapture(HOST_MOUSE_POINTER_ID);
      nodeEl.style.cursor = 'grabbing';
      nodeEl.style.zIndex = NODE_ACTIVE_Z_INDEX;
      const selectionChanged = this.hasSelectionStateChanged(previousSelection);
      const selectionNodeIds = this.collectSelectionAffectedNodeIds(previousSelection);

      if (selectionChanged) {
        this.markSceneChanged({
          syncStructure: zOrderChanged,
          nodeIds: selectionNodeIds,
          inspector: true,
          summary: true,
        });
        return;
      }

      this.syncScene({
        syncStructure: zOrderChanged,
        nodeIds: [node.id],
      });
    });
    this.registerDomEvent(nodeEl, 'mousemove', (event: MouseEvent) => {
      if (this.dragMode === 'none') {
        const currentNode = this.nodes.find((item) => item.id === node.id) ?? null;

        if (currentNode !== null) {
          const resizeDirection = this.resolveResizeDirectionForNodeEvent(
            event,
            currentNode,
            this.inlineEditingNodeId === node.id,
            this.isCanvasReadOnly(),
          );

          nodeEl.style.cursor = resizeDirection === null
            ? this.resolveNodeCursor(
              this.selectedNodeIds.includes(node.id),
              this.inlineEditingNodeId === node.id,
              this.isCanvasReadOnly(),
            )
            : resolveResizeCursor(resizeDirection);
        }

        return;
      }

      if (this.dragMode === 'resize' && this.activeNodeId === node.id && this.resizeDirection !== null) {
        nodeEl.style.cursor = resolveResizeCursor(this.resizeDirection);
      }

      if (this.dragMode !== 'node' || this.activeNodeId !== node.id) {
        if (this.dragMode === 'resize' && this.activeNodeId === node.id) {
          this.handlePointerMove(event);
        }
        return;
      }

      this.handlePointerMove(event);
    });
    this.registerDomEvent(nodeEl, 'mouseup', () => {
      if (this.dragMode !== 'node' || this.activeNodeId !== node.id) {
        return;
      }

      this.finishPointerInteraction();
    });

    this.registerDomEvent(nodeEl, 'dblclick', (event: MouseEvent) => {
      event.preventDefault();
      void this.activateNode(node.id);
    });
    this.registerDomEvent(nodeEl, 'contextmenu', (event: MouseEvent) => {
      this.openNodeContextMenu(node.id, event);
    });
    this.bindCanvasKeyboardTarget(nodeEl);

    return {
      nodeEl,
      resizeFrameEl,
      contentShellEl,
      typeEl: nodeTypeEl,
      titleEl: nodeTitleEl,
      metaEl: nodeMetaEl,
      bodyEl: nodeBodyEl,
      urlPreviewEl,
      inlineEditTriggerEl,
      inlineEditorEl,
      inlineTitleInputEl,
      inlineUrlInputEl,
      inlineBodyInputEl,
      inlineHintEl,
      resizeHandleEl,
      resizeHitAreaEls,
    };
  }

  private createLineRuntime(line: CanvasLineState): CanvasLineRuntime {
    const holderEl = document.createElement('div');
    holderEl.style.position = 'absolute';
    holderEl.style.left = '0';
    holderEl.style.top = '0';
    holderEl.style.pointerEvents = 'none';

    const lineEl = document.createElement('div');
    lineEl.style.position = 'absolute';
    lineEl.style.height = '4px';
    lineEl.style.borderRadius = '999px';
    lineEl.style.background = 'linear-gradient(90deg, rgba(148,163,184,0.85), rgba(226,232,240,0.95))';
    lineEl.style.boxShadow = '0 0 0 1px rgba(255,255,255,0.08)';
    lineEl.style.transformOrigin = '0 50%';

    const labelEl = document.createElement('div');
    labelEl.textContent = line.label;
    labelEl.style.position = 'absolute';
    labelEl.style.padding = '4px 8px';
    labelEl.style.borderRadius = '999px';
    labelEl.style.background = 'rgba(15, 23, 42, 0.86)';
    labelEl.style.border = '1px solid rgba(255,255,255,0.08)';
    labelEl.style.fontSize = '12px';
    labelEl.style.whiteSpace = 'nowrap';

    holderEl.append(lineEl, labelEl);
    this.sceneEl?.append(holderEl);

    return {
      holderEl,
      lineEl,
      labelEl,
    };
  }

  private createToolChip(label: string, onClick: () => void): HTMLElement {
    const chipEl = document.createElement('div');
    chipEl.textContent = label;
    chipEl.setAttribute('role', 'button');
    chipEl.tabIndex = 0;
    chipEl.style.display = 'inline-flex';
    chipEl.style.alignItems = 'center';
    chipEl.style.justifyContent = 'flex-start';
    chipEl.style.width = '100%';
    chipEl.style.minHeight = '32px';
    chipEl.style.padding = '0 12px';
    chipEl.style.boxSizing = 'border-box';
    chipEl.style.border = '1px solid rgba(255,255,255,0.12)';
    chipEl.style.borderRadius = '999px';
    chipEl.style.cursor = 'pointer';
    chipEl.style.userSelect = 'none';
    chipEl.style.background = 'rgba(255,255,255,0.04)';
    this.registerDomEvent(chipEl, 'click', (event: MouseEvent) => {
      this.captureViewportMetricsFromEvent(event);
      onClick();
    });
    this.registerDomEvent(chipEl, 'keydown', (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== ' ') {
        return;
      }

      event.preventDefault();
      this.captureViewportMetricsFromEvent(event);
      onClick();
    });
    return chipEl;
  }

  private resolveSelectedNode(): CanvasNodeState | null {
    if (this.selectedNodeId === null) {
      return null;
    }

    return this.nodes.find((node) => node.id === this.selectedNodeId) ?? null;
  }

  private resolveSelectedNodes(): readonly CanvasNodeState[] {
    if (this.selectedNodeIds.length === 0) {
      return [];
    }

    const selectedIdSet = new Set(this.selectedNodeIds);
    return this.nodes.filter((node) => selectedIdSet.has(node.id));
  }

  private captureSelectionSnapshot(): CanvasSelectionSnapshot {
    return {
      selectedNodeId: this.selectedNodeId,
      selectedNodeIds: [...this.selectedNodeIds],
      inlineEditingNodeId: this.inlineEditingNodeId,
      persistentSelectionBoxActive: this.persistentSelectionBoxActive,
    };
  }

  private hasSelectionStateChanged(previousSelection: CanvasSelectionSnapshot): boolean {
    if (previousSelection.selectedNodeId !== this.selectedNodeId) {
      return true;
    }

    if (previousSelection.inlineEditingNodeId !== this.inlineEditingNodeId) {
      return true;
    }

    if (previousSelection.persistentSelectionBoxActive !== this.persistentSelectionBoxActive) {
      return true;
    }

    if (previousSelection.selectedNodeIds.length !== this.selectedNodeIds.length) {
      return true;
    }

    return previousSelection.selectedNodeIds.some((nodeId, index) => this.selectedNodeIds[index] !== nodeId);
  }

  private collectSelectionAffectedNodeIds(previousSelection: CanvasSelectionSnapshot): readonly NodeId[] {
    return [
      ...new Set([
        ...previousSelection.selectedNodeIds,
        ...this.selectedNodeIds,
        ...(previousSelection.selectedNodeId === null ? [] : [previousSelection.selectedNodeId]),
        ...(this.selectedNodeId === null ? [] : [this.selectedNodeId]),
        ...(previousSelection.inlineEditingNodeId === null ? [] : [previousSelection.inlineEditingNodeId]),
        ...(this.inlineEditingNodeId === null ? [] : [this.inlineEditingNodeId]),
      ]),
    ];
  }

  private collectLineIdsForNodeIds(nodeIds: readonly NodeId[]): readonly string[] {
    if (nodeIds.length === 0) {
      return [];
    }

    const nodeIdSet = new Set(nodeIds);
    return this.lines
      .filter((line) => nodeIdSet.has(line.from) || nodeIdSet.has(line.to))
      .map((line) => line.id);
  }

  private collectGroupMemberIds(groupId: NodeId): readonly NodeId[] {
    return this.nodes
      .filter((node) => node.groupId === groupId)
      .map((node) => node.id);
  }

  private collectParentGroupIdsForNodes(nodeIds: readonly NodeId[]): readonly NodeId[] {
    const nodeIdSet = new Set(nodeIds);
    const groupIds: NodeId[] = [];

    for (const node of this.nodes) {
      if (node.groupId !== undefined && nodeIdSet.has(node.id)) {
        groupIds.push(node.groupId);
      }
    }

    return [...new Set(groupIds)];
  }

  private resolveGroupMemberBounds(groupId: NodeId): {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  } | null {
    const members = this.nodes.filter((node) => node.groupId === groupId && node.id !== groupId);

    if (members.length === 0) {
      return null;
    }

    const minX = Math.min(...members.map((node) => node.x));
    const minY = Math.min(...members.map((node) => node.y));
    const maxX = Math.max(...members.map((node) => node.x + nodeWidth(node)));
    const maxY = Math.max(...members.map((node) => node.y + nodeHeight(node)));

    return {
      x: minX - GROUP_NODE_PADDING,
      y: minY - GROUP_NODE_PADDING,
      width: Math.max(GROUP_NODE_WIDTH, (maxX - minX) + (GROUP_NODE_PADDING * 2)),
      height: Math.max(GROUP_NODE_HEIGHT, (maxY - minY) + (GROUP_NODE_PADDING * 2)),
    };
  }

  private expandGroupsToFitMembers(groupIds: readonly NodeId[]): readonly NodeId[] {
    const targetGroupIds = [...new Set(groupIds)];

    if (targetGroupIds.length === 0) {
      return [];
    }

    const changedGroupIds: NodeId[] = [];

    this.nodes = this.nodes.map((node) => {
      if (node.type !== 'group' || !targetGroupIds.includes(node.id)) {
        return node;
      }

      const memberBounds = this.resolveGroupMemberBounds(node.id);

      if (memberBounds === null) {
        return node;
      }

      const currentRight = node.x + nodeWidth(node);
      const currentBottom = node.y + nodeHeight(node);
      const boundsRight = memberBounds.x + memberBounds.width;
      const boundsBottom = memberBounds.y + memberBounds.height;
      const nextX = Math.min(node.x, memberBounds.x);
      const nextY = Math.min(node.y, memberBounds.y);
      const nextWidth = Math.max(currentRight, boundsRight) - nextX;
      const nextHeight = Math.max(currentBottom, boundsBottom) - nextY;

      if (
        nextX === node.x
        && nextY === node.y
        && nextWidth === nodeWidth(node)
        && nextHeight === nodeHeight(node)
      ) {
        return node;
      }

      changedGroupIds.push(node.id);
      return {
        ...node,
        x: nextX,
        y: nextY,
        width: nextWidth,
        height: nextHeight,
      };
    });

    return changedGroupIds;
  }

  private collectGroupAwareMoveNodeIds(nodeIds: readonly NodeId[]): readonly NodeId[] {
    const moveNodeIds = new Set<NodeId>(nodeIds);

    for (const node of this.nodes) {
      if (node.type !== 'group' || !moveNodeIds.has(node.id)) {
        continue;
      }

      for (const memberId of this.collectGroupMemberIds(node.id)) {
        moveNodeIds.add(memberId);
      }
    }

    return [...moveNodeIds];
  }

  private captureDragOriginPositions(activeNodeId: NodeId): ReadonlyMap<NodeId, ScenePoint> {
    return this.captureDragOriginPositionsForNodeIds([activeNodeId]);
  }

  private captureDragOriginPositionsForNodeIds(activeNodeIds: readonly NodeId[]): ReadonlyMap<NodeId, ScenePoint> {
    const moveNodeIds = this.collectGroupAwareMoveNodeIds(activeNodeIds);
    const entries: Array<readonly [NodeId, ScenePoint]> = [];

    for (const node of this.nodes) {
      if (!moveNodeIds.includes(node.id)) {
        continue;
      }

      entries.push([node.id, { x: node.x, y: node.y }]);
    }

    return new Map(entries);
  }

  private resolveDropTargetGroupId(activeNode: CanvasNodeState): NodeId | null {
    if (activeNode.type === 'group') {
      return null;
    }

    const centerPoint = {
      x: nodeCenterX(activeNode),
      y: nodeCenterY(activeNode),
    };

    return this.nodes.find((node) => (
      node.type === 'group'
      && node.id !== activeNode.id
      && isPointInsideNode(centerPoint, node)
    ))?.id ?? null;
  }

  private createNodeWithoutGroupId(node: CanvasNodeState): CanvasNodeState {
    return {
      id: node.id,
      type: node.type,
      title: node.title,
      body: node.body,
      accent: node.accent,
      shadow: node.shadow,
      x: node.x,
      y: node.y,
      ...(node.targetPath === undefined ? {} : { targetPath: node.targetPath }),
      ...(node.url === undefined ? {} : { url: node.url }),
      ...(node.width === undefined ? {} : { width: node.width }),
      ...(node.height === undefined ? {} : { height: node.height }),
    };
  }

  private setSelectedNodes(nodeIds: readonly NodeId[], preferredNodeId: NodeId | null = null): void {
    const existingNodeIds = new Set(this.nodes.map((node) => node.id));
    const normalizedIds = [...new Set(nodeIds)].filter((nodeId) => existingNodeIds.has(nodeId));
    this.selectedNodeIds = normalizedIds;

    if (this.dragMode !== 'select') {
      this.persistentSelectionBoxActive = false;
    }

    if (normalizedIds.length === 0) {
      this.selectedNodeId = null;
      this.inlineEditingNodeId = null;
      this.persistentSelectionBoxActive = false;
      return;
    }

    if (preferredNodeId !== null && normalizedIds.includes(preferredNodeId)) {
      this.selectedNodeId = preferredNodeId;
    } else if (this.selectedNodeId !== null && normalizedIds.includes(this.selectedNodeId)) {
      this.selectedNodeId = this.selectedNodeId;
    } else {
      this.selectedNodeId = normalizedIds[0] ?? null;
    }

    if (
      this.inlineEditingNodeId !== null
      && !normalizedIds.includes(this.inlineEditingNodeId)
    ) {
      this.inlineEditingNodeId = null;
    }
  }

  private resolveViewportLocalPoint(
    event: Event,
    fallbackToStoredOrigin: boolean,
  ): { readonly x: number; readonly y: number } | null {
    this.captureViewportMetricsFromEvent(event);

    const clientX = readEventClientCoordinate(event, 'clientX');
    const clientY = readEventClientCoordinate(event, 'clientY');
    const elementX = readAugmentedEventNumber(event, 'elementX');
    const elementY = readAugmentedEventNumber(event, 'elementY');

    if (elementX !== null && elementY !== null) {
      if (event.target === this.viewportEl) {
        return {
          x: elementX,
          y: elementY,
        };
      }

      if (event.target === this.sceneEl) {
        return {
          x: this.offsetX + elementX,
          y: this.offsetY + elementY,
        };
      }

      if (!fallbackToStoredOrigin) {
        return null;
      }
    }

    if (!fallbackToStoredOrigin) {
      return null;
    }

    return {
      x: clientX - this.interactionOriginClientX,
      y: clientY - this.interactionOriginClientY,
    };
  }

  private resolveScenePointFromViewportLocal(
    viewportLocal: { readonly x: number; readonly y: number },
  ): { readonly x: number; readonly y: number } {
    return {
      x: (viewportLocal.x - this.offsetX) / this.scale,
      y: (viewportLocal.y - this.offsetY) / this.scale,
    };
  }

  private updateSelectionBoxFromSceneBounds(): void {
    if (this.selectionBoxEl === null) {
      return;
    }

    const canDragPersistentSelection = this.canDragPersistentSelectionBox();
    this.selectionBoxEl.style.pointerEvents = this.dragMode === 'selection-box' || canDragPersistentSelection ? 'auto' : 'none';
    this.selectionBoxEl.style.cursor = this.dragMode === 'selection-box' ? 'grabbing' : canDragPersistentSelection ? 'pointer' : 'default';

    if (this.dragMode !== 'select' && !this.persistentSelectionBoxActive) {
      this.selectionBoxEl.style.display = 'none';
      return;
    }

    let left = 0;
    let top = 0;
    let width = 0;
    let height = 0;

    if (this.dragMode === 'select') {
      const startViewportX = this.offsetX + (this.selectionStartSceneX * this.scale);
      const startViewportY = this.offsetY + (this.selectionStartSceneY * this.scale);
      const currentViewportX = this.offsetX + (this.selectionCurrentSceneX * this.scale);
      const currentViewportY = this.offsetY + (this.selectionCurrentSceneY * this.scale);
      left = Math.min(startViewportX, currentViewportX);
      top = Math.min(startViewportY, currentViewportY);
      width = Math.abs(currentViewportX - startViewportX);
      height = Math.abs(currentViewportY - startViewportY);
    } else {
      const selectedNodes = this.resolveSelectedNodes();

      if (selectedNodes.length === 0) {
        this.selectionBoxEl.style.display = 'none';
        return;
      }

      const minX = Math.min(...selectedNodes.map((node) => node.x));
      const minY = Math.min(...selectedNodes.map((node) => node.y));
      const maxX = Math.max(...selectedNodes.map((node) => node.x + nodeWidth(node)));
      const maxY = Math.max(...selectedNodes.map((node) => node.y + nodeHeight(node)));

      left = this.offsetX + (minX * this.scale) - PERSISTENT_SELECTION_BOX_PADDING;
      top = this.offsetY + (minY * this.scale) - PERSISTENT_SELECTION_BOX_PADDING;
      width = ((maxX - minX) * this.scale) + (PERSISTENT_SELECTION_BOX_PADDING * 2);
      height = ((maxY - minY) * this.scale) + (PERSISTENT_SELECTION_BOX_PADDING * 2);
    }

    this.selectionBoxEl.style.display = 'block';
    this.selectionBoxEl.style.left = `${left}px`;
    this.selectionBoxEl.style.top = `${top}px`;
    this.selectionBoxEl.style.width = `${width}px`;
    this.selectionBoxEl.style.height = `${height}px`;
  }

  private updateBoxSelectionCandidates(previousSelection: CanvasSelectionSnapshot): readonly NodeId[] {
    const minX = Math.min(this.selectionStartSceneX, this.selectionCurrentSceneX);
    const maxX = Math.max(this.selectionStartSceneX, this.selectionCurrentSceneX);
    const minY = Math.min(this.selectionStartSceneY, this.selectionCurrentSceneY);
    const maxY = Math.max(this.selectionStartSceneY, this.selectionCurrentSceneY);
    const selectedIds = this.nodes
      .filter((node) => {
        const nodeRight = node.x + nodeWidth(node);
        const nodeBottom = node.y + nodeHeight(node);

        return !(nodeRight < minX || node.x > maxX || nodeBottom < minY || node.y > maxY);
      })
      .map((node) => node.id);

    this.setSelectedNodes(selectedIds, selectedIds[0] ?? null);
    return this.collectSelectionAffectedNodeIds(previousSelection);
  }

  private enterInlineEdit(nodeId: NodeId): void {
    if (!this.guardWritableCanvas('编辑节点')) {
      return;
    }

    const activeNode = this.nodes.find((node) => node.id === nodeId) ?? null;
    const previousSelection = this.captureSelectionSnapshot();
    const zOrderChanged = this.bringNodeIdsToFront([nodeId]);
    this.setSelectedNodes([nodeId], nodeId);

    if (activeNode?.type === 'url') {
      this.inlineEditingNodeId = null;
      this.syncScene({
        syncStructure: zOrderChanged,
        nodeIds: this.collectSelectionAffectedNodeIds(previousSelection),
        inspector: true,
        summary: true,
      });
      this.openUrlNodeAddressEditor(activeNode);
      return;
    }

    this.inlineEditingNodeId = nodeId;
    this.syncScene({
      syncStructure: zOrderChanged,
      nodeIds: this.collectSelectionAffectedNodeIds(previousSelection),
      inspector: true,
      summary: true,
    });

    const activeNodeRuntime = this.nodeRuntimes.get(nodeId) ?? null;
    if (activeNodeRuntime !== null) {
      this.focusInlineTitleInput(activeNodeRuntime.inlineTitleInputEl);
    }
  }

  private syncNodeDom(): void {
    const activeNodeIds = new Set(this.nodes.map((node) => node.id));

    for (const [nodeId, runtime] of [...this.nodeRuntimes.entries()]) {
      if (activeNodeIds.has(nodeId)) {
        continue;
      }

      runtime.nodeEl.remove();
      this.nodeRuntimes.delete(nodeId);
      this.urlPreviewStates.delete(nodeId);
    }

    for (const node of this.nodes) {
      let runtime = this.nodeRuntimes.get(node.id) ?? null;

      if (runtime === null) {
        runtime = this.createNodeCard(node);
        this.nodeRuntimes.set(node.id, runtime);
      }

      this.sceneEl?.append(runtime.nodeEl);
    }
  }

  private syncLineDom(): void {
    const activeLineIds = new Set(this.lines.map((line) => line.id));

    for (const [lineId, lineRuntime] of [...this.lineRuntimes.entries()]) {
      if (activeLineIds.has(lineId)) {
        continue;
      }

      lineRuntime.holderEl.remove();
      this.lineRuntimes.delete(lineId);
    }

    for (const line of this.lines) {
      const existingRuntime = this.lineRuntimes.get(line.id) ?? null;

      if (existingRuntime !== null) {
        existingRuntime.labelEl.textContent = line.label;
        continue;
      }

      this.lineRuntimes.set(line.id, this.createLineRuntime(line));
    }
  }

  private syncNodeRuntime(nodeId: NodeId): void {
    const runtime = this.nodeRuntimes.get(nodeId) ?? null;

    if (runtime === null) {
      return;
    }

    const node = this.nodes.find((item) => item.id === nodeId) ?? null;

    if (node === null) {
      return;
    }

    const typeLabel = getNodeTypeLabel(node.type);
    const referenceText = this.resolveNodeReferenceText(node);
    const hasBrokenReference = this.hasBrokenNodeReference(node);
    const isTextNode = node.type === 'text';
    const isUrlNode = node.type === 'url';
    const shouldDeferUrlPreviewSync = isUrlNode
      && (
        (this.dragMode === 'node' && (this.dragOriginNodePositions.has(node.id) || this.activeNodeId === node.id))
        || (this.dragMode === 'selection-box' && this.dragOriginNodePositions.has(node.id))
        || (this.dragMode === 'resize' && this.activeNodeId === node.id)
      );

    if (runtime.typeEl.textContent !== typeLabel) {
      runtime.typeEl.textContent = typeLabel;
    }

    if (runtime.titleEl.textContent !== node.title) {
      runtime.titleEl.textContent = node.title;
    }

    if (runtime.metaEl.textContent !== (referenceText ?? '')) {
      runtime.metaEl.textContent = referenceText ?? '';
    }

    runtime.metaEl.style.display = referenceText === null || isUrlNode ? 'none' : 'block';
    runtime.metaEl.style.color = hasBrokenReference ? 'rgba(254,202,202,0.96)' : 'inherit';

    if (runtime.bodyEl.textContent !== node.body) {
      runtime.bodyEl.textContent = node.body;
    }

    if (!shouldDeferUrlPreviewSync) {
      this.syncUrlPreviewRuntime(node, runtime);
    }

    const isSelected = this.selectedNodeIds.includes(node.id);
    const isGroupNode = node.type === 'group';
    const isGroupDropTarget = this.dropTargetGroupId === node.id;
    const isReadOnly = this.isCanvasReadOnly();
    const isActiveResizeNode = this.dragMode === 'resize' && this.activeNodeId === node.id;
    const isExpandedTextNode = isTextNode && nodeHeight(node) > TEXT_NODE_HEIGHT;
    const shouldCenterCompactTextNode = isTextNode && !isExpandedTextNode;
    const resizeHitAreaMetrics = resolveResizeHitAreaMetrics(node);
    const hasVisibleTitle = node.title.trim().length > 0;
    const hasVisibleBody = node.body.trim().length > 0;
    const isInlineEditing = this.selectedNodeIds.length === 1
      && this.inlineEditingNodeId === node.id
      && this.selectedNodeId === node.id
      && !isReadOnly;

    if (runtime.inlineEditorEl !== null) {
      runtime.inlineEditorEl.style.display = isInlineEditing ? 'flex' : 'none';
      runtime.inlineEditorEl.style.flex = '1 1 auto';
      runtime.inlineEditorEl.style.gap = '8px';
      runtime.inlineEditorEl.style.marginTop = '4px';
      runtime.inlineEditorEl.style.justifyContent = 'flex-start';
    }
    if (isInlineEditing) {
      runtime.inlineTitleInputEl.dataset.pluginRuntimeAutofocus = 'true';
      runtime.inlineTitleInputEl.dataset.pluginRuntimeEditing = 'true';
    } else {
      delete runtime.inlineTitleInputEl.dataset.pluginRuntimeAutofocus;
      delete runtime.inlineTitleInputEl.dataset.pluginRuntimeEditing;
    }
    runtime.inlineEditTriggerEl.style.display = isTextNode
      ? 'none'
      : isSelected && !isInlineEditing && !isReadOnly && !isUrlNode ? 'inline-flex' : 'none';
    runtime.typeEl.style.display = isTextNode ? 'none' : 'inline-flex';
    runtime.titleEl.style.display = isTextNode
      ? 'none'
      : isInlineEditing || isUrlNode || !hasVisibleTitle ? 'none' : 'block';
    runtime.bodyEl.style.display = isTextNode || isInlineEditing || isGroupNode || isUrlNode || !hasVisibleBody ? 'none' : 'block';
    runtime.inlineBodyInputEl.style.display = isTextNode || isGroupNode || isUrlNode ? 'none' : 'block';
    runtime.resizeHandleEl.style.display = 'none';
    for (const direction of RESIZE_DIRECTIONS) {
      this.applyResizeHitAreaLayout(runtime.resizeHitAreaEls[direction], direction, resizeHitAreaMetrics);
      runtime.resizeHitAreaEls[direction].style.display = isInlineEditing || isReadOnly ? 'none' : 'block';
    }
    runtime.inlineTitleInputEl.style.display = isUrlNode ? 'none' : 'block';
    runtime.inlineUrlInputEl.style.display = 'none';
    runtime.inlineHintEl.style.display = isTextNode ? 'none' : isInlineEditing ? 'block' : 'none';
    runtime.inlineTitleInputEl.readOnly = isTextNode ? !isInlineEditing : false;
    runtime.inlineTitleInputEl.disabled = isReadOnly || isUrlNode;
    runtime.inlineUrlInputEl.disabled = true;
    runtime.inlineBodyInputEl.disabled = isReadOnly || isTextNode || isGroupNode || isUrlNode;

    if (runtime.inlineTitleInputEl.value !== node.title) {
      runtime.inlineTitleInputEl.value = node.title;
    }

    if (runtime.inlineUrlInputEl.value !== (node.url ?? '')) {
      runtime.inlineUrlInputEl.value = node.url ?? '';
    }

    if (runtime.inlineBodyInputEl.value !== node.body) {
      runtime.inlineBodyInputEl.value = node.body;
    }

    runtime.nodeEl.style.transform = '';
    runtime.nodeEl.style.left = `${node.x}px`;
    runtime.nodeEl.style.top = `${node.y}px`;
    runtime.nodeEl.style.width = `${nodeWidth(node)}px`;
    runtime.nodeEl.style.minHeight = `${nodeHeight(node)}px`;
    runtime.nodeEl.style.height = !isTextNode || isExpandedTextNode ? `${nodeHeight(node)}px` : '';
    runtime.nodeEl.style.padding = '0';
    runtime.nodeEl.style.display = shouldCenterCompactTextNode ? 'flex' : 'block';
    runtime.nodeEl.style.flexDirection = shouldCenterCompactTextNode ? 'column' : '';
    runtime.nodeEl.style.justifyContent = shouldCenterCompactTextNode ? 'center' : '';
    runtime.nodeEl.style.borderRadius = isTextNode ? '10px' : '12px';
    runtime.nodeEl.style.background = isTextNode
      ? 'var(--ws-input-background, rgba(15,23,42,0.52))'
      : node.accent;
    runtime.nodeEl.style.boxShadow = isTextNode ? 'none' : `0 20px 40px ${node.shadow}`;
    runtime.nodeEl.style.borderWidth = NODE_BORDER_WIDTH;
    runtime.nodeEl.style.borderStyle = isGroupNode ? 'dashed' : 'solid';
    runtime.nodeEl.style.borderColor = isSelected
      ? 'transparent'
      : isTextNode
        ? 'var(--ws-input-border, rgba(255,255,255,0.16))'
        : hasBrokenReference ? 'rgba(248,113,113,0.92)' : 'rgba(255,255,255,0.16)';
    runtime.nodeEl.style.cursor = this.dragMode === 'resize'
      && this.activeNodeId === node.id
      && this.resizeDirection !== null
      ? resolveResizeCursor(this.resizeDirection)
      : this.resolveNodeCursor(isSelected, isInlineEditing, isReadOnly);
    runtime.nodeEl.style.zIndex = resolveNodeZIndex(
      node,
      isSelected,
      (this.dragMode !== 'none' && this.activeNodeId === node.id)
      || (this.dragMode === 'selection-box' && this.dragOriginNodePositions.has(node.id)),
    );
    runtime.nodeEl.style.outline = isGroupDropTarget
      ? '2px solid rgba(34,197,94,0.92)'
      : isSelected ? `${SELECTED_NODE_OUTLINE_WIDTH} solid ${SELECTED_NODE_BORDER_COLOR}` : 'none';
    runtime.nodeEl.style.outlineOffset = isGroupDropTarget || isSelected ? '0' : '0';
    runtime.resizeFrameEl.style.left = `-${resizeHitAreaMetrics.frameOutset}px`;
    runtime.resizeFrameEl.style.top = `-${resizeHitAreaMetrics.frameOutset}px`;
    runtime.resizeFrameEl.style.right = `-${resizeHitAreaMetrics.frameOutset}px`;
    runtime.resizeFrameEl.style.bottom = `-${resizeHitAreaMetrics.frameOutset}px`;
    runtime.contentShellEl.style.height = !isTextNode || isExpandedTextNode ? '100%' : 'auto';
    runtime.contentShellEl.style.padding = isTextNode ? '0' : '18px';
    runtime.contentShellEl.style.borderRadius = 'inherit';
    runtime.contentShellEl.style.justifyContent = 'flex-start';
    runtime.titleEl.style.minHeight = '';
    runtime.titleEl.style.height = '';
    runtime.titleEl.style.marginBottom = isTextNode ? '0' : '8px';
    runtime.titleEl.style.padding = '0';
    runtime.titleEl.style.alignItems = '';
    runtime.titleEl.style.whiteSpace = !isTextNode && isActiveResizeNode ? 'nowrap' : 'normal';
    runtime.titleEl.style.overflow = !isTextNode && isActiveResizeNode ? 'hidden' : 'visible';
    runtime.titleEl.style.textOverflow = !isTextNode && isActiveResizeNode ? 'ellipsis' : 'clip';
    runtime.titleEl.style.fontSize = isTextNode ? '18px' : '20px';
    runtime.titleEl.style.fontWeight = isTextNode ? '500' : '700';
    runtime.titleEl.style.opacity = isTextNode ? '0.96' : '1';
    runtime.metaEl.style.whiteSpace = !isTextNode && isActiveResizeNode ? 'nowrap' : 'pre-wrap';
    runtime.metaEl.style.overflow = !isTextNode && isActiveResizeNode ? 'hidden' : 'visible';
    runtime.metaEl.style.textOverflow = !isTextNode && isActiveResizeNode ? 'ellipsis' : 'clip';
    runtime.bodyEl.style.whiteSpace = !isTextNode && isActiveResizeNode ? 'nowrap' : 'pre-wrap';
    runtime.bodyEl.style.overflow = !isTextNode && isActiveResizeNode ? 'hidden' : 'visible';
    runtime.bodyEl.style.textOverflow = !isTextNode && isActiveResizeNode ? 'ellipsis' : 'clip';
    const textNodeTitleInputMetrics = resolveTextNodeTitleInputMetrics(isExpandedTextNode);
    runtime.inlineTitleInputEl.style.minHeight = isTextNode
      ? textNodeTitleInputMetrics.minHeight
      : '32px';
    runtime.inlineTitleInputEl.style.minWidth = isTextNode ? '0' : '';
    runtime.inlineTitleInputEl.style.height = isTextNode
      ? textNodeTitleInputMetrics.height
      : '32px';
    runtime.inlineTitleInputEl.style.width = isTextNode ? '' : '100%';
    runtime.inlineTitleInputEl.style.boxSizing = 'border-box';
    runtime.inlineTitleInputEl.style.margin = '0';
    runtime.inlineTitleInputEl.style.padding = isTextNode ? textNodeTitleInputMetrics.padding : '0 10px';
    runtime.inlineTitleInputEl.style.borderRadius = isTextNode ? '0' : '10px';
    runtime.inlineTitleInputEl.style.border = isTextNode
      ? 'none'
      : '1px solid rgba(255,255,255,0.16)';
    runtime.inlineTitleInputEl.style.background = isTextNode
      ? 'transparent'
      : 'rgba(15,23,42,0.36)';
    runtime.inlineTitleInputEl.style.color = isTextNode
      ? 'var(--ws-input-foreground, inherit)'
      : 'inherit';
    runtime.inlineTitleInputEl.style.fontSize = isTextNode ? '15px' : '14px';
    runtime.inlineTitleInputEl.style.fontWeight = isTextNode ? '500' : '400';
    runtime.inlineTitleInputEl.style.lineHeight = isTextNode ? `${TEXT_NODE_LINE_HEIGHT}px` : 'normal';
    runtime.inlineTitleInputEl.style.caretColor = isTextNode
      ? isInlineEditing ? 'var(--ws-input-foreground, inherit)' : 'transparent'
      : 'currentColor';
    runtime.inlineTitleInputEl.style.pointerEvents = isTextNode && !isInlineEditing ? 'none' : 'auto';
    runtime.inlineTitleInputEl.style.cursor = isTextNode && !isInlineEditing ? 'inherit' : 'text';
    runtime.inlineTitleInputEl.style.outline = 'none';
    runtime.inlineTitleInputEl.tabIndex = isTextNode && !isInlineEditing ? -1 : 0;
    if (isTextNode && !isInlineEditing) {
      runtime.inlineTitleInputEl.dataset.pluginRuntimeStickBottom = 'true';
    } else {
      delete runtime.inlineTitleInputEl.dataset.pluginRuntimeStickBottom;
    }
    if (runtime.inlineTitleInputEl instanceof HTMLTextAreaElement) {
      runtime.inlineTitleInputEl.dataset.customScrollbar = isExpandedTextNode ? 'true' : 'false';
      runtime.inlineTitleInputEl.rows = 1;
      runtime.inlineTitleInputEl.wrap = 'soft';
      runtime.inlineTitleInputEl.style.resize = 'none';
      runtime.inlineTitleInputEl.style.overflowY = isExpandedTextNode && isInlineEditing ? 'auto' : 'hidden';
      runtime.inlineTitleInputEl.style.overflowX = 'hidden';
      runtime.inlineTitleInputEl.style.whiteSpace = isTextNode ? 'pre-wrap' : 'normal';
      runtime.inlineTitleInputEl.style.overflowWrap = isTextNode ? 'anywhere' : 'normal';
      runtime.inlineTitleInputEl.style.wordBreak = isTextNode ? 'break-word' : 'normal';
    }
    this.syncTextNodeDisplayViewport(node, runtime, isInlineEditing);
  }

  private syncLineRuntime(lineId: string): void {
    const runtime = this.lineRuntimes.get(lineId) ?? null;

    if (runtime === null) {
      return;
    }

    const line = this.lines.find((item) => item.id === lineId) ?? null;

    if (line === null) {
      return;
    }

    const fromNode = this.nodes.find((node) => node.id === line.from) ?? null;
    const toNode = this.nodes.find((node) => node.id === line.to) ?? null;

    if (fromNode === null || toNode === null) {
      runtime.holderEl.style.display = 'none';
      return;
    }

    runtime.holderEl.style.display = '';
    const startX = nodeCenterX(fromNode);
    const startY = nodeCenterY(fromNode);
    const endX = nodeCenterX(toNode);
    const endY = nodeCenterY(toNode);
    const deltaX = endX - startX;
    const deltaY = endY - startY;
    const length = Math.sqrt((deltaX * deltaX) + (deltaY * deltaY));
    const angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI);
    const midX = startX + (deltaX / 2);
    const midY = startY + (deltaY / 2);

    runtime.lineEl.style.width = `${length}px`;
    runtime.lineEl.style.transform = `translate(${startX}px, ${startY}px) rotate(${angle}deg)`;
    runtime.labelEl.style.transform = `translate(${midX - 28}px, ${midY - 18}px)`;
    runtime.labelEl.textContent = line.label;
  }

  private handlePointerMove(event: MouseEvent): void {
    if (this.dragMode === 'none') {
      return;
    }

    if (this.isCanvasReadOnly() && (this.dragMode === 'node' || this.dragMode === 'selection-box' || this.dragMode === 'resize')) {
      this.finishPointerInteraction();
      return;
    }

    if (this.dragMode === 'select') {
      const viewportLocal = this.resolveViewportLocalPoint(event, true);

      if (viewportLocal === null) {
        return;
      }

      const scenePoint = this.resolveScenePointFromViewportLocal(viewportLocal);
      this.selectionCurrentSceneX = scenePoint.x;
      this.selectionCurrentSceneY = scenePoint.y;
      const previousSelection = this.captureSelectionSnapshot();
      const selectionNodeIds = this.updateBoxSelectionCandidates(previousSelection);
      const selectionChanged = this.hasSelectionStateChanged(previousSelection);

      if (selectionChanged) {
        this.markSceneChanged({
          nodeIds: selectionNodeIds,
          selectionBox: true,
          summary: true,
          inspector: true,
        });
        return;
      }

      this.syncScene({
        nodeIds: selectionNodeIds,
        selectionBox: true,
      });
      return;
    }

    const deltaX = event.clientX - this.dragStartX;
    const deltaY = event.clientY - this.dragStartY;

    if (this.dragMode === 'resize' && this.activeNodeId !== null) {
      const activeResizeNodeBeforeUpdate = this.nodes.find((node) => node.id === this.activeNodeId) ?? null;

      if (activeResizeNodeBeforeUpdate === null || this.resizeDirection === null) {
        return;
      }

      const minWidth = minNodeWidthForType(activeResizeNodeBeforeUpdate.type);
      const minHeight = this.resolveMinimumNodeHeight(activeResizeNodeBeforeUpdate);
      const deltaSceneX = deltaX / this.scale;
      const deltaSceneY = deltaY / this.scale;
      let nextX = this.resizeOriginNodeX;
      let nextY = this.resizeOriginNodeY;
      let nextWidth = this.resizeOriginWidth;
      let nextHeight = this.resizeOriginHeight;

      if (this.resizeDirection.includes('e')) {
        nextWidth = Math.max(minWidth, this.resizeOriginWidth + deltaSceneX);
      }

      if (this.resizeDirection.includes('s')) {
        nextHeight = Math.max(minHeight, this.resizeOriginHeight + deltaSceneY);
      }

      if (this.resizeDirection.includes('w')) {
        const proposedWidth = this.resizeOriginWidth - deltaSceneX;
        nextWidth = Math.max(minWidth, proposedWidth);
        nextX = this.resizeOriginNodeX + (this.resizeOriginWidth - nextWidth);
      }

      if (this.resizeDirection.includes('n')) {
        const proposedHeight = this.resizeOriginHeight - deltaSceneY;
        nextHeight = Math.max(minHeight, proposedHeight);
        nextY = this.resizeOriginNodeY + (this.resizeOriginHeight - nextHeight);
      }

      this.nodes = this.nodes.map((node) => {
        if (node.id !== this.activeNodeId) {
          return node;
        }

        return {
          ...node,
          x: nextX,
          y: nextY,
          width: nextWidth,
          height: nextHeight,
        };
      });
      const activeResizeNode = this.nodes.find((node) => node.id === this.activeNodeId) ?? null;
      const groupIdsToExpand = [
        ...(activeResizeNode?.type === 'group' ? [this.activeNodeId] : []),
        ...this.collectParentGroupIdsForNodes([this.activeNodeId]),
      ];
      const expandedGroupIds = this.expandGroupsToFitMembers(groupIdsToExpand);
      const resizedNodeIds = [...new Set([this.activeNodeId, ...expandedGroupIds])];
      this.markSceneChanged({
        nodeIds: resizedNodeIds,
        lineIds: this.collectLineIdsForNodeIds(resizedNodeIds),
        summary: true,
        inspector: true,
      });
      return;
    }

    if (this.dragMode === 'selection-box') {
      const deltaSceneX = deltaX / this.scale;
      const deltaSceneY = deltaY / this.scale;
      const movedNodeIds = [...this.dragOriginNodePositions.keys()];

      this.nodes = this.nodes.map((node) => {
        const origin = this.dragOriginNodePositions.get(node.id) ?? null;

        if (origin === null) {
          return node;
        }

        return {
          ...node,
          x: origin.x + deltaSceneX,
          y: origin.y + deltaSceneY,
        };
      });
      const expandedGroupIds = this.expandGroupsToFitMembers(this.collectParentGroupIdsForNodes(movedNodeIds));
      const changedNodeIds = [...new Set([...movedNodeIds, ...expandedGroupIds])];
      this.markSceneChanged({
        nodeIds: changedNodeIds,
        lineIds: this.collectLineIdsForNodeIds(changedNodeIds),
        selectionBox: true,
        summary: true,
        inspector: true,
      });
      return;
    }

    if (this.dragMode === 'node' && this.activeNodeId !== null) {
      const deltaSceneX = deltaX / this.scale;
      const deltaSceneY = deltaY / this.scale;
      const movedNodeIds = this.dragOriginNodePositions.size === 0
        ? [this.activeNodeId]
        : [...this.dragOriginNodePositions.keys()];

      this.nodes = this.dragOriginNodePositions.size === 0
        ? updateNodePosition(
          this.nodes,
          this.activeNodeId,
          this.dragOriginNodeX + deltaSceneX,
          this.dragOriginNodeY + deltaSceneY,
        )
        : this.nodes.map((node) => {
          const origin = this.dragOriginNodePositions.get(node.id) ?? null;

          if (origin === null) {
            return node;
          }

          return {
            ...node,
            x: origin.x + deltaSceneX,
            y: origin.y + deltaSceneY,
          };
        });
      const expandedGroupIds = this.expandGroupsToFitMembers(this.collectParentGroupIdsForNodes(movedNodeIds));
      const activeNode = this.nodes.find((node) => node.id === this.activeNodeId) ?? null;
      const previousDropTargetGroupId = this.dropTargetGroupId;
      this.dropTargetGroupId = activeNode === null ? null : this.resolveDropTargetGroupId(activeNode);
      const dropTargetNodeIds = [
        ...(previousDropTargetGroupId === null ? [] : [previousDropTargetGroupId]),
        ...(this.dropTargetGroupId === null ? [] : [this.dropTargetGroupId]),
      ];
      const changedNodeIds = [...new Set([...movedNodeIds, ...expandedGroupIds, ...dropTargetNodeIds])];
      this.markSceneChanged({
        nodeIds: changedNodeIds,
        lineIds: this.collectLineIdsForNodeIds(changedNodeIds),
        summary: true,
        inspector: true,
      });
      return;
    }

    this.offsetX = this.dragOriginOffsetX + deltaX;
    this.offsetY = this.dragOriginOffsetY + deltaY;
    this.markSceneChanged({
      viewport: true,
      selectionBox: true,
      summary: true,
    });
  }

  private finishPointerInteraction(): void {
    const hasActiveInteraction = this.dragMode !== 'none'
      || this.pointerCaptureOwnerEl !== null
      || this.activeNodeId !== null
      || this.dropTargetGroupId !== null;

    if (!hasActiveInteraction) {
      return;
    }

    if (
      this.pointerCaptureOwnerEl !== null
      && this.pointerCaptureOwnerEl.hasPointerCapture(HOST_MOUSE_POINTER_ID)
    ) {
      this.pointerCaptureOwnerEl.releasePointerCapture(HOST_MOUSE_POINTER_ID);
    }

    const finishingActiveNodeId = this.activeNodeId;
    const finishingDropTargetGroupId = this.dropTargetGroupId;
    const wasSelecting = this.dragMode === 'select';

    if (finishingActiveNodeId !== null && this.dragMode === 'node') {
      const activeNode = this.nodes.find((node) => node.id === finishingActiveNodeId) ?? null;

      if (activeNode !== null && activeNode.type !== 'group') {
        this.nodes = this.nodes.map((node) => {
          if (node.id !== finishingActiveNodeId) {
            return node;
          }

          if (finishingDropTargetGroupId === null) {
            return this.createNodeWithoutGroupId(node);
          }

          return {
            ...node,
            groupId: finishingDropTargetGroupId,
          };
        });
      }
    }

    if (finishingActiveNodeId !== null) {
      this.expandGroupsToFitMembers([
        ...(finishingDropTargetGroupId === null ? [] : [finishingDropTargetGroupId]),
        ...this.collectParentGroupIdsForNodes([finishingActiveNodeId]),
      ]);
    }

    if (finishingActiveNodeId !== null) {
      const activeNodeEl = this.nodeRuntimes.get(finishingActiveNodeId)?.nodeEl ?? null;
      const activeNode = this.nodes.find((node) => node.id === finishingActiveNodeId) ?? null;

      if (activeNodeEl !== null) {
        activeNodeEl.style.cursor = this.resolveNodeCursor(
          this.selectedNodeIds.includes(finishingActiveNodeId),
          this.inlineEditingNodeId === finishingActiveNodeId,
          this.isCanvasReadOnly(),
        );
        if (activeNode !== null) {
          activeNodeEl.style.zIndex = resolveNodeZIndex(
            activeNode,
            this.selectedNodeIds.includes(finishingActiveNodeId),
            false,
          );
        }
      }
    }

    this.dragMode = 'none';
    this.activeNodeId = null;
    this.dragOriginNodePositions = new Map();
    this.resizeDirection = null;
    this.pointerCaptureOwnerEl = null;
    this.dropTargetGroupId = null;

    if (wasSelecting) {
      this.persistentSelectionBoxActive = this.selectedNodeIds.length > 0;
    }

    this.syncViewportCursor();

    this.syncScene({
      syncStructure: true,
      selectionBox: true,
    });
  }

  private syncInspectorPanel(): void {
    const selectedNode = this.resolveSelectedNode();
    const selectedNodes = this.resolveSelectedNodes();
    const isSingleSelection = selectedNodes.length === 1 && selectedNode !== null;
    const isGroupSelection = isSingleSelection && selectedNode.type === 'group';
    const isUrlSelection = isSingleSelection && selectedNode.type === 'url';
    const isReadOnly = this.isCanvasReadOnly();

    if (this.selectedMetaEl !== null) {
      if (isReadOnly) {
        this.selectedMetaEl.textContent = `当前白板处于只读恢复模式：${this.recoveryErrorMessage ?? '请先修复文件后重新加载。'}`;
      } else if (selectedNodes.length === 0) {
        this.selectedMetaEl.textContent = '当前没有选中节点。请先点击白板里的任意节点。';
      } else if (!isSingleSelection) {
        this.selectedMetaEl.textContent = `???????????? ${selectedNodes.length} ???????????????????????????????????`;
      } else {
        const relatedLines = this.lines.filter((line) => line.from === selectedNode!.id || line.to === selectedNode!.id).length;
        const referenceText = this.resolveNodeReferenceText(selectedNode!);
        this.selectedMetaEl.textContent = `类型：${getNodeTypeLabel(selectedNode!.type)} | 节点：${selectedNode!.title} | 坐标：(${Math.round(selectedNode!.x)}, ${Math.round(selectedNode!.y)}) | 关联连线：${relatedLines}${referenceText === null ? '' : ` | ${referenceText}`}`;
      }
    }

    if (this.titleInputEl !== null) {
      this.titleInputEl.disabled = isReadOnly || !isSingleSelection;
      const nextValue = isSingleSelection ? selectedNode.title : '';

      if (this.titleInputEl.value !== nextValue) {
        this.titleInputEl.value = nextValue;
      }
    }

    if (this.urlLabelEl !== null) {
      this.urlLabelEl.style.display = isUrlSelection ? 'flex' : 'none';
    }

    if (this.urlInputEl !== null) {
      this.urlInputEl.disabled = isReadOnly || !isUrlSelection;
      const nextValue = isUrlSelection ? selectedNode.url ?? '' : '';

      if (this.urlInputEl.value !== nextValue) {
        this.urlInputEl.value = nextValue;
      }
    }

    if (this.bodyLabelEl !== null) {
      this.bodyLabelEl.style.display = isGroupSelection || isUrlSelection ? 'none' : 'flex';
    }

    if (this.bodyInputEl !== null) {
      this.bodyInputEl.disabled = isReadOnly || !isSingleSelection || isGroupSelection || isUrlSelection;
      const nextValue = isSingleSelection && !isGroupSelection && !isUrlSelection ? selectedNode.body : '';

      if (this.bodyInputEl.value !== nextValue) {
        this.bodyInputEl.value = nextValue;
      }
    }
  }

  private syncFilePanel(refreshLists = false): void {
    if (this.fileMetaEl === null) {
      return;
    }

    const lines = [
      `白板文件：${this.canvasFilePath}`,
      `文件状态：${this.sceneFileExists ? '已存在' : '未创建'}`,
      `自动保存：${this.describeAutoSaveState()}`,
      `保护状态：${this.isCanvasReadOnly() ? '只读恢复' : '可编辑'}`,
      `最近保存：${this.lastSavedAt ?? '无'}`,
      `最近加载：${this.lastLoadedAt ?? '无'}`,
      `恢复错误：${this.recoveryErrorMessage ?? '无'}`,
      `自动保存错误：${this.autoSaveErrorMessage ?? '无'}`,
      `当前说明：${this.sceneFileMessage}`,
    ];

    this.fileMetaEl.textContent = lines.join('\n');
    this.fileMetaEl.style.whiteSpace = 'pre-wrap';

    if (!refreshLists) {
      return;
    }

    this.syncRecentFilesPanel();
    this.syncAllFilesPanel();
  }

  private syncRecoveryPanel(): void {
    if (
      this.recoveryPanelEl === null
      || this.recoveryTitleEl === null
      || this.recoveryMessageEl === null
      || this.recoveryToggleRawEl === null
      || this.recoveryRawTextEl === null
    ) {
      return;
    }

    if (this.recoveryMode === 'normal') {
      this.recoveryPanelEl.style.display = 'none';
      this.recoveryRawTextEl.style.display = 'none';
      return;
    }

    const hasRawContent = this.recoveryRawContent !== null && this.recoveryRawContent.length > 0;
    this.recoveryPanelEl.style.display = 'flex';
    this.recoveryTitleEl.textContent = this.recoveryMode === 'invalid'
      ? '白板文件恢复失败，已进入只读恢复模式'
      : '白板已进入只读保护模式';
    this.recoveryMessageEl.textContent = [
      this.recoveryErrorMessage ?? '未提供具体错误。',
      '当前视图不会覆盖原始 .canvas 文件。你可以先修复文件后点击“重新加载白板文件”，也可以查看原始文本做人工恢复。',
    ].join('\n');
    this.recoveryMessageEl.style.whiteSpace = 'pre-wrap';
    this.recoveryToggleRawEl.style.display = hasRawContent ? 'inline-flex' : 'none';
    this.recoveryToggleRawEl.textContent = this.recoveryTextVisible ? '隐藏原始文本' : '查看原始文本';
    this.recoveryRawTextEl.textContent = hasRawContent ? this.recoveryRawContent : '';
    this.recoveryRawTextEl.style.display = hasRawContent && this.recoveryTextVisible ? 'block' : 'none';
  }

  private describeAutoSaveState(): string {
    if (this.isCanvasReadOnly()) {
      return '只读保护中';
    }

    switch (this.autoSaveState) {
      case 'pending':
        return '待自动保存';
      case 'saving':
        return '正在保存';
      case 'saved':
        return '已保存';
      case 'error':
        return '保存失败';
      default:
        return '就绪';
    }
  }

  private syncRecentFilesPanel(): void {
    if (this.recentFilesEl === null) {
      return;
    }

    this.recentFilesEl.replaceChildren();
    const recentFiles = this.listRecentCanvasFiles();

    if (recentFiles.length === 0) {
      const emptyEl = document.createElement('div');
      emptyEl.textContent = '暂无最近打开白板。';
      emptyEl.style.opacity = '0.68';
      this.recentFilesEl.append(emptyEl);
      return;
    }

    for (const file of recentFiles) {
      this.recentFilesEl.append(this.createSceneFileEntry(file, '打开最近白板'));
    }
  }

  private syncAllFilesPanel(): void {
    if (this.allFilesEl === null) {
      return;
    }

    this.allFilesEl.replaceChildren();
    const sceneFiles = this.listCanvasFiles();

    if (sceneFiles.length === 0) {
      const emptyEl = document.createElement('div');
      emptyEl.textContent = '当前目录还没有白板文件。';
      emptyEl.style.opacity = '0.68';
      this.allFilesEl.append(emptyEl);
      return;
    }

    for (const file of sceneFiles) {
      this.allFilesEl.append(this.createSceneFileEntry(file, '从文件列表打开'));
    }
  }

  private createSceneFileEntry(file: TFile, source: string): HTMLElement {
    const entryEl = document.createElement('div');
    entryEl.setAttribute('role', 'button');
    entryEl.tabIndex = 0;
    entryEl.style.display = 'flex';
    entryEl.style.flexDirection = 'column';
    entryEl.style.gap = '2px';
    entryEl.style.padding = '8px 10px';
    entryEl.style.borderRadius = '10px';
    entryEl.style.border = '1px solid rgba(255,255,255,0.1)';
    entryEl.style.background = file.path === this.canvasFilePath ? 'rgba(14,165,233,0.12)' : 'rgba(255,255,255,0.04)';
    entryEl.style.cursor = 'pointer';

    const nameEl = document.createElement('div');
    nameEl.textContent = file.basename;
    nameEl.style.fontWeight = '600';
    entryEl.append(nameEl);

    const metaEl = document.createElement('div');
    metaEl.textContent = `${file.path} | 更新于 ${formatTimestamp(new Date(file.stat.mtime))}`;
    metaEl.style.opacity = '0.72';
    metaEl.style.fontSize = '12px';
    metaEl.style.lineHeight = '1.5';
    metaEl.style.whiteSpace = 'pre-wrap';
    entryEl.append(metaEl);

    this.registerDomEvent(entryEl, 'click', () => {
      void this.openSpecificSceneFile(file, source);
    });
    this.registerDomEvent(entryEl, 'keydown', (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== ' ') {
        return;
      }

      event.preventDefault();
      void this.openSpecificSceneFile(file, source);
    });

    return entryEl;
  }

  private syncScene(options?: SceneRenderOptions): void {
    if (
      this.sceneEl === null
      || this.summaryEl === null
      || this.scaleEl === null
      || this.sourceEl === null
    ) {
      return;
    }

    const syncAll = options === undefined;
    const shouldSyncStructure = syncAll || options?.syncStructure === true;

    if (shouldSyncStructure) {
      this.syncNodeDom();
      this.syncLineDom();
    }

    if (syncAll || options?.viewport === true) {
      this.sceneEl.style.transform = `translate(${this.offsetX}px, ${this.offsetY}px) scale(${this.scale})`;
    }

    this.updateSelectionBoxFromSceneBounds();

    if (syncAll || options?.boxSelectionChip === true) {
      if (this.boxSelectionChipEl !== null) {
        this.boxSelectionChipEl.textContent = this.boxSelectionEnabled ? '框选：开' : '框选：关';
      }
    }

    const nodeIdsToSync = shouldSyncStructure
      ? this.nodes.map((node) => node.id)
      : [...new Set(options?.nodeIds ?? [])];

    for (const nodeId of nodeIdsToSync) {
      this.syncNodeRuntime(nodeId);
    }

    const lineIdsToSync = shouldSyncStructure
      ? this.lines.map((line) => line.id)
      : [...new Set(options?.lineIds ?? [])];

    for (const lineId of lineIdsToSync) {
      this.syncLineRuntime(lineId);
    }

    if (syncAll || options?.scale === true) {
      this.scaleEl.textContent = `缩放：${Math.round(this.scale * 100)}%`;
    }

    if (syncAll || options?.source === true) {
      this.sourceEl.textContent = `来源：${this.source}`;
    }

    if (syncAll || options?.recovery === true) {
      this.syncRecoveryPanel();
    }

    if (syncAll || options?.summary === true) {
      const recoveryText = this.isCanvasReadOnly() ? ' | 只读恢复' : '';
      this.summaryEl.textContent = `节点 ${this.nodes.length} | 连线 ${this.lines.length} | 当前选中 ${this.resolveSelectedNode()?.title ?? '无'}${recoveryText}`;
    }

    if (syncAll || options?.inspector === true) {
      this.syncInspectorPanel();
    }

    if (syncAll || options?.file === true) {
      this.syncFilePanel(syncAll || options?.refreshFileLists === true);
    }
  }
}

export default class FakeCanvasHostPlugin extends Plugin {
  private resolveActiveCanvasView(): FakeCanvasView | null {
    const activeView = this.app.workspace.getActiveViewOfType(FakeCanvasView);

    if (activeView instanceof FakeCanvasView) {
      return activeView;
    }

    const fallbackView = this.app.workspace.getLeavesOfType(DEMO_VIEW_TYPE)[0]?.view;
    return fallbackView instanceof FakeCanvasView ? fallbackView : null;
  }

  private runActiveCanvasAction(action: (view: FakeCanvasView) => void): void {
    const view = this.resolveActiveCanvasView();

    if (view === null) {
      new Notice('假白板演示：当前还没有打开白板视图。');
      return;
    }

    action(view);
  }

  public onload(): void {
    this.registerView(DEMO_VIEW_TYPE, (leaf) => new FakeCanvasView(leaf));
    this.registerExtensions([...CANVAS_FILE_EXTENSIONS], DEMO_VIEW_TYPE);

    this.addRibbonIcon('layout-dashboard', DEMO_TITLE, () => {
      void this.openDemoView('活动栏入口');
    }, { location: 'activityBar' });

    const canvasUiScope = {
      viewType: DEMO_VIEW_TYPE,
      fileExtensions: [...CANVAS_FILE_EXTENSIONS],
    } as const;

    this.addRibbonIcon('plus', '白板工具栏：新增卡片', () => {
      this.runActiveCanvasAction((view) => view.addStandaloneNode());
    }, { location: 'canvasToolbar', scope: canvasUiScope });

    this.addRibbonIcon('link-2', '白板工具栏：新增连接卡片', () => {
      this.runActiveCanvasAction((view) => view.addConnectedNode());
    }, { location: 'canvasToolbar', scope: canvasUiScope });

    this.addRibbonIcon('file-text', '白板工具栏：新增笔记节点', () => {
      this.runActiveCanvasAction((view) => view.addStandaloneNode(undefined, 'note'));
    }, { location: 'canvasToolbar', scope: canvasUiScope });

    this.addRibbonIcon('file', '白板工具栏：新增文件节点', () => {
      this.runActiveCanvasAction((view) => view.addStandaloneNode(undefined, 'file'));
    }, { location: 'canvasToolbar', scope: canvasUiScope });

    this.addRibbonIcon('network', '白板工具栏：新增 URL 节点', () => {
      this.runActiveCanvasAction((view) => view.addStandaloneNode(undefined, 'url'));
    }, { location: 'canvasToolbar', scope: canvasUiScope });

    this.addRibbonIcon('delete', '白板工具栏：删除选中卡片', () => {
      this.runActiveCanvasAction((view) => view.removeSelectedNode());
    }, { location: 'canvasToolbar', scope: canvasUiScope });

    this.addRibbonIcon('save-all', '白板标题栏：保存白板文件', () => {
      this.runActiveCanvasAction((view) => {
        void view.saveSceneFile();
      });
    }, { location: 'canvasTitleBar', scope: canvasUiScope });

    this.addRibbonIcon('import', '白板标题栏：打开白板文件', () => {
      this.runActiveCanvasAction((view) => {
        void view.openSceneFile();
      });
    }, { location: 'canvasTitleBar', scope: canvasUiScope });

    this.addRibbonIcon('plus', '白板右键菜单：新增卡片', () => {
      this.runActiveCanvasAction((view) => view.addStandaloneNode());
    }, { location: 'canvasContextMenu', scope: canvasUiScope });

    this.addRibbonIcon('link-2', '白板右键菜单：新增连接卡片', () => {
      this.runActiveCanvasAction((view) => view.addConnectedNode());
    }, { location: 'canvasContextMenu', scope: canvasUiScope });

    this.addRibbonIcon('file-text', '白板右键菜单：新增笔记节点', () => {
      this.runActiveCanvasAction((view) => view.addStandaloneNode(undefined, 'note'));
    }, { location: 'canvasContextMenu', scope: canvasUiScope });

    this.addRibbonIcon('delete', '白板右键菜单：删除选中卡片', () => {
      this.runActiveCanvasAction((view) => view.removeSelectedNode());
    }, { location: 'canvasContextMenu', scope: canvasUiScope });

    this.addRibbonIcon('save-all', '白板右键菜单：保存白板文件', () => {
      this.runActiveCanvasAction((view) => {
        void view.saveSceneFile();
      });
    }, { location: 'canvasContextMenu', scope: canvasUiScope });

    this.addRibbonIcon('layout-dashboard', '白板状态栏入口：打开 demo 白板', () => {
      void this.openDemoView('状态栏白板入口');
    }, { location: 'statusBar' });

    this.addCommand({
      id: OPEN_DEMO_COMMAND_ID,
      name: '假白板演示：打开最小画布',
      category: CANVAS_COMMAND_CATEGORY,
      callback: () => {
        void this.openDemoView('命令中心');
      },
    });

    this.addCommand({
      id: CREATE_NEW_SCENE_FILE_COMMAND_ID,
      name: '假白板演示：新建白板文件',
      category: CANVAS_COMMAND_CATEGORY,
      callback: () => {
        void this.createAndOpenNewCanvasFile('命令中心新建白板文件');
      },
    });
 
    this.addCommand({
      id: RESET_SCENE_COMMAND_ID,
      name: '假白板演示：重置当前画布',
      category: CANVAS_COMMAND_CATEGORY,
      callback: () => {
        const view = this.app.workspace.getLeavesOfType(DEMO_VIEW_TYPE)[0]?.view;

        if (!(view instanceof FakeCanvasView)) {
          new Notice('假白板演示：当前还没有打开白板视图。');
          return;
        }

        view.resetScene();
      },
    });

    this.addCommand({
      id: ADD_NODE_COMMAND_ID,
      name: '假白板演示：新增独立卡片',
      category: CANVAS_COMMAND_CATEGORY,
      callback: () => {
        const view = this.app.workspace.getLeavesOfType(DEMO_VIEW_TYPE)[0]?.view;

        if (!(view instanceof FakeCanvasView)) {
          new Notice('假白板演示：当前还没有打开白板视图。');
          return;
        }

        view.addStandaloneNode();
      },
    });

    this.addCommand({
      id: ADD_CONNECTED_NODE_COMMAND_ID,
      name: '假白板演示：新增连接卡片',
      category: CANVAS_COMMAND_CATEGORY,
      callback: () => {
        const view = this.app.workspace.getLeavesOfType(DEMO_VIEW_TYPE)[0]?.view;

        if (!(view instanceof FakeCanvasView)) {
          new Notice('假白板演示：当前还没有打开白板视图。');
          return;
        }

        view.addConnectedNode();
      },
    });

    this.addCommand({
      id: ADD_NOTE_NODE_COMMAND_ID,
      name: '假白板演示：新增笔记节点',
      category: CANVAS_COMMAND_CATEGORY,
      callback: () => {
        const view = this.app.workspace.getLeavesOfType(DEMO_VIEW_TYPE)[0]?.view;

        if (!(view instanceof FakeCanvasView)) {
          new Notice('假白板演示：当前还没有打开白板视图。');
          return;
        }

        view.addStandaloneNode(undefined, 'note');
      },
    });

    this.addCommand({
      id: ADD_FILE_NODE_COMMAND_ID,
      name: '假白板演示：新增文件节点',
      category: CANVAS_COMMAND_CATEGORY,
      callback: () => {
        const view = this.app.workspace.getLeavesOfType(DEMO_VIEW_TYPE)[0]?.view;

        if (!(view instanceof FakeCanvasView)) {
          new Notice('假白板演示：当前还没有打开白板视图。');
          return;
        }

        view.addStandaloneNode(undefined, 'file');
      },
    });

    this.addCommand({
      id: ADD_URL_NODE_COMMAND_ID,
      name: '假白板演示：新增 URL 节点',
      category: CANVAS_COMMAND_CATEGORY,
      callback: () => {
        const view = this.app.workspace.getLeavesOfType(DEMO_VIEW_TYPE)[0]?.view;

        if (!(view instanceof FakeCanvasView)) {
          new Notice('假白板演示：当前还没有打开白板视图。');
          return;
        }

        view.addStandaloneNode(undefined, 'url');
      },
    });

    this.addCommand({
      id: ADD_GROUP_NODE_COMMAND_ID,
      name: '假白板演示：新增分组节点',
      category: CANVAS_COMMAND_CATEGORY,
      callback: () => {
        const view = this.app.workspace.getLeavesOfType(DEMO_VIEW_TYPE)[0]?.view;

        if (!(view instanceof FakeCanvasView)) {
          new Notice('假白板演示：当前还没有打开白板视图。');
          return;
        }

        view.addStandaloneNode(undefined, 'group');
      },
    });

    this.addCommand({
      id: REMOVE_SELECTED_NODE_COMMAND_ID,
      name: '假白板演示：删除选中卡片',
      category: CANVAS_COMMAND_CATEGORY,
      callback: () => {
        const view = this.app.workspace.getLeavesOfType(DEMO_VIEW_TYPE)[0]?.view;

        if (!(view instanceof FakeCanvasView)) {
          new Notice('假白板演示：当前还没有打开白板视图。');
          return;
        }

        view.removeSelectedNode();
      },
    });

    this.addCommand({
      id: REMOVE_SELECTED_LINES_COMMAND_ID,
      name: '假白板演示：删除选中节点连线',
      category: CANVAS_COMMAND_CATEGORY,
      callback: () => {
        const view = this.app.workspace.getLeavesOfType(DEMO_VIEW_TYPE)[0]?.view;

        if (!(view instanceof FakeCanvasView)) {
          new Notice('假白板演示：当前还没有打开白板视图。');
          return;
        }

        view.removeSelectedNodeLines();
      },
    });

    this.addCommand({
      id: SAVE_SCENE_COMMAND_ID,
      name: '假白板演示：保存白板文件',
      category: CANVAS_COMMAND_CATEGORY,
      callback: () => {
        const view = this.app.workspace.getLeavesOfType(DEMO_VIEW_TYPE)[0]?.view;

        if (!(view instanceof FakeCanvasView)) {
          new Notice('假白板演示：当前还没有打开白板视图。');
          return;
        }

        void view.saveSceneFile();
      },
    });

    this.addCommand({
      id: LOAD_SCENE_COMMAND_ID,
      name: '假白板演示：从白板文件加载',
      category: CANVAS_COMMAND_CATEGORY,
      callback: () => {
        const view = this.app.workspace.getLeavesOfType(DEMO_VIEW_TYPE)[0]?.view;

        if (!(view instanceof FakeCanvasView)) {
          new Notice('假白板演示：当前还没有打开白板视图。');
          return;
        }

        void view.loadSceneFile();
      },
    });

    this.addCommand({
      id: OPEN_SCENE_FILE_COMMAND_ID,
      name: '假白板演示：打开白板文件',
      category: CANVAS_COMMAND_CATEGORY,
      callback: () => {
        const view = this.app.workspace.getLeavesOfType(DEMO_VIEW_TYPE)[0]?.view;

        if (!(view instanceof FakeCanvasView)) {
          new Notice('假白板演示：当前还没有打开白板视图。');
          return;
        }

        void view.openSceneFile();
      },
    });
  }

  public onEnable(): void {
    return undefined;
  }

  public onDisable(): void {
    this.app.workspace.detachLeavesOfType(DEMO_VIEW_TYPE);
  }

  public onunload(): void {
    this.app.workspace.detachLeavesOfType(DEMO_VIEW_TYPE);
  }

  public onFailed(failure: PluginFailureContext): void {
    new Notice(`假白板演示：插件加载失败：${failure.error.message}`);
  }

  private async ensureDemoCanvasFile(): Promise<TFile> {
    const existingFile = this.app.vault.getFileByPath(SCENE_FILE_PATH);

    if (existingFile !== null) {
      return existingFile;
    }

    const segments = SCENE_FOLDER_PATH
      .split('/')
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 0);
    let current = '';

    for (const segment of segments) {
      current = current.length === 0 ? segment : `${current}/${segment}`;

      if (this.app.vault.getFolderByPath(current) !== null) {
        continue;
      }

      await this.app.vault.createFolder(current);
    }

    const initialPayload = serializeSceneForFile(
      createInitialViewState('白板文件首次创建'),
      SCENE_FILE_PATH,
      null,
    );
    return this.app.vault.create(SCENE_FILE_PATH, initialPayload);
  }

  private async createUniqueCanvasFilePath(): Promise<string> {
    const segments = SCENE_FOLDER_PATH
      .split('/')
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 0);
    let current = '';

    for (const segment of segments) {
      current = current.length === 0 ? segment : `${current}/${segment}`;

      if (this.app.vault.getFolderByPath(current) !== null) {
        continue;
      }

      await this.app.vault.createFolder(current);
    }

    const now = new Date();
    const stamp = `${now.getFullYear()}${padDatePart(now.getMonth() + 1)}${padDatePart(now.getDate())}-${padDatePart(now.getHours())}${padDatePart(now.getMinutes())}${padDatePart(now.getSeconds())}`;
    let suffixIndex = 0;

    while (true) {
      const suffix = suffixIndex === 0 ? '' : `-${suffixIndex + 1}`;
      const candidate = `${SCENE_FOLDER_PATH}/whiteboard-${stamp}${suffix}.canvas`;

      if (this.app.vault.getFileByPath(candidate) === null) {
        return candidate;
      }

      suffixIndex += 1;
    }
  }

  private async createAndOpenNewCanvasFile(source: string): Promise<void> {
    const filePath = await this.createUniqueCanvasFilePath();
    const payload = serializeSceneForFile(createInitialViewState(source), filePath, null);
    const file = await this.app.vault.create(filePath, payload);
    const leaf = this.app.workspace.getLeaf(true);

    await leaf.openFile(file, {
      active: true,
      state: {
        source,
      },
    });
    await this.app.workspace.revealLeaf(leaf);
  }

  private async openDemoView(source: string): Promise<void> {
    const file = await this.ensureDemoCanvasFile();
    const existingLeaf = this.app.workspace.getLeavesOfType(DEMO_VIEW_TYPE)[0] ?? null;

    if (existingLeaf !== null) {
      await existingLeaf.openFile(file, {
        active: true,
        state: {
          source,
        },
      });
      await this.app.workspace.revealLeaf(existingLeaf);
      return;
    }

    const leaf = this.app.workspace.getLeaf(true);
    await leaf.openFile(file, {
      active: true,
      state: {
        source,
      },
    });
    await this.app.workspace.revealLeaf(leaf);
  }
}
