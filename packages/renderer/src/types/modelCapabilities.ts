/**
 * 模型能力类型定义
 * 定义 AI 模型支持的各种功能能
 */

/**
 * 模型能力枚举
 */
export enum ModelCapability {
  /** 联网搜索能力 */
  WEB_SEARCH = 'web_search',
  /** 工具调用能力（Function Calling*/
  TOOLS = 'tools',
  /** 视觉能力（图像理解） */
  VISION = 'vision',
  /** 推理能力（高级推理） */
  REASONING = 'reasoning',
  /** 代码执行能力 */
  CODE_EXECUTION = 'code_execution',
  /** 文件上传能力 */
  FILE_UPLOAD = 'file_upload',
  /** 流式输出 */
  STREAMING = 'streaming'
}

/**
 * 模型能力信息
 */
export interface ModelCapabilityInfo {
  /** 能力类型 */
  type: ModelCapability;
  /** 能力名称 */
  name: string;
  /** 能力描述 */
  description: string;
  /** 是否支持 */
  supported: boolean;
}

/**
 * 模型完整能力信息
 */
export interface ModelCapabilities {
  /** 模型 ID */
  modelId: string;
  /** 能力列表 */
  capabilities: ModelCapabilityInfo[];
  /** 检测时*/
  detectedAt: number;
  /** 是否正在检查*/
  detecting?: boolean;
}

/**
 * 能力检测结果
 */
export interface CapabilityDetectionResult {
  /** 模型 ID */
  modelId: string;
  /** 检测到的能*/
  capabilities: ModelCapability[];
  /** 检测是否成功*/
  success: boolean;
  /** 错误信息 */
  error?: string;
}








