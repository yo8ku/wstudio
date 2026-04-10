/**
 * Demo plugin entry used to verify request(), requestUrl(), and protocol
 * handler registration with visible report files.
 */

import {
  Notice,
  Plugin,
  normalizePath,
  request,
  requestUrl,
  type AppProtocolData,
  type PluginFailureContext,
  type TFile,
} from '@note-studio/plugin';
import { Buffer } from 'node:buffer';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

const DEMO_TITLE = '网络与协议演示';
const DEMO_FOLDER_PATH = normalizePath('plugin-api-demo/network-protocol');
const REQUEST_REPORT_PATH = normalizePath(`${DEMO_FOLDER_PATH}/network-request-report.md`);
const PROTOCOL_REPORT_PATH = normalizePath(`${DEMO_FOLDER_PATH}/protocol-dispatch-report.md`);
const DEMO_PROTOCOL_ACTION = 'network-protocol-demo';

interface ProtocolBridge {
  dispatchProtocol(data: AppProtocolData): Promise<boolean>;
}

interface ProtocolBridgeOwner {
  readonly __wstudioPluginHostProtocolBridge?: ProtocolBridge;
}

interface NetworkRunSummary {
  readonly serverUrl: string;
  readonly textResponse: string;
  readonly jsonStatus: number;
  readonly jsonHeader: string;
  readonly jsonOk: string;
  readonly jsonEcho: string;
  readonly jsonMethod: string;
}

function stringifyValue(value: string | null | undefined): string {
  if (value === null || value === undefined || value.length === 0) {
    return '无';
  }

  return value;
}

function stringifyJson(value: object | string | number | boolean | null): string {
  if (value === null) {
    return 'null';
  }

  if (typeof value === 'string') {
    return value;
  }

  return JSON.stringify(value);
}

function collectRequestBody(requestMessage: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    requestMessage.on('data', (chunk: Buffer | string) => {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    });
    requestMessage.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    requestMessage.on('error', (error: Error) => {
      reject(error);
    });
  });
}

function createTextResponse(source: string): string {
  return `network-demo-text|source=${source}`;
}

export default class NetworkProtocolDemoPlugin extends Plugin {
  private server: Server | null = null;
  private serverUrl: string | null = null;
  private networkRequestCount = 0;
  private protocolInvocationCount = 0;
  private lastTextResponse = '无';
  private lastJsonSummary = '无';
  private lastProtocolSummary = '无';

  public override onload(): void {
    this.recordTrace('plugin.onload');
    this.registerAppProtocolHandler(DEMO_PROTOCOL_ACTION, async (params) => {
      await this.handleProtocolDispatch(params);
    });

    this.addRibbonIcon('globe', DEMO_TITLE, () => {
      void this.generateAndOpenNetworkRequestReport('活动栏入口');
    }, { location: 'activityBar' });

    this.addCommand({
      id: 'generate-open-network-request-report',
      name: '网络与协议演示：执行网络请求并打开报告',
      callback: () => {
        void this.generateAndOpenNetworkRequestReport('命令中心');
      },
    });

    this.addCommand({
      id: 'dispatch-network-protocol-report',
      name: '网络与协议演示：触发协议处理并打开报告',
      callback: () => {
        void this.dispatchProtocolAndOpenReport();
      },
    });

    this.addCommand({
      id: 'cleanup-network-protocol-demo',
      name: '网络与协议演示：清理测试目录',
      callback: () => {
        void this.cleanupDemoFolder();
      },
    });
  }

  public override onEnable(): void {
    this.recordTrace('plugin.onEnable');
  }

  public override onDisable(): void {
    this.recordTrace('plugin.onDisable');
  }

  public override onunload(): void {
    this.recordTrace('plugin.onunload');
    this.disposeServer();
  }

  public override onFailed(failure: PluginFailureContext): void {
    this.recordTrace(`plugin.onFailed operation=${failure.operation}`);
    this.showNotice(`在 ${failure.operation} 阶段出现异常。`, 2600);
  }

