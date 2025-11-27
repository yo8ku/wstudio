"""
文本分块服务 - 使用 LangChain
"""

from typing import List, Dict, Any, Optional

# 尝试从新位置导入（langchain 0.2+）
try:
    from langchain_text_splitters import (
        RecursiveCharacterTextSplitter,
        CharacterTextSplitter,
        TokenTextSplitter,
        MarkdownTextSplitter,
        PythonCodeTextSplitter,
    )
    from langchain_core.documents import Document
except ImportError:
    # 回退到旧位置（langchain < 0.2）
    try:
        from langchain.text_splitter import (
            RecursiveCharacterTextSplitter,
            CharacterTextSplitter,
            TokenTextSplitter,
            MarkdownTextSplitter,
            PythonCodeTextSplitter,
        )
        from langchain.schema import Document
    except ImportError:
        # 如果都失败，尝试从 langchain 直接导入
        from langchain.text_splitter import (
            RecursiveCharacterTextSplitter,
            CharacterTextSplitter,
            TokenTextSplitter,
            MarkdownTextSplitter,
            PythonCodeTextSplitter,
        )
        from langchain.schema import Document


class ChunkService:
    """文本分块服务"""
    
    def __init__(self):
        self.splitters: Dict[str, Any] = {}
    
    def _detect_file_type(self, text: str) -> str:
        """
        检测文件类型
        
        Args:
            text: 文本内容
        
        Returns:
            文件类型 (javascript, typescript, python, markdown, other)
        """
        # JavaScript/TypeScript 特征关键词
        js_keywords = [
            'export ', 'export{', 'export {', 'export default', 
            'import ', 'import{', 'import {', 'import(',
            'const ', 'let ', 'var ', 'function ', '=>', 'class ',
            'interface ', 'type ', 'extends ', 'implements ', 
            'async ', 'await ', 'console.log', 'document.', 'window.', 
            'require(', 'module.exports', '__dirname', '__filename',
            'export *', 'import *', 'export function', 'export class',
            'export const', 'export let', 'export var'
        ]
        
        # TypeScript 特有关键词
        ts_keywords = [
            'interface ', 'type ', ': string', ': number', ': boolean',
            ': void', ': any', ': unknown', 'as ', 'enum ',
            'namespace ', 'declare ', 'readonly ', '?: ', 
            'public ', 'private ', 'protected ', 'static '
        ]
        
        # Python 关键词
        python_keywords = [
            'def ', 'class ', 'import ', 'from ', 'if __name__',
            'self.', 'def __init__', 'return ', 'elif ', 'except ',
            'finally:', 'with ', 'yield ', 'lambda ', 'print('
        ]
        
        # Markdown 特征
        markdown_features = [
            '# ', '## ', '### ', '- ', '* ', '1. ',
            '```', '**', '__', '[', '](',
            '> ', '---', '***'
        ]
        
        # 计算匹配得分
        js_score = sum(1 for keyword in js_keywords if keyword in text)
        ts_score = sum(1 for keyword in ts_keywords if keyword in text)
        python_score = sum(1 for keyword in python_keywords if keyword in text)
        markdown_score = sum(1 for feature in markdown_features if feature in text)
        
        # 特殊处理：如果有 TypeScript 特有语法，优先判定为 TypeScript
        if ts_score > 0 and (js_score > 0 or ts_score >= 2):
            return 'typescript'
        elif js_score > 0:
            return 'javascript'
        elif python_score > js_score and python_score > 0:
            return 'python'
        elif markdown_score > max(js_score, python_score, ts_score):
            return 'markdown'
        else:
            return 'other'
    
    def chunk_text(
        self,
        text: str,
        chunk_size: int = 1000,
        chunk_overlap: int = 200,
        strategy: str = "recursive",
        **kwargs
    ) -> List[Dict[str, Any]]:
        """
        对文本进行分块
        
        Args:
            text: 要分块的文本
            chunk_size: 块大小
            chunk_overlap: 块重叠大小
            strategy: 分块策略 (recursive, character, token, markdown, python)
            **kwargs: 其他参数
        
        Returns:
            分块结果列表
        """
        try:
            # 验证输入文本
            if not isinstance(text, str):
                raise ValueError(f"文本必须是字符串类型，当前类型: {type(text)}")
            
            # 如果文本为空，返回空列表
            if not text.strip():
                return []
            
            # 智能检测文件类型并调整分块策略
            detected_type = self._detect_file_type(text)
            original_strategy = strategy
            
            # 根据检测到的文件类型调整策略
            if detected_type in ['javascript', 'typescript']:
                # JavaScript/TypeScript 文件绝对不能使用python策略，强制使用recursive策略
                original_strategy_for_log = strategy
                strategy = 'recursive'  # 强制使用安全的recursive策略
                if original_strategy_for_log != 'recursive':
                    print(f"[ChunkService] 检测到{detected_type}文件，强制从{original_strategy_for_log}策略切换到recursive策略")
                else:
                    print(f"[ChunkService] 检测到{detected_type}文件，使用recursive策略")
            elif detected_type == 'python' and strategy not in ['python', 'recursive', 'character', 'token']:
                # Python 文件可以使用 python 策略
                strategy = 'python'
            elif detected_type == 'markdown' and strategy not in ['markdown', 'recursive', 'character']:
                # Markdown 文件使用 markdown 策略
                strategy = 'markdown'
            
            # 额外安全检查：如果文本包含export/import关键词但策略仍然是python，强制改为recursive
            js_ts_patterns = [
                'export ', 'export{', 'export {', 'export default',
                'import ', 'import{', 'import {', 'import(',
                'export *', 'import *', 'export function', 'export class',
                'export const', 'export let', 'export var'
            ]
            if strategy == 'python' and any(pattern in text for pattern in js_ts_patterns):
                strategy = 'recursive'
                print(f"[ChunkService] 安全检查：发现export/import关键词，强制将python策略改为recursive策略")
            
            # 最终安全检查：如果策略仍然是python但检测类型是JS/TS，强制改为recursive
            if strategy == 'python' and detected_type in ['javascript', 'typescript']:
                strategy = 'recursive'
                print(f"[ChunkService] 最终安全检查：检测到{detected_type}文件但策略是python，强制改为recursive策略")
            
            # 如果策略发生变化，记录日志
            if strategy != original_strategy:
                print(f"[ChunkService] 策略调整: {original_strategy} -> {strategy} (检测类型: {detected_type})")
            
            # 确保不会对JS/TS文件使用PythonCodeTextSplitter
            # 如果策略仍然是python，再次检查文本内容
            if strategy == 'python':
                # 检查是否包含JavaScript/TypeScript特征
                js_ts_indicators = [
                    'export ', 'export{', 'export {', 'export default', 
                    'import ', 'import{', 'import {', 'import(',
                    'const ', 'let ', 'var ', 'function ', '=>', 'interface ', 'type ',
                    'async ', 'await ', 'console.log', 'document.', 'window.',
                    'require(', 'module.exports', 'export *', 'import *',
                    'export function', 'export class', 'export const', 'export let', 'export var'
                ]
                has_js_ts = any(indicator in text for indicator in js_ts_indicators)
                
                if has_js_ts:
                    strategy = 'recursive'
                    print(f"[ChunkService] 最终检查：发现JS/TS特征，将python策略改为recursive策略")
            
            # 获取分块器（此时策略应该已经正确调整）
            # 最后的安全检查：如果策略是python，使用正则表达式再次验证文本内容
            if strategy == 'python':
                import re
                export_pattern = r'\bexport\s+(?:\{|default\s+|const\s+|let\s+|var\s+|function\s+|class\s+|\*)'
                import_pattern = r'\bimport\s+(?:\{|\(|\*|["\'])'
                has_export = bool(re.search(export_pattern, text))
                has_import = bool(re.search(import_pattern, text))
                
                if has_export or has_import:
                    strategy = 'recursive'
                    print(f"[ChunkService] 最终验证：使用正则表达式检测到export/import语句，强制将python策略改为recursive策略")
            
            splitter = self._get_splitter(strategy, chunk_size, chunk_overlap, **kwargs)
            
            # 创建文档对象
            # 如果策略是python，再次检查文本内容，确保不是JS/TS代码
            if strategy == 'python':
                import re
                # 更严格的检查：确保文本不包含任何JS/TS特征
                js_ts_patterns = [
                    r'\bexport\s+(?:\{|default\s+|const\s+|let\s+|var\s+|function\s+|class\s+|\*)',
                    r'\bimport\s+(?:\{|\(|\*|["\'])',
                    r'\bconst\s+\w+\s*=',
                    r'\blet\s+\w+\s*=',
                    r'\bvar\s+\w+\s*=',
                    r'\bfunction\s+\w+\s*\(',
                    r'\bclass\s+\w+',
                    r'\binterface\s+\w+',
                    r'\btype\s+\w+',
                    r'=>',
                    r'console\.',
                    r'document\.',
                    r'window\.',
                ]
                has_js_ts = any(re.search(pattern, text, re.IGNORECASE) for pattern in js_ts_patterns)
                
                if has_js_ts:
                    strategy = 'recursive'
                    print(f"[ChunkService] 创建文档前最终检查：检测到JS/TS特征，强制将python策略改为recursive策略")
                    splitter = self._get_splitter(strategy, chunk_size, chunk_overlap, **kwargs)
            
            try:
                documents = splitter.create_documents([text])
            except Exception as create_error:
                error_msg = str(create_error)
                # 检查是否是PythonCodeTextSplitter解析非Python代码导致的错误
                if strategy == 'python' or 'unexpected token' in error_msg.lower() or 'export' in error_msg.lower() or 'import' in error_msg.lower():
                    print(f"[ChunkService] create_documents失败，可能是PythonCodeTextSplitter解析非Python代码: {error_msg}")
                    print(f"[ChunkService] 强制使用recursive策略作为回退")
                    # 使用recursive策略作为回退
                    splitter = self._get_splitter('recursive', chunk_size, chunk_overlap, **kwargs)
                    documents = splitter.create_documents([text])
                else:
                    # 其他错误，直接抛出
                    raise
            
            # 转换为字典格式
            chunks = []
            for idx, doc in enumerate(documents):
                chunks.append({
                    "id": f"chunk_{idx}",
                    "content": doc.page_content,
                    "metadata": {
                        **doc.metadata,
                        "chunk_index": idx,
                        "chunk_size": len(doc.page_content),
                        "detected_type": detected_type,
                        "strategy_used": strategy,
                        "original_strategy": original_strategy
                    }
                })
            
            return chunks
            
        except Exception as e:
            # 增强的错误处理和回退机制
            error_msg = str(e)
            print(f"[ChunkService] 分块失败: {error_msg}")
            
            # 检查是否是 "Unexpected token" 错误（通常是PythonCodeTextSplitter解析JS/TS代码导致的）
            is_js_ts_error = 'unexpected token' in error_msg.lower() or 'export' in error_msg.lower()
            
            # 如果检测到JS/TS相关错误，使用recursive策略作为回退（更适合代码文件）
            # 否则使用character策略作为回退
            fallback_strategy = 'recursive' if is_js_ts_error else 'character'
            fallback_separator = ["\n\n", "\n", " ", ""] if is_js_ts_error else "\n"
            
            try:
                print(f"[ChunkService] 尝试使用{fallback_strategy}策略作为回退")
                if fallback_strategy == 'recursive':
                    fallback_splitter = RecursiveCharacterTextSplitter(
                        chunk_size=chunk_size,
                        chunk_overlap=chunk_overlap,
                        separators=fallback_separator
                    )
                else:
                    fallback_splitter = self._get_splitter(fallback_strategy, chunk_size, chunk_overlap, separator=fallback_separator)
                documents = fallback_splitter.create_documents([text])
                
                chunks = []
                for idx, doc in enumerate(documents):
                    chunks.append({
                        "id": f"chunk_{idx}",
                        "content": doc.page_content,
                        "metadata": {
                            "chunk_index": idx,
                            "chunk_size": len(doc.page_content),
                            "fallback": True,
                            "fallback_strategy": fallback_strategy,
                            "original_error": error_msg
                        }
                    })
                
                print(f"[ChunkService] 回退策略成功，生成{len(chunks)}个块")
                return chunks
                
            except Exception as fallback_error:
                print(f"[ChunkService] 回退策略也失败: {str(fallback_error)}")
                
                # 最终回退：返回原始文本作为单个块
                detected_type = self._detect_file_type(text)
                final_error_msg = error_msg
                
                if detected_type in ['javascript', 'typescript']:
                    final_error_msg = f"处理{detected_type}文件时出错: {error_msg}"
                elif 'export' in error_msg.lower() or 'unexpected token' in error_msg.lower():
                    final_error_msg = f"处理JavaScript/TypeScript文件时出错: {error_msg}"
                
                return [{
                    "id": "chunk_0",
                    "content": text,
                    "metadata": {
                        "chunk_index": 0,
                        "chunk_size": len(text),
                        "error": final_error_msg,
                        "fallback_error": str(fallback_error),
                        "detected_type": detected_type,
                        "fallback": True,
                        "fallback_strategy": "single_chunk"
                    }
                }]
    
    def chunk_documents(
        self,
        documents: List[Dict[str, Any]],
        chunk_size: int = 1000,
        chunk_overlap: int = 200,
        strategy: str = "recursive",
        **kwargs
    ) -> List[Dict[str, Any]]:
        """
        对多个文档进行分块
        
        Args:
            documents: 文档列表
            chunk_size: 块大小
            chunk_overlap: 块重叠大小
            strategy: 分块策略
            **kwargs: 其他参数
        
        Returns:
            分块结果列表
        """
        all_chunks = []
        
        # 对每个文档单独进行分块处理，避免一个文档的错误影响其他文档
        for doc_idx, doc in enumerate(documents):
            try:
                content = doc.get("content", "")
                metadata = doc.get("metadata", {})
                
                # 使用单文档分块方法
                doc_chunks = self.chunk_text(
                    content, 
                    chunk_size=chunk_size, 
                    chunk_overlap=chunk_overlap, 
                    strategy=strategy, 
                    **kwargs
                )
                
                # 合并元数据并更新索引
                for chunk_idx, chunk in enumerate(doc_chunks):
                    chunk["id"] = f"doc_{doc_idx}_chunk_{chunk_idx}"
                    chunk["metadata"] = {
                        **metadata,  # 原始文档元数据
                        **chunk["metadata"],  # 分块过程中添加的元数据
                        "document_index": doc_idx,
                        "global_chunk_index": len(all_chunks) + chunk_idx
                    }
                
                all_chunks.extend(doc_chunks)
                
            except Exception as e:
                print(f"[ChunkService] 处理文档{doc_idx}时出错: {str(e)}")
                # 为失败的文档创建单个块
                content = doc.get("content", "")
                metadata = doc.get("metadata", {})
                
                all_chunks.append({
                    "id": f"doc_{doc_idx}_chunk_0",
                    "content": content,
                    "metadata": {
                        **metadata,
                        "chunk_index": 0,
                        "chunk_size": len(content),
                        "document_index": doc_idx,
                        "global_chunk_index": len(all_chunks),
                        "error": str(e),
                        "fallback": True
                    }
                })
        
        return all_chunks
    
    def _get_splitter(
        self,
        strategy: str,
        chunk_size: int,
        chunk_overlap: int,
        **kwargs
    ):
        """获取分块器"""
        cache_key = f"{strategy}_{chunk_size}_{chunk_overlap}"
        
        if cache_key not in self.splitters:
            if strategy == "recursive":
                separators = kwargs.get("separators", ["\n\n", "\n", " ", ""])
                self.splitters[cache_key] = RecursiveCharacterTextSplitter(
                    chunk_size=chunk_size,
                    chunk_overlap=chunk_overlap,
                    separators=separators,
                )
            elif strategy == "character":
                separator = kwargs.get("separator", "\n\n")
                self.splitters[cache_key] = CharacterTextSplitter(
                    chunk_size=chunk_size,
                    chunk_overlap=chunk_overlap,
                    separator=separator,
                )
            elif strategy == "token":
                encoding_name = kwargs.get("encoding_name", "cl100k_base")
                self.splitters[cache_key] = TokenTextSplitter(
                    chunk_size=chunk_size,
                    chunk_overlap=chunk_overlap,
                    encoding_name=encoding_name,
                )
            elif strategy == "markdown":
                self.splitters[cache_key] = MarkdownTextSplitter(
                    chunk_size=chunk_size,
                    chunk_overlap=chunk_overlap,
                )
            elif strategy == "python":
                # 注意：PythonCodeTextSplitter只应该用于真正的Python代码
                # 如果有export/import等JavaScript关键词，说明不是Python代码，使用recursive策略
                # 注意：这里不应该创建PythonCodeTextSplitter，因为文本内容可能包含JS/TS代码
                # 应该在chunk_text方法中确保策略已经正确调整
                print(f"[ChunkService] 警告：请求使用python策略，但应该在chunk_text中已经检查过文本内容")
                print(f"[ChunkService] 创建PythonCodeTextSplitter（如果文本包含JS/TS代码，会在create_documents时失败并触发回退）")
                self.splitters[cache_key] = PythonCodeTextSplitter(
                    chunk_size=chunk_size,
                    chunk_overlap=chunk_overlap,
                )
            else:
                # 默认使用递归字符分块器
                print(f"[ChunkService] 未知策略'{strategy}'，使用默认的recursive策略")
                self.splitters[cache_key] = RecursiveCharacterTextSplitter(
                    chunk_size=chunk_size,
                    chunk_overlap=chunk_overlap,
                )
        
        return self.splitters[cache_key]


# 全局实例
_chunk_service = None


def get_chunk_service() -> ChunkService:
    """获取分块服务实例"""
    global _chunk_service
    if _chunk_service is None:
        _chunk_service = ChunkService()
    return _chunk_service


