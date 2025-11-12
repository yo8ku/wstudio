"""
文本分块服务 - 使用 LangChain
"""

from typing import List, Dict, Any, Optional
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
        splitter = self._get_splitter(strategy, chunk_size, chunk_overlap, **kwargs)
        
        # 创建文档对象
        documents = splitter.create_documents([text])
        
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
                }
            })
        
        return chunks
    
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
        splitter = self._get_splitter(strategy, chunk_size, chunk_overlap, **kwargs)
        
        # 创建 LangChain 文档对象
        langchain_docs = []
        for doc in documents:
            langchain_docs.append(Document(
                page_content=doc.get("content", ""),
                metadata=doc.get("metadata", {})
            ))
        
        # 分块
        chunked_docs = splitter.split_documents(langchain_docs)
        
        # 转换为字典格式
        chunks = []
        for idx, doc in enumerate(chunked_docs):
            chunks.append({
                "id": f"chunk_{idx}",
                "content": doc.page_content,
                "metadata": {
                    **doc.metadata,
                    "chunk_index": idx,
                    "chunk_size": len(doc.page_content),
                }
            })
        
        return chunks
    
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
                self.splitters[cache_key] = PythonCodeTextSplitter(
                    chunk_size=chunk_size,
                    chunk_overlap=chunk_overlap,
                )
            else:
                # 默认使用递归字符分块器
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







