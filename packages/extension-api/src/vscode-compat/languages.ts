/**
 * VSCode Languages API
 */

import { Disposable, Event, TextDocument, Position, Range, CompletionItem, CompletionList, Hover, SignatureHelp, Definition, Location, DocumentHighlight, SymbolInformation, CodeAction, CodeLens, DocumentLink, ColorInformation, ColorPresentation, FoldingRange, SelectionRange, CallHierarchyItem, TypeHierarchyItem, InlineValue, InlineValueContext, InlineValueVariableLookup, InlineValueEvaluatableExpression, InlineValueText, Diagnostic, WorkspaceEdit, CancellationToken, ProviderResult, TextEdit, MarkdownString, DocumentSymbol, SemanticTokens, SemanticTokensLegend, CancellationError } from './types';

export namespace languages {
  /**
   * 注册完成项提供程序
   */
  export function registerCompletionItemProvider(selector: any, provider: any, ...triggerCharacters: string[]): Disposable {
    console.log(`[Languages] 注册完成项提供程序: ${selector}`);
    return {
      dispose: () => {
        console.log(`[Languages] 注销完成项提供程序`);
      }
    };
  }

  /**
   * 注册悬停提供程序
   */
  export function registerHoverProvider(selector: any, provider: any): Disposable {
    console.log(`[Languages] 注册悬停提供程序: ${selector}`);
    return {
      dispose: () => {
        console.log(`[Languages] 注销悬停提供程序`);
      }
    };
  }

  /**
   * 注册签名帮助提供程序
   */
  export function registerSignatureHelpProvider(selector: any, provider: any, ...triggerCharacters: string[]): Disposable {
    console.log(`[Languages] 注册签名帮助提供程序: ${selector}`);
    return {
      dispose: () => {
        console.log(`[Languages] 注销签名帮助提供程序`);
      }
    };
  }

  /**
   * 注册定义提供程序
   */
  export function registerDefinitionProvider(selector: any, provider: any): Disposable {
    console.log(`[Languages] 注册定义提供程序: ${selector}`);
    return {
      dispose: () => {
        console.log(`[Languages] 注销定义提供程序`);
      }
    };
  }

  /**
   * 注册引用提供程序
   */
  export function registerReferenceProvider(selector: any, provider: any): Disposable {
    console.log(`[Languages] 注册引用提供程序: ${selector}`);
    return {
      dispose: () => {
        console.log(`[Languages] 注销引用提供程序`);
      }
    };
  }

  /**
   * 注册文档高亮提供程序
   */
  export function registerDocumentHighlightProvider(selector: any, provider: any): Disposable {
    console.log(`[Languages] 注册文档高亮提供程序: ${selector}`);
    return {
      dispose: () => {
        console.log(`[Languages] 注销文档高亮提供程序`);
      }
    };
  }

  /**
   * 注册文档符号提供程序
   */
  export function registerDocumentSymbolProvider(selector: any, provider: any): Disposable {
    console.log(`[Languages] 注册文档符号提供程序: ${selector}`);
    return {
      dispose: () => {
        console.log(`[Languages] 注销文档符号提供程序`);
      }
    };
  }

  /**
   * 注册工作区符号提供程序
   */
  export function registerWorkspaceSymbolProvider(provider: any): Disposable {
    console.log(`[Languages] 注册工作区符号提供程序`);
    return {
      dispose: () => {
        console.log(`[Languages] 注销工作区符号提供程序`);
      }
    };
  }

  /**
   * 注册代码操作提供程序
   */
  export function registerCodeActionsProvider(selector: any, provider: any, metadata?: any): Disposable {
    console.log(`[Languages] 注册代码操作提供程序: ${selector}`);
    return {
      dispose: () => {
        console.log(`[Languages] 注销代码操作提供程序`);
      }
    };
  }

  /**
   * 注册代码镜头提供程序
   */
  export function registerCodeLensProvider(selector: any, provider: any): Disposable {
    console.log(`[Languages] 注册代码镜头提供程序: ${selector}`);
    return {
      dispose: () => {
        console.log(`[Languages] 注销代码镜头提供程序`);
      }
    };
  }

