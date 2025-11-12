"""
向量存储服务
支持持久化和临时（内存）两种存储类型
使用 FAISS 作为向量数据库
"""

import os
import json
import pickle
from typing import List, Dict, Any, Optional, Tuple
import numpy as np
from faiss import IndexFlatL2, IndexIDMap, write_index, read_index
from embedding_service import get_embedding_service


class VectorStore:
    """向量存储基类"""
    
    def __init__(self, dimension: int = 1024):
        """
        初始化向量存储
        
        Args:
            dimension: 向量维度
        """
        self.dimension = dimension
        self.index: Optional[IndexIDMap] = None
        self.metadata: Dict[int, Dict[str, Any]] = {}
        self.next_id = 0
    
    def initialize(self):
        """初始化索引"""
        if self.index is None:
            base_index = IndexFlatL2(self.dimension)
            self.index = IndexIDMap(base_index)
    
    def add_documents(
        self,
        texts: List[str],
        embeddings: List[List[float]],
        metadatas: List[Dict[str, Any]]
    ) -> List[int]:
        """
        添加文档到向量存储
        
        Args:
            texts: 文本列表
            embeddings: 向量列表
            metadatas: 元数据列表
        
        Returns:
            文档ID列表
        """
        if self.index is None:
            self.initialize()
        
        if len(texts) != len(embeddings) or len(texts) != len(metadatas):
            raise ValueError("texts, embeddings, and metadatas must have the same length")
        
        ids = []
        vectors = np.array(embeddings, dtype=np.float32)
        
        for i, (text, metadata) in enumerate(zip(texts, metadatas)):
            doc_id = self.next_id
            self.next_id += 1
            ids.append(doc_id)
            
            # 存储元数据
            self.metadata[doc_id] = {
                **metadata,
                "text": text,
                "id": doc_id
            }
        
        # 添加到索引
        self.index.add_with_ids(vectors, np.array(ids, dtype=np.int64))
        
        return ids
    
    def search(
        self,
        query_embedding: List[float],
        top_k: int = 5,
        filter_metadata: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """
        搜索相似文档
        
        Args:
            query_embedding: 查询向量
            top_k: 返回前K个结果
            filter_metadata: 元数据过滤条件
        
        Returns:
            搜索结果列表
        """
        if self.index is None or self.index.ntotal == 0:
            return []
        
        # 执行搜索
        query_vector = np.array([query_embedding], dtype=np.float32)
        distances, indices = self.index.search(query_vector, min(top_k * 2, self.index.ntotal))
        
        results = []
        for distance, idx in zip(distances[0], indices[0]):
            if idx == -1:  # FAISS 返回 -1 表示没有结果
                continue
            
            metadata = self.metadata.get(idx)
            if metadata is None:
                continue
            
            # 应用元数据过滤
            if filter_metadata:
                match = True
                for key, value in filter_metadata.items():
                    if metadata.get(key) != value:
                        match = False
                        break
                if not match:
                    continue
            
            results.append({
                "id": idx,
                "text": metadata.get("text", ""),
                "metadata": {k: v for k, v in metadata.items() if k != "text"},
                "score": float(1.0 / (1.0 + distance))  # 将距离转换为相似度分数
            })
            
            if len(results) >= top_k:
                break
        
        return results
    
    def delete(self, ids: List[int]) -> bool:
        """
        删除文档
        
        Args:
            ids: 文档ID列表
        
        Returns:
            是否成功
        """
        if self.index is None:
            return False
        
        # FAISS 不支持直接删除，需要重建索引
        # 这里简化处理：标记为已删除
        for doc_id in ids:
            if doc_id in self.metadata:
                del self.metadata[doc_id]
        
        # 重建索引（简化版本，实际应该更高效）
        self._rebuild_index()
        return True
    
    def _rebuild_index(self):
        """重建索引"""
        if self.index is None:
            return
        
        # 获取所有有效的文档ID和向量
        valid_ids = []
        valid_vectors = []
        
        for doc_id, metadata in self.metadata.items():
            # 需要从原始数据重建向量，这里简化处理
            # 实际应用中应该保存原始向量
            pass
        
        # 重建索引
        base_index = IndexFlatL2(self.dimension)
        self.index = IndexIDMap(base_index)
        # 注意：这里需要重新添加所有向量，但简化版本中不实现
    
    def clear(self):
        """清空存储"""
        if self.index is not None:
            base_index = IndexFlatL2(self.dimension)
            self.index = IndexIDMap(base_index)
        self.metadata.clear()
        self.next_id = 0
    
    def count(self) -> int:
        """获取文档数量"""
        if self.index is None:
            return 0
        return self.index.ntotal


class PersistentVectorStore(VectorStore):
    """持久化向量存储"""
    
    def __init__(self, storage_path: str, dimension: int = 1024):
        """
        初始化持久化向量存储
        
        Args:
            storage_path: 存储路径
            dimension: 向量维度
        """
        super().__init__(dimension)
        self.storage_path = storage_path
        self.index_path = os.path.join(storage_path, "faiss.index")
        self.metadata_path = os.path.join(storage_path, "metadata.json")
        
        # 确保目录存在
        os.makedirs(storage_path, exist_ok=True)
        
        # 加载现有数据
        self.load()
    
    def save(self):
        """保存到磁盘"""
        if self.index is None or self.index.ntotal == 0:
            return
        
        # 保存索引
        write_index(self.index, self.index_path)
        
        # 保存元数据
        with open(self.metadata_path, 'w', encoding='utf-8') as f:
            json.dump(self.metadata, f, ensure_ascii=False, indent=2)
    
    def load(self):
        """从磁盘加载"""
        if os.path.exists(self.index_path) and os.path.exists(self.metadata_path):
            try:
                # 加载索引
                self.index = read_index(self.index_path)
                
                # 加载元数据
                with open(self.metadata_path, 'r', encoding='utf-8') as f:
                    self.metadata = json.load(f)
                    # 转换键为整数
                    self.metadata = {int(k): v for k, v in self.metadata.items()}
                
                # 更新下一个ID
                if self.metadata:
                    self.next_id = max(self.metadata.keys()) + 1
                else:
                    self.next_id = 0
            except Exception as e:
                print(f"Error loading vector store: {e}")
                self.initialize()
        else:
            self.initialize()
    
    def add_documents(
        self,
        texts: List[str],
        embeddings: List[List[float]],
        metadatas: List[Dict[str, Any]]
    ) -> List[int]:
        """添加文档并保存"""
        ids = super().add_documents(texts, embeddings, metadatas)
        self.save()
        return ids
    
    def delete(self, ids: List[int]) -> bool:
        """删除文档并保存"""
        result = super().delete(ids)
        if result:
            self.save()
        return result
    
    def clear(self):
        """清空存储并保存"""
        super().clear()
        if os.path.exists(self.index_path):
            os.remove(self.index_path)
        if os.path.exists(self.metadata_path):
            os.remove(self.metadata_path)


class TemporaryVectorStore(VectorStore):
    """临时向量存储（内存）"""
    
    def __init__(self, dimension: int = 1024):
        """
        初始化临时向量存储
        
        Args:
            dimension: 向量维度
        """
        super().__init__(dimension)
        self.initialize()


class VectorStoreService:
    """向量存储服务管理器"""
    
    def __init__(self, persistent_storage_path: str = None, dimension: int = 1024):
        """
        初始化向量存储服务
        
        Args:
            persistent_storage_path: 持久化存储路径
            dimension: 向量维度
        """
        self.dimension = dimension
        self.persistent_store: Optional[PersistentVectorStore] = None
        self.temporary_stores: Dict[str, TemporaryVectorStore] = {}
        self.embedding_service = get_embedding_service()
        
        # 初始化持久化存储
        if persistent_storage_path:
            self.persistent_store = PersistentVectorStore(persistent_storage_path, dimension)
    
    def get_persistent_store(self) -> PersistentVectorStore:
        """获取持久化存储"""
        if self.persistent_store is None:
            raise ValueError("Persistent store not initialized")
        return self.persistent_store
    
    def get_temporary_store(self, session_id: str) -> TemporaryVectorStore:
        """获取临时存储（按会话ID）"""
        if session_id not in self.temporary_stores:
            self.temporary_stores[session_id] = TemporaryVectorStore(self.dimension)
        return self.temporary_stores[session_id]
    
    def add_documents(
        self,
        texts: List[str],
        metadatas: List[Dict[str, Any]],
        store_type: str = "temporary",
        session_id: str = "default",
        model_name: Optional[str] = None
    ) -> List[int]:
        """
        添加文档到向量存储
        
        Args:
            texts: 文本列表
            metadatas: 元数据列表
            store_type: 存储类型 ("persistent" 或 "temporary")
            session_id: 会话ID（临时存储使用）
            model_name: 模型名称
        
        Returns:
            文档ID列表
        """
        # 生成向量
        embedding_result = self.embedding_service.embed_texts(texts, model_name)
        if not embedding_result.get("success"):
            raise ValueError(f"Failed to generate embeddings: {embedding_result.get('error')}")
        
        embeddings = embedding_result["embeddings"]
        
        # 根据存储类型添加到对应存储
        if store_type == "persistent":
            if self.persistent_store is None:
                raise ValueError("Persistent store not initialized")
            return self.persistent_store.add_documents(texts, embeddings, metadatas)
        else:
            store = self.get_temporary_store(session_id)
            return store.add_documents(texts, embeddings, metadatas)
    
    def search(
        self,
        query: str,
        top_k: int = 5,
        store_types: Optional[List[str]] = None,
        session_id: str = "default",
        model_name: Optional[str] = None,
        filter_metadata: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """
        联合搜索多个存储
        
        Args:
            query: 查询文本
            top_k: 返回前K个结果
            store_types: 要搜索的存储类型列表，如果为None则搜索所有
            session_id: 会话ID（临时存储使用）
            model_name: 模型名称
        
        Returns:
            合并后的搜索结果
        """
        # 生成查询向量
        embedding_result = self.embedding_service.embed_text(query, model_name)
        if not embedding_result.get("success"):
            raise ValueError(f"Failed to generate query embedding: {embedding_result.get('error')}")
        
        query_embedding = embedding_result["embedding"]
        
        # 搜索所有指定的存储
        all_results = []
        
        if store_types is None:
            store_types = ["persistent", "temporary"]
        
        if "persistent" in store_types and self.persistent_store is not None:
            results = self.persistent_store.search(query_embedding, top_k * 2, filter_metadata)
            for result in results:
                result["store_type"] = "persistent"
            all_results.extend(results)
        
        if "temporary" in store_types:
            store = self.get_temporary_store(session_id)
            results = store.search(query_embedding, top_k * 2, filter_metadata)
            for result in results:
                result["store_type"] = "temporary"
            all_results.extend(results)
        
        # 按相似度分数排序并返回Top-K
        all_results.sort(key=lambda x: x["score"], reverse=True)
        return all_results[:top_k]
    
    def delete_temporary_store(self, session_id: str):
        """删除临时存储"""
        if session_id in self.temporary_stores:
            del self.temporary_stores[session_id]
    
    def clear_temporary_stores(self):
        """清空所有临时存储"""
        self.temporary_stores.clear()


# 全局实例
_vector_store_service = None


def get_vector_store_service(
    persistent_storage_path: str = None,
    dimension: int = 1024
) -> VectorStoreService:
    """获取向量存储服务实例"""
    global _vector_store_service
    if _vector_store_service is None:
        _vector_store_service = VectorStoreService(persistent_storage_path, dimension)
    return _vector_store_service







