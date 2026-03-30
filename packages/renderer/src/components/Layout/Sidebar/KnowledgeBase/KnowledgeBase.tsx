/**
 * Knowledge base main component.
 * Manages knowledge base groups, dialogs, and settings interactions.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { KnowledgeGroup, KnowledgeItem, KnowledgeGroupType, KnowledgeItemMetadata } from './types';
import { KnowledgeBaseGroup } from './KnowledgeBaseGroup';
import { CreateKnowledgeDialog, KnowledgeBaseData } from './CreateKnowledgeDialog';
import { KnowledgeBaseSettingsPanel, KnowledgeBaseSettings } from './KnowledgeBaseSettingsPanel';
import { knowledgeBaseService } from './knowledgeBaseService';
import { RefreshIcon } from './KnowledgeBaseIcons';
import { modal } from '../../../../stores/modalStore';
import { toastService } from '../../../../services/ToastService';
import { VectorStore } from '@note-studio/global-rag';
import './KnowledgeBase.scss';

export const KnowledgeBase: React.FC = () => {
  const { t } = useTranslation();
  const translateText = (
    key: string,
    defaultValue: string,
    values?: Record<string, string>,
  ): string => String(t(key, values ? { defaultValue, ...values } : { defaultValue }));
  const translateItemType = useCallback((type: KnowledgeItem['type']): string => (
    type === 'folder'
      ? translateText('knowledgeBase.itemTypes.folder', 'Knowledge Base')
      : translateText('knowledgeBase.itemTypes.file', 'File')
  ), [translateText]);

  const [groups, setGroups] = useState<KnowledgeGroup[]>([
    { type: 'created', title: '', expanded: true, items: [] },
  ]);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [selectedItem, setSelectedItem] = useState<KnowledgeItem | undefined>();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<KnowledgeItem | undefined>();
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [settingsItem, setSettingsItem] = useState<KnowledgeItem | null>(null);

  const loadKnowledgeBase = useCallback(async () => {
    const data = await knowledgeBaseService.loadFromStorage();
    setGroups((prevGroups) =>
      prevGroups.map((group) => ({
        ...group,
        items: data.created,
      })),
    );
  }, []);

  const handleDeleteKnowledge = useCallback(
    async (item: KnowledgeItem) => {
      modal.confirm({
        title: translateText('knowledgeBase.main.deleteTitle', 'Delete {{type}}', {
          type: translateItemType(item.type),
        }),
        description: translateText(
          'knowledgeBase.main.deleteDescription',
          'Are you sure you want to delete {{type}} "{{title}}"? This action cannot be undone.',
          {
            type: translateItemType(item.type),
            title: item.title,
          },
        ),
        confirmText: translateText('knowledgeBase.main.confirmDelete', 'Delete'),
        cancelText: translateText('knowledgeBase.main.cancel', 'Cancel'),
        onConfirm: async () => {
          try {
            const dataBeforeDelete = await knowledgeBaseService.loadFromStorage();
            const findKnowledgeBaseId = (items: KnowledgeItem[], targetId: string): string | null => {
              for (const knowledgeBase of items) {
                if (knowledgeBase.id === targetId) {
                  return knowledgeBase.id;
                }

                const findInChildren = (children: KnowledgeItem[], parentId: string): string | null => {
                  for (const child of children) {
                    if (child.id === targetId) {
                      return parentId;
                    }
                    if (child.children) {
                      const found = findInChildren(child.children, parentId);
                      if (found) {
                        return found;
                      }
                    }
                  }
                  return null;
                };

                if (knowledgeBase.children) {
                  const found = findInChildren(knowledgeBase.children, knowledgeBase.id);
                  if (found) {
                    return found;
                  }
                }
              }
              return null;
            };

            const knowledgeBaseId = findKnowledgeBaseId(dataBeforeDelete.created, item.id);

            if (item.type === 'file' && item.path) {
              try {
                const deleteResult = await window.electron?.ipcRenderer?.invoke('delete-file', item.path);
                if (!deleteResult?.success) {
                  console.warn('[KnowledgeBase] Failed to delete physical file:', deleteResult?.error);
                }
              } catch (error) {
                console.error('[KnowledgeBase] Failed to delete physical file:', error);
              }
            }

            await knowledgeBaseService.deleteKnowledgeBase(item.id);
            await loadKnowledgeBase();

            if (selectedItem?.id === item.id) {
              setSelectedItem(undefined);
            }

            if (item.type === 'folder' && item.id) {
              window.dispatchEvent(new CustomEvent('close-knowledge-tab', {
                detail: { knowledgeId: item.id },
              }));
            }

            if (knowledgeBaseId) {
              window.dispatchEvent(new CustomEvent('knowledge-base-updated', {
                detail: { knowledgeId: knowledgeBaseId },
              }));
            }

            toastService.success(translateText('knowledgeBase.main.deleteSuccess', 'Deleted {{type}} "{{title}}"', {
              type: translateItemType(item.type),
              title: item.title,
            }));

            setTimeout(async () => {
              try {
                const vectorStore = new VectorStore();
                await vectorStore.initialize();

                let vectorIds: string[] = [];

                if (item.type === 'file' && item.path) {
                  vectorIds = await vectorStore.getIdsByMetadata({
                    filePath: item.path,
                  });
                } else if (item.type === 'folder' && item.id) {
                  vectorIds = await vectorStore.getIdsByMetadata({
                    knowledgeBaseId: item.id,
                  });
                }

                if (vectorIds.length > 0) {
                  await vectorStore.deleteDocuments(vectorIds);
                }
              } catch (error) {
                console.error('[KnowledgeBase] Failed to delete vector data:', error);
              }
            }, 0);
          } catch (error) {
            console.error('Failed to delete knowledge item:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            toastService.error(translateText('knowledgeBase.main.deleteFailed', 'Delete failed: {{message}}', {
              message: errorMessage,
            }));
          }
        },
      });
    },
    [loadKnowledgeBase, selectedItem, translateItemType, translateText],
  );

  useEffect(() => {
    loadKnowledgeBase();
  }, [loadKnowledgeBase]);

  useEffect(() => {
    const handleDeleteFromView = (event: Event) => {
      const customEvent = event as CustomEvent<{ itemId: string }>;
      const { itemId } = customEvent.detail;

      const findAndDeleteItem = (items: KnowledgeItem[]): KnowledgeItem | null => {
        for (const item of items) {
          if (item.id === itemId) {
            handleDeleteKnowledge(item);
            return item;
          }
          if (item.children) {
            const found = findAndDeleteItem(item.children);
            if (found) {
              return found;
            }
          }
        }
        return null;
      };

      const createdGroup = groups.find((group) => group.type === 'created');
      if (createdGroup) {
        findAndDeleteItem(createdGroup.items);
      }
    };

    window.addEventListener('delete-knowledge-item', handleDeleteFromView as EventListener);
    return () => {
      window.removeEventListener('delete-knowledge-item', handleDeleteFromView as EventListener);
    };
  }, [groups, handleDeleteKnowledge]);

  useEffect(() => {
    const handleKnowledgeBaseUpdated = () => {
      loadKnowledgeBase();
    };

    window.addEventListener('knowledge-base-updated', handleKnowledgeBaseUpdated as EventListener);
    return () => {
      window.removeEventListener('knowledge-base-updated', handleKnowledgeBaseUpdated as EventListener);
    };
  }, [loadKnowledgeBase]);

  useEffect(() => {
    const handleOpenKnowledgeSettings = (event: Event) => {
      const customEvent = event as CustomEvent<{ knowledgeId: string }>;
      const { knowledgeId } = customEvent.detail;

      const findKnowledgeItem = (items: KnowledgeItem[], targetId: string): KnowledgeItem | null => {
        for (const item of items) {
          if (item.id === targetId && item.type === 'folder') {
            return item;
          }
          if (item.children) {
            const found = findKnowledgeItem(item.children, targetId);
            if (found) {
              return found;
            }
          }
        }
        return null;
      };

      const createdGroup = groups.find((group) => group.type === 'created');
      if (!createdGroup) {
        return;
      }

      const targetItem = findKnowledgeItem(createdGroup.items, knowledgeId);
      if (targetItem && targetItem.type === 'folder') {
        setSettingsItem(targetItem);
        setShowSettingsPanel(true);
      }
    };

    window.addEventListener('open-knowledge-settings', handleOpenKnowledgeSettings as EventListener);
    return () => {
      window.removeEventListener('open-knowledge-settings', handleOpenKnowledgeSettings as EventListener);
    };
  }, [groups]);

  const handleToggleGroupExpanded = useCallback((groupType: KnowledgeGroupType) => {
    setGroups((prevGroups) =>
      prevGroups.map((group) =>
        group.type === groupType ? { ...group, expanded: !group.expanded } : group,
      ),
    );
  }, []);

  const handleToggleItemExpanded = useCallback((itemId: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  }, []);

  const handleItemClick = useCallback((item: KnowledgeItem) => {
    setSelectedItem(item);

    const getAllItems = (): KnowledgeItem[] => {
      const createdGroup = groups.find((group) => group.type === 'created');
      return createdGroup?.items || [];
    };

    window.dispatchEvent(new CustomEvent('open-knowledge', {
      detail: {
        id: item.id,
        title: item.title,
        description: item.metadata?.description || '',
        items: getAllItems(),
        knowledgeData: {
          id: item.id,
          items: getAllItems(),
        },
      },
    }));
  }, [groups]);

  const handleEditKnowledge = useCallback((item: KnowledgeItem) => {
    if (item.type !== 'folder') {
      return;
    }
    setEditingItem(item);
    setShowCreateDialog(true);
  }, []);

  const handleUpdateKnowledge = useCallback(
    async (id: string, data: KnowledgeBaseData) => {
      try {
        let coverBase64: string | undefined = data.coverBase64;
        if (data.cover) {
          coverBase64 = await knowledgeBaseService.fileToBase64(data.cover);
        }

        await knowledgeBaseService.updateKnowledgeBase(id, {
          title: data.name,
          metadata: {
            cover: coverBase64,
            description: data.description,
            lastModified: new Date(),
          },
        });

        await loadKnowledgeBase();
        setShowCreateDialog(false);
        setEditingItem(undefined);
      } catch (error) {
        console.error('Failed to update knowledge base:', error);
        alert(translateText('knowledgeBase.main.updateFailedRetry', 'Update failed. Please try again.'));
      }
    },
    [loadKnowledgeBase, translateText],
  );

  const handleAddToChat = useCallback((item: KnowledgeItem) => {
    console.log('Add knowledge item to chat:', item);
    alert(translateText('knowledgeBase.main.addToChatSuccess', 'Added "{{title}}" to the chat context', {
      title: item.title,
    }));
  }, [translateText]);

  const handleSaveSettings = useCallback(
    async (itemId: string, settings: KnowledgeBaseSettings, hasChanged: boolean) => {
      try {
        const metadataUpdate: Partial<KnowledgeItemMetadata> = {
          chunkSettings: {
            strategy: settings.strategy,
            chunkSize: settings.chunkSize,
            chunkOverlap: settings.chunkOverlap,
            separators: settings.separators,
            ...(settings.strategy === 'parent-child' && {
              parentChunkSize: settings.parentChunkSize,
              parentChunkOverlap: settings.parentChunkOverlap,
              childChunkSize: settings.childChunkSize,
              childChunkOverlap: settings.childChunkOverlap,
              childSeparators: settings.childSeparators,
            }),
          },
          configChanged: hasChanged,
        };

        await knowledgeBaseService.updateKnowledgeBase(itemId, {
          metadata: metadataUpdate,
        });

        await loadKnowledgeBase();
        window.dispatchEvent(new CustomEvent('knowledge-base-updated', {
          detail: { knowledgeId: itemId },
        }));
        toastService.success(translateText('knowledgeBase.main.settingsSaved', 'Knowledge base settings saved'));
      } catch (error) {
        console.error('Failed to save knowledge base settings:', error);
        const errorMessage = error instanceof Error
          ? error.message
          : translateText('knowledgeBase.main.unknownError', 'Unknown error');
        toastService.error(translateText('knowledgeBase.main.settingsSaveFailed', 'Failed to save settings: {{message}}', {
          message: errorMessage,
        }));
        throw error;
      }
    },
    [loadKnowledgeBase, translateText],
  );

  const handleCreateKnowledge = useCallback(
    async (data: KnowledgeBaseData) => {
      try {
        const knowledgeBaseId = `kb_${Date.now()}`;
        const now = new Date();

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
            embeddingModel: 'BAAI/bge-large-zh-v1.5',
            chunkSettings: {
              strategy: 'parent-child',
              chunkSize: 1000,
              chunkOverlap: 200,
              separators: ['\n\n', '\n', '。', '！', '？', '.', '!', '?'],
            },
          },
        };

        await knowledgeBaseService.addItem(folderItem);
        await loadKnowledgeBase();
        setShowCreateDialog(false);
      } catch (error) {
        console.error('Failed to create knowledge base:', error);
      }
    },
    [loadKnowledgeBase],
  );

  return (
    <div className="knowledge-base">
      {showSettingsPanel ? (
        <KnowledgeBaseSettingsPanel
          visible={showSettingsPanel}
          item={settingsItem}
          onClose={() => {
            setShowSettingsPanel(false);
            setSettingsItem(null);
          }}
          onSave={handleSaveSettings}
        />
      ) : (
        <>
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
                onAddClick={() => {
                  setEditingItem(undefined);
                  setShowCreateDialog(true);
                }}
                onEdit={handleEditKnowledge}
                onDelete={handleDeleteKnowledge}
                onAddToChat={handleAddToChat}
                onSettings={(item) => {
                  if (item.type === 'folder') {
                    setSettingsItem(item);
                    setShowSettingsPanel(true);
                  }
                }}
              />
            ))}
          </div>

          <div
            className="knowledge-base__footer"
            style={{ borderColor: 'var(--ws-contrast-border)' }}
          >
            <button
              className="knowledge-base__footer-button"
              onClick={() => {
                loadKnowledgeBase();
              }}
              style={{
                backgroundColor: 'var(--ws-button-background)',
                color: 'var(--ws-button-foreground)',
              }}
              title={translateText('knowledgeBase.main.refreshTitle', 'Refresh Knowledge Base')}
            >
              <RefreshIcon className="icon-refresh" />
              <span>{translateText('knowledgeBase.main.refresh', 'Refresh')}</span>
            </button>
          </div>
        </>
      )}

      <CreateKnowledgeDialog
        visible={showCreateDialog}
        onClose={() => {
          setShowCreateDialog(false);
          setEditingItem(undefined);
        }}
        onCreate={handleCreateKnowledge}
        editItem={editingItem}
        onEdit={handleUpdateKnowledge}
      />
    </div>
  );
};
