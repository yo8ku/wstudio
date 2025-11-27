"""
文件解析服务
支持多种文件类型的解析：txt、markdown、json、代码文件等
使用 LangChain 的 DocumentLoader 来加载文件
"""

import os
import json
from typing import Dict, Any, Optional, List

# 尝试从新位置导入 LangChain DocumentLoader
try:
    from langchain_community.document_loaders import TextLoader, JSONLoader
    from langchain_core.documents import Document
except ImportError:
    # 回退到旧位置
    try:
        from langchain.document_loaders import TextLoader, JSONLoader
        from langchain.schema import Document
    except ImportError:
        # 如果都失败，使用基础实现
        TextLoader = None
        JSONLoader = None
        Document = None


class FileParserService:
    """文件解析服务"""
    
    @staticmethod
    def detect_file_type(file_name: str) -> str:
        """
        根据文件扩展名检测文件类型
        
        Args:
            file_name: 文件名
            
        Returns:
            文件类型字符串
        """
        extension = os.path.splitext(file_name)[1].lower().lstrip('.')
        
        # 文本文件类型
        text_types = ['txt', 'text', 'md', 'markdown', 'mdown', 'mkd', 'mkdn']
        if extension in text_types:
            if extension in ['md', 'markdown', 'mdown', 'mkd', 'mkdn']:
                return 'markdown'
            return 'text'
        
        # JSON 文件
        if extension == 'json':
            return 'json'
        
        # Word 文档
        if extension in ['doc', 'docx']:
            return 'doc'
        
        # PDF 文件
        if extension == 'pdf':
            return 'pdf'
        
        # 代码文件
        code_types = [
            'js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'h', 'cs',
            'php', 'rb', 'go', 'rs', 'swift', 'kt', 'html', 'htm', 'css',
            'scss', 'sass', 'less', 'xml', 'yaml', 'yml', 'sh', 'bash',
            'zsh', 'fish', 'ps1', 'bat', 'cmd', 'sql', 'r', 'm', 'pl',
            'lua', 'vim', 'vimrc'
        ]
        if extension in code_types:
            return 'code'
        
        # 默认作为文本文件处理
        return 'text'
    
    @staticmethod
    def clean_content(content: str) -> str:
        """
        清理文件内容，移除可能导致问题的控制字符
        保留常见的转义字符（\n, \r, \t 等）
        
        Args:
            content: 原始内容
            
        Returns:
            清理后的内容
        """
        result = ''
        for char in content:
            code = ord(char)
            # 保留常见的空白字符和控制字符（换行、制表符等）
            if code == 9 or code == 10 or code == 13:  # 制表符、换行符、回车符
                result += char
            # 保留可打印字符
            elif 32 <= code <= 126:  # 可打印 ASCII 字符
                result += char
            # 保留非 ASCII 字符（如中文）
            elif code > 127:
                try:
                    char.encode('utf-8')
                    result += char
                except:
                    # 无效的 Unicode 字符，跳过
                    continue
            # 其他控制字符跳过
        return result
    
    @staticmethod
    def parse_file(file_path: str) -> Dict[str, Any]:
        """
        解析文件内容
        使用 LangChain 的 DocumentLoader 来加载文件
        
        Args:
            file_path: 文件路径
            
        Returns:
            解析结果字典，包含 content 和 metadata
        """
        file_name = os.path.basename(file_path)
        file_type = FileParserService.detect_file_type(file_name)
        
        # 使用 LangChain DocumentLoader 加载文件
        try:
            documents: List[Document] = []
            
            # 根据文件类型选择合适的 Loader
            if file_type == 'json' and JSONLoader is not None:
                # JSON 文件：使用 JSONLoader
                try:
                    # JSONLoader 的参数可能因版本而异，尝试不同的方式
                    try:
                        # 新版本可能使用 jq_schema
                        loader = JSONLoader(file_path, jq_schema='.', text_content=False)
                    except TypeError:
                        # 旧版本可能使用不同的参数
                        loader = JSONLoader(file_path)
                    documents = loader.load()
                except Exception as json_error:
                    # 如果 JSONLoader 失败，回退到 TextLoader
                    print(f"[FileParserService] JSONLoader 失败，回退到 TextLoader: {json_error}")
                    if TextLoader is not None:
                        loader = TextLoader(file_path, encoding='utf-8')
                        documents = loader.load()
                    else:
                        # 如果 TextLoader 也不可用，使用基础实现
                        documents = FileParserService._load_file_fallback(file_path)
            elif TextLoader is not None:
                # 文本文件、Markdown、代码文件等：使用 TextLoader
                try:
                    loader = TextLoader(file_path, encoding='utf-8')
                    documents = loader.load()
                except UnicodeDecodeError:
                    # 如果 UTF-8 解码失败，尝试其他编码
                    try:
                        loader = TextLoader(file_path, encoding='gbk')
                        documents = loader.load()
                    except:
                        # 如果都失败，尝试 latin-1
                        loader = TextLoader(file_path, encoding='latin-1', errors='replace')
                        documents = loader.load()
            else:
                # 如果 LangChain DocumentLoader 不可用，使用基础实现
                documents = FileParserService._load_file_fallback(file_path)
            
            # 合并所有文档的内容
            if documents and len(documents) > 0:
                # 合并所有文档的 page_content
                content_parts = [doc.page_content for doc in documents if doc.page_content]
                content = '\n\n'.join(content_parts)
                
                # 合并元数据（从第一个文档获取）
                doc_metadata = documents[0].metadata if documents else {}
            else:
                # 如果没有文档，使用基础实现
                fallback_result = FileParserService._load_file_fallback(file_path)
                if isinstance(fallback_result, list) and len(fallback_result) > 0:
                    content = fallback_result[0].page_content if hasattr(fallback_result[0], 'page_content') else ''
                    doc_metadata = fallback_result[0].metadata if hasattr(fallback_result[0], 'metadata') else {}
                else:
                    content = ''
                    doc_metadata = {}
            
            # 根据文件类型进行后处理
            if file_type == 'json':
                # JSON 文件：尝试格式化
                try:
                    parsed = json.loads(content)
                    content = json.dumps(parsed, ensure_ascii=False, indent=2)
                except:
                    # 如果解析失败，使用原始内容
                    pass
            
            # 清理内容：移除控制字符（保留常见的转义字符）
            content = FileParserService.clean_content(content)
            
            # 合并文件元数据和文档元数据
            metadata = {
                'fileType': file_type,
                'fileName': file_name,
                'filePath': file_path,
                **doc_metadata
            }
            
            return {
                'success': True,
                'content': content,
                'metadata': metadata
            }
            
        except Exception as e:
            # 如果 LangChain DocumentLoader 失败，使用基础实现作为回退
            try:
                return FileParserService._parse_file_fallback(file_path, file_name, file_type)
            except Exception as fallback_error:
                return {
                    'success': False,
                    'error': f'Failed to parse file: {str(e)} (fallback also failed: {str(fallback_error)})',
                    'content': '',
                    'metadata': {
                        'fileType': file_type,
                        'fileName': file_name,
                        'filePath': file_path
                    }
                }
    
    @staticmethod
    def _load_file_fallback(file_path: str) -> List[Any]:
        """
        基础文件加载实现（当 LangChain DocumentLoader 不可用时使用）
        
        Args:
            file_path: 文件路径
            
        Returns:
            文档列表（模拟 Document 对象）
        """
        class SimpleDocument:
            def __init__(self, page_content: str, metadata: Dict[str, Any]):
                self.page_content = page_content
                self.metadata = metadata
        
        # 读取文件内容
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
        except UnicodeDecodeError:
            try:
                with open(file_path, 'r', encoding='gbk') as f:
                    content = f.read()
            except:
                with open(file_path, 'r', encoding='latin-1', errors='replace') as f:
                    content = f.read()
        
        return [SimpleDocument(content, {})]
    
    @staticmethod
    def _parse_file_fallback(file_path: str, file_name: str, file_type: str) -> Dict[str, Any]:
        """
        基础文件解析实现（当 LangChain DocumentLoader 失败时使用）
        
        Args:
            file_path: 文件路径
            file_name: 文件名
            file_type: 文件类型
            
        Returns:
            解析结果字典
        """
        # 读取文件内容
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                raw_content = f.read()
        except UnicodeDecodeError:
            try:
                with open(file_path, 'r', encoding='gbk') as f:
                    raw_content = f.read()
            except:
                with open(file_path, 'r', encoding='latin-1', errors='replace') as f:
                    raw_content = f.read()
        except Exception as e:
            return {
                'success': False,
                'error': f'Failed to read file: {str(e)}',
                'content': '',
                'metadata': {
                    'fileType': file_type,
                    'fileName': file_name,
                    'filePath': file_path
                }
            }
        
        content = raw_content
        
        # 根据文件类型进行不同的处理
        if file_type == 'json':
            try:
                parsed = json.loads(raw_content)
                content = json.dumps(parsed, ensure_ascii=False, indent=2)
            except:
                content = raw_content
        
        # 清理内容
        content = FileParserService.clean_content(content)
        
        return {
            'success': True,
            'content': content,
            'metadata': {
                'fileType': file_type,
                'fileName': file_name,
                'filePath': file_path
            }
        }
    
    @staticmethod
    def is_supported_file_type(file_name: str) -> bool:
        """
        检查文件类型是否支持
        
        Args:
            file_name: 文件名
            
        Returns:
            是否支持
        """
        extension = os.path.splitext(file_name)[1].lower().lstrip('.')
        
        # 支持的文件类型列表
        supported_extensions = [
            # 文本文件
            'txt', 'text',
            # Markdown 文件
            'md', 'markdown', 'mdown', 'mkd', 'mkdn',
            # JSON 文件
            'json',
            # 代码文件
            'js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'h', 'cs',
            'php', 'rb', 'go', 'rs', 'swift', 'kt',
            'html', 'htm', 'css', 'scss', 'sass', 'less', 'xml', 'yaml', 'yml',
            'sh', 'bash', 'zsh', 'fish', 'ps1', 'bat', 'cmd',
            'sql', 'r', 'm', 'pl', 'lua', 'vim', 'vimrc',
            # 配置文件
            'ini', 'conf', 'config', 'toml', 'properties',
            # 其他文本格式
            'csv', 'tsv', 'log', 'mdx'
        ]
        
        return extension in supported_extensions


def get_file_parser_service() -> FileParserService:
    """获取文件解析服务实例（单例模式）"""
    if not hasattr(get_file_parser_service, '_instance'):
        get_file_parser_service._instance = FileParserService()
    return get_file_parser_service._instance

