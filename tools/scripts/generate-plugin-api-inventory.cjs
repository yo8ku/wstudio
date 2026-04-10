/**
 * Generates a categorized public API inventory for the WStudio plugin SDK.
 *
 * The output is intended to be the durable baseline for phased API demo
 * coverage and manual host verification.
 */

const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const repoRoot = path.resolve(__dirname, '..', '..');
const pluginSrcRoot = path.join(repoRoot, 'packages', 'plugin', 'src');
const pluginEntry = path.join(pluginSrcRoot, 'index.ts');
const obsidianEntry = path.join(repoRoot, 'Obsidian_plugin', 'obsidian.d.ts');
const outputPath = path.join(repoRoot, 'packages', 'plugin', 'docs', 'API_INVENTORY.md');

const structuredKinds = new Set(['class', 'interface']);

const categoryRules = [
  {
    id: 'lifecycle',
    title: 'P0 核心生命周期与组件树',
    description:
      '覆盖插件加载、卸载、启停、事件回收、子组件树管理，以及与宿主生命周期直接相关的基础能力。',
    demos: ['demo-lifecycle-basic', 'demo-global-event-timer'],
    modules: new Set([
      'core/Component.ts',
      'core/Plugin.ts',
      'types/closeable.ts',
      'types/disposable.ts',
      'types/events.ts',
      'types/lifecycle.ts',
      'types/tasks.ts',
    ]),
  },
  {
    id: 'commands-and-ui',
    title: 'P0 命令、通知、模态框与基础 UI',
    description:
      '覆盖命令注册、通知、模态框、菜单、建议组件、基础 UI 元素，以及插件入口交互能力。',
    demos: [
      'demo-ui-entry',
      'demo-command-notice-modal',
      'demo-menu-context',
      'demo-suggest-basic',
    ],
    modules: new Set([
      'core/Control.ts',
      'core/Menu.ts',
      'core/Modal.ts',
      'core/Notice.ts',
      'core/Suggest.ts',
      'types/command.ts',
      'types/keymap.ts',
      'types/notice.ts',
      'types/suggest.ts',
      'types/ui.ts',
    ]),
  },
  {
    id: 'settings',
    title: 'P0 设置、Manifest 与持久化',
    description:
      '覆盖插件清单、设置页、设置项、保存与读取数据，以及与发布形态相关的元数据约束。',
    demos: ['demo-settings-persistence', 'demo-manifest-release-channel'],
    modules: new Set([
      'core/Setting.ts',
      'core/SettingTab.ts',
      'types/json.ts',
      'types/manifest.ts',
    ]),
  },
  {
    id: 'workspace-and-views',
    title: 'P1 App、Workspace 与视图系统',
    description:
      '覆盖 App 宿主对象、工作区、视图、文件视图、工作台贡献以及与布局相关的能力。',
    demos: ['demo-view-workspace', 'demo-workspace-leaf-routing'],
    modules: new Set([
      'core/FileView.ts',
      'core/View.ts',
      'types/app.ts',
      'types/view.ts',
    ]),
  },
  {
    id: 'editor',
    title: 'P1 编辑器与输入建议',
    description:
      '覆盖编辑器读写、选择区、交易、编辑器建议，以及编辑器与命令、视图之间的联动。',
    demos: ['demo-editor-basic', 'demo-editor-suggest'],
    modules: new Set(['types/editor.ts']),
  },
  {
    id: 'vault-and-metadata',
    title: 'P1 文件系统、Markdown 与元数据',
    description:
      '覆盖 Vault、文件管理、元数据缓存、Markdown 处理、渲染工具，以及文件级别的宿主能力。',
    demos: ['demo-vault-file-ops', 'demo-metadata-markdown', 'demo-markdown-render'],
    modules: new Set([
      'types/file-manager.ts',
      'types/markdown.ts',
      'types/metadata.ts',
      'types/render.ts',
      'types/vault.ts',
    ]),
  },
  {
    id: 'protocol-and-platform',
    title: 'P1 协议、平台与运行时工具',
    description:
      '覆盖 HTTP 请求、协议处理、平台探测、路径与 HTML 工具，以及宿主桥接的基础运行时能力。',
    demos: ['demo-network-protocol', 'demo-platform-utils'],
    modules: new Set([
      'types/module.ts',
      'types/platform.ts',
      'types/protocol.ts',
    ]),
  },
  {
    id: 'bases',
    title: 'P2 Bases 与数据建模',
    description:
      '覆盖 Bases 视图、配置、属性值模型以及与结构化数据视图相关的 API。',
    demos: ['demo-bases-overview'],
    modules: new Set(['types/base.ts', 'types/bases.ts']),
  },
];

