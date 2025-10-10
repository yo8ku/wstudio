/**
 * 元数据类型定义
 */

export interface DocumentMetadata {
  title?: string;
  author?: string;
  createdAt?: Date;
  modifiedAt?: Date;
  tags?: string[];
  category?: string;
  language?: string;
  source?: string;
  [key: string]: any;
}

export interface MetadataSchema {
  fields: MetadataField[];
  required?: string[];
}

export interface MetadataField {
  name: string;
  type: 'string' | 'number' | 'date' | 'boolean' | 'array' | 'object';
  description?: string;
  default?: any;
}




























































