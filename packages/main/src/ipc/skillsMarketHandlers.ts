/**
 * Skills 市场 IPC 处理器
 * 功能：在主进程中处理 Skills 市场 API 请求，避免 CORS 限制
 */

import { ipcMain, BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

/** Skills 市场 API 配置 */
const SKILLS_MARKET_CONFIG = {
  baseUrl: 'https://skillsmp.com',
  apiKey: 'sk_live_skillsmp_A7rMh9uRnMkhBT8DxhjzKlWhgyJ8pWkkNGF_casCXiQ',
};

/** 搜索参数 */
interface SkillSearchParams {
  q: string;
  page?: number;
  limit?: number;
  sortBy?: 'stars' | 'recent';
}

/** AI 搜索参数 */
interface SkillAISearchParams {
  q: string;
}

/** Skill 详情参数 */
interface SkillDetailParams {
  githubUrl: string;
}

/** Skill 安装参数 */
interface SkillInstallParams {
  skillName: string;
  githubUrl: string;
  workspacePath: string;
  /** 技能包详情信息 */
  skillInfo?: {
    id?: string;
    description?: string;
    author?: string;
    version?: string;
    stars?: number;
    downloads?: number;
    tags?: string[];
    createdAt?: string | number;
    updatedAt?: string | number;
  };
}

/** 获取本地 Skills 参数 */
interface GetLocalSkillsParams {
  workspacePath: string;
}

/** 本地 Skill 信息 */
interface LocalSkillInfo {
  name: string;
  path: string;
  isInstalled: boolean;
  description?: string;
  githubUrl?: string;
  /** 来自 package.json 的详情信息 */
  packageInfo?: {
    version?: string;
    author?: string;
    source?: string;
    stars?: number;
    downloads?: number;
    tags?: string[];
    createdAt?: string | number;
    updatedAt?: string | number;
    installedAt?: number;
  };
}

/** GitHub 文件信息 */
interface GitHubFileInfo {
  name: string;
  path: string;
  type: 'file' | 'dir';
  download_url: string | null;
}

/**
 * 解析 GitHub URL 获取仓库信息
 * @param githubUrl GitHub URL，格式如：https://github.com/owner/repo/tree/branch/path
 * @returns 解析后的仓库信息
 */
function parseGitHubUrl(githubUrl: string): { owner: string; repo: string; branch: string; path: string } | null {
  try {
    const url = new URL(githubUrl);
    if (url.hostname !== 'github.com') {
      return null;
    }

    // 路径格式: /owner/repo/tree/branch/path/to/skill
    const pathParts = url.pathname.split('/').filter(Boolean);

    if (pathParts.length < 4 || pathParts[2] !== 'tree') {
      return null;
    }

    const owner = pathParts[0];
    const repo = pathParts[1];
    const branch = pathParts[3];
    const path = pathParts.slice(4).join('/');

    return { owner, repo, branch, path };
  } catch {
    return null;
  }
}

/**
 * 递归获取 GitHub 目录下的所有文件
 */
async function getGitHubFiles(
  owner: string,
  repo: string,
  branch: string,
  dirPath: string
): Promise<{ path: string; downloadUrl: string }[]> {
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${dirPath}?ref=${branch}`;
  console.log('[SkillsMarketHandlers] 获取目录内容:', apiUrl);

  const response = await fetch(apiUrl, {
    headers: {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Note-Studio-App',
    },
  });

  if (!response.ok) {
    throw new Error(`获取目录内容失败: ${response.status}`);
  }

  const files: GitHubFileInfo[] = await response.json();
  const result: { path: string; downloadUrl: string }[] = [];

  for (const file of files) {
    if (file.type === 'file' && file.download_url) {
      // 获取相对于 skill 目录的路径
      const relativePath = file.path.replace(dirPath + '/', '');
      result.push({
        path: relativePath,
        downloadUrl: file.download_url,
      });
    } else if (file.type === 'dir') {
      // 递归获取子目录
      const subFiles = await getGitHubFiles(owner, repo, branch, file.path);
      result.push(...subFiles);
    }
  }

  return result;
}

/**
 * 下载文件内容
 */
async function downloadFile(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Note-Studio-App',
    },
  });

  if (!response.ok) {
    throw new Error(`下载文件失败: ${response.status}`);
  }

  return response.text();
}

// 防止重复注册的标志
let isRegistered = false;

/**
 * 注册 Skills 市场相关的 IPC 处理器
 */
export function registerSkillsMarketHandlers(): void {
  if (isRegistered) {
    console.log('[SkillsMarketHandlers] 已注册，跳过');
    return;
  }

  // 移除可能存在的旧处理器
  const handlersToRemove = [
    'skills-market:search',
    'skills-market:ai-search',
    'skills-market:get-detail',
    'skills-market:install',
    'skills-market:get-local-skills',
  ];

  for (const handler of handlersToRemove) {
    try {
      ipcMain.removeHandler(handler);
    } catch (e) {
      // 忽略未注册的处理器
    }
  }

  /**
   * 关键字搜索 Skills
   */
  ipcMain.handle('skills-market:search', async (event, params: SkillSearchParams) => {
    try {
      console.log('[SkillsMarketHandlers] 关键字搜索:', params);

      if (!params.q || params.q.trim() === '') {
        return {
          success: false,
          error: { code: 'MISSING_QUERY', message: '搜索关键字不能为空' }
        };
      }

      const queryParams = new URLSearchParams();
      queryParams.set('q', params.q);

      if (params.page !== undefined) {
        queryParams.set('page', params.page.toString());
      }
      if (params.limit !== undefined) {
        queryParams.set('limit', Math.min(params.limit, 100).toString());
      }
      if (params.sortBy) {
        queryParams.set('sortBy', params.sortBy);
      }

      const url = `${SKILLS_MARKET_CONFIG.baseUrl}/api/v1/skills/search?${queryParams.toString()}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${SKILLS_MARKET_CONFIG.apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('[SkillsMarketHandlers] 搜索失败:', data);
        return {
          success: false,
          error: data.error || { code: 'INTERNAL_ERROR', message: '请求失败' }
        };
      }

      console.log('[SkillsMarketHandlers] 搜索成功，结果数量:', data.data?.skills?.length || 0);
      return data;
    } catch (error) {
      console.error('[SkillsMarketHandlers] 搜索异常:', error);
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: `网络请求失败: ${error instanceof Error ? error.message : '未知错误'}`
        }
      };
    }
  });

  /**
   * AI 语义搜索 Skills
   */
  ipcMain.handle('skills-market:ai-search', async (event, params: SkillAISearchParams) => {
    try {
      console.log('[SkillsMarketHandlers] AI 语义搜索:', params);

      if (!params.q || params.q.trim() === '') {
        return {
          success: false,
          error: { code: 'MISSING_QUERY', message: '搜索查询不能为空' }
        };
      }

      const queryParams = new URLSearchParams();
      queryParams.set('q', params.q);

      const url = `${SKILLS_MARKET_CONFIG.baseUrl}/api/v1/skills/ai-search?${queryParams.toString()}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${SKILLS_MARKET_CONFIG.apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('[SkillsMarketHandlers] AI 搜索失败:', data);
        return {
          success: false,
          error: data.error || { code: 'INTERNAL_ERROR', message: '请求失败' }
        };
      }

      console.log('[SkillsMarketHandlers] AI 搜索成功，结果数量:', data.data?.skills?.length || 0);
      return data;
    } catch (error) {
      console.error('[SkillsMarketHandlers] AI 搜索异常:', error);
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: `网络请求失败: ${error instanceof Error ? error.message : '未知错误'}`
        }
      };
    }
  });

  /**
   * 获取 Skill 详情（从 GitHub 获取 SKILL.md 内容）
   */
  ipcMain.handle('skills-market:get-detail', async (event, params: SkillDetailParams) => {
    try {
      console.log('[SkillsMarketHandlers] 获取 Skill 详情:', params.githubUrl);

      if (!params.githubUrl) {
        return {
          success: false,
          error: { code: 'MISSING_URL', message: 'GitHub URL 不能为空' }
        };
      }

      // 解析 GitHub URL
      const repoInfo = parseGitHubUrl(params.githubUrl);
      if (!repoInfo) {
        return {
          success: false,
          error: { code: 'INVALID_URL', message: '无效的 GitHub URL 格式' }
        };
      }

      const { owner, repo, branch, path } = repoInfo;

      // 构造 raw 内容 URL
      const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}/SKILL.md`;
      console.log('[SkillsMarketHandlers] 获取 SKILL.md:', rawUrl);

      const response = await fetch(rawUrl);

      if (!response.ok) {
        // 尝试其他可能的文件名
        const alternativeUrls = [
          `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}/skill.md`,
          `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}/README.md`,
        ];

        for (const altUrl of alternativeUrls) {
          console.log('[SkillsMarketHandlers] 尝试备选 URL:', altUrl);
          const altResponse = await fetch(altUrl);
          if (altResponse.ok) {
            const content = await altResponse.text();
            console.log('[SkillsMarketHandlers] 获取详情成功（备选）');
            return {
              success: true,
              data: { content, sourceUrl: altUrl }
            };
          }
        }

        console.error('[SkillsMarketHandlers] 获取详情失败: 文件不存在');
        return {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Skill 详情文件不存在' }
        };
      }

      const content = await response.text();
      console.log('[SkillsMarketHandlers] 获取详情成功');

      return {
        success: true,
        data: { content, sourceUrl: rawUrl }
      };
    } catch (error) {
      console.error('[SkillsMarketHandlers] 获取详情异常:', error);
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: `网络请求失败: ${error instanceof Error ? error.message : '未知错误'}`
        }
      };
    }
  });

  /**
   * 安装 Skill 技能包（从 GitHub 下载并保存到本地）
   */
  ipcMain.handle('skills-market:install', async (event, params: SkillInstallParams) => {
    try {
      console.log('[SkillsMarketHandlers] 安装 Skill:', params.skillName);

      if (!params.githubUrl) {
        return {
          success: false,
          error: { code: 'MISSING_URL', message: 'GitHub URL 不能为空' }
        };
      }

      if (!params.workspacePath) {
        return {
          success: false,
          error: { code: 'MISSING_WORKSPACE', message: '工作区路径不能为空' }
        };
      }

      // 解析 GitHub URL
      const repoInfo = parseGitHubUrl(params.githubUrl);
      if (!repoInfo) {
        return {
          success: false,
          error: { code: 'INVALID_URL', message: '无效的 GitHub URL 格式' }
        };
      }

      const { owner, repo, branch, path: skillPath } = repoInfo;

      // 创建本地 skills 目录
      const skillsDir = path.join(params.workspacePath, '.wstudio', 'skills');
      const targetDir = path.join(skillsDir, params.skillName);

      // 确保目录存在
      if (!fs.existsSync(skillsDir)) {
        fs.mkdirSync(skillsDir, { recursive: true });
      }

      // 如果目标目录已存在，先删除
      if (fs.existsSync(targetDir)) {
        fs.rmSync(targetDir, { recursive: true, force: true });
      }

      // 创建目标目录
      fs.mkdirSync(targetDir, { recursive: true });

      console.log('[SkillsMarketHandlers] 目标目录:', targetDir);

      // 获取所有文件列表
      const files = await getGitHubFiles(owner, repo, branch, skillPath);
      console.log('[SkillsMarketHandlers] 找到文件数量:', files.length);

      // 下载并保存每个文件
      for (const file of files) {
        const filePath = path.join(targetDir, file.path);
        const fileDir = path.dirname(filePath);

        // 确保文件目录存在
        if (!fs.existsSync(fileDir)) {
          fs.mkdirSync(fileDir, { recursive: true });
        }

        // 下载文件内容
        console.log('[SkillsMarketHandlers] 下载文件:', file.path);
        const content = await downloadFile(file.downloadUrl);

        // 保存文件
        fs.writeFileSync(filePath, content, 'utf-8');
      }

      console.log('[SkillsMarketHandlers] 安装成功:', params.skillName);

      // 创建 package.json 文件，保存技能包详情信息
      const packageJson = {
        name: params.skillName,
        version: params.skillInfo?.version || '1.0.0',
        description: params.skillInfo?.description || '',
        author: params.skillInfo?.author || '',
        source: 'skillsmp.com',
        githubUrl: params.githubUrl,
        skillInfo: {
          id: params.skillInfo?.id || params.skillName,
          stars: params.skillInfo?.stars || 0,
          downloads: params.skillInfo?.downloads || 0,
          tags: params.skillInfo?.tags || [],
          createdAt: params.skillInfo?.createdAt || Date.now(),
          updatedAt: params.skillInfo?.updatedAt || Date.now(),
        },
        installedAt: Date.now(),
      };

      const packageJsonPath = path.join(targetDir, 'package.json');
      fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2), 'utf-8');
      console.log('[SkillsMarketHandlers] 创建 package.json:', packageJsonPath);

      return {
        success: true,
        data: {
          skillName: params.skillName,
          installPath: targetDir,
          filesCount: files.length,
        }
      };
    } catch (error) {
      console.error('[SkillsMarketHandlers] 安装异常:', error);
      return {
        success: false,
        error: {
          code: 'INSTALL_ERROR',
          message: `安装失败: ${error instanceof Error ? error.message : '未知错误'}`
        }
      };
    }
  });

  /**
   * 获取本地已安装的 Skills
   */
  ipcMain.handle('skills-market:get-local-skills', async (event, params: GetLocalSkillsParams) => {
    try {
      console.log('[SkillsMarketHandlers] 获取本地 Skills:', params.workspacePath);

      if (!params.workspacePath) {
        return {
          success: false,
          error: { code: 'MISSING_WORKSPACE', message: '工作区路径不能为空' }
        };
      }

      const skillsDir = path.join(params.workspacePath, '.wstudio', 'skills');
      const skills: LocalSkillInfo[] = [];

      // 检查 skills 目录是否存在
      if (!fs.existsSync(skillsDir)) {
        console.log('[SkillsMarketHandlers] Skills 目录不存在');
        return {
          success: true,
          data: { skills: [] }
        };
      }

      // 读取 skills 目录下的所有子目录
      const entries = fs.readdirSync(skillsDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skillPath = path.join(skillsDir, entry.name);

          // 优先检查是否有 package.json 文件（市场安装的会有）
          const packageJsonPath = path.join(skillPath, 'package.json');
          let description: string | undefined;
          let githubUrl: string | undefined;
          let packageInfo: LocalSkillInfo['packageInfo'] | undefined;
          let isFromMarket = false;

          if (fs.existsSync(packageJsonPath)) {
            try {
              const packageContent = fs.readFileSync(packageJsonPath, 'utf-8');
              const packageData = JSON.parse(packageContent);

              // 从 package.json 读取信息
              description = packageData.description;
              githubUrl = packageData.githubUrl;
              isFromMarket = packageData.source === 'skillsmp.com';

              packageInfo = {
                version: packageData.version,
                author: packageData.author,
                source: packageData.source,
                stars: packageData.skillInfo?.stars,
                downloads: packageData.skillInfo?.downloads,
                tags: packageData.skillInfo?.tags,
                createdAt: packageData.skillInfo?.createdAt,
                updatedAt: packageData.skillInfo?.updatedAt,
                installedAt: packageData.installedAt,
              };

              console.log('[SkillsMarketHandlers] 从 package.json 读取技能包信息:', entry.name);
            } catch (err) {
              console.warn('[SkillsMarketHandlers] 读取 package.json 失败:', err);
            }
          }

          // 如果没有从 package.json 获取到信息，尝试从 SKILL.md 读取
          if (!description) {
            // 检查是否有 SKILL.md 文件
            const skillMdPath = fs.existsSync(path.join(skillPath, 'SKILL.md'))
              ? path.join(skillPath, 'SKILL.md')
              : fs.existsSync(path.join(skillPath, 'skill.md'))
                ? path.join(skillPath, 'skill.md')
                : null;

            if (skillMdPath) {
              try {
                const content = fs.readFileSync(skillMdPath, 'utf-8');

                // 尝试解析 frontmatter 格式
                const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
                if (frontmatterMatch) {
                  const frontmatter = frontmatterMatch[1];
                  // 提取 description
                  const descMatch = frontmatter.match(/description:\s*["']?([^"'\n]+)["']?/);
                  if (descMatch) {
                    description = descMatch[1].trim();
                  }
                  // 提取 githubUrl
                  if (!githubUrl) {
                    const urlMatch = frontmatter.match(/(?:github_?[Uu]rl|url|source):\s*["']?([^"'\n]+)["']?/);
                    if (urlMatch) {
                      githubUrl = urlMatch[1].trim();
                    }
                  }
                }

                // 如果没有 frontmatter，尝试从内容中提取描述
                if (!description) {
                  // 移除 frontmatter（如果有）
                  const contentWithoutFrontmatter = content.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '');
                  // 跳过标题行，获取第一段非空内容作为描述
                  const lines = contentWithoutFrontmatter.split('\n');
                  for (const line of lines) {
                    const trimmedLine = line.trim();
                    // 跳过空行和标题行
                    if (trimmedLine && !trimmedLine.startsWith('#')) {
                      description = trimmedLine;
                      break;
                    }
                  }
                }
              } catch (err) {
                console.warn('[SkillsMarketHandlers] 读取 SKILL.md 失败:', err);
              }
            }
          }

          // 判断是否从市场安装：有 package.json 且 source 为 skillsmp.com
          const hasSkillMd = fs.existsSync(path.join(skillPath, 'SKILL.md')) ||
                            fs.existsSync(path.join(skillPath, 'skill.md'));

          skills.push({
            name: entry.name,
            path: skillPath,
            isInstalled: isFromMarket || hasSkillMd,
            description,
            githubUrl,
            packageInfo,
          });
        }
      }

      console.log('[SkillsMarketHandlers] 找到本地 Skills:', skills.length);

      return {
        success: true,
        data: { skills }
      };
    } catch (error) {
      console.error('[SkillsMarketHandlers] 获取本地 Skills 异常:', error);
      return {
        success: false,
        error: {
          code: 'READ_ERROR',
          message: `读取本地 Skills 失败: ${error instanceof Error ? error.message : '未知错误'}`
        }
      };
    }
  });

  isRegistered = true;
  console.log('[SkillsMarketHandlers] IPC 处理器注册完成');
}