const fallbackCategory = {
  id: 'uncategorized',
  title: 'P2 待补充归类接口',
  description: '用于收纳暂未命中分类规则的导出，避免遗漏。',
  demos: ['待补充'],
  modules: new Set(),
};

function createProgram(entryPath) {
  return ts.createProgram([entryPath], {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
    esModuleInterop: true,
    skipLibCheck: true,
    strict: false,
    noEmit: true,
  });
}

function resolveAliasedSymbol(checker, symbol) {
  if ((symbol.flags & ts.SymbolFlags.Alias) !== 0) {
    return checker.getAliasedSymbol(symbol);
  }

  return symbol;
}

function getSymbolKind(symbol) {
  if ((symbol.flags & ts.SymbolFlags.Class) !== 0) {
    return 'class';
  }

  if ((symbol.flags & ts.SymbolFlags.Interface) !== 0) {
    return 'interface';
  }

  if ((symbol.flags & ts.SymbolFlags.TypeAlias) !== 0) {
    return 'type';
  }

  if ((symbol.flags & ts.SymbolFlags.Enum) !== 0) {
    return 'enum';
  }

  if ((symbol.flags & ts.SymbolFlags.Function) !== 0) {
    return 'function';
  }

  if ((symbol.flags & ts.SymbolFlags.Variable) !== 0) {
    return 'variable';
  }

  return 'other';
}

function getModuleSymbol(program, entryPath) {
  const sourceFile = program.getSourceFile(entryPath);

  if (sourceFile === undefined || sourceFile.symbol === undefined) {
    throw new Error(`Failed to load module symbol for ${entryPath}`);
  }

  return sourceFile.symbol;
}

function getDeclaredType(checker, symbol) {
  try {
    return checker.getDeclaredTypeOfSymbol(symbol);
  } catch {
    return null;
  }
}

function hasNonPublicModifier(declaration) {
  const modifiers = ts.canHaveModifiers(declaration)
    ? ts.getModifiers(declaration)
    : undefined;

  if (modifiers === undefined) {
    return false;
  }

  return modifiers.some(
    (modifier) =>
      modifier.kind === ts.SyntaxKind.PrivateKeyword ||
      modifier.kind === ts.SyntaxKind.ProtectedKeyword,
  );
}

function isPublicMember(symbol) {
  if (symbol.getName().startsWith('__@')) {
    return false;
  }

  const declarations = symbol.getDeclarations();

  if (declarations === undefined || declarations.length === 0) {
    return true;
  }

  return declarations.some((declaration) => !hasNonPublicModifier(declaration));
}

function getTypeMemberNames(checker, symbol) {
  const type = getDeclaredType(checker, symbol);

  if (type === null) {
    return [];
  }

  return checker
    .getPropertiesOfType(type)
    .filter((member) => isPublicMember(member))
    .map((member) => member.getName())
    .sort((left, right) => left.localeCompare(right));
}

function getSourceModuleRelativePath(symbol) {
  const declarations = symbol.getDeclarations() ?? [];

  for (const declaration of declarations) {
    const sourceFile = declaration.getSourceFile();
    const relativePath = path.relative(pluginSrcRoot, sourceFile.fileName).replace(/\\/g, '/');

    if (relativePath.length === 0 || relativePath.startsWith('../')) {
      continue;
    }

    return relativePath;
  }

  return 'index.ts';
}

