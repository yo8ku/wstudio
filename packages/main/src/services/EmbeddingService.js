/**
 * Embedding 服务 - 已废弃
 * 
 * 警告：此文件已废弃，请使用 EmbeddingWorkerService.js
 * 该服务使用子进程执行向量化，不会阻塞主进程
 * 
 * 保留此文件是为了防止旧代码引用时报错
 * 所有调用都会被转发到 EmbeddingWorkerService
 */

console.warn('[EmbeddingService] 警告：此服务已废弃，请使用 EmbeddingWorkerService');

// 转发到子进程版本
const embeddingWorkerService = require('./EmbeddingWorkerService.js');

module.exports = embeddingWorkerService;
