/**
 * Mermaid 流程图设计器组件
 * 功能：提供全屏的流程图编辑和预览功能
 * 描述：支持垂直工具栏、AI面板、连线选择、彩虹分支、配色面板等功能
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import mermaid from 'mermaid';
import { Icon } from '@/components/Icons';
import { getCachedModels, type CachedModelInfo } from '@/services/ModelCacheService';
import { isModelEnabled } from '@/services/ai';
import './MermaidDesigner.scss';

export interface MermaidDesignerProps {
  initialCode?: string;
  title?: string;
  onSave?: (code: string, title: string) => void;
}

type ToolType = 'ai' | 'material' | 'select' | 'brush' | 'vector' | 'text' | 'shape' | 'line' | 'image' | 'color' | 'font' | 'branch-width' | 'rainbow-branch';

interface ShapeItem {
  id: string;
  name: string;
  syntax: string;
  icon: string;
}

interface LineType {
  id: string;
  name: string;
  iconName: string;
}

interface RainbowScheme {
  id: string;
  name: string;
  colors: string[];
}

interface ColorScheme {
  id: string;
  name: string;
  colors: string[];
}

interface AIModel {
  id: string;
  name: string;
}

const shapePresets: ShapeItem[] = [
  { id: 'rect-rounded', name: '圆角矩形', syntax: '[文本]', icon: 'M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z' },
  { id: 'rect', name: '矩形', syntax: '(文本)', icon: 'M4 4h16v16H4z' },
  { id: 'circle', name: '圆形', syntax: '((文本))', icon: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z' },
  { id: 'rhombus', name: '菱形', syntax: '{文本}', icon: 'M12 4l8 8-8 8-8-8z' },
  { id: 'hexagon', name: '六边形', syntax: '{{文本}}', icon: 'M12 3l7 4v10l-7 4-7-4V7z' },
  { id: 'stadium', name: '体育场形', syntax: '([文本])', icon: 'M8 6h8a6 6 0 0 1 0 12H8a6 6 0 0 1 0-12z' },
  { id: 'cylinder', name: '圆柱体', syntax: '[(文本)]', icon: 'M4 6a8 3 0 0 1 16 0v12a8 3 0 0 1-16 0zM4 6a8 3 0 0 0 16 0' },
  { id: 'triangle', name: '三角形', syntax: '@{ shape: triangle }', icon: 'M12 4l8 16H4z' },
  { id: 'double-circle', name: '双圈', syntax: '(((文本)))', icon: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 6a6 6 0 1 0 0 12 6 6 0 0 0 0-12z' },
  { id: 'subroutine', name: '子程序', syntax: '[[文本]]', icon: 'M6 4h12v16H6zM4 4v16M20 4v16' },
  { id: 'trapezoid', name: '梯形', syntax: '[/文本\\]', icon: 'M6 16h12l2-12H4z' },
  { id: 'document', name: '文档', syntax: '@{ shape: doc }', icon: 'M4 4h16v14c-2-2-4-2-8 0s-6 2-8 0V4z' },
];

const lineTypes: LineType[] = [
  { id: 'arrow-up-right', name: '斜向上箭头', iconName: 'move-up-right' },
  { id: 'forward', name: '前进箭头', iconName: 'forward' },
  { id: 'arrow-right', name: '向右箭头', iconName: 'move-right' },
  { id: 'arrow-down', name: '向下箭头', iconName: 'move-down' },
  { id: 'arrow-up', name: '向上箭头', iconName: 'move-up' },
];

const rainbowSchemes: RainbowScheme[] = [
  { id: 'rainbow', name: '彩虹', colors: ['#FF6B6B', '#FFE66D', '#4ECDC4', '#45B7D1', '#96E6A1', '#DDA0DD'] },
  { id: 'ocean', name: '海洋', colors: ['#0077B6', '#00B4D8', '#90E0EF', '#CAF0F8', '#48CAE4', '#023E8A'] },
  { id: 'sunset', name: '日落', colors: ['#FF6B35', '#F7931E', '#FFD23F', '#EE4266', '#540D6E', '#3BCEAC'] },
  { id: 'forest', name: '森林', colors: ['#2D5016', '#4A7C23', '#6B8E23', '#8FBC8F', '#98D8AA', '#C1E1C1'] },
  { id: 'candy', name: '糖果', colors: ['#FF69B4', '#FFB6C1', '#DDA0DD', '#E6E6FA', '#F0E68C', '#98FB98'] },
  { id: 'earth', name: '大地', colors: ['#8B4513', '#A0522D', '#CD853F', '#DEB887', '#D2B48C', '#F5DEB3'] },
  { id: 'neon', name: '霓虹', colors: ['#FF00FF', '#00FFFF', '#FF0080', '#80FF00', '#FFFF00', '#FF8000'] },
  { id: 'pastel', name: '粉彩', colors: ['#FFB3BA', '#FFDFBA', '#FFFFBA', '#BAFFC9', '#BAE1FF', '#E8BAFF'] },
  { id: 'mono', name: '单色', colors: ['#2C3E50', '#34495E', '#7F8C8D', '#95A5A6', '#BDC3C7', '#ECF0F1'] },
];
const colorfulSchemes: ColorScheme[] = [
  { id: 'rainbow', name: '彩虹', colors: ['#FF6B6B', '#FFE66D', '#4ECDC4', '#45B7D1', '#96E6A1', '#DDA0DD'] },
  { id: 'vitality', name: '活力', colors: ['#FF5733', '#FFC300', '#DAF7A6', '#33FF57', '#3380FF', '#8E44AD'] },
  { id: 'dance', name: '舞动', colors: ['#E91E63', '#9C27B0', '#673AB7', '#3F51B5', '#2196F3', '#00BCD4'] },
  { id: 'code', name: '代码', colors: ['#61DAFB', '#764ABC', '#F7DF1E', '#339933', '#E34F26', '#1572B6'] },
  { id: 'japanese', name: '和风', colors: ['#D4A5A5', '#A5D4D4', '#D4D4A5', '#A5A5D4', '#D4C4A5', '#C4D4A5'] },
  { id: 'island', name: '岛屿', colors: ['#00CED1', '#20B2AA', '#48D1CC', '#40E0D0', '#7FFFD4', '#66CDAA'] },
  { id: 'rose', name: '玫瑰', colors: ['#FF007F', '#FF1493', '#FF69B4', '#FFB6C1', '#FFC0CB', '#FFE4E1'] },
  { id: 'mint', name: '薄荷', colors: ['#98FF98', '#90EE90', '#00FA9A', '#00FF7F', '#3CB371', '#2E8B57'] },
  { id: 'greentea', name: '绿茶', colors: ['#9DC183', '#8FBC8F', '#6B8E23', '#556B2F', '#808000', '#6B8E23'] },
  { id: 'cosmos', name: '宇宙', colors: ['#191970', '#000080', '#4169E1', '#6495ED', '#87CEEB', '#B0E0E6'] },
  { id: 'elegant', name: '精致', colors: ['#2F4F4F', '#708090', '#778899', '#B0C4DE', '#E6E6FA', '#F8F8FF'] },
  { id: 'innocent', name: '纯真', colors: ['#FFFACD', '#FAFAD2', '#FFEFD5', '#FFE4B5', '#FFDAB9', '#EEE8AA'] },
  { id: 'macaron', name: '马卡龙', colors: ['#FFB5E8', '#B5DEFF', '#B5FFB8', '#FFFFB5', '#FFD9B5', '#E8B5FF'] },
  { id: 'woodland', name: '林地', colors: ['#228B22', '#32CD32', '#90EE90', '#98FB98', '#00FF00', '#7CFC00'] },
  { id: 'cream', name: '奶油', colors: ['#FFFDD0', '#FAEBD7', '#FFE4C4', '#FFEBCD', '#FFF8DC', '#FFFAF0'] },
  { id: 'hawaii', name: '夏威夷', colors: ['#FF6347', '#FF7F50', '#FFA500', '#FFD700', '#ADFF2F', '#00CED1'] },
];

const classicSchemes: ColorScheme[] = [
  { id: 'classic-blue', name: '经典蓝', colors: ['#003366', '#336699', '#6699CC', '#99CCFF', '#CCE5FF', '#E6F2FF'] },
  { id: 'classic-green', name: '经典绿', colors: ['#006633', '#339966', '#66CC99', '#99FFCC', '#CCFFE5', '#E6FFF2'] },
  { id: 'classic-red', name: '经典红', colors: ['#660000', '#993333', '#CC6666', '#FF9999', '#FFCCCC', '#FFE6E6'] },
  { id: 'classic-purple', name: '经典紫', colors: ['#330066', '#663399', '#9966CC', '#CC99FF', '#E5CCFF', '#F2E6FF'] },
  { id: 'classic-orange', name: '经典橙', colors: ['#CC5500', '#FF6600', '#FF9933', '#FFCC66', '#FFE5B3', '#FFF2E6'] },
  { id: 'classic-gray', name: '经典灰', colors: ['#333333', '#666666', '#999999', '#CCCCCC', '#E6E6E6', '#F5F5F5'] },
];

const zoomLevels = [25, 50, 75, 100, 125, 150, 200, 300, 400];

export const MermaidDesigner: React.FC<MermaidDesignerProps> = ({
  initialCode = 'flowchart TD\n    A[开始] --> B[结束]',
  title: initialTitle = '流程图',
  onSave,
}) => {
  const [code] = useState(initialCode);
  const [title, setTitle] = useState(initialTitle);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [scale, setScale] = useState(1);
  const [translateX, setTranslateX] = useState(0);
  const [translateY, setTranslateY] = useState(0);
  const [isDragMode, setIsDragMode] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<ToolType>('select');
  
  const [isShapeMenuOpen, setIsShapeMenuOpen] = useState(false);
  const [selectedShape, setSelectedShape] = useState<ShapeItem>(shapePresets[0]);
  
  const [isAIPanelOpen, setIsAIPanelOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiModels, setAiModels] = useState<AIModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<AIModel | null>(null);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  
  const [isLineDropdownOpen, setIsLineDropdownOpen] = useState(false);
  const [selectedLine, setSelectedLine] = useState<LineType>(lineTypes[0]);
  
  const [isRainbowDropdownOpen, setIsRainbowDropdownOpen] = useState(false);
  const [selectedRainbow, setSelectedRainbow] = useState<RainbowScheme>(rainbowSchemes[0]);
  
  const [isColorPanelOpen, setIsColorPanelOpen] = useState(false);
  const [colorPanelTab, setColorPanelTab] = useState<'colorful' | 'classic'>('colorful');
  const [selectedColorScheme, setSelectedColorScheme] = useState<ColorScheme>(colorfulSchemes[0]);

  const svgContainerRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef({ x: 0, y: 0, translateX: 0, translateY: 0 });
  const titleInputRef = useRef<HTMLInputElement>(null);
  const shapeMenuRef = useRef<HTMLDivElement>(null);
  const aiPanelRef = useRef<HTMLDivElement>(null);
  const lineDropdownRef = useRef<HTMLDivElement>(null);
  const rainbowDropdownRef = useRef<HTMLDivElement>(null);
  const colorPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'loose' });
  }, []);

  useEffect(() => {
    const loadModels = async () => {
      const models = await getCachedModels();
      const enabledModels = models.filter((m: CachedModelInfo) => m.id && isModelEnabled(m.id));
      const mappedModels: AIModel[] = enabledModels.map((m: CachedModelInfo) => ({ id: m.id || '', name: m.name || '' }));
      setAiModels(mappedModels);
      if (mappedModels.length > 0) {
        setSelectedModel(mappedModels[0]);
      }
    };
    loadModels();
  }, []);

  const renderMermaid = useCallback(async () => {
    if (!svgContainerRef.current) return;
    try {
      const id = `mermaid-${Date.now()}`;
      const { svg } = await mermaid.render(id, code);
      svgContainerRef.current.innerHTML = svg;
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '渲染失败');
    }
  }, [code]);

  useEffect(() => { renderMermaid(); }, [renderMermaid]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (shapeMenuRef.current && !shapeMenuRef.current.contains(target)) setIsShapeMenuOpen(false);
      if (aiPanelRef.current && !aiPanelRef.current.contains(target)) setIsAIPanelOpen(false);
      if (lineDropdownRef.current && !lineDropdownRef.current.contains(target)) setIsLineDropdownOpen(false);
      if (rainbowDropdownRef.current && !rainbowDropdownRef.current.contains(target)) setIsRainbowDropdownOpen(false);
      if (colorPanelRef.current && !colorPanelRef.current.contains(target)) setIsColorPanelOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectShape = (shape: ShapeItem) => { setSelectedShape(shape); setIsShapeMenuOpen(false); };
  const handleSelectLine = (line: LineType) => { setSelectedLine(line); setIsLineDropdownOpen(false); };
  const handleSelectRainbow = (scheme: RainbowScheme) => { setSelectedRainbow(scheme); setIsRainbowDropdownOpen(false); };
  const handleSelectColorScheme = (scheme: ColorScheme) => { setSelectedColorScheme(scheme); };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!isDragMode) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY, translateX, translateY };
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    setTranslateX(dragStartRef.current.translateX + e.clientX - dragStartRef.current.x);
    setTranslateY(dragStartRef.current.translateY + e.clientY - dragStartRef.current.y);
  }, [isDragging]);

  const handleMouseUp = useCallback(() => { setIsDragging(false); }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const handleZoomIn = () => setScale(prev => Math.min(prev * 1.2, 4));
  const handleZoomOut = () => setScale(prev => Math.max(prev / 1.2, 0.25));
  const handleZoomReset = () => { setScale(1); setTranslateX(0); setTranslateY(0); };
  const handleZoomSelect = (level: number) => setScale(level / 100);
  const handleTitleClick = () => { setIsEditingTitle(true); setTimeout(() => titleInputRef.current?.select(), 0); };
  const handleTitleBlur = () => setIsEditingTitle(false);
  const handleTitleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter') setIsEditingTitle(false); };
  const handleSave = () => onSave?.(code, title);

  const handleToolClick = (tool: ToolType) => {
    setActiveTool(tool);
    setIsShapeMenuOpen(false);
    setIsAIPanelOpen(false);
    setIsLineDropdownOpen(false);
    setIsRainbowDropdownOpen(false);
    setIsColorPanelOpen(false);
    
    if (tool === 'shape') setIsShapeMenuOpen(true);
    else if (tool === 'ai') setIsAIPanelOpen(true);
    else if (tool === 'line') setIsLineDropdownOpen(true);
    else if (tool === 'rainbow-branch') setIsRainbowDropdownOpen(true);
    else if (tool === 'color') setIsColorPanelOpen(true);
  };

  const handleAIGenerate = () => { console.log('AI生成:', aiPrompt, selectedModel); };

  const getRainbowGradient = (colors: string[]) => {
    const stops = colors.map((color, index) => {
      const percent = (index / colors.length) * 100;
      const nextPercent = ((index + 1) / colors.length) * 100;
      return `${color} ${percent}% ${nextPercent}%`;
    }).join(', ');
    return `conic-gradient(${stops})`;
  };

  return (
    <div className="mermaid-designer">
      <div className="mermaid-designer-toolbar">
        <div className="mermaid-designer-toolbar-left">
          {isEditingTitle ? (
            <input ref={titleInputRef} type="text" className="mermaid-designer-title-input" value={title}
              onChange={(e) => setTitle(e.target.value)} onBlur={handleTitleBlur} onKeyDown={handleTitleKeyDown} autoFocus />
          ) : (
            <span className="mermaid-designer-title" onClick={handleTitleClick}>{title}</span>
          )}
        </div>
        <div className="mermaid-designer-toolbar-right">
          <span className="mermaid-designer-btn" onClick={handleSave} title="保存">
            <Icon iconSet="ui" name="save" size={18} />
          </span>
        </div>
      </div>

      <div className="mermaid-designer-content">
        <div className="mermaid-designer-tools">
          <div className="mermaid-designer-ai-wrapper" ref={aiPanelRef}>
            <span className={`mermaid-designer-tool-btn ${activeTool === 'ai' ? 'active' : ''}`} onClick={() => handleToolClick('ai')} title="AI">
              <Icon iconSet="ui" name="sparkles" size={18} />
            </span>
            {isAIPanelOpen && (
              <div className="mermaid-designer-ai-panel">
                <div className="mermaid-designer-ai-panel-header">
                  <span className="mermaid-designer-ai-panel-title">AI 生成</span>
                  <span className="mermaid-designer-ai-panel-close" onClick={() => setIsAIPanelOpen(false)}>
                    <Icon iconSet="ui" name="x" size={14} />
                  </span>
                </div>
                <div className="mermaid-designer-ai-panel-content">
                  <textarea className="mermaid-designer-ai-input" placeholder="描述你想要生成的流程图..."
                    value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} />
                  <div className="mermaid-designer-ai-model-select">
                    <span className="mermaid-designer-ai-model-label">模型:</span>
                    <div className="mermaid-designer-ai-model-dropdown-wrapper">
                      <span className="mermaid-designer-ai-model-trigger" onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}>
                        <span>{selectedModel?.name || '选择模型'}</span>
                        <Icon iconSet="ui" name="chevron-down" size={12} />
                      </span>
                      {isModelDropdownOpen && (
                        <div className="mermaid-designer-ai-model-dropdown">
                          {aiModels.map((model) => (
                            <span key={model.id} className={`mermaid-designer-ai-model-option ${selectedModel?.id === model.id ? 'active' : ''}`}
                              onClick={() => { setSelectedModel(model); setIsModelDropdownOpen(false); }}>
                              {model.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="mermaid-designer-ai-panel-footer">
                  <span className="mermaid-designer-ai-send-btn" onClick={handleAIGenerate}>
                    <Icon iconSet="ui" name="sparkles" size={14} />
                    <span>生成</span>
                  </span>
                </div>
              </div>
            )}
          </div>

          <span className={`mermaid-designer-tool-btn ${activeTool === 'material' ? 'active' : ''}`} onClick={() => handleToolClick('material')} title="素材库">
            <Icon iconSet="ui" name="sprout" size={18} />
          </span>
          <div className="mermaid-designer-tool-divider" />
          <span className={`mermaid-designer-tool-btn ${activeTool === 'select' ? 'active' : ''}`} onClick={() => handleToolClick('select')} title="选择">
            <Icon iconSet="ui" name="mouse-pointer-2" size={18} />
          </span>
          <span className={`mermaid-designer-tool-btn ${activeTool === 'brush' ? 'active' : ''}`} onClick={() => handleToolClick('brush')} title="画笔">
            <Icon iconSet="ui" name="pencil" size={18} />
          </span>
          <span className={`mermaid-designer-tool-btn ${activeTool === 'vector' ? 'active' : ''}`} onClick={() => handleToolClick('vector')} title="矢量绘图">
            <Icon iconSet="ui" name="pen-tool" size={18} />
          </span>
          <span className={`mermaid-designer-tool-btn ${activeTool === 'text' ? 'active' : ''}`} onClick={() => handleToolClick('text')} title="文本">
            <Icon iconSet="ui" name="type-icon" size={18} />
          </span>
          
          <div className="mermaid-designer-shape-wrapper" ref={shapeMenuRef}>
            <span className={`mermaid-designer-tool-btn ${activeTool === 'shape' ? 'active' : ''}`} onClick={() => handleToolClick('shape')} title="形状">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d={selectedShape.icon} />
              </svg>
            </span>
            {isShapeMenuOpen && (
              <div className="mermaid-designer-shape-dropdown">
                {shapePresets.map((shape) => (
                  <span key={shape.id} className={`mermaid-designer-shape-item ${selectedShape.id === shape.id ? 'active' : ''}`}
                    onClick={() => handleSelectShape(shape)} title={shape.name}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d={shape.icon} />
                    </svg>
                  </span>
                ))}
              </div>
            )}
          </div>
          
          <div className="mermaid-designer-line-wrapper" ref={lineDropdownRef}>
            <span className={`mermaid-designer-tool-btn ${activeTool === 'line' ? 'active' : ''}`} onClick={() => handleToolClick('line')} title="连线">
              <Icon iconSet="ui" name={selectedLine.iconName} size={18} />
            </span>
            {isLineDropdownOpen && (
              <div className="mermaid-designer-line-dropdown">
                {lineTypes.map((line) => (
                  <span key={line.id} className={`mermaid-designer-line-item ${selectedLine.id === line.id ? 'active' : ''}`}
                    onClick={() => handleSelectLine(line)} title={line.name}>
                    <Icon iconSet="ui" name={line.iconName} size={20} />
                  </span>
                ))}
              </div>
            )}
          </div>
          
          <span className={`mermaid-designer-tool-btn ${activeTool === 'image' ? 'active' : ''}`} onClick={() => handleToolClick('image')} title="图片">
            <Icon iconSet="ui" name="image-icon" size={18} />
          </span>
          <div className="mermaid-designer-tool-divider" />

          <div className="mermaid-designer-color-wrapper" ref={colorPanelRef}>
            <span className={`mermaid-designer-tool-btn ${activeTool === 'color' ? 'active' : ''}`} onClick={() => handleToolClick('color')} title="配色">
              <Icon iconSet="ui" name="palette" size={18} />
            </span>
            {isColorPanelOpen && (
              <div className="mermaid-designer-color-panel">
                <div className="mermaid-designer-color-tabs">
                  <span className={`mermaid-designer-color-tab ${colorPanelTab === 'colorful' ? 'active' : ''}`}
                    onClick={() => setColorPanelTab('colorful')}>缤纷</span>
                  <span className={`mermaid-designer-color-tab ${colorPanelTab === 'classic' ? 'active' : ''}`}
                    onClick={() => setColorPanelTab('classic')}>经典</span>
                </div>
                <div className="mermaid-designer-color-content">
                  {(colorPanelTab === 'colorful' ? colorfulSchemes : classicSchemes).map((scheme) => (
                    <div key={scheme.id} className={`mermaid-designer-color-scheme ${selectedColorScheme.id === scheme.id ? 'active' : ''}`}
                      onClick={() => handleSelectColorScheme(scheme)}>
                      <span className="mermaid-designer-color-name">{scheme.name}</span>
                      <div className="mermaid-designer-color-bar">
                        {scheme.colors.map((color, index) => (
                          <span key={index} className="mermaid-designer-color-block" style={{ backgroundColor: color }} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          
          <span className={`mermaid-designer-tool-btn ${activeTool === 'font' ? 'active' : ''}`} onClick={() => handleToolClick('font')} title="字体">
            <Icon iconSet="ui" name="type-icon" size={18} />
          </span>
          <span className={`mermaid-designer-tool-btn ${activeTool === 'branch-width' ? 'active' : ''}`} onClick={() => handleToolClick('branch-width')} title="分支粗细">
            <Icon iconSet="ui" name="equal-approximately" size={18} />
          </span>
          
          <div className="mermaid-designer-rainbow-wrapper" ref={rainbowDropdownRef}>
            <span className={`mermaid-designer-tool-btn ${activeTool === 'rainbow-branch' ? 'active' : ''}`} onClick={() => handleToolClick('rainbow-branch')} title="彩虹分支">
              <Icon iconSet="ui" name="trending-up-down" size={18} />
            </span>
            {isRainbowDropdownOpen && (
              <div className="mermaid-designer-rainbow-dropdown">
                {rainbowSchemes.map((scheme) => (
                  <span key={scheme.id} className={`mermaid-designer-rainbow-item ${selectedRainbow.id === scheme.id ? 'active' : ''}`}
                    onClick={() => handleSelectRainbow(scheme)} title={scheme.name}>
                    <span className="mermaid-designer-rainbow-ring" style={{ background: getRainbowGradient(scheme.colors) }} />
                    <span className="mermaid-designer-rainbow-name">{scheme.name}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mermaid-designer-preview">
          <div className="mermaid-designer-side-toolbar">
            <span className={`mermaid-designer-side-btn ${isDragMode ? 'active' : ''}`} onClick={() => setIsDragMode(!isDragMode)} title="拖拽模式">
              <Icon iconSet="ui" name="hand" size={16} />
            </span>
            <div className="mermaid-designer-side-divider" />
            <span className="mermaid-designer-side-btn" onClick={handleZoomIn} title="放大">
              <Icon iconSet="ui" name="zoom-in" size={16} />
            </span>
            <span className="mermaid-designer-side-btn" onClick={handleZoomOut} title="缩小">
              <Icon iconSet="ui" name="zoom-out" size={16} />
            </span>
            <div className="mermaid-designer-zoom-menu">
              <span className="mermaid-designer-zoom-label">{Math.round(scale * 100)}%</span>
              <div className="mermaid-designer-zoom-dropdown">
                {zoomLevels.map((level) => (
                  <span key={level} className={`mermaid-designer-zoom-item ${Math.round(scale * 100) === level ? 'active' : ''}`}
                    onClick={() => handleZoomSelect(level)}>{level}%</span>
                ))}
              </div>
            </div>
            <div className="mermaid-designer-side-divider" />
            <span className="mermaid-designer-side-btn" onClick={handleZoomReset} title="重置视图">
              <Icon iconSet="ui" name="maximize-2" size={16} />
            </span>
          </div>
          <div className={`mermaid-designer-preview-container ${isDragMode ? 'drag-mode' : ''}`} onMouseDown={handleMouseDown}>
            {error ? (
              <div className="mermaid-designer-error">{error}</div>
            ) : (
              <div ref={svgContainerRef} className="mermaid-designer-svg"
                style={{ transform: `translate(${translateX}px, ${translateY}px) scale(${scale})` }} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
