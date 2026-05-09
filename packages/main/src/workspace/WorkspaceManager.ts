/**
 * 工作区管理器
 * 使用 electron-store 管理工作区初始化和文件
 */

import Store from 'electron-store';
import * as path from 'path';
import * as fsSync from 'fs';
import * as fs from 'fs/promises';
import { app } from 'electron';

interface WorkspaceConfig {
  initialized: boolean;
  workspaceDir: string;
  recentFiles: string[];
  lastOpened: string;
  openCanvasFiles: string[];
  openCanvasLayout: WorkspaceOpenCanvasLayoutItem[];
}

const WORKSPACE_CANVAS_PANE_IDS = ['left-top', 'left-bottom', 'right-top', 'right-bottom'] as const;
const MAX_RECENT_FILES = 5;

export type WorkspaceCanvasPaneId = typeof WORKSPACE_CANVAS_PANE_IDS[number];

export interface WorkspaceOpenCanvasLayoutItem {
  path: string;
  paneId: WorkspaceCanvasPaneId;
  active: boolean;
}

export class WorkspaceManager {
  private store: Store<WorkspaceConfig>;
  private workspaceDir: string = '';

  constructor() {
    this.store = new Store<WorkspaceConfig>({
      name: 'workspace-config',
      defaults: {
        initialized: false,
        workspaceDir: '',
        recentFiles: [],
        lastOpened: '',
        openCanvasFiles: [],
        openCanvasLayout: [],
      },
    });
  }

  private normalizeStoredPath(filePath: string): string {
    return path.normalize(filePath).toLowerCase();
  }

  private matchesStoredPathOrDescendant(candidatePath: string, targetPath: string): boolean {
    const normalizedCandidate = path.normalize(candidatePath);
    const normalizedTarget = path.normalize(targetPath);
    const comparableCandidate = this.normalizeStoredPath(normalizedCandidate);
    const comparableTarget = this.normalizeStoredPath(normalizedTarget);

    return comparableCandidate === comparableTarget
      || comparableCandidate.startsWith(`${comparableTarget}${path.sep}`);
  }

  private rewriteStoredPathForRename(candidatePath: string, oldPath: string, newPath: string): string | null {
    const normalizedCandidate = path.normalize(candidatePath);
    const normalizedOldPath = path.normalize(oldPath);
    const normalizedNewPath = path.normalize(newPath);
    const comparableCandidate = this.normalizeStoredPath(normalizedCandidate);
    const comparableOldPath = this.normalizeStoredPath(normalizedOldPath);

    if (comparableCandidate === comparableOldPath) {
      return normalizedNewPath;
    }

    const descendantPrefix = `${comparableOldPath}${path.sep}`;

    if (!comparableCandidate.startsWith(descendantPrefix)) {
      return null;
    }

    const relativeSuffix = normalizedCandidate.slice(normalizedOldPath.length).replace(/^[\\/]+/, '');

    return relativeSuffix.length === 0
      ? normalizedNewPath
      : path.join(normalizedNewPath, relativeSuffix);
  }

  private isCanvasFilePath(filePath: string): boolean {
    const extension = path.extname(filePath).toLowerCase();
    return extension === '.canvas' || extension === '.canvs';
  }

  private resolveStoredFilePath(filePath: string): string {
    this.ensureWorkspaceDir();
    return path.isAbsolute(filePath)
      ? filePath
      : path.join(this.workspaceDir, filePath);
  }

  private pathExists(filePath: string): boolean {
    try {
      return fsSync.existsSync(filePath);
    } catch {
      return false;
    }
  }

  private sanitizeCanvasFilePaths(filePaths: readonly string[]): string[] {
    const seen = new Set<string>();
    const normalizedPaths: string[] = [];

    for (const filePath of filePaths) {
      if (typeof filePath !== 'string') {
        continue;
      }

      const trimmedPath = filePath.trim();
      if (trimmedPath.length === 0) {
        continue;
      }

      const resolvedPath = this.resolveStoredFilePath(trimmedPath);
      if (!this.isCanvasFilePath(resolvedPath) || !this.pathExists(resolvedPath)) {
        continue;
      }

      const normalizedKey = this.normalizeStoredPath(resolvedPath);
      if (seen.has(normalizedKey)) {
        continue;
      }

      seen.add(normalizedKey);
      normalizedPaths.push(resolvedPath);
    }

    return normalizedPaths;
  }

