/**
 * Material Icon Theme 文件图标工具类
 * 提供简洁的 API 来获取文件/文件夹图标
 */

interface FileIconConfig {
  fileName: string;
  isFolder?: boolean;
  isOpen?: boolean;
  language?: string;
}

export class MaterialFileIcons {
  private static readonly iconMap: Record<string, string> = {
    // 文件扩展名映射
    'ts': 'typescript',
    'tsx': 'react_ts',
    'js': 'javascript',
    'jsx': 'react',
    'json': 'json',
    'html': 'html',
    'css': 'css',
    'scss': 'sass',
    'sass': 'sass',
    'less': 'less',
    'md': 'markdown',
    'py': 'python',
    'java': 'java',
    'go': 'go',
    'rs': 'rust',
    'vue': 'vue',
    'svg': 'svg',
    'png': 'image',
    'jpg': 'image',
    'jpeg': 'image',
    'gif': 'image',
    'ico': 'favicon',
    'xml': 'xml',
    'yaml': 'yaml',
    'yml': 'yaml',
    'toml': 'toml',
    'sh': 'console',
    'bash': 'console',
    'zsh': 'console',
    'fish': 'console',
    'ps1': 'powershell',
    'bat': 'console',
    'cmd': 'console',
    'c': 'c',
    'cpp': 'cpp',
    'h': 'c',
    'hpp': 'cpp',
    'cs': 'csharp',
    'rb': 'ruby',
    'php': 'php',
    'swift': 'swift',
    'kt': 'kotlin',
    'dart': 'dart',
    'sql': 'database',
    'prisma': 'prisma',
    'graphql': 'graphql',
    'gql': 'graphql',
    'proto': 'protobuf',
    'tf': 'terraform',
    
    // 特殊文件名映射
    'package.json': 'nodejs',
    'package-lock.json': 'nodejs',
    'tsconfig.json': 'tsconfig',
    'jsconfig.json': 'jsconfig',
    '.gitignore': 'git',
    '.gitattributes': 'git',
    '.gitmodules': 'git',
    'README.md': 'info',
    'readme.md': 'info',
    'CHANGELOG.md': 'changelog',
    'changelog.md': 'changelog',
    'LICENSE': 'license',
    'LICENSE.md': 'license',
    'LICENSE.txt': 'license',
    'webpack.config.js': 'webpack',
    'vite.config.js': 'vite',
    'vite.config.ts': 'vite',
    'rollup.config.js': 'rollup',
    '.env': 'tune',
    '.env.local': 'tune',
    '.env.development': 'tune',
    '.env.production': 'tune',
    'Dockerfile': 'docker',
    'docker-compose.yml': 'docker',
    '.dockerignore': 'docker',
    '.eslintrc': 'eslint',
    '.eslintrc.js': 'eslint',
    '.eslintrc.json': 'eslint',
    '.prettierrc': 'prettier',
    '.prettierrc.js': 'prettier',
    '.prettierrc.json': 'prettier',
    '.editorconfig': 'editorconfig',
    'next.config.js': 'next',
    'nuxt.config.js': 'nuxt',
    'angular.json': 'angular',
    'nest-cli.json': 'nest',
    'tailwind.config.js': 'tailwindcss',
    'postcss.config.js': 'postcss',
    'babel.config.js': 'babel',
    '.babelrc': 'babel',
    'jest.config.js': 'jest',
    'vitest.config.js': 'vitest',
    'cypress.json': 'cypress',
    'playwright.config.js': 'playwright',
    '.gitpod.yml': 'gitpod',
    '.travis.yml': 'travis',
    '.gitlab-ci.yml': 'gitlab',
    'Makefile': 'makefile',
    'CMakeLists.txt': 'cmake',
    'Cargo.toml': 'rust',
    'go.mod': 'go',
    'requirements.txt': 'python',
    'setup.py': 'python',
    'Pipfile': 'python',
    'poetry.lock': 'poetry',
    'pom.xml': 'maven',
    'build.gradle': 'gradle',
    'pubspec.yaml': 'dart',
    'composer.json': 'composer',
    'Gemfile': 'ruby',
  };

