/**
 * 文件解析工具
 * 支持多种文件类型的解析：txt、markdown、doc、json等
 */

export interface FileParseResult {
  content: string;
  metadata: {
    fileType: string;
    fileName: string;
    filePath: string;
  };
}

/**
 * 文件解析器类
 */
export class FileParser {
  /**
   * 根据文件扩展名检测文件类型
   */
  static detectFileType(fileName: string): string {
    const extension = fileName.split('.').pop()?.toLowerCase() || '';
    
    // 文本文件类型
    const textTypes = ['txt', 'text', 'md', 'markdown', 'mdown', 'mkd', 'mkdn'];
    if (textTypes.includes(extension)) {
      return extension === 'md' || extension === 'markdown' || extension === 'mdown' || extension === 'mkd' || extension === 'mkdn'
        ? 'markdown'
        : 'text';
    }
    
    // JSON 文件
    if (extension === 'json') {
      return 'json';
    }
    
    // Word 文档（需要特殊处理）
    if (extension === 'doc' || extension === 'docx') {
      return 'doc';
    }
    
    // PDF 文件
    if (extension === 'pdf') {
      return 'pdf';
    }
    
    // 代码文件
    const codeTypes = ['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'h', 'cs', 'php', 'rb', 'go', 'rs', 'swift', 'kt'];
    if (codeTypes.includes(extension)) {
      return 'code';
    }
    
    // 默认作为文本文件处理
    return 'text';
  }

  /**
   * 解析文件内容
   * @param rawContent 原始文件内容（字符串）
   * @param fileName 文件名
   * @param filePath 文件路径
   */
  static parseFile(
    rawContent: string,
    fileName: string,
    filePath: string
  ): FileParseResult {
    const fileType = this.detectFileType(fileName);
    
    let content = rawContent;
    
    // 根据文件类型进行不同的处理
    switch (fileType) {
      case 'json':
        // JSON 文件：尝试格式化，如果失败则返回原始内容
        try {
          const parsed = JSON.parse(rawContent);
          content = JSON.stringify(parsed, null, 2);
        } catch {
          // 如果解析失败，使用原始内容
          content = rawContent;
        }
        break;
        
      case 'markdown':
        // Markdown 文件：直接使用原始内容
        // 可以在这里添加 Markdown 的预处理逻辑
        content = rawContent;
        break;
        
      case 'text':
        // 文本文件：直接使用原始内容
        content = rawContent;
        break;
        
      case 'code':
        // 代码文件：直接使用原始内容
        content = rawContent;
        break;
        
      case 'doc':
      case 'docx':
        // Word 文档：需要特殊处理
        // 目前 Electron 的 file.read API 可能已经处理了，这里先使用原始内容
        // 如果后续需要更复杂的处理，可以在这里添加
        content = rawContent;
        break;
        
      case 'pdf':
        // PDF 文件：需要特殊处理
        // 目前 Electron 的 file.read API 可能已经处理了，这里先使用原始内容
        // 如果后续需要更复杂的处理，可以在这里添加
        content = rawContent;
        break;
        
      default:
        // 默认作为文本处理
        content = rawContent;
    }
    
    // 清理内容：移除控制字符（保留常见的转义字符）
    content = this.cleanContent(content);
    
    return {
      content,
      metadata: {
        fileType,
        fileName,
        filePath,
      },
    };
  }

  /**
   * 清理文件内容，移除可能导致问题的控制字符
   * 保留常见的转义字符（\n, \r, \t 等）
   */
  private static cleanContent(content: string): string {
    // 移除控制字符（除了常见的转义字符）
    // 保留：\n (0x0A), \r (0x0D), \t (0x09)
    // 移除：\u0000-\u0008, \u000B, \u000C, \u000E-\u001F, \u007F-\u009F
    return content.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '');
  }

  /**
   * 检查文件类型是否支持
   * 只支持文本类型的文件，不支持二进制文件（如 PDF、Word 等需要特殊处理的文件）
   */
  static isSupportedFileType(fileName: string): boolean {
    const extension = fileName.split('.').pop()?.toLowerCase() || '';
    
    // 支持的文件类型列表
    const supportedExtensions = [
      // 文本文件
      'txt', 'text',
      // Markdown 文件
      'md', 'markdown', 'mdown', 'mkd', 'mkdn',
      // JSON 文件
      'json',
      // 代码文件
      'js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'h', 'cs', 'php', 'rb', 'go', 'rs', 'swift', 'kt',
      'html', 'htm', 'css', 'scss', 'sass', 'less', 'xml', 'yaml', 'yml',
      'sh', 'bash', 'zsh', 'fish', 'ps1', 'bat', 'cmd',
      'sql', 'r', 'm', 'pl', 'lua', 'vim', 'vimrc',
      // 配置文件
      'ini', 'conf', 'config', 'toml', 'properties',
      // 其他文本格式
      'csv', 'tsv', 'log', 'mdx'
    ];
    
    return supportedExtensions.includes(extension);
  }
  
  /**
   * 获取文件扩展名
   */
  static getFileExtension(fileName: string): string {
    return fileName.split('.').pop()?.toLowerCase() || '';
  }
  
  /**
   * 获取支持的文件类型列表（用于显示）
   */
  static getSupportedFileTypes(): string[] {
    return [
      'txt', 'text', 'md', 'markdown', 'json',
      'js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'h', 'cs', 'php', 'rb', 'go', 'rs', 'swift', 'kt',
      'html', 'htm', 'css', 'scss', 'sass', 'less', 'xml', 'yaml', 'yml',
      'sh', 'bash', 'sql', 'r', 'csv', 'log', 'mdx'
    ];
  }
}

