"""
Python 向量服务 - 主服务器
提供文本分块、向量化等功能
"""

import json
import sys
import os
from typing import Dict, Any, Optional

# 确保当前目录在 Python 路径中，以便导入同目录下的模块
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

from chunk_service import get_chunk_service
from embedding_service import get_embedding_service
from vector_store_service import get_vector_store_service
from file_parser_service import get_file_parser_service


def sanitize_for_json(obj: Any) -> Any:
    """
    清理对象中的无效 UTF-8 字符，确保可以安全地序列化为 JSON
    
    Args:
        obj: 要清理的对象
        
    Returns:
        清理后的对象
    """
    if isinstance(obj, str):
        # 首先尝试使用错误处理来替换无效字符
        try:
            # 使用 'replace' 错误处理来替换无效的 UTF-8 字节序列
            cleaned = obj.encode('utf-8', errors='replace').decode('utf-8', errors='replace')
        except (UnicodeEncodeError, UnicodeDecodeError):
            # 如果仍然失败，使用 'ignore' 来忽略无效字符
            try:
                cleaned = obj.encode('utf-8', errors='ignore').decode('utf-8', errors='ignore')
            except:
                # 最后的备选方案：返回空字符串
                cleaned = ''
        
        # 移除无效的 Unicode 代理对和替换字符
        # 高代理: U+D800 to U+DBFF
        # 低代理: U+DC00 to U+DFFF
        # 替换字符: U+FFFD (通常由错误处理产生)
        result = ''
        i = 0
        while i < len(cleaned):
            char = cleaned[i]
            try:
                code = ord(char)
                # 跳过替换字符（U+FFFD）
                if code == 0xFFFD:
                    i += 1
                    continue
                # 检查是否是无效的代理对
                if 0xD800 <= code <= 0xDBFF:
                    # 高代理，检查下一个字符是否是低代理
                    if i + 1 < len(cleaned):
                        try:
                            next_code = ord(cleaned[i + 1])
                            if 0xDC00 <= next_code <= 0xDFFF:
                                # 有效的代理对，保留
                                result += char + cleaned[i + 1]
                                i += 2
                                continue
                        except:
                            pass
                    # 无效的高代理，跳过
                    i += 1
                    continue
                elif 0xDC00 <= code <= 0xDFFF:
                    # 单独的低代理，跳过
                    i += 1
                    continue
                else:
                    # 正常字符，保留
                    result += char
                    i += 1
            except:
                # 如果无法获取字符代码，跳过该字符
                i += 1
                continue
        
        # 最后，移除任何可能导致 JSON 序列化问题的控制字符
        # 保留常见的控制字符（如换行符、制表符），但移除其他控制字符
        final_result = ''
        for char in result:
            try:
                code = ord(char)
                # 保留常见的空白字符和控制字符（换行、制表符等）
                if code < 32 and code not in (9, 10, 13):  # 保留制表符、换行符、回车符
                    continue
                # 移除其他可能导致问题的字符
                if 0x7F <= code < 0xA0:  # DEL 和 C1 控制字符
                    continue
                # 保留字符（已经过前面的清理步骤）
                final_result += char
            except (ValueError, TypeError):
                # 如果无法获取字符代码，跳过该字符
                continue
        
        return final_result
    elif isinstance(obj, dict):
        return {key: sanitize_for_json(value) for key, value in obj.items()}
    elif isinstance(obj, list):
        return [sanitize_for_json(item) for item in obj]
    else:
        return obj


def safe_json_dumps(obj: Any, max_retries: int = 3) -> str:
    """
    安全地序列化对象为 JSON 字符串，带有多层错误处理和验证
    
    Args:
        obj: 要序列化的对象
        max_retries: 最大重试次数
        
    Returns:
        JSON 字符串
    """
    # 首先清理对象
    sanitized = sanitize_for_json(obj)
    
    for attempt in range(max_retries):
        try:
            # 尝试序列化
            json_str = json.dumps(sanitized, ensure_ascii=False, separators=(',', ':'), allow_nan=False)
            
            # 验证生成的 JSON 是否有效（尝试解析它）
            try:
                json.loads(json_str)
            except json.JSONDecodeError as validation_error:
                # 如果验证失败，尝试更严格的清理
                if attempt < max_retries - 1:
                    # 对字符串值进行更严格的清理
                    sanitized = sanitize_strings_recursively(sanitized)
                    continue
                else:
                    # 最后一次尝试失败，返回错误响应
                    raise ValueError(f"Generated JSON is invalid: {validation_error}")
            
            return json_str
        except (TypeError, ValueError) as e:
            if attempt < max_retries - 1:
                # 尝试更严格的清理
                sanitized = sanitize_strings_recursively(sanitized)
            else:
                # 所有尝试都失败，返回错误响应
                error_response = {
                    "success": False,
                    "error": f"Failed to serialize response after {max_retries} attempts: {str(e)}"
                }
                return json.dumps(error_response, ensure_ascii=False, separators=(',', ':'))
    
    # 不应该到达这里，但为了安全起见
    error_response = {
        "success": False,
        "error": "Failed to serialize response: Unknown error"
    }
    return json.dumps(error_response, ensure_ascii=False, separators=(',', ':'))


