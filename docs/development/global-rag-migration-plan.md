# 全局RAG模块迁移方案

## 一、背景和目标

### 当前状况
- 项目使用 monorepo 结构（pnpm workspace）
- 存在 `packages/knowledge-base` 模块，包含完整的知识库和RAG功能
- RAG相关代码分散在知识库模块中：
  - `packages/knowledge-base/src/vector/` - 向量存储、嵌入、分块
  - `packages/knowledge-base/src/rag/` - RAG引擎
  - `packages/knowledge-base/src/vector/python/` - Python服务
- 知识库模块还包含UI管理功能（文件管理、知识库列表等）

### 目标
1. 建立**全局RAG模块**，独立于知识库模块
2. 包含独立的Python环境管理
3. 提供统一的向量存储服务，供整个应用使用
4. 清理知识库模块中的RAG相关代码

## 二、方案设计

### 方案A：完全迁移（推荐）

**优点：**
- 架构清晰，职责分离
- 全局RAG模块可独立维护和升级
- 知识库模块专注于UI和文件管理

**缺点：**
- 需要迁移较多代码
- 需要更新所有引用

**实施步骤：**

#### 1. 创建新的全局RAG模块

```
packages/
  global-rag/                    # 新的全局RAG模块
    package.json
    tsconfig.json
    README.md
    src/
      index.ts                   # 统一导出
      core/
        RAGService.ts            # 核心RAG服务（单例）
        VectorStore.ts           # 全局向量存储
        types.ts
      chunker/
        Chunker.ts               # 文本分块器
        types.ts
      embedding/
        Embedder.ts              # 向量嵌入器
        types.ts
      python/
        bridge/
          PythonBridge.ts        # Python桥接器
        services/
          server.py              # Python服务主程序
          chunk_service.py       # 分块服务
          embedding_service.py   # 嵌入服务
          vector_store_service.py # 向量存储服务
        requirements.txt         # Python依赖
        venv/                    # 独立的Python虚拟环境（可选）
      utils/
        Logger.ts
```

#### 2. 模块特性

**package.json 配置：**
```json
{
  "name": "@note-studio/global-rag",
  "version": "1.0.0",
  "description": "Global RAG service with independent Python environment",
  "main": "dist/index.js",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "setup:python": "node scripts/setup-python-env.js"
  },
  "dependencies": {
    "@note-studio/theme": "workspace:*",
    "@note-studio/shared": "workspace:*"
  }
}
```

**Python环境管理：**
- 独立的Python虚拟环境（可选，使用venv）
- 自动检测和安装Python依赖
- 支持Python版本检测和兼容性检查
- 提供Python环境初始化脚本

#### 3. 核心服务设计

**RAGService（单例模式）：**
```typescript
class RAGService {
  private static instance: RAGService;
  private vectorStore: VectorStore;
  private chunker: Chunker;
  private embedder: Embedder;
  private pythonBridge: PythonBridge;
  
  // 全局向量存储操作
  async addDocument(content: string, metadata: DocumentMetadata): Promise<void>
  async search(query: string, options: SearchOptions): Promise<SearchResult[]>
  async deleteDocument(docId: string): Promise<void>
  
  // 批量操作
  async batchAddDocuments(documents: Document[]): Promise<void>
  
  // 向量存储管理
  async getVectorStoreStats(): Promise<VectorStoreStats>
  async clearVectorStore(): Promise<void>
}
```

#### 4. 迁移计划

**阶段1：创建新模块**
- [ ] 创建 `packages/global-rag` 目录结构
- [ ] 初始化 package.json 和 tsconfig.json
- [ ] 创建Python环境管理脚本

**阶段2：迁移核心代码**
- [ ] 迁移向量存储相关代码（VectorStoreManager → VectorStore）
- [ ] 迁移分块器代码（VectorChunker → Chunker）
- [ ] 迁移嵌入器代码（VectorEmbedder → Embedder）
- [ ] 迁移Python桥接器（PythonBridge）
- [ ] 迁移Python服务代码

