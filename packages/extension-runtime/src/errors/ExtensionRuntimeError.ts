/**
 * 插件运行时基础错误类型。
 */

export class ExtensionRuntimeError extends Error {
  public readonly code: string;

  public constructor(code: string, message: string) {
    super(message);
    this.name = 'ExtensionRuntimeError';
    this.code = code;
  }
}