def sanitize_strings_recursively(obj: Any) -> Any:
    """
    递归地清理对象中的所有字符串，使用更严格的方法
    
    Args:
        obj: 要清理的对象
        
    Returns:
        清理后的对象
    """
    if isinstance(obj, str):
        # 更严格的清理：移除所有可能导致 JSON 问题的字符
        result = ''
        for char in obj:
            try:
                code = ord(char)
                # 只保留可打印字符和常见的空白字符
                if code == 9 or code == 10 or code == 13:  # 制表符、换行符、回车符
                    result += char
                elif 32 <= code <= 126:  # 可打印 ASCII 字符
                    result += char
                elif code > 127:  # 非 ASCII 字符（如中文）
                    # 检查是否是有效的 Unicode 字符
                    try:
                        char.encode('utf-8')
                        result += char
                    except:
                        # 无效的 Unicode 字符，跳过
                        continue
                # 其他字符（控制字符等）跳过
            except (ValueError, TypeError):
                # 无法处理的字符，跳过
                continue
        return result
    elif isinstance(obj, dict):
        return {key: sanitize_strings_recursively(value) for key, value in obj.items()}
    elif isinstance(obj, list):
        return [sanitize_strings_recursively(item) for item in obj]
    else:
        return obj


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
                model_name = params.get("model_name")
                
                ids = self.vector_store_service.add_documents(
                    texts=texts,
                    metadatas=metadatas,
                    model_name=model_name
                )
                return {
                    "success": True,
                    "result": ids
                }
            
            elif method == "search_vector_store":
                query = params.get("query", "")
                top_k = params.get("top_k", 5)
                model_name = params.get("model_name")
                filter_metadata = params.get("filter_metadata")
                
                results = self.vector_store_service.search(
                    query=query,
                    top_k=top_k,
                    model_name=model_name,
                    filter_metadata=filter_metadata
                )
                return {
                    "success": True,
                    "result": results
                }
            
            elif method == "delete_from_store":
                ids = params.get("ids", [])
                # 确保所有ID都是字符串类型（ChromaDB需要字符串ID）
                ids_str = [str(id) for id in ids]
                
                store = self.vector_store_service.get_persistent_store()
                result = store.delete(ids_str)
                return {
                    "success": result,
                    "result": result
                }
            
            elif method == "get_ids_by_metadata":
                filter_metadata = params.get("filter_metadata")
                
                store = self.vector_store_service.get_persistent_store()
                ids = store.get_ids_by_metadata(filter_metadata=filter_metadata)
                return {
                    "success": True,
                    "result": ids
                }
            
            elif method == "process_file_paths":
                # 处理文件路径列表：解析、分块、嵌入、存储
                file_paths = params.get("file_paths", [])
                model_name = params.get("model_name")
                knowledge_base_id = params.get("knowledge_base_id", "default")
                chunk_size = params.get("chunk_size", 1000)
                chunk_overlap = params.get("chunk_overlap", 200)
                strategy = params.get("strategy", "recursive")
                
                if not file_paths:
                    return {
                        "success": False,
                        "error": "file_paths is required"
                    }
                
                # 获取服务实例
                file_parser_service = get_file_parser_service()
                chunk_service = get_chunk_service()
                
                processed_count = 0
                errors = []
                
                # 处理每个文件
                for file_path in file_paths:
                    try:
                        # 1. 解析文件
                        parse_result = file_parser_service.parse_file(file_path)
                        if not parse_result.get("success"):
                            error_msg = parse_result.get("error", "Failed to parse file")
                            errors.append(f"{file_path}: {error_msg}")
                            continue
                        
                        content = parse_result.get("content", "")
                        file_metadata = parse_result.get("metadata", {})
                        
                        if not content:
                            errors.append(f"{file_path}: File is empty")
                            continue
                        
                        # 2. 分块
                        chunks = chunk_service.chunk_text(
                            text=content,
                            chunk_size=chunk_size,
                            chunk_overlap=chunk_overlap,
                            strategy=strategy
                        )
                        
                        if not chunks:
                            errors.append(f"{file_path}: No chunks generated")
                            continue
                        
                        # 3. 准备文档和元数据
                        texts = []
                        metadatas = []
                        
                        for chunk_idx, chunk in enumerate(chunks):
                            chunk_content = chunk.get("content", "")
                            chunk_meta = chunk.get("metadata", {})
                            
                            # 合并文件元数据和分块元数据
                            combined_metadata = {
                                **file_metadata,
                                **chunk_meta,
                                "chunkIndex": chunk_idx,
                                "totalChunks": len(chunks),
                                "knowledgeBaseId": knowledge_base_id
                            }
                            
                            texts.append(chunk_content)
                            metadatas.append(combined_metadata)
                        
                        # 4. 添加到向量存储（会自动生成嵌入）
                        ids = self.vector_store_service.add_documents(
                            texts=texts,
                            metadatas=metadatas,
                            model_name=model_name
                        )
                        
                        processed_count += 1
                        
                    except Exception as e:
                        error_msg = str(e)
                        errors.append(f"{file_path}: {error_msg}")
                        print(f"[VectorService] 处理文件失败 {file_path}: {error_msg}")
                
                # 返回结果
                return {
                    "success": True,
                    "result": {
                        "processedCount": processed_count,
                        "fileCount": len(file_paths),
                        "errors": errors if errors else None
                    }
                }
            
            else:
                return {
                    "success": False,
                    "error": f"Unknown method: {method}"
                }
        
        except Exception as e:
            # 清理异常消息，确保不包含无效字符
            error_msg = sanitize_for_json(str(e))
            return {
                "success": False,
                "error": error_msg
            }