**阶段3：迁移RAG引擎**
- [ ] 迁移RAGEngine
- [ ] 迁移ContextBuilder
- [ ] 迁移PromptTemplate

**阶段4：更新引用**
- [ ] 更新 `packages/renderer/src/services/RAGProcessingService.ts`
- [ ] 更新 `packages/main/src/ipc/pythonBridgeHandlers.ts`
- [ ] 更新所有使用RAG的地方

**阶段5：清理知识库模块**
- [ ] 从知识库模块移除RAG相关导出
- [ ] 删除 `packages/knowledge-base/src/vector/`
- [ ] 删除 `packages/knowledge-base/src/rag/`
- [ ] 更新知识库模块的package.json（移除RAG相关依赖）

**阶段6：测试和验证**
- [ ] 测试Python环境初始化
- [ ] 测试向量存储功能
- [ ] 测试RAG查询功能
- [ ] 验证所有引用正常工作

### 方案B：保留知识库模块，仅提取RAG功能

**优点：**
- 改动较小
- 知识库模块保留部分功能

**缺点：**
- 架构不够清晰
- 可能存在功能重复

**不推荐此方案**，因为用户明确要求建立全局RAG模块。

## 三、知识库模块处理方案

### 选项1：完全删除知识库模块（如果不再需要）

如果知识库模块的UI管理功能不再需要，可以完全删除：
- 删除 `packages/knowledge-base/` 目录
- 删除所有UI组件（KnowledgeBase.tsx, KnowledgeBaseView.tsx等）
- 从 pnpm-workspace.yaml 中移除（如果使用）

### 选项2：保留知识库模块，仅保留UI功能（推荐）

如果还需要知识库的UI管理功能（文件列表、知识库管理等），则：
- 保留知识库模块
- 移除所有RAG相关代码
- 知识库模块仅负责：
  - 文件列表管理
  - 知识库UI展示
  - 文件导入/导出
  - 元数据管理（不涉及向量）

## 四、Python环境管理

### 独立Python环境方案

**方案1：使用系统Python + 虚拟环境**
- 检测系统Python版本
- 在 `packages/global-rag/python/` 创建虚拟环境
- 自动安装requirements.txt中的依赖

**方案2：使用独立Python安装（推荐）**
- 在应用数据目录创建独立的Python环境
- Windows: `%APPDATA%/note-studio/python/`
- macOS: `~/Library/Application Support/note-studio/python/`
- Linux: `~/.config/note-studio/python/`

**Python环境初始化脚本：**
```javascript
// packages/global-rag/scripts/setup-python-env.js
// 1. 检测Python版本
// 2. 创建虚拟环境
// 3. 安装依赖
// 4. 验证安装
```

## 五、数据迁移

### 向量存储数据迁移

如果现有知识库模块已有向量数据：
1. 检查现有向量存储位置
2. 提供迁移脚本，将数据迁移到全局RAG模块
3. 更新存储路径配置

### 配置文件迁移

- 向量存储路径配置
- Python环境配置
- 模型配置（嵌入模型等）

## 六、实施建议

### 推荐方案：方案A + 选项2

1. **创建全局RAG模块**（`packages/global-rag`）
2. **迁移所有RAG相关代码**
3. **保留知识库模块**，但移除RAG功能，仅保留UI管理
4. **更新所有引用**

### 时间估算

- 创建新模块结构：1-2小时
- 迁移核心代码：4-6小时
- 更新引用和测试：2-3小时
- 清理和文档：1-2小时
- **总计：8-13小时**

## 七、注意事项

1. **向后兼容**：如果已有用户数据，需要提供迁移路径
2. **Python环境**：确保Python环境管理脚本跨平台兼容
3. **依赖管理**：注意Python依赖的版本兼容性
4. **测试覆盖**：确保所有RAG功能迁移后正常工作
5. **文档更新**：更新相关文档和README

## 八、下一步行动

请确认：
1. 是否采用方案A（完全迁移）？
2. 知识库模块是删除还是保留（仅UI功能）？
3. Python环境管理采用哪种方案？

确认后即可开始实施。


