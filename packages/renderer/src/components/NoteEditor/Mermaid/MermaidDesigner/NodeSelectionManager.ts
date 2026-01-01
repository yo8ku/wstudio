/**
 * 节点选择和调整大小管理器
 * 功能：管理Mermaid流程图中节点的选择、调整大小等交互操作
 * 描述：提供节点选中状态管理、调整手柄显示、拖拽调整大小等功能
 */

export interface NodeInfo {
  id: string;
  element: SVGGElement;
  shape: SVGGraphicsElement | null;
  x: number;
  y: number;
  width: number;
  height: number;
  // 原始形状属性值
  originalShapeAttrs: Record<string, string>;
}

export interface ResizeHandle {
  position: 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
  cursor: string;
  x: number;
  y: number;
}

type ResizeCallback = (nodeId: string) => void;
type ResizeStartCallback = (nodeId: string) => void;
type SelectCallback = (nodeId: string | null) => void;
type DragCallback = (nodeId: string) => void;

export class NodeSelectionManager {
  private container: HTMLDivElement | null = null;
  private selectedNode: NodeInfo | null = null;
  private selectionOverlay: SVGGElement | null = null;
  private resizeHandles: SVGRectElement[] = [];
  private isResizing = false;
  private resizeStartPos = { x: 0, y: 0 };
  private resizeStartSize = { width: 0, height: 0 };
  private activeHandle: ResizeHandle | null = null;
  private onResize: ResizeCallback | null = null;
  private onResizeStart: ResizeStartCallback | null = null;
  private onSelect: SelectCallback | null = null;
  private onDragStart: DragCallback | null = null;
  private onDragEnd: DragCallback | null = null;
  private containerClickHandler: ((e: MouseEvent) => void) | null = null;
  
  // 拖动相关
  private isDragging = false;
  private dragStartPos = { x: 0, y: 0 };
  private dragStartNodeTransform = { x: 0, y: 0 };
  private pendingSelectNode: SVGGElement | null = null;

  private handleSize = 8;
  private handlePositions: ResizeHandle[] = [
    { position: 'nw', cursor: 'nwse-resize', x: 0, y: 0 },
    { position: 'n', cursor: 'ns-resize', x: 0.5, y: 0 },
    { position: 'ne', cursor: 'nesw-resize', x: 1, y: 0 },
    { position: 'e', cursor: 'ew-resize', x: 1, y: 0.5 },
    { position: 'se', cursor: 'nwse-resize', x: 1, y: 1 },
    { position: 's', cursor: 'ns-resize', x: 0.5, y: 1 },
    { position: 'sw', cursor: 'nesw-resize', x: 0, y: 1 },
    { position: 'w', cursor: 'ew-resize', x: 0, y: 0.5 },
  ];

  constructor() {
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleMouseUp = this.handleMouseUp.bind(this);
    this.handleNodeDragMove = this.handleNodeDragMove.bind(this);
    this.handleNodeDragEnd = this.handleNodeDragEnd.bind(this);
  }

  init(
    container: HTMLDivElement,
    onResize?: ResizeCallback,
    onSelect?: SelectCallback,
    onResizeStart?: ResizeStartCallback,
    onDragStart?: DragCallback,
    onDragEnd?: DragCallback
  ): void {
    this.container = container;
    this.onResize = onResize || null;
    this.onSelect = onSelect || null;
    this.onResizeStart = onResizeStart || null;
    this.onDragStart = onDragStart || null;
    this.onDragEnd = onDragEnd || null;
    this.setupNodeClickListeners();
    this.initSvgStyle();
  }

  private initSvgStyle(): void {
    if (!this.container) return;
    
    const svg = this.container.querySelector('svg');
    if (!svg) return;
    
    const svgElement = svg as SVGSVGElement;
    svgElement.style.overflow = 'visible';
    svgElement.style.width = '100%';
    svgElement.style.height = '100%';
  }

  destroy(): void {
    this.clearSelection();
    // 移除容器点击事件监听器
    if (this.container && this.containerClickHandler) {
      this.container.removeEventListener('click', this.containerClickHandler);
    }
    this.container = null;
    this.onResize = null;
    this.onSelect = null;
    this.containerClickHandler = null;
    window.removeEventListener('mousemove', this.handleMouseMove);
    window.removeEventListener('mouseup', this.handleMouseUp);
  }

