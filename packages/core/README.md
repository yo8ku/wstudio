# @note-studio/core

Note Studio 核心模块，提供跨包共享的核心功能。

## 功能模块

### 🔧 工具类

提供常用的工具函数和类，用于跨包共享。

#### EventEmitter

事件驱动架构的基础类，支持事件监听和触发。

```typescript
import { EventEmitter } from '@note-studio/core';

class MyService extends EventEmitter {
  doSomething() {
    this.emit('something-done', { data: 'example' });
  }
}

const service = new MyService();
service.on('something-done', (payload) => {
  console.log('Event received:', payload);
});
```

## 安装

```bash
cd packages/core
npm install
npm run build
```

## 开发

```bash
# 监听模式
npm run watch

# 构建
npm run build

# 清理
npm run clean
```

## 许可

MIT

