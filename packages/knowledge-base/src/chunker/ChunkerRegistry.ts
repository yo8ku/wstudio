/**
 * 分块器注册表
 */

import { BaseChunker } from './BaseChunker';
import { ChunkResult, ChunkerOptions } from './types';

export class ChunkerRegistry {
  private static instance: ChunkerRegistry;
  private chunkers: Map<string, BaseChunker> = new Map();
  private defaultChunker?: string;

  private constructor() {}

  /**
   * 获取单例实例
   */
  static getInstance(): ChunkerRegistry {
    if (!ChunkerRegistry.instance) {
      ChunkerRegistry.instance = new ChunkerRegistry();
    }
    return ChunkerRegistry.instance;
  }

  /**
   * 注册分块器
   */
  register(chunker: BaseChunker, setAsDefault = false): void {
    const name = chunker.getName();
    this.chunkers.set(name, chunker);

    if (setAsDefault || !this.defaultChunker) {
      this.defaultChunker = name;
    }
  }

  /**
   * 注销分块器
   */
  unregister(name: string): void {
    this.chunkers.delete(name);
    if (this.defaultChunker === name) {
      this.defaultChunker = this.chunkers.keys().next().value;
    }
  }

  /**
   * 获取分块器
   */
  getChunker(name: string): BaseChunker | undefined {
    return this.chunkers.get(name);
  }

  /**
   * 获取默认分块器
   */
  getDefaultChunker(): BaseChunker | undefined {
    if (!this.defaultChunker) {
      return undefined;
    }
    return this.chunkers.get(this.defaultChunker);
  }

  /**
   * 设置默认分块器
   */
  setDefaultChunker(name: string): void {
    if (!this.chunkers.has(name)) {
      throw new Error(`Chunker ${name} not found`);
    }
    this.defaultChunker = name;
  }

  /**
   * 执行分块（使用指定或默认分块器）
   */
  async chunk(
    text: string,
    chunkerName?: string,
    options?: ChunkerOptions
  ): Promise<ChunkResult> {
    const chunker = chunkerName
      ? this.getChunker(chunkerName)
      : this.getDefaultChunker();

    if (!chunker) {
      throw new Error('No chunker available');
    }

    return chunker.chunk(text, options);
  }

  /**
   * 列出所有已注册的分块器
   */
  listChunkers(): BaseChunker[] {
    return Array.from(this.chunkers.values());
  }

  /**
   * 清空注册表
   */
  clear(): void {
    this.chunkers.clear();
    this.defaultChunker = undefined;
  }
}




















