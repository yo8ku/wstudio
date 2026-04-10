/**
 * Audits the public @note-studio/plugin API surface against the local
 * Obsidian API reference snapshot.
 */

const path = require('node:path');
const ts = require('typescript');

const repoRoot = path.resolve(__dirname, '..', '..');
const obsidianEntry = path.join(repoRoot, 'Obsidian_plugin', 'obsidian.d.ts');
const pluginEntry = path.join(repoRoot, 'packages', 'plugin', 'src', 'index.ts');

const structuredKinds = new Set(['class', 'interface']);

function parseArgs(argv) {
  return {
    json: argv.includes('--json'),
    failOnDiff: argv.includes('--fail-on-diff'),
  };
}

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
    .sort();
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
      memberNames: structuredKinds.has(kind) ? getTypeMemberNames(checker, symbol) : [],
    });
  }

  return exportsMap;
}

function diffNames(left, right) {
  return left.filter((name) => !right.includes(name));
}

function buildReport() {
  const obsidianExports = getModuleExports(obsidianEntry);
  const pluginExports = getModuleExports(pluginEntry);
  const obsidianNames = [...obsidianExports.keys()].sort();
  const pluginNames = [...pluginExports.keys()].sort();
  const sharedNames = obsidianNames.filter((name) => pluginExports.has(name));
  const missingExports = diffNames(obsidianNames, pluginNames);
  const extraExports = diffNames(pluginNames, obsidianNames);
  const memberDiffs = [];

  for (const name of sharedNames) {
    const obsidianSymbol = obsidianExports.get(name);
    const pluginSymbol = pluginExports.get(name);

    if (obsidianSymbol === undefined || pluginSymbol === undefined) {
      continue;
    }

    if (!structuredKinds.has(obsidianSymbol.kind) || !structuredKinds.has(pluginSymbol.kind)) {
      continue;
    }

    const missingMembers = diffNames(obsidianSymbol.memberNames, pluginSymbol.memberNames);
    const extraMembers = diffNames(pluginSymbol.memberNames, obsidianSymbol.memberNames);

    if (missingMembers.length === 0 && extraMembers.length === 0) {
      continue;
    }

    memberDiffs.push({
      name,
      obsidianKind: obsidianSymbol.kind,
      pluginKind: pluginSymbol.kind,
      missingMembers,
      extraMembers,
    });
  }

  return {
    obsidianExportCount: obsidianNames.length,
    pluginExportCount: pluginNames.length,
    sharedExportCount: sharedNames.length,
    missingExportCount: missingExports.length,
    extraExportCount: extraExports.length,
    memberDiffCount: memberDiffs.length,
    missingExports,
    extraExports,
    memberDiffs,
  };
}

function formatList(title, values) {
  if (values.length === 0) {
    return `${title}: none`;
  }

  return `${title} (${values.length}): ${values.join(', ')}`;
}

function printHumanReadable(report) {
  console.log(`Obsidian exports: ${report.obsidianExportCount}`);
  console.log(`WStudio exports: ${report.pluginExportCount}`);
  console.log(`Shared exports: ${report.sharedExportCount}`);
  console.log(`Export gaps: ${report.missingExportCount}`);
  console.log(`Extra exports: ${report.extraExportCount}`);
  console.log(`Structured member diffs: ${report.memberDiffCount}`);
  console.log('');
  console.log(formatList('Missing exports', report.missingExports));
  console.log(formatList('Extra exports', report.extraExports));

  if (report.memberDiffs.length === 0) {
    console.log('Member diffs: none');
    return;
  }

  console.log('Member diffs:');

  for (const diff of report.memberDiffs) {
    console.log(`- ${diff.name} [${diff.obsidianKind} -> ${diff.pluginKind}]`);
    console.log(`  missing: ${diff.missingMembers.length === 0 ? 'none' : diff.missingMembers.join(', ')}`);
    console.log(`  extra: ${diff.extraMembers.length === 0 ? 'none' : diff.extraMembers.join(', ')}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = buildReport();
  const hasDiff =
    report.missingExportCount > 0 ||
    report.extraExportCount > 0 ||
    report.memberDiffCount > 0;

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHumanReadable(report);
  }

  if (args.failOnDiff && hasDiff) {
    process.exitCode = 1;
  }
}

main();
