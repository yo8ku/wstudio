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
export declare class FileParser {
    /**
     * 根据文件扩展名检测文件类型
     */
    static detectFileType(fileName: string): string;
    /**
     * 解析文件内容
     * @param rawContent 原始文件内容（字符串）
     * @param fileName 文件名
     * @param filePath 文件路径
     */
    static parseFile(rawContent: string, fileName: string, filePath: string): FileParseResult;
    /**
     * 清理文件内容，移除可能导致问题的控制字符
     * 保留常见的转义字符（\n, \r, \t 等）
     */
    private static cleanContent;
    /**
     * 检查文件类型是否支持
     * 只支持文本类型的文件，不支持二进制文件（如 PDF、Word 等需要特殊处理的文件）
     */
    static isSupportedFileType(fileName: string): boolean;
    /**
     * 获取文件扩展名
     */
    static getFileExtension(fileName: string): string;
    /**
     * 获取支持的文件类型列表（用于显示）
     */
    static getSupportedFileTypes(): string[];
}
//# sourceMappingURL=FileParser.d.ts.map