"""
向量存储服务
使用 ChromaDB 作为向量数据库，全部使用持久化存储
"""

import os
import json
from typing import List, Dict, Any, Optional
import chromadb
from chromadb.config import Settings
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
        self.client: Optional[chromadb.Client] = None
        self.collection: Optional[chromadb.Collection] = None
        self.metadata: Dict[str, Dict[str, Any]] = {}
        self.next_id = 0
    
    def initialize(self):
        """初始化数据库和集合"""
        if self.collection is None:
            raise ValueError("Collection not initialized. Subclass should implement this.")
    
    def add_documents(
        self,
        texts: List[str],
        embeddings: List[List[float]],
        metadatas: List[Dict[str, Any]]
    ) -> List[str]:
        """
        添加文档到向量存储
        
        Args:
            texts: 文本列表
            embeddings: 向量列表
            metadatas: 元数据列表
        
        Returns:
            文档ID列表
        """
        if self.collection is None:
            self.initialize()
        
        if len(texts) != len(embeddings) or len(texts) != len(metadatas):
            raise ValueError("texts, embeddings, and metadatas must have the same length")
        
        ids = []
        
        for i, (text, embedding, metadata) in enumerate(zip(texts, embeddings, metadatas)):
            doc_id = str(self.next_id)
            self.next_id += 1
            ids.append(doc_id)
            
            # 存储元数据
            self.metadata[doc_id] = {
                **metadata,
                "text": text,
                "id": doc_id
            }
        
        # 准备ChromaDB格式的元数据（只包含可序列化的值）
        chroma_metadatas = []
        for metadata in metadatas:
            chroma_metadata = {}
            for key, value in metadata.items():
                # ChromaDB只支持str, int, float, bool类型
                if isinstance(value, (str, int, float, bool, type(None))):
                    chroma_metadata[key] = value
                else:
                    # 其他类型转换为字符串
                    chroma_metadata[key] = str(value)
            chroma_metadatas.append(chroma_metadata)
        
        # 添加到ChromaDB集合
        try:
            self.collection.add(
                ids=ids,
                embeddings=embeddings,
                documents=texts,
                metadatas=chroma_metadatas
            )
        except Exception as e:
            print(f"[VectorStore] 添加文档错误: {e}")
            raise e
        
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
        if self.collection is None:
            return []
        
        # 构建ChromaDB的where过滤条件
        where_clause = None
        if filter_metadata:
            where_clause = {}
            for key, value in filter_metadata.items():
                # ChromaDB的where条件格式
                if isinstance(value, str):
                    where_clause[key] = value
                elif isinstance(value, (int, float, bool)):
                    where_clause[key] = value
                else:
                    # 其他类型转换为字符串
                    where_clause[key] = str(value)
            print(f"[VectorStore] 搜索过滤条件: {where_clause}")
        
        # 执行搜索
        try:
            if where_clause:
                print(f"[VectorStore] 执行带过滤条件的搜索，top_k={top_k}")
                results = self.collection.query(
                    query_embeddings=[query_embedding],
                    n_results=top_k,
                    where=where_clause
                )
            else:
                print(f"[VectorStore] 执行无过滤条件的搜索，top_k={top_k}")
                results = self.collection.query(
                    query_embeddings=[query_embedding],
                    n_results=top_k
                )
            
            print(f"[VectorStore] 搜索结果数量: {len(results['ids'][0]) if results['ids'] and len(results['ids']) > 0 else 0}")
        except Exception as e:
            print(f"[VectorStore] 搜索错误: {e}")
            import traceback
            traceback.print_exc()
            return []
        
        # 转换结果
        search_results = []
        
        if not results['ids'] or len(results['ids']) == 0 or len(results['ids'][0]) == 0:
            return []
        
        # 获取结果数据
        result_ids = results['ids'][0]
        result_documents = results['documents'][0] if results.get('documents') and len(results['documents']) > 0 else []
        result_metadatas = results['metadatas'][0] if results.get('metadatas') and len(results['metadatas']) > 0 else []
        result_distances = results['distances'][0] if results.get('distances') and len(results['distances']) > 0 else []
        
        # 遍历每个结果
        for i, doc_id in enumerate(result_ids):
            # 获取文档内容
            text_content = result_documents[i] if i < len(result_documents) else ""
            if text_content is None:
                text_content = ""
            
            # 获取元数据
            row_metadata = result_metadatas[i] if i < len(result_metadatas) else {}
            # 合并存储的元数据
            stored_metadata = self.metadata.get(doc_id, {})
            merged_metadata = {**stored_metadata, **row_metadata}
            # 移除不需要的字段
            final_metadata = {k: v for k, v in merged_metadata.items() if k not in ["text", "id"]}
            
            # 获取距离（ChromaDB返回的是距离，越小越相似）
            distance = result_distances[i] if i < len(result_distances) else 1.0
            
            # 构建结果字典
            result = {
                "id": doc_id,
                "text": text_content,
                "metadata": final_metadata,
                "score": float(distance)  # ChromaDB返回距离，稍后转换为相似度分数
            }
            
            search_results.append(result)
        
        # 按距离排序（距离越小，相似度越高）
        search_results.sort(key=lambda x: x["score"], reverse=False)
        
        # 将距离转换为相似度分数（1 / (1 + distance)）
        for result in search_results:
            distance = result["score"]
            result["score"] = float(1.0 / (1.0 + distance))
        
        return search_results[:top_k]
    
    def delete(self, ids: List[str]) -> bool:
        """
        删除文档
        
        Args:
            ids: 文档ID列表
        
        Returns:
            是否成功
        """
        if self.collection is None:
            return False
        
        try:
            # ChromaDB支持直接删除
            self.collection.delete(ids=ids)
            # 从元数据中删除
            for doc_id in ids:
                if doc_id in self.metadata:
                    del self.metadata[doc_id]
            return True
        except Exception as e:
            print(f"Delete error: {e}")
            return False
    
    def clear(self):
        """清空存储"""
        if self.collection is not None:
            try:
                # 获取所有ID
                all_results = self.collection.get()
                if all_results and all_results.get('ids'):
                    self.collection.delete(ids=all_results['ids'])
            except Exception as e:
                print(f"Clear error: {e}")
        self.metadata.clear()
        self.next_id = 0
    
    def count(self) -> int:
        """获取文档数量"""
        if self.collection is None:
            return 0
        try:
            # 获取所有数据并计算数量
            all_data = self.collection.get()
            if all_data and all_data.get('ids'):
                return len(all_data['ids'])
            return 0
        except Exception:
            return 0
    
    def get_ids_by_metadata(self, filter_metadata: Optional[Dict[str, Any]] = None) -> List[str]:
        """
        根据元数据过滤条件查询向量ID
        
        Args:
            filter_metadata: 元数据过滤条件，例如 {"filePath": "path/to/file"} 或 {"knowledgeBaseId": "kb_id"}
        
        Returns:
            匹配的向量ID列表
        """
        if self.collection is None:
            return []
        
        try:
            # 构建ChromaDB的where过滤条件
            where_clause = None
            if filter_metadata:
                where_clause = {}
                for key, value in filter_metadata.items():
                    # ChromaDB的where条件格式
                    if isinstance(value, str):
                        where_clause[key] = value
                    elif isinstance(value, (int, float, bool)):
                        where_clause[key] = value
                    else:
                        # 其他类型转换为字符串
                        where_clause[key] = str(value)
            
            # 查询匹配的向量
            results = self.collection.get(
                where=where_clause,
                include=[]  # 只返回ID，不返回其他数据
            )
            
            if results and results.get('ids'):
                return results['ids']
            return []
        except Exception as e:
            print(f"[VectorStore] 查询向量ID错误: {e}")
            return []


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
        self.metadata_path = os.path.join(storage_path, "metadata.json")
        self.collection_name = "documents"
        
        # 确保目录存在
        os.makedirs(storage_path, exist_ok=True)
        
        # 初始化ChromaDB客户端（持久化）
        self.client = chromadb.PersistentClient(
            path=storage_path,
            settings=Settings(
                anonymized_telemetry=False,
                allow_reset=True
            )
        )
        
        # 加载现有数据
        self.load()
    
    def initialize(self):
        """初始化集合"""
        if self.collection is None:
            # 获取或创建集合
            try:
                self.collection = self.client.get_or_create_collection(
                    name=self.collection_name
                )
            except Exception as e:
                print(f"[PersistentVectorStore] 创建集合错误: {e}")
                raise e
    
    def save(self):
        """保存元数据到磁盘"""
        # ChromaDB会自动持久化数据，这里只保存额外的元数据
        with open(self.metadata_path, 'w', encoding='utf-8') as f:
            json.dump(self.metadata, f, ensure_ascii=False, indent=2)
    
    def load(self):
        """从磁盘加载"""
        # 加载元数据
        if os.path.exists(self.metadata_path):
            try:
                with open(self.metadata_path, 'r', encoding='utf-8') as f:
                    self.metadata = json.load(f)
                
                # 更新下一个ID
                if self.metadata:
                    max_id = 0
                    for key in self.metadata.keys():
                        try:
                            id_int = int(key)
                            if id_int > max_id:
                                max_id = id_int
                        except:
                            pass
                    self.next_id = max_id + 1
                else:
                    self.next_id = 0
            except Exception as e:
                print(f"Error loading metadata: {e}")
                self.metadata = {}
                self.next_id = 0
        
        # 初始化集合
        self.initialize()
        
        # 从ChromaDB加载现有数据，更新next_id
        try:
            all_data = self.collection.get()
            if all_data and all_data.get('ids'):
                max_id = 0
                for doc_id in all_data['ids']:
                    try:
                        id_int = int(doc_id)
                        if id_int > max_id:
                            max_id = id_int
                    except:
                        pass
                if max_id >= self.next_id:
                    self.next_id = max_id + 1
        except Exception as e:
            print(f"Error loading existing IDs from ChromaDB: {e}")
    
    def add_documents(
        self,
        texts: List[str],
        embeddings: List[List[float]],
        metadatas: List[Dict[str, Any]]
    ) -> List[str]:
        """添加文档并保存"""
        ids = super().add_documents(texts, embeddings, metadatas)
        self.save()
        return ids
    
    def delete(self, ids: List[str]) -> bool:
        """删除文档并保存"""
        result = super().delete(ids)
        if result:
            self.save()
        return result
    
    def clear(self):
        """清空存储并保存"""
        super().clear()
        if os.path.exists(self.metadata_path):
            os.remove(self.metadata_path)


