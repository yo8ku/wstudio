/**
 * Markdown 编辑器扩展
 * 提供完整的 Markdown 编辑功能
 */

let vscode;

/**
 * 插件激活函数
 */
function activate(context) {
  console.log('Markdown 编辑器扩展已激活');
  
  // 注意：这里假设 vscode API 会通过某种方式注入
  // 如果需要，可以通过 require 或其他方式获取
  try {
    vscode = require('vscode');
  } catch (error) {
    console.warn('vscode API 未找到，某些功能可能不可用');
  }

  // 注册所有命令
  registerCommands(context);
  
  // 注册文档保存时的格式化
  if (vscode) {
    context.subscriptions.push(
      vscode.workspace.onWillSaveTextDocument(onWillSaveDocument)
    );
  }
}

/**
 * 注册所有命令
 */
function registerCommands(context) {
  const commands = [
    { name: 'mdEditor.toggleBold', handler: toggleBold },
    { name: 'mdEditor.toggleItalic', handler: toggleItalic },
    { name: 'mdEditor.toggleStrikethrough', handler: toggleStrikethrough },
    { name: 'mdEditor.toggleCode', handler: toggleCode },
    { name: 'mdEditor.toggleCodeBlock', handler: toggleCodeBlock },
    { name: 'mdEditor.insertLink', handler: insertLink },
    { name: 'mdEditor.insertImage', handler: insertImage },
    { name: 'mdEditor.insertTable', handler: insertTable },
    { name: 'mdEditor.toggleHeading1', handler: () => toggleHeading(1) },
    { name: 'mdEditor.toggleHeading2', handler: () => toggleHeading(2) },
    { name: 'mdEditor.toggleHeading3', handler: () => toggleHeading(3) },
    { name: 'mdEditor.toggleUnorderedList', handler: toggleUnorderedList },
    { name: 'mdEditor.toggleOrderedList', handler: toggleOrderedList },
    { name: 'mdEditor.toggleTaskList', handler: toggleTaskList },
    { name: 'mdEditor.toggleQuote', handler: toggleQuote },
    { name: 'mdEditor.insertHorizontalRule', handler: insertHorizontalRule },
    { name: 'mdEditor.showPreview', handler: showPreview },
    { name: 'mdEditor.showPreviewToSide', handler: showPreviewToSide },
    { name: 'mdEditor.formatDocument', handler: formatDocument }
  ];

  commands.forEach(cmd => {
    if (vscode && vscode.commands) {
      const disposable = vscode.commands.registerCommand(cmd.name, cmd.handler);
      context.subscriptions.push(disposable);
    }
  });
}

/**
 * 获取当前编辑器和选择
 */
function getEditorAndSelection() {
  if (!vscode) return null;
  
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showInformationMessage('没有打开的编辑器');
    return null;
  }
  
  // 检查是否是 Markdown 文件
  if (editor.document.languageId !== 'markdown') {
    vscode.window.showInformationMessage('当前文件不是 Markdown 文件');
    return null;
  }
  
  return editor;
}

/**
 * 包装选中文本
 */
function wrapSelection(prefix, suffix = prefix) {
  const editor = getEditorAndSelection();
  if (!editor) return;
  
  const selection = editor.selection;
  const text = editor.document.getText(selection);
  
  // 检查是否已经被包装
  const range = new vscode.Range(
    selection.start.line,
    Math.max(0, selection.start.character - prefix.length),
    selection.end.line,
    selection.end.character + suffix.length
  );
  const wrappedText = editor.document.getText(range);
  
  if (wrappedText.startsWith(prefix) && wrappedText.endsWith(suffix)) {
    // 移除包装
    editor.edit(editBuilder => {
      editBuilder.replace(range, text);
    });
  } else {
    // 添加包装
    editor.edit(editBuilder => {
      editBuilder.replace(selection, `${prefix}${text}${suffix}`);
    });
  }
}

/**
 * 行级前缀切换
 */
