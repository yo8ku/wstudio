# 扩展开发指南

## 概述

Note Studio 支持开发自定义扩展来扩展应用功能。

## 创建扩展

### 基本结构

```
my-extension/
├── package.json
├── extension.js
└── README.md
```

### package.json

```json
{
  "name": "my-extension",
  "displayName": "我的扩展",
  "version": "1.0.0",
  "description": "扩展描述",
  "main": "./extension.js",
  "engines": {
    "noteStudio": "^1.0.0"
  },
  "activationEvents": [
    "onCommand:myExtension.helloWorld"
  ],
  "contributes": {
    "commands": [
      {
        "command": "myExtension.helloWorld",
        "title": "Hello World"
      }
    ]
  }
}
```

### extension.js

```javascript
function activate(context) {
  console.log('扩展已激活');
  
  // 注册命令
  const disposable = vscode.commands.registerCommand(
    'myExtension.helloWorld',
    () => {
      vscode.window.showInformationMessage('Hello World!');
    }
  );
  
  context.subscriptions.push(disposable);
}

function deactivate() {
  console.log('扩展已停用');
}

module.exports = {
  activate,
  deactivate
};
```

## API 参考

参见 [api-reference.md](./api-reference.md)



