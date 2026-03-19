const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const PLUGIN_DEV_ROOT = path.join(PROJECT_ROOT, 'plugin-dev');
const DEFAULT_PLATFORM_VERSION_RANGE = '^2.0.0';
const PACKAGE_OUTPUT_DIRECTORY_NAME = '.packages';

function normalizeSlashes(value) {
  return value.replace(/\\/g, '/');
}

function ensureDirectory(directoryPath) {
  fs.mkdirSync(directoryPath, { recursive: true });
}

function writeTextFile(filePath, content) {
  ensureDirectory(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
}

function writeJsonFile(filePath, data) {
  writeTextFile(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function toSlug(value) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^\.+|\.+$/g, '')
    .replace(/^-+|-+$/g, '');

  return normalized.length > 0 ? normalized : 'plugin';
}

function toDisplayName(value) {
  return value
    .split(/[.\-_]+/)
    .filter((segment) => segment.length > 0)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function deriveExtensionId(inputName) {
  const normalized = inputName
    .split('.')
    .map((segment) => toSlug(segment))
    .filter((segment) => segment.length > 0);

  if (normalized.length === 0) {
    return 'local.plugin';
  }

  if (normalized.length === 1) {
    return `local.${normalized[0]}`;
  }

  return normalized.join('.');
}

function deriveDirectoryName(inputName) {
  return inputName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '') || 'plugin';
}

function resolveTargetDirectory(rawTarget, cwd) {
  if (!rawTarget || rawTarget.trim().length === 0) {
    throw new Error('缺少插件目录名称或目标路径。');
  }

  const trimmed = rawTarget.trim();
  const hasPathSeparator = trimmed.includes('/') || trimmed.includes('\\');
  const isExplicitPath = path.isAbsolute(trimmed) || trimmed.startsWith('.');

  if (hasPathSeparator || isExplicitPath) {
    return path.resolve(cwd, trimmed);
  }

  return path.join(PLUGIN_DEV_ROOT, deriveDirectoryName(trimmed));
}

function buildProjectRootReference(targetDirectory) {
  const relativePath = path.relative(targetDirectory, PROJECT_ROOT);
  return normalizeSlashes(relativePath.length > 0 ? relativePath : '.');
}

function createScaffoldManifest(extensionId, displayName) {
  const commandId = `${extensionId}.open-panel`;
  const panelId = `${extensionId}.panel`;

  return {
    id: extensionId,
    name: extensionId,
    displayName,
    version: '1.0.0',
    main: 'scripts/main.cjs',
    description: `${displayName} starter package for WStudio plugin development.`,
    engines: {
      wstudio: DEFAULT_PLATFORM_VERSION_RANGE,
    },
    permissions: [
      'webview',
    ],
    activationEvents: [
      `onCommand:${commandId}`,
    ],
    contributes: {
      commands: [
        {
          id: commandId,
          title: `Open ${displayName} Panel`,
          category: displayName,
          icon: 'assets/plugin-icon.svg',
        },
      ],
      menus: [
        {
          location: 'commandPalette',
          command: commandId,
        },
        {
          location: 'statusBar',
          command: commandId,
          group: 'primary',
        },
      ],
      settings: [
        {
          key: 'panelTitle',
          title: 'Panel Title',
          description: 'Controls the title shown by the starter webview panel.',
          type: 'string',
          defaultValue: `${displayName} Panel`,
        },
      ],
      webviews: [
        {
          id: panelId,
          title: `${displayName} Panel`,
          entry: 'webviews/panel.html',
          retainContextWhenHidden: true,
        },
      ],
    },
  };
}

function createScaffoldPackageJson(targetDirectory, packageName) {
  const projectRootReference = buildProjectRootReference(targetDirectory);
  const pluginDirectoryReference = normalizeSlashes(path.relative(PROJECT_ROOT, targetDirectory));
  return {
    name: packageName,
    version: '1.0.0',
    private: true,
    type: 'commonjs',
    description: 'Note Studio plugin scaffold',
    scripts: {
      'plugin:validate': `pnpm --dir "${projectRootReference}" plugin:validate "${pluginDirectoryReference}"`,
      'plugin:pack': `pnpm --dir "${projectRootReference}" plugin:pack "${pluginDirectoryReference}"`,
    },
  };
}

function createScaffoldMainFile(extensionId, displayName) {
  const commandId = `${extensionId}.open-panel`;
  const panelId = `${extensionId}.panel`;
  const panelTitle = `${displayName} Panel`;
  return `/**
 * Plugin host entry for ${displayName}.
 * Registers the starter command and opens the styled webview panel.
 */

module.exports = {
  async activate(context) {
    const commandDisposable = context.commands.register('${commandId}', async () => {
      const configuredTitle = await context.settings.get('panelTitle');
      const resolvedTitle = typeof configuredTitle === 'string' && configuredTitle.trim().length > 0
        ? configuredTitle
        : '${panelTitle}';

      const panel = await context.webview.createPanel('${panelId}', resolvedTitle);
      const panelDisposable = panel.onMessage(async (message) => {
        const payload = message && typeof message === 'object' && !Array.isArray(message)
          ? message
          : null;
        const action = payload && typeof payload.action === 'string'
          ? payload.action
          : 'unknown';

        if (action === 'request-starter-state') {
          await panel.postMessage({
            type: 'starter-state',
            title: resolvedTitle,
            assetPath: '../assets/plugin-icon.svg',
            sentAt: new Date().toISOString(),
          });
          return;
        }

        await panel.postMessage({
          type: 'plugin-response',
          action,
          receivedAt: new Date().toISOString(),
          originalMessage: message,
        });
      });

      context.subscriptions.push(panelDisposable);

      await panel.postMessage({
        type: 'plugin-ready',
        title: resolvedTitle,
        message: 'Starter panel is ready.',
        sentAt: new Date().toISOString(),
      });

      await panel.reveal();
    });

    context.subscriptions.push(commandDisposable);
  },
};
`;
}

function createScaffoldPanelHtml(displayName) {
  return `<!-- Starter webview markup for the WStudio plugin scaffold. -->
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${displayName} Panel</title>
    <link rel="stylesheet" href="./panel.css" />
  </head>
  <body>
    <main class="starter-page">
      <section class="starter-hero">
        <img class="starter-hero__badge" src="../assets/plugin-icon.svg" alt="${displayName} icon" />
        <div class="starter-hero__content">
          <p class="starter-kicker">WStudio Plugin Package</p>
          <h1 class="starter-title">${displayName}</h1>
          <p class="starter-description">
            This starter demonstrates a complete plugin package with host code,
            a styled webview, and bundled static assets.
          </p>
        </div>
      </section>

      <section class="starter-card">
        <div class="starter-actions">
          <div class="starter-action" id="request-state" role="button" tabindex="0">
            Request Starter State
          </div>
          <div class="starter-action starter-action--secondary" id="send-ping" role="button" tabindex="0">
            Send Ping
          </div>
        </div>
      </section>

      <section class="starter-card">
        <pre class="starter-log" id="starter-log">Waiting for plugin messages...</pre>
      </section>
    </main>

    <script src="../scripts/panel.js"></script>
  </body>
</html>
`;
}

function createScaffoldPanelCss() {
  return `/* Styled starter panel for the WStudio plugin scaffold. */
:root {
  color-scheme: dark;
  font-family: "Segoe UI", sans-serif;
  --starter-bg: #0f1722;
  --starter-panel: rgba(19, 30, 43, 0.92);
  --starter-panel-strong: rgba(27, 40, 57, 0.98);
  --starter-border: rgba(140, 176, 221, 0.18);
  --starter-text: #ecf3ff;
  --starter-muted: #9eb1cf;
  --starter-accent: #4d96ff;
  --starter-accent-strong: #2d74dd;
  --starter-shadow: 0 18px 40px rgba(0, 0, 0, 0.26);
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  background:
    radial-gradient(circle at top left, rgba(77, 150, 255, 0.18), transparent 36%),
    linear-gradient(180deg, #111a27 0%, var(--starter-bg) 100%);
  color: var(--starter-text);
}

.starter-page {
  display: grid;
  gap: 16px;
  min-height: 100vh;
  padding: 20px;
}

.starter-hero,
.starter-card {
  border: 1px solid var(--starter-border);
  border-radius: 18px;
  background: linear-gradient(180deg, var(--starter-panel-strong), var(--starter-panel));
  box-shadow: var(--starter-shadow);
}

.starter-hero {
  display: grid;
  grid-template-columns: 92px 1fr;
  gap: 18px;
  align-items: center;
  padding: 20px;
}

.starter-hero__badge {
  width: 92px;
  height: 92px;
  display: block;
}

.starter-kicker {
  margin: 0 0 8px;
  color: var(--starter-muted);
  font-size: 12px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.starter-title {
  margin: 0 0 10px;
  font-size: 28px;
  line-height: 1.1;
}

.starter-description {
  margin: 0;
  color: var(--starter-muted);
  line-height: 1.6;
}

.starter-card {
  padding: 18px;
}

.starter-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.starter-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 40px;
  padding: 0 18px;
  border-radius: 999px;
  background: linear-gradient(180deg, var(--starter-accent), var(--starter-accent-strong));
  color: #ffffff;
  cursor: pointer;
  user-select: none;
  transition: transform 120ms ease, opacity 120ms ease;
}

.starter-action:hover,
.starter-action:focus-visible {
  transform: translateY(-1px);
  opacity: 0.96;
  outline: none;
}

.starter-action--secondary {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--starter-border);
}

.starter-log {
  margin: 0;
  min-height: 220px;
  padding: 14px;
  border-radius: 14px;
  background: rgba(7, 11, 18, 0.78);
  color: #dbe8ff;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.5;
}

@media (max-width: 640px) {
  .starter-hero {
    grid-template-columns: 1fr;
  }

  .starter-hero__badge {
    width: 72px;
    height: 72px;
  }

  .starter-title {
    font-size: 24px;
  }
}
`;
}

function createScaffoldPanelJs() {
  return `/**
 * Starter panel client script for the WStudio plugin scaffold.
 */

const logElement = document.getElementById('starter-log');
let pingCount = 0;

function appendLog(label, payload) {
  if (!logElement) {
    return;
  }

  const current = logElement.textContent || '';
  const nextLine = \`\${label}: \${JSON.stringify(payload, null, 2)}\`;
  logElement.textContent = current === 'Waiting for plugin messages...'
    ? nextLine
    : \`\${current}\\n\\n\${nextLine}\`;
}

function emit(message) {
  window.parent.postMessage(message, '*');
  appendLog('iframe -> host', message);
}

function bindAction(elementId, getMessage) {
  const element = document.getElementById(elementId);
  if (!element) {
    return;
  }

  const trigger = () => {
    emit(getMessage());
  };

  element.addEventListener('click', trigger);
  element.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      trigger();
    }
  });
}

bindAction('request-state', () => ({
  action: 'request-starter-state',
}));

bindAction('send-ping', () => {
  pingCount += 1;
  return {
    action: 'ping',
    count: pingCount,
    sentAt: new Date().toISOString(),
  };
});

window.addEventListener('message', (event) => {
  appendLog('host -> iframe', event.data);
});
`;
}

function createScaffoldPluginIconSvg(displayName) {
  return `<svg width="128" height="128" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="128" height="128" rx="32" fill="url(#starterGradient)"/>
  <rect x="18" y="18" width="92" height="92" rx="24" fill="rgba(11,18,28,0.18)"/>
  <path d="M38 41H56L69 73L82 41H90L72 88H64L46 41H38Z" fill="white"/>
  <path d="M34 96H94" stroke="rgba(255,255,255,0.72)" stroke-width="8" stroke-linecap="round"/>
  <circle cx="95" cy="34" r="10" fill="rgba(255,255,255,0.92)"/>
  <path d="M90 34h10" stroke="#1D4FD7" stroke-width="4" stroke-linecap="round"/>
  <path d="M95 29v10" stroke="#1D4FD7" stroke-width="4" stroke-linecap="round"/>
  <defs>
    <linearGradient id="starterGradient" x1="16" y1="12" x2="108" y2="116" gradientUnits="userSpaceOnUse">
      <stop stop-color="#4D96FF"/>
      <stop offset="1" stop-color="#1D4FD7"/>
    </linearGradient>
  </defs>
</svg>
`;
}

function createScaffoldReadme(displayName) {
  return `# ${displayName}

这是一个完整的 WStudio 插件开发包模板，包含宿主入口、webview 页面、样式、浏览器脚本和静态资源。

## 推荐目录结构

\`\`\`text
${deriveDirectoryName(displayName)}/
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
\`\`\`

## 目录职责

- \`plugin.json\`：插件 manifest 和贡献点声明
- \`scripts/main.cjs\`：宿主侧入口，注册命令并调用插件 API
- \`scripts/panel.js\`：webview 中的浏览器脚本，处理页面交互和消息通信
- \`webviews/\`：插件自己的页面和样式资源
- \`assets/\`：图标、图片等静态资源
- \`README.md\`：安装、调试和打包说明

## 常用命令

\`\`\`bash
pnpm plugin:validate
pnpm plugin:pack
\`\`\`

## 调试方式

1. 设置 \`NOTE_STUDIO_EXTENSION_DIRS\` 指向当前插件目录。
2. 启动 WStudio。
3. 从命令面板或状态栏执行 \`Open ${displayName} Panel\`。`;
}

function ensureTargetDirectoryIsWritable(targetDirectory) {
  if (!fs.existsSync(targetDirectory)) {
    return;
  }

  const entries = fs.readdirSync(targetDirectory);
  if (entries.length > 0) {
    throw new Error(`目标目录已存在且不为空: ${targetDirectory}`);
  }
}

function createStarterReadme(displayName) {
  return `# ${displayName}

这是一个完整的 WStudio 插件开发包模板，包含宿主入口、webview 页面、样式、浏览器脚本和静态资源。

## 推荐目录结构

\`\`\`text
${deriveDirectoryName(displayName)}/
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
\`\`\`

## 目录职责

- \`plugin.json\`：插件 manifest 和贡献点声明
- \`scripts/main.cjs\`：宿主侧入口，注册命令并调用插件 API
- \`scripts/panel.js\`：webview 中的浏览器脚本，处理页面交互和消息通信
- \`webviews/\`：插件自己的页面和样式资源
- \`assets/\`：图标、图片等静态资源
- \`README.md\`：安装、调试和打包说明

## 入口图标规则

- 插件入口必须使用图标，不使用文字入口
- \`statusBar\` 入口使用 \`commands[].icon\`
- \`viewContainers\` 入口使用 \`viewContainers[].icon\`
- 入口图标必须指向插件目录内的 \`.svg\` 文件
- 脚手架默认使用 \`assets/plugin-icon.svg\`

## 常用命令

\`\`\`bash
pnpm plugin:validate
pnpm plugin:pack
\`\`\`

## 调试方式

1. 设置 \`NOTE_STUDIO_EXTENSION_DIRS\` 指向当前插件目录
2. 启动 WStudio
3. 通过命令面板或状态栏图标入口执行 \`Open ${displayName} Panel\`
`;
}

function createScaffold(targetDirectory, rawName) {
  const displayName = toDisplayName(rawName);
  const extensionId = deriveExtensionId(rawName);
  const packageName = deriveDirectoryName(rawName);
  const manifest = createScaffoldManifest(extensionId, displayName);
  const packageJson = createScaffoldPackageJson(targetDirectory, packageName);

  ensureTargetDirectoryIsWritable(targetDirectory);
  ensureDirectory(targetDirectory);

  writeJsonFile(path.join(targetDirectory, 'package.json'), packageJson);
  writeJsonFile(path.join(targetDirectory, 'plugin.json'), manifest);
  writeTextFile(path.join(targetDirectory, 'scripts', 'main.cjs'), createScaffoldMainFile(extensionId, displayName));
  writeTextFile(path.join(targetDirectory, 'webviews', 'panel.html'), createScaffoldPanelHtml(displayName));
  writeTextFile(path.join(targetDirectory, 'webviews', 'panel.css'), createScaffoldPanelCss());
  writeTextFile(path.join(targetDirectory, 'scripts', 'panel.js'), createScaffoldPanelJs());
  writeTextFile(path.join(targetDirectory, 'assets', 'plugin-icon.svg'), createScaffoldPluginIconSvg(displayName));
  writeTextFile(path.join(targetDirectory, 'README.md'), createStarterReadme(displayName));

  return {
    targetDirectory,
    extensionId,
    displayName,
    packageName,
  };
}

function resolvePluginDirectory(inputDirectory, cwd) {
  if (!inputDirectory || inputDirectory.trim().length === 0) {
    return cwd;
  }

  return path.resolve(cwd, inputDirectory.trim());
}

function loadValidatorModules() {
  const runtimeDistPath = path.join(PROJECT_ROOT, 'packages', 'extension-runtime', 'dist', 'cjs');
  const sharedDistPath = path.join(PROJECT_ROOT, 'packages', 'shared', 'dist', 'cjs');

  if (!fs.existsSync(runtimeDistPath) || !fs.existsSync(sharedDistPath)) {
    throw new Error(
      '插件校验器尚未构建，请先运行 `pnpm --filter @note-studio/shared build` 和 `pnpm --filter @note-studio/extension-runtime build`。'
    );
  }

  const runtimeModule = require(runtimeDistPath);
  const sharedModule = require(sharedDistPath);

  return {
    validateExtensionManifest: runtimeModule.validateExtensionManifest,
    EXTENSION_PLATFORM_VERSION: sharedModule.EXTENSION_PLATFORM_VERSION,
  };
}

function validatePluginDirectory(pluginDirectory) {
  const manifestPath = path.join(pluginDirectory, 'plugin.json');

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`未找到 plugin.json: ${manifestPath}`);
  }

  const manifest = readJsonFile(manifestPath);
  const { validateExtensionManifest, EXTENSION_PLATFORM_VERSION } = loadValidatorModules();
  const validation = validateExtensionManifest(manifest, {
    hostVersion: EXTENSION_PLATFORM_VERSION,
    rootDirectory: pluginDirectory,
    existingExtensionIds: [],
  });

  return {
    manifestPath,
    manifest,
    validation,
  };
}