function toggleLinePrefix(prefix) {
  const editor = getEditorAndSelection();
  if (!editor) return;
  
  const selection = editor.selection;
  const line = editor.document.lineAt(selection.start.line);
  const lineText = line.text;
  const trimmedText = lineText.trimStart();
  const indent = lineText.substring(0, lineText.length - trimmedText.length);
  
  editor.edit(editBuilder => {
    if (trimmedText.startsWith(prefix)) {
      // 移除前缀
      const newText = indent + trimmedText.substring(prefix.length).trimStart();
      editBuilder.replace(line.range, newText);
    } else {
      // 添加前缀
      const newText = indent + prefix + ' ' + trimmedText;
      editBuilder.replace(line.range, newText);
    }
  });
}

// 命令处理函数

function toggleBold() {
  const config = vscode?.workspace.getConfiguration('mdEditor');
  const style = config?.get('boldStyle') || '**';
  wrapSelection(style);
}

function toggleItalic() {
  const config = vscode?.workspace.getConfiguration('mdEditor');
  const style = config?.get('italicStyle') || '*';
  wrapSelection(style);
}

function toggleStrikethrough() {
  wrapSelection('~~');
}

function toggleCode() {
  wrapSelection('`');
}

function toggleCodeBlock() {
  const editor = getEditorAndSelection();
  if (!editor) return;
  
  const selection = editor.selection;
  const text = editor.document.getText(selection);
  
  editor.edit(editBuilder => {
    if (text.includes('\n')) {
      editBuilder.replace(selection, `\`\`\`\n${text}\n\`\`\``);
    } else {
      editBuilder.replace(selection, `\`\`\`\n${text || 'code'}\n\`\`\``);
    }
  });
}

async function insertLink() {
  const editor = getEditorAndSelection();
  if (!editor) return;
  
  const selection = editor.selection;
  const selectedText = editor.document.getText(selection);
  
  let url = '';
  if (vscode) {
    url = await vscode.window.showInputBox({
      prompt: '请输入链接地址',
      placeHolder: 'https://example.com'
    }) || '';
  }
  
  const linkText = selectedText || '链接文本';
  editor.edit(editBuilder => {
    editBuilder.replace(selection, `[${linkText}](${url})`);
  });
}

async function insertImage() {
  const editor = getEditorAndSelection();
  if (!editor) return;
  
  const selection = editor.selection;
  const selectedText = editor.document.getText(selection);
  
  let url = '';
  if (vscode) {
    url = await vscode.window.showInputBox({
      prompt: '请输入图片地址',
      placeHolder: 'https://example.com/image.png'
    }) || '';
  }
  
  const altText = selectedText || '图片描述';
  editor.edit(editBuilder => {
    editBuilder.replace(selection, `![${altText}](${url})`);
  });
}

function insertTable() {
  const editor = getEditorAndSelection();
  if (!editor) return;
  
  const selection = editor.selection;
  const table = `| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n| 内容 | 内容 | 内容 |\n| 内容 | 内容 | 内容 |`;
  
  editor.edit(editBuilder => {
    editBuilder.replace(selection, table);
  });
}

