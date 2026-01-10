/**
 * 条件面板组件
 * 功能：提供可视化的条件构建界面
 * 描述：用户可以选择列、条件类型和输入值来构建条件，支持查询和填色两种模式
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Icon } from '../../../Icons/Icon';
import { Select, type SelectItem } from '../../../common/Select';
import type { TableColumn, ColumnType } from './types';
import type { QueryCondition, QueryOperator } from './TableOperations';

/** 面板模式 */
export type ConditionPanelMode = 'query' | 'fillColor';

/** 填色范围类型 */
export type FillColorScope = 'cell' | 'row' | 'column';

interface QueryConditionPanelProps {
  columns: TableColumn[];
  onQuery: (conditions: QueryCondition[], logic: 'and' | 'or') => void;
  onClose: () => void;
  /** 面板模式：query-查询, fillColor-填色 */
  mode?: ConditionPanelMode;
  /** 填色回调 - 每个条件带有自己的颜色和范围 */
  onFillColor?: (conditionsWithColor: Array<{ condition: QueryCondition; color: string; scope: FillColorScope }>) => void;
  /** 清除所有填色回调 */
  onClearAllFillColor?: () => void;
}

/** 条件操作符选项 */
const OPERATOR_OPTIONS: Array<{ value: QueryOperator; label: string }> = [
  { value: 'equals', label: '等于' },
  { value: 'notEquals', label: '不等于' },
  { value: 'contains', label: '包含' },
  { value: 'startsWith', label: '开头是' },
  { value: 'endsWith', label: '结尾是' },
  { value: 'gt', label: '大于' },
  { value: 'gte', label: '大于等于' },
  { value: 'lt', label: '小于' },
  { value: 'lte', label: '小于等于' },
  { value: 'isEmpty', label: '为空' },
  { value: 'isNotEmpty', label: '不为空' },
];

/** 根据列类型获取适用的操作符 */
const getOperatorsForType = (type: ColumnType): QueryOperator[] => {
  switch (type) {
    case 'number':
    case 'date':
    case 'time':
      return ['equals', 'notEquals', 'gt', 'gte', 'lt', 'lte', 'isEmpty', 'isNotEmpty'];
    case 'checkbox':
      return ['equals', 'notEquals'];
    case 'select':
    case 'multiselect':
    case 'tag':
      return ['equals', 'notEquals', 'contains', 'isEmpty', 'isNotEmpty'];
    default:
      return ['equals', 'notEquals', 'contains', 'startsWith', 'endsWith', 'isEmpty', 'isNotEmpty'];
  }
};

/** 单个条件项 */
interface ConditionItem {
  id: string;
  columnName: string;
  operator: QueryOperator;
  value: string;
  color?: string; // 填色模式下每个条件的颜色
  scope?: FillColorScope; // 填色范围：单元格、整行、整列
}

