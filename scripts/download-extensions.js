/**
 * 下载 VSCode 插件脚本
 * 从 VSCode Marketplace 下载指定的扩展
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 需要下载的扩展列表
const extensions = [
  // Markdown 相关
  { publisher: 'yzhang', name: 'markdown-all-in-one', displayName: 'markdown-all-in-one' },
  { publisher: 'bierner', name: 'markdown-preview-github-styles', displayName: 'markdown-preview-github' },
  { publisher: 'DavidAnson', name: 'vscode-markdownlint', displayName: 'markdownlint' },
  
  // 主题插件
  { publisher: 'PKief', name: 'material-icon-theme', displayName: 'material-icon-theme' },
  { publisher: 'GitHub', name: 'github-vscode-theme', displayName: 'github-theme' },
  { publisher: 'dracula-theme', name: 'theme-dracula', displayName: 'dracula-theme' },
  { publisher: 'sdras', name: 'night-owl', displayName: 'night-owl-theme' },
  { publisher: 'Equinusocio', name: 'vsc-material-theme', displayName: 'material-theme' },
  
  // JSON 插件
  { publisher: 'ZainChen', name: 'json', displayName: 'json-tools' },
  
  // C/C++ 主题
  { publisher: 'ms-vscode', name: 'cpptools-themes', displayName: 'cpptools-themes' },
];

const extensionsDir = path.join(__dirname, '../extensions');

// 确保扩展目录存在
if (!fs.existsSync(extensionsDir)) {
  fs.mkdirSync(extensionsDir, { recursive: true });
}

/**
 * 从 Open VSX Registry 下载扩展（备用方案）
 */
async function downloadFromOpenVSX(publisher, name, displayName) {
  const url = `https://open-vsx.org/api/${publisher}/${name}/latest`;
  
  console.log(`正在从 Open VSX 下载: ${publisher}.${name}...`);
  
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      let data = '';
      
      response.on('data', (chunk) => {
        data += chunk;
      });
      
      response.on('end', () => {
        try {
          const metadata = JSON.parse(data);
          if (metadata.files && metadata.files.download) {
            downloadFile(metadata.files.download, displayName, resolve, reject);
          } else {
            reject(new Error('No download URL found'));
          }
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', reject);
  });
}

/**
 * 从 VSCode Marketplace 下载扩展
 */
async function downloadExtension(publisher, name, displayName) {
  const version = 'latest';
  const apiUrl = `https://${publisher}.gallery.vsassets.io/_apis/public/gallery/publisher/${publisher}/extension/${name}/${version}/assetbyname/Microsoft.VisualStudio.Services.VSIXPackage`;
  
  console.log(`正在下载: ${publisher}.${name}...`);
  
  return new Promise((resolve, reject) => {
    https.get(apiUrl, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301 || response.statusCode === 303) {
        // 跟随重定向
        const redirectUrl = response.headers.location;
        downloadFile(redirectUrl, displayName, resolve, reject);
      } else if (response.statusCode === 200) {
        saveFile(response, displayName, resolve, reject);
      } else {
        // 尝试备用方案
        console.log(`  使用备用源...`);
        downloadFromOpenVSX(publisher, name, displayName)
          .then(resolve)
          .catch(reject);
      }
    }).on('error', (err) => {
      console.log(`  主源失败，尝试备用源...`);
      downloadFromOpenVSX(publisher, name, displayName)
        .then(resolve)
        .catch(reject);
    });
  });
}

/**
 * 下载文件
 */
function downloadFile(url, displayName, resolve, reject) {
  const protocol = url.startsWith('https') ? https : http;
  
  protocol.get(url, (response) => {
    if (response.statusCode === 302 || response.statusCode === 301 || response.statusCode === 303) {
      downloadFile(response.headers.location, displayName, resolve, reject);
    } else if (response.statusCode === 200) {
      saveFile(response, displayName, resolve, reject);
    } else {
      reject(new Error(`HTTP ${response.statusCode}`));
    }
  }).on('error', reject);
}

/**
 * 保存文件
 */
function saveFile(response, displayName, resolve, reject) {
  const outputPath = path.join(extensionsDir, `${displayName}.vsix`);
  const file = fs.createWriteStream(outputPath);
  
  response.pipe(file);
  
  file.on('finish', () => {
    file.close();
    console.log(`✓ 已下载: ${displayName}`);
    resolve(outputPath);
  });
  
  file.on('error', (err) => {
    fs.unlinkSync(outputPath);
    reject(err);
  });
}

/**
 * 解压 VSIX 文件
 */
function extractVsix(vsixPath, targetDir) {
  console.log(`正在解压: ${path.basename(vsixPath)}...`);
  
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  
  try {
    // 使用系统的解压工具
    if (process.platform === 'win32') {
      // Windows: 先重命名为 .zip，然后解压
      const zipPath = vsixPath.replace('.vsix', '.zip');
      fs.renameSync(vsixPath, zipPath);
      execSync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${targetDir}' -Force"`, { stdio: 'inherit' });
      // 删除 ZIP 文件
      fs.unlinkSync(zipPath);
    } else {
      execSync(`unzip -o "${vsixPath}" -d "${targetDir}"`, { stdio: 'inherit' });
      // 删除 VSIX 文件
      fs.unlinkSync(vsixPath);
    }
    
    console.log(`✓ 已解压: ${path.basename(targetDir)}`);
  } catch (error) {
    console.error(`解压失败: ${error.message}`);
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('开始下载 VSCode 扩展...\n');
  
  for (const ext of extensions) {
    try {
      const vsixPath = await downloadExtension(ext.publisher, ext.name, ext.displayName);
      const targetDir = path.join(extensionsDir, ext.displayName);
      extractVsix(vsixPath, targetDir);
    } catch (error) {
      console.error(`下载失败 ${ext.publisher}.${ext.name}: ${error.message}`);
    }
    
    // 添加延迟避免请求过快
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log('\n✓ 扩展下载任务完成！');
}

main().catch(console.error);