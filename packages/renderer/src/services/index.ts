/**
 * 服务模块统一导出
 */

export { ModelCapabilityDetector, modelCapabilityDetector } from './modelCapabilityDetector';
export {
  inlineChatHistoryService,
  type InlineChatMessage,
  type InlineChatSession,
  type InlineChatQuery
} from './InlineChatHistoryService';
export {
  skillsMarketService,
  SkillsMarketError,
  SkillsMarketErrorCode,
  getAuthorAvatarUrl,
  type SkillInfo,
  type SkillSearchParams,
  type SkillAISearchParams,
  type SkillSearchResponse,
  type SkillDetailResponse,
  type SkillInstallResponse,
} from './SkillsMarketService';








