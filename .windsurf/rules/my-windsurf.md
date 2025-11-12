---
trigger: always_on
---

# 代码规范

- AI提供服务商，都有自己的连接方式和API地址，在完成对应服务商时，必须单独创建一个代码文件。
- 在需要使用组件的时候，严格要求必须先检查是否已经存在相同的组件，如果存在，则直接使用。
- 严格禁止使用样式变量：--vscode-xxx，正确的样式变量应该是：--ws-xx
- 模块化开发，拥有高度可扩展性。
- 严格禁止使用css动画，除非明确要求。
- 严格禁止在代码中使用emoji硬编码的图标。
- 严格禁止创建临时总结文档。
- 每个代码文件顶部都注释该文件的功能和描述。
- 没有明确要求，严格禁止使用硬编码颜色。
- 严格禁止每个组件都使用单独字体。
- 如果组件需要图标，严格要求向我所要svg图标代码。
- svg图标创建svg组件，方便管理。
- 状态管理：Zustand（只负责UI状态管理），禁止使用其他的。
- 需要使用组件时严格要求：优先使用shadcn组件，其次才是创建单独的组件文件。
- 在需要使用svg图标的时候，必须检测svg图标组件是否存在，如果存在则直接使用现成的svg图标组件。
- 严格禁止使用loacalStorage存储数据。
- 严格禁止使用预定义AI模型，必须获取真实的AI模型。
- 严格禁止使用cookie存储数据。
- 严格禁止使用sessionStorage存储数据。
- 严格禁止下载独立的组件库，必须优先使用shadcn组件库，其次自动创建组件。
- AI模型的配置，必须使用Sqlite进行存储。
- 样式使用：scss，禁止使用css。
- 严格禁止使用`<button></button>`组件，除非我要求明确使用。
- 严格禁止使用`any`类型。
- 错误修复：严格要求检查以下问题：
   1. 隐式any类型
   2. 未使用的变量
   3. 找不到名称xxxx
   4. 模块xxx没有导出成员xxx
   5. 类型错误，比如：不能将xx类型xxx给类型
   6. 返回的类型不兼容
   7. ....
- **本地存储**:使用‘ electron-store ’库用于在本地存储中存储和检索数据,通常存储一些配置，比如：颜色主题，用户配置...等等。重要的数据我会告诉你用什么存储。
   -Windows: C:\Users\Administrator\AppData\Roaming\note-studio
   -macOS: /Users/username/Library/Application Support/note-studio

## 项目仓库

 **仓库地址:** github：`https://github.com/yo8ku/WiseAI-Note-Studio.git`