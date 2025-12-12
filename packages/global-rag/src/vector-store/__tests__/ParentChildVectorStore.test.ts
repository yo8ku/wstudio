/**
 * 父子索引向量存储测试
 */

import { ParentChildVectorStore } from '../ParentChildVectorStore.js';

describe('ParentChildVectorStore', () => {
  let store: ParentChildVectorStore;

  beforeEach(async () => {
    store = new ParentChildVectorStore();
    await store.initialize();
  });

  afterEach(async () => {
    await store.close();
  });

  describe('初始化', () => {
    test('应该成功初始化', async () => {
      const stats = store.getStats();
      expect(stats.parentCount).toBe(0);
      expect(stats.childCount).toBe(0);
    });
  });

  describe('添加文档', () => {
    test('应该成功添加父子文档', async () => {
      const parentContents = ['父块1内容', '父块2内容'];
      const childContents = [
        ['子块1-1', '子块1-2'],
        ['子块2-1', '子块2-2', '子块2-3'],
      ];
      const childVectors = [
        [
          new Array(768).fill(0.1),
          new Array(768).fill(0.2),
        ],
        [
          new Array(768).fill(0.3),
          new Array(768).fill(0.4),
          new Array(768).fill(0.5),
        ],
      ];

      const parentIds = await store.addParentChildDocuments(
        parentContents,
        childContents,
        childVectors,
        {
          knowledgeBaseId: 'test-kb',
          filePath: 'test.md',
        }
      );

      expect(parentIds).toHaveLength(2);

      const stats = store.getStats();
      expect(stats.parentCount).toBe(2);
      expect(stats.childCount).toBe(5);
      expect(stats.avgChildrenPerParent).toBe(2.5);
    });

    test('应该验证输入数组长度', async () => {
      const parentContents = ['父块1'];
      const childContents = [['子块1-1'], ['子块2-1']]; // 长度不匹配
      const childVectors = [[new Array(768).fill(0.1)]];

      await expect(
        store.addParentChildDocuments(parentContents, childContents, childVectors)
      ).rejects.toThrow('父块、子块内容和向量数组长度不匹配');
    });
  });

  describe('搜索', () => {
    beforeEach(async () => {
      // 添加测试数据
      const parentContents = ['这是关于人工智能的文档', '这是关于机器学习的文档'];
      const childContents = [
        ['人工智能是计算机科学的一个分支', '它研究如何让机器模拟人类智能'],
        ['机器学习是人工智能的子领域', '它使用数据来训练模型'],
      ];
      const childVectors = [
        [
          new Array(768).fill(0.8), // 高相似度
          new Array(768).fill(0.6),
        ],
        [
          new Array(768).fill(0.4),
          new Array(768).fill(0.2),
        ],
      ];

      await store.addParentChildDocuments(
        parentContents,
        childContents,
        childVectors,
        {
          knowledgeBaseId: 'test-kb',
        }
      );
    });

    test('应该返回相关的搜索结果', async () => {
      const queryVector = new Array(768).fill(0.75); // 与第一个子块相似

      const results = await store.search(queryVector, {
        topK: 2,
      });

      expect(results).toHaveLength(2);
      expect(results[0].score).toBeGreaterThan(results[1].score);
      expect(results[0].parentContent).toBe('这是关于人工智能的文档');
    });

    test('应该支持元数据过滤', async () => {
      const queryVector = new Array(768).fill(0.5);

      const results = await store.search(queryVector, {
        topK: 10,
        filterMetadata: {
          knowledgeBaseId: 'test-kb',
        },
      });

      expect(results.length).toBeGreaterThan(0);
      results.forEach((result) => {
        expect(result.metadata.knowledgeBaseId).toBe('test-kb');
      });
    });

    test('应该支持父块去重', async () => {
      const queryVector = new Array(768).fill(0.7);

      const resultsWithDup = await store.search(queryVector, {
        topK: 10,
        deduplicateParents: false,
      });

      const resultsNoDup = await store.search(queryVector, {
        topK: 10,
        deduplicateParents: true,
      });

      // 去重后的结果应该少于或等于不去重的结果
      expect(resultsNoDup.length).toBeLessThanOrEqual(resultsWithDup.length);

      // 去重后的结果不应该有重复的父块ID
      const parentIds = resultsNoDup.map((r) => r.parentId);
      const uniqueParentIds = new Set(parentIds);
      expect(parentIds.length).toBe(uniqueParentIds.size);
    });
  });

  describe('获取文档', () => {
    let parentId: string;

    beforeEach(async () => {
      const parentContents = ['测试父块内容'];
      const childContents = [['子块1', '子块2', '子块3']];
      const childVectors = [
        [
          new Array(768).fill(0.1),
          new Array(768).fill(0.2),
          new Array(768).fill(0.3),
        ],
      ];

      const parentIds = await store.addParentChildDocuments(
        parentContents,
        childContents,
        childVectors
      );

      parentId = parentIds[0];
    });

    test('应该根据ID获取父块', async () => {
      const parent = await store.getParentById(parentId);

      expect(parent).not.toBeNull();
      expect(parent?.content).toBe('测试父块内容');
    });

    test('应该根据父块ID获取所有子块', async () => {
      const children = await store.getChildrenByParentId(parentId);

      expect(children).toHaveLength(3);
      expect(children[0].content).toBe('子块1');
      expect(children[1].content).toBe('子块2');
      expect(children[2].content).toBe('子块3');
    });
  });

  describe('删除文档', () => {
    let parentId: string;

    beforeEach(async () => {
      const parentContents = ['要删除的父块'];
      const childContents = [['子块1', '子块2']];
      const childVectors = [
        [new Array(768).fill(0.1), new Array(768).fill(0.2)],
      ];

      const parentIds = await store.addParentChildDocuments(
        parentContents,
        childContents,
        childVectors,
        {
          knowledgeBaseId: 'delete-test',
        }
      );

      parentId = parentIds[0];
    });

    test('应该删除父块及其所有子块', async () => {
      const deleted = await store.deleteParent(parentId);

      expect(deleted).toBe(true);

      const parent = await store.getParentById(parentId);
      expect(parent).toBeNull();

      const children = await store.getChildrenByParentId(parentId);
      expect(children).toHaveLength(0);
    });

    test('应该根据元数据删除文档', async () => {
      const deletedCount = await store.deleteByMetadata({
        knowledgeBaseId: 'delete-test',
      });

      expect(deletedCount).toBe(1);

      const stats = store.getStats();
      expect(stats.parentCount).toBe(0);
      expect(stats.childCount).toBe(0);
    });
  });

  describe('清空数据', () => {
    test('应该清空所有数据', async () => {
      // 添加一些数据
      await store.addParentChildDocuments(
        ['父块1', '父块2'],
        [['子块1'], ['子块2']],
        [[new Array(768).fill(0.1)], [new Array(768).fill(0.2)]]
      );

      let stats = store.getStats();
      expect(stats.parentCount).toBe(2);

      // 清空
      await store.clear();

      stats = store.getStats();
      expect(stats.parentCount).toBe(0);
      expect(stats.childCount).toBe(0);
    });
  });
});
