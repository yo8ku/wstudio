/**
 * 修复 TypeScript 编译后的文件扩展名
 * 将 .js 引用添加扩展名以支持 ES 模块
 */
const fs = require('fs');
const path = require('path');

function fixImportExtensions(dir) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      fixImportExtensions(filePath);
    } else if (file.endsWith('.js')) {
      let content = fs.readFileSync(filePath, 'utf8');
      
      // 修复相对路径导入，添加 .js 扩展名
      content = content.replace(
        /from\s+['"](\.\/.+?)(?<!\.js)['"]/g,
        "from '$1.js'"
      );
      content = content.replace(
        /export\s+\*\s+from\s+['"](\.\/.+?)(?<!\.js)['"]/g,
        "export * from '$1.js'"
      );
      
      fs.writeFileSync(filePath, content, 'utf8');
    }
  });
}

const distDir = path.join(__dirname, '..', 'dist', 'esm');
if (fs.existsSync(distDir)) {
  console.log('正在修复 ES 模块导入扩展名...');
  fixImportExtensions(distDir);
  
  // 创建 package.json 文件以支持 ES 模块
  const packageJsonPath = path.join(distDir, 'package.json');
  const packageJson = {
    type: 'module',
    main: './index.js',
    types: './index.d.ts'
  };
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2), 'utf8');
  console.log('已创建 dist/esm/package.json');
  
  console.log('完成！');
}