  private async generateAndOpenNetworkRequestReport(source: string): Promise<void> {
    const summary = await this.runNetworkScenario(source);
    const reportContent = [
      '# Network Request Report',
      '',
      `source=${source}`,
      `serverUrl=${summary.serverUrl}`,
      `requestCount=${this.networkRequestCount}`,
      `textResponse=${summary.textResponse}`,
      `jsonStatus=${summary.jsonStatus}`,
      `jsonHeader=${summary.jsonHeader}`,
      `jsonOk=${summary.jsonOk}`,
      `jsonMethod=${summary.jsonMethod}`,
      `jsonEcho=${summary.jsonEcho}`,
      `lastProtocolSummary=${this.lastProtocolSummary}`,
    ].join('\n');

    const requestReport = await this.upsertMarkdownFile(REQUEST_REPORT_PATH, reportContent);
    await this.openFileInWorkspace(requestReport);
    this.showNotice(`已生成并打开 ${requestReport.path}。`, 3200);
  }

  private async dispatchProtocolAndOpenReport(): Promise<void> {
    const bridge = this.getProtocolBridge();

    if (bridge === null) {
      this.showNotice('当前宿主未提供协议分发桥。', 2800);
      return;
    }

    const handled = await bridge.dispatchProtocol({
      action: DEMO_PROTOCOL_ACTION,
      source: '命令中心',
      ticket: `dispatch-${Date.now()}`,
      requestCount: String(this.networkRequestCount),
    });

    if (!handled) {
      this.showNotice('当前没有可处理的协议动作。', 2800);
      return;
    }

    this.showNotice('已触发协议处理并打开报告。', 2800);
  }

  private async handleProtocolDispatch(params: AppProtocolData): Promise<void> {
    this.protocolInvocationCount += 1;
    const reportContent = [
      '# Protocol Dispatch Report',
      '',
      `action=${params.action}`,
      `handled=true`,
      `invocationCount=${this.protocolInvocationCount}`,
      `serverUrl=${stringifyValue(this.serverUrl)}`,
      `source=${stringifyValue(params.source)}`,
      `ticket=${stringifyValue(params.ticket)}`,
      `requestCount=${stringifyValue(params.requestCount)}`,
      `lastTextResponse=${this.lastTextResponse}`,
      `lastJsonSummary=${this.lastJsonSummary}`,
    ].join('\n');

    const protocolReport = await this.upsertMarkdownFile(PROTOCOL_REPORT_PATH, reportContent);
    await this.openFileInWorkspace(protocolReport);
    this.lastProtocolSummary = `action=${params.action}|source=${stringifyValue(params.source)}|count=${this.protocolInvocationCount}`;
    this.recordTrace(`protocol.dispatch action=${params.action} count=${this.protocolInvocationCount}`);
  }

  private async runNetworkScenario(source: string): Promise<NetworkRunSummary> {
    const serverUrl = await this.ensureServerUrl();
    const textResponse = await request(`${serverUrl}/text?source=${encodeURIComponent(source)}`);
    const jsonResponse = await requestUrl({
      url: `${serverUrl}/json`,
      method: 'POST',
      contentType: 'application/json',
      headers: {
        'x-network-demo': 'client',
      },
      body: JSON.stringify({
        source,
        mode: 'requestUrl',
      }),
    });

    const jsonRecord = (jsonResponse.json ?? null) as Record<string, string | boolean | null> | null;
    this.networkRequestCount += 1;
    this.lastTextResponse = textResponse;
    this.lastJsonSummary = `status=${jsonResponse.status}|ok=${stringifyJson(jsonRecord?.ok ?? null)}|echo=${stringifyJson(jsonRecord?.echo ?? null)}`;
    this.recordTrace(`network.request source=${source} status=${jsonResponse.status}`);

    return {
      serverUrl,
      textResponse,
      jsonStatus: jsonResponse.status,
      jsonHeader: jsonResponse.headers['x-network-demo'] ?? '无',
      jsonOk: stringifyJson(jsonRecord?.ok ?? null),
      jsonEcho: stringifyJson(jsonRecord?.echo ?? null),
      jsonMethod: typeof jsonRecord?.method === 'string' ? jsonRecord.method : '无',
    };
  }

  private getProtocolBridge(): ProtocolBridge | null {
    const owner = globalThis as typeof globalThis & ProtocolBridgeOwner;
    return owner.__wstudioPluginHostProtocolBridge ?? null;
  }

