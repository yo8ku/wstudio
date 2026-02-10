/**
 * Skills 市场服务
 * 功能：从 skillsmp.com 获取 Skills 技能包
 * 支持关键字搜索和 AI 语义搜索
 * 通过 IPC 在主进程中发起请求，避免 CORS 限制
 */

/** Skill 技能包信息 */
export interface SkillInfo {
  id: string;
  name: string;
  description: string;
  author?: string;
  version?: string;
  stars?: number;
  downloads?: number;
  tags?: string[];
  createdAt?: string | number;
  updatedAt?: string | number;
  githubUrl?: string;
  skillUrl?: string;
}

/**
 * 获取作者头像 URL
 * 通过 GitHub 用户名构造头像 URL
 */
export function getAuthorAvatarUrl(author?: string): string | undefined {
  if (!author) return undefined;
  return `https://github.com/${author}.png?size=80`;
}

/** 搜索结果响应 */
export interface SkillSearchResponse {
  success: boolean;
  data?: {
    skills: SkillInfo[];
    total?: number;
    page?: number;
    limit?: number;
  };
  error?: {
    code: string;
    message: string;
  };
}

/** 搜索参数 */
export interface SkillSearchParams {
  q: string;
  page?: number;
  limit?: number;
  sortBy?: 'stars' | 'recent';
}

/** AI 搜索参数 */
export interface SkillAISearchParams {
  q: string;
}

/** Skill 详情响应 */
export interface SkillDetailResponse {
  success: boolean;
  data?: {
    content: string;
    sourceUrl: string;
  };
  error?: {
    code: string;
    message: string;
  };
}

/** Skill 安装响应 */
export interface SkillInstallResponse {
  success: boolean;
  data?: {
    skillName: string;
    installPath: string;
    filesCount: number;
  };
  error?: {
    code: string;
    message: string;
  };
}

/** Skills 市场错误码 */
export enum SkillsMarketErrorCode {
  MISSING_API_KEY = 'MISSING_API_KEY',
  INVALID_API_KEY = 'INVALID_API_KEY',
  MISSING_QUERY = 'MISSING_QUERY',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
}

/** Skills 市场错误 */
export class SkillsMarketError extends Error {
  code: SkillsMarketErrorCode;

  constructor(code: SkillsMarketErrorCode, message: string) {
    super(message);
    this.name = 'SkillsMarketError';
    this.code = code;
  }
}

/**
 * Skills 市场服务类
 * 提供从 skillsmp.com 获取技能包的功能
 * 通过 IPC 在主进程中发起请求
 */
class SkillsMarketService {
  /**
   * 使用关键字搜索 Skills
   * @param params 搜索参数
   * @returns 搜索结果
   */
  async search(params: SkillSearchParams): Promise<SkillSearchResponse> {
    if (!params.q || params.q.trim() === '') {
      throw new SkillsMarketError(
        SkillsMarketErrorCode.MISSING_QUERY,
        '搜索关键字不能为空'
      );
    }

    try {
      const response = await window.electron?.ipcRenderer.invoke('skills-market:search', params);

      if (!response.success) {
        const errorCode = response.error?.code || SkillsMarketErrorCode.INTERNAL_ERROR;
        const errorMessage = response.error?.message || '请求失败';
        throw new SkillsMarketError(errorCode as SkillsMarketErrorCode, errorMessage);
      }

      return response;
    } catch (error) {
      if (error instanceof SkillsMarketError) {
        throw error;
      }
      throw new SkillsMarketError(
        SkillsMarketErrorCode.NETWORK_ERROR,
        `网络请求失败: ${error instanceof Error ? error.message : '未知错误'}`
      );
    }
  }

