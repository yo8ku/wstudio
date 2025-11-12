/**
 * 创建智能体对话框组件
 * 功能：提供创建和编辑智能体的UI和交互
 * 描述：支持输入名称、选择Emoji、编写提示词、设置分类
 */

import React, { useState, useEffect } from 'react';
import { EmojiPicker } from '../EmojiPicker';
import { estimateTokens } from '@/utils/tokenCounter';
import { getDefaultEmoji } from '@/utils/EmojiHelper';
import './CreateAgentDialog.scss';

interface CreateAgentDialogProps {
  visible: boolean;
  onClose: () => void;
  onCreate: (data: AgentData) => void;
  editingAgent?: AgentData & { id: string };
  onUpdate?: (id: string, data: AgentData) => void;
  defaultCategory?: string;
  existingCategories?: string[];
}

export interface AgentData {
  name: string;
  emoji: string;
  prompt: string;
  category: string;
}

export const CreateAgentDialog: React.FC<CreateAgentDialogProps> = ({
  visible,
  onClose,
  onCreate,
  editingAgent,
  onUpdate,
  defaultCategory = '',
  existingCategories = [],
}) => {
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState(getDefaultEmoji());
  const [prompt, setPrompt] = useState('');
  const [category, setCategory] = useState('');
  const [tokenCount, setTokenCount] = useState(0);
  const [categoryWarning, setCategoryWarning] = useState('');

  const isEditMode = !!editingAgent;

  // 计算 token 数量
  useEffect(() => {
    setTokenCount(estimateTokens(prompt));
  }, [prompt]);

  // 检查分类是否已存在
  useEffect(() => {
    if (category.trim() && !isEditMode) {
      const trimmedCategory = category.trim();
      if (existingCategories.includes(trimmedCategory)) {
        setCategoryWarning('该分类已存在，将添加到现有分类下');
      } else {
        setCategoryWarning('');
      }
    } else {
      setCategoryWarning('');
    }
  }, [category, existingCategories, isEditMode]);

  // 打开时初始化表单数据
  useEffect(() => {
    if (visible) {
      if (editingAgent) {
        // 编辑模式：填充现有数据
        setName(editingAgent.name);
        setEmoji(editingAgent.emoji);
        setPrompt(editingAgent.prompt);
        setCategory(editingAgent.category);
      } else {
        // 创建模式：重置表单（分类为空，让用户自己输入）
        setName('');
        setEmoji(getDefaultEmoji());
        setPrompt('');
        setCategory('');
      }
      setCategoryWarning('');
    }
  }, [visible, editingAgent]);

  // ESC 键关闭
  useEffect(() => {
    if (!visible) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [visible, onClose]);

  if (!visible) return null;

  const handleCreate = () => {
    if (!name.trim()) {
      alert('请输入智能体名称');
      return;
    }

    if (!prompt.trim()) {
      alert('请输入提示词');
      return;
    }

    if (!category.trim()) {
      alert('请输入智能体分类');
      return;
    }

    const agentData = {
      name: name.trim(),
      emoji,
      prompt: prompt.trim(),
      category: category.trim(),
    };

    if (isEditMode && editingAgent && onUpdate) {
      // 编辑模式：调用更新回调
      onUpdate(editingAgent.id, agentData);
    } else {
      // 创建模式：调用创建回调
      onCreate(agentData);
    }

    onClose();
  };

  return (
    <div className="create-agent-dialog-overlay">
      <div className="create-agent-dialog">
        {/* 对话框标题 */}
        <div className="create-agent-dialog__header">
          <h3>{isEditMode ? '编辑智能体' : '创建智能体'}</h3>
          <button
            className="create-agent-dialog__close"
            onClick={onClose}
            title="关闭"
          >
            ×
          </button>
        </div>

        {/* 对话框内容 */}
        <div className="create-agent-dialog__body">
          {/* 智能体名称和 Emoji */}
          <div className="create-agent-dialog__section">
            <label>名称与图标*</label>
            <div className="name-emoji-row">
              <EmojiPicker value={emoji} onChange={setEmoji} />
              <input
                type="text"
                className="create-agent-dialog__input"
                placeholder="请输入智能体名称"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={50}
              />
            </div>
          </div>

          {/* 分类 */}
          <div className="create-agent-dialog__section AIgentType">
            <label className='tpye-title'>分类*</label>
            <div className="category-input-wrapper">
              <input
                type="text"
                className="create-agent-dialog__input"
                placeholder="请输入智能体分类，例如：编程、写作、设计等"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                maxLength={50}
                list="category-suggestions"
              />
              {existingCategories.length > 0 && (
                <datalist id="category-suggestions">
                  {existingCategories.map(cat => (
                    <option key={cat} value={cat} />
                  ))}
                </datalist>
              )}
            </div>
            {categoryWarning && (
              <div className="category-warning">
                {categoryWarning}
              </div>
            )}
            {existingCategories.length > 0 && !categoryWarning && (
              <div className="category-hint">
                现有分类: {existingCategories.join('、')}
              </div>
            )}
          </div>

          {/* 提示词 */}
          <div className="create-agent-dialog__section">
            <div className="label-with-token">
              <label>提示词*</label>
              <span className="token-count">Tokens: {tokenCount}</span>
            </div>
            <textarea
              className="create-agent-dialog__textarea"
              placeholder="请输入智能体的提示词，描述它的角色、能力和行为方式..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={8}
            />
          </div>
        </div>

        {/* 对话框底部 */}
        <div className="create-agent-dialog__footer">
          <button
            className="create-agent-dialog__button create-agent-dialog__button--cancel"
            onClick={onClose}
          >
            取消
          </button>
          <button
            className="create-agent-dialog__button create-agent-dialog__button--create"
            onClick={handleCreate}
            disabled={!name.trim() || !prompt.trim() || !category.trim()}
          >
            {isEditMode ? '保存' : '创建'}
          </button>
        </div>
      </div>
    </div>
  );
};

