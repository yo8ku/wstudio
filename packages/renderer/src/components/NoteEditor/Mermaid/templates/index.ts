/**
 * Mermaid 预设流程图模板索引
 * 导出所有分类的预设模板
 */

import { teamCollaborationTemplates } from './teamCollaboration';
import type { MermaidTemplate, MermaidTemplateCategory } from './types';

// 导出类型
export type { MermaidTemplate, MermaidTemplateCategory };

// 所有模板分类
export const mermaidTemplateCategories: MermaidTemplateCategory[] = [
  {
    id: 'team-collaboration',
    name: '团队协作',
    templates: teamCollaborationTemplates,
  },
];

// 获取所有模板
export const getAllTemplates = (): MermaidTemplate[] => {
  return mermaidTemplateCategories.flatMap((category) => category.templates);
};

// 根据ID获取模板
export const getTemplateById = (id: string): MermaidTemplate | undefined => {
  return getAllTemplates().find((template) => template.id === id);
};
