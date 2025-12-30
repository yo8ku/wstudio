/**
 * Mermaid 模板类型定义
 */

// 单个模板
export interface MermaidTemplate {
  id: string;
  name: string;
  description: string;
  code: string;
}

// 模板分类
export interface MermaidTemplateCategory {
  id: string;
  name: string;
  templates: MermaidTemplate[];
}
