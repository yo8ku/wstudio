# WStudio 插件开发说明

本文档以当前仓库里的真实插件契约为准，适用于 `packages/extension-api`、`packages/extension-runtime`、`packages/main` 和 `packages/renderer` 的现有实现。

## 官方地址

- 官网：[https://wisemindai.app/](https://wisemindai.app/)
- 官方文档入口：[https://wisemindai.app/guide/what-is](https://wisemindai.app/guide/what-is)
- 官方插件功能页：[https://wisemindai.app/guide/custom-ai-plugins](https://wisemindai.app/guide/custom-ai-plugins)

说明：官网当前公开页面主要介绍产品侧插件能力；当前扩展 SDK 的实际开发契约，以本仓库源码和本文档为准。

## 当前变更

- 应用已不再自动扫描仓库内的 `plugin-dev/` 目录
- 本地调试请使用 `NOTE_STUDIO_EXTENSION_DIRS` 显式指定插件目录，或把插件目录放到应用用户目录下的 `plugins/`
- 应用内提供了命令 `开发: 重新加载插件`，可在运行中重新扫描插件目录并重载已激活插件
- 宿主会监听插件目录文件变化，并在保存后自动热重载插件；手动重载命令仍可作为兜底

## 开发包位置

- Starter 源码目录：`plugin-dev/wstudio-plugin-starter`
- 打包产物目录：`plugin-dev/wstudio-plugin-starter/.packages`
- Starter 静态资源目录：`plugin-dev/wstudio-plugin-starter/assets`
- Starter 脚本目录：`plugin-dev/wstudio-plugin-starter/scripts`
- Starter Webview 目录：`plugin-dev/wstudio-plugin-starter/webviews`

## 宿主如何发现插件

当前宿主只扫描“目录形态”插件，目录中必须直接包含 `plugin.json`。

宿主默认扫描以下位置：

1. 应用用户目录下的 `plugins/`
2. 环境变量 `NOTE_STUDIO_EXTENSION_DIRS` 指定的额外目录列表

`.wspkg` 是官方工具链生成的分发包格式，不会被宿主直接自动扫描；本地调试时请使用解包后的目录。

## 推荐目录结构

```text
my-plugin/
├── assets/
│   └── plugin-icon.svg
├── scripts/
│   ├── main.cjs
│   └── panel.js
├── webviews/
│   ├── panel.css
│   └── panel.html
├── package.json
├── plugin.json
└── README.md
```

## 目录职责

- `plugin.json`：插件元数据、激活事件、权限和贡献点声明
- `scripts/main.cjs`：插件宿主入口，负责注册命令、读写设置、创建 webview、处理消息桥接
- `scripts/panel.js`：webview 中的浏览器脚本，处理页面交互和宿主消息通信
- `webviews/`：插件自己的前端界面目录，放 HTML 和样式资源
- `assets/`：插件私有静态资源目录，放图标、图片、字体等资源
- `package.json`：开发辅助脚本定义，例如 `plugin:validate`、`plugin:pack`
- `README.md`：安装、调试、打包和目录说明

这种结构对应的是“完整插件包”，不是单一入口脚本。`.wspkg` 打包时会把整个插件目录一起打包进去。

## 入口图标规则

- 插件入口不使用文字，必须使用图标
- `statusBar` 入口使用 `commands[].icon`
- `viewContainers` 入口使用 `viewContainers[].icon`
- 入口图标必须指向插件目录内的 `.svg` 文件
- 建议统一放在 `assets/plugin-icon.svg`
- 宿主会通过内部资源协议 `wstudio-extension://` 加载入口图标，插件侧仍然只需要声明相对 SVG 路径
- 入口图标颜色始终跟随宿主主题继承，插件 SVG 只提供形状，不支持单独指定入口颜色

说明：

- 状态栏入口只显示图标，文字仅作为 tooltip 和命令标题保留
- ActivityBar 中的插件视图容器入口也只显示图标
- `sidebar/title` 是菜单动作，不是入口本身，因此仍然保留文字菜单项

## 最小可运行示例

### `plugin.json`

```json
{
  "id": "local.my-plugin",
  "name": "local.my-plugin",
  "displayName": "My Plugin",
  "version": "1.0.0",
  "main": "scripts/main.cjs",
  "description": "My first WStudio plugin.",
  "engines": {
    "wstudio": "^2.0.0"
  },
  "activationEvents": [
    "onCommand:local.my-plugin.hello"
  ],
  "contributes": {
    "commands": [
      {
        "id": "local.my-plugin.hello",
        "title": "My Plugin: Hello",
        "category": "My Plugin",
        "icon": "assets/plugin-icon.svg"
      }
    ],
    "menus": [
      {
        "location": "statusBar",
        "command": "local.my-plugin.hello"
      }
    ],
    "settings": [
      {
        "key": "greetingText",
        "title": "Greeting Text",
        "description": "Message shown by the hello command.",
        "type": "string",
        "defaultValue": "Hello from My Plugin"
      }
    ]
  }
}
```

### `scripts/main.cjs`

```js
/**
 * 最小插件入口示例。
 */

module.exports = {
  async activate(context) {
    const disposable = context.commands.register('local.my-plugin.hello', async () => {
      const greeting = await context.settings.get('greetingText');
      const message = typeof greeting === 'string' && greeting.trim().length > 0
        ? greeting
        : 'Hello from My Plugin';

      await context.window.showInfo(message);

      return {
        type: 'handled',
        message,
      };
    });

    context.subscriptions.push(disposable);
  },
};
```

## `plugin.json` 关键字段

- `id`：插件唯一标识，不能重复
- `name`：插件包名，建议与 `id` 一致
- `main`：入口文件，相对插件根目录；当前建议使用 `scripts/main.cjs`
- `engines.wstudio`：宿主版本范围。当前平台版本是 `2.0.0`
- `activationEvents`：插件激活时机
- `contributes`：静态贡献点定义
- `commands[].icon`：状态栏入口图标来源，若被 `statusBar` 引用则必须声明 `.svg`
- `viewContainers[].icon`：ActivityBar 入口图标来源，必须声明 `.svg`

## 当前支持的激活事件

- `onStartupFinished`
- `onCommand:<commandId>`
- `onAiPanelCommand:<itemId>`
- `onAiPanelSkill:<itemId>`
- `onView:<viewId>`
- `onLanguage:<languageId>`
- `onSetting:<settingKey>`
- `workspaceContains:<glob>`
- `onUri:<uriPattern>`

## 当前支持的贡献点

- `commands`
- `menus`
- `viewContainers`
- `views`
- `webviews`
- `settings`
- `aiPanel.commands`
- `aiPanel.skills`

### `menus.location` 当前支持值

- `commandPalette`
- `editor/context`
- `note/context`
- `statusBar`
- `sidebar/title`

### `settings.type` 当前支持值

- `string`
- `number`
- `boolean`
- `select`

## 插件上下文 API

当前 `ExtensionContext` 提供这些主能力：

- `context.commands`
- `context.window`
- `context.workspace`
- `context.storage`
- `context.settings`
- `context.webview`
- `context.notes`
- `context.editor`
- `context.ai`
- `context.subscriptions`

源码入口：

- `packages/extension-api/src/context.ts`
- `packages/extension-api/src/contributes.ts`
- `packages/extension-api/src/manifest.ts`
- `packages/extension-api/src/plugin.ts`

## 双编辑器兼容说明

当前宿主内部同时存在两套编辑器实现：Monaco 和 CodeMirror。插件开发时不要把它们当作两个独立平台分别适配，而应只依赖 `ExtensionContext` 暴露的统一能力。

### 当前推荐做法

- 只通过 `context.editor` 访问编辑器能力
- 把插件逻辑建立在“文档文本、选区、文本编辑”这些语义能力之上
- 插件自己的复杂交互界面放在 `webview` 中实现
- 将编辑器相关功能设计成“能在两套编辑器下都成立”的能力

当前 `context.editor` 面向插件公开的是统一抽象，而不是具体编辑器实例。现阶段主要包括：

- `getActiveDocumentText()`
- `getSelection()`
- `applyTextEdits(documentUri, edits)`

### 不推荐的做法

- 不要假设当前一定是 Monaco 或一定是 CodeMirror
- 不要依赖编辑器内部 DOM 结构、类名、事件名或私有对象
- 不要在插件里写死面向某个编辑器实现的选择器、注入逻辑或补丁逻辑
- 不要把插件能力建立在宿主内部未公开的编辑器 API 上

### 后续扩展原则

后续如果平台要新增更强的编辑器插件能力，例如装饰器、自动补全、悬浮提示、行内组件或上下文动作，建议遵循下面的规则：

- 先定义统一的插件契约，再分别适配 Monaco 和 CodeMirror
- 只有两套编辑器都能稳定支持的能力，才作为默认公开能力
- 如果某项能力只能部分支持，应先设计 capability 检测和降级策略，再决定是否开放
- 如果某项能力明显强依赖某个编辑器内部实现，应优先作为宿主内部能力，不直接开放给第三方插件

简单理解：

- 双编辑器差异应该由宿主适配层承担
- 插件开发者应尽量无感知
- 公开插件 API 时，优先暴露“语义能力”，避免暴露“编辑器品牌能力”

## 权限模型

插件按需声明 `permissions`。当前支持：

- `storage`
- `workspace.read`
- `workspace.write`
- `workspace.search`
- `notes.read`
- `notes.write`
- `editor.read`
- `editor.write`
- `network`
- `ai.invoke`
- `webview`
- `shell.openExternal`

未声明权限时，对应能力会被宿主拒绝。

## 本地开发流程

### 1. 创建插件目录

```powershell
pnpm plugin:create plugin-dev/my-plugin
```

### 2. 显式指定调试目录

```powershell
$env:NOTE_STUDIO_EXTENSION_DIRS = (Resolve-Path ".\\plugin-dev\\my-plugin").Path
pnpm dev
```

如果需要同时加载多个目录，Windows 使用分号 `;` 分隔。

### 3. 校验插件

```powershell
pnpm --dir ".\\plugin-dev\\my-plugin" plugin:validate
```

### 4. 修改后重新加载插件

- 宿主会监听插件目录内容变化，并在保存 `plugin.json`、`scripts/`、`webviews/`、`assets/` 等文件后自动热重载插件
- 自动热重载是防抖触发的；连续保存多个文件时，宿主会在短暂合并后统一重载一次
- 如果插件在保存过程中暂时处于不合法状态，例如 `plugin.json` 缺字段或图标路径错误，入口会暂时消失，修正后会自动恢复
- 在应用内打开命令面板，执行 `开发: 重新加载插件`
- 这个命令会重新扫描插件目录，并重启已经激活过的插件宿主
- 如果只改了 `webviews/` 下的页面资源，关闭当前插件面板再重新打开，通常也能看到变化

### 5. 打包分发

```powershell
pnpm --dir ".\\plugin-dev\\my-plugin" plugin:pack
```

输出文件位于插件目录下的 `.packages/*.wspkg`。

## Starter 开发包

仓库已经生成一个可直接复制修改的开发包：

- 目录：`plugin-dev/wstudio-plugin-starter`
- 命令 ID：`local.wstudio-plugin-starter.open-panel`
- 宿主入口：`plugin-dev/wstudio-plugin-starter/scripts/main.cjs`
- Webview 页面：`plugin-dev/wstudio-plugin-starter/webviews/panel.html`
- Webview 脚本：`plugin-dev/wstudio-plugin-starter/scripts/panel.js`
- 插件资源：`plugin-dev/wstudio-plugin-starter/assets/plugin-icon.svg`

打包命令：

```powershell
pnpm --dir ".\\plugin-dev\\wstudio-plugin-starter" plugin:validate
pnpm --dir ".\\plugin-dev\\wstudio-plugin-starter" plugin:pack
```

当前 `plugin:create` 脚手架也已经同步升级，之后新生成的插件会默认带上这套完整目录结构和 `svg` 入口图标配置。

## 真实契约源码

如果需要查看最终生效的契约，请直接以下列源码为准：

- `packages/shared/src/types/extension.ts`
- `packages/shared/src/types/workbench-contribution.ts`
- `packages/extension-api/src/manifest.ts`
- `packages/extension-api/src/contributes.ts`
- `packages/extension-api/src/context.ts`
- `packages/extension-runtime/src/manifest/validateManifest.ts`
- `packages/main/src/plugins/PluginDiscoveryService.ts`
- `packages/main/src/plugins/WorkbenchContributionRegistry.ts`
- `packages/main/src/plugins/PluginCapabilityRouter.ts`
