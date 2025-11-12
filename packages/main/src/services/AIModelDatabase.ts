/**
 * AI 模型配置数据库管理类
 * 功能：管理 AI 模型配置的数据库操作
 * 描述：提供 AI 模型配置的增删改查功能，使用 SQLite 存储
 */

import { SQLiteDatabase } from './SQLiteDatabase';

interface ChatModel {
  id: string;
  name: string;
  displayName?: string;
}

interface AIModelConfig {
  id: string;
  name: string;
  providerId: string;
  apiKey: string;
  apiEndpoint: string;
  chatModels?: ChatModel[];
  modelId?: string;
  isEnabled?: boolean;
}

interface AIModel {
  id: string;
  name: string;
  displayName?: string;
  configId: string;
  providerId: string;
  apiEndpoint: string;
  apiKey: string;
}

/**
 * AI 模型配置数据库管理类
 */
export class AIModelDatabase {
  private db: SQLiteDatabase;
  private initialized: boolean = false;

  constructor() {
    this.db = new SQLiteDatabase('ai-models.db');
  }

  /**
   * 初始化数据库
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await this.db.initialize();
      await this.createTables();
      this.initialized = true;
      console.log('[AIModelDatabase] 数据库初始化成功');
    } catch (error) {
      console.error('[AIModelDatabase] 数据库初始化失败:', error);
      throw error;
    }
  }

  /**
   * 创建数据库表
   */
  private async createTables(): Promise<void> {
    // 检查是否需要迁移（删除 models 列）
    await this.migrateRemoveModelsColumn();
    // 检查是否需要迁移（删除 createdAt 和 updatedAt 列）
    await this.migrateRemoveTimestampColumns();

    // 创建配置表
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS ai_configs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        providerId TEXT NOT NULL,
        apiKey TEXT NOT NULL,
        apiEndpoint TEXT NOT NULL,
        modelId TEXT,
        chatModels TEXT,
        isEnabled INTEGER DEFAULT 1
      );
    `);

    // 创建模型表
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS ai_models (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        displayName TEXT,
        configId TEXT NOT NULL,
        providerId TEXT NOT NULL,
        apiEndpoint TEXT NOT NULL,
        apiKey TEXT NOT NULL,
        FOREIGN KEY (configId) REFERENCES ai_configs(id) ON DELETE CASCADE
      );
    `);

    // 创建索引
    await this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_ai_configs_name ON ai_configs(name);
      CREATE INDEX IF NOT EXISTS idx_ai_models_configId ON ai_models(configId);
    `);

    console.log('[AIModelDatabase] 数据库表创建成功');
  }

  /**
   * 迁移：删除 ai_configs 和 ai_models 表中的 createdAt 和 updatedAt 列
   * SQLite 不支持直接删除列，需要重建表
   */
  private async migrateRemoveTimestampColumns(): Promise<void> {
    try {
      // 迁移 ai_configs 表
      await this.migrateRemoveTimestampColumnsForTable('ai_configs', [
        'id', 'name', 'providerId', 'apiKey', 'apiEndpoint', 'modelId', 'chatModels', 'isEnabled'
      ]);

      // 迁移 ai_models 表
      await this.migrateRemoveTimestampColumnsForTable('ai_models', [
        'id', 'name', 'displayName', 'configId', 'providerId', 'apiEndpoint', 'apiKey'
      ]);

      console.log('[AIModelDatabase] 迁移完成：createdAt 和 updatedAt 列已删除');
    } catch (error) {
      console.error('[AIModelDatabase] 迁移失败:', error);
      // 迁移失败不应该阻止数据库初始化，继续执行
    }
  }

  /**
   * 迁移指定表的 timestamp 列
   */
  private async migrateRemoveTimestampColumnsForTable(
    tableName: string,
    columnsToKeep: string[]
  ): Promise<void> {
    // 检查表是否存在
    const tableExists = await this.db.query<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}'`
    );

    if (tableExists.length === 0) {
      // 表不存在，无需迁移
      return;
    }

    // 检查是否存在 createdAt 或 updatedAt 列
    const columns = await this.db.query<{ cid: number; name: string; type: string; notnull: number; dflt_value: unknown; pk: number }>(
      `PRAGMA table_info(${tableName})`
    );

    const hasTimestampColumns = columns.some(
      col => col.name === 'createdAt' || col.name === 'updatedAt'
    );

    if (!hasTimestampColumns) {
      // 列不存在，无需迁移
      return;
    }

    console.log(`[AIModelDatabase] 开始迁移：删除 ${tableName} 表中的 createdAt 和 updatedAt 列`);

    // 构建新表的列定义
    const columnDefs: string[] = [];
    for (const col of columns) {
      if (columnsToKeep.includes(col.name)) {
        let colDef = `${col.name} ${col.type}`;
        if (col.notnull) colDef += ' NOT NULL';
        if (col.pk) colDef += ' PRIMARY KEY';
        if (col.dflt_value !== null) {
          const defaultValue = typeof col.dflt_value === 'string' 
            ? `'${col.dflt_value}'` 
            : col.dflt_value;
          colDef += ` DEFAULT ${defaultValue}`;
        }
        columnDefs.push(colDef);
      }
    }

    // 添加外键约束（仅对 ai_models 表）
    if (tableName === 'ai_models') {
      columnDefs.push('FOREIGN KEY (configId) REFERENCES ai_configs(id) ON DELETE CASCADE');
    }

    const newTableName = `${tableName}_new`;
    await this.db.exec(`
      CREATE TABLE ${newTableName} (
        ${columnDefs.join(',\n        ')}
      );
    `);

    // 复制数据（排除 createdAt 和 updatedAt 列）
    const columnsToSelect = columnsToKeep.join(', ');
    await this.db.exec(`
      INSERT INTO ${newTableName} 
      (${columnsToSelect})
      SELECT ${columnsToSelect}
      FROM ${tableName};
    `);

    // 删除旧表
    await this.db.exec(`DROP TABLE ${tableName};`);

    // 重命名新表
    await this.db.exec(`ALTER TABLE ${newTableName} RENAME TO ${tableName};`);

    // 重新创建索引
    if (tableName === 'ai_configs') {
      await this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_ai_configs_name ON ai_configs(name);
      `);
    } else if (tableName === 'ai_models') {
      await this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_ai_models_configId ON ai_models(configId);
      `);
    }
  }

  /**
   * 迁移：删除 ai_configs 表中的 models 列
   * SQLite 不支持直接删除列，需要重建表
   */
  private async migrateRemoveModelsColumn(): Promise<void> {
    try {
      // 检查表是否存在
      const tableExists = await this.db.query<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='ai_configs'"
      );

      if (tableExists.length === 0) {
        // 表不存在，无需迁移
        return;
      }

      // 检查是否存在 models 列
      const columns = await this.db.query<{ cid: number; name: string; type: string; notnull: number; dflt_value: unknown; pk: number }>(
        "PRAGMA table_info(ai_configs)"
      );

      const hasModelsColumn = columns.some(col => col.name === 'models');

      if (!hasModelsColumn) {
        // 列不存在，无需迁移
        return;
      }

      console.log('[AIModelDatabase] 开始迁移：删除 models 列');

      // 创建新表（不包含 models 列）
      await this.db.exec(`
        CREATE TABLE ai_configs_new (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          providerId TEXT NOT NULL,
          apiKey TEXT NOT NULL,
          apiEndpoint TEXT NOT NULL,
          modelId TEXT,
          chatModels TEXT,
          isEnabled INTEGER DEFAULT 1
        );
      `);

      // 复制数据（排除 models 列）
      await this.db.exec(`
        INSERT INTO ai_configs_new 
        (id, name, providerId, apiKey, apiEndpoint, modelId, chatModels, isEnabled)
        SELECT 
        id, name, providerId, apiKey, apiEndpoint, modelId, chatModels, isEnabled
        FROM ai_configs;
      `);

      // 删除旧表
      await this.db.exec('DROP TABLE ai_configs;');

      // 重命名新表
      await this.db.exec('ALTER TABLE ai_configs_new RENAME TO ai_configs;');

      // 重新创建索引
      await this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_ai_configs_name ON ai_configs(name);
      `);

      console.log('[AIModelDatabase] 迁移完成：models 列已删除');
    } catch (error) {
      console.error('[AIModelDatabase] 迁移失败:', error);
      // 迁移失败不应该阻止数据库初始化，继续执行
    }
  }

  /**
   * 检查配置名称是否存在
   * @param name 配置名称
   * @param excludeId 排除的配置ID（用于更新时检查）
   * @returns 是否存在
   */
  async checkNameExists(name: string, excludeId?: string): Promise<boolean> {
    await this.ensureInitialized();

    const sql = excludeId
      ? 'SELECT COUNT(*) as count FROM ai_configs WHERE name = ? AND id != ?'
      : 'SELECT COUNT(*) as count FROM ai_configs WHERE name = ?';
    
    const params = excludeId ? [name, excludeId] : [name];
    const result = await this.db.query<{ count: number }>(sql, params);
    
    return result.length > 0 && result[0].count > 0;
  }

  /**
   * 保存配置
   * @param config 配置数据
   * @param models 模型列表
   * @returns 配置ID
   */
  async saveConfig(config: AIModelConfig, models: AIModel[]): Promise<string> {
    await this.ensureInitialized();

    console.log('[AIModelDatabase] 开始保存配置:', {
      id: config.id,
      name: config.name,
      providerId: config.providerId,
      hasApiKey: !!config.apiKey,
      apiEndpoint: config.apiEndpoint,
      hasModelId: !!config.modelId,
      isEnabled: config.isEnabled,
      chatModelsCount: config.chatModels?.length || 0,
      modelsCount: models.length
    });

    // 如果开启配置，验证必填项
    if (config.isEnabled === true) {
      const missingFields: string[] = [];

      // 所有提供商都需要的基础必填项
      // 检查 API Key
      if (!config.apiKey || !config.apiKey.trim()) {
        missingFields.push('API Key');
      }

      // 检查 API 地址
      if (!config.apiEndpoint || !config.apiEndpoint.trim()) {
        missingFields.push('API 地址');
      }

      // 根据提供商类型检查额外的必填项
      // 魔塔社区（modelscope）需要模型ID
      if (config.providerId === 'modelscope') {
        if (!config.modelId || !config.modelId.trim()) {
          missingFields.push('模型ID');
        }
      }

      // 如果有必填项未填写，抛出错误
      if (missingFields.length > 0) {
        const errorMsg = `无法开启配置：以下必填项未填写：${missingFields.join('、')}`;
        console.error('[AIModelDatabase] 保存配置失败 - 必填项未填写:', missingFields);
        throw new Error(errorMsg);
      }
    }

    // 将 chatModels 数组序列化为 JSON 字符串
    const chatModelsJson = config.chatModels ? JSON.stringify(config.chatModels) : null;
    
    const configData = {
      name: config.name,
      providerId: config.providerId,
      apiKey: config.apiKey,
      apiEndpoint: config.apiEndpoint,
      modelId: config.modelId || null,
      chatModels: chatModelsJson,
      isEnabled: config.isEnabled !== false ? 1 : 0
    };

    try {
      // 先尝试更新，如果更新的行数为 0，则执行插入
      // 这样可以避免并发问题，比先查询再插入更可靠
      const updatedRows = await this.db.update('ai_configs', configData, [
        { field: 'id', operator: '=', value: config.id }
      ]);

      if (updatedRows === 0) {
        // 更新行数为 0，说明配置不存在，执行插入
        console.log('[AIModelDatabase] 配置不存在，执行插入操作');
        try {
          await this.db.insert('ai_configs', {
            id: config.id,
            ...configData
          });
          console.log('[AIModelDatabase] 配置插入成功');
        } catch (error: unknown) {
          // 如果插入时出现唯一约束冲突（可能是在更新和插入之间，另一个进程插入了相同的 ID）
          // 再次尝试更新
          if (error instanceof Error && error.message.includes('UNIQUE constraint')) {
            console.log('[AIModelDatabase] 检测到唯一约束冲突，尝试更新');
            await this.db.update('ai_configs', configData, [
              { field: 'id', operator: '=', value: config.id }
            ]);
          } else {
            console.error('[AIModelDatabase] 插入配置失败:', error);
            throw error;
          }
        }
      } else {
        console.log('[AIModelDatabase] 配置更新成功，更新了', updatedRows, '行');
      }

      // 删除旧的模型记录
      console.log('[AIModelDatabase] 删除旧的模型记录，configId:', config.id);
      await this.db.delete('ai_models', [
        { field: 'configId', operator: '=', value: config.id }
      ]);

      // 保存新的模型记录
      if (models.length > 0) {
        console.log('[AIModelDatabase] 保存新的模型记录，数量:', models.length);
        const modelsData = models.map(model => ({
          id: model.id,
          name: model.name,
          displayName: model.displayName || null,
          configId: model.configId,
          providerId: model.providerId,
          apiEndpoint: model.apiEndpoint,
          apiKey: model.apiKey
        }));

        await this.db.insertBatch('ai_models', modelsData);
        console.log('[AIModelDatabase] 模型记录保存成功');
      } else {
        console.log('[AIModelDatabase] 没有模型记录需要保存');
      }

      console.log('[AIModelDatabase] 配置保存成功，configId:', config.id);
      return config.id;
    } catch (error) {
      console.error('[AIModelDatabase] 保存配置时发生错误:', error);
      throw error;
    }
  }

  /**
   * 获取所有配置
   * @returns 配置列表
   */
  async getAllConfigs(): Promise<AIModelConfig[]> {
    await this.ensureInitialized();

    const configs = await this.db.query<{
      id: string;
      name: string;
      providerId: string;
      apiKey: string;
      apiEndpoint: string;
      modelId: string | null;
      chatModels: string | null;
      isEnabled: number;
    }>('SELECT * FROM ai_configs');

    return configs.map(config => ({
      id: config.id,
      name: config.name,
      providerId: config.providerId,
      apiKey: config.apiKey,
      apiEndpoint: config.apiEndpoint,
      modelId: config.modelId || undefined,
      chatModels: config.chatModels ? JSON.parse(config.chatModels) : undefined,
      isEnabled: config.isEnabled === 1
    }));
  }

  /**
   * 根据ID获取配置
   * @param id 配置ID
   * @returns 配置数据
   */
  async getConfigById(id: string): Promise<AIModelConfig | null> {
    await this.ensureInitialized();

    const result = await this.db.queryOne<{
      id: string;
      name: string;
      providerId: string;
      apiKey: string;
      apiEndpoint: string;
      modelId: string | null;
      chatModels: string | null;
      isEnabled: number;
    }>('SELECT * FROM ai_configs WHERE id = ?', [id]);

    if (!result) return null;

    return {
      id: result.id,
      name: result.name,
      providerId: result.providerId,
      apiKey: result.apiKey,
      apiEndpoint: result.apiEndpoint,
      modelId: result.modelId || undefined,
      chatModels: result.chatModels ? JSON.parse(result.chatModels) : undefined,
      isEnabled: result.isEnabled === 1
    };
  }

  /**
   * 根据配置ID获取模型列表
   * @param configId 配置ID
   * @returns 模型列表
   */
  async getModelsByConfigId(configId: string): Promise<AIModel[]> {
    await this.ensureInitialized();

    const models = await this.db.query<{
      id: string;
      name: string;
      displayName: string | null;
      configId: string;
      providerId: string;
      apiEndpoint: string;
      apiKey: string;
    }>('SELECT * FROM ai_models WHERE configId = ?', [configId]);

    return models.map(model => ({
      id: model.id,
      name: model.name,
      displayName: model.displayName || undefined,
      configId: model.configId,
      providerId: model.providerId,
      apiEndpoint: model.apiEndpoint,
      apiKey: model.apiKey
    }));
  }

  /**
   * 删除配置
   * @param id 配置ID
   */
  async deleteConfig(id: string): Promise<void> {
    await this.ensureInitialized();

    // 删除配置（级联删除模型）
    await this.db.delete('ai_configs', [
      { field: 'id', operator: '=', value: id }
    ]);
  }

  /**
   * 确保数据库已初始化
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }
}

