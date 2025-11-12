/**
 * AI智能体视图组件
 * 功能：展示AI智能体分类内容页面
 * 描述：显示选中分类下的智能体列表和详情
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import './AIAgentView.scss';
import { Icon } from '../../../Icons/Icon';
import { EditIcon } from '../../../Icons/EditIcon';
import { DeleteIcon } from '../../../Icons/DeleteIcon';
import { SearchFilterIcon, ClearIcon } from '../../Sidebar/KnowledgeBase/KnowledgeBaseIcons';
import { CreateAgentDialog, AgentData } from '../../../AIAgent/CreateAgentDialog';
import { aiAgentService, AIAgent } from '../../../../services/AIAgentService';
import { modal } from '../../../../stores/modalStore';

interface AIAgentViewProps {
  categoryId: string;
  categoryName: string;
}

export const AIAgentView: React.FC<AIAgentViewProps> = ({ categoryId, categoryName }) => {
  const [searchKeyword, setSearchKeyword] = useState('');
  const [showSearchInput, setShowSearchInput] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [agents, setAgents] = useState<AIAgent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [editingAgent, setEditingAgent] = useState<AIAgent | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [currentTab, setCurrentTab] = useState<string>('all');
  const DEFAULT_OPACITY = 0.5; // 默认透明度
  const [scrollbarOpacity, setScrollbarOpacity] = useState(0); // 初始为0，完全隐藏
  const fadeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const animationFrameRef = useRef<NodeJS.Timeout | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const resizeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 加载所有分类
  const loadCategories = async () => {
    try {
      const allAgents = await aiAgentService.getAllAgents();
      const categories = new Set<string>();
      allAgents.forEach(agent => {
        if (agent.category && agent.category !== 'my') {
          categories.add(agent.category);
        }
      });
      setAllCategories(Array.from(categories).sort());
    } catch (error) {
      console.error('[AIAgentView] 加载分类失败:', error);
    }
  };

  // 加载智能体列表
  useEffect(() => {
    loadAgents();
    loadCategories();
  }, [categoryId]);

  // 监听分类变化，更新当前tab
  useEffect(() => {
    loadCategories();
  }, [agents]);

  const loadAgents = async () => {
    setIsLoading(true);
    try {
      let loadedAgents: AIAgent[];
      if (categoryId === 'my') {
        // "我的"分类：显示 category 为 'my' 的智能体
        loadedAgents = await aiAgentService.getMyAgents();
        
        // 根据当前 tab 过滤
        if (currentTab !== 'all') {
          loadedAgents = loadedAgents.filter(agent => agent.category === currentTab);
        }
      } else {
        // 其他分类：按分类过滤
        loadedAgents = await aiAgentService.getAgentsByCategory(categoryId);
      }
      setAgents(loadedAgents);
      console.log(`[AIAgentView] 加载 ${categoryName} 分类智能体: ${loadedAgents.length} 个`);
    } catch (error) {
      console.error('[AIAgentView] 加载智能体失败:', error);
      setAgents([]);
    } finally {
      setIsLoading(false);
    }
  };

  // 切换 tab
  const handleTabChange = (tab: string) => {
    setCurrentTab(tab);
  };

  // 当 currentTab 变化时重新加载
  useEffect(() => {
    if (categoryId === 'my') {
      loadAgents();
    }
  }, [currentTab]);

  // 搜索输入框显示时自动聚焦
  useEffect(() => {
    if (showSearchInput && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [showSearchInput]);

  // 淡入：立即中断所有动画并显示滚动条
  const fadeIn = useCallback(() => {
    // 取消所有进行中的动画
    if (fadeTimerRef.current) {
      clearTimeout(fadeTimerRef.current);
      fadeTimerRef.current = null;
    }
    if (animationFrameRef.current) {
      clearTimeout(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    // 立即设置为默认透明度
    setScrollbarOpacity(DEFAULT_OPACITY);
  }, [DEFAULT_OPACITY]);

  // 淡出：从默认透明度逐步降低到完全消失
  const fadeOut = useCallback(() => {
    const step = 0.01; // 每次减少 1%
    const interval = 10; // 10ms 减少一次
    let currentOpacity = DEFAULT_OPACITY;
    
    const animate = () => {
      currentOpacity -= step;
      
      // 降低到 0 时完全消失
      if (currentOpacity <= 0) {
        setScrollbarOpacity(0);
        return;
      }
      
      setScrollbarOpacity(currentOpacity);
      animationFrameRef.current = setTimeout(() => {
        animate();
      }, interval);
    };

    animate();
  }, [DEFAULT_OPACITY]);

  // 动态更新滚动条样式
  useEffect(() => {
    const tabsElement = tabsRef.current;
    if (!tabsElement) return;

    const styleId = 'ai-agent-tabs-scrollbar-style';
    let styleElement = document.getElementById(styleId) as HTMLStyleElement;
    
    if (!styleElement) {
      styleElement = document.createElement('style');
      styleElement.id = styleId;
      document.head.appendChild(styleElement);
    }

    // 获取 CSS 变量的颜色值并转换为 RGBA
    const getColorWithOpacity = (cssVar: string, fallbackColor: string, opacity: number) => {
      const computedStyle = getComputedStyle(document.documentElement);
      const color = computedStyle.getPropertyValue(cssVar).trim() || fallbackColor;
      
      // 如果颜色已经是 rgba 格式
      if (color.startsWith('rgba')) {
        return color.replace(/[\d.]+\)$/g, `${opacity})`);
      }
      
      // 如果是 rgb 格式，转换为 rgba
      if (color.startsWith('rgb')) {
        return color.replace('rgb', 'rgba').replace(')', `, ${opacity})`);
      }
      
      // 如果是十六进制，转换为 rgba
      if (color.startsWith('#')) {
        const hex = color.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${opacity})`;
      }
      
      return color;
    };

    // 使用主题配色，动态设置透明度
    const normalColor = getColorWithOpacity(
      '--ws-scrollbarSlider-background',
      'rgba(121, 121, 121, 0.4)',
      scrollbarOpacity
    );
    
    const hoverColor = getColorWithOpacity(
      '--ws-scrollbarSlider-hoverBackground',
      'rgba(100, 100, 100, 0.7)',
      scrollbarOpacity > 0 ? Math.max(scrollbarOpacity, 0.7) : 0
    );

    // 应用样式
    styleElement.textContent = `
      .ai-agent-view-tabs::-webkit-scrollbar-thumb {
        background: ${normalColor} !important;
      }
      .ai-agent-view-tabs::-webkit-scrollbar-thumb:hover {
        background: ${hoverColor} !important;
      }
    `;

    return () => {
      // 清理：移除动态样式
      const style = document.getElementById(styleId);
      if (style) {
        style.remove();
      }
    };
  }, [scrollbarOpacity]);

  // 处理tabs的横向滚轮滚动和自动隐藏
  useEffect(() => {
    const tabsElement = tabsRef.current;
    if (!tabsElement) return;

    let previousWidth = tabsElement.clientWidth;
    let isFirstResize = true;

    // 监听容器宽度变化
    const resizeObserver = new ResizeObserver(() => {
      const currentWidth = tabsElement.clientWidth;
      
      // 跳过第一次触发（初始化时）
      if (isFirstResize) {
        isFirstResize = false;
        previousWidth = currentWidth;
        return;
      }
      
      // 只在宽度真正变化时才处理
      if (currentWidth !== previousWidth && tabsElement.scrollWidth > tabsElement.clientWidth) {
        previousWidth = currentWidth;
        
        fadeIn();
        
        // 清除之前的定时器
        if (resizeTimeoutRef.current) {
          clearTimeout(resizeTimeoutRef.current);
        }
        
        // 宽度稳定后2秒，自动淡出滚动条
        resizeTimeoutRef.current = setTimeout(() => {
          fadeOut();
        }, 2000);
      }
    });

    resizeObserverRef.current = resizeObserver;

    const handleWheel = (e: WheelEvent) => {
      // 如果有横向滚动内容
      if (tabsElement.scrollWidth > tabsElement.clientWidth) {
        e.preventDefault();
        // 将纵向滚动转换为横向滚动
        tabsElement.scrollLeft += e.deltaY;
        
        // 显示滚动条（只要鼠标在区域内就保持显示）
        fadeIn();
        
        // 清除resize定时器（防止宽度变化的淡出干扰）
        if (resizeTimeoutRef.current) {
          clearTimeout(resizeTimeoutRef.current);
          resizeTimeoutRef.current = null;
        }
      }
    };

    const handleMouseEnter = () => {
      // 鼠标进入时显示滚动条并保持显示
      if (tabsElement.scrollWidth > tabsElement.clientWidth) {
        fadeIn();
        // 清除resize定时器（鼠标在区域内时保持显示）
        if (resizeTimeoutRef.current) {
          clearTimeout(resizeTimeoutRef.current);
          resizeTimeoutRef.current = null;
        }
      }
    };

    const handleMouseLeave = () => {
      // 鼠标离开时淡出滚动条
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
        resizeTimeoutRef.current = null;
      }
      fadeOut();
    };

    // 启动监听
    resizeObserver.observe(tabsElement);
    tabsElement.addEventListener('wheel', handleWheel, { passive: false });
    tabsElement.addEventListener('mouseenter', handleMouseEnter);
    tabsElement.addEventListener('mouseleave', handleMouseLeave);
    
    return () => {
      resizeObserver.disconnect();
      tabsElement.removeEventListener('wheel', handleWheel);
      tabsElement.removeEventListener('mouseenter', handleMouseEnter);
      tabsElement.removeEventListener('mouseleave', handleMouseLeave);
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
    };
  }, [allCategories, fadeIn, fadeOut]);

  // 清理定时器和动画
  useEffect(() => {
    return () => {
      if (fadeTimerRef.current) {
        clearTimeout(fadeTimerRef.current);
      }
      if (animationFrameRef.current) {
        clearTimeout(animationFrameRef.current);
      }
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }
    };
  }, []);

  // 切换搜索输入框显示
  const handleToggleSearch = () => {
    setShowSearchInput(prev => !prev);
    if (showSearchInput) {
      // 关闭时清空搜索
      setSearchKeyword('');
    }
  };

  // 清除搜索
  const handleClearSearch = () => {
    setSearchKeyword('');
    searchInputRef.current?.focus();
  };

  // 处理导入
  const handleImport = () => {
    console.log('[AIAgentView] 导入智能体');
    // TODO: 实现导入功能
  };

  // 处理创建智能体
  const handleCreate = () => {
    setEditingAgent(null); // 清除编辑状态
    setShowCreateDialog(true);
  };

  // 处理编辑智能体
  const handleEdit = (agent: AIAgent) => {
    setEditingAgent(agent);
    setShowCreateDialog(true);
  };

  // 处理创建智能体数据
  const handleCreateAgent = async (data: AgentData) => {
    console.log('[AIAgentView] 创建智能体数据', data);
    try {
      const newAgent = await aiAgentService.createAgent({
        name: data.name,
        emoji: data.emoji,
        prompt: data.prompt,
        knowledgeBaseIds: [],
        category: data.category,
      });
      
      if (newAgent) {
        console.log('[AIAgentView] 智能体创建成功:', newAgent.id);
        // 重新加载列表
        await loadAgents();
        // 触发全局事件通知其他组件
        window.dispatchEvent(new CustomEvent('ai-agent-updated'));
      } else {
        console.error('[AIAgentView] 智能体创建失败');
        alert('创建智能体失败，请重试');
      }
    } catch (error) {
      console.error('[AIAgentView] 创建智能体异常:', error);
      alert('创建智能体失败，请重试');
    }
  };

  // 处理更新智能体数据
  const handleUpdateAgent = async (id: string, data: AgentData) => {
    console.log('[AIAgentView] 更新智能体数据', id, data);
    try {
      const success = await aiAgentService.updateAgent(id, {
        name: data.name,
        emoji: data.emoji,
        prompt: data.prompt,
        category: data.category,
      });
      
      if (success) {
        console.log('[AIAgentView] 智能体更新成功:', id);
        // 重新加载列表
        await loadAgents();
        // 触发全局事件通知其他组件
        window.dispatchEvent(new CustomEvent('ai-agent-updated'));
      } else {
        console.error('[AIAgentView] 智能体更新失败');
        alert('更新智能体失败，请重试');
      }
    } catch (error) {
      console.error('[AIAgentView] 更新智能体异常:', error);
      alert('更新智能体失败，请重试');
    }
  };

  return (
    <div className="ai-agent-view">
      <div className="ai-agent-view-header">
        <h1 className="ai-agent-view-title">{categoryName}</h1>
        <div className="ai-agent-view-actions">
          {showSearchInput && (
            <div className="ai-agent-search-input-wrapper">
              <input
                ref={searchInputRef}
                type="text"
                className="ai-agent-search-input"
                placeholder="搜索智能体..."
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    handleToggleSearch();
                  }
                }}
              />
              {searchKeyword && (
                <button
                  className="ai-agent-search-clear-button"
                  onClick={handleClearSearch}
                  title="清除"
                >
                  <ClearIcon />
                </button>
              )}
            </div>
          )}
          <div
            className={`ai-agent-action-button ${showSearchInput ? 'active' : ''}`}
            onClick={handleToggleSearch}
            title="搜索过滤"
          >
            <SearchFilterIcon />
          </div>
          <div
            className="ai-agent-view-button"
            onClick={handleImport}
            style={{
              color: 'var(--ws-button-secondary-foreground)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--ws-button-secondary-hover-background)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '';
            }}
          >
            <Icon name="import" size={16} />
            <span>导入</span>
          </div>
          <div
            className="ai-agent-view-button ai-agent-view-button--primary"
            onClick={handleCreate}
            style={{
              color: 'var(--ws-button-secondary-foreground)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--ws-button-hover-background)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '';
            }}
          >
            <Icon name="plus" size={16} />
            <span>创建智能体</span>
          </div>
        </div>
      </div>

      {/* Tab 栏 - 仅在"我的"分类下显示 */}
      {categoryId === 'my' && (
        <div ref={tabsRef} className="ai-agent-view-tabs">
          <div
            className={`ai-agent-tab ${currentTab === 'all' ? 'active' : ''}`}
            onClick={() => handleTabChange('all')}
          >
            全部
          </div>
          {allCategories.map(category => (
            <div
              key={category}
              className={`ai-agent-tab ${currentTab === category ? 'active' : ''}`}
              onClick={() => handleTabChange(category)}
            >
              {category}
            </div>
          ))}
        </div>
      )}
      
      <div className="ai-agent-view-content">
        {isLoading ? (
          <div className="ai-agent-loading">
            <span>加载中...</span>
          </div>
        ) : agents.length > 0 ? (
          <div className="ai-agent-list">
            {agents.map(agent => (
              <div key={agent.id} className="ai-agent-card">
                <div className="ai-agent-card-header">
                  <span className="ai-agent-emoji">{agent.emoji}</span>
                  <h3 className="ai-agent-name">{agent.name}</h3>
                  <div className="ai-agent-card-actions">
                    <EditIcon 
                      size={16}
                      className="ai-agent-card-edit"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEdit(agent);
                      }}
                    />
                    <DeleteIcon 
                      size={16}
                      className="ai-agent-card-delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        modal.confirm({
                          title: '删除智能体',
                          description: `确定要删除"${agent.name}"吗？删除后将无法恢复。`,
                          confirmText: '删除',
                          onConfirm: async () => {
                            const success = await aiAgentService.deleteAgent(agent.id);
                            if (success) {
                              console.log('[AIAgentView] 智能体删除成功:', agent.id);
                              await loadAgents();
                              window.dispatchEvent(new CustomEvent('ai-agent-updated'));
                            } else {
                              console.error('[AIAgentView] 智能体删除失败');
                              alert('删除智能体失败，请重试');
                            }
                          },
                        });
                      }}
                    />
                  </div>
                </div>
                <p className="ai-agent-prompt">{agent.prompt}</p>
               
              </div>
            ))}
          </div>
        ) : (
          <div className="ai-agent-placeholder">
            <Icon 
              name="empty-state"
              size={120} 
              color="var(--ws-description-foreground)"
            />
            <p className="placeholder-hint">
              {categoryId === 'my' ? '还没有创建智能体，点击"创建智能体"按钮开始' : '没有找到相关智能体'}
            </p>
          </div>
        )}
      </div>

      {/* 创建/编辑智能体弹窗 */}
      <CreateAgentDialog
        visible={showCreateDialog}
        onClose={() => {
          setShowCreateDialog(false);
          setEditingAgent(null);
        }}
        onCreate={handleCreateAgent}
        onUpdate={handleUpdateAgent}
        defaultCategory={categoryId === 'my' ? '' : categoryId}
        existingCategories={allCategories}
        editingAgent={editingAgent ? {
          id: editingAgent.id,
          name: editingAgent.name,
          emoji: editingAgent.emoji,
          prompt: editingAgent.prompt,
          category: editingAgent.category || '',
        } : undefined}
      />
    </div>
  );
};