def main():
    """主函数 - 从标准输入读取 JSON 请求，输出 JSON 响应"""
    service = VectorService()
    
    for line in sys.stdin:
        try:
            # 清理输入行，移除可能导致问题的控制字符
            cleaned_line = line.strip()
            
            # 尝试解析 JSON
            try:
                request = json.loads(cleaned_line)
            except json.JSONDecodeError as json_error:
                # 提供更详细的错误信息
                error_msg = str(json_error)
                error_pos = getattr(json_error, 'pos', None)
                
                # 记录错误位置附近的内容
                if error_pos is not None and error_pos < len(cleaned_line):
                    start_pos = max(0, error_pos - 50)
                    end_pos = min(len(cleaned_line), error_pos + 50)
                    context = cleaned_line[start_pos:end_pos]
                    # 清理上下文字符串，移除无效字符
                    context_cleaned = sanitize_for_json(context)
                    # 更安全地表示上下文：移除所有可能导致 JSON 问题的字符
                    # 只保留 ASCII 可打印字符和基本的中文字符
                    context_safe = ''
                    for c in context_cleaned:
                        code = ord(c)
                        # 保留 ASCII 可打印字符 (32-126)
                        if 32 <= code <= 126:
                            context_safe += c
                        # 保留基本的中文字符范围 (CJK 统一汉字)
                        elif 0x4E00 <= code <= 0x9FFF:
                            context_safe += c
                        # 保留常见的中文标点
                        elif 0x3000 <= code <= 0x303F:
                            context_safe += c
                        # 其他字符替换为问号
                        else:
                            context_safe += '?'
                    
                    # 限制上下文长度，避免错误消息过长
                    if len(context_safe) > 100:
                        context_safe = context_safe[:50] + '...' + context_safe[-50:]
                    
                    # 安全地构建错误消息，避免引入 JSON 破坏字符
                    error_msg += f" (near position {error_pos})"
                    # 将上下文作为单独的信息，而不是直接拼接
                    context_info = f"Context: {context_safe}"
                else:
                    context_info = None
                
                # 检查是否是文本内容导致的问题
                if 'text' in cleaned_line.lower() or 'params' in cleaned_line.lower():
                    error_msg += " (可能是文本内容中包含特殊字符导致 JSON 解析失败)"
                
                # 清理错误消息本身
                error_msg_cleaned = sanitize_for_json(error_msg)
                
                # 构建错误响应，确保所有字符串都经过清理
                error_response = {
                    "success": False,
                    "error": f"Invalid JSON: {error_msg_cleaned}"
                }
                
                # 如果有上下文信息，添加到响应中（但需要确保它不会破坏 JSON）
                if context_info:
                    context_cleaned_info = sanitize_for_json(context_info)
                    error_response["context"] = context_cleaned_info
                
                # 再次清理整个响应对象
                sanitized_error = sanitize_for_json(error_response)
                
                # 使用安全的 JSON 序列化函数
                try:
                    print(safe_json_dumps(sanitized_error))
                except Exception as e:
                    # 如果仍然失败，使用最安全的错误响应
                    safe_error = {
                        "success": False,
                        "error": "Invalid JSON: Failed to parse request (error details could not be serialized)"
                    }
                    print(safe_json_dumps(safe_error))
                
                sys.stdout.flush()
                continue
            
            response = service.handle_request(request)
            # 使用安全的 JSON 序列化函数，自动处理所有错误情况
            response_json = safe_json_dumps(response)
            print(response_json)
            sys.stdout.flush()
        except Exception as e:
            # 清理异常消息，确保不包含无效字符
            error_msg = sanitize_for_json(str(e))
            error_response = {
                "success": False,
                "error": error_msg
            }
            # 使用安全的 JSON 序列化函数
            print(safe_json_dumps(error_response))
            sys.stdout.flush()


if __name__ == "__main__":
    main()


