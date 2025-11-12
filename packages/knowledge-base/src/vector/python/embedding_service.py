"""
向量嵌入服务 - 使用 sentence-transformers
提供模型管理和文本向量化功能
"""

from typing import List, Dict, Any, Optional
from sentence_transformers import SentenceTransformer
import numpy as np


class EmbeddingService:
    """向量嵌入服务"""
    
    def __init__(self, default_model: str = "BAAI/bge-large-zh-v1.5"):
        """
        初始化嵌入服务
        
        Args:
            default_model: 默认模型名称
        """
        self.default_model = default_model
        self.models: Dict[str, SentenceTransformer] = {}
        self.current_model_name: Optional[str] = None
    
    def load_model(self, model_name: Optional[str] = None) -> Dict[str, Any]:
        """
        加载模型
        
        Args:
            model_name: 模型名称，如果为 None 则使用默认模型
        
        Returns:
            模型信息字典
        """
        if model_name is None:
            model_name = self.default_model
        
        # 如果模型已加载，直接返回
        if model_name in self.models:
            self.current_model_name = model_name
            return {
                "model_name": model_name,
                "status": "loaded",
                "dimension": self.models[model_name].get_sentence_embedding_dimension()
            }
        
        try:
            # 加载模型
            model = SentenceTransformer(model_name)
            self.models[model_name] = model
            self.current_model_name = model_name
            
            return {
                "model_name": model_name,
                "status": "loaded",
                "dimension": model.get_sentence_embedding_dimension()
            }
        except Exception as e:
            return {
                "model_name": model_name,
                "status": "error",
                "error": str(e)
            }
    
    def unload_model(self, model_name: str) -> Dict[str, Any]:
        """
        卸载模型
        
        Args:
            model_name: 模型名称
        
        Returns:
            操作结果
        """
        if model_name in self.models:
            del self.models[model_name]
            if self.current_model_name == model_name:
                self.current_model_name = None
            return {
                "model_name": model_name,
                "status": "unloaded"
            }
        else:
            return {
                "model_name": model_name,
                "status": "not_found"
            }
    
    def get_current_model(self) -> Optional[str]:
        """
        获取当前使用的模型名称
        
        Returns:
            模型名称
        """
        return self.current_model_name
    
    def list_models(self) -> List[str]:
        """
        列出已加载的模型
        
        Returns:
            模型名称列表
        """
        return list(self.models.keys())
    
    def embed_text(self, text: str, model_name: Optional[str] = None) -> Dict[str, Any]:
        """
        对单个文本进行向量化
        
        Args:
            text: 要向量化的文本
            model_name: 模型名称，如果为 None 则使用当前模型或默认模型
        
        Returns:
            向量化结果
        """
        # 确保模型已加载
        if model_name is None:
            model_name = self.current_model_name or self.default_model
        
        if model_name not in self.models:
            load_result = self.load_model(model_name)
            if load_result.get("status") != "loaded":
                return {
                    "success": False,
                    "error": f"Failed to load model: {load_result.get('error', 'Unknown error')}"
                }
        
        try:
            model = self.models[model_name]
            embedding = model.encode(text, normalize_embeddings=True)
            
            return {
                "success": True,
                "embedding": embedding.tolist(),
                "dimension": len(embedding),
                "model_name": model_name
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }
    
    def embed_texts(self, texts: List[str], model_name: Optional[str] = None) -> Dict[str, Any]:
        """
        对多个文本进行向量化
        
        Args:
            texts: 要向量化的文本列表
            model_name: 模型名称，如果为 None 则使用当前模型或默认模型
        
        Returns:
            向量化结果
        """
        # 确保模型已加载
        if model_name is None:
            model_name = self.current_model_name or self.default_model
        
        if model_name not in self.models:
            load_result = self.load_model(model_name)
            if load_result.get("status") != "loaded":
                return {
                    "success": False,
                    "error": f"Failed to load model: {load_result.get('error', 'Unknown error')}"
                }
        
        try:
            model = self.models[model_name]
            embeddings = model.encode(texts, normalize_embeddings=True)
            
            return {
                "success": True,
                "embeddings": embeddings.tolist(),
                "dimension": embeddings.shape[1] if len(embeddings.shape) > 1 else len(embeddings[0]),
                "count": len(texts),
                "model_name": model_name
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }
    
    def compute_similarity(
        self,
        embeddings1: List[List[float]],
        embeddings2: List[List[float]],
        similarity_type: str = "cosine"
    ) -> Dict[str, Any]:
        """
        计算两个向量列表之间的相似度
        
        Args:
            embeddings1: 第一个向量列表
            embeddings2: 第二个向量列表
            similarity_type: 相似度类型 (cosine, dot_product, euclidean)
        
        Returns:
            相似度矩阵
        """
        try:
            emb1 = np.array(embeddings1)
            emb2 = np.array(embeddings2)
            
            if similarity_type == "cosine":
                # 余弦相似度
                similarity = np.dot(emb1, emb2.T) / (
                    np.linalg.norm(emb1, axis=1, keepdims=True) *
                    np.linalg.norm(emb2, axis=1, keepdims=True).T
                )
            elif similarity_type == "dot_product":
                # 点积
                similarity = np.dot(emb1, emb2.T)
            elif similarity_type == "euclidean":
                # 欧氏距离（转换为相似度）
                distances = np.linalg.norm(emb1[:, np.newaxis] - emb2, axis=2)
                similarity = 1 / (1 + distances)
            else:
                return {
                    "success": False,
                    "error": f"Unknown similarity type: {similarity_type}"
                }
            
            return {
                "success": True,
                "similarity": similarity.tolist(),
                "similarity_type": similarity_type
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }


# 全局实例
_embedding_service = None


def get_embedding_service(default_model: str = "BAAI/bge-large-zh-v1.5") -> EmbeddingService:
    """获取嵌入服务实例"""
    global _embedding_service
    if _embedding_service is None:
        _embedding_service = EmbeddingService(default_model)
    return _embedding_service







