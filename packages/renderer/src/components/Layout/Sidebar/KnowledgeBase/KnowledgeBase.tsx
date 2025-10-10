/**
 * 知识库主组件
 * 功能：知识库管理界面的主入口
 * 描述：整合所有知识库子组件，提供完整的知识库管理功能
 */

import React, { useState, useEffect, useCallback } from 'react';
import { KnowledgeGroup, KnowledgeItem, KnowledgeGroupType } from './types';
import { KnowledgeBaseGroup } from './KnowledgeBaseGroup';
import { CreateKnowledgeDialog, KnowledgeBaseData } from './CreateKnowledgeDialog';
import { knowledgeBaseService } from './knowledgeBaseService';
import { SearchIcon, RefreshIcon } from './KnowledgeBaseIcons';
import { Input } from '../../../ui/input';
import './KnowledgeBase.scss';

export const KnowledgeBase: React.FC = () => {
  // 状态管理
  const [groups, setGroups] = useState<KnowledgeGroup[]>([
    { type: 'created', title: '我创建的', expanded: true, items: [] },
  ]);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [selectedItem, setSelectedItem] = useState<KnowledgeItem | undefined>();
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<KnowledgeItem | undefined>();

  // 初始化：从存储加载数据
  useEffect(() => {
    loadKnowledgeBase();
  }, []);

  // 监听删除事件（从知识库视图触发）
  useEffect(() => {
    const handleDeleteFromView = (event: Event) => {
      const customEvent = event as CustomEvent<{ itemId: string }>;
      const { itemId } = customEvent.detail;
      
      // 查找并删除对应的项
      const findAndDeleteItem = (items: KnowledgeItem[]): KnowledgeItem | null => {
        for (const item of items) {
          if (item.id === itemId) {
            handleDeleteKnowledge(item);
            return item;
          }
          if (item.children) {
            const found = findAndDeleteItem(item.children);
            if (found) return found;
          }
        }
        return null;
      };
      
      const createdGroup = groups.find(g => g.type === 'created');
      if (createdGroup) {
        findAndDeleteItem(createdGroup.items);
      }
    };

    window.addEventListener('delete-knowledge-item', handleDeleteFromView as EventListener);
    
    return () => {
      window.removeEventListener('delete-knowledge-item', handleDeleteFromView as EventListener);
    };
  }, [groups]);

  // 加载知识库数据
  const loadKnowledgeBase = useCallback(() => {
    const data = knowledgeBaseService.loadFromStorage();
    setGroups((prevGroups) =>
      prevGroups.map((group) => ({
        ...group,
        items: data.created,
      }))
    );
  }, []);

  // 切换分组展开状态
  const handleToggleGroupExpanded = useCallback((groupType: KnowledgeGroupType) => {
    setGroups((prevGroups) =>
      prevGroups.map((group) =>
        group.type === groupType ? { ...group, expanded: !group.expanded } : group
      )
    );
  }, []);

  // 切换项展开状态
  const handleToggleItemExpanded = useCallback((itemId: string) => {
    setExpandedItems((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  }, []);

  // 选择项
  const handleItemClick = useCallback(async (item: KnowledgeItem) => {
    // 更新选中状态
    setSelectedItem(item);
    
    // 获取所有项（用于展示知识库视图）
    const getAllItems = (): KnowledgeItem[] => {
      const createdGroup = groups.find(g => g.type === 'created');
      return createdGroup?.items || [];
    };
    
    // 触发打开知识库事件，在编辑器中创建知识库类型标签页
    window.dispatchEvent(new CustomEvent('open-knowledge', {
      detail: {
        id: item.id,
        title: item.title,  // 使用知识库项的标题作为标签页名称
        description: item.metadata?.description || '',  // 传递知识库描述
        items: getAllItems(),  // 传递所有知识库项
        knowledgeData: {
          id: item.id,
          items: getAllItems()
        }
      }
    }));
    
    console.log('[KnowledgeBase] 打开知识库:', item.title);
  }, [groups]);

  // 显示创建对话框
  const handleShowCreateDialog = useCallback(() => {
    setEditingItem(undefined);
    setShowCreateDialog(true);
  }, []);

  // 关闭对话框
  const handleCloseDialog = useCallback(() => {
    setShowCreateDialog(false);
    setEditingItem(undefined);
  }, []);

  // 删除知识库
  const handleDeleteKnowledge = useCallback(
    (item: KnowledgeItem) => {
      // 确认删除
      const confirmed = window.confirm(
        `确定要删除${item.type === 'folder' ? '知识库' : '文件'}"${item.title}"吗？此操作无法撤销。`
      );
      
      if (!confirmed) {
        return;
      }

      try {
        // 从存储中删除
        knowledgeBaseService.deleteKnowledgeBase(item.id);
        
        // 重新加载数据
        loadKnowledgeBase();
        
        // 如果删除的是当前选中项，清除选中状态
        if (selectedItem?.id === item.id) {
          setSelectedItem(undefined);
        }
        
        console.log('删除成功:', item.title);
      } catch (error) {
        console.error('删除失败:', error);
        alert('删除失败，请重试');
      }
    },
    [loadKnowledgeBase, selectedItem]
  );

  // 编辑知识库（仅文件夹）
  const handleEditKnowledge = useCallback((item: KnowledgeItem) => {
    if (item.type !== 'folder') {
      return;
    }
    setEditingItem(item);
    setShowCreateDialog(true);
  }, []);

  // 处理编辑保存
  const handleUpdateKnowledge = useCallback(
    async (id: string, data: KnowledgeBaseData) => {
      try {
        // 如果上传了新封面，转换为 Base64
        let coverBase64: string | undefined = data.coverBase64;
        if (data.cover) {
          coverBase64 = await knowledgeBaseService.fileToBase64(data.cover);
        }

        // 更新知识库数据
        knowledgeBaseService.updateKnowledgeBase(id, {
          title: data.name,
          metadata: {
            cover: coverBase64,
            description: data.description,
          },
        });

        // 重新加载数据
        loadKnowledgeBase();

        // 关闭对话框
        setShowCreateDialog(false);
        setEditingItem(undefined);

        console.log('更新成功:', data.name);
      } catch (error) {
        console.error('更新失败:', error);
        alert('更新失败，请重试');
      }
    },
    [loadKnowledgeBase]
  );

  // 添加到聊天
  const handleAddToChat = useCallback((item: KnowledgeItem) => {
    // TODO: 实现添加到聊天功能
    console.log('添加到聊天:', item);
    alert(`已将"${item.title}"添加到聊天上下文`);
  }, []);

  // 处理创建知识库
  const handleCreateKnowledge = useCallback(
    async (data: KnowledgeBaseData) => {
      try {
        // 创建知识库文件夹项
        const knowledgeBaseId = `kb_${Date.now()}`;
        
        // 如果有封面，转换为 Base64
        let coverBase64: string | undefined;
        if (data.cover) {
          coverBase64 = await knowledgeBaseService.fileToBase64(data.cover);
        }
        
        const folderItem: KnowledgeItem = {
          id: knowledgeBaseId,
          title: data.name,
          type: 'folder',
          group: 'created',
          children: [],
          metadata: {
            cover: coverBase64,
            description: data.description,
          },
        };

        // 保存到存储
        knowledgeBaseService.addItem(folderItem);

        // 重新加载知识库
        loadKnowledgeBase();

        // 关闭对话框
        setShowCreateDialog(false);

        console.log(`成功创建知识库: ${data.name}`);
      } catch (error) {
        console.error('创建知识库失败:', error);
      }
    },
    [loadKnowledgeBase]
  );

  // 刷新知识库
  const handleRefresh = useCallback(() => {
    loadKnowledgeBase();
  }, [loadKnowledgeBase]);

  // 搜索处理
  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    // TODO: 实现搜索功能
  }, []);


  return (
    <div className="knowledge-base">
      {/* 搜索栏 */}
      <div 
        className="knowledge-base__search"
        style={{ borderColor: 'var(--border-color)' }}
      >
        <div className="knowledge-base__search-input-wrapper">
          <SearchIcon className="knowledge-base__search-icon" />
          <Input
            type="text"
            className="knowledge-base__search-input"
            placeholder="搜索知识库..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
          />
        </div>
      </div>

      {/* 知识库分组列表 */}
      <div className="knowledge-base__content">
        {groups.map((group) => (
          <KnowledgeBaseGroup
            key={group.type}
            group={group}
            expandedItems={expandedItems}
            selectedItemId={selectedItem?.id}
            onToggleGroupExpanded={() => handleToggleGroupExpanded(group.type)}
            onToggleItemExpanded={handleToggleItemExpanded}
            onItemClick={handleItemClick}
            onAddClick={handleShowCreateDialog}
            onEdit={handleEditKnowledge}
            onDelete={handleDeleteKnowledge}
            onAddToChat={handleAddToChat}
          />
        ))}
      </div>

      {/* 底部工具栏 */}
      <div 
        className="knowledge-base__footer"
        style={{ borderColor: 'var(--border-color)' }}
      >
        <button
          className="knowledge-base__footer-button"
          onClick={handleRefresh}
          style={{
            backgroundColor: 'var(--button-bg)',
            color: 'var(--button-fg)',
          }}
          title="刷新知识库"
        >
          <RefreshIcon className="icon-refresh" />
          <span>刷新</span>
        </button>
      </div>

      {/* 创建/编辑知识库对话框 */}
      <CreateKnowledgeDialog
        visible={showCreateDialog}
        onClose={handleCloseDialog}
        onCreate={handleCreateKnowledge}
        editItem={editingItem}
        onEdit={handleUpdateKnowledge}
      />
    </div>
  );
};

