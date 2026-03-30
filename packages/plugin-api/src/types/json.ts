/**
 * 插件 API 可跨边界传输的 JSON 类型定义。
 * 约束插件配置、消息和持久化数据保持 JSON 安全。
 */

export type PluginJsonPrimitive = string | number | boolean | null

export interface PluginJsonObject {
  [key: string]: PluginJsonValue
}

export interface PluginJsonArray extends Array<PluginJsonValue> {}

export type PluginJsonValue = PluginJsonPrimitive | PluginJsonObject | PluginJsonArray