  private setupNodeClickListeners(): void {
    if (!this.container) return;

    const nodes = this.container.querySelectorAll('.node');
    nodes.forEach((node) => {
      (node as SVGGElement).style.cursor = 'pointer';
      node.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        this.startNodeDrag(e as MouseEvent, node as SVGGElement);
      });
    });

    // 点击空白处取消选择（只添加一次）
    if (!this.containerClickHandler) {
      this.containerClickHandler = (e: MouseEvent) => {
        if ((e.target as Element).closest('.node') === null) {
          this.clearSelection();
        }
      };
      this.container.addEventListener('click', this.containerClickHandler);
    }
  }

  refreshListeners(): void {
    this.setupNodeClickListeners();
  }

  private selectNode(nodeElement: SVGGElement): void {
    this.clearSelection();

    const nodeId = nodeElement.id || nodeElement.getAttribute('data-id') || '';
    const shape = nodeElement.querySelector('rect, polygon, circle, ellipse, path') as SVGGraphicsElement;
    
    if (!shape) return;

    const svg = this.container?.querySelector('svg');
    if (!svg) return;

    // 获取形状的实际边界框（考虑变换）
    const bounds = this.getShapeActualBounds(shape);

    // 保存原始形状属性
    const originalShapeAttrs: Record<string, string> = {};
    const tagName = shape.tagName.toLowerCase();
    if (tagName === 'rect') {
      originalShapeAttrs.x = shape.getAttribute('x') || '0';
      originalShapeAttrs.y = shape.getAttribute('y') || '0';
      originalShapeAttrs.width = shape.getAttribute('width') || '0';
      originalShapeAttrs.height = shape.getAttribute('height') || '0';
    } else if (tagName === 'ellipse') {
      originalShapeAttrs.cx = shape.getAttribute('cx') || '0';
      originalShapeAttrs.cy = shape.getAttribute('cy') || '0';
      originalShapeAttrs.rx = shape.getAttribute('rx') || '0';
      originalShapeAttrs.ry = shape.getAttribute('ry') || '0';
    } else if (tagName === 'circle') {
      originalShapeAttrs.cx = shape.getAttribute('cx') || '0';
      originalShapeAttrs.cy = shape.getAttribute('cy') || '0';
      originalShapeAttrs.r = shape.getAttribute('r') || '0';
    } else if (tagName === 'polygon') {
      originalShapeAttrs.points = shape.getAttribute('points') || '';
    }

    this.selectedNode = {
      id: nodeId,
      element: nodeElement,
      shape,
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      originalShapeAttrs,
    };

    this.createSelectionOverlay();
    this.onSelect?.(nodeId);
  }

  private createSelectionOverlay(): void {
    if (!this.selectedNode || !this.container) return;

    const svg = this.container.querySelector('svg');
    if (!svg) return;

    // 创建选择覆盖层组
    this.selectionOverlay = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    this.selectionOverlay.setAttribute('class', 'node-selection-overlay');

    const { x, y, width, height } = this.selectedNode;

    // 创建选择边框
    const selectionRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    selectionRect.setAttribute('x', String(x - 2));
    selectionRect.setAttribute('y', String(y - 2));
    selectionRect.setAttribute('width', String(width + 4));
    selectionRect.setAttribute('height', String(height + 4));
    selectionRect.setAttribute('fill', 'none');
    selectionRect.setAttribute('stroke', '#4A90D9');
    selectionRect.setAttribute('stroke-width', '2');
    selectionRect.setAttribute('stroke-dasharray', '4,2');
    this.selectionOverlay.appendChild(selectionRect);

    // 创建调整手柄
    this.resizeHandles = [];
    this.handlePositions.forEach((handle) => {
      const handleRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      const hx = x + width * handle.x - this.handleSize / 2;
      const hy = y + height * handle.y - this.handleSize / 2;

      handleRect.setAttribute('x', String(hx));
      handleRect.setAttribute('y', String(hy));
      handleRect.setAttribute('width', String(this.handleSize));
      handleRect.setAttribute('height', String(this.handleSize));
      handleRect.setAttribute('fill', '#4A90D9');
      handleRect.setAttribute('stroke', '#FFFFFF');
      handleRect.setAttribute('stroke-width', '1');
      handleRect.setAttribute('data-handle', handle.position);
      handleRect.style.cursor = handle.cursor;

      handleRect.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        this.startResize(e, handle);
      });

      this.selectionOverlay?.appendChild(handleRect);
      this.resizeHandles.push(handleRect);
    });

    svg.appendChild(this.selectionOverlay);
  }

  private resizeStartNodePos = { x: 0, y: 0 };
  private resizeStartShapeAttrs: Record<string, string> = {};

  private startResize(e: MouseEvent, handle: ResizeHandle): void {
    if (!this.selectedNode) return;

    this.isResizing = true;
    this.activeHandle = handle;
    this.resizeStartPos = { x: e.clientX, y: e.clientY };
    this.resizeStartSize = {
      width: this.selectedNode.width,
      height: this.selectedNode.height,
    };
    this.resizeStartNodePos = {
      x: this.selectedNode.x,
      y: this.selectedNode.y,
    };
    // 保存当前形状属性作为起始值
    this.resizeStartShapeAttrs = { ...this.selectedNode.originalShapeAttrs };
    
    // 重新读取当前形状属性
    const { shape } = this.selectedNode;
    if (shape) {
      const tagName = shape.tagName.toLowerCase();
      if (tagName === 'rect') {
        this.resizeStartShapeAttrs.x = shape.getAttribute('x') || '0';
        this.resizeStartShapeAttrs.y = shape.getAttribute('y') || '0';
        this.resizeStartShapeAttrs.width = shape.getAttribute('width') || '0';
        this.resizeStartShapeAttrs.height = shape.getAttribute('height') || '0';
      } else if (tagName === 'ellipse') {
        this.resizeStartShapeAttrs.cx = shape.getAttribute('cx') || '0';
        this.resizeStartShapeAttrs.cy = shape.getAttribute('cy') || '0';
        this.resizeStartShapeAttrs.rx = shape.getAttribute('rx') || '0';
        this.resizeStartShapeAttrs.ry = shape.getAttribute('ry') || '0';
      } else if (tagName === 'circle') {
        this.resizeStartShapeAttrs.cx = shape.getAttribute('cx') || '0';
        this.resizeStartShapeAttrs.cy = shape.getAttribute('cy') || '0';
        this.resizeStartShapeAttrs.r = shape.getAttribute('r') || '0';
      } else if (tagName === 'polygon') {
        this.resizeStartShapeAttrs.points = shape.getAttribute('points') || '';
      }
    }

    // 触发调整大小开始回调
    this.onResizeStart?.(this.selectedNode.id);

    window.addEventListener('mousemove', this.handleMouseMove);
    window.addEventListener('mouseup', this.handleMouseUp);
  }

  private handleMouseMove(e: MouseEvent): void {
    if (!this.isResizing || !this.selectedNode || !this.activeHandle) return;

    const dx = e.clientX - this.resizeStartPos.x;
    const dy = e.clientY - this.resizeStartPos.y;

    let newWidth = this.resizeStartSize.width;
    let newHeight = this.resizeStartSize.height;
    let newX = this.resizeStartNodePos.x;
    let newY = this.resizeStartNodePos.y;

    // 根据手柄位置计算新尺寸和位置
    switch (this.activeHandle.position) {
      case 'e':
      case 'ne':
      case 'se':
        newWidth = Math.max(30, this.resizeStartSize.width + dx);
        break;
      case 'w':
      case 'nw':
      case 'sw':
        newWidth = Math.max(30, this.resizeStartSize.width - dx);
        newX = this.resizeStartNodePos.x + dx;
        // 限制不能超过右边界
        if (newWidth <= 30) {
          newX = this.resizeStartNodePos.x + this.resizeStartSize.width - 30;
        }
        break;
    }

    switch (this.activeHandle.position) {
      case 's':
      case 'se':
      case 'sw':
        newHeight = Math.max(20, this.resizeStartSize.height + dy);
        break;
      case 'n':
      case 'ne':
      case 'nw':
        newHeight = Math.max(20, this.resizeStartSize.height - dy);
        newY = this.resizeStartNodePos.y + dy;
        // 限制不能超过下边界
        if (newHeight <= 20) {
          newY = this.resizeStartNodePos.y + this.resizeStartSize.height - 20;
        }
        break;
    }

    // 更新形状大小和位置
    this.updateShapeSizeAndPosition(newX, newY, newWidth, newHeight);
  }

  private updateShapeSizeAndPosition(_x: number, _y: number, width: number, height: number): void {
    if (!this.selectedNode) return;

    const { shape } = this.selectedNode;
    if (!shape) return;

    const tagName = shape.tagName.toLowerCase();
    
    // 计算缩放比例
    const scaleX = width / this.resizeStartSize.width;
    const scaleY = height / this.resizeStartSize.height;

    // 修改形状的宽高
    if (tagName === 'rect') {
      const origWidth = parseFloat(this.resizeStartShapeAttrs.width || '0');
      const origHeight = parseFloat(this.resizeStartShapeAttrs.height || '0');
      
      shape.setAttribute('width', String(origWidth * scaleX));
      shape.setAttribute('height', String(origHeight * scaleY));
    } else if (tagName === 'ellipse') {
      const origRx = parseFloat(this.resizeStartShapeAttrs.rx || '0');
      const origRy = parseFloat(this.resizeStartShapeAttrs.ry || '0');
      
      shape.setAttribute('rx', String(origRx * scaleX));
      shape.setAttribute('ry', String(origRy * scaleY));
    } else if (tagName === 'circle') {
      const origR = parseFloat(this.resizeStartShapeAttrs.r || '0');
      const scale = Math.min(scaleX, scaleY);
      
      shape.setAttribute('r', String(origR * scale));
    } else if (tagName === 'polygon') {
      this.updatePolygonSize(shape, scaleX, scaleY);
    }

    // 重新获取形状的实际边界框
    const actualBounds = this.getShapeActualBounds(shape);
    
    this.selectedNode.x = actualBounds.x;
    this.selectedNode.y = actualBounds.y;
    this.selectedNode.width = actualBounds.width;
    this.selectedNode.height = actualBounds.height;

    // 使用实际边界框更新选择框和手柄位置
    this.updateSelectionOverlay(actualBounds.x, actualBounds.y, actualBounds.width, actualBounds.height);
  }

  private getShapeActualBounds(shape: SVGGraphicsElement): { x: number; y: number; width: number; height: number } {
    // 直接使用 getBBox 获取形状在其本地坐标系中的边界框
    const bbox = shape.getBBox();
    
    // 获取形状的变换矩阵，将本地坐标转换为 SVG 坐标
    const svg = this.container?.querySelector('svg') as SVGSVGElement;
    if (!svg) {
      return { x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height };
    }
    
    // 使用 getScreenCTM 获取从形状坐标到屏幕坐标的变换
    // 然后使用 SVG 的 getScreenCTM 的逆矩阵转换回 SVG 坐标
    const shapeCTM = shape.getScreenCTM();
    const svgCTM = svg.getScreenCTM();
    
    if (!shapeCTM || !svgCTM) {
      return { x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height };
    }
    
    // 计算从形状坐标到 SVG 坐标的变换
    const svgCTMInverse = svgCTM.inverse();
    const transformMatrix = svgCTMInverse.multiply(shapeCTM);
    
    // 变换左上角点
    const topLeft = svg.createSVGPoint();
    topLeft.x = bbox.x;
    topLeft.y = bbox.y;
    const tlTransformed = topLeft.matrixTransform(transformMatrix);
    
    // 变换右下角点
    const bottomRight = svg.createSVGPoint();
    bottomRight.x = bbox.x + bbox.width;
    bottomRight.y = bbox.y + bbox.height;
    const brTransformed = bottomRight.matrixTransform(transformMatrix);
    
    return {
      x: tlTransformed.x,
      y: tlTransformed.y,
      width: brTransformed.x - tlTransformed.x,
      height: brTransformed.y - tlTransformed.y,
    };
  }

  private updatePolygonSize(polygon: SVGElement, scaleX: number, scaleY: number): void {
    const points = this.resizeStartShapeAttrs.points;
    if (!points) return;

    // 解析原始点
    const pointsArray = points.split(/[\s,]+/).filter(Boolean);
    const coords: { x: number; y: number }[] = [];
    
    for (let i = 0; i < pointsArray.length; i += 2) {
      coords.push({
        x: parseFloat(pointsArray[i]),
        y: parseFloat(pointsArray[i + 1]),
      });
    }

    if (coords.length === 0) return;

    // 计算中心点
    const centerX = coords.reduce((sum, p) => sum + p.x, 0) / coords.length;
    const centerY = coords.reduce((sum, p) => sum + p.y, 0) / coords.length;

    // 相对于中心点缩放
    const newPoints = coords
      .map((p) => {
        const nx = centerX + (p.x - centerX) * scaleX;
        const ny = centerY + (p.y - centerY) * scaleY;
        return `${nx},${ny}`;
      })
      .join(' ');

    polygon.setAttribute('points', newPoints);
  }

  private updateSelectionOverlay(x: number, y: number, width: number, height: number): void {
    if (!this.selectionOverlay) return;

    const selectionRect = this.selectionOverlay.querySelector('rect:first-child');
    if (selectionRect) {
      selectionRect.setAttribute('x', String(x - 2));
      selectionRect.setAttribute('y', String(y - 2));
      selectionRect.setAttribute('width', String(width + 4));
      selectionRect.setAttribute('height', String(height + 4));
    }

    // 更新手柄位置
    this.resizeHandles.forEach((handle, index) => {
      const pos = this.handlePositions[index];
      const hx = x + width * pos.x - this.handleSize / 2;
      const hy = y + height * pos.y - this.handleSize / 2;
      handle.setAttribute('x', String(hx));
      handle.setAttribute('y', String(hy));
    });
  }

  private handleMouseUp(): void {
    if (this.isResizing && this.selectedNode) {
      this.onResize?.(this.selectedNode.id);
    }

    this.isResizing = false;
    this.activeHandle = null;
    window.removeEventListener('mousemove', this.handleMouseMove);
    window.removeEventListener('mouseup', this.handleMouseUp);
  }

  clearSelection(): void {
    if (this.selectionOverlay) {
      this.selectionOverlay.remove();
      this.selectionOverlay = null;
    }
    this.selectedNode = null;
    this.resizeHandles = [];
    this.onSelect?.(null);
  }

  getSelectedNode(): NodeInfo | null {
    return this.selectedNode;
  }

  // 刷新选择框（当形状改变后调用）
  refreshSelection(): void {
    if (!this.selectedNode || !this.selectedNode.shape) return;

    // 使用 getShapeActualBounds 获取正确的边界框（考虑 transform）
    const actualBounds = this.getShapeActualBounds(this.selectedNode.shape);

    // 更新选中节点的尺寸信息
    this.selectedNode.x = actualBounds.x;
    this.selectedNode.y = actualBounds.y;
    this.selectedNode.width = actualBounds.width;
    this.selectedNode.height = actualBounds.height;

    // 重新计算选择框位置
    this.updateSelectionOverlay(actualBounds.x, actualBounds.y, actualBounds.width, actualBounds.height);
  }

  // 开始拖动节点
  private startNodeDrag(e: MouseEvent, nodeElement: SVGGElement): void {
    this.pendingSelectNode = nodeElement;
    this.isDragging = false;
    this.dragStartPos = { x: e.clientX, y: e.clientY };
    
    // 获取节点当前的 transform
    const transform = nodeElement.getAttribute('transform') || '';
    const translateMatch = transform.match(/translate\(([-\d.]+),?\s*([-\d.]+)?\)/);
    if (translateMatch) {
      this.dragStartNodeTransform = {
        x: parseFloat(translateMatch[1]) || 0,
        y: parseFloat(translateMatch[2]) || 0,
      };
    } else {
      this.dragStartNodeTransform = { x: 0, y: 0 };
    }
    
    window.addEventListener('mousemove', this.handleNodeDragMove);
    window.addEventListener('mouseup', this.handleNodeDragEnd);
  }

  // 处理节点拖动移动
  private handleNodeDragMove(e: MouseEvent): void {
    if (!this.pendingSelectNode) return;
    
    const dx = e.clientX - this.dragStartPos.x;
    const dy = e.clientY - this.dragStartPos.y;
    
    // 如果移动距离超过阈值，开始拖动
    if (!this.isDragging && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
      this.isDragging = true;
      // 触发拖动开始回调
      const nodeId = this.pendingSelectNode.id || this.pendingSelectNode.getAttribute('data-id') || '';
      this.onDragStart?.(nodeId);
    }
    
    if (this.isDragging) {
      // 更新节点位置
      const newX = this.dragStartNodeTransform.x + dx;
      const newY = this.dragStartNodeTransform.y + dy;
      this.pendingSelectNode.setAttribute('transform', `translate(${newX}, ${newY})`);
    }
  }

  // 处理节点拖动结束
  private handleNodeDragEnd(): void {
    window.removeEventListener('mousemove', this.handleNodeDragMove);
    window.removeEventListener('mouseup', this.handleNodeDragEnd);
    
    if (!this.pendingSelectNode) return;
    
    const nodeElement = this.pendingSelectNode;
    const nodeId = nodeElement.id || nodeElement.getAttribute('data-id') || '';
    
    if (this.isDragging) {
      // 拖动结束，触发回调
      this.onDragEnd?.(nodeId);
    }
    
    // 无论是否拖动，都选中节点
    this.selectNode(nodeElement);
    
    this.pendingSelectNode = null;
    this.isDragging = false;
  }
}