export const QueryConditionPanel: React.FC<QueryConditionPanelProps> = ({
  columns,
  onQuery,
  onClose,
  mode = 'query',
  onFillColor,
  onClearAllFillColor,
}) => {
  const defaultColor = 'rgba(255, 204, 0, 0.3)';
  const defaultScope: FillColorScope = 'row';
  const [conditions, setConditions] = useState<ConditionItem[]>([
    { id: '1', columnName: columns[0]?.name || '', operator: 'equals', value: '', color: defaultColor, scope: defaultScope },
  ]);
  const [conditionLogic, setConditionLogic] = useState<'and' | 'or'>('and');
  const [activeColorPickerId, setActiveColorPickerId] = useState<string | null>(null);
  const colorPickerRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭颜色选择器
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (colorPickerRef.current && !colorPickerRef.current.contains(event.target as Node)) {
        setActiveColorPickerId(null);
      }
    };
    if (activeColorPickerId) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [activeColorPickerId]);

  // 预设颜色分组（每组4个梯度，从浅到深）
  const presetColorGroups = [
    // 黄色系
    ['rgba(255, 235, 59, 0.2)', 'rgba(255, 204, 0, 0.3)', 'rgba(255, 193, 7, 0.4)', 'rgba(255, 160, 0, 0.5)'],
    // 柠檬黄系
    ['rgba(255, 245, 157, 0.2)', 'rgba(255, 238, 88, 0.3)', 'rgba(253, 216, 53, 0.4)', 'rgba(245, 195, 0, 0.5)'],
    // 金色系
    ['rgba(255, 224, 130, 0.2)', 'rgba(255, 202, 40, 0.3)', 'rgba(255, 179, 0, 0.4)', 'rgba(255, 143, 0, 0.5)'],
    // 橙色系
    ['rgba(255, 183, 77, 0.2)', 'rgba(255, 149, 0, 0.3)', 'rgba(255, 112, 67, 0.4)', 'rgba(244, 81, 30, 0.5)'],
    // 深橙系
    ['rgba(255, 171, 145, 0.2)', 'rgba(255, 138, 101, 0.3)', 'rgba(255, 87, 34, 0.4)', 'rgba(230, 74, 25, 0.5)'],
    // 珊瑚色系
    ['rgba(255, 138, 128, 0.2)', 'rgba(255, 82, 82, 0.3)', 'rgba(255, 23, 68, 0.4)', 'rgba(213, 0, 0, 0.5)'],
    // 红色系
    ['rgba(239, 154, 154, 0.2)', 'rgba(231, 76, 60, 0.3)', 'rgba(211, 47, 47, 0.4)', 'rgba(183, 28, 28, 0.5)'],
    // 玫红系
    ['rgba(255, 128, 171, 0.2)', 'rgba(255, 64, 129, 0.3)', 'rgba(245, 0, 87, 0.4)', 'rgba(197, 17, 98, 0.5)'],
    // 粉色系
    ['rgba(248, 187, 208, 0.2)', 'rgba(233, 30, 99, 0.3)', 'rgba(194, 24, 91, 0.4)', 'rgba(136, 14, 79, 0.5)'],
    // 浅粉系
    ['rgba(252, 228, 236, 0.2)', 'rgba(244, 143, 177, 0.3)', 'rgba(236, 64, 122, 0.4)', 'rgba(173, 20, 87, 0.5)'],
    // 紫色系
    ['rgba(206, 147, 216, 0.2)', 'rgba(155, 89, 182, 0.3)', 'rgba(123, 31, 162, 0.4)', 'rgba(74, 20, 140, 0.5)'],
    // 深紫系
    ['rgba(179, 136, 255, 0.2)', 'rgba(124, 77, 255, 0.3)', 'rgba(101, 31, 255, 0.4)', 'rgba(98, 0, 234, 0.5)'],
    // 薰衣草系
    ['rgba(209, 196, 233, 0.2)', 'rgba(149, 117, 205, 0.3)', 'rgba(103, 58, 183, 0.4)', 'rgba(69, 39, 160, 0.5)'],
    // 靛蓝系
    ['rgba(159, 168, 218, 0.2)', 'rgba(92, 107, 192, 0.3)', 'rgba(57, 73, 171, 0.4)', 'rgba(40, 53, 147, 0.5)'],
    // 蓝色系
    ['rgba(144, 202, 249, 0.2)', 'rgba(52, 152, 219, 0.3)', 'rgba(25, 118, 210, 0.4)', 'rgba(13, 71, 161, 0.5)'],
    // 浅蓝系
    ['rgba(129, 212, 250, 0.2)', 'rgba(79, 195, 247, 0.3)', 'rgba(3, 169, 244, 0.4)', 'rgba(2, 136, 209, 0.5)'],
    // 天蓝系
    ['rgba(179, 229, 252, 0.2)', 'rgba(77, 208, 225, 0.3)', 'rgba(0, 188, 212, 0.4)', 'rgba(0, 131, 143, 0.5)'],
    // 青色系
    ['rgba(128, 222, 234, 0.2)', 'rgba(26, 188, 156, 0.3)', 'rgba(0, 151, 167, 0.4)', 'rgba(0, 96, 100, 0.5)'],
    // 蓝绿系
    ['rgba(128, 203, 196, 0.2)', 'rgba(77, 182, 172, 0.3)', 'rgba(0, 150, 136, 0.4)', 'rgba(0, 105, 92, 0.5)'],
    // 绿色系
    ['rgba(165, 214, 167, 0.2)', 'rgba(46, 204, 113, 0.3)', 'rgba(56, 142, 60, 0.4)', 'rgba(27, 94, 32, 0.5)'],
    // 浅绿系
    ['rgba(178, 223, 138, 0.2)', 'rgba(139, 195, 74, 0.3)', 'rgba(104, 159, 56, 0.4)', 'rgba(51, 105, 30, 0.5)'],
    // 翠绿系
    ['rgba(200, 230, 201, 0.2)', 'rgba(129, 199, 132, 0.3)', 'rgba(67, 160, 71, 0.4)', 'rgba(46, 125, 50, 0.5)'],
    // 青柠系
    ['rgba(230, 238, 156, 0.2)', 'rgba(212, 225, 87, 0.3)', 'rgba(192, 202, 51, 0.4)', 'rgba(158, 157, 36, 0.5)'],
    // 橄榄系
    ['rgba(197, 225, 165, 0.2)', 'rgba(156, 204, 101, 0.3)', 'rgba(124, 179, 66, 0.4)', 'rgba(85, 139, 47, 0.5)'],
    // 棕色系
    ['rgba(215, 189, 167, 0.2)', 'rgba(161, 136, 127, 0.3)', 'rgba(121, 85, 72, 0.4)', 'rgba(78, 52, 46, 0.5)'],
    // 咖啡系
    ['rgba(188, 170, 164, 0.2)', 'rgba(141, 110, 99, 0.3)', 'rgba(109, 76, 65, 0.4)', 'rgba(62, 39, 35, 0.5)'],
    // 米色系
    ['rgba(239, 235, 233, 0.2)', 'rgba(215, 204, 200, 0.3)', 'rgba(188, 170, 164, 0.4)', 'rgba(141, 110, 99, 0.5)'],
    // 灰色系
    ['rgba(189, 189, 189, 0.2)', 'rgba(149, 165, 166, 0.3)', 'rgba(117, 117, 117, 0.4)', 'rgba(66, 66, 66, 0.5)'],
    // 蓝灰系
    ['rgba(176, 190, 197, 0.2)', 'rgba(120, 144, 156, 0.3)', 'rgba(84, 110, 122, 0.4)', 'rgba(55, 71, 79, 0.5)'],
    // 暖灰系
    ['rgba(215, 204, 200, 0.2)', 'rgba(161, 136, 127, 0.3)', 'rgba(109, 76, 65, 0.4)', 'rgba(93, 64, 55, 0.5)'],
  ];

  // 根据列名获取列信息
  const getColumnByName = useCallback(
    (name: string): TableColumn | undefined => {
      return columns.find(col => col.name === name);
    },
    [columns]
  );

  // 最大条件数量限制
  const MAX_CONDITIONS = 10;

  // 添加条件
  const handleAddCondition = useCallback(() => {
    setConditions(prev => {
      // 筛选条件数量不能超过实际列数和最大限制
      const maxAllowed = Math.min(MAX_CONDITIONS, columns.length);
      if (prev.length >= maxAllowed) return prev;
      return [
        ...prev,
        {
          id: Date.now().toString(),
          columnName: columns[0]?.name || '',
          operator: 'equals',
          value: '',
          color: defaultColor,
          scope: defaultScope,
        },
      ];
    });
  }, [columns, defaultColor, defaultScope]);

  // 删除条件
  const handleRemoveCondition = useCallback((id: string) => {
    setConditions(prev => {
      if (prev.length <= 1) return prev;
      return prev.filter(c => c.id !== id);
    });
  }, []);

  // 更新条件
  const handleUpdateCondition = useCallback(
    (id: string, field: keyof ConditionItem, value: string) => {
      setConditions(prev =>
        prev.map(c => {
          if (c.id !== id) return c;
          const updated = { ...c, [field]: value };
          // 当切换列时，重置操作符和值
          if (field === 'columnName') {
            const newColumn = columns.find(col => col.name === value);
            if (newColumn) {
              const validOperators = getOperatorsForType(newColumn.type);
              if (!validOperators.includes(updated.operator)) {
                updated.operator = validOperators[0];
              }
              updated.value = '';
            }
          }
          return updated;
        })
      );
    },
    [columns]
  );

  // 执行查询
  const handleQuery = useCallback(() => {
    const validConditions: QueryCondition[] = conditions
      .filter(c => {
        // 为空/不为空操作符不需要值
        if (c.operator === 'isEmpty' || c.operator === 'isNotEmpty') {
          return c.columnName;
        }
        return c.columnName && c.value;
      })
      .map(c => ({
        columnName: c.columnName,
        operator: c.operator,
        value: c.value,
      }));

    onQuery(validConditions, conditionLogic);
  }, [conditions, conditionLogic, onQuery]);

  // 执行填色
  const handleFillColor = useCallback(() => {
    if (!onFillColor) return;
    
    const validConditionsWithColor = conditions
      .filter(c => {
        // 为空/不为空操作符不需要值
        if (c.operator === 'isEmpty' || c.operator === 'isNotEmpty') {
          return c.columnName;
        }
        return c.columnName && c.value;
      })
      .map(c => ({
        condition: {
          columnName: c.columnName,
          operator: c.operator,
          value: c.value,
        },
        color: c.color || defaultColor,
        scope: c.scope || defaultScope,
      }));

    onFillColor(validConditionsWithColor);
  }, [conditions, defaultColor, defaultScope, onFillColor]);

  // 清空条件
  const handleClear = useCallback(() => {
    setConditions([
      { id: '1', columnName: columns[0]?.name || '', operator: 'equals', value: '', color: defaultColor, scope: defaultScope },
    ]);
    setConditionLogic('and');
    // 只清空条件，不执行查询
  }, [columns, defaultColor, defaultScope]);

  // 判断操作符是否需要值输入
  const needsValue = (operator: QueryOperator): boolean => {
    return operator !== 'isEmpty' && operator !== 'isNotEmpty';
  };

  // 获取当前列可用的操作符
  const getAvailableOperators = useCallback((columnName: string): SelectItem[] => {
    const column = getColumnByName(columnName);
    if (!column) {
      return OPERATOR_OPTIONS.map(op => ({ value: op.value, label: op.label }));
    }
    const validOperators = getOperatorsForType(column.type);
    return OPERATOR_OPTIONS
      .filter(op => validOperators.includes(op.value))
      .map(op => ({ value: op.value, label: op.label }));
  }, [getColumnByName]);

  // 列选项
  const columnItems: SelectItem[] = useMemo(() => 
    columns.map(col => ({ value: col.name, label: col.name })),
    [columns]
  );

  // 条件逻辑选项
  const logicItems: SelectItem[] = useMemo(() => [
    { value: 'and', label: '所有' },
    { value: 'or', label: '任一' },
  ], []);

  // 填色范围选项
  const scopeItems: SelectItem[] = useMemo(() => [
    { value: 'cell', label: '单元格' },
    { value: 'row', label: '整行' },
    { value: 'column', label: '整列' },
  ], []);

  // checkbox 选项
  const checkboxItems: SelectItem[] = useMemo(() => [
    { value: '', label: '请选择' },
    { value: 'true', label: '是' },
    { value: 'false', label: '否' },
  ], []);

  // 根据列类型渲染对应的输入组件
  const renderValueInput = useCallback((condition: ConditionItem) => {
    const column = getColumnByName(condition.columnName);
    if (!column || !needsValue(condition.operator)) return null;

    switch (column.type) {
      case 'time':
        return (
          <input
            type="time"
            className="condition-value"
            value={condition.value}
            onChange={e => handleUpdateCondition(condition.id, 'value', e.target.value)}
          />
        );
      case 'date':
        return (
          <input
            type="date"
            className="condition-value"
            value={condition.value}
            onChange={e => handleUpdateCondition(condition.id, 'value', e.target.value)}
          />
        );
      case 'number':
        return (
          <input
            type="number"
            className="condition-value"
            value={condition.value}
            onChange={e => handleUpdateCondition(condition.id, 'value', e.target.value)}
            placeholder="输入数字"
          />
        );
      case 'checkbox':
        return (
          <Select
            className="condition-value-select"
            value={condition.value}
            onChange={val => handleUpdateCondition(condition.id, 'value', val)}
            items={checkboxItems}
            placeholder="请选择"
          />
        );
      case 'select':
      case 'multiselect':
      case 'tag':
        if (column.options && column.options.length > 0) {
          const optionItems: SelectItem[] = [
            { value: '', label: '请选择' },
            ...column.options.map(opt => ({ value: opt, label: opt })),
          ];
          return (
            <Select
              className="condition-value-select"
              value={condition.value}
              onChange={val => handleUpdateCondition(condition.id, 'value', val)}
              items={optionItems}
              placeholder="请选择"
            />
          );
        }
        return (
          <input
            type="text"
            className="condition-value"
            value={condition.value}
            onChange={e => handleUpdateCondition(condition.id, 'value', e.target.value)}
            placeholder="输入值"
          />
        );
      default:
        return (
          <input
            type="text"
            className="condition-value"
            value={condition.value}
            onChange={e => handleUpdateCondition(condition.id, 'value', e.target.value)}
            placeholder="输入值"
          />
        );
    }
  }, [getColumnByName, handleUpdateCondition, checkboxItems]);

  // 根据模式获取标题
  const panelTitle = mode === 'fillColor' ? '填色条件' : '查询条件';

  return (
    <div className="query-condition-panel">
      <div className="query-condition-header">
        <span className="query-condition-title">{panelTitle}</span>
        {/* 查询模式显示逻辑选择器，填色模式不显示 */}
        {mode === 'query' && (
          <div className="query-condition-logic-wrapper">
            <span className="query-condition-logic-label">符合</span>
            <Select
              className="query-condition-logic-select"
              value={conditionLogic}
              onChange={val => setConditionLogic(val as 'and' | 'or')}
              items={logicItems}
            />
            <span className="query-condition-logic-label">条件</span>
          </div>
        )}
        <span className="query-condition-close" onClick={onClose} title="关闭">
          <Icon name="close" size={14} />
        </span>
      </div>
      <div className="query-condition-body">
        {conditions.map((condition) => (
          <div key={condition.id} className="query-condition-row">
            {/* 填色模式：每行条件都有颜色选择框 */}
            {mode === 'fillColor' && (
              <div
                className="color-picker-wrapper"
                ref={activeColorPickerId === condition.id ? colorPickerRef : null}
              >
                <span
                  className="color-picker-trigger"
                  style={{ backgroundColor: condition.color || defaultColor }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveColorPickerId(activeColorPickerId === condition.id ? null : condition.id);
                  }}
                  title="选择颜色"
                />
                {activeColorPickerId === condition.id && (
                  <div className="color-picker-dropdown" onClick={(e) => e.stopPropagation()}>
                    <div className="color-picker-colors">
                      {presetColorGroups.map((group, groupIndex) => (
                        <div key={groupIndex} className="color-picker-group">
                          {group.map(color => (
                            <span
                              key={color}
                              className={`color-picker-item ${condition.color === color ? 'selected' : ''}`}
                              style={{ backgroundColor: color }}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleUpdateCondition(condition.id, 'color', color);
                                setActiveColorPickerId(null);
                              }}
                            />
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            <Select
              className="condition-column"
              value={condition.columnName}
              onChange={val => handleUpdateCondition(condition.id, 'columnName', val)}
              items={columnItems}
              placeholder="选择列"
            />
            <Select
              className="condition-operator"
              value={condition.operator}
              onChange={val => handleUpdateCondition(condition.id, 'operator', val)}
              items={getAvailableOperators(condition.columnName)}
              placeholder="选择条件"
            />
            {renderValueInput(condition)}
            {/* 填色模式显示范围选择器 */}
            {mode === 'fillColor' && (
              <Select
                className="condition-scope"
                value={condition.scope || defaultScope}
                onChange={val => handleUpdateCondition(condition.id, 'scope', val)}
                items={scopeItems}
              />
            )}
            <span
              className="condition-remove"
              onClick={() => handleRemoveCondition(condition.id)}
              title="删除条件"
            >
              <Icon name="close" size={12} />
            </span>
          </div>
        ))}
        {conditions.length < Math.min(MAX_CONDITIONS, columns.length) && (
          <div className="query-condition-add" onClick={handleAddCondition}>
            <Icon name="plus" size={12} />
            <span>添加条件</span>
          </div>
        )}
      </div>
      <div className="query-condition-footer">
        {mode === 'fillColor' ? (
          <span className="query-btn query-btn-secondary" onClick={onClearAllFillColor}>
            清除所有填色
          </span>
        ) : (
          <span className="query-btn query-btn-secondary" onClick={handleClear}>
            清空
          </span>
        )}
        {mode === 'fillColor' ? (
          <span className="query-btn query-btn-primary" onClick={handleFillColor}>
            填色
          </span>
        ) : (
          <span className="query-btn query-btn-primary" onClick={handleQuery}>
            查询
          </span>
        )}
      </div>
    </div>
  );
};

export default QueryConditionPanel;
