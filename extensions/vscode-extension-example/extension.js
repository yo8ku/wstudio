/**
 * VSCode 扩展示例
 */

const vscode = require('vscode');

function activate(context) {
  console.log('VSCode 扩展示例已激活');

  let disposable = vscode.commands.registerCommand('example.helloWorld', function () {
    vscode.window.showInformationMessage('Hello World from VSCode Extension!');
  });

  context.subscriptions.push(disposable);
}

function deactivate() {
  console.log('VSCode 扩展示例已停用');
}

module.exports = {
  activate,
  deactivate
};



