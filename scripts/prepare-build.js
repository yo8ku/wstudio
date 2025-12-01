/**
 * 打包前准备脚本
 * 复制 workspace 包到 node_modules
 */

const fs = require('fs');
const path = require('path');
const pngToIco = require('png-to-ico');
const sharp = require('sharp');

const rootDir = path.join(__dirname, '..');
const nodeModulesDir = path.join(rootDir, 'node_modules');
const packagesDir = path.join(rootDir, 'packages');
const logDir = path.join(rootDir, 'log');
const logPngPath = path.join(logDir, 'log.png');
const logIcoPath = path.join(logDir, 'log.ico');

// 确保 node_modules/@note-studio 目录存在
const noteStudioDir = path.join(nodeModulesDir, '@note-studio');
if (!fs.existsSync(noteStudioDir)) {
  fs.mkdirSync(noteStudioDir, { recursive: true });
}

// 需要复制的包
const packages = [
  'shared',
  'core',
  'plugin-system',
  'main',
  'renderer'
];

/**
 * 递归复制目录
 */
function copyDir(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    // 跳过 node_modules 和源文件
    if (entry.name === 'node_modules' || entry.name === 'src' || entry.name === 'tsconfig.json' || entry.name === 'tsconfig.cjs.json' || entry.name === 'tsconfig.esm.json') {
      continue;
    }
    
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

async function ensureLogIcon() {
  if (!fs.existsSync(logPngPath)) {
    console.warn('[Prepare Build] ✗ 未找到 log.png，桌面图标保持默认');
    return;
  }

  try {
    const squarePngBuffer = await sharp(logPngPath)
      .resize(256, 256, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png()
      .toBuffer();

    const icoBuffer = await pngToIco(squarePngBuffer);
    fs.writeFileSync(logIcoPath, icoBuffer);
    console.log('[Prepare Build] ✓ 生成桌面图标: log/log.ico');
  } catch (error) {
    console.error('[Prepare Build] ✗ 生成 log.ico 失败:', error.message);
  }
}

/**
 * 清理旧的构建产物
 */
function cleanOldBuildArtifacts() {
  console.log('[Prepare Build] 清理旧的构建产物...');
  
  // 清理根目录的旧dist目录（如果存在）
  const rootDistPath = path.join(rootDir, 'dist');
  if (fs.existsSync(rootDistPath)) {
    try {
      fs.rmSync(rootDistPath, { recursive: true, force: true });
      console.log('[Prepare Build] ✓ 清理根目录 dist');
    } catch (err) {
      console.warn(`[Prepare Build] ✗ 清理根目录 dist 失败: ${err.message}`);
    }
  }
  
  // 清理 main/dist 下的 packages 目录（这些是构建时复制的，现在不再需要）
  const mainDistPackagesDir = path.join(packagesDir, 'main', 'dist', 'packages');
  if (fs.existsSync(mainDistPackagesDir)) {
    try {
      fs.rmSync(mainDistPackagesDir, { recursive: true, force: true });
      console.log('[Prepare Build] ✓ 清理 main/dist/packages');
    } catch (err) {
      console.warn(`[Prepare Build] ✗ 清理 main/dist/packages 失败: ${err.message}`);
    }
  }
  
  // 清理 main/dist 下的其他依赖包目录（extension-api, global-rag, plugin-system, shared, theme）
  const mainDistPath = path.join(packagesDir, 'main', 'dist');
  if (fs.existsSync(mainDistPath)) {
    const dirsToClean = ['extension-api', 'global-rag', 'plugin-system', 'shared', 'theme'];
    dirsToClean.forEach(dir => {
      const dirPath = path.join(mainDistPath, dir);
      if (fs.existsSync(dirPath)) {
        try {
          fs.rmSync(dirPath, { recursive: true, force: true });
          console.log(`[Prepare Build] ✓ 清理 main/dist/${dir}`);
        } catch (err) {
          console.warn(`[Prepare Build] ✗ 清理 main/dist/${dir} 失败: ${err.message}`);
        }
      }
    });
  }
}

async function main() {
  await ensureLogIcon();
  
  // 清理旧的构建产物
  cleanOldBuildArtifacts();

  console.log('[Prepare Build] 复制 workspace 包到 node_modules...');

  packages.forEach(pkg => {
    // 不再复制依赖包到 main/dist/packages，因为现在使用 workspace 协议
    // 依赖包会通过 node_modules/@note-studio 访问
    
    const sourcePath = path.join(packagesDir, pkg, pkg === 'main' ? path.join('dist', 'main', 'src') : 'dist');
    const targetPath = path.join(noteStudioDir, pkg);
    
    if (fs.existsSync(targetPath)) {
      try {
        fs.rmSync(targetPath, { recursive: true, force: true });
      } catch (err) {
        console.warn(`[Prepare Build] 删除旧目录失败: ${pkg}`, err.message);
      }
    }
    
    try {
      if (!fs.existsSync(sourcePath)) {
        console.warn(`[Prepare Build] ✗ 跳过包（未构建 dist）: @note-studio/${pkg}`);
        return;
      }

      copyDir(sourcePath, targetPath);
      console.log(`[Prepare Build] ✓ 复制包 dist: @note-studio/${pkg}`);
    } catch (err) {
      console.error(`[Prepare Build] ✗ 复制包失败: @note-studio/${pkg}`, err.message);
    }
  });

  console.log('[Prepare Build] 完成！');
}

main().catch(error => {
  console.error('[Prepare Build] 脚本执行失败:', error);
  process.exit(1);
});