class VectorStoreService:
    """向量存储服务管理器"""
    
    def __init__(self, persistent_storage_path: str, dimension: int = 1024):
        """
        初始化向量存储服务
        
        Args:
            persistent_storage_path: 持久化存储路径（必需）
            dimension: 向量维度
        """
        
        self.dimension = dimension
        self.persistent_store: PersistentVectorStore = PersistentVectorStore(persistent_storage_path, dimension)
        self.embedding_service = get_embedding_service()
    
    def get_persistent_store(self) -> PersistentVectorStore:
        """获取持久化存储"""
        return self.persistent_store
    
    def add_documents(
        self,
        texts: List[str],
        metadatas: List[Dict[str, Any]],
        model_name: Optional[str] = None
    ) -> List[str]:
        """
        添加文档到向量存储
        
        Args:
            texts: 文本列表
            metadatas: 元数据列表
            model_name: 模型名称
        
        Returns:
            文档ID列表
        """
        # 生成向量
        embedding_result = self.embedding_service.embed_texts(texts, model_name)
        if not embedding_result.get("success"):
            raise ValueError(f"Failed to generate embeddings: {embedding_result.get('error')}")
        
        embeddings = embedding_result["embeddings"]
        
        # 添加到持久化存储
        return self.persistent_store.add_documents(texts, embeddings, metadatas)
    
    def search(
        self,
        query: str,
        top_k: int = 5,
        model_name: Optional[str] = None,
        filter_metadata: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """
        搜索向量存储
        
        Args:
            query: 查询文本
            top_k: 返回前K个结果
            model_name: 模型名称
            filter_metadata: 元数据过滤条件
        
        Returns:
            搜索结果
        """
        print(f"[VectorStoreService.search] 开始搜索:")
        print(f"  - query: {query}")
        print(f"  - top_k: {top_k}")
        print(f"  - model_name: {model_name}")
        print(f"  - filter_metadata: {filter_metadata}")
        
        # 生成查询向量
        embedding_result = self.embedding_service.embed_text(query, model_name)
        if not embedding_result.get("success"):
            raise ValueError(f"Failed to generate query embedding: {embedding_result.get('error')}")
        
        query_embedding = embedding_result["embedding"]
        print(f"[VectorStoreService.search] 查询向量生成成功，维度: {len(query_embedding)}")
        
        # 搜索持久化存储
        print(f"[VectorStoreService.search] 开始搜索持久化存储...")
        results = self.persistent_store.search(query_embedding, top_k, filter_metadata)
        print(f"[VectorStoreService.search] 搜索结果数量: {len(results)}")
        
        return results


# 全局实例
_vector_store_service = None


def get_vector_store_service(
    persistent_storage_path: str,
    dimension: int = 1024
) -> VectorStoreService:
    """获取向量存储服务实例"""
    global _vector_store_service
    if _vector_store_service is None:
        _vector_store_service = VectorStoreService(persistent_storage_path, dimension)
    return _vector_store_service
