/**
 * 知识库系统基本使用示例
 */

import {
  KnowledgeBaseManager,
  ParserRegistry,
  ChunkerRegistry,
  EmbeddingService,
  OpenAIEmbedding,
  ChromaDBStore,
  ImportService,
  SearchEngine,
  VectorSearch,
  HybridSearch,
  RAGEngine,
  // 解析器
  MarkdownParser,
  TextParser,
  PDFParser,
  HTMLParser,
  DocxParser,
  CodeParser,
  // 分块器
  SentenceChunker,
  ParagraphChunker,
  MarkdownChunker,
  SemanticChunker,
} from '../src';

async function main() {
  console.log('=== 知识库系统示例 ===\n');

  // 1. 初始化解析器
  console.log('1. 注册解析器...');
  const parserRegistry = ParserRegistry.getInstance();
  parserRegistry.register(new MarkdownParser());
  parserRegistry.register(new TextParser());
  parserRegistry.register(new PDFParser());
  parserRegistry.register(new HTMLParser());
  parserRegistry.register(new DocxParser());
  parserRegistry.register(new CodeParser());

  // 2. 初始化分块器
  console.log('2. 注册分块器...');
  const chunkerRegistry = ChunkerRegistry.getInstance();
  chunkerRegistry.register(new SentenceChunker());
  chunkerRegistry.register(new ParagraphChunker());
  chunkerRegistry.register(new MarkdownChunker(), true); // 设为默认
  chunkerRegistry.register(new SemanticChunker());

  // 3. 初始化 Embedding 服务
  console.log('3. 初始化 Embedding 服务...');
  const embeddingProvider = new OpenAIEmbedding({
    apiKey: process.env.OPENAI_API_KEY || 'your-api-key',
    model: 'text-embedding-3-small',
    dimensions: 1536,
  });
  const embeddingService = new EmbeddingService(embeddingProvider);

  // 4. 初始化向量存储
  console.log('4. 初始化向量存储...');
  const vectorStore = new ChromaDBStore({
    host: 'http://localhost:8000',
    collectionName: 'demo-knowledge-base',
    dimensions: 1536,
  });
  await vectorStore.initialize();

  // 5. 创建知识库
  console.log('5. 创建知识库...');
  const kbManager = KnowledgeBaseManager.getInstance();
  const kb = await kbManager.createKnowledgeBase({
    id: 'demo-kb',
    name: 'Demo Knowledge Base',
    description: '示例知识库',
    storagePath: './data',
    embeddingProvider: 'openai',
    vectorStore: 'chromadb',
    chunkStrategy: 'markdown',
    chunkSize: 1000,
    chunkOverlap: 200,
  });

  // 6. 导入文档
  console.log('6. 导入文档...');
  const importService = new ImportService(
    parserRegistry,
    chunkerRegistry,
    embeddingService,
    vectorStore
  );

  importService.on('file-imported', (data) => {
    console.log(`  ✓ 已导入: ${data.filePath} (${data.chunks} 个分块)`);
  });

  importService.on('import-error', (data) => {
    console.error(`  ✗ 导入失败: ${data.filePath}`, data.error);
  });

  const progress = await importService.importDirectory('./docs', {
    recursive: true,
    filePattern: '\\.(md|txt)$',
    chunkStrategy: 'markdown',
    chunkSize: 1000,
    extractMetadata: true,
  });

  console.log(`\n导入完成: ${progress.succeeded}/${progress.total} 个文件\n`);

  // 7. 搜索示例
  console.log('7. 搜索示例...');
  const vectorSearch = new VectorSearch(vectorStore, embeddingService);
  const hybridSearch = new HybridSearch(vectorSearch);
  const searchEngine = new SearchEngine(vectorSearch, hybridSearch);

  const searchResults = await searchEngine.search({
    query: 'What is RAG?',
    topK: 5,
    searchType: 'hybrid',
    scoreThreshold: 0.7,
  });

  console.log(`找到 ${searchResults.hits.length} 个结果:`);
  searchResults.hits.forEach((hit, index) => {
    console.log(`\n  ${index + 1}. [分数: ${hit.score.toFixed(3)}]`);
    console.log(`     ${hit.content.slice(0, 150)}...`);
  });

  // 8. RAG 示例
  console.log('\n8. RAG 查询示例...');
  const ragEngine = new RAGEngine(searchEngine, {
    maxContextLength: 4000,
    maxSourceDocuments: 5,
    minRelevanceScore: 0.7,
  });

  const ragResponse = await ragEngine.query('Explain how RAG works');

  console.log('\nRAG 响应:');
  console.log('问题:', 'Explain how RAG works');
  console.log('回答:', ragResponse.answer);
  console.log('\n来源文档:');
  ragResponse.sources.forEach((source, index) => {
    console.log(`  ${index + 1}. [相关度: ${source.score.toFixed(3)}]`);
    console.log(`     ${source.content.slice(0, 100)}...`);
  });

  // 9. 统计信息
  console.log('\n9. 知识库统计:');
  const stats = await vectorStore.getStats();
  console.log(`  - 向量总数: ${stats.totalVectors}`);
  console.log(`  - 向量维度: ${stats.dimensions}`);

  // 清理
  console.log('\n完成！');
}

// 运行示例
main().catch(console.error);




























































