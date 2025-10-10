/**
 * 批量导入器
 */

import PQueue from 'p-queue';

export class BatchImporter {
  private queue: PQueue;

  constructor(concurrency = 5) {
    this.queue = new PQueue({ concurrency });
  }

  /**
   * 添加导入任务
   */
  async addTask<T>(task: () => Promise<T>): Promise<T> {
    const result = await this.queue.add(task);
    return result as T;
  }

  /**
   * 批量添加任务
   */
  async addTasks<T>(tasks: Array<() => Promise<T>>): Promise<T[]> {
    const results = await Promise.all(tasks.map((task) => this.queue.add(task)));
    return results as T[];
  }

  /**
   * 等待所有任务完成
   */
  async onIdle(): Promise<void> {
    return this.queue.onIdle();
  }

  /**
   * 获取队列大小
   */
  getSize(): number {
    return this.queue.size;
  }

  /**
   * 获取待处理任务数
   */
  getPending(): number {
    return this.queue.pending;
  }
}




















