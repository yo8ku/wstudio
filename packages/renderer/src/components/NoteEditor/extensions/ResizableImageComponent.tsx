/**
 * 可调整大小的图片组件
 * 功能：渲染带有调整大小手柄和工具栏的图片，支持描述、链接样式、卡片样式
 */

import React, { useRef, useState, useCallback } from 'react';
import { NodeViewWrapper, NodeViewProps } from '@tiptap/react';
import { Icon } from '../../Icons/Icon';

type AlignType = 'left' | 'center' | 'right';
type DisplayStyleType = 'default' | 'link' | 'card';

export const ResizableImageComponent: React.FC<NodeViewProps> = ({
  node,
  updateAttributes,
  selected,
  deleteNode,
}) => {
  const imageRef = useRef<HTMLImageElement>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [localSize, setLocalSize] = useState<{ width: number; height: number } | null>(null);
  const [showSizeMenu, setShowSizeMenu] = useState(false);
  const [showAlignMenu, setShowAlignMenu] = useState(false);
  const [showStyleMenu, setShowStyleMenu] = useState(false);
  const [isEditingCaption, setIsEditingCaption] = useState(false);
  const [showCaption, setShowCaption] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isImageHovered, setIsImageHovered] = useState(false);
  
  const { src, alt, title, width, height, rotation = 0, align = 'left', caption = '', displayStyle = 'default' } = node.attrs;
  
  const displayWidth = localSize?.width ?? width;
  const displayHeight = localSize?.height ?? height;

  // 旋转图片
  const handleRotate = useCallback(() => {
    const newRotation = ((rotation || 0) + 90) % 360;
    updateAttributes({ rotation: newRotation });
  }, [rotation, updateAttributes]);

  // 设置对齐方式
  const handleAlign = useCallback((newAlign: AlignType) => {
    updateAttributes({ align: newAlign });
    setShowAlignMenu(false);
  }, [updateAttributes]);

  // 设置显示样式
  const handleDisplayStyle = useCallback((style: DisplayStyleType) => {
    updateAttributes({ displayStyle: style });
    setShowStyleMenu(false);
  }, [updateAttributes]);

  // 更新描述
  const handleCaptionChange = useCallback((newCaption: string) => {
    updateAttributes({ caption: newCaption });
  }, [updateAttributes]);

  // 获取文件名（用于链接样式显示）
  const getFileName = useCallback(() => {
    try {
      const url = new URL(src);
      const pathname = url.pathname;
      return pathname.split('/').pop() || src;
    } catch {
      return src.split('/').pop() || src;
    }
  }, [src]);

  // 全屏显示图片
  const handleFullscreen = useCallback(() => {
    setIsFullscreen(true);
  }, []);

  // 关闭全屏
  const handleCloseFullscreen = useCallback(() => {
    setIsFullscreen(false);
  }, []);

  // 删除图片
  const handleDelete = useCallback(() => {
    deleteNode();
  }, [deleteNode]);

  // 设置尺寸百分比
  const handleSizePercent = useCallback((percent: number) => {
    const img = imageRef.current;
    if (!img) return;
    
    // 获取原始尺寸
    const naturalWidth = img.naturalWidth;
    const naturalHeight = img.naturalHeight;
    
    const newWidth = Math.round(naturalWidth * percent / 100);
    const newHeight = Math.round(naturalHeight * percent / 100);
    
    updateAttributes({ width: newWidth, height: newHeight });
    setShowSizeMenu(false);
  }, [updateAttributes]);

  // 设置自定义尺寸
  const handleCustomSize = useCallback((type: 'width' | 'height', value: string) => {
    const numValue = parseInt(value, 10);
    if (isNaN(numValue) || numValue < 10) return;
    
    const img = imageRef.current;
    if (!img) return;
    
    const aspectRatio = img.naturalWidth / img.naturalHeight;
    
    if (type === 'width') {
      updateAttributes({ 
        width: numValue, 
        height: Math.round(numValue / aspectRatio) 
      });
    } else {
      updateAttributes({ 
        width: Math.round(numValue * aspectRatio), 
        height: numValue 
      });
    }
  }, [updateAttributes]);

  const handleMouseDown = useCallback((
    e: React.MouseEvent,
    handle: string
  ) => {
    e.preventDefault();
    e.stopPropagation();
    
    const img = imageRef.current;
    if (!img) return;
    
    setIsResizing(true);
    
    const startX = e.clientX;
    const startWidth = img.offsetWidth;
    const startHeight = img.offsetHeight;
    const aspectRatio = startWidth / startHeight;
    
    let finalWidth = startWidth;
    let finalHeight = startHeight;
    
    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      
      let newWidth = startWidth;
      
      switch (handle) {
        case 'se':
        case 'e':
        case 'ne':
          newWidth = Math.max(50, startWidth + deltaX);
          break;
        case 'sw':
        case 'w':
        case 'nw':
          newWidth = Math.max(50, startWidth - deltaX);
          break;
      }
      
      const newHeight = Math.round(newWidth / aspectRatio);
      finalWidth = Math.round(newWidth);
      finalHeight = newHeight;
      
      setLocalSize({ width: finalWidth, height: finalHeight });
    };
    
    const onMouseUp = () => {
      setIsResizing(false);
      updateAttributes({
        width: finalWidth,
        height: finalHeight,
      });
      setLocalSize(null);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [updateAttributes]);

  // 获取对齐样式
  const getAlignStyle = (): React.CSSProperties => {
    switch (align) {
      case 'center':
        return { marginLeft: 'auto', marginRight: 'auto' };
      case 'right':
        return { marginLeft: 'auto', marginRight: 0 };
      default:
        return { marginLeft: 0, marginRight: 'auto' };
    }
  };

  return (
    <NodeViewWrapper className="image-wrapper" data-drag-handle>
      <div 
        className={`resizable-image-container ${selected ? 'selected' : ''} ${isResizing ? 'resizing' : ''} display-style-${displayStyle}`}
        style={getAlignStyle()}
      >
        {/* 图片工具栏 */}
        {selected && !isResizing && (
          <div className="image-toolbar">
            {/* 描述 */}
            <div
              className={`image-toolbar-btn ${caption ? 'active' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => {
                if (showCaption || isEditingCaption) {
                  // 关闭描述区域
                  setShowCaption(false);
                  setIsEditingCaption(false);
                } else {
                  // 打开描述区域并进入编辑
                  setShowCaption(true);
                  setIsEditingCaption(true);
                }
              }}
              title={showCaption || isEditingCaption ? '关闭描述' : '添加描述'}
            >
              <Icon iconSet="ui" name="image-caption" size={16} />
            </div>

            {/* 显示样式 */}
            <div className="image-toolbar-dropdown">
              <div
                className="image-toolbar-btn"
                role="button"
                tabIndex={0}
                onClick={() => { setShowStyleMenu(!showStyleMenu); setShowSizeMenu(false); setShowAlignMenu(false); }}
                title="显示样式"
              >
                {displayStyle === 'link' && <Icon iconSet="ui" name="image-link-style" size={16} />}
                {displayStyle === 'card' && <Icon iconSet="ui" name="image-card-style" size={16} />}
                {displayStyle === 'default' && <Icon iconSet="ui" name="image-size" size={16} />}
              </div>
              {showStyleMenu && (
                <div className="image-toolbar-menu">
                  <div 
                    className={`image-toolbar-menu-item ${displayStyle === 'default' ? 'active' : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleDisplayStyle('default')}
                  >
                    <Icon iconSet="ui" name="image-size" size={14} />
                    <span>默认</span>
                  </div>
                  <div 
                    className={`image-toolbar-menu-item ${displayStyle === 'link' ? 'active' : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleDisplayStyle('link')}
                  >
                    <Icon iconSet="ui" name="image-link-style" size={14} />
                    <span>链接</span>
                  </div>
                  <div 
                    className={`image-toolbar-menu-item ${displayStyle === 'card' ? 'active' : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleDisplayStyle('card')}
                  >
                    <Icon iconSet="ui" name="image-card-style" size={14} />
                    <span>卡片</span>
                  </div>
                </div>
              )}
            </div>

            {/* 分隔线 */}
            <div className="image-toolbar-divider" />

            {/* 旋转 */}
            <div
              className="image-toolbar-btn"
              role="button"
              tabIndex={0}
              onClick={handleRotate}
              title="旋转"
            >
              <Icon iconSet="ui" name="image-rotate" size={16} />
            </div>
            
            {/* 裁剪（预留） */}
            <div
              className="image-toolbar-btn"
              role="button"
              tabIndex={0}
              title="裁剪"
            >
              <Icon iconSet="ui" name="image-crop" size={16} />
            </div>
            
            {/* 尺寸 */}
            <div className="image-toolbar-dropdown">
              <div
                className="image-toolbar-btn"
                role="button"
                tabIndex={0}
                onClick={() => { setShowSizeMenu(!showSizeMenu); setShowAlignMenu(false); setShowStyleMenu(false); }}
                title="尺寸"
              >
                <Icon iconSet="ui" name="image-size" size={16} />
              </div>
              {showSizeMenu && (
                <div className="image-toolbar-menu">
                  <div className="image-toolbar-menu-item size-input">
                    <span>宽:</span>
                    <input
                      type="number"
                      defaultValue={displayWidth || ''}
                      onBlur={(e) => handleCustomSize('width', e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleCustomSize('width', (e.target as HTMLInputElement).value);
                        }
                      }}
                    />
                  </div>
                  <div className="image-toolbar-menu-item size-input">
                    <span>高:</span>
                    <input
                      type="number"
                      defaultValue={displayHeight || ''}
                      onBlur={(e) => handleCustomSize('height', e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleCustomSize('height', (e.target as HTMLInputElement).value);
                        }
                      }}
                    />
                  </div>
                  <div className="image-toolbar-menu-divider" />
                  <div 
                    className="image-toolbar-menu-item"
                    role="button"
                    tabIndex={0}
                    onClick={() => handleSizePercent(25)}
                  >
                    25%
                  </div>
                  <div 
                    className="image-toolbar-menu-item"
                    role="button"
                    tabIndex={0}
                    onClick={() => handleSizePercent(50)}
                  >
                    50%
                  </div>
                  <div 
                    className="image-toolbar-menu-item"
                    role="button"
                    tabIndex={0}
                    onClick={() => handleSizePercent(75)}
                  >
                    75%
                  </div>
                  <div 
                    className="image-toolbar-menu-item"
                    role="button"
                    tabIndex={0}
                    onClick={() => handleSizePercent(100)}
                  >
                    100%
                  </div>
                </div>
              )}
            </div>
            
            {/* 对齐方式 */}
            <div className="image-toolbar-dropdown">
              <div
                className="image-toolbar-btn"
                role="button"
                tabIndex={0}
                onClick={() => { setShowAlignMenu(!showAlignMenu); setShowSizeMenu(false); setShowStyleMenu(false); }}
                title="对齐方式"
              >
                <Icon iconSet="ui" name="image-align" size={16} />
              </div>
              {showAlignMenu && (
                <div className="image-toolbar-menu">
                  <div 
                    className={`image-toolbar-menu-item ${align === 'left' ? 'active' : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleAlign('left')}
                  >
                    <Icon iconSet="ui" name="align-left" size={14} />
                    <span>左对齐</span>
                  </div>
                  <div 
                    className={`image-toolbar-menu-item ${align === 'center' ? 'active' : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleAlign('center')}
                  >
                    <Icon iconSet="ui" name="align-center" size={14} />
                    <span>居中</span>
                  </div>
                  <div 
                    className={`image-toolbar-menu-item ${align === 'right' ? 'active' : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleAlign('right')}
                  >
                    <Icon iconSet="ui" name="align-right" size={14} />
                    <span>右对齐</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 默认样式：显示图片 */}
        {displayStyle === 'default' && (
          <div 
            className="image-content-area"
            onMouseEnter={() => setIsImageHovered(true)}
            onMouseLeave={() => setIsImageHovered(false)}
          >
            {/* 右上角操作按钮 - 仅在图片内部 hover 时显示 */}
            {!isResizing && isImageHovered && (
              <div className="image-actions">
                <div
                  className="image-action-btn"
                  role="button"
                  tabIndex={0}
                  onClick={handleFullscreen}
                  title="全屏显示"
                >
                  <Icon iconSet="ui" name="ai-panel-maximize" size={14} />
                </div>
                <div
                  className="image-action-btn delete"
                  role="button"
                  tabIndex={0}
                  onClick={handleDelete}
                  title="删除"
                >
                  <Icon iconSet="ui" name="delete" size={14} />
                </div>
              </div>
            )}

            <img
              ref={imageRef}
              src={src}
              alt={alt || ''}
              title={title || ''}
              style={{
                width: displayWidth ? `${displayWidth}px` : 'auto',
                height: displayHeight ? `${displayHeight}px` : 'auto',
                transform: rotation ? `rotate(${rotation}deg)` : undefined,
              }}
              draggable={false}
            />
            
            {selected && (
              <>
                <div className="image-resize-handle nw" onMouseDown={(e) => handleMouseDown(e, 'nw')} />
                <div className="image-resize-handle ne" onMouseDown={(e) => handleMouseDown(e, 'ne')} />
                <div className="image-resize-handle sw" onMouseDown={(e) => handleMouseDown(e, 'sw')} />
                <div className="image-resize-handle se" onMouseDown={(e) => handleMouseDown(e, 'se')} />
                <div className="image-resize-handle e" onMouseDown={(e) => handleMouseDown(e, 'e')} />
                <div className="image-resize-handle w" onMouseDown={(e) => handleMouseDown(e, 'w')} />
              </>
            )}
          </div>
        )}

        {/* 链接样式 */}
        {displayStyle === 'link' && (
          <div className="image-link-display">
            <Icon iconSet="ui" name="image-link-style" size={16} />
            <span className="image-link-text">{caption || getFileName()}</span>
          </div>
        )}

        {/* 卡片样式 */}
        {displayStyle === 'card' && (
          <div className="image-card-display">
            <div className="image-card-preview">
              <img
                ref={imageRef}
                src={src}
                alt={alt || ''}
                draggable={false}
              />
            </div>
            <div className="image-card-info">
              <span className="image-card-name">{caption || getFileName()}</span>
              <span className="image-card-type">图片</span>
            </div>
          </div>
        )}

        {/* 描述输入框 - 仅在编辑状态时显示 */}
        {showCaption && isEditingCaption && displayStyle === 'default' && (
          <div className="image-caption-container">
            <input
              type="text"
              className="image-caption-input"
              placeholder="添加图片描述..."
              value={caption}
              onChange={(e) => handleCaptionChange(e.target.value)}
              autoFocus
              onBlur={() => setIsEditingCaption(false)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') {
                  setIsEditingCaption(false);
                }
              }}
              onKeyUp={(e) => e.stopPropagation()}
              onKeyPress={(e) => e.stopPropagation()}
            />
          </div>
        )}

        {/* 描述文本显示 - 描述区域打开且有描述且不在编辑状态时显示 */}
        {showCaption && caption && !isEditingCaption && displayStyle === 'default' && (
          <div 
            className="image-caption-display"
            role="button"
            tabIndex={0}
            onClick={() => setIsEditingCaption(true)}
          >
            {caption}
          </div>
        )}
      </div>

      {/* 全屏显示遮罩 */}
      {isFullscreen && (
        <div className="image-fullscreen-overlay" onClick={handleCloseFullscreen}>
          <div className="image-fullscreen-container">
            <img src={src} alt={alt || ''} />
            <div
              className="image-fullscreen-close"
              role="button"
              tabIndex={0}
              onClick={handleCloseFullscreen}
              title="关闭"
            >
              <Icon iconSet="ui" name="close" size={24} />
            </div>
          </div>
        </div>
      )}
    </NodeViewWrapper>
  );
};

export default ResizableImageComponent;