  private static readonly folderMap: Record<string, string> = {
    'src': 'folder-src',
    'dist': 'folder-dist',
    'build': 'folder-dist',
    'out': 'folder-dist',
    'output': 'folder-dist',
    'node_modules': 'folder-node',
    'public': 'folder-public',
    'static': 'folder-public',
    'assets': 'folder-assets',
    'components': 'folder-components',
    'utils': 'folder-utils',
    'helpers': 'folder-helper',
    'lib': 'folder-lib',
    'libs': 'folder-lib',
    'core': 'folder-core',
    'shared': 'folder-shared',
    'common': 'folder-shared',
    'images': 'folder-images',
    'img': 'folder-images',
    'styles': 'folder-css',
    'css': 'folder-css',
    'sass': 'folder-sass',
    'scss': 'folder-sass',
    'less': 'folder-less',
    '.git': 'folder-git',
    '.github': 'folder-github',
    '.vscode': 'folder-vscode',
    '.idea': 'folder-intellij',
    'test': 'folder-test',
    'tests': 'folder-test',
    '__tests__': 'folder-test',
    'spec': 'folder-test',
    'e2e': 'folder-test',
    'docs': 'folder-docs',
    'doc': 'folder-docs',
    'documentation': 'folder-docs',
    'config': 'folder-config',
    'configs': 'folder-config',
    'configuration': 'folder-config',
    'api': 'folder-api',
    'apis': 'folder-api',
    'controllers': 'folder-controller',
    'routes': 'folder-routes',
    'middleware': 'folder-middleware',
    'middlewares': 'folder-middleware',
    'models': 'folder-models',
    'schemas': 'folder-models',
    'views': 'folder-views',
    'pages': 'folder-pages',
    'layouts': 'folder-layout',
    'templates': 'folder-template',
    'services': 'folder-services',
    'providers': 'folder-providers',
    'store': 'folder-store',
    'redux': 'folder-redux',
    'state': 'folder-state',
    'context': 'folder-context',
    'hooks': 'folder-hook',
    'types': 'folder-typescript',
    'interfaces': 'folder-interface',
    'constants': 'folder-constant',
    'enums': 'folder-enum',
    'database': 'folder-database',
    'db': 'folder-database',
    'migrations': 'folder-database',
    'seeders': 'folder-database',
    'docker': 'folder-docker',
    'kubernetes': 'folder-kubernetes',
    'k8s': 'folder-kubernetes',
    '.docker': 'folder-docker',
    'scripts': 'folder-scripts',
    'tools': 'folder-tools',
    'bin': 'folder-bin',
    'vendor': 'folder-vendor',
    'packages': 'folder-packages',
    'modules': 'folder-modules',
    'plugins': 'folder-plugin',
    'extensions': 'folder-extension',
    'i18n': 'folder-i18n',
    'locales': 'folder-i18n',
    'translations': 'folder-i18n',
    'fonts': 'folder-font',
    'icons': 'folder-icons',
    'audio': 'folder-audio',
    'video': 'folder-video',
    'media': 'folder-media',
    'downloads': 'folder-download',
    'uploads': 'folder-upload',
    'temp': 'folder-temp',
    'tmp': 'folder-temp',
    'cache': 'folder-cache',
    'logs': 'folder-log',
    'coverage': 'folder-coverage',
    '.husky': 'folder-husky',
    '.circleci': 'folder-circleci',
    '.gitlab': 'folder-gitlab',
    'android': 'folder-android',
    'ios': 'folder-ios',
    'mobile': 'folder-mobile',
    'desktop': 'folder-desktop',
    'server': 'folder-server',
    'client': 'folder-client',
    'backend': 'folder-server',
    'frontend': 'folder-client',
    'admin': 'folder-admin',
    'dashboard': 'folder-dashboard',
    'app': 'folder-app',
    'prisma': 'folder-prisma',
    'drizzle': 'folder-drizzle',
    'graphql': 'folder-graphql',
    'firebase': 'folder-firebase',
    'supabase': 'folder-supabase',
    'aws': 'folder-aws',
    'azure': 'folder-azure',
    'gcp': 'folder-gcp',
  };

  /**
   * 获取图标名称
   */
  static getIcon(config: FileIconConfig): string {
    const { fileName, isFolder, isOpen, language } = config;

    // 文件夹图标
    if (isFolder) {
      const folderName = fileName.toLowerCase();
      const customIcon = this.folderMap[folderName];
      
      if (customIcon) {
        return isOpen ? `${customIcon}-open` : customIcon;
      }
      
      return isOpen ? 'folder-open' : 'folder';
    }

    // 特殊文件名（完全匹配）
    const lowerFileName = fileName.toLowerCase();
    if (this.iconMap[lowerFileName]) {
      return this.iconMap[lowerFileName];
    }

    // 根据扩展名
    const ext = this.getExtension(fileName);
    if (ext && this.iconMap[ext]) {
      return this.iconMap[ext];
    }

    // 根据语言
    if (language && this.iconMap[language]) {
      return this.iconMap[language];
    }

    // 默认文件图标
    return 'file';
  }

  /**
   * 获取图标 SVG 路径
   */
  static getIconPath(config: FileIconConfig): string {
    const icon = this.getIcon(config);
    return `extensions/material-icon-theme/extension/icons/${icon}.svg`;
  }

  /**
   * 获取图标 CSS 类名（用于字体图标或自定义样式）
   */
  static getIconClass(config: FileIconConfig): string {
    const icon = this.getIcon(config);
    return `material-icons-${icon}`;
  }

  /**
   * 获取文件扩展名
   */
  private static getExtension(fileName: string): string {
    const lastDot = fileName.lastIndexOf('.');
    if (lastDot === -1 || lastDot === 0) return '';
    return fileName.slice(lastDot + 1).toLowerCase();
  }
}

/**
 * 便捷函数：获取文件图标路径
 */
export function getFileIconPath(fileName: string, language?: string): string {
  return MaterialFileIcons.getIconPath({ fileName, language });
}

/**
 * 便捷函数：获取文件夹图标路径
 */
export function getFolderIconPath(folderName: string, isOpen: boolean = false): string {
  return MaterialFileIcons.getIconPath({ fileName: folderName, isFolder: true, isOpen });
}

/**
 * 便捷函数：获取文件图标类名
 */
export function getFileIconClass(fileName: string, language?: string): string {
  return MaterialFileIcons.getIconClass({ fileName, language });
}

/**
 * 便捷函数：获取文件夹图标类名
 */
export function getFolderIconClass(folderName: string, isOpen: boolean = false): string {
  return MaterialFileIcons.getIconClass({ fileName: folderName, isFolder: true, isOpen });
}
