  /**
   * 使用 AI 语义搜索 Skills
   * @param params AI 搜索参数
   * @returns 搜索结果
   */
  async aiSearch(params: SkillAISearchParams): Promise<SkillSearchResponse> {
    if (!params.q || params.q.trim() === '') {
      throw new SkillsMarketError(
        SkillsMarketErrorCode.MISSING_QUERY,
        '搜索查询不能为空'
      );
    }

    try {
      const response = await window.electron?.ipcRenderer.invoke('skills-market:ai-search', params);

      if (!response.success) {
        const errorCode = response.error?.code || SkillsMarketErrorCode.INTERNAL_ERROR;
        const errorMessage = response.error?.message || '请求失败';
        throw new SkillsMarketError(errorCode as SkillsMarketErrorCode, errorMessage);
      }

      return response;
    } catch (error) {
      if (error instanceof SkillsMarketError) {
        throw error;
      }
      throw new SkillsMarketError(
        SkillsMarketErrorCode.NETWORK_ERROR,
        `网络请求失败: ${error instanceof Error ? error.message : '未知错误'}`
      );
    }
  }

  /**
   * 获取热门 Skills（按星标数排序）
   * @param limit 返回数量，默认 20
   * @param page 页码，默认 1
   * @returns 热门 Skills 列表
   */
  async getPopular(limit: number = 20, page: number = 1): Promise<SkillSearchResponse> {
    return this.search({
      q: '*',
      limit,
      page,
      sortBy: 'stars',
    });
  }

  /**
   * 获取最新 Skills（按时间排序）
   * @param limit 返回数量，默认 20
   * @param page 页码，默认 1
   * @returns 最新 Skills 列表
   */
  async getRecent(limit: number = 20, page: number = 1): Promise<SkillSearchResponse> {
    return this.search({
      q: '*',
      limit,
      page,
      sortBy: 'recent',
    });
  }

  /**
   * 获取 Skill 详情（从 GitHub 获取 SKILL.md 内容）
   * @param githubUrl GitHub URL
   * @returns Skill 详情内容
   */
  async getDetail(githubUrl: string): Promise<SkillDetailResponse> {
    if (!githubUrl) {
      return {
        success: false,
        error: { code: 'MISSING_URL', message: 'GitHub URL 不能为空' }
      };
    }

    try {
      const response = await window.electron?.ipcRenderer.invoke('skills-market:get-detail', { githubUrl });
      return response;
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: `获取详情失败: ${error instanceof Error ? error.message : '未知错误'}`
        }
      };
    }
  }

  /**
   * 安装 Skill 技能包
   * @param skillName Skill 名称
   * @param githubUrl GitHub URL
   * @param workspacePath 工作区路径
   * @param skillInfo 技能包详情信息（可选）
   * @returns 安装结果
   */
  async installSkill(
    skillName: string,
    githubUrl: string,
    workspacePath: string,
    skillInfo?: Partial<SkillInfo>
  ): Promise<SkillInstallResponse> {
    if (!skillName) {
      return {
        success: false,
        error: { code: 'MISSING_NAME', message: 'Skill 名称不能为空' }
      };
    }

    if (!githubUrl) {
      return {
        success: false,
        error: { code: 'MISSING_URL', message: 'GitHub URL 不能为空' }
      };
    }

    if (!workspacePath) {
      return {
        success: false,
        error: { code: 'MISSING_WORKSPACE', message: '工作区路径不能为空' }
      };
    }

    try {
      const response = await window.electron?.ipcRenderer.invoke('skills-market:install', {
        skillName,
        githubUrl,
        workspacePath,
        skillInfo: skillInfo ? {
          id: skillInfo.id,
          description: skillInfo.description,
          author: skillInfo.author,
          version: skillInfo.version,
          stars: skillInfo.stars,
          downloads: skillInfo.downloads,
          tags: skillInfo.tags,
          createdAt: skillInfo.createdAt,
          updatedAt: skillInfo.updatedAt,
        } : undefined,
      });
      return response;
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INSTALL_ERROR',
          message: `安装失败: ${error instanceof Error ? error.message : '未知错误'}`
        }
      };
    }
  }
}

/** Skills 市场服务单例 */
export const skillsMarketService = new SkillsMarketService();
