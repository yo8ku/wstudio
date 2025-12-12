/**
 * 知识库崩溃恢复服务
 * 功能：在应用启动时检测并恢复中断的文件上传
 * 
 * 处理场景：
 * 1. 软件突然关闭
 * 2. 突然断网
 * 3. 电脑突然关闭
 */

import { knowledgeBaseService } from '../components/Layout/Sidebar/KnowledgeBase/knowledgeBaseService';
import { ragProcessingService } from './RAGProcessingService';
import { toastService } from './ToastService';
import type { KnowledgeItem } from '../components/Layout/Sidebar/KnowledgeBase/types';

class KnowledgeBaseRecoveryService {
  private static instance: KnowledgeBaseRecoveryService;
  private isRecovering = false;
  private hasInitialized = false;

  private constructor() {}

  public static getInstance(): KnowledgeBaseRecoveryService {
    if (!KnowledgeBaseRecoveryService.instance) {
      KnowledgeBaseRecoveryService.instance = new KnowledgeBaseRecoveryService();
    }
    return KnowledgeBaseRecoveryService.instance;
  }

  /**
   * 初始化恢复服务（应用启动时调用）
   */
  async initialize(): Promise<void> {
    if (this.hasInitialized) {
      console.log('[KnowledgeBaseRecoveryService] 已初始化，跳过');
      return;
    }

    this.hasInitialized = true;
    console.log('[KnowledgeBaseRecoveryService] 开始检查中断的上传任务...');

    try {
      await this.checkAndRecoverInterruptedUploads();
    } catch (error) {
      console.error('[KnowledgeBaseRecoveryService] 初始化失败:', error);
    }
  }

  /**
   * 检查并恢复中断的上传
   */
  private async checkAndRecoverInterruptedUploads(): Promise<void> {
    if (this.isRecovering) {
      console.log('[KnowledgeBaseRecoveryService] 正在恢复中，跳过');
      return;
    }

    this.isRecovering = true;

    try {
      const data = await knowledgeBaseService.loadFromStorage();
      const interruptedFiles: Array<{
        file: KnowledgeItem;
        knowledgeBaseId: string;
        knowledgeBaseName: string;
      }> = [];

      // 遍历所有知识库，查找中断的文件
      for (const knowledgeBase of data.created) {
        if (knowledgeBase.type !== 'folder') continue;

        const findInterruptedFiles = (items: KnowledgeItem[], kbId: string, kbName: string) => {
          for (const item of items) {
            if (item.type === 'file') {
              const status = item.metadata?.processingStatus;
              // 检查是否是中断的上传（processing 或 pending 状态）
              if (status === 'processing' || status === 'pending') {
                interruptedFiles.push({
                  file: item,
                  knowledgeBaseId: kbId,
                  knowledgeBaseName: kbName,
                });
              }
            }
            if (item.children) {
              findInterruptedFiles(item.children, kbId, kbName);
            }
          }
        };

        findInterruptedFiles(
          knowledgeBase.children || [],
          knowledgeBase.id,
          knowledgeBase.title
        );
      }

      if (interruptedFiles.length === 0) {
        console.log('[KnowledgeBaseRecoveryService] 没有发现中断的上传任务');
        return;
      }

      console.log(
        `[KnowledgeBaseRecoveryService] 发现 ${interruptedFiles.length} 个中断的上传任务`
      );

      // 显示恢复提示
      toastService.info(
        `检测到 ${interruptedFiles.length} 个未完成的上传任务，正在恢复...`
      );

      // 按知识库分组恢复
      const groupedByKb = new Map<string, typeof interruptedFiles>();
      for (const item of interruptedFiles) {
        const existing = groupedByKb.get(item.knowledgeBaseId) || [];
        existing.push(item);
        groupedByKb.set(item.knowledgeBaseId, existing);
      }

      // 逐个知识库恢复
      for (const [knowledgeBaseId, files] of groupedByKb) {
        await this.recoverKnowledgeBaseFiles(knowledgeBaseId, files);
      }

      console.log('[KnowledgeBaseRecoveryService] 恢复任务完成');
    } catch (error) {
      console.error('[KnowledgeBaseRecoveryService] 恢复失败:', error);
    } finally {
      this.isRecovering = false;
    }
  }

