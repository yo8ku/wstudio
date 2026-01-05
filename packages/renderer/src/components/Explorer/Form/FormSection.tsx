/**
 * 表单Section组件
 * 在资源管理器中显示表单和分组列表，支持折叠展开和拖动调整高度
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import ExplorerSection from '../ExplorerSection';
import { Icon } from '../../Icons/Icon';
import { ContextMenu, type ContextMenuItem } from '../Common/ContextMenu';
import { CustomScrollbar } from '../../common/CustomScrollbar';
import { FormItem, FormGroupItem } from './types';
import './FormSection.scss';

// 默认高度配置
const DEFAULT_HEIGHT = 200;
const MIN_HEIGHT = 100;
const MAX_HEIGHT = 500;
const COLLAPSE_THRESHOLD = 50; // 低于此高度时自动折叠

export interface FormSectionProps {
  /** 表单列表 */
  forms?: FormItem[];
  /** 分组列表 */
  groups?: FormGroupItem[];
  /** 选中的表单ID */
  selectedFormId?: string;
  /** 选中的分组ID */
  selectedGroupId?: string;
  /** 点击表单项 */
  onFormClick?: (item: FormItem) => void;
  /** 双击表单项 */
  onFormDoubleClick?: (item: FormItem) => void;
  /** 点击分组项 */
  onGroupClick?: (item: FormGroupItem) => void;
  /** 切换分组展开状态 */
  onGroupToggle?: (item: FormGroupItem) => void;
  /** 新建表单（可选传入分组ID） */
  onNewForm?: (groupId?: string | null) => void;
  /** 新建分组 */
  onNewGroup?: (name: string) => void;
  /** 展开状态变化 */
  onExpandedChange?: (expanded: boolean) => void;
  /** 打开表单 */
  onOpenForm?: (item: FormItem) => void;
  /** 在新选项卡打开表单 */
  onOpenFormInNewTab?: (item: FormItem) => void;
  /** 重命名表单（传入新名称） */
  onRenameForm?: (item: FormItem, newName: string) => void;
  /** 删除表单 */
  onDeleteForm?: (item: FormItem) => void;
  /** 重命名分组（传入新名称） */
  onRenameGroup?: (item: FormGroupItem, newName: string) => void;
  /** 删除分组 */
  onDeleteGroup?: (item: FormGroupItem) => void;
}

/**
 * 表单面板
 * 显示工作区中的表单和分组列表
 */
