/**
 * Best-effort async task collection used by quit and teardown workflows.
 */

export class Tasks {
  private readonly callbacks: Array<() => Promise<void>> = [];
  private readonly pending: Promise<void>[] = [];

  public add(callback: () => Promise<void>): void {
    this.callbacks.push(callback);
  }

  public addPromise(promise: Promise<void>): void {
    this.pending.push(promise);
  }

  public isEmpty(): boolean {
    return this.callbacks.length === 0 && this.pending.length === 0;
  }

  public async promise(): Promise<void> {
    const queued = [...this.pending, ...this.callbacks.map((callback) => callback())];
    await Promise.all(queued);
  }
}
