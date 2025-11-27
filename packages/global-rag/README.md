# 全局RAG模块

全局RAG服务模块，提供独立的Python环境和完整的RAG功能。

## 功能特性

- **文本分块**：使用LangChain进行智能文本分块
- **向量嵌入**：使用sentence-transformers进行文本向量化
- **向量存储**：支持持久化存储，使用ChromaDB作为向量数据库
- **RAG引擎**：完整的RAG查询和上下文构建功能
- **独立Python环境**：包含独立的Python服务，不依赖其他模块

## 安装

```bash
# 安装依赖
pnpm install

# 构建模块
pnpm build

# 设置Python环境（可选）
pnpm setup:python
```

## 使用示例

### 基本使用

```typescript
import { Chunker, Embedder, VectorStore, RAGEngine } from '@note-studio/global-rag';

// 初始化组件
const chunker = new Chunker({ chunkSize: 1000, chunkOverlap: 200 });
const embedder = new Embedder('BAAI/bge-large-zh-v1.5');
const vectorStore = new VectorStore();
const ragEngine = new RAGEngine(vectorStore);

// 初始化
await chunker.initialize();
await embedder.initialize();
await vectorStore.initialize();

// 处理文档
const chunks = await chunker.chunkText('你的文档内容');
const embeddings = await embedder.embedTexts(chunks.chunks.map(c => c.content));

// 添加到向量存储
await vectorStore.addDocuments(
  chunks.chunks.map(c => c.content),
  chunks.chunks.map(c => ({ filePath: 'example.txt', ...c.metadata }))
);

// RAG查询
const result = await ragEngine.query('你的问题');
console.log(result.answer);
```

## 目录结构

```
packages/global-rag/
├── src/
│   ├── chunker/          # 文本分块器
│   ├── embedding/        # 向量嵌入器
│   ├── vector-store/     # 向量存储
│   ├── rag/              # RAG引擎
│   ├── python/           # Python服务
│   │   ├── bridge/       # Python桥接器
│   │   └── services/     # Python服务代码
│   └── types.ts          # 类型定义
├── package.json
└── tsconfig.json
```

## Python环境

模块包含独立的Python服务，位于 `src/python/services/` 目录。

### Python依赖

Python服务需要以下依赖（见 `requirements.txt`）：
- langchain
- tiktoken
- sentence-transformers
- numpy
- faiss-cpu

### 安装Python依赖

```bash
# 进入Python服务目录
cd src/python/services

# 安装依赖
pip install -r requirements.txt
```

## API文档

### Chunker（分块器）

```typescript
const chunker = new Chunker({
  chunkSize: 1000,
  chunkOverlap: 200,
  strategy: 'recursive'
});

await chunker.initialize();
const result = await chunker.chunkText('文本内容');
```

### Embedder（嵌入器）

```typescript
const embedder = new Embedder('BAAI/bge-large-zh-v1.5');
await embedder.initialize();
const embedding = await embedder.embedText('文本内容');
```

### VectorStore（向量存储）

```typescript
const vectorStore = new VectorStore();
await vectorStore.initialize();

// 添加文档
await vectorStore.addDocuments(
  ['文本1', '文本2'],
  [{ filePath: 'file1.txt' }, { filePath: 'file2.txt' }]
);

// 搜索
const results = await vectorStore.search('查询文本', { topK: 5 });
```

### RAGEngine（RAG引擎）

```typescript
const ragEngine = new RAGEngine(vectorStore, {
  maxContextLength: 4000,
  maxSourceDocuments: 5,
  minRelevanceScore: 0.7
});

const result = await ragEngine.query('你的问题');
```

## 注意事项

1. **Python环境**：项目包含内置的独立 Python 环境（位于 `python_bundle/python-3.13.9-embed/`），不需要用户本地安装 Python
2. **依赖安装**：Python 依赖已预装在内置环境中，无需手动安装
3. **向量存储路径**：持久化向量存储默认路径为 `~/.note-studio/vector-store`
4. **模型下载**：首次使用嵌入模型时会自动下载，可能需要一些时间

## 开发

```bash
# 开发模式（监听文件变化）
pnpm dev

# 构建
pnpm build

# 测试
pnpm test
```