  /**
   * 注册文档链接提供程序
   */
  export function registerDocumentLinkProvider(selector: any, provider: any): Disposable {
    console.log(`[Languages] 注册文档链接提供程序: ${selector}`);
    return {
      dispose: () => {
        console.log(`[Languages] 注销文档链接提供程序`);
      }
    };
  }

  /**
   * 注册颜色提供程序
   */
  export function registerColorProvider(selector: any, provider: any): Disposable {
    console.log(`[Languages] 注册颜色提供程序: ${selector}`);
    return {
      dispose: () => {
        console.log(`[Languages] 注销颜色提供程序`);
      }
    };
  }

  /**
   * 注册折叠范围提供程序
   */
  export function registerFoldingRangeProvider(selector: any, provider: any): Disposable {
    console.log(`[Languages] 注册折叠范围提供程序: ${selector}`);
    return {
      dispose: () => {
        console.log(`[Languages] 注销折叠范围提供程序`);
      }
    };
  }

  /**
   * 注册选择范围提供程序
   */
  export function registerSelectionRangeProvider(selector: any, provider: any): Disposable {
    console.log(`[Languages] 注册选择范围提供程序: ${selector}`);
    return {
      dispose: () => {
        console.log(`[Languages] 注销选择范围提供程序`);
      }
    };
  }

  /**
   * 注册调用层次结构提供程序
   */
  export function registerCallHierarchyProvider(selector: any, provider: any): Disposable {
    console.log(`[Languages] 注册调用层次结构提供程序: ${selector}`);
    return {
      dispose: () => {
        console.log(`[Languages] 注销调用层次结构提供程序`);
      }
    };
  }

  /**
   * 注册类型层次结构提供程序
   */
  export function registerTypeHierarchyProvider(selector: any, provider: any): Disposable {
    console.log(`[Languages] 注册类型层次结构提供程序: ${selector}`);
    return {
      dispose: () => {
        console.log(`[Languages] 注销类型层次结构提供程序`);
      }
    };
  }

  /**
   * 注册内联值提供程序
   */
  export function registerInlineValueProvider(selector: any, provider: any): Disposable {
    console.log(`[Languages] 注册内联值提供程序: ${selector}`);
    return {
      dispose: () => {
        console.log(`[Languages] 注销内联值提供程序`);
      }
    };
  }

  /**
   * 注册语义标记提供程序
   */
  export function registerDocumentSemanticTokensProvider(selector: any, provider: any, legend: any): Disposable {
    console.log(`[Languages] 注册语义标记提供程序: ${selector}`);
    return {
      dispose: () => {
        console.log(`[Languages] 注销语义标记提供程序`);
      }
    };
  }

  /**
   * 注册诊断集合
   */
  export function createDiagnosticCollection(name?: string): any {
    console.log(`[Languages] 创建诊断集合: ${name || 'default'}`);
    return {
      name: name || 'default',
      set: (uri: any, diagnostics: any) => {
        console.log(`[Languages] 设置诊断: ${uri.toString()}`);
      },
      delete: (uri: any) => {
        console.log(`[Languages] 删除诊断: ${uri.toString()}`);
      },
      clear: () => {
        console.log(`[Languages] 清除所有诊断`);
      },
      dispose: () => {
        console.log(`[Languages] 销毁诊断集合`);
      }
    };
  }

  /**
   * 获取诊断
   */
  export function getDiagnostics(resource?: any): any[] {
    console.log(`[Languages] 获取诊断`);
    return [];
  }

  /**
   * 匹配文档选择器
   */
  export function match(selector: any, document: TextDocument): number {
    console.log(`[Languages] 匹配文档选择器`);
    return 0;
  }

  /**
   * 创建语言配置
   */
  export function setLanguageConfiguration(language: string, configuration: any): Disposable {
    console.log(`[Languages] 设置语言配置: ${language}`);
    return {
      dispose: () => {
        console.log(`[Languages] 清除语言配置: ${language}`);
      }
    };
  }
}