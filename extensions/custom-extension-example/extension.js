/**
 * Note Studio 原生扩展示例
 */

function activate(context) {
  console.log('自定义扩展示例已激活');

  // 使用原生 API
  const { vscode, native } = require('@note-studio/extension-api');

  const disposable = vscode.commands.registerCommand('custom.createNote', async () => {
    const title = await vscode.window.showInputBox({ 
      prompt: '请输入笔记标题' 
    });
    
    if (title) {
      const note = await native.createNote(title, '');
      vscode.window.showInformationMessage(`笔记 "${note.title}" 已创建`);
    }
  });

  context.subscriptions.push(disposable);
}

function deactivate() {
  console.log('自定义扩展示例已停用');
}

module.exports = {
  activate,
  deactivate
};



