/**
 * 大纲解析服务
 * 功能：从编辑器内容中提取可折叠的结构信息（标题、类、函数等）
 * 描述：支持Markdown、TypeScript、JavaScript、Python等多种文件类型
 */

import { OutlineNode, OutlineSymbolKind } from '../components/Explorer/Outline/types';

export class OutlineService {
  /**
   * 根据文件类型和内容解析大纲
   */
  static parseOutline(content: string, language: string): OutlineNode[] {
    if (!content || !content.trim()) {
      return [];
    }

    const normalizedLanguage = language.trim().toLowerCase();

    switch (normalizedLanguage) {
      case 'markdown':
      case 'md':
        return this.parseMarkdown(content);

      case 'plaintext':
      case 'text': {
        const markdownNodes = this.parseMarkdown(content);
        if (markdownNodes.length > 0) {
          return markdownNodes;
        }

        return this.parseGeneric(content, normalizedLanguage);
      }
      
      case 'typescript':
      case 'typescriptreact':
      case 'tsx':
        return this.parseTypeScript(content);
      
      case 'javascript':
      case 'javascriptreact':
      case 'jsx':
        return this.parseJavaScript(content);
      
      case 'python':
      case 'py':
        return this.parsePython(content);
      
      case 'json':
      case 'jsonc':
        return this.parseJSON(content);
      
      case 'css':
      case 'scss':
      case 'less':
        return this.parseCSS(content);
      
      case 'html':
        return this.parseHTML(content);
      
      default: {
        // 对于不支持的语言，尝试通用解析
        const genericNodes = this.parseGeneric(content, normalizedLanguage);
        if (genericNodes.length > 0) {
          return genericNodes;
        }

        return this.parseMarkdown(content);
      }
    }
  }