  private isCanvasPaneId(value: string): value is WorkspaceCanvasPaneId {
    return WORKSPACE_CANVAS_PANE_IDS.includes(value as WorkspaceCanvasPaneId);
  }

  private sanitizeCanvasLayoutItems(
    layoutItems: readonly WorkspaceOpenCanvasLayoutItem[],
  ): WorkspaceOpenCanvasLayoutItem[] {
    if (!Array.isArray(layoutItems)) {
      return [];
    }

    const seen = new Set<string>();
    const normalizedItems: WorkspaceOpenCanvasLayoutItem[] = [];

    for (const item of layoutItems) {
      if (typeof item?.path !== 'string' || typeof item.paneId !== 'string') {
        continue;
      }

      const trimmedPath = item.path.trim();
      if (trimmedPath.length === 0 || !this.isCanvasPaneId(item.paneId)) {
        continue;
      }

      const resolvedPath = this.resolveStoredFilePath(trimmedPath);
      if (!this.isCanvasFilePath(resolvedPath) || !this.pathExists(resolvedPath)) {
        continue;
      }

      const normalizedKey = `${this.normalizeStoredPath(resolvedPath)}::${item.paneId}`;
      if (seen.has(normalizedKey)) {
        continue;
      }

      seen.add(normalizedKey);
      normalizedItems.push({
        path: resolvedPath,
        paneId: item.paneId,
        active: item.active === true,
      });
    }

    return normalizedItems;
  }

  private resolveDocumentsPath(): string {
    if (!app) {
      throw new Error('[WorkspaceManager] Electron app is unavailable before initialization');
    }

    return app.getPath('documents');
  }

  private ensureWorkspaceDir(): void {
    if (this.workspaceDir) {
      return;
    }

    const documentsPath = this.resolveDocumentsPath();
    this.workspaceDir = path.join(documentsPath, 'NoteStudio');
  }

  /**
   * 初始化工作区
   */
  async initialize(): Promise<void> {
    this.ensureWorkspaceDir();

    const isInitialized = this.store.get('initialized');

    if (!isInitialized) {
      console.log('[WorkspaceManager] 首次初始化工作区...');

      // 创建工作区目录
      await this.createWorkspaceDirectory();

      // 创建欢迎文档
      await this.createWelcomeDocument();

      // 标记为已初始化
      this.store.set('initialized', true);
      this.store.set('workspaceDir', this.workspaceDir);

      console.log('[WorkspaceManager] 工作区初始化完成:', this.workspaceDir);
    } else {
      this.workspaceDir = this.store.get('workspaceDir') as string || this.workspaceDir;
      console.log('[WorkspaceManager] 工作区已存在:', this.workspaceDir);
    }
  }

