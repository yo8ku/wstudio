/**
 * 琛ㄥ崟Section缁勪欢
 * 鍦ㄨ祫婧愮鐞嗗櫒涓樉绀鸿〃鍗曞拰鍒嗙粍鍒楄〃锛屾敮鎸佹姌鍙犲睍寮€鍜屾嫋鍔ㄨ皟鏁撮珮搴?
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import ExplorerSection from '../ExplorerSection';
import { Icon } from '../../Icons/Icon';
import { ContextMenu, type ContextMenuItem } from '../Common/ContextMenu';
import { CustomScrollbar } from '../../common/CustomScrollbar';
import { FormItem, FormGroupItem } from './types';
import './FormSection.scss';

// 榛樿楂樺害閰嶇疆
const DEFAULT_HEIGHT = 200;
const MIN_HEIGHT = 100;
const MAX_HEIGHT = 500;
const COLLAPSE_THRESHOLD = 50; // 浣庝簬姝ら珮搴︽椂鑷姩鎶樺彔

export interface FormSectionProps {
  /** 琛ㄥ崟鍒楄〃 */
  forms?: FormItem[];
  /** 鍒嗙粍鍒楄〃 */
  groups?: FormGroupItem[];
  /** 閫変腑鐨勮〃鍗旾D */
  selectedFormId?: string;
  /** 閫変腑鐨勫垎缁処D */
  selectedGroupId?: string;
  /** 鐐瑰嚮琛ㄥ崟椤?*/
  onFormClick?: (item: FormItem) => void;
  /** 鍙屽嚮琛ㄥ崟椤?*/
  onFormDoubleClick?: (item: FormItem) => void;
  /** 鐐瑰嚮鍒嗙粍椤?*/
  onGroupClick?: (item: FormGroupItem) => void;
  /** 鍒囨崲鍒嗙粍灞曞紑鐘舵€?*/
  onGroupToggle?: (item: FormGroupItem) => void;
  /** 鏂板缓琛ㄥ崟锛堝彲閫変紶鍏ュ垎缁処D锛?*/
  onNewForm?: (groupId?: string | null) => void;
  /** 鏂板缓鍒嗙粍 */
  onNewGroup?: (name: string) => void;
  /** 灞曞紑鐘舵€佸彉鍖?*/
  onExpandedChange?: (expanded: boolean) => void;
  /** 鎵撳紑琛ㄥ崟 */
  onOpenForm?: (item: FormItem) => void;
  /** 鍦ㄦ柊閫夐」鍗℃墦寮€琛ㄥ崟 */
  onOpenFormInNewTab?: (item: FormItem) => void;
  /** 閲嶅懡鍚嶈〃鍗曪紙浼犲叆鏂板悕绉帮級 */
  onRenameForm?: (item: FormItem, newName: string) => void;
  /** 鍒犻櫎琛ㄥ崟 */
  onDeleteForm?: (item: FormItem) => void;
  /** 閲嶅懡鍚嶅垎缁勶紙浼犲叆鏂板悕绉帮級 */
  onRenameGroup?: (item: FormGroupItem, newName: string) => void;
  /** 鍒犻櫎鍒嗙粍 */
  onDeleteGroup?: (item: FormGroupItem) => void;
}

