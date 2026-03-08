/**
 * graphStore.ts
 * 知识图谱状态管理
 * 功能：使用 Zustand 管理知识图谱的全局 UI 状态
 */

import { create } from 'zustand';
import { NoteItem, LinkItem } from '../types/electron';

/**
 * 图谱节点
 */
export interface GraphNode {
  id: string;
  title: string;
  type: 'daily' | 'quick' | 'normal';
  tags: string[];
  linkCount: number;
  x?: number;
  y?: number;
}

/**
 * 图谱边
 */
export interface GraphEdge {
  id: string;
  source: string;
  target: string;
}

/**
 * 视图模式
 */
export type ViewMode = 'global' | 'local';

interface GraphState {
  /** 图谱节点 */
  nodes: GraphNode[];
  /** 图谱边 */
  edges: GraphEdge[];
  /** 选中的节点 */
  selectedNode: GraphNode | null;
  /** 悬停的节点 */
  hoveredNode: GraphNode | null;
  /** 视图模式 */
  viewMode: ViewMode;
  /** 筛选的标签 */
  filterTags: string[];
  /** 当前笔记 ID（局部视图用） */
  currentNoteId: string | null;
  /** 是否正在加载 */
  isLoading: boolean;
  /** 错误信息 */
  error: string | null;

  // Actions
  /** 设置节点 */
  setNodes: (nodes: GraphNode[]) => void;
  /** 设置边 */
  setEdges: (edges: GraphEdge[]) => void;
  /** 设置选中的节点 */
  setSelectedNode: (node: GraphNode | null) => void;
  /** 设置悬停的节点 */
  setHoveredNode: (node: GraphNode | null) => void;
  /** 设置视图模式 */
  setViewMode: (mode: ViewMode) => void;
  /** 设置筛选标签 */
  setFilterTags: (tags: string[]) => void;
  /** 设置当前笔记 ID */
  setCurrentNoteId: (id: string | null) => void;
  /** 设置加载状态 */
  setLoading: (loading: boolean) => void;
  /** 设置错误信息 */
  setError: (error: string | null) => void;
  /** 更新节点位置 */
  updateNodePosition: (id: string, x: number, y: number) => void;
  /** 清空状态 */
  reset: () => void;

  // Async Actions
  /** 加载全局图谱 */
  loadGraph: () => Promise<void>;
  /** 加载局部图谱 */
  loadLocalGraph: (noteId: string) => Promise<void>;
  /** 选择节点 */
  selectNode: (node: GraphNode | null) => void;
}

/**
 * 从笔记和链接构建图谱数据
 */
function buildGraphData(
  notes: NoteItem[],
  links: LinkItem[],
  filterTags: string[] = []
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  // 过滤笔记
  let filteredNotes = notes;
  if (filterTags.length > 0) {
    // 这里需要根据标签过滤，但笔记数据中没有标签信息
    // 实际实现时需要从标签关联表获取
    filteredNotes = notes;
  }

  // 构建节点
  const nodeMap = new Map<string, GraphNode>();
  for (const note of filteredNotes) {
    nodeMap.set(note.id, {
      id: note.id,
      title: note.title,
      type: note.type,
      tags: [], // 需要从标签关联获取
      linkCount: 0
    });
  }

  // 构建边并计算链接数
  const edges: GraphEdge[] = [];
  const edgeKeys = new Set<string>();
  for (const link of links) {
    if (link.targetId && nodeMap.has(link.sourceId) && nodeMap.has(link.targetId)) {
      const edgeKey = `${link.sourceId}:${link.targetId}`;
      if (edgeKeys.has(edgeKey)) {
        continue;
      }
      edgeKeys.add(edgeKey);
      edges.push({
        id: link.id,
        source: link.sourceId,
        target: link.targetId
      });

      // 更新链接数
      const sourceNode = nodeMap.get(link.sourceId);
      const targetNode = nodeMap.get(link.targetId);
      if (sourceNode) sourceNode.linkCount++;
      if (targetNode) targetNode.linkCount++;
    }
  }

  return {
    nodes: Array.from(nodeMap.values()),
    edges
  };
}

/**
 * 构建局部图谱（一度关系）
 */
function buildLocalGraphData(
  noteId: string,
  notes: NoteItem[],
  links: LinkItem[]
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  // 找到相关的笔记 ID
  const relatedNoteIds = new Set<string>([noteId]);

  for (const link of links) {
    if (link.sourceId === noteId && link.targetId) {
      relatedNoteIds.add(link.targetId);
    }
    if (link.targetId === noteId) {
      relatedNoteIds.add(link.sourceId);
    }
  }

  // 过滤笔记
  const filteredNotes = notes.filter(note => relatedNoteIds.has(note.id));

  // 过滤链接
  const filteredLinks = links.filter(
    link =>
      relatedNoteIds.has(link.sourceId) &&
      link.targetId &&
      relatedNoteIds.has(link.targetId)
  );

  return buildGraphData(filteredNotes, filteredLinks);
}

export const useGraphStore = create<GraphState>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNode: null,
  hoveredNode: null,
  viewMode: 'global',
  filterTags: [],
  currentNoteId: null,
  isLoading: false,
  error: null,

  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),
  setSelectedNode: (node) => set({ selectedNode: node }),
  setHoveredNode: (node) => set({ hoveredNode: node }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setFilterTags: (tags) => set({ filterTags: tags }),
  setCurrentNoteId: (id) => set({ currentNoteId: id }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),

  updateNodePosition: (id, x, y) => {
    const { nodes } = get();
    const updatedNodes = nodes.map(node =>
      node.id === id ? { ...node, x, y } : node
    );
    set({ nodes: updatedNodes });
  },

  reset: () => set({
    nodes: [],
    edges: [],
    selectedNode: null,
    hoveredNode: null,
    viewMode: 'global',
    filterTags: [],
    currentNoteId: null,
    isLoading: false,
    error: null
  }),

  // Async Actions
  loadGraph: async () => {
    set({ isLoading: true, error: null });
    try {
      const [notes, links] = await Promise.all([
        window.electron?.ipcRenderer.invoke('note:getAll'),
        window.electron?.ipcRenderer.invoke('link:getAllLinks')
      ]);

      const { filterTags } = get();
      const { nodes, edges } = buildGraphData(
        notes || [],
        links || [],
        filterTags
      );

      set({ nodes, edges, isLoading: false });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '加载图谱失败';
      set({ error: errorMessage, isLoading: false });
      console.error('[graphStore] 加载图谱失败:', error);
    }
  },

  loadLocalGraph: async (noteId) => {
    set({ isLoading: true, error: null, currentNoteId: noteId, viewMode: 'local' });
    try {
      const [notes, links] = await Promise.all([
        window.electron?.ipcRenderer.invoke('note:getAll'),
        window.electron?.ipcRenderer.invoke('link:getAllLinks')
      ]);

      const { nodes, edges } = buildLocalGraphData(
        noteId,
        notes || [],
        links || []
      );

      set({ nodes, edges, isLoading: false });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '加载局部图谱失败';
      set({ error: errorMessage, isLoading: false });
      console.error('[graphStore] 加载局部图谱失败:', error);
    }
  },

  selectNode: (node) => {
    set({ selectedNode: node });
  }
}));
