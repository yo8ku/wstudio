/**
 * AI智能体侧边栏组件
 * 功能：展示AI智能体的分类列表
 * 描述：提供智能体的分类导航功 */

import React, { useState } from 'react';
import './AIAgent.scss';

interface Category {
  id: string;
  name: string;
}

export const AIAgent: React.FC = () => {
  // 智能体分类列表
  const categories: Category[] = [
    { id: 'my', name: '我的' },
    { id: 'featured', name: '精选' },
    { id: 'profession', name: '职业' },
    { id: 'business', name: '商业' },
    { id: 'tools', name: '工具' },
    { id: 'language', name: '语言' },
    { id: 'office', name: '办公' },
    { id: 'general', name: '通用' },
    { id: 'writing', name: '写作' },
    { id: 'programming', name: '编程' },
    { id: 'emotion', name: '情感' },
    { id: 'education', name: '教育' },
    { id: 'creative', name: '创意' },
    { id: 'academic', name: '学术' },
    { id: 'design', name: '设计' },
    { id: 'art', name: '艺术' },
    { id: 'entertainment', name: '娱乐' },
    { id: 'life', name: '生活' },
    { id: 'medical', name: '医疗' },
    { id: 'game', name: '游戏' },
    { id: 'translation', name: '翻译' },
    { id: 'music', name: '音乐' },
    { id: 'review', name: '点评' },
    { id: 'copywriting', name: '文案' },
    { id: 'encyclopedia', name: '百科' },
    { id: 'health', name: '健康' },
    { id: 'marketing', name: '营销' },
    { id: 'science', name: '科学' },
    { id: 'analysis', name: '分析' },
    { id: 'law', name: '法律' },
    { id: 'consulting', name: '咨询' },
    { id: 'finance', name: '金融' },
    { id: 'travel', name: '旅游' },
    { id: 'management', name: '管理' },
  ];

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // 处理分类点击
  const handleCategoryClick = (categoryId: string, categoryName: string) => {
    setSelectedCategory(categoryId);
    console.log('[AIAgent] 选择分类:', categoryId, categoryName);
    
    // 触发打开AI智能体标签页事件
    window.dispatchEvent(new CustomEvent('open-ai-agent', {
      detail: { categoryId, categoryName }
    }));
  };

  // 过滤分类
  const filteredCategories = categories.filter(category =>
    category.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="ai-agent">
      {/* 搜索框 */}
      <div className="ai-agent__search">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜索分类..."
          className="ai-agent__search-input"
          style={{
            backgroundColor: 'var(--ws-input-background)',
            color: 'var(--ws-input-foreground)',
            border: `1px solid var(--ws-input-border)`,
          }}
        />
      </div>

      {/* 分类列表 */}
      <div className="ai-agent__categories">
        {filteredCategories.map((category) => (
          <div
            key={category.id}
            className={`ai-agent__category ${
              selectedCategory === category.id ? 'ai-agent__category--active' : ''
            }`}
            onClick={() => handleCategoryClick(category.id, category.name)}
            style={{
              backgroundColor:
                selectedCategory === category.id
                  ? 'var(--ws-list-active-selection-background)'
                  : 'transparent',
              color:
                selectedCategory === category.id
                  ? 'var(--ws-list-active-selection-foreground)'
                  : 'var(--ws-sidebar-foreground)',
            }}
          >
            <span className="ai-agent__category-name">{category.name}</span>
          </div>
        ))}
      </div>

      {/* 空状态 */}
      {filteredCategories.length === 0 && (
        <div
          className="ai-agent__empty"
          style={{
            color: 'var(--ws-description-foreground)',
          }}
        >
          未找到匹配的分类
        </div>
      )}
    </div>
  );
};