  /**
   * 解析 Markdown 文件的标题
   */
  private static parseMarkdown(content: string): OutlineNode[] {
    const lines = content.split('\n');
    const nodes: OutlineNode[] = [];
    const stack: { node: OutlineNode; level: number }[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // 允许标题前面有空白字符（trim 后再匹配）
      const trimmedLine = line.trim();
      const match = trimmedLine.match(/^(#{1,6})\s+(.+)$/);
      
      if (match) {
        const level = match[1].length;
        const title = match[2].trim();
        
        const node: OutlineNode = {
          id: `md-${i}-${level}`,
          name: title,
          kind: OutlineSymbolKind.String, // Markdown 标题为 String 类型
          range: {
            start: { line: i + 1, character: 0 },
            end: { line: i + 1, character: line.length }
          },
          children: [],
          expanded: false
        };

        // 移除栈中比当前级别高的节点
        while (stack.length > 0 && stack[stack.length - 1].level >= level) {
          stack.pop();
        }

        // 如果栈不为空，添加到父节点
        if (stack.length > 0) {
          const parent = stack[stack.length - 1].node;
          parent.children!.push(node);
        } else {
          // 否则添加到根节点
          nodes.push(node);
        }

        // 将当前节点入栈
        stack.push({ node, level });
      }
    }

    return nodes;
  }

  /**
   * 解析 TypeScript 文件的类、接口、函数等
   */
  private static parseTypeScript(content: string): OutlineNode[] {
    const nodes: OutlineNode[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // 匹配 class
      const classMatch = line.match(/^export\s+(?:abstract\s+)?class\s+(\w+)/);
      if (classMatch) {
        nodes.push({
          id: `ts-class-${i}`,
          name: classMatch[1],
          kind: OutlineSymbolKind.Class,
          range: {
            start: { line: i + 1, character: 0 },
            end: { line: i + 1, character: line.length }
          },
          children: this.parseClassMembers(lines, i),
          expanded: false
        });
        continue;
      }

      // 匹配 interface
      const interfaceMatch = line.match(/^export\s+interface\s+(\w+)/);
      if (interfaceMatch) {
        nodes.push({
          id: `ts-interface-${i}`,
          name: interfaceMatch[1],
          kind: OutlineSymbolKind.Interface,
          range: {
            start: { line: i + 1, character: 0 },
            end: { line: i + 1, character: line.length }
          },
          children: [],
          expanded: false
        });
        continue;
      }

      // 匹配 function
      const functionMatch = line.match(/^export\s+(?:async\s+)?function\s+(\w+)/);
      if (functionMatch) {
        nodes.push({
          id: `ts-function-${i}`,
          name: functionMatch[1],
          kind: OutlineSymbolKind.Function,
          range: {
            start: { line: i + 1, character: 0 },
            end: { line: i + 1, character: line.length }
          },
          children: [],
          expanded: false
        });
        continue;
      }

      // 匹配 const arrow function
      const arrowMatch = line.match(/^export\s+const\s+(\w+)\s*[=:][^=]*=>/);
      if (arrowMatch) {
        nodes.push({
          id: `ts-arrow-${i}`,
          name: arrowMatch[1],
          kind: OutlineSymbolKind.Function,
          range: {
            start: { line: i + 1, character: 0 },
            end: { line: i + 1, character: line.length }
          },
          children: [],
          expanded: false
        });
        continue;
      }

      // 匹配 type
      const typeMatch = line.match(/^export\s+type\s+(\w+)/);
      if (typeMatch) {
        nodes.push({
          id: `ts-type-${i}`,
          name: typeMatch[1],
          kind: OutlineSymbolKind.TypeParameter,
          range: {
            start: { line: i + 1, character: 0 },
            end: { line: i + 1, character: line.length }
          },
          children: [],
          expanded: false
        });
        continue;
      }

      // 匹配 enum
      const enumMatch = line.match(/^export\s+enum\s+(\w+)/);
      if (enumMatch) {
        nodes.push({
          id: `ts-enum-${i}`,
          name: enumMatch[1],
          kind: OutlineSymbolKind.Enum,
          range: {
            start: { line: i + 1, character: 0 },
            end: { line: i + 1, character: line.length }
          },
          children: [],
          expanded: false
        });
      }
    }

    return nodes;
  }

  /**
   * 解析类的成员（方法、属性等）
   */
  private static parseClassMembers(lines: string[], classLineIndex: number): OutlineNode[] {
    const members: OutlineNode[] = [];
    let braceCount = 0;
    let foundOpenBrace = false;

    for (let i = classLineIndex; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // 计算花括号数量
      for (const char of line) {
        if (char === '{') {
          braceCount++;
          foundOpenBrace = true;
        } else if (char === '}') {
          braceCount--;
          if (braceCount === 0 && foundOpenBrace) {
            // 类定义结束
            return members;
          }
        }
      }

      if (!foundOpenBrace) continue;

      // 匹配方法
      const methodMatch = line.match(/^(?:public|private|protected)?\s*(?:async\s+)?(\w+)\s*\(/);
      if (methodMatch && braceCount === 1) {
        members.push({
          id: `ts-method-${i}`,
          name: methodMatch[1],
          kind: OutlineSymbolKind.Method,
          range: {
            start: { line: i + 1, character: 0 },
            end: { line: i + 1, character: line.length }
          },
          children: [],
          expanded: false
        });
      }

      // 匹配属性
      const propertyMatch = line.match(/^(?:public|private|protected)?\s*(\w+)\s*[:=]/);
      if (propertyMatch && braceCount === 1 && !line.includes('(')) {
        members.push({
          id: `ts-property-${i}`,
          name: propertyMatch[1],
          kind: OutlineSymbolKind.Property,
          range: {
            start: { line: i + 1, character: 0 },
            end: { line: i + 1, character: line.length }
          },
          children: [],
          expanded: false
        });
      }
    }

    return members;
  }

  /**
   * 解析 JavaScript 文件
   */
  private static parseJavaScript(content: string): OutlineNode[] {
    // JavaScript 解析逻辑与 TypeScript 类似，但去掉类型注解
    const nodes: OutlineNode[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // 匹配 function
      const functionMatch = line.match(/^(?:export\s+)?(?:async\s+)?function\s+(\w+)/);
      if (functionMatch) {
        nodes.push({
          id: `js-function-${i}`,
          name: functionMatch[1],
          kind: OutlineSymbolKind.Function,
          range: {
            start: { line: i + 1, character: 0 },
            end: { line: i + 1, character: line.length }
          },
          children: [],
          expanded: false
        });
        continue;
      }

      // 匹配 const/let/var 函数
      const varFunctionMatch = line.match(/^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:function|\(.*\)\s*=>)/);
      if (varFunctionMatch) {
        nodes.push({
          id: `js-var-function-${i}`,
          name: varFunctionMatch[1],
          kind: OutlineSymbolKind.Function,
          range: {
            start: { line: i + 1, character: 0 },
            end: { line: i + 1, character: line.length }
          },
          children: [],
          expanded: false
        });
        continue;
      }

      // 匹配 class
      const classMatch = line.match(/^(?:export\s+)?class\s+(\w+)/);
      if (classMatch) {
        nodes.push({
          id: `js-class-${i}`,
          name: classMatch[1],
          kind: OutlineSymbolKind.Class,
          range: {
            start: { line: i + 1, character: 0 },
            end: { line: i + 1, character: line.length }
          },
          children: [],
          expanded: false
        });
      }
    }

    return nodes;
  }

  /**
   * 解析 Python 文件的类和函数
   */
  private static parsePython(content: string): OutlineNode[] {
    const nodes: OutlineNode[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      
      // 匹配 class
      const classMatch = trimmed.match(/^class\s+(\w+)/);
      if (classMatch) {
        nodes.push({
          id: `py-class-${i}`,
          name: classMatch[1],
          kind: OutlineSymbolKind.Class,
          range: {
            start: { line: i + 1, character: 0 },
            end: { line: i + 1, character: line.length }
          },
          children: [],
          expanded: false
        });
        continue;
      }

      // 匹配 def (函数/方法)
      const defMatch = trimmed.match(/^def\s+(\w+)/);
      if (defMatch) {
        // 判断是否在类内部（通过缩进）
        const indent = line.search(/\S/);
        const kind = indent > 0 ? OutlineSymbolKind.Method : OutlineSymbolKind.Function;
        
        nodes.push({
          id: `py-def-${i}`,
          name: defMatch[1],
          kind: kind,
          range: {
            start: { line: i + 1, character: 0 },
            end: { line: i + 1, character: line.length }
          },
          children: [],
          expanded: false
        });
      }
    }

    return nodes;
  }

  /**
   * 解析 JSON 文件的顶层键
   */
  private static parseJSON(content: string): OutlineNode[] {
    const nodes: OutlineNode[] = [];
    
    try {
      // 移除注释（支持 JSONC）
      const cleanedContent = content.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      const lines = content.split('\n');
      
      // 简单的键提取（不使用 JSON.parse 避免解析错误）
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const match = line.match(/^"([^"]+)"\s*:/);
        
        if (match) {
          nodes.push({
            id: `json-key-${i}`,
            name: match[1],
            kind: OutlineSymbolKind.Key,
            range: {
              start: { line: i + 1, character: 0 },
              end: { line: i + 1, character: line.length }
            },
            children: [],
            expanded: false
          });
        }
      }
    } catch (error) {
      console.error('[OutlineService] JSON 解析失败:', error);
    }

    return nodes;
  }