export const FormSection: React.FC<FormSectionProps> = ({
  forms = [],
  groups = [],
  selectedFormId,
  selectedGroupId,
  onFormClick,
  onFormDoubleClick,
  onGroupClick,
  onGroupToggle,
  onNewForm,
  onNewGroup,
  onExpandedChange,
  onOpenForm,
  onOpenFormInNewTab,
  onRenameForm,
  onDeleteForm,
  onRenameGroup,
  onDeleteGroup,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  // 右键菜单状态
  const [contextMenuState, setContextMenuState] = useState<{
    position: { x: number; y: number };
    items: ContextMenuItem[];
  } | null>(null);
  // 内联编辑状态
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingType, setEditingType] = useState<'form' | 'group' | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  // 拖动调整高度状态
  const [contentHeight, setContentHeight] = useState(DEFAULT_HEIGHT);
  const [isResizing, setIsResizing] = useState(false);
  const startYRef = useRef(0);
  const startHeightRef = useRef(0);

  // 处理新建按钮点击，显示菜单
  const handleNewClick = useCallback((event?: React.MouseEvent<HTMLButtonElement>) => {
    if (!event) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setMenuPosition({
      x: rect.left,
      y: rect.bottom + 4,
    });
  }, []);

  // 关闭菜单
  const handleCloseMenu = useCallback(() => {
    setMenuPosition(null);
  }, []);

  // 关闭右键菜单
  const handleCloseContextMenu = useCallback(() => {
    setContextMenuState(null);
  }, []);

  // 开始编辑表单名称
  const startEditForm = useCallback((form: FormItem) => {
    setEditingId(form.id);
    setEditingType('form');
    setEditingValue(form.name);
  }, []);

  // 开始编辑分组名称
  const startEditGroup = useCallback((group: FormGroupItem) => {
    setEditingId(group.id);
    setEditingType('group');
    setEditingValue(group.name);
  }, []);

  // 确认编辑
  const confirmEdit = useCallback(() => {
    if (!editingId || !editingType || !editingValue.trim()) {
      setEditingId(null);
      setEditingType(null);
      setEditingValue('');
      return;
    }

    if (editingType === 'form') {
      const form = forms.find(f => f.id === editingId);
      if (form && editingValue.trim() !== form.name) {
        onRenameForm?.(form, editingValue.trim());
      }
    } else if (editingType === 'group') {
      const group = groups.find(g => g.id === editingId);
      if (group && editingValue.trim() !== group.name) {
        onRenameGroup?.(group, editingValue.trim());
      }
    }

    setEditingId(null);
    setEditingType(null);
    setEditingValue('');
  }, [editingId, editingType, editingValue, forms, groups, onRenameForm, onRenameGroup]);

  // 取消编辑
  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditingType(null);
    setEditingValue('');
  }, []);

  // 处理编辑输入框键盘事件
  const handleEditKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      confirmEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
  }, [confirmEdit, cancelEdit]);

  // 编辑输入框自动聚焦
  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  // 拖动调整高度的鼠标事件处理
  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    startYRef.current = e.clientY;
    startHeightRef.current = contentHeight;
  }, [contentHeight]);

  // 拖动过程中的鼠标移动和释放事件
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      // 向上拖动是负数，向下拖动是正数
      // 因为手柄在顶部，向上拖应该增加高度
      const deltaY = startYRef.current - e.clientY;
      let newHeight = startHeightRef.current + deltaY;
      
      // 如果高度低于折叠阈值，自动折叠
      if (newHeight < COLLAPSE_THRESHOLD) {
        setIsResizing(false);
        setIsExpanded(false);
        onExpandedChange?.(false);
        return;
      }
      
      newHeight = Math.min(Math.max(newHeight, MIN_HEIGHT), MAX_HEIGHT);
      setContentHeight(newHeight);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, onExpandedChange]);

  // 构建分组右键菜单
  const buildGroupContextMenu = useCallback((group: FormGroupItem): ContextMenuItem[] => {
    return [
      {
        id: 'new-form-in-group',
        label: '新建表单',
        icon: 'table-properties',
        onClick: () => {
          onNewForm?.(group.id);
        },
      },
      {
        id: 'group-separator-1',
        label: '',
        separator: true,
      },
      {
        id: 'rename-group',
        label: '重命名',
        icon: 'edit',
        onClick: () => {
          startEditGroup(group);
        },
      },
      {
        id: 'delete-group',
        label: '删除分组',
        icon: 'delete',
        onClick: () => {
          onDeleteGroup?.(group);
        },
      },
    ];
  }, [onNewForm, startEditGroup, onDeleteGroup]);

  // 构建表单右键菜单
  const buildFormContextMenu = useCallback((form: FormItem): ContextMenuItem[] => {
    return [
      {
        id: 'open-form',
        label: '打开表单',
        icon: 'table-properties',
        onClick: () => {
          onOpenForm?.(form);
        },
      },
      {
        id: 'open-form-in-new-tab',
        label: '在新选项卡打开',
        icon: 'new-file',
        onClick: () => {
          onOpenFormInNewTab?.(form);
        },
      },
      {
        id: 'form-separator-1',
        label: '',
        separator: true,
      },
      {
        id: 'rename-form',
        label: '重命名',
        icon: 'edit',
        onClick: () => {
          startEditForm(form);
        },
      },
      {
        id: 'delete-form',
        label: '删除表单',
        icon: 'delete',
        onClick: () => {
          onDeleteForm?.(form);
        },
      },
    ];
  }, [onOpenForm, onOpenFormInNewTab, startEditForm, onDeleteForm]);

  // 处理分组右键菜单
  const handleGroupContextMenu = useCallback((e: React.MouseEvent, group: FormGroupItem) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenuState({
      position: { x: e.clientX, y: e.clientY },
      items: buildGroupContextMenu(group),
    });
  }, [buildGroupContextMenu]);

  // 处理表单右键菜单
  const handleFormContextMenu = useCallback((e: React.MouseEvent, form: FormItem) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenuState({
      position: { x: e.clientX, y: e.clientY },
      items: buildFormContextMenu(form),
    });
  }, [buildFormContextMenu]);

  // 计算下一个分组编号
  const getNextGroupNumber = useCallback((): number => {
    // 查找所有以"分组"开头的分组名称，提取数字
    const groupNumbers = groups
      .map(g => {
        const match = g.name.match(/^分组(\d+)$/);
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter(n => n > 0);
    
    // 返回最大数字 + 1，如果没有则返回 1
    return groupNumbers.length > 0 ? Math.max(...groupNumbers) + 1 : 1;
  }, [groups]);

  // 构建菜单项
  const buildMenuItems = useCallback((): ContextMenuItem[] => {
    return [
      {
        id: 'new-form',
        label: '新建表单',
        icon: 'table-properties',
        onClick: () => {
          // 如果选中了分组，则在该分组下创建表单
          onNewForm?.(selectedGroupId || null);
        },
      },
      {
        id: 'new-group',
        label: '新建分组',
        icon: 'form-folder',
        onClick: () => {
          const groupName = `分组${getNextGroupNumber()}`;
          onNewGroup?.(groupName);
        },
      },
    ];
  }, [onNewForm, onNewGroup, selectedGroupId, getNextGroupNumber]);

  // 构建空白区域右键菜单
  const buildBlankAreaContextMenu = useCallback((): ContextMenuItem[] => {
    return [
      {
        id: 'new-form',
        label: '新建表单',
        icon: 'table-properties',
        onClick: () => {
          onNewForm?.(null);
        },
      },
      {
        id: 'new-group',
        label: '新建分组',
        icon: 'form-folder',
        onClick: () => {
          const groupName = `分组${getNextGroupNumber()}`;
          onNewGroup?.(groupName);
        },
      },
    ];
  }, [onNewForm, onNewGroup, getNextGroupNumber]);

  // 处理空白区域右键菜单
  const handleBlankAreaContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenuState({
      position: { x: e.clientX, y: e.clientY },
      items: buildBlankAreaContextMenu(),
    });
  }, [buildBlankAreaContextMenu]);

  const actions = [
    {
      id: 'new-form',
      icon: <Icon name="plus" size={14} />,
      tooltip: '新建',
      onClick: handleNewClick,
    },
  ];

  const handleExpandChange = (expanded: boolean) => {
    setIsExpanded(expanded);
    onExpandedChange?.(expanded);
  };

  // 渲染分组项
  const renderGroupItem = (group: FormGroupItem, depth: number = 0) => {
    const groupForms = forms.filter(f => f.groupId === group.id);
    const childGroups = groups.filter(g => g.parentId === group.id);
    const isEditing = editingId === group.id && editingType === 'group';

    return (
      <div key={group.id} className="form-group-wrapper">
        <div
          className={`form-group-item ${selectedGroupId === group.id ? 'selected' : ''}`}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
          onClick={() => !isEditing && onGroupClick?.(group)}
          onDoubleClick={() => !isEditing && onGroupToggle?.(group)}
          onContextMenu={(e) => handleGroupContextMenu(e, group)}
        >
          <span 
            className="group-toggle"
            onClick={(e) => {
              e.stopPropagation();
              onGroupToggle?.(group);
            }}
          >
            <Icon 
              name="chevron-right" 
              size={14} 
              style={{ transform: group.isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
            />
          </span>
          <Icon name="form-folder" iconSet="ui" size={16} className="item-icon" />
          {isEditing ? (
            <input
              ref={editInputRef}
              type="text"
              className="inline-edit-input"
              value={editingValue}
              onChange={(e) => setEditingValue(e.target.value)}
              onKeyDown={handleEditKeyDown}
              onBlur={confirmEdit}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="item-name">{group.name}</span>
          )}
        </div>
        {group.isExpanded && (
          <div className="form-group-children">
            {childGroups.map(child => renderGroupItem(child, depth + 1))}
            {groupForms.map(form => renderFormItem(form, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  // 渲染表单项
  const renderFormItem = (item: FormItem, depth: number = 0) => {
    // 表单项需要额外缩进以与分组名称对齐（跳过折叠图标宽度 20px）
    const baseIndent = depth * 12 + 8;
    const formIndent = baseIndent + 20;
    const isEditing = editingId === item.id && editingType === 'form';
    
    return (
      <div
        key={item.id}
        className={`form-item ${selectedFormId === item.id ? 'selected' : ''}`}
        style={{ paddingLeft: `${formIndent}px` }}
        onClick={() => !isEditing && onFormClick?.(item)}
        onDoubleClick={() => !isEditing && onFormDoubleClick?.(item)}
        onContextMenu={(e) => handleFormContextMenu(e, item)}
      >
        <Icon name="table-properties" size={16} className="item-icon" />
        {isEditing ? (
          <input
            ref={editInputRef}
            type="text"
            className="inline-edit-input"
            value={editingValue}
            onChange={(e) => setEditingValue(e.target.value)}
            onKeyDown={handleEditKeyDown}
            onBlur={confirmEdit}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="item-name">{item.name}</span>
        )}
      </div>
    );
  };

  // 获取根级别的分组和表单
  const rootGroups = groups.filter(g => g.parentId === null);
  const rootForms = forms.filter(f => f.groupId === null);
  const hasContent = rootGroups.length > 0 || rootForms.length > 0;

  return (
    <div 
      className={`form-section ${isExpanded ? 'form-section--expanded' : 'form-section--collapsed'}`}
    >
      {/* 拖动时的全局遮罩层，防止鼠标样式切换 */}
      {isResizing && (
        <div className="form-resize-overlay" />
      )}
      {/* 拖动手柄 - 只在展开时显示 */}
      {isExpanded && (
        <div 
          className={`form-resize-handle ${isResizing ? 'resizing' : ''}`}
          onMouseDown={handleResizeMouseDown}
        />
      )}
      <ExplorerSection
        title="表单"
        expanded={isExpanded}
        actions={isExpanded ? actions : []}
        onExpandChange={handleExpandChange}
      >
        <CustomScrollbar
          className="form-content"
          style={{ height: `${contentHeight}px` }}
          onContextMenu={handleBlankAreaContextMenu}
        >
          {!hasContent ? (
            <div className="form-empty">
              <Icon name="table-properties" size={24} className="empty-icon" />
              <span>暂无表单</span>
            </div>
          ) : (
            <div className="form-list">
              {rootGroups.map(group => renderGroupItem(group))}
              {rootForms.map(form => renderFormItem(form))}
            </div>
          )}
        </CustomScrollbar>
      </ExplorerSection>

      {/* 新建菜单 */}
      {menuPosition && (
        <ContextMenu
          items={buildMenuItems()}
          position={menuPosition}
          onClose={handleCloseMenu}
        />
      )}

      {/* 右键菜单 */}
      {contextMenuState && (
        <ContextMenu
          items={contextMenuState.items}
          position={contextMenuState.position}
          onClose={handleCloseContextMenu}
        />
      )}
    </div>
  );
};

export default FormSection;
