/**
 * 导入队列
 */

export interface ImportTask {
  id: string;
  filePath: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: Error;
  createdAt: Date;
  completedAt?: Date;
}

export class ImportQueue {
  private tasks: Map<string, ImportTask> = new Map();

  /**
   * 添加任务
   */
  addTask(id: string, filePath: string): void {
    this.tasks.set(id, {
      id,
      filePath,
      status: 'pending',
      createdAt: new Date(),
    });
  }

  /**
   * 更新任务状态
   */
  updateTaskStatus(
    id: string,
    status: ImportTask['status'],
    error?: Error
  ): void {
    const task = this.tasks.get(id);
    if (task) {
      task.status = status;
      task.error = error;
      if (status === 'completed' || status === 'failed') {
        task.completedAt = new Date();
      }
    }
  }

  /**
   * 获取任务
   */
  getTask(id: string): ImportTask | undefined {
    return this.tasks.get(id);
  }

  /**
   * 获取所有任务
   */
  getAllTasks(): ImportTask[] {
    return Array.from(this.tasks.values());
  }

  /**
   * 获取待处理任务
   */
  getPendingTasks(): ImportTask[] {
    return this.getAllTasks().filter((task) => task.status === 'pending');
  }

  /**
   * 清空队列
   */
  clear(): void {
    this.tasks.clear();
  }
}




































































