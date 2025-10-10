/**
 * Git 扩展
 */

function activate(context) {
  console.log('Git 扩展已激活');
}

function deactivate() {
  console.log('Git 扩展已停用');
}

module.exports = {
  activate,
  deactivate
};