  /**
   * 解析 CSS/SCSS/LESS 文件的选择器
   */
  private static parseCSS(content: string): OutlineNode[] {
    const nodes: OutlineNode[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // 匹配 CSS 选择器（简化版）
      const selectorMatch = line.match(/^([.#]?[\w-]+(?:\s*[>,+~]\s*[\w-]+)*)\s*\{/);
      if (selectorMatch) {
        nodes.push({
          id: `css-selector-${i}`,
          name: selectorMatch[1],
          kind: OutlineSymbolKind.Property,
          range: {
            start: { line: i + 1, character: 0 },
            end: { line: i + 1, character: line.length }
          },
          children: [],
          expanded: false
        });
      }
    }

    return nodes;
  }

  /**
   * 解析 HTML 文件的标签
   */
  private static parseHTML(content: string): OutlineNode[] {
    const nodes: OutlineNode[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      
      // 匹配 HTML 标签（仅匹配开始标签，忽略自闭合标签和注释）
      const tagMatch = trimmed.match(/^<(\w+)(?:\s+[^>]*)?>(?!.*<\/\1>)/);
      if (tagMatch && !trimmed.startsWith('<!--')) {
        const indent = line.search(/\S/);
        
        nodes.push({
          id: `html-tag-${i}`,
          name: `<${tagMatch[1]}>`,
          kind: OutlineSymbolKind.Property,
          range: {
            start: { line: i + 1, character: 0 },
            end: { line: i + 1, character: line.length }
          },
          children: [],
          expanded: false
        });
      }
    }

    return nodes;
  }

  /**
   * 通用解析（对于不支持的语言）
   * 尝试提取函数定义、类定义等常见结构
   */
  private static parseGeneric(content: string, language: string): OutlineNode[] {
    const nodes: OutlineNode[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // 通用函数匹配
      const functionMatch = line.match(/^(?:function|def|func|fn)\s+(\w+)/);
      if (functionMatch) {
        nodes.push({
          id: `generic-function-${i}`,
          name: functionMatch[1],
          kind: OutlineSymbolKind.Function,
          range: {
            start: { line: i + 1, character: 0 },
            end: { line: i + 1, character: line.length }
          },
          children: [],
          expanded: false
        });
        continue;
      }

      // 通用类匹配
      const classMatch = line.match(/^(?:class|struct)\s+(\w+)/);
      if (classMatch) {
        nodes.push({
          id: `generic-class-${i}`,
          name: classMatch[1],
          kind: OutlineSymbolKind.Class,
          range: {
            start: { line: i + 1, character: 0 },
            end: { line: i + 1, character: line.length }
          },
          children: [],
          expanded: false
        });
      }
    }

    return nodes;
  }
}

