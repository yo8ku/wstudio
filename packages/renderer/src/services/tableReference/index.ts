/**
 * 表格引用服务导出
 * 功能：导出表格引用解析与 CodeMirror 自动补全能力
 */

export {
  tableReferenceService,
  default as TableReferenceService,
} from './TableReferenceService';

export type {
  FormInfo,
  FormDetail,
  ColumnReference,
  ReferenceType,
  ReferenceItem,
  ParsedReference,
} from './TableReferenceService';

export { createCodeMirrorTableReferenceExtension } from './TableReferenceCompletionProvider';