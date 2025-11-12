/**
 * Material Design 图标 * 使用 @ricons/material
 */

import type { IconSet } from '../IconRegistry';

// 按需导入常用Material Design 图标
import {
  FolderOutlined as Folder,
  FolderOpenOutlined as FolderOpen,
  InsertDriveFileOutlined as InsertDriveFile,
  DescriptionOutlined as Description,
  CodeOutlined as Code,
  ImageOutlined as Image,
  VideoLibraryOutlined as VideoLibrary,
  AudioFileOutlined as AudioFile,
  ArchiveOutlined as Archive,
  SettingsOutlined as Settings,
  DataObjectOutlined as DataObject,
  JavascriptOutlined as Javascript,
  CssOutlined as Css,
  HtmlOutlined as Html,
  PictureAsPdfOutlined as PictureAsPdf,
  SourceOutlined as SourceControl,
  TerminalOutlined as Terminal,
  LockOutlined as Lock,
  BuildOutlined as Build,
  PublicOutlined as Public,
  BookOutlined as Book,
  ScienceOutlined as Science,
  ArticleOutlined as Article,
  PhpOutlined as PhpIcon,
  FontDownloadOutlined as FontDownload,
  StorageOutlined as Storage,
  MovieOutlined as Movie,
  MusicNoteOutlined as MusicNote,
  BrokenImageOutlined as BrokenImage,
  ExtensionOutlined as Extension,
  LibraryBooksOutlined as LibraryBooks,
  CategoryOutlined as Category,
  InventoryOutlined as Inventory,
  InfoOutlined as Info,
  ChevronRightOutlined as ChevronRight,
  ExpandMoreOutlined as ExpandMore,
  MoreVertOutlined as MoreVert,
  CloseOutlined as Close,
} from '@ricons/material';

// 注意：SplitVertical 图标已迁移到 ui 图标集

export const materialIconSet: IconSet = {
  name: 'material',
  icons: {
    // 文件    'folder': Folder,
    'folder-open': FolderOpen,
    
    // 基础文件
    'file': InsertDriveFile,
    'file-document': Description,
    'file-code': Code,
    
    // file- 前缀的文件类型图标（用于 FileIcons.tsx    'file-ts': Code,
    'file-tsx': Code,
    'file-js': Javascript,
    'file-jsx': Javascript,
    'file-json': DataObject,
    'file-md': Article,
    'file-css': Css,
    'file-html': Html,
    'file-image': Image,
    'file-py': Code,
    'file-go': Code,
    'file-rust': Code,
    'file-c': Code,
    'file-cpp': Code,
    'file-java': Code,
    'file-php': PhpIcon,
    'file-video': VideoLibrary,
    'file-audio': AudioFile,
    'file-pdf': PictureAsPdf,
    'file-book': Book,
    'file-article': Article,
    
    // 编程语言（无前缀，用于向后兼容）
    'javascript': Javascript,
    'typescript': Code,
    'html': Html,
    'css': Css,
    'json': DataObject,
    'php': PhpIcon,
    'python': Code,
    'java': Code,
    'go': Code,
    'rust': Code,
    'c': Code,
    'cpp': Code,
    
    // 媒体
    'image': Image,
    'video': VideoLibrary,
    'audio': AudioFile,
    'movie': Movie,
    'music': MusicNote,
    
    // 文档
    'markdown': Article,
    'pdf': PictureAsPdf,
    'book': Book,
    'article': Article,
    
    // 工具
    'settings': Settings,
    'terminal': Terminal,
    'archive': Archive,
    'lock': Lock,
    'build': Build,
    'git': SourceControl,
    
    // 其他
    'public': Public,
    'test': Science,
    'library': LibraryBooks,
    'package': Inventory,
    'components': Category,
    'extension': Extension,
    'database': Storage,
    'font': FontDownload,
    'unknown': BrokenImage,
    'info': Info,
    
    // UI 控制
    'chevron-right': ChevronRight,
    'expand-more': ExpandMore,
    'more-vert': MoreVert,
    'close': Close,
    // 注意：split-vertical 图标已迁移到 ui 图标集，使用 Icon name="split-vertical" 即可
  },
};

