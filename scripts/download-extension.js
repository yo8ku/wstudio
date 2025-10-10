/**
 * VS Code 扩展下载脚本
 * 功能：从 VS Code Marketplace 下载指定扩展的 VSIX 文件
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// 扩展信息
const publisher = 'manasxx';
const extensionName = 'background-cover';
const outputDir = path.join(__dirname, '../extensions');
const outputFile = path.join(outputDir, `${extensionName}.vsix`);

// Marketplace API URL
const url = `https://marketplace.visualstudio.com/_apis/public/gallery/publishers/${publisher}/vsextensions/${extensionName}/latest/vspackage`;

console.log('正在下载 background-cover 扩展...');
console.log(`发布者: ${publisher}`);
console.log(`扩展名: ${extensionName}`);
console.log('');

// 确保输出目录存在
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// 下载文件
const file = fs.createWriteStream(outputFile);

https.get(url, (response) => {
  // 处理重定向
  if (response.statusCode === 301 || response.statusCode === 302) {
    const redirectUrl = response.headers.location;
    console.log(`重定向到: ${redirectUrl}`);
    
    https.get(redirectUrl, (redirectResponse) => {
      const totalSize = parseInt(redirectResponse.headers['content-length'], 10);
      let downloadedSize = 0;
      
      redirectResponse.pipe(file);
      
      redirectResponse.on('data', (chunk) => {
        downloadedSize += chunk.length;
        const percent = ((downloadedSize / totalSize) * 100).toFixed(2);
        process.stdout.write(`\r下载进度: ${percent}% (${(downloadedSize / 1024).toFixed(2)} KB / ${(totalSize / 1024).toFixed(2)} KB)`);
      });
      
      file.on('finish', () => {
        file.close();
        console.log('\n✓ 下载完成!');
        console.log(`文件保存至: ${outputFile}`);
        console.log(`文件大小: ${(fs.statSync(outputFile).size / 1024).toFixed(2)} KB`);
      });
    }).on('error', (err) => {
      fs.unlink(outputFile, () => {});
      console.error('✗ 下载失败:', err.message);
      process.exit(1);
    });
  } else {
    const totalSize = parseInt(response.headers['content-length'], 10);
    let downloadedSize = 0;
    
    response.pipe(file);
    
    response.on('data', (chunk) => {
      downloadedSize += chunk.length;
      const percent = ((downloadedSize / totalSize) * 100).toFixed(2);
      process.stdout.write(`\r下载进度: ${percent}% (${(downloadedSize / 1024).toFixed(2)} KB / ${(totalSize / 1024).toFixed(2)} KB)`);
    });
    
    file.on('finish', () => {
      file.close();
      console.log('\n✓ 下载完成!');
      console.log(`文件保存至: ${outputFile}`);
      console.log(`文件大小: ${(fs.statSync(outputFile).size / 1024).toFixed(2)} KB`);
    });
  }
}).on('error', (err) => {
  fs.unlink(outputFile, () => {});
  console.error('✗ 下载失败:', err.message);
  process.exit(1);
});