function toggleHeading(level) {
  const editor = getEditorAndSelection();
  if (!editor) return;
  
  const selection = editor.selection;
  const line = editor.document.lineAt(selection.start.line);
  const lineText = line.text;
  const prefix = '#'.repeat(level);
  
  // 检查当前行是否已经是标题
  const headingMatch = lineText.match(/^(#{1,6})\s/);
  
  editor.edit(editBuilder => {
    if (headingMatch && headingMatch[1].length === level) {
      // 移除标题
      const newText = lineText.replace(/^#{1,6}\s/, '');
      editBuilder.replace(line.range, newText);
    } else if (headingMatch) {
      // 更改标题级别
      const newText = lineText.replace(/^#{1,6}\s/, `${prefix} `);
      editBuilder.replace(line.range, newText);
    } else {
      // 添加标题
      const newText = `${prefix} ${lineText}`;
      editBuilder.replace(line.range, newText);
    }
  });
}

function toggleUnorderedList() {
  toggleLinePrefix('-');
}

function toggleOrderedList() {
  const editor = getEditorAndSelection();
  if (!editor) return;
  
  const selection = editor.selection;
  const line = editor.document.lineAt(selection.start.line);
  const lineText = line.text;
  const trimmedText = lineText.trimStart();
  const indent = lineText.substring(0, lineText.length - trimmedText.length);
  
  editor.edit(editBuilder => {
    if (/^\d+\.\s/.test(trimmedText)) {
      // 移除序号
      const newText = indent + trimmedText.replace(/^\d+\.\s/, '');
      editBuilder.replace(line.range, newText);
    } else {
      // 添加序号
      const newText = indent + '1. ' + trimmedText;
      editBuilder.replace(line.range, newText);
    }
  });
}

function toggleTaskList() {
  const editor = getEditorAndSelection();
  if (!editor) return;
  
  const selection = editor.selection;
  const line = editor.document.lineAt(selection.start.line);
  const lineText = line.text;
  const trimmedText = lineText.trimStart();
  const indent = lineText.substring(0, lineText.length - trimmedText.length);
  
  editor.edit(editBuilder => {
    if (/^-\s\[\s?\]\s/.test(trimmedText)) {
      // 移除任务列表
      const newText = indent + trimmedText.replace(/^-\s\[\s?\]\s/, '');
      editBuilder.replace(line.range, newText);
    } else if (/^-\s\[x\]\s/.test(trimmedText)) {
      // 移除任务列表
      const newText = indent + trimmedText.replace(/^-\s\[x\]\s/, '');
      editBuilder.replace(line.range, newText);
    } else {
      // 添加任务列表
      const newText = indent + '- [ ] ' + trimmedText.replace(/^-\s/, '');
      editBuilder.replace(line.range, newText);
    }
  });
}

function toggleQuote() {
  toggleLinePrefix('>');
}

function insertHorizontalRule() {
  const editor = getEditorAndSelection();
  if (!editor) return;
  
  const selection = editor.selection;
  editor.edit(editBuilder => {
    editBuilder.replace(selection, '\n---\n');
  });
}

function showPreview() {
  if (vscode && vscode.commands) {
    vscode.commands.executeCommand('markdown.showPreview');
  }
}

function showPreviewToSide() {
  if (vscode && vscode.commands) {
    vscode.commands.executeCommand('markdown.showPreviewToSide');
  }
}

function formatDocument() {
  const editor = getEditorAndSelection();
  if (!editor) return;
  
  const document = editor.document;
  const text = document.getText();
  
  // 基本格式化规则
  let formatted = text
    // 标题后添加空行
    .replace(/(^#{1,6}\s.+$)/gm, '$1\n')
    // 代码块前后添加空行
    .replace(/([^\n])(```)/g, '$1\n\n$2')
    .replace(/(```[^\n]*\n)/g, '$1\n')
    // 列表项之间的空行
    .replace(/(\n[-*+]\s.+)(\n[-*+]\s)/g, '$1\n$2')
    // 移除多余空行（最多保留一个空行）
    .replace(/\n{3,}/g, '\n\n')
    // 文件末尾添加换行
    .replace(/([^\n])$/g, '$1\n');
  
  editor.edit(editBuilder => {
    const fullRange = new vscode.Range(
      document.positionAt(0),
      document.positionAt(text.length)
    );
    editBuilder.replace(fullRange, formatted);
  });
}

function onWillSaveDocument(event) {
  const config = vscode.workspace.getConfiguration('mdEditor');
  const formatOnSave = config.get('formatOnSave');
  
  if (formatOnSave && event.document.languageId === 'markdown') {
    formatDocument();
  }
}

/**
 * 插件停用函数
 */
function deactivate() {
  console.log('Markdown 编辑器扩展已停用');
}

module.exports = {
  activate,
  deactivate
};
