/**
 * Markdown 扩展
 */

function activate(context) {
  console.log('Markdown 扩展已激活');
  
  // 注册预览命令
  const disposable = context.subscriptions;
  
  // 这里可以添加更多功能
}

function deactivate() {
  console.log('Markdown 扩展已停用');
}

module.exports = {
  activate,
  deactivate
};



