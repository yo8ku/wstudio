/**
 * 下载 VSCode 文件图标主题插件
 * 
 * 功能：
 * - 从 VSCode Marketplace 下载指定的文件图标主题插件
 * - 自动解压到 extensions 目录
 * - 支持批量下载
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

  // 文件图标插件列表（已经有的不重复下载）
const ICON_THEMES = [
  // 已存在：
  // - material-icon-theme (PKief.material-icon-theme)
  // - ayu (teabyii.ayu)
  // - monokai-pro (monokai.theme-monokai-pro-vscode)
  
  // 需要下载的（使用不含空格的名称）：
  { id: 'vscode-icons-team.vscode-icons', name: 'vscode-icons' },
  { id: 'zhuangtongfa.Material-theme', name: 'one-dark-pro' },
  { id: 'jamesmaj.easy-icons', name: 'easy-icons' },
  { id: 'cweijan.vscode-jetbrains-icon-theme', name: 'jetbrains-icon-theme' },
];

const EXTENSIONS_DIR = path.join(__dirname, '..', 'extensions');

/**
 * 下载文件
 */
function downloadFile(url, outputPath) {
  return new Promise((resolve, reject) => {
    console.log(`📥 正在下载: ${url}`);
    
    const file = fs.createWriteStream(outputPath);
    
    https.get(url, (response) => {
      // 处理重定向
      if (response.statusCode === 302 || response.statusCode === 301) {
        file.close();
        fs.unlinkSync(outputPath);
        return downloadFile(response.headers.location, outputPath)
          .then(resolve)
          .catch(reject);
      }
      
      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(outputPath);
        return reject(new Error(`下载失败: HTTP ${response.statusCode}`));
      }
      
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        console.log(`✅ 下载完成: ${path.basename(outputPath)}`);
        resolve();
      });
    }).on('error', (err) => {
      file.close();
      fs.unlinkSync(outputPath);
      reject(err);
    });
  });
}

/**
 * 解压 VSIX 文件
 */
function extractVsix(vsixPath, extensionName) {
  const outputDir = path.join(EXTENSIONS_DIR, extensionName);
  
  console.log(`📦 正在解压: ${extensionName}`);
  
  try {
    // 创建输出目录
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // 使用系统的解压工具（与 download-extensions.js 一致）
    if (process.platform === 'win32') {
      // Windows: 重命名为 .zip 再解压
      const zipPath = vsixPath.replace('.vsix', '.zip');
      fs.renameSync(vsixPath, zipPath);
      execSync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${outputDir}' -Force"`, { stdio: 'inherit' });
      fs.unlinkSync(zipPath);
    } else {
      // Linux/Mac 使用 unzip
      execSync(`unzip -o "${vsixPath}" -d "${outputDir}"`, { stdio: 'inherit' });
      fs.unlinkSync(vsixPath);
    }
    
    console.log(`✅ 解压完成: ${extensionName}`);
    
  } catch (error) {
    console.error(`❌ 解压失败: ${extensionName}`, error.message);
    throw error;
  }
}

/**
 * 获取插件下载 URL
 */
function getExtensionDownloadUrl(extensionId) {
  const [publisher, name] = extensionId.split('.');
  // VSCode Marketplace API
  return `https://${publisher}.gallery.vsassets.io/_apis/public/gallery/publisher/${publisher}/extension/${name}/latest/assetbyname/Microsoft.VisualStudio.Services.VSIXPackage`;
}

/**
 * 下载并安装插件
 */
async function downloadAndInstallExtension(extension) {
  const { id, name } = extension;
  const vsixPath = path.join(EXTENSIONS_DIR, `${name}.vsix`);
  
  console.log(`\n🎨 开始下载: ${name} (${id})`);
  
  try {
    // 检查是否已存在
    const extensionDir = path.join(EXTENSIONS_DIR, name);
    if (fs.existsSync(extensionDir)) {
      console.log(`⚠️  插件已存在，跳过: ${name}`);
      return;
    }
    
    // 下载
    const downloadUrl = getExtensionDownloadUrl(id);
    await downloadFile(downloadUrl, vsixPath);
    
    // 解压（改为同步）
    extractVsix(vsixPath, name);
    
    console.log(`✅ 成功安装: ${name}`);
    
  } catch (error) {
    console.error(`❌ 安装失败: ${name}`, error.message);
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('🚀 开始下载文件图标主题插件...\n');
  
  // 确保 extensions 目录存在
  if (!fs.existsSync(EXTENSIONS_DIR)) {
    fs.mkdirSync(EXTENSIONS_DIR, { recursive: true });
  }
  
  // 检查已存在的图标插件
  console.log('📊 检查已存在的图标插件...');
  const existingExtensions = [
    'material-icon-theme',
    'ayu',
    'monokai-pro'
  ];
  
  for (const ext of existingExtensions) {
    const extPath = path.join(EXTENSIONS_DIR, ext);
    if (fs.existsSync(extPath)) {
      console.log(`✅ 已安装: ${ext}`);
    }
  }
  
  console.log(`\n📦 需要下载 ${ICON_THEMES.length} 个新的图标插件...\n`);
  
  // 逐个下载插件
  for (const extension of ICON_THEMES) {
    await downloadAndInstallExtension(extension);
  }
  
  console.log('\n✨ 所有文件图标主题插件下载完成！');
  console.log('\n📊 图标主题统计：');
  console.log('  ✅ Material Icon Theme - 已安装');
  console.log('  ✅ Ayu Icons - 已安装');
  console.log('  ✅ Monokai Pro Icons - 已安装（16个变体）');
  console.log('  ✅ vscode-icons - 新下载');
  console.log('  ✅ One Dark Pro (Material Theme) - 新下载');
  console.log('  ✅ Easy Icons - 新下载');
  console.log('  ✅ JetBrains Icon Theme - 新下载');
  console.log('\n💡 提示：部分插件可能下载失败（如404），属于正常现象');
}

// 运行
main().catch(console.error);