  /**
   * 恢复单个知识库的中断文件
   */
  private async recoverKnowledgeBaseFiles(
    knowledgeBaseId: string,
    files: Array<{
      file: KnowledgeItem;
      knowledgeBaseId: string;
      knowledgeBaseName: string;
    }>
  ): Promise<void> {
    const kbName = files[0]?.knowledgeBaseName || '未知知识库';
    console.log(
      `[KnowledgeBaseRecoveryService] 开始恢复知识库 "${kbName}" 的 ${files.length} 个文件`
    );

    let successCount = 0;
    let failCount = 0;

    for (const { file } of files) {
      try {
        // 检查文件路径是否存在
        if (!file.path) {
          console.warn(
            `[KnowledgeBaseRecoveryService] 文件 "${file.title}" 没有路径，标记为错误`
          );
          await knowledgeBaseService.updateFileProcessingStatus(file.id, 'error', 0);
          failCount++;
          continue;
        }

        // 检查文件是否可读（对于虚拟路径，检查是否有内容）
        const isVirtualPath = file.path.startsWith('knowledge-base://');
        
        if (isVirtualPath) {
          // 虚拟路径文件，检查是否有存储的内容
          if (!file.metadata?.content) {
            console.warn(
              `[KnowledgeBaseRecoveryService] 虚拟文件 "${file.title}" 没有内容，标记为错误`
            );
            await knowledgeBaseService.updateFileProcessingStatus(file.id, 'error', 0);
            failCount++;
            continue;
          }
        } else {
          // 实际文件路径，检查文件是否存在
          try {
            const fileResult = await window.electron?.file?.read(file.path);
            if (!fileResult?.success) {
              console.warn(
                `[KnowledgeBaseRecoveryService] 文件 "${file.title}" 不存在或无法读取，标记为错误`
              );
              await knowledgeBaseService.updateFileProcessingStatus(file.id, 'error', 0);
              failCount++;
              continue;
            }
          } catch {
            console.warn(
              `[KnowledgeBaseRecoveryService] 文件 "${file.title}" 读取失败，标记为错误`
            );
            await knowledgeBaseService.updateFileProcessingStatus(file.id, 'error', 0);
            failCount++;
            continue;
          }
        }

        // 重新开始处理
        console.log(`[KnowledgeBaseRecoveryService] 恢复文件: ${file.title}`);
        
        // 更新状态为 processing
        await knowledgeBaseService.updateFileProcessingStatus(
          file.path || file.id,
          'processing',
          10
        );

        // 触发 UI 更新
        window.dispatchEvent(
          new CustomEvent('knowledge-base-updated', {
            detail: { knowledgeId: knowledgeBaseId },
          })
        );

        // 进度回调
        const handleProgress = async (progressFilePath: string, progress: number) => {
          const fileIdentifier = file.path || file.id;
          if (progressFilePath !== fileIdentifier) return;
          
          const status = progress >= 100 ? 'completed' : 'processing';
          await knowledgeBaseService.updateFileProcessingStatus(
            fileIdentifier,
            status,
            progress
          );
          window.dispatchEvent(
            new CustomEvent('knowledge-base-updated', {
              detail: { knowledgeId: knowledgeBaseId },
            })
          );
        };

        // 重新处理文件
        if (isVirtualPath && file.metadata?.content) {
          // 虚拟文件：需要创建临时文件
          await this.processVirtualFile(file, knowledgeBaseId, handleProgress);
        } else {
          // 实际文件：直接处理
          await ragProcessingService.uploadFilesToKnowledgeBase(
            [file.path!],
            knowledgeBaseId,
            { onProgress: handleProgress }
          );
        }

        // 确保状态为 completed
        await knowledgeBaseService.updateFileProcessingStatus(
          file.path || file.id,
          'completed',
          100
        );
        
        window.dispatchEvent(
          new CustomEvent('knowledge-base-updated', {
            detail: { knowledgeId: knowledgeBaseId },
          })
        );

        successCount++;
      } catch (error) {
        console.error(
          `[KnowledgeBaseRecoveryService] 恢复文件 "${file.title}" 失败:`,
          error
        );
        
        // 标记为错误状态
        await knowledgeBaseService.updateFileProcessingStatus(
          file.path || file.id,
          'error',
          0
        );
        
        window.dispatchEvent(
          new CustomEvent('knowledge-base-updated', {
            detail: { knowledgeId: knowledgeBaseId },
          })
        );
        
        failCount++;
      }
    }

    // 显示恢复结果
    if (successCount > 0 && failCount === 0) {
      toastService.success(`知识库 "${kbName}" 恢复完成，${successCount} 个文件`);
    } else if (successCount > 0 && failCount > 0) {
      toastService.warning(
        `知识库 "${kbName}" 恢复完成，成功 ${successCount} 个，失败 ${failCount} 个`
      );
    } else if (failCount > 0) {
      toastService.error(`知识库 "${kbName}" 恢复失败，${failCount} 个文件`);
    }
  }

  /**
   * 处理虚拟文件（从内容创建临时文件并处理）
   */
  private async processVirtualFile(
    file: KnowledgeItem,
    knowledgeBaseId: string,
    onProgress: (filePath: string, progress: number) => Promise<void>
  ): Promise<void> {
    const content = file.metadata?.content as string;
    if (!content) {
      throw new Error('虚拟文件没有内容');
    }

    // 获取系统临时目录
    const tempDirResult = await window.electron?.ipcRenderer?.invoke(
      'app:get-path',
      'temp'
    );
    const tempDir = tempDirResult?.data || '';

    // 创建临时文件
    const ext = file.title.split('.').pop() || 'txt';
    const tempFilePath = `${tempDir}\\knowledge-base-recovery-${file.id}.${ext}`;

    try {
      // 写入临时文件
      await window.electronAPI?.fs?.writeFile?.(tempFilePath, content, 'utf-8');

      // 处理临时文件
      await ragProcessingService.uploadFilesToKnowledgeBase(
        [tempFilePath],
        knowledgeBaseId,
        {
          onProgress: async (progressFilePath: string, progress: number) => {
            // 使用原始文件标识符
            await onProgress(file.path || file.id, progress);
          },
        }
      );
    } finally {
      // 清理临时文件
      try {
        await window.electron?.ipcRenderer?.invoke('delete-file', tempFilePath);
      } catch {
        console.warn(
          `[KnowledgeBaseRecoveryService] 清理临时文件失败: ${tempFilePath}`
        );
      }
    }
  }
}

export const knowledgeBaseRecoveryService = KnowledgeBaseRecoveryService.getInstance();
