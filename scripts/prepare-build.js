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

async function main() {
  await ensureLogIcon();

  console.log('[Prepare Build] 复制 workspace 包到 node_modules...');

  packages.forEach(pkg => {
    if (pkg === 'main') {
      const mainDistPackagesDir = path.join(packagesDir, 'main', 'dist', 'packages');
      const dependencyDistMap = {
        theme: path.join(packagesDir, 'theme', 'dist'),
        shared: path.join(packagesDir, 'shared', 'dist'),
        'plugin-system': path.join(packagesDir, 'plugin-system', 'dist'),
        renderer: path.join(packagesDir, 'renderer', 'dist')
      };

      if (!fs.existsSync(mainDistPackagesDir)) {
        fs.mkdirSync(mainDistPackagesDir, { recursive: true });
      }

      Object.entries(dependencyDistMap).forEach(([dep, depDistPath]) => {
        if (!fs.existsSync(depDistPath)) {
          console.warn(`[Prepare Build] ✗ 跳过依赖（未构建 dist）: @note-studio/${dep}`);
          return;
        }

        const targetDepPath = path.join(mainDistPackagesDir, dep);
        if (fs.existsSync(targetDepPath)) {
          fs.rmSync(targetDepPath, { recursive: true, force: true });
        }

        copyDir(depDistPath, targetDepPath);
        console.log(`[Prepare Build] ✓ 复制主进程依赖: @note-studio/${dep}`);
      });
    }

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