function getModuleExports(entryPath) {
  const program = createProgram(entryPath);
  const checker = program.getTypeChecker();
  const moduleSymbol = getModuleSymbol(program, entryPath);
  const exportsMap = new Map();

  for (const exportedSymbol of checker.getExportsOfModule(moduleSymbol)) {
    const symbol = resolveAliasedSymbol(checker, exportedSymbol);
    const name = exportedSymbol.getName();
    const kind = getSymbolKind(symbol);

    exportsMap.set(name, {
      name,
      kind,
      sourceModule: getSourceModuleRelativePath(symbol),
      memberNames: structuredKinds.has(kind) ? getTypeMemberNames(checker, symbol) : [],
    });
  }

  return exportsMap;
}

function diffNames(left, right) {
  return left.filter((name) => !right.includes(name));
}

function getCategoryForModule(modulePath) {
  for (const rule of categoryRules) {
    if (rule.modules.has(modulePath)) {
      return rule;
    }
  }

  return fallbackCategory;
}

function buildInventory() {
  const pluginExports = getModuleExports(pluginEntry);
  const obsidianExports = getModuleExports(obsidianEntry);
  const categories = new Map();

  for (const rule of [...categoryRules, fallbackCategory]) {
    categories.set(rule.id, {
      ...rule,
      records: [],
    });
  }

  for (const record of [...pluginExports.values()].sort((left, right) => left.name.localeCompare(right.name))) {
    const obsidianRecord = obsidianExports.get(record.name);
    const category = categories.get(getCategoryForModule(record.sourceModule).id);

    if (category === undefined) {
      continue;
    }

    const memberDiff =
      obsidianRecord !== undefined &&
      structuredKinds.has(record.kind) &&
      structuredKinds.has(obsidianRecord.kind)
        ? {
            missingMembers: diffNames(obsidianRecord.memberNames, record.memberNames),
            extraMembers: diffNames(record.memberNames, obsidianRecord.memberNames),
          }
        : null;

    category.records.push({
      ...record,
      compatibility: obsidianRecord === undefined ? 'WStudio 扩展' : 'Obsidian 兼容',
      memberDiff,
    });
  }

  return [...categories.values()];
}

function formatList(values) {
  if (values.length === 0) {
    return '无';
  }

  return values.map((value) => `\`${value}\``).join('、');
}

function renderSummaryRows(categories) {
  return categories
    .filter((category) => category.records.length > 0)
    .map((category) => {
      const exportCount = category.records.length;
      const memberCount = category.records.reduce(
        (total, record) => total + record.memberNames.length,
        0,
      );
      const compatibleCount = category.records.filter(
        (record) => record.compatibility === 'Obsidian 兼容',
      ).length;
      const extensionCount = exportCount - compatibleCount;

      return `| ${category.title} | ${exportCount} | ${memberCount} | ${compatibleCount} | ${extensionCount} | ${category.demos.join(' / ')} |`;
    })
    .join('\n');
}

function renderRecord(record, category) {
  const lines = [
    `#### \`${record.name}\` (\`${record.kind}\`)`,
    `- 源模块: \`packages/plugin/src/${record.sourceModule}\``,
    `- 分类: \`${category.title}\``,
    `- 建议 Demo: \`${category.demos.join(' / ')}\``,
    `- 兼容性: \`${record.compatibility}\``,
    '- 初始状态: `待测试`',
    '- 人工确认: `待确认`',
  ];

  if (record.memberDiff !== null) {
    const hasDiff =
      record.memberDiff.missingMembers.length > 0 ||
      record.memberDiff.extraMembers.length > 0;

    lines.push(
      `- 成员差异: ${
        hasDiff
          ? `缺失 ${formatList(record.memberDiff.missingMembers)}；扩展 ${formatList(record.memberDiff.extraMembers)}`
          : '`无`'
      }`,
    );
  }

  if (record.memberNames.length > 0) {
    lines.push('', `<details>`, `<summary>公共成员（${record.memberNames.length}）</summary>`, '');

    for (const memberName of record.memberNames) {
      lines.push(`- \`${memberName}\``);
    }

    lines.push('', `</details>`);
  }

  return lines.join('\n');
}

