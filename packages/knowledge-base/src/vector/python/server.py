"""
Python 向量服务 - 主服务器
提供文本分块、向量化等功能
"""

import json
import sys
import os
from typing import Dict, Any, Optional
from chunk_service import get_chunk_service
from embedding_service import get_embedding_service
from vector_store_service import get_vector_store_service


class VectorService:
    """向量服务主类"""
    
    def __init__(self):
        self.chunk_service = get_chunk_service()
        self.embedding_service = get_embedding_service()
        
        # 初始化向量存储服务
        # 持久化存储路径：从环境变量或默认路径获取
        persistent_path = os.environ.get(
            "VECTOR_STORE_PATH",
            os.path.join(os.path.expanduser("~"), ".note-studio", "vector-store")
        )
        self.vector_store_service = get_vector_store_service(
            persistent_storage_path=persistent_path,
            dimension=1024  # 默认维度，实际应该从模型获取
        )
    
    def handle_request(self, request: Dict[str, Any]) -> Dict[str, Any]:
        """
        处理请求
        
        Args:
            request: 请求字典，包含 method 和 params
        
        Returns:
            响应字典
        """
        method = request.get("method")
        params = request.get("params", {})
        
        try:
            if method == "chunk_text":
                result = self.chunk_service.chunk_text(
                    text=params.get("text", ""),
                    chunk_size=params.get("chunk_size", 1000),
                    chunk_overlap=params.get("chunk_overlap", 200),
                    strategy=params.get("strategy", "recursive"),
                    **params.get("kwargs", {})
                )
                return {
                    "success": True,
                    "result": result
                }
            
            elif method == "chunk_documents":
                result = self.chunk_service.chunk_documents(
                    documents=params.get("documents", []),
                    chunk_size=params.get("chunk_size", 1000),
                    chunk_overlap=params.get("chunk_overlap", 200),
                    strategy=params.get("strategy", "recursive"),
                    **params.get("kwargs", {})
                )
                return {
                    "success": True,
                    "result": result
                }
            
            # Embedding 相关方法
            elif method == "load_model":
                result = self.embedding_service.load_model(
                    model_name=params.get("model_name")
                )
                return {
                    "success": True,
                    "result": result
                }
            
            elif method == "unload_model":
                result = self.embedding_service.unload_model(
                    model_name=params.get("model_name")
                )
                return {
                    "success": True,
                    "result": result
                }
            
            elif method == "get_current_model":
                model_name = self.embedding_service.get_current_model()
                return {
                    "success": True,
                    "result": model_name
                }
            
            elif method == "list_models":
                models = self.embedding_service.list_models()
                return {
                    "success": True,
                    "result": models
                }
            
            elif method == "embed_text":
                result = self.embedding_service.embed_text(
                    text=params.get("text", ""),
                    model_name=params.get("model_name")
                )
                return result
            
            elif method == "embed_texts":
                result = self.embedding_service.embed_texts(
                    texts=params.get("texts", []),
                    model_name=params.get("model_name")
                )
                return result
            
            elif method == "compute_similarity":
                result = self.embedding_service.compute_similarity(
                    embeddings1=params.get("embeddings1", []),
                    embeddings2=params.get("embeddings2", []),
                    similarity_type=params.get("similarity_type", "cosine")
                )
                return result
            
            # 向量存储相关方法
            elif method == "add_documents_to_store":
                texts = params.get("texts", [])
                metadatas = params.get("metadatas", [])
                store_type = params.get("store_type", "temporary")
                session_id = params.get("session_id", "default")
                model_name = params.get("model_name")
                
                ids = self.vector_store_service.add_documents(
                    texts=texts,
                    metadatas=metadatas,
                    store_type=store_type,
                    session_id=session_id,
                    model_name=model_name
                )
                return {
                    "success": True,
                    "result": ids
                }
            
            elif method == "search_vector_store":
                query = params.get("query", "")
                top_k = params.get("top_k", 5)
                store_types = params.get("store_types")
                session_id = params.get("session_id", "default")
                model_name = params.get("model_name")
                filter_metadata = params.get("filter_metadata")
                
                results = self.vector_store_service.search(
                    query=query,
                    top_k=top_k,
                    store_types=store_types,
                    session_id=session_id,
                    model_name=model_name,
                    filter_metadata=filter_metadata
                )
                return {
                    "success": True,
                    "result": results
                }
            
            elif method == "delete_from_store":
                ids = params.get("ids", [])
                store_type = params.get("store_type", "temporary")
                session_id = params.get("session_id", "default")
                
                if store_type == "persistent":
                    store = self.vector_store_service.get_persistent_store()
                else:
                    store = self.vector_store_service.get_temporary_store(session_id)
                
                result = store.delete(ids)
                return {
                    "success": result,
                    "result": result
                }
            
            elif method == "clear_temporary_store":
                session_id = params.get("session_id", "default")
                self.vector_store_service.delete_temporary_store(session_id)
                return {
                    "success": True,
                    "result": True
                }
            
            elif method == "clear_all_temporary_stores":
                self.vector_store_service.clear_temporary_stores()
                return {
                    "success": True,
                    "result": True
                }
            
            else:
                return {
                    "success": False,
                    "error": f"Unknown method: {method}"
                }
        
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }


def main():
    """主函数 - 从标准输入读取 JSON 请求，输出 JSON 响应"""
    service = VectorService()
    
    for line in sys.stdin:
        try:
            request = json.loads(line.strip())
            response = service.handle_request(request)
            print(json.dumps(response))
            sys.stdout.flush()
        except json.JSONDecodeError as e:
            error_response = {
                "success": False,
                "error": f"Invalid JSON: {str(e)}"
            }
            print(json.dumps(error_response))
            sys.stdout.flush()
        except Exception as e:
            error_response = {
                "success": False,
                "error": str(e)
            }
            print(json.dumps(error_response))
            sys.stdout.flush()


if __name__ == "__main__":
    main()

