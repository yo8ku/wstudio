/**
 * 查询条件面板组件
 * 功能：提供可视化的查询条件构建界面
 * 描述：用户可以选择列、条件类型和输入值来构建查询
 */

import React, { useState, useCallback, useMemo } from 'react';
import { Icon } from '../../../Icons/Icon';
import { Select, type SelectItem } from '../../../common/Select';
import type { TableColumn, ColumnType } from './types';
import type { QueryCondition, QueryOperator } from './TableOperations';

interface QueryConditionPanelProps {
  columns: TableColumn[];
  onQuery: (conditions: QueryCondition[], logic: 'and' | 'or') => void;
  onClose: () => void;
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
}

export const QueryConditionPanel: React.FC<QueryConditionPanelProps> = ({
  columns,
  onQuery,
  onClose,
}) => {
  const [conditions, setConditions] = useState<ConditionItem[]>([
    { id: '1', columnName: columns[0]?.name || '', operator: 'equals', value: '' },
  ]);
  const [conditionLogic, setConditionLogic] = useState<'and' | 'or'>('and');

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
        },
      ];
    });
  }, [columns]);

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

  // 清空条件
  const handleClear = useCallback(() => {
    setConditions([
      { id: '1', columnName: columns[0]?.name || '', operator: 'equals', value: '' },
    ]);
    setConditionLogic('and');
    onQuery([], 'and');
  }, [columns, onQuery]);

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

  return (
    <div className="query-condition-panel">
      <div className="query-condition-header">
        <span className="query-condition-title">查询条件</span>
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
        <span className="query-condition-close" onClick={onClose} title="关闭">
          <Icon name="close" size={14} />
        </span>
      </div>
      <div className="query-condition-body">
        {conditions.map((condition) => (
          <div key={condition.id} className="query-condition-row">
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
        <span className="query-btn query-btn-secondary" onClick={handleClear}>
          清空
        </span>
        <span className="query-btn query-btn-primary" onClick={handleQuery}>
          查询
        </span>
      </div>
    </div>
  );
};

export default QueryConditionPanel;
