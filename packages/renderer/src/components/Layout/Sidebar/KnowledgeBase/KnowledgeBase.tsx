/**
 * 知识库主组件
 * 功能：知识库管理界面的主入口
 * 描述：整合所有知识库子组件，提供完整的知识库管理功能
 */

import React, { useState, useEffect, useCallback } from 'react';
import { KnowledgeGroup, KnowledgeItem, KnowledgeGroupType, KnowledgeItemMetadata } from './types';
import { KnowledgeBaseGroup } from './KnowledgeBaseGroup';
import { CreateKnowledgeDialog, KnowledgeBaseData } from './CreateKnowledgeDialog';
import { KnowledgeBaseSettingsPanel, KnowledgeBaseSettings } from './KnowledgeBaseSettingsPanel';
import { knowledgeBaseService } from './knowledgeBaseService';
import { SearchIcon, RefreshIcon } from './KnowledgeBaseIcons';
import { Input } from '../../../ui/input';
import { modal } from '../../../../stores/modalStore';
import { toastService } from '../../../../services/ToastService';
import { VectorStore } from '@note-studio/global-rag';
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
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [settingsItem, setSettingsItem] = useState<KnowledgeItem | null>(null);

  // 加载知识库数据
  const loadKnowledgeBase = useCallback(async () => {
    const data = await knowledgeBaseService.loadFromStorage();
    setGroups((prevGroups) =>
      prevGroups.map((group) => ({
        ...group,
        items: data.created,
      }))
    );
  }, []);

  // 删除知识库
  const handleDeleteKnowledge = useCallback(
    async (item: KnowledgeItem) => {
      // 使用自定义对话框确认删除
      modal.confirm({
        title: `删除${item.type === 'folder' ? '知识库' : '文件'}`,
        description: `确定要删除"${item.title}"吗？此操作无法撤销。`,
        confirmText: '删除',
        cancelText: '取消',
        onConfirm: async () => {
          try {
            // 在删除之前，先找到该文件所属的知识库ID（用于后续触发更新事件）
            const dataBeforeDelete = await knowledgeBaseService.loadFromStorage();
            const findKnowledgeBaseId = (items: KnowledgeItem[], targetId: string): string | null => {
              for (const kb of items) {
                if (kb.id === targetId) {
                  // 如果删除的就是知识库本身
                  return kb.id;
                }
                const findInChildren = (children: KnowledgeItem[], parentId: string): string | null => {
                  for (const child of children) {
                    if (child.id === targetId) {
                      return parentId; // 返回父知识库ID
                    }
                    if (child.children) {
                      const found = findInChildren(child.children, parentId);
                      if (found) return found;
                    }
                  }
                  return null;
                };
                if (kb.children) {
                  const found = findInChildren(kb.children, kb.id);
                  if (found) return found;
                }
              }
              return null;
            };
            
            const knowledgeBaseId = findKnowledgeBaseId(dataBeforeDelete.created, item.id);
            
            // 如果删除的是文件，需要删除物理文件
            if (item.type === 'file' && item.path) {
              try {
                // 调用 IPC 删除物理文件
                const deleteResult = await window.electron?.ipcRenderer?.invoke('delete-file', item.path);
                if (!deleteResult?.success) {
                  console.warn('[KnowledgeBase] 删除物理文件失败:', deleteResult?.error);
                  // 即使物理文件删除失败，也继续删除数据记录
                }
              } catch (error) {
                console.error('[KnowledgeBase] 删除物理文件异常:', error);
                // 即使物理文件删除失败，也继续删除数据记录
              }
            }
            
            // 从存储中删除（等待删除完成）
            await knowledgeBaseService.deleteKnowledgeBase(item.id);
            
            // 重新加载数据（确保数据已删除）
            await loadKnowledgeBase();
            
            // 如果删除的是当前选中项，清除选中状态
            if (selectedItem?.id === item.id) {
              setSelectedItem(undefined);
            }
            
            // 如果删除的是知识库本身，触发关闭标签页事件
            if (item.type === 'folder' && item.id) {
              window.dispatchEvent(new CustomEvent('close-knowledge-tab', {
                detail: { knowledgeId: item.id }
              }));
            }
            
            // 触发知识库更新事件，以便 EditorArea 更新标签页数据
            if (knowledgeBaseId) {
              window.dispatchEvent(new CustomEvent('knowledge-base-updated', {
                detail: { knowledgeId: knowledgeBaseId }
              }));
            }
            
            console.log('删除成功:', item.title);
            toastService.success(`已删除${item.type === 'folder' ? '知识库' : '文件'}"${item.title}"`);
            
            // 异步删除向量数据库数据，不阻塞UI
            // 使用 setTimeout 确保在下一个事件循环中执行，不阻塞当前操作
            setTimeout(async () => {
              try {
                const vectorStore = new VectorStore();
                await vectorStore.initialize();
                
                let vectorIds: string[] = [];
                
                if (item.type === 'file' && item.path) {
                  // 如果是文件，根据文件路径查询向量ID
                  vectorIds = await vectorStore.getIdsByMetadata({
                    filePath: item.path
                  });
                } else if (item.type === 'folder' && item.id) {
                  // 如果是知识库，根据知识库ID查询向量ID
                  vectorIds = await vectorStore.getIdsByMetadata({
                    knowledgeBaseId: item.id
                  });
                }
                
                // 如果有向量ID，删除它们
                if (vectorIds.length > 0) {
                  // VectorStore.deleteDocuments 接受数字数组，但实际Python端接受字符串
                  // 为了兼容，将字符串ID转换为数字ID
                  const numericIds = vectorIds.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
                  if (numericIds.length > 0) {
                    await vectorStore.deleteDocuments(numericIds);
                    console.log(`[KnowledgeBase] 已删除 ${numericIds.length} 个向量数据`);
                  }
                }
              } catch (error) {
                // 静默处理错误，不影响用户操作
                console.error('[KnowledgeBase] 删除向量数据失败:', error);
              }
            }, 0);
          } catch (error) {
            console.error('删除失败:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            toastService.error(`删除失败: ${errorMessage}`);
          }
        },
      });
    },
    [loadKnowledgeBase, selectedItem]
  );

  // 初始化：从存储加载数据
  useEffect(() => {
    loadKnowledgeBase();
  }, [loadKnowledgeBase]);

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
  }, [groups, handleDeleteKnowledge]);

  // 监听知识库更新事件（刷新数据以显示最新的处理状态）
  useEffect(() => {
    const handleKnowledgeBaseUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<{ knowledgeId: string }>;
      console.log('[KnowledgeBase] 知识库已更新，重新加载数据:', customEvent.detail.knowledgeId);
      // 重新加载知识库数据以更新处理状态
      loadKnowledgeBase();
    };

    window.addEventListener('knowledge-base-updated', handleKnowledgeBaseUpdated as EventListener);
    
    return () => {
      window.removeEventListener('knowledge-base-updated', handleKnowledgeBaseUpdated as EventListener);
    };
  }, [loadKnowledgeBase]);

  // 监听打开知识库设置事件（从知识库视图触发）
  useEffect(() => {
    const handleOpenKnowledgeSettings = (event: Event) => {
      const customEvent = event as CustomEvent<{ knowledgeId: string }>;
      const { knowledgeId } = customEvent.detail;
      
      // 查找对应的知识库项
      const findKnowledgeItem = (items: KnowledgeItem[], targetId: string): KnowledgeItem | null => {
        for (const item of items) {
          if (item.id === targetId && item.type === 'folder') {
            return item;
          }
          if (item.children) {
            const found = findKnowledgeItem(item.children, targetId);
            if (found) return found;
          }
        }
        return null;
      };
      
      const createdGroup = groups.find(g => g.type === 'created');
      if (createdGroup) {
        const targetItem = findKnowledgeItem(createdGroup.items, knowledgeId);
        if (targetItem && targetItem.type === 'folder') {
          setSettingsItem(targetItem);
          setShowSettingsPanel(true);
        } else {
          console.warn('[KnowledgeBase] 未找到知识库项:', knowledgeId);
        }
      }
    };

    window.addEventListener('open-knowledge-settings', handleOpenKnowledgeSettings as EventListener);
    
    return () => {
      window.removeEventListener('open-knowledge-settings', handleOpenKnowledgeSettings as EventListener);
    };
  }, [groups]);

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
    
    // 获取所有项（用于展示知识库视图标签）
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
    
    console.log('[KnowledgeBase] 打开知识库', item.title);
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

        // 更新知识库数据（等待更新完成）
        await knowledgeBaseService.updateKnowledgeBase(id, {
          title: data.name,
          metadata: {
            cover: coverBase64,
            description: data.description,
            lastModified: new Date(),
          },
        });

        // 重新加载数据（确保数据已更新）
        await loadKnowledgeBase();

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
    console.log('添加到聊天', item);
    alert(`已将"${item.title}"添加到聊天上下文`);
  }, []);

  // 打开设置面板
  const handleOpenSettings = useCallback((item: KnowledgeItem) => {
    if (item.type === 'folder') {
      setSettingsItem(item);
      setShowSettingsPanel(true);
    }
  }, []);

  // 关闭设置面板
  const handleCloseSettings = useCallback(() => {
    setShowSettingsPanel(false);
    setSettingsItem(null);
  }, []);

  // 保存设置
  const handleSaveSettings = useCallback(
    async (itemId: string, settings: KnowledgeBaseSettings, hasChanged: boolean) => {
      try {
        // 构建更新对象
        const metadataUpdate: Partial<KnowledgeItemMetadata> = {
          chunkSettings: {
            chunkSize: settings.chunkSize,
            chunkOverlap: settings.chunkOverlap,
            separators: settings.separators,
          },
          embeddingModel: settings.embeddingModel,
          // 如果配置已变更，设置 configChanged 标志；否则清除标志
          configChanged: hasChanged,
        };
        
        // 更新知识库设置
        await knowledgeBaseService.updateKnowledgeBase(itemId, {
          metadata: metadataUpdate,
        });

        // 重新加载数据（确保数据已更新）
        await loadKnowledgeBase();

        // 触发知识库更新事件，更新标签页标题
        window.dispatchEvent(new CustomEvent('knowledge-base-updated', {
          detail: { knowledgeId: itemId }
        }));

        // 显示保存成功提示
        toastService.success('知识库设置已保存');
      } catch (error) {
        console.error('设置保存失败:', error);
        const errorMessage = error instanceof Error ? error.message : '未知错误';
        toastService.error(`设置保存失败: ${errorMessage}`);
        throw error; // 抛出错误，让调用者知道保存失败
      }
    },
    [loadKnowledgeBase]
  );

  // 处理创建知识库
  const handleCreateKnowledge = useCallback(
    async (data: KnowledgeBaseData) => {
      try {
        // 创建知识库文件夹
        const knowledgeBaseId = `kb_${Date.now()}`;
        const now = new Date();
        
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
            createdAt: now,
            lastModified: now,
            // 设置默认嵌入模型
            embeddingModel: 'BAAI/bge-large-zh-v1.5',
            // 设置默认分块参数
            chunkSettings: {
              chunkSize: 1000,
              chunkOverlap: 200,
              separators: ['\n\n', '\n', '。', '！', '？', '.', '!', '?'],
            },
          },
        };

        // 保存到存储（等待保存完成）
        await knowledgeBaseService.addItem(folderItem);

        // 重新加载知识库（确保数据已保存）
        await loadKnowledgeBase();

        // 关闭对话框
        setShowCreateDialog(false);

        console.log(`成功创建知识库 ${data.name}`);
      } catch (error) {
        console.error('创建知识库失败', error);
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
      {showSettingsPanel ? (
        /* 知识库设置面板 */
        <KnowledgeBaseSettingsPanel
          visible={showSettingsPanel}
          item={settingsItem}
          onClose={handleCloseSettings}
          onSave={handleSaveSettings}
        />
      ) : (
        <>
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
                onSettings={handleOpenSettings}
              />
            ))}
          </div>

          {/* 底部工具栏 */}
          <div 
            className="knowledge-base__footer"
            style={{ borderColor: 'var(--ws-contrast-border)' }}
          >
            <button
              className="knowledge-base__footer-button"
              onClick={handleRefresh}
              style={{
                backgroundColor: 'var(--ws-button-background)',
                color: 'var(--ws-button-foreground)',
              }}
              title="刷新知识库"
            >
              <RefreshIcon className="icon-refresh" />
              <span>刷新</span>
            </button>
          </div>
        </>
      )}

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

