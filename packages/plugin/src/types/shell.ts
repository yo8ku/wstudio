/**
 * Host shell contracts exposed to plugins for safe external target opening.
 */

export interface ShellService {
  openExternal(target: string): Promise<void>;
}