function formatValidationIssues(issues) {
  return issues
    .map((issue, index) => `${index + 1}. [${issue.code}] ${issue.path}: ${issue.message}`)
    .join('\n');
}

function copyDirectoryContents(sourceDirectory, targetDirectory, excludedNames) {
  ensureDirectory(targetDirectory);

  const entries = fs.readdirSync(sourceDirectory, { withFileTypes: true });
  for (const entry of entries) {
    if (excludedNames.has(entry.name)) {
      continue;
    }

    const sourcePath = path.join(sourceDirectory, entry.name);
    const targetPath = path.join(targetDirectory, entry.name);

    if (entry.isDirectory()) {
      copyDirectoryContents(sourcePath, targetPath, excludedNames);
      continue;
    }

    if (entry.isFile()) {
      ensureDirectory(path.dirname(targetPath));
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

function sanitizePackageFileName(inputValue) {
  return inputValue.replace(/[^a-z0-9._-]+/gi, '-');
}

function defaultPackageOutputDirectory(pluginDirectory) {
  return path.join(pluginDirectory, PACKAGE_OUTPUT_DIRECTORY_NAME);
}

function archiveDirectory(sourceDirectory, targetArchivePath) {
  ensureDirectory(path.dirname(targetArchivePath));

  const zipPath = targetArchivePath.endsWith('.zip')
    ? targetArchivePath
    : `${targetArchivePath}.zip`;

  if (fs.existsSync(zipPath)) {
    fs.rmSync(zipPath, { force: true });
  }
  if (fs.existsSync(targetArchivePath)) {
    fs.rmSync(targetArchivePath, { force: true });
  }

  if (process.platform === 'win32') {
    const escapedSource = sourceDirectory.replace(/'/g, "''");
    const escapedTarget = zipPath.replace(/'/g, "''");
    const command = `Compress-Archive -Path '${escapedSource}\\*' -DestinationPath '${escapedTarget}' -Force`;
    const result = spawnSync('powershell', ['-NoProfile', '-Command', command], {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
    });

    if (result.status !== 0) {
      throw new Error(result.stderr || result.stdout || 'PowerShell Compress-Archive 执行失败。');
    }
  } else {
    const result = spawnSync('zip', ['-qr', zipPath, '.'], {
      cwd: sourceDirectory,
      encoding: 'utf8',
    });

    if (result.status !== 0) {
      throw new Error(result.stderr || result.stdout || 'zip 命令执行失败。');
    }
  }

  if (zipPath !== targetArchivePath) {
    fs.renameSync(zipPath, targetArchivePath);
  }
}

function packagePluginDirectory(pluginDirectory, outputDirectory) {
  const { manifest, validation } = validatePluginDirectory(pluginDirectory);

  if (!validation.valid) {
    throw new Error(`插件 manifest 校验失败：\n${formatValidationIssues(validation.issues)}`);
  }

  const stagingRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'note-studio-plugin-'));
  const stagingDirectory = path.join(stagingRoot, 'package');
  const excludedNames = new Set([
    'node_modules',
    '.git',
    '.turbo',
    PACKAGE_OUTPUT_DIRECTORY_NAME,
  ]);

  try {
    copyDirectoryContents(pluginDirectory, stagingDirectory, excludedNames);

    const packageFileName = `${sanitizePackageFileName(manifest.id)}-${sanitizePackageFileName(manifest.version)}.wspkg`;
    const packagePath = path.join(outputDirectory, packageFileName);
    archiveDirectory(stagingDirectory, packagePath);

    return {
      packagePath,
      manifest,
    };
  } finally {
    fs.rmSync(stagingRoot, { recursive: true, force: true });
  }
}

module.exports = {
  PACKAGE_OUTPUT_DIRECTORY_NAME,
  PROJECT_ROOT,
  PLUGIN_DEV_ROOT,
  createScaffold,
  defaultPackageOutputDirectory,
  formatValidationIssues,
  packagePluginDirectory,
  resolvePluginDirectory,
  resolveTargetDirectory,
  validatePluginDirectory,
};

