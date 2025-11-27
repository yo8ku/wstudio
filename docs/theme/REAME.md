# 主题系统完整概览

 1. 核心层 (packages/theme/src/theme-system/)
    ├── types/          - 主题类型定义
    ├── parsers/        - VSCode主题解析器
    └── core/           - 主题注册表和合并器

 2. 主进程层 (packages/main/src/)
    ├── services/ThemeService.ts  - 主题管理服务（支持 JSON 和 JSONC 格式）
    └── ipc/themeHandlers.ts      - IPC通信处理

 3. 渲染进程层 (packages/renderer/src/)
    ├── services/ThemeService.ts  - 渲染进程主题服务
    ├── stores/themeStore.ts      - Zustand状态管理
    └── command-center/ThemeCommandProvider.ts - 命令中心集成

## 🆕 支持的主题文件格式

主题系统现在支持以下两种格式：

- **`.json`** - 标准 JSON 格式（不支持注释）
- **`.jsonc`** - 带注释的 JSON 格式（**推荐用于自定义主题**）

JSONC 格式允许您在主题配置文件中添加注释，使主题更易于理解和维护。详情请参阅 [带注释的自定义主题指南](./custom-theme-with-comments.md)。

# 目录结构
  核心主题系统：
    packages/theme/src/theme-system/ - 主题系统核心代码
    types/app-theme.ts - 主题类型定义（AppTheme, ThemeConfig等）
    core/theme-registry.ts - 主题注册表（管理所有主题）
    core/theme-merger.ts - 主题合并器（合并基础主题和自定义颜色）
    parsers/ - VSCode主题解析器
    内置主题：
    packages/theme/themes/builtin/ - 内置主题源文件
    Dark/solarized-pro/ - Solarized Pro 深色主题
    Light/quiet/ - Quiet Light 浅色主题
    packages/renderer/public/core-themes/ - 编译后的主题CSS文件

# 用户主题存储位置
    Windows: C:\Users\Administrator\AppData\Roaming\note-studio\themes\
    user/ - 用户导入的主题
    market/ - 从主题市场下载的主题


# 主题数据结构
```json
    {
      id: "solarized-pro",
      name: "Solarized Pro",
      type: "dark" | "light" | "hc" | "hcLight",
      author: "作者名",
      description: "主题描述",
      version: "1.0.0",

      // 颜色映射
      colors: {
        "editor.background": "#002b36",
        "editor.foreground": "#839496",
        "titleBar.activeBackground": "#002b36",
        "sideBar.background": "#00212b",
        // ... 更多颜色键
      },

      // 语法高亮规则
      tokenColors: [
        {
          name: "Comments",
          scope: ["comment", "punctuation.definition.comment"],
          settings: {
            foreground: "#586e75",
            fontStyle: "italic"
          }
        }
      ]
    }
```

# 主题配置（存储在 electron-store）
```json
    {
      "theme-config": {
        "activeThemeId": "solarized-pro",
        "customColors": {
          "editor.background": "#1a1a1a",
          "titleBar.activeBackground": "#ff0000"
        },
        "recentThemes": ["solarized-pro", "quiet-light"],
        "favoriteThemes": ["solarized-pro"]
      }
    }
```
# 核心功能
  1. 主题注册表（ThemeRegistry）
        管理所有已加载的主题
        提供主题查询、搜索、过滤功能
        支持主题分类（按类型、来源）
        记录主题使用统计（使用次数、最后使用时间）
        收藏主题管理
        主要方法：
        register() - 注册主题
        getTheme() - 获取主题
        getAllThemes() - 获取所有主题
        searchThemes() - 搜索主题
        toggleFavorite() - 切换收藏状态
        recordThemeUsage() - 记录使用
  2. 主题合并器（ThemeMerger）
        合并基础主题和用户自定义颜色
        提取主题差异
        验证自定义颜色
        重置颜色到基础主题
        创建主题变体（调整亮度/饱和度）
        主要方法：
        merge() - 合并主题和自定义颜色
        mergeMultiple() - 合并多个主题
        extractCustomColors() - 提取自定义颜色
        validateCustomColors() - 验证自定义颜色
  3. 主题服务（ThemeService）
        主进程服务功能：
        初始化主题系统
        加载内置主题（从项目目录）
        加载用户主题（从用户数据目录）
        保存/删除主题
        管理主题配置
        应用主题和自定义颜色
        渲染进程服务功能：
        通过IPC与主进程通信
        监听主题变更事件
        提供主题操作接口


# 状态管理（themeStore - Zustand）
```json
      {
        // 状态
        currentTheme: ThemeData | null,
        themeList: ThemeInfo[],
        isLoading: boolean,
        error: string | null,

        // 操作
        initialize(),              // 初始化主题系统
        setTheme(),               // 设置主题
        setCustomColors(),        // 设置自定义颜色
        resetCustomColors(),      // 重置自定义颜色
        refreshThemeList(),       // 刷新主题列表
        toggleFavorite(),         // 切换收藏
        applyThemeToDOM()         // 应用主题到DOM
      }
```

# 命令中心集成
    通过 ThemeCommandProvider 集成到命令中心：
    可用命令：
        首选项: 颜色主题 - 打开主题选择器
        首选项: 创建自定义主题 - 创建自定义主题配置文件
        首选项: 刷新主题列表 - 重新加载所有主题
        首选项: 重置自定义颜色 - 清除自定义颜色
    主题预览功能：
        鼠标悬停在主题上即可预览
        ESC取消会恢复原主题
        Enter确认应用主题
    
    自定义主题创建：
        1. 打开命令中心（F1 或 Ctrl+Shift+P）
        2. 搜索并执行"首选项: 创建自定义主题"命令
        3. 系统会自动创建一个基于当前主题的配置文件
        4. 在编辑器中修改颜色配置
        5. 保存文件（Ctrl+S）即可应用自定义主题
    
    自定义主题配置格式：
        {
          "workbench.colorCustomizations": {
            "name": "我的自定义主题",
            "author": "User",
            "description": "基于某主题的自定义主题",
            "themeType": "dark" | "light" | "auto",
            "colors": {
              "editor.background": "#1e1e1e",
              "editor.foreground": "#d4d4d4",
              "sideBar.background": "#252526",
              // ... 更多颜色配置
            }
          }
        }
    📦 内置主题
    目前有 2个内置主题：
        Solarized Pro（深色）
        ID: solarized-pro
        基于经典Solarized配色方案
        适合长时间编码
    Quiet Light（浅色）
    ID: quiet-light
    柔和的浅色主题
    护眼设计

# 支持的颜色类别
    主题包含 300+ 颜色配置项，覆盖：
    编辑器：背景、前景、行号、光标、选中文本等
    标题栏：背景、前景、边框
    侧边栏：背景、标题、分组头
    活动栏：背景、前景、徽章
    状态栏：背景、前景、调试模式颜色
    标签页：激活/非激活状态
    输入框：背景、边框、验证状态
    按钮：背景、悬停、禁用状态
    列表：选中、悬停、焦点
    终端：ANSI颜色（16色）
    命令中心：背景、前景、边框
    Git装饰：修改、新增、删除、冲突
    语法高亮：注释、关键字、字符串、数字等

# 未来计划功能
  ✅ 主题市场（浏览和下载社区主题）
  ✅ 主题导入/导出
  ✅ 主题编辑器（可视化编辑）
  ✅ 主题预览功能（已实现）
