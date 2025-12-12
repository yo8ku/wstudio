# 全局RAG模块

全局RAG服务模块，提供完整的RAG功能。

## 功能特性

- **文本分块**：智能文本分块功能，使用 LangChain.js 实现，支持多种分块策略
- **向量嵌入**：文本向量化功能（正在重构中）
- **向量存储**：支持持久化存储，使用向量数据库（正在重构中）
- **RAG引擎**：完整的RAG查询和上下文构建功能

## 安装

```bash
# 安装依赖
pnpm install

# 构建模块
pnpm build
```

## 使用示例

### 文本分块

```typescript
import { Chunker } from '@note-studio/global-rag';

// 创建分块器
const chunker = new Chunker({
  chunkSize: 1000,
  chunkOverlap: 200,
  strategy: 'recursive'
});

// 初始化
await chunker.initialize();

// 对单个文本进行分块
const result = await chunker.chunkText('你的长文本内容...', {
  chunkSize: 500,
  chunkOverlap: 100,
  strategy: 'recursive'
});

console.log(`总共分成了 ${result.totalChunks} 个块`);
result.chunks.forEach((chunk, index) => {
  console.log(`块 ${index}: ${chunk.content.substring(0, 50)}...`);
});

// 对多个文档进行分块
const documents = [
  { content: '文档1内容...', metadata: { filePath: 'doc1.txt' } },
  { content: '文档2内容...', metadata: { filePath: 'doc2.txt' } }
];
const multiResult = await chunker.chunkDocuments(documents);

// 使用不同的分块策略
const markdownResult = await chunker.chunkText('# Markdown 文档\n内容...', {
  strategy: 'markdown'
});

// 使用自定义切分标识符（按优先级排序）
const customResult = await chunker.chunkText('你的文本内容...', {
  strategy: 'recursive',
  separators: ['\n\n', '\n', '。', '！', '？', '.', '!', '?'], // 优先级从高到低
  chunkSize: 1000,
  chunkOverlap: 200
});
```

### 基本使用

```typescript
import { VectorStore, RAGEngine } from '@note-studio/global-rag';

// 初始化组件
const vectorStore = new VectorStore();
const ragEngine = new RAGEngine(vectorStore);

// 初始化
await vectorStore.initialize();

// 添加到向量存储
await vectorStore.addDocuments(
  ['文档内容1', '文档内容2'],
  [{ filePath: 'example1.txt' }, { filePath: 'example2.txt' }]
);

// RAG查询
const result = await ragEngine.query('你的问题');
console.log(result.answer);
```

## 目录结构

```text
packages/global-rag/
├── src/
│   ├── chunker/          # 文本分块器（已实现，使用 LangChain.js）
│   ├── embedding/        # 向量嵌入器（正在重构中）
│   ├── vector-store/     # 向量存储（正在重构中）
│   ├── rag/              # RAG引擎
│   └── types.ts          # 类型定义
├── package.json
└── tsconfig.json
```

## 注意事项

1. **功能状态**：
   - ✅ 文本分块功能已实现（使用 LangChain.js）
   - ⏳ 向量嵌入功能正在重构中
   - ⏳ 向量存储功能正在重构中
2. **向量存储路径**：持久化向量存储默认路径为 `~/.note-studio/vector-store`
3. **模型下载**：首次使用嵌入模型时会自动下载，可能需要一些时间
4. **分块策略**：
   - `recursive`（递归切分，推荐）：使用自定义分隔符列表，按优先级递归切分，保持语义完整性
   - `markdown`（Markdown 切分）：自动识别 Markdown 结构（标题、段落、代码块等）进行切分
   - `token`（Token 切分，当前使用递归切分作为替代）：按 Token 数量切分（需要 Tokenizer 支持）
   - **自定义切分标识符**：支持用户自定义分隔符列表（如 `['\n\n', '\n', '。', '！', '？']`），按优先级从高到低进行切分

## 开发

```bash
# 开发模式（监听文件变化）
pnpm dev

# 构建
pnpm build

# 测试
pnpm test
```
