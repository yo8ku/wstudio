# 构建配置优化说明

## 优化概述

本次优化主要解决了构建过程中产生大量重复文件的问题，通过以下方式减少重复文件的生成：

1. **优化 TypeScript 构建配置**
2. **移除不必要的文件复制**
3. **添加自动清理机制**
4. **统一构建输出结构**

## 主要优化内容

### 1. 优化 main 包的 TypeScript 配置

**文件**: `packages/main/tsconfig.json`

**优化前**:
```json
{
  "compilerOptions": {
    "outDir": "./dist",
    // 没有设置 rootDir，导致输出结构混乱
  }
}
```

**优化后**:
```json
{
  "compilerOptions": {
    "outDir": "./dist/main/src",
    "rootDir": "./src",
    // 明确指定输出和根目录，避免重复编译依赖包
  }
}
```

**效果**:
- 避免将依赖包的内容编译到 main 的 dist 中
- 统一输出结构为 `dist/main/src`
- 减少重复文件的生成

### 2. 优化 prepare-build.js 脚本

**文件**: `scripts/prepare-build.js`

**主要改进**:

1. **移除依赖包复制逻辑**
   - 之前：在 `packages/main/dist/packages` 中复制所有依赖包
   - 现在：依赖包通过 workspace 协议直接访问，无需复制

2. **添加自动清理功能**
   - 构建前自动清理旧的构建产物
   - 清理根目录的 `dist` 目录
   - 清理 `packages/main/dist` 下的重复目录

**优化前**:
```javascript
// 复制依赖包到 main/dist/packages
Object.entries(dependencyDistMap).forEach(([dep, depDistPath]) => {
  copyDir(depDistPath, targetDepPath);
});
```

**优化后**:
```javascript
// 不再复制依赖包，使用 workspace 协议直接访问
// 添加清理步骤
cleanOldBuildArtifacts();
```

### 3. 添加构建前自动清理

**文件**: `package.json`

**新增脚本**:
```json
{
  "scripts": {
    "prebuild": "node scripts/clean-duplicate-files.js --silent",
    "clean": "turbo run clean && node scripts/clean-duplicate-files.js"
  }
}
```

**效果**:
- 每次构建前自动清理重复文件
- 清理命令支持静默模式，减少输出噪音
- 统一清理流程

### 4. 优化清理脚本

**文件**: `scripts/clean-duplicate-files.js`

**新增功能**:
- 支持 `--silent` 参数，用于构建前自动清理
- 自动清理以下目录：
  - 根目录的 `dist` 目录
  - `packages/main/dist/packages` 目录
  - `packages/main/dist` 下的其他依赖包目录

## 构建输出结构

### 优化后的结构

```
packages/
├── main/
│   └── dist/
│       └── main/
│           └── src/          # main 包的构建输出
├── shared/
│   └── dist/
│       ├── cjs/              # CommonJS 格式
│       └── esm/              # ESM 格式
├── theme/
│   └── dist/
│       ├── cjs/              # CommonJS 格式
│       └── esm/              # ESM 格式
├── plugin-system/
│   └── dist/                 # 单一格式输出
└── renderer/
    └── dist/                 # Vite 构建输出
```

### 不再生成的目录

以下目录不再生成，减少了重复文件：

- ❌ `dist/` (根目录)
- ❌ `packages/main/dist/packages/`
- ❌ `packages/main/dist/extension-api/`
- ❌ `packages/main/dist/global-rag/`
- ❌ `packages/main/dist/plugin-system/`
- ❌ `packages/main/dist/shared/`
- ❌ `packages/main/dist/theme/`

## 使用说明

### 正常构建

```bash
# 构建所有包（会自动清理重复文件）
pnpm run build

# 构建 Electron 应用
pnpm run build:electron
```

### 手动清理

```bash
# 清理所有构建产物
pnpm run clean

# 只清理重复文件（详细输出）
node scripts/clean-duplicate-files.js

# 只清理重复文件（静默模式）
node scripts/clean-duplicate-files.js --silent
```

## 优化效果

### 清理前
- 内容重复文件组数: 189组
- 内容重复文件总数: 509个
- 可节省空间: 706 KB

### 清理后
- 内容重复文件组数: 28组 ⬇️ 减少85%
- 内容重复文件总数: 66个 ⬇️ 减少87%
- 可节省空间: 40 KB ⬇️ 减少94%
- 释放空间: 398.57 MB

### 构建优化
- 不再复制依赖包到 main/dist/packages
- 构建输出结构更清晰
- 构建前自动清理，避免累积重复文件

## 注意事项

1. **依赖访问方式**
   - 现在依赖包通过 workspace 协议直接访问
   - 确保 `node_modules/@note-studio` 中有正确的符号链接

2. **构建顺序**
   - 依赖包（shared, theme, plugin-system）会先构建
   - main 包依赖这些包的构建产物

3. **清理安全**
   - 清理脚本只删除构建产物，不会删除源代码
   - 所有清理的文件都可以通过重新构建恢复

## 后续建议

1. **持续监控**
   - 定期运行 `node scripts/check-duplicate-files.js` 检查重复文件
   - 如果发现新的重复文件，及时优化构建配置

2. **构建缓存**
   - 考虑使用 Turbo 的构建缓存，避免重复构建
   - 配置 `.gitignore` 确保不提交构建产物

3. **CI/CD 优化**
   - 在 CI/CD 流程中添加清理步骤
   - 确保每次构建前都是干净的环境