function renderCategory(category) {
  const exportCount = category.records.length;
  const memberCount = category.records.reduce(
    (total, record) => total + record.memberNames.length,
    0,
  );
  const compatibleCount = category.records.filter(
    (record) => record.compatibility === 'Obsidian 兼容',
  ).length;
  const extensionCount = exportCount - compatibleCount;
  const modules = new Map();

  for (const record of category.records) {
    const bucket = modules.get(record.sourceModule) ?? [];
    bucket.push(record);
    modules.set(record.sourceModule, bucket);
  }

  const lines = [
    `## ${category.title}`,
    '',
    `- 目标: ${category.description}`,
    `- 建议 Demo: \`${category.demos.join(' / ')}\``,
    `- 导出数: ${exportCount}`,
    `- 公共成员数: ${memberCount}`,
    `- Obsidian 兼容导出: ${compatibleCount}`,
    `- WStudio 扩展导出: ${extensionCount}`,
    '',
  ];

  for (const [modulePath, records] of [...modules.entries()].sort((left, right) =>
    left[0].localeCompare(right[0]),
  )) {
    lines.push(`### \`${modulePath}\``, '');

    for (const record of records.sort((left, right) => left.name.localeCompare(right.name))) {
      lines.push(renderRecord(record, category), '');
    }
  }

  return lines.join('\n').trimEnd();
}

function renderInventory(categories) {
  const activeCategories = categories.filter((category) => category.records.length > 0);
  const totalExports = activeCategories.reduce(
    (total, category) => total + category.records.length,
    0,
  );
  const totalMembers = activeCategories.reduce(
    (total, category) =>
      total + category.records.reduce((categoryTotal, record) => categoryTotal + record.memberNames.length, 0),
    0,
  );
  const totalCompatible = activeCategories.reduce(
    (total, category) =>
      total + category.records.filter((record) => record.compatibility === 'Obsidian 兼容').length,
    0,
  );
  const totalExtensions = totalExports - totalCompatible;

  const sections = [
    '# WStudio Plugin API Inventory',
    '',
    '> 此文档由 `pnpm run plugin:api:inventory` 自动生成，请不要手工编辑导出清单段落。',
    '',
    '## 用途',
    '',
    '- 作为 `wstudio-api` / `@note-studio/plugin` 的全量接口底表。',
    '- 为后续 demo 插件、分批测试、人工确认提供统一索引。',
    '- 明确区分 Obsidian 兼容导出与 WStudio 自有扩展导出。',
    '',
    '## 当前总览',
    '',
    `- 总导出数: ${totalExports}`,
    `- 公共成员总数: ${totalMembers}`,
    `- Obsidian 兼容导出: ${totalCompatible}`,
    `- WStudio 扩展导出: ${totalExtensions}`,
    '- 初始状态默认均为 `待测试`，正式通过前需补上 demo、执行结果和人工确认。',
    '',
    '## 分类汇总',
    '',
    '| 分类 | 导出数 | 公共成员数 | Obsidian 兼容 | WStudio 扩展 | 建议 Demo |',
    '| --- | ---: | ---: | ---: | ---: | --- |',
    renderSummaryRows(activeCategories),
    '',
    ...activeCategories.flatMap((category) => [renderCategory(category), '']),
  ];

  return sections.join('\n').trimEnd() + '\n';
}

function main() {
  const categories = buildInventory();
  const markdown = renderInventory(categories);

  fs.writeFileSync(outputPath, markdown, 'utf8');
  console.log(`Generated ${path.relative(repoRoot, outputPath).replace(/\\/g, '/')}`);
}

main();