  private async ensureServerUrl(): Promise<string> {
    if (this.serverUrl !== null) {
      return this.serverUrl;
    }

    const server = createServer(async (requestMessage, response) => {
      await this.handleServerRequest(requestMessage, response);
    });

    await new Promise<void>((resolve, reject) => {
      server.once('error', (error: Error) => {
        reject(error);
      });

      server.listen(0, '127.0.0.1', () => {
        resolve();
      });
    });

    const address = server.address();

    if (address === null || typeof address === 'string') {
      server.close();
      throw new Error('Failed to resolve local demo server port.');
    }

    this.server = server;
    this.serverUrl = `http://127.0.0.1:${(address as AddressInfo).port}`;
    this.recordTrace(`server.started url=${this.serverUrl}`);
    return this.serverUrl;
  }

  private async handleServerRequest(
    requestMessage: IncomingMessage,
    response: ServerResponse<IncomingMessage>,
  ): Promise<void> {
    const requestUrlValue = requestMessage.url ?? '/';
    const parsedUrl = new URL(requestUrlValue, 'http://127.0.0.1');

    if (parsedUrl.pathname === '/text') {
      const source = parsedUrl.searchParams.get('source') ?? 'unknown';
      const payload = createTextResponse(source);
      response.writeHead(200, {
        'content-type': 'text/plain; charset=utf-8',
      });
      response.end(payload);
      return;
    }

    if (parsedUrl.pathname === '/json') {
      const requestBody = await collectRequestBody(requestMessage);
      response.writeHead(201, {
        'content-type': 'application/json; charset=utf-8',
        'x-network-demo': 'enabled',
      });
      response.end(JSON.stringify({
        ok: true,
        method: requestMessage.method ?? 'GET',
        echo: requestBody,
      }));
      return;
    }

    response.writeHead(404, {
      'content-type': 'text/plain; charset=utf-8',
    });
    response.end('not-found');
  }

  private async cleanupDemoFolder(): Promise<void> {
    await this.shutdownServer();
    await this.removeDemoFolderIfExists();
    this.lastTextResponse = '无';
    this.lastJsonSummary = '无';
    this.lastProtocolSummary = '无';
    this.networkRequestCount = 0;
    this.protocolInvocationCount = 0;
    this.showNotice('已清理 network-protocol 测试目录并关闭本地服务。', 3000);
  }

  private async upsertMarkdownFile(path: string, content: string): Promise<TFile> {
    await this.ensureDemoFolder();
    const existingFile = this.app.vault.getFileByPath(path);

    if (existingFile === null) {
      return this.app.vault.create(path, content);
    }

    await this.app.vault.modify(existingFile, content);
    return this.requireFile(path);
  }

  private async ensureDemoFolder(): Promise<void> {
    const existingFolder = this.app.vault.getAbstractFileByPath(DEMO_FOLDER_PATH);

    if (existingFolder !== null) {
      return;
    }

    await this.app.vault.createFolder(DEMO_FOLDER_PATH);
  }

  private requireFile(path: string): TFile {
    const file = this.app.vault.getFileByPath(path);

    if (file === null) {
      throw new Error(`Expected demo file "${path}" to exist.`);
    }

    return file;
  }

  private async openFileInWorkspace(file: TFile): Promise<void> {
    const leaf = this.app.workspace.getLeaf('tab');
    await leaf.openFile(file, { active: true });
    await this.app.workspace.revealLeaf(leaf);
  }

  private async removeDemoFolderIfExists(): Promise<void> {
    const abstractFile = this.app.vault.getAbstractFileByPath(DEMO_FOLDER_PATH);

    if (abstractFile === null) {
      return;
    }

    await this.app.vault.delete(abstractFile, true);
  }

  private async shutdownServer(): Promise<void> {
    const server = this.server;

    if (server === null) {
      this.serverUrl = null;
      return;
    }

    this.server = null;
    this.serverUrl = null;
    await new Promise<void>((resolve, reject) => {
      server.close((error?: Error) => {
        if (error !== undefined) {
          reject(error);
          return;
        }

        resolve();
      });
    });
    this.recordTrace('server.stopped');
  }

  private disposeServer(): void {
    const server = this.server;

    if (server === null) {
      this.serverUrl = null;
      return;
    }

    this.server = null;
    this.serverUrl = null;
    server.close();
  }

  private showNotice(message: string, timeout = 2400): void {
    void timeout;
    new Notice(`${DEMO_TITLE}：${message}`);
  }

  private recordTrace(message: string): void {
    console.log(`[demo-network-protocol] ${message}`);
  }
}
