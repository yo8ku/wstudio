/**
 * 命令行安装单个 VSCode 插件
 * 用法: node install-extension.js <插件名称或ID>
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const extensionsDir = path.join(__dirname, '../extensions');

// 确保扩展目录存在
if (!fs.existsSync(extensionsDir)) {
  fs.mkdirSync(extensionsDir, { recursive: true });
}

/**
 * 从 VSCode Marketplace API 搜索插件
 */
async function searchExtension(searchTerm) {
  console.log(`正在搜索插件: ${searchTerm}...`);
  
  const body = JSON.stringify({
    filters: [{
      criteria: [
        { filterType: 10, value: searchTerm },
        { filterType: 8, value: "Microsoft.VisualStudio.Code" }
      ],
      pageSize: 5,
      pageNumber: 1,
      sortBy: 0,
      sortOrder: 0
    }],
    flags: 914
  });

  const options = {
    hostname: 'marketplace.visualstudio.com',
    path: '/_apis/public/gallery/extensionquery',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json;api-version=6.0-preview.1',
      'Content-Length': Buffer.byteLength(body)
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.results && result.results[0] && result.results[0].extensions && result.results[0].extensions.length > 0) {
            const extensions = result.results[0].extensions.map(ext => ({
              publisher: ext.publisher.publisherName,
              name: ext.extensionName,
              displayName: ext.displayName,
              version: ext.versions[0].version
            }));
            resolve(extensions);
          } else {
            reject(new Error(`未找到插件: ${searchTerm}`));
          }
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
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
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('用法: node install-extension.js <插件名称或ID>');
    console.error('示例: node install-extension.js "One Monokai Theme"');
    console.error('示例: node install-extension.js publisher.extension-name');
    process.exit(1);
  }

  const searchTerm = args.join(' ');
  
  console.log('🔍 开始安装 VSCode 扩展...\n');
  
  try {
    // 如果是 publisher.name 格式，直接下载
    if (searchTerm.includes('.') && !searchTerm.includes(' ')) {
      const [publisher, name] = searchTerm.split('.');
      const displayName = `${publisher}-${name}`;
      const vsixPath = await downloadExtension(publisher, name, displayName);
      const targetDir = path.join(extensionsDir, displayName);
      extractVsix(vsixPath, targetDir);
    } else {
      // 搜索插件
      const extensions = await searchExtension(searchTerm);
      
      console.log(`\n找到 ${extensions.length} 个匹配的插件:`);
      extensions.forEach((ext, i) => {
        console.log(`${i + 1}. ${ext.displayName} (${ext.publisher}.${ext.name})`);
      });
      
      // 安装第一个匹配的插件
      const ext = extensions[0];
      console.log(`\n正在安装: ${ext.displayName}...\n`);
      
      const displayName = `${ext.publisher}-${ext.name}`;
      const vsixPath = await downloadExtension(ext.publisher, ext.name, displayName);
      const targetDir = path.join(extensionsDir, displayName);
      extractVsix(vsixPath, targetDir);
    }
    
    console.log('\n✅ 扩展安装成功！');
  } catch (error) {
    console.error(`\n❌ 安装失败: ${error.message}`);
    process.exit(1);
  }
}

main().catch(console.error);
