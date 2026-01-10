/**
 * 表格引用服务导出
 * 功能：导出表格引用相关的服务和类型
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

export {
  createMonacoTableReferenceProvider,
  registerMonacoTableReferenceProvider,
  createCodeMirrorTableReferenceExtension,
  resetCompletionState,
  setSelectedForm,
} from './TableReferenceCompletionProvider';
