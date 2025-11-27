/**
 * 全局状态管理
 */

export class GlobalState {
  private state: Map<string, any> = new Map();

  get<T>(key: string, defaultValue?: T): T | undefined {
    return this.state.get(key) ?? defaultValue;
  }

  update(key: string, value: any): Promise<void> {
    this.state.set(key, value);
    return Promise.resolve();
  }

  keys(): readonly string[] {
    return Array.from(this.state.keys());
  }
}



