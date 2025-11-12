# Knowledge Base System

企业级知识库系统，支持 RAG（检索增强生成）功能。

## 特性

✨ **完整的知识库管理**
- 文档导入、解析、分块
- 多种文件格式支持（Markdown, PDF, HTML, Word, 代码文件等）
- 灵活的分块策略（句子、段落、语义、滑动窗口等）

 **强大的搜索能力**
- 向量搜索
- 全文搜索
- 混合搜索
- 语义搜索

🤖 **RAG 支持**
- 上下文构建
- 提示词模板
- 多种 Embedding 提供者（OpenAI、本地模型等）

🗄️ **多种向量存储**
- ChromaDB
- Pinecone
- Weaviate
- Milvus
- Qdrant
- FAISS

🔄 **自动同步**
- 文件监听
- 增量同步
- 智能去重

## 快速开始

### 安装

```bash
npm install @note-studio/knowledge-base
```

### 基本使用

```typescript
import {
  KnowledgeBaseManager,
  ParserRegistry,
  ChunkerRegistry,
  EmbeddingService,
  OpenAIEmbedding,
  ChromaDBStore,
  MarkdownParser,
  SentenceChunker,
} from '@note-studio/knowledge-base';

// 1. 注册解析器
const parserRegistry = ParserRegistry.getInstance();
parserRegistry.register(new MarkdownParser());

// 2. 注册分块器
const chunkerRegistry = ChunkerRegistry.getInstance();
chunkerRegistry.register(new SentenceChunker(), true);

// 3. 初始化 Embedding 服务
const embeddingProvider = new OpenAIEmbedding({
  apiKey: 'your-api-key',
});
const embeddingService = new EmbeddingService(embeddingProvider);

// 4. 初始化向量存储
const vectorStore = new ChromaDBStore({
  collectionName: 'my-knowledge-base',
});
await vectorStore.initialize();

// 5. 创建知识库
const kbManager = KnowledgeBaseManager.getInstance();
const kb = await kbManager.createKnowledgeBase({
  id: 'kb-1',
  name: 'My Knowledge Base',
  storagePath: './data',
  embeddingProvider: 'openai',
  vectorStore: 'chromadb',
});

// 6. 导入文档
await kb.importDocuments(['./docs/**/*.md']);

// 7. 搜索
const results = await kb.search({
  query: 'What is RAG?',
  topK: 5,
  searchType: 'hybrid',
});

console.log(results);
```

## RAG 使用示例

```typescript
import { RAGEngine, SearchEngine, VectorSearch, HybridSearch } from '@note-studio/knowledge-base';

// 创建搜索引擎
const vectorSearch = new VectorSearch(vectorStore, embeddingService);
const hybridSearch = new HybridSearch(vectorSearch);
const searchEngine = new SearchEngine(vectorSearch, hybridSearch);

// 创建 RAG 引擎
const ragEngine = new RAGEngine(searchEngine, {
  maxContextLength: 4000,
  maxSourceDocuments: 5,
  minRelevanceScore: 0.7,
});

// 执行 RAG 查询
const response = await ragEngine.query('What is machine learning?');

console.log('Answer:', response.answer);
console.log('Sources:', response.sources);
```

## 架构

系统采用模块化设计，主要包含以下模块：

- **核心系统**：知识库管理、文档管理
- **解析器系统**：支持多种文件格式解析
- **分块模块**：灵活的文本分块策略
- **向量化模块**：支持多种 Embedding 提供者
- **向量存储**：支持多种向量数据库
- **索引模块**：全文索引、元数据索引
- **搜索模块**：向量搜索、混合搜索
- **RAG 系统**：检索增强生成
- **同步模块**：文件监听、增量同步

## 扩展性

系统设计具有高度可扩展性：

- 自定义解析器：继承 `BaseParser`
- 自定义分块器：继承 `BaseChunker`
- 自定义 Embedding：继承 `EmbeddingProvider`
- 自定义向量存储：继承 `BaseVectorStore`

## API 文档

详细 API 文档请参考 [API Reference](./docs/api-reference.md)

## License

MIT




































