  /**
   * 创建工作区目录
   */
  private async createWorkspaceDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.workspaceDir, { recursive: true });
      console.log('[WorkspaceManager] 创建工作区目录:', this.workspaceDir);
    } catch (error) {
      console.error('[WorkspaceManager] 创建工作区目录失败:', error);
      throw error;
    }
  }

  /**
   * 创建欢迎文档
   */
  private async createWelcomeDocument(): Promise<void> {
    const welcomeFilePath = path.join(this.workspaceDir, '欢迎使用 Note Studio.md');
    const welcomeContent = `# 欢迎使用 Note Studio 

## 简介

Note Studio 是一个现代化的笔记应用，支持以下功能：

-  **Markdown 编辑**：完整的 Markdown 语法支持
-  **JSON 编辑**：语法高亮和格式化
-  **文本编辑**：纯文本文件编辑
-  **VSCode 扩展**：支持运行 VSCode 扩展
-  **主题系统**：丰富的主题选择
-  **AI 集成**：智能助手功能

## 快速开始

### 1. 创建新文件

点击菜单栏的 **文件 > 新建文件** 或使用快捷键 \`Ctrl+N\`

### 2. 打开文件

点击菜单栏的 **文件 > 打开文件** 或使用快捷键 \`Ctrl+O\`

支持的文件类型：
- \`.md\` \`.markdown\` - Markdown 文件
- \`.json\` - JSON 文件
- \`.txt\` - 文本文件

### 3. 保存文件

- **保存**：\`Ctrl+S\`
- **另存为**：\`Ctrl+Shift+S\`

## 功能特性

### Markdown 编辑

支持完整的 Markdown 语法，包括：

- 标题、列表、链接
- 代码块、表格
- 任务列表
- 数学公式（LaTeX）

### 扩展系统

在左侧活动栏可以访问：

-  **扩展市场**：安装更多功能
-  **主题**：自定义编辑器外观
-  **设置**：个性化配置

### AI 助手

点击左侧的  图标打开 AI 助手面板，获得智能写作帮助。

## 工作区目录

您的笔记保存在：
\`${this.workspaceDir}\`

## 获取帮助

- 访问菜单栏的 **帮助 > 文档**
- 查看 **帮助 > 快捷键**

---

**开始你的创作之旅吧！** 
`;

    try {
      await fs.writeFile(welcomeFilePath, welcomeContent, 'utf-8');

      // 将欢迎文档添加到最近文件列表
      this.addRecentFile(welcomeFilePath);
      this.store.set('lastOpened', welcomeFilePath);

      console.log('[WorkspaceManager] 创建欢迎文档:', welcomeFilePath);
    } catch (error) {
      console.error('[WorkspaceManager] 创建欢迎文档失败:', error);
      throw error;
    }
  }

  /**
   * 获取工作区目录
   */
  getWorkspaceDir(): string {
    this.ensureWorkspaceDir();
    return this.workspaceDir;
  }

  /**
   * 设置工作区目录
   */
  setWorkspaceDir(dirPath: string): void {
    this.workspaceDir = dirPath;
    this.store.set('workspaceDir', dirPath);
    console.log('[WorkspaceManager] 设置工作区目录:', dirPath);
  }

  /**
   * 获取最近打开的文件列表
   */
  getRecentFiles(): string[] {
    return this.store.get('recentFiles', []) as string[];
  }

  /**
   * 添加最近打开的文件
   * 只保留最新的5条记录
   */
  addRecentFile(filePath: string): void {
    const recentFiles = this.getRecentFiles();

    // 移除重复项
    const filtered = recentFiles.filter(f => f !== filePath);

    // 添加到开头，最多保留 5 个
    const updated = [filePath, ...filtered].slice(0, MAX_RECENT_FILES);

    this.store.set('recentFiles', updated);
  }

  removeRecentFile(filePath: string): void {
    const comparableTargetPath = this.normalizeStoredPath(filePath);
    const updatedRecentFiles = this.getRecentFiles().filter(
      recentFilePath => this.normalizeStoredPath(recentFilePath) !== comparableTargetPath,
    );

    this.store.set('recentFiles', updatedRecentFiles);

    const lastOpened = this.getLastOpenedFile();
    if (typeof lastOpened === 'string' && this.normalizeStoredPath(lastOpened) === comparableTargetPath) {
      this.store.set('lastOpened', updatedRecentFiles[0] ?? '');
    }
  }

  /**
   * 清除最近文件列表
   */
  clearRecentFiles(): void {
    this.store.set('recentFiles', []);
  }

  /**
   * 获取上次打开的文件
   */
  getLastOpenedFile(): string | undefined {
    const storedPath = this.store.get('lastOpened') as string | undefined;

    if (typeof storedPath !== 'string' || storedPath.trim().length === 0) {
      return undefined;
    }

    const resolvedPath = this.resolveStoredFilePath(storedPath);

    if (!this.pathExists(resolvedPath)) {
      this.store.set('lastOpened', '');
      return undefined;
    }

    return resolvedPath;
  }

  /**
   * 设置上次打开的文件
   */
  setLastOpenedFile(filePath: string): void {
    const trimmedPath = filePath.trim();

    if (trimmedPath.length === 0) {
      this.store.set('lastOpened', '');
      return;
    }

    this.store.set('lastOpened', this.resolveStoredFilePath(trimmedPath));
  }

  getOpenCanvasFiles(): string[] {
    const storedPaths = this.store.get('openCanvasFiles', []) as string[];
    const sanitizedPaths = this.sanitizeCanvasFilePaths(storedPaths);
    const storedSnapshot = JSON.stringify(storedPaths);
    const sanitizedSnapshot = JSON.stringify(sanitizedPaths);

    if (storedSnapshot !== sanitizedSnapshot) {
      this.store.set('openCanvasFiles', sanitizedPaths);
    }

    return sanitizedPaths;
  }

  setOpenCanvasFiles(filePaths: readonly string[]): void {
    const normalizedPaths = this.sanitizeCanvasFilePaths(filePaths);
    this.store.set('openCanvasFiles', normalizedPaths);
  }

  getOpenCanvasLayout(): WorkspaceOpenCanvasLayoutItem[] {
    const storedItems = this.store.get('openCanvasLayout', []) as WorkspaceOpenCanvasLayoutItem[];
    const sanitizedItems = this.sanitizeCanvasLayoutItems(storedItems);
    const storedSnapshot = JSON.stringify(storedItems);
    const sanitizedSnapshot = JSON.stringify(sanitizedItems);

    if (storedSnapshot !== sanitizedSnapshot) {
      this.store.set('openCanvasLayout', sanitizedItems);
    }

    return sanitizedItems;
  }

  setOpenCanvasLayout(layoutItems: readonly WorkspaceOpenCanvasLayoutItem[]): void {
    const normalizedItems = this.sanitizeCanvasLayoutItems(layoutItems);
    this.store.set('openCanvasLayout', normalizedItems);
    this.setOpenCanvasFiles(normalizedItems.map((item) => item.path));
  }

  syncRenamedFilePath(oldPath: string, newPath: string): void {
    const updatePath = (filePath: string): string => {
      const rewrittenPath = this.rewriteStoredPathForRename(filePath, oldPath, newPath);
      return rewrittenPath ?? filePath;
    };

    const recentFiles = this.getRecentFiles().map(updatePath);
    const lastOpened = this.getLastOpenedFile();
    const openCanvasFiles = this.getOpenCanvasFiles().map(updatePath);
    const openCanvasLayout = this.getOpenCanvasLayout().map((item) => ({
      ...item,
      path: updatePath(item.path),
    }));

    this.store.set('recentFiles', [...new Set(recentFiles)]);
    if (typeof lastOpened === 'string' && lastOpened.length > 0) {
      this.store.set('lastOpened', updatePath(lastOpened));
    }
    this.setOpenCanvasFiles(openCanvasFiles);
    this.setOpenCanvasLayout(openCanvasLayout);
  }

  syncDeletedFilePath(targetPath: string): void {
    const recentFiles = this.getRecentFiles().filter((filePath) => (
      !this.matchesStoredPathOrDescendant(filePath, targetPath)
    ));
    const lastOpened = this.getLastOpenedFile();
    const openCanvasFiles = this.getOpenCanvasFiles().filter((filePath) => (
      !this.matchesStoredPathOrDescendant(filePath, targetPath)
    ));
    const openCanvasLayout = this.getOpenCanvasLayout().filter((item) => (
      !this.matchesStoredPathOrDescendant(item.path, targetPath)
    ));

    this.store.set('recentFiles', [...new Set(recentFiles)]);

    if (typeof lastOpened === 'string' && this.matchesStoredPathOrDescendant(lastOpened, targetPath)) {
      this.store.set('lastOpened', '');
    }

    this.setOpenCanvasFiles(openCanvasFiles);
    this.setOpenCanvasLayout(openCanvasLayout);
  }

  /**
   * 验证文件类型是否支持
   */
  isSupportedFileType(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    const supportedExtensions = ['.md', '.markdown', '.json', '.txt'];
    return supportedExtensions.includes(ext);
  }

  /**
   * 获取文件语言类型
   */
  getFileLanguage(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const filename = path.basename(filePath);

    switch (ext) {
      case '.md':
      case '.markdown':
        return 'markdown';
      case '.json':
        // settings.json 使用 jsonc 支持注释
        if (filename === 'settings.json') {
          return 'jsonc';
        }
        // 主题文件使用 jsonc 支持注释
        if (filePath.includes('/themes/') || filePath.includes('\\themes\\')) {
          return 'jsonc';
        }
        return 'json';
      case '.txt':
        return 'plaintext';
      case '.css':
        return 'css';
      default:
        return 'plaintext';
    }
  }
}
