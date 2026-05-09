/**
 * Verifies supervisor crash notifications are forwarded to the host UI once per failure.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface MockPluginRuntimeStateSnapshot {
  readonly pluginId: string;
  readonly status: 'idle' | 'enabled' | 'failed';
  readonly failureMessage: string | null;
  readonly owner: 'main' | 'supervisor';
}

interface MockSupervisorChildMessage {
  readonly type: string;
  readonly data: {
    readonly requestId?: string;
    readonly startedAt?: number;
    readonly pluginCount?: number;
    readonly plugins?: readonly MockPluginRuntimeStateSnapshot[];
  };
}

const electronMocks = vi.hoisted(() => {
  type AppChildProcessGoneHandler = (
    event: object,
    details: {
      readonly type: 'Utility' | 'GPU' | 'Unknown';
      readonly reason:
        | 'clean-exit'
        | 'abnormal-exit'
        | 'killed'
        | 'crashed'
        | 'oom'
        | 'launch-failed'
        | 'integrity-failure';
      readonly exitCode: number;
      readonly serviceName?: string;
      readonly name?: string;
    },
  ) => void;

  type ChildExitHandler = (code: number | null) => void;
  type ChildMessageHandler = (message: MockSupervisorChildMessage) => void;
  type StreamDataHandler = (data: Buffer) => void;

  class HoistedMockStream {
    private readonly dataHandlers = new Set<StreamDataHandler>();

    public on(_event: 'data', handler: StreamDataHandler): void {
      this.dataHandlers.add(handler);
    }

    public removeAllListeners(_event: 'data'): void {
      this.dataHandlers.clear();
    }

    public emitData(data: Buffer): void {
      for (const handler of [...this.dataHandlers]) {
        handler(data);
      }
    }
  }

  class HoistedMockUtilityProcess {
    private static nextPid = 2000;

    private readonly exitHandlers = new Set<ChildExitHandler>();
    private readonly messageHandlers = new Set<ChildMessageHandler>();

    public readonly pid = HoistedMockUtilityProcess.nextPid++;
    public readonly stdout = new HoistedMockStream();
    public readonly stderr = new HoistedMockStream();
    public killed = false;

    public constructor() {
      queueMicrotask(() => {
        this.emitMessage({
          type: 'started',
          data: {},
        });
      });
    }

    public on(event: 'exit' | 'message', handler: ChildExitHandler | ChildMessageHandler): void {
      if (event === 'exit') {
        this.exitHandlers.add(handler as ChildExitHandler);
        return;
      }

      this.messageHandlers.add(handler as ChildMessageHandler);
    }

    public removeListener(event: 'exit' | 'message', handler: ChildExitHandler | ChildMessageHandler): void {
      if (event === 'exit') {
        this.exitHandlers.delete(handler as ChildExitHandler);
        return;
      }

      this.messageHandlers.delete(handler as ChildMessageHandler);
    }

    public removeAllListeners(event: 'exit' | 'message'): void {
      if (event === 'exit') {
        this.exitHandlers.clear();
        return;
      }

      this.messageHandlers.clear();
    }

    public postMessage(message: {
      readonly type: string;
      readonly data: {
        readonly requestId?: string;
        readonly descriptors?: readonly object[];
      };
    }): void {
      if (message.type === 'initialize') {
        queueMicrotask(() => {
          this.emitMessage({
            type: 'ready',
            data: {
              startedAt: 1234,
            },
          });
        });
        return;
      }

      if (message.type === 'sync-descriptors') {
        queueMicrotask(() => {
          this.emitMessage({
            type: 'sync-complete',
            data: {
              requestId: message.data.requestId,
              pluginCount: message.data.descriptors?.length ?? 0,
            },
          });
        });
        return;
      }

      if (message.type === 'shutdown') {
        queueMicrotask(() => {
          this.emitMessage({
            type: 'shutdown-complete',
            data: {
              requestId: message.data.requestId,
            },
          });
        });
      }
    }

    public kill(): void {
      this.killed = true;
    }

    public emitExit(code: number | null): void {
      for (const handler of [...this.exitHandlers]) {
        handler(code);
      }
    }

    public emitMessage(message: MockSupervisorChildMessage): void {
      for (const handler of [...this.messageHandlers]) {
        handler(message);
      }
    }
  }

  class HoistedMockApp {
    private readonly childProcessGoneHandlers = new Set<AppChildProcessGoneHandler>();

    public getAppPath(): string {
      return 'E:\\Wise Note Studio\\WSstudio1.0-pro\\WStudio';
    }

    public on(event: 'child-process-gone', handler: AppChildProcessGoneHandler): void {
      if (event === 'child-process-gone') {
        this.childProcessGoneHandlers.add(handler);
      }
    }

    public removeListener(event: 'child-process-gone', handler: AppChildProcessGoneHandler): void {
      if (event === 'child-process-gone') {
        this.childProcessGoneHandlers.delete(handler);
      }
    }

    public emitChildProcessGone(details: {
      readonly type: 'Utility' | 'GPU' | 'Unknown';
      readonly reason:
        | 'clean-exit'
        | 'abnormal-exit'
        | 'killed'
        | 'crashed'
        | 'oom'
        | 'launch-failed'
        | 'integrity-failure';
      readonly exitCode: number;
      readonly serviceName?: string;
      readonly name?: string;
    }): void {
      for (const handler of [...this.childProcessGoneHandlers]) {
        handler({}, details);
      }
    }
  }

  const createdChildren: HoistedMockUtilityProcess[] = [];

  return {
    app: new HoistedMockApp(),
    emitPluginRuntimeNotice: vi.fn((_payload: {
      readonly message: string;
      readonly level: 'success' | 'error' | 'warning' | 'info';
      readonly duration?: number;
    }): void => undefined),
    utilityProcess: {
      createdChildren,
      fork: vi.fn((): HoistedMockUtilityProcess => {
        const child = new HoistedMockUtilityProcess();
        createdChildren.push(child);
        return child;
      }),
    },
  };
});

vi.mock('electron', () => ({
  app: electronMocks.app,
  utilityProcess: electronMocks.utilityProcess,
}));

vi.mock('../../ipc/pluginRuntimeHandlers', () => ({
  emitPluginRuntimeNotice: electronMocks.emitPluginRuntimeNotice,
}));

import { PluginSupervisorService } from './PluginSupervisorService';

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('PluginSupervisorService lifecycle notices', () => {
  let service: PluginSupervisorService;

  beforeEach(() => {
    electronMocks.utilityProcess.createdChildren.length = 0;
    electronMocks.utilityProcess.fork.mockClear();
    electronMocks.emitPluginRuntimeNotice.mockClear();
    service = new PluginSupervisorService(() => null, () => null, () => null);
  });

  afterEach(async () => {
    await service.shutdown();
    vi.useRealTimers();
  });

  it('emits a single warning when a supervisor crash is reported before exit', async () => {
    await service.initialize([]);

    const firstChild = electronMocks.utilityProcess.createdChildren[0];
    expect(firstChild).toBeDefined();

    electronMocks.app.emitChildProcessGone({
      type: 'Utility',
      reason: 'crashed',
      exitCode: 11,
      serviceName: 'Plugin Supervisor',
      name: 'Plugin Supervisor',
    });
    firstChild.emitExit(11);
    await flushMicrotasks();

    expect(electronMocks.emitPluginRuntimeNotice).toHaveBeenCalledTimes(1);
    expect(electronMocks.emitPluginRuntimeNotice).toHaveBeenCalledWith({
      message: '某插件后台服务异常退出，已尝试重启',
      level: 'warning',
    });
    expect(electronMocks.utilityProcess.fork).toHaveBeenCalledTimes(2);
  });

  it('falls back to exit notifications when no crash event is emitted', async () => {
    await service.initialize([]);

    const firstChild = electronMocks.utilityProcess.createdChildren[0];
    expect(firstChild).toBeDefined();

    firstChild.emitExit(23);
    await flushMicrotasks();

    expect(electronMocks.emitPluginRuntimeNotice).toHaveBeenCalledTimes(1);
    expect(electronMocks.emitPluginRuntimeNotice).toHaveBeenCalledWith({
      message: '某插件后台服务异常退出，已尝试重启',
      level: 'warning',
    });
    expect(electronMocks.utilityProcess.fork).toHaveBeenCalledTimes(2);
  });

  it('temporarily disables a plugin after more than three fatal failures in sixty seconds', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-07T00:00:00.000Z'));
    await service.initialize([]);

    const firstChild = electronMocks.utilityProcess.createdChildren[0];
    expect(firstChild).toBeDefined();

    for (let index = 0; index < 4; index += 1) {
      firstChild.emitMessage({
        type: 'runtime-states-updated',
        data: {
          plugins: [
            {
              pluginId: 'bad.plugin',
              status: 'failed',
              failureMessage: `fatal-${index}`,
              owner: 'supervisor',
            },
          ],
        },
      });
      await flushMicrotasks();

      if (index < 3) {
        firstChild.emitMessage({
          type: 'runtime-states-updated',
          data: {
            plugins: [
              {
                pluginId: 'bad.plugin',
                status: 'idle',
                failureMessage: null,
                owner: 'supervisor',
              },
            ],
          },
        });
        await flushMicrotasks();
        vi.advanceTimersByTime(10_000);
      }
    }

    expect(service.isPluginTemporarilyDisabled('bad.plugin')).toBe(true);
    expect(service.getTemporarilyDisabledPluginMessage('bad.plugin')).toBe(
      '插件 [bad.plugin] 连续发生致命错误，为保护系统稳定，已将其暂时禁用。请尝试更新或联系插件作者。',
    );
    expect(electronMocks.emitPluginRuntimeNotice).toHaveBeenCalledWith({
      message: '插件 [bad.plugin] 连续发生致命错误，为保护系统稳定，已将其暂时禁用。请尝试更新或联系插件作者。',
      level: 'error',
    });
    await expect(service.startPlugin('bad.plugin')).rejects.toThrow(
      '插件 [bad.plugin] 连续发生致命错误，为保护系统稳定，已将其暂时禁用。请尝试更新或联系插件作者。',
    );
  });

  it('suppresses supervisor stderr floods to keep the host responsive', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-07T00:00:00.000Z'));
    await service.initialize([]);

    const firstChild = electronMocks.utilityProcess.createdChildren[0];
    expect(firstChild).toBeDefined();

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    try {
      for (let index = 0; index < 18; index += 1) {
        firstChild.stderr.emitData(Buffer.from(`stderr-${index}`));
      }

      expect(errorSpy.mock.calls.filter((call) => call[0] === '[PluginSupervisor Error]')).toHaveLength(12);
      expect(warnSpy).toHaveBeenCalledWith(
        '[PluginSupervisorService] suppressing further plugin supervisor stderr output for 5000ms.',
      );

      vi.advanceTimersByTime(5_001);
      firstChild.stderr.emitData(Buffer.from('stderr-after-window'));

      expect(warnSpy).toHaveBeenCalledWith(
        '[PluginSupervisorService] suppressed 6 plugin supervisor stderr messages in the last 5000ms.',
      );
      expect(errorSpy.mock.calls.filter((call) => call[0] === '[PluginSupervisor Error]')).toHaveLength(13);
    } finally {
      errorSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });
});