/**
 * 琛ㄥ崟闈㈡澘
 * 鏄剧ず宸ヤ綔鍖轰腑鐨勮〃鍗曞拰鍒嗙粍鍒楄〃
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
  const { t } = useTranslation();
  const translateText = useCallback((key: string, defaultValue: string): string => (
    String(t(key, { defaultValue }))
  ), [t]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  // 鍙抽敭鑿滃崟鐘舵€?
  const [contextMenuState, setContextMenuState] = useState<{
    position: { x: number; y: number };
    items: ContextMenuItem[];
  } | null>(null);
  // 鍐呰仈缂栬緫鐘舵€?
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingType, setEditingType] = useState<'form' | 'group' | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  // 鎷栧姩璋冩暣楂樺害鐘舵€?
  const [contentHeight, setContentHeight] = useState(DEFAULT_HEIGHT);
  const [isResizing, setIsResizing] = useState(false);
  const startYRef = useRef(0);
  const startHeightRef = useRef(0);

  const buildDefaultGroupName = useCallback((count: number): string => (
    translateText('formSection.defaults.groupName', '分组{{count}}').replace('{{count}}', String(count))
  ), [translateText]);

  // 澶勭悊鏂板缓鎸夐挳鐐瑰嚮锛屾樉绀鸿彍鍗?
  const handleNewClick = useCallback((event?: React.MouseEvent<HTMLButtonElement>) => {
    if (!event) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setMenuPosition({
      x: rect.left,
      y: rect.bottom + 4,
    });
  }, []);

  // 鍏抽棴鑿滃崟
  const handleCloseMenu = useCallback(() => {
    setMenuPosition(null);
  }, []);

  // 鍏抽棴鍙抽敭鑿滃崟
  const handleCloseContextMenu = useCallback(() => {
    setContextMenuState(null);
  }, []);

  // 寮€濮嬬紪杈戣〃鍗曞悕绉?
  const startEditForm = useCallback((form: FormItem) => {
    setEditingId(form.id);
    setEditingType('form');
    setEditingValue(form.name);
  }, []);

  // 寮€濮嬬紪杈戝垎缁勫悕绉?
  const startEditGroup = useCallback((group: FormGroupItem) => {
    setEditingId(group.id);
    setEditingType('group');
    setEditingValue(group.name);
  }, []);

  // 纭缂栬緫
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

  // 鍙栨秷缂栬緫
  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditingType(null);
    setEditingValue('');
  }, []);

  // 澶勭悊缂栬緫杈撳叆妗嗛敭鐩樹簨浠?
  const handleEditKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      confirmEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
  }, [confirmEdit, cancelEdit]);

  // 缂栬緫杈撳叆妗嗚嚜鍔ㄨ仛鐒?
  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  // 鎷栧姩璋冩暣楂樺害鐨勯紶鏍囦簨浠跺鐞?
  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    startYRef.current = e.clientY;
    startHeightRef.current = contentHeight;
  }, [contentHeight]);

  // 鎷栧姩杩囩▼涓殑榧犳爣绉诲姩鍜岄噴鏀句簨浠?
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      // 鍚戜笂鎷栧姩鏄礋鏁帮紝鍚戜笅鎷栧姩鏄鏁?
      // 鍥犱负鎵嬫焺鍦ㄩ《閮紝鍚戜笂鎷栧簲璇ュ鍔犻珮搴?
      const deltaY = startYRef.current - e.clientY;
      let newHeight = startHeightRef.current + deltaY;
      
      // 濡傛灉楂樺害浣庝簬鎶樺彔闃堝€硷紝鑷姩鎶樺彔
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

  // 鏋勫缓鍒嗙粍鍙抽敭鑿滃崟
  const buildGroupContextMenu = useCallback((group: FormGroupItem): ContextMenuItem[] => {
    return [
      {
        id: 'new-form-in-group',
        label: '鏂板缓琛ㄥ崟',
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
        label: '\u91CD\u547D\u540D',
        icon: 'edit',
        onClick: () => {
          startEditGroup(group);
        },
      },
      {
        id: 'delete-group',
        label: '鍒犻櫎鍒嗙粍',
        icon: 'delete',
        onClick: () => {
          onDeleteGroup?.(group);
        },
      },
    ];
  }, [onNewForm, startEditGroup, onDeleteGroup]);

  // 鏋勫缓琛ㄥ崟鍙抽敭鑿滃崟
  const buildFormContextMenu = useCallback((form: FormItem): ContextMenuItem[] => {
    return [
      {
        id: 'open-form',
        label: '鎵撳紑琛ㄥ崟',
        icon: 'table-properties',
        onClick: () => {
          onOpenForm?.(form);
        },
      },
      {
        id: 'open-form-in-new-tab',
        label: '鍦ㄦ柊閫夐」鍗℃墦寮€',
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
        label: '\u91CD\u547D\u540D',
        icon: 'edit',
        onClick: () => {
          startEditForm(form);
        },
      },
      {
        id: 'delete-form',
        label: '鍒犻櫎琛ㄥ崟',
        icon: 'delete',
        onClick: () => {
          onDeleteForm?.(form);
        },
      },
    ];
  }, [onOpenForm, onOpenFormInNewTab, startEditForm, onDeleteForm]);

  // 澶勭悊鍒嗙粍鍙抽敭鑿滃崟
  const handleGroupContextMenu = useCallback((e: React.MouseEvent, group: FormGroupItem) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenuState({
      position: { x: e.clientX, y: e.clientY },
      items: buildGroupContextMenu(group),
    });
  }, [buildGroupContextMenu]);

  // 澶勭悊琛ㄥ崟鍙抽敭鑿滃崟
  const handleFormContextMenu = useCallback((e: React.MouseEvent, form: FormItem) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenuState({
      position: { x: e.clientX, y: e.clientY },
      items: buildFormContextMenu(form),
    });
  }, [buildFormContextMenu]);

  // 璁＄畻涓嬩竴涓垎缁勭紪鍙?
  const getNextGroupNumber = useCallback((): number => {
    // 鏌ユ壘鎵€鏈変互"鍒嗙粍"寮€澶寸殑鍒嗙粍鍚嶇О锛屾彁鍙栨暟瀛?
    const groupNumbers = groups
      .map(g => {
        const match = g.name.match(/^(?:分组|Group\s?)(\d+)$/i);
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter(n => n > 0);
    
    // 杩斿洖鏈€澶ф暟瀛?+ 1锛屽鏋滄病鏈夊垯杩斿洖 1
    return groupNumbers.length > 0 ? Math.max(...groupNumbers) + 1 : 1;
  }, [groups]);

  // 鏋勫缓鑿滃崟椤?
  const buildMenuItems = useCallback((): ContextMenuItem[] => {
    return [
      {
        id: 'new-form',
        label: '鏂板缓琛ㄥ崟',
        icon: 'table-properties',
        onClick: () => {
          // 濡傛灉閫変腑浜嗗垎缁勶紝鍒欏湪璇ュ垎缁勪笅鍒涘缓琛ㄥ崟
          onNewForm?.(selectedGroupId || null);
        },
      },
      {
        id: 'new-group',
        label: '鏂板缓鍒嗙粍',
        icon: 'form-folder',
        onClick: () => {
          const groupName = buildDefaultGroupName(getNextGroupNumber());
          onNewGroup?.(groupName);
        },
      },
    ];
  }, [buildDefaultGroupName, onNewForm, onNewGroup, selectedGroupId, getNextGroupNumber]);

  // 鏋勫缓绌虹櫧鍖哄煙鍙抽敭鑿滃崟
  const buildBlankAreaContextMenu = useCallback((): ContextMenuItem[] => {
    return [
      {
        id: 'new-form',
        label: '鏂板缓琛ㄥ崟',
        icon: 'table-properties',
        onClick: () => {
          onNewForm?.(null);
        },
      },
      {
        id: 'new-group',
        label: '鏂板缓鍒嗙粍',
        icon: 'form-folder',
        onClick: () => {
          const groupName = buildDefaultGroupName(getNextGroupNumber());
          onNewGroup?.(groupName);
        },
      },
    ];
  }, [buildDefaultGroupName, onNewForm, onNewGroup, getNextGroupNumber]);

  const translateContextMenuItems = useCallback((items: ContextMenuItem[]): ContextMenuItem[] => (
    items.map((item) => {
      switch (item.id) {
        case 'new-form-in-group':
        case 'new-form':
          return { ...item, label: translateText('formSection.menu.newForm', '新建表单') };
        case 'new-group':
          return { ...item, label: translateText('formSection.menu.newGroup', '新建分组') };
        case 'rename-group':
        case 'rename-form':
          return { ...item, label: translateText('formSection.menu.rename', '重命名') };
        case 'delete-group':
          return { ...item, label: translateText('formSection.menu.deleteGroup', '删除分组') };
        case 'open-form':
          return { ...item, label: translateText('formSection.menu.openForm', '打开表单') };
        case 'open-form-in-new-tab':
          return { ...item, label: translateText('formSection.menu.openInNewTab', '在新选项卡打开') };
        case 'delete-form':
          return { ...item, label: translateText('formSection.menu.deleteForm', '删除表单') };
        default:
          return item;
      }
    })
  ), [translateText]);

  // 澶勭悊绌虹櫧鍖哄煙鍙抽敭鑿滃崟
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
      tooltip: translateText('formSection.actions.new', '新建'),
      onClick: handleNewClick,
    },
  ];

  const handleExpandChange = (expanded: boolean) => {
    setIsExpanded(expanded);
    onExpandedChange?.(expanded);
  };

  // 娓叉煋鍒嗙粍椤?
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

  // 娓叉煋琛ㄥ崟椤?
  const renderFormItem = (item: FormItem, depth: number = 0) => {
    // 琛ㄥ崟椤归渶瑕侀澶栫缉杩涗互涓庡垎缁勫悕绉板榻愶紙璺宠繃鎶樺彔鍥炬爣瀹藉害 20px锛?
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

  // 鑾峰彇鏍圭骇鍒殑鍒嗙粍鍜岃〃鍗?
  const rootGroups = groups.filter(g => g.parentId === null);
  const rootForms = forms.filter(f => f.groupId === null);
  const hasContent = rootGroups.length > 0 || rootForms.length > 0;

  return (
    <div 
      className={`form-section ${isExpanded ? 'form-section--expanded' : 'form-section--collapsed'}`}
    >
      {/* 鎷栧姩鏃剁殑鍏ㄥ眬閬僵灞傦紝闃叉榧犳爣鏍峰紡鍒囨崲 */}
      {isResizing && (
        <div className="form-resize-overlay" />
      )}
      {/* 鎷栧姩鎵嬫焺 - 鍙湪灞曞紑鏃舵樉绀?*/}
      {isExpanded && (
        <div 
          className={`form-resize-handle ${isResizing ? 'resizing' : ''}`}
          onMouseDown={handleResizeMouseDown}
        />
      )}
      <ExplorerSection
        title={translateText('formSection.title', '数据')}
        expanded={isExpanded}
        toggleIconMode="form-on-idle"
        actions={isExpanded ? actions : []}
        onExpandChange={handleExpandChange}
      >
        <CustomScrollbar
          className="form-content"
          scrollbarWidth={10}
          style={{ height: `${contentHeight}px` }}
          onContextMenu={handleBlankAreaContextMenu}
        >
          {!hasContent ? (
            <div className="form-empty">
              <Icon name="table-properties" size={24} className="empty-icon" />
              <span>{translateText('formSection.empty', '暂无表单')}</span>
            </div>
          ) : (
            <div className="form-list">
              {rootGroups.map(group => renderGroupItem(group))}
              {rootForms.map(form => renderFormItem(form))}
            </div>
          )}
        </CustomScrollbar>
      </ExplorerSection>

      {/* 鏂板缓鑿滃崟 */}
      {menuPosition && (
        <ContextMenu
          items={translateContextMenuItems(buildMenuItems())}
          position={menuPosition}
          onClose={handleCloseMenu}
        />
      )}

      {/* 鍙抽敭鑿滃崟 */}
      {contextMenuState && (
        <ContextMenu
          items={translateContextMenuItems(contextMenuState.items)}
          position={contextMenuState.position}
          onClose={handleCloseContextMenu}
        />
      )}
    </div>
  );
};

export default FormSection;

