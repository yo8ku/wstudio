/**
 * React Icons backed UI icon set.
 * Preserves the existing internal icon names while rendering Lucide icons from react-icons.
 */

import React from 'react';
import type { IconType } from 'react-icons';
import {
  LuAlignCenter as AlignCenter,
  LuAlignLeft as AlignLeft,
  LuAlignRight as AlignRight,
  LuArchive as Archive,
  LuArrowDownAZ as ArrowDownAZ,
  LuArrowLeft as ArrowLeft,
  LuArrowRight as ArrowRight,
  LuAtSign as AtSign,
  LuBell as Bell,
  LuBetweenVerticalEnd as BetweenVerticalEnd,
  LuBlocks as Blocks,
  LuBolt as Bolt,
  LuBold as Bold,
  LuBook as Book,
  LuBookmark as Bookmark,
  LuBookMarked as BookMarked,
  LuBookOpen as BookOpen,
  LuBookOpenText as BookOpenText,
  LuBot as Bot,
  LuBrain as Brain,
  LuBrainCircuit as BrainCircuit,
  LuBraces as Braces,
  LuCalendarDays as CalendarDays,
  LuCaptions as Captions,
  LuCheck as Check,
  LuChevronDown as ChevronDown,
  LuChevronLeft as ChevronLeft,
  LuChevronRight as ChevronRight,
  LuChevronUp as ChevronUp,
  LuChevronsDown as ChevronsDown,
  LuCircleAlert as CircleAlert,
  LuCircleCheck as CircleCheck,
  LuCircleHelp as CircleHelp,
  LuCirclePlay as CirclePlay,
  LuCircleUserRound as CircleUserRound,
  LuCircleX as CircleX,
  LuClock as Clock,
  LuCodeXml as Code2,
  LuCodeXml as CodeXml,
  LuCopy as Copy,
  LuCrop as Crop,
  LuCrown as Crown,
  LuDatabase as Database,
  LuEllipsis as Ellipsis,
  LuEllipsis as MoreHorizontal,
  LuEllipsisVertical as MoreVertical,
  LuEraser as Eraser,
  LuEqualApproximately as EqualApproximately,
  LuEye as Eye,
  LuEyeOff as EyeOff,
  LuFile as File,
  LuFileCode2 as FileCode2,
  LuFilePlus2 as FilePlus2,
  LuFileText as FileText,
  LuFiles as Files,
  LuFolder as Folder,
  LuFolderKanban as FolderKanban,
  LuFolderOpen as FolderOpen,
  LuFolderPlus as FolderPlus,
  LuFolderTree as FolderTree,
  LuForward as Forward,
  LuFilter as Filter,
  LuGalleryVerticalEnd as GalleryVerticalEnd,
  LuGitBranch as GitBranch,
  LuGlobe as Globe,
  LuGripVertical as GripVertical,
  LuHand as Hand,
  LuHash as Hash,
  LuHistory as History,
  LuImage as Image,
  LuImport as Import,
  LuInbox as Inbox,
  LuInfo as Info,
  LuItalic as Italic,
  LuLanguages as Languages,
  LuLayoutGrid as LayoutGrid,
  LuLink2 as Link2,
  LuList as List,
  LuListChecks as ListChecks,
  LuListCollapse as ListCollapse,
  LuListTree as ListTree,
  LuLoaderCircle as LoaderCircle,
  LuLock as Lock,
  LuMaximize as Maximize,
  LuMaximize2 as Maximize2,
  LuMessageCircle as MessageCircle,
  LuMessageCirclePlus as MessageCirclePlus,
  LuMessagesSquare as MessagesSquare,
  LuMinimize as Minimize,
  LuMinimize2 as Minimize2,
  LuMinus as Minus,
  LuMonitorCog as MonitorCog,
  LuMousePointer2 as MousePointer2,
  LuMoveDown as MoveDown,
  LuMoveRight as MoveRight,
  LuMoveUp as MoveUp,
  LuMoveUpRight as MoveUpRight,
  LuNetwork as Network,
  LuNotebookPen as NotebookPen,
  LuNotebookTabs as NotebookTabs,
  LuPackage as Package,
  LuPaintBucket as PaintBucket,
  LuPalette as Palette,
  LuPanelLeft as PanelLeft,
  LuPanelsTopLeft as PanelsTopLeft,
  LuPenTool as PenTool,
  LuPencil as Pencil,
  LuPlay as Play,
  LuPlus as Plus,
  LuRadio as Radio,
  LuRefreshCcw as RefreshCcw,
  LuRefreshCw as RefreshCw,
  LuRotateCw as RotateCw,
  LuSave as Save,
  LuSaveAll as SaveAll,
  LuScanSearch as ScanSearch,
  LuSearch as Search,
  LuSend as Send,
  LuSettings as Settings,
  LuSettings2 as Settings2,
  LuSparkles as Sparkles,
  LuSquare as Square,
  LuSquareSplitVertical as SplitSquareVertical,
  LuSquareTerminal as SquareTerminal,
  LuSprout as Sprout,
  LuStar as Star,
  LuStore as Store,
  LuStrikethrough as Strikethrough,
  LuTable as Table,
  LuTableProperties as TableProperties,
  LuTag as Tag,
  LuTags as Tags,
  LuTerminal as Terminal,
  LuTextSearch as TextSearch,
  LuThumbsDown as ThumbsDown,
  LuThumbsUp as ThumbsUp,
  LuTrash2 as Trash2,
  LuTrendingUpDown as TrendingUpDown,
  LuTriangleAlert as TriangleAlert,
  LuType as Type,
  LuUnderline as Underline,
  LuUpload as Upload,
  LuUser as User,
  LuVideo as Video,
  LuWaypoints as Waypoints,
  LuWrench as Wrench,
  LuX as X,
  LuZoomIn as ZoomIn,
  LuZoomOut as ZoomOut,
} from 'react-icons/lu';
import type { IconComponent, IconSet } from '../IconRegistry';

const createLucideComponent = (LucideComponent: IconType): IconComponent => {
  const WrappedIcon: IconComponent = ({ style, className }) => (
    <LucideComponent
      size="100%"
      style={style}
      className={className}
    />
  );

  return WrappedIcon;
};

const icons: Record<string, IconComponent> = {};

function registerIconNames(names: readonly string[], LucideComponent: IconType): void {
  const iconComponent = createLucideComponent(LucideComponent);

  names.forEach((name) => {
    icons[name] = iconComponent;
  });
}

registerIconNames(['explorer'], FolderTree);
registerIconNames(['search'], Search);
registerIconNames(['source-control', 'git', 'git-branch'], GitBranch);
registerIconNames(['extensions', 'extensions-manager', 'components', 'extension', 'component'], Blocks);
registerIconNames(['bookmark'], Bookmark);
registerIconNames(['knowledge-base'], BookMarked);
registerIconNames(['knowledge-base-book'], BookOpenText);
registerIconNames(['ai-model'], Bot);
registerIconNames(['media', 'image', 'image-icon', 'file-image'], Image);
registerIconNames(['settings-activity'], Settings2);
registerIconNames(['bolt'], Bolt);
registerIconNames(['user'], User);
registerIconNames(['circle-user-round'], CircleUserRound);

registerIconNames(['menu', 'menubar', 'list', 'list-icon', 'list-view'], List);
registerIconNames(['ai-assistant'], Sparkles);
registerIconNames(['panel-left'], PanelLeft);
registerIconNames(['terminal'], Terminal);
registerIconNames(['square-terminal'], SquareTerminal);
registerIconNames(['minimize'], Minus);
registerIconNames(['maximize'], Square);
registerIconNames(['close-window', 'close', 'close-all', 'window', 'x'], X);
registerIconNames(['app-icon', 'daily-note', 'editor'], NotebookPen);
registerIconNames(['submenu-arrow', 'chevron-right'], ChevronRight);
registerIconNames(['chevron-down', 'expand-more'], ChevronDown);
registerIconNames(['chevron-up'], ChevronUp);
registerIconNames(['chevron-left'], ChevronLeft);

registerIconNames(['plus'], Plus);
registerIconNames(['new-file'], FilePlus2);
registerIconNames(['new-folder'], FolderPlus);
registerIconNames(['eye'], Eye);
registerIconNames(['eye-off'], EyeOff);
registerIconNames(['refresh', 'sync'], RefreshCw);
registerIconNames(['loading', 'loader'], LoaderCircle);
registerIconNames(['check', 'test'], Check);
registerIconNames(['alert-circle'], CircleAlert);
registerIconNames(['error'], CircleX);
registerIconNames(['warning'], TriangleAlert);
registerIconNames(['info'], Info);
registerIconNames(['info-circle'], CircleHelp);
registerIconNames(['gear', 'settings'], Settings);
registerIconNames(['more-vertical', 'more-vert'], MoreVertical);
registerIconNames(['more-horizontal'], MoreHorizontal);
registerIconNames(['ellipsis'], Ellipsis);
registerIconNames(['collapse-all'], ListCollapse);
registerIconNames(['background-settings'], MonitorCog);

registerIconNames(['folder'], Folder);
registerIconNames(['folder-open'], FolderOpen);
registerIconNames(['form-folder'], FolderKanban);
registerIconNames(['files-folder'], Files);
registerIconNames(['important-files', 'star'], Star);
registerIconNames(['file'], File);
registerIconNames(['file-code'], FileCode2);
registerIconNames(['file-document'], FileText);
registerIconNames(['lock'], Lock);
registerIconNames(['filter'], Filter);
registerIconNames(['save'], Save);
registerIconNames(['save-all'], SaveAll);
registerIconNames(['archive'], Archive);
registerIconNames(['package'], Package);

registerIconNames(['tags'], Tags);
registerIconNames(['tag'], Tag);
registerIconNames(['backlinks'], Waypoints);
registerIconNames(['outline', 'skill-detail'], ListTree);
registerIconNames(['annotations', 'message-circle'], MessageCircle);
registerIconNames(['links', 'link-2', 'image-link-style', 'fishing-hook'], Link2);
registerIconNames(['templates'], NotebookTabs);

registerIconNames(['delete'], Trash2);
registerIconNames(['history'], History);
registerIconNames(['code-snippet'], Braces);
registerIconNames(['file-upload'], Upload);
registerIconNames(['streaming'], LoaderCircle);
registerIconNames(['at-sign'], AtSign);
registerIconNames(['context'], MessagesSquare);
registerIconNames(['clear-context'], Eraser);
registerIconNames(['code-execution'], Play);
registerIconNames(['clock'], Clock);
registerIconNames(['deep-thinking'], BrainCircuit);
registerIconNames(['reasoning'], Brain);
registerIconNames(['empty-state'], Inbox);
registerIconNames(['split-vertical'], SplitSquareVertical);
registerIconNames(['wrench', 'tool', 'build'], Wrench);
registerIconNames(['network'], Network);
registerIconNames(['public', 'google', 'baidu', 'bing', 'yandex', 'yahoo', 'aol'], Globe);
registerIconNames(['ai-panel-maximize', 'editor-switch'], PanelsTopLeft);
registerIconNames(['import'], Import);

registerIconNames(['thumb-up'], ThumbsUp);
registerIconNames(['thumb-down'], ThumbsDown);
registerIconNames(['regenerate'], RefreshCcw);
registerIconNames(['copy', 'files-copy'], Copy);
registerIconNames(['circle-play'], CirclePlay);
registerIconNames(['add-to-chat'], MessageCirclePlus);

registerIconNames(['card-view'], LayoutGrid);
registerIconNames(['edit'], Pencil);
registerIconNames(['design', 'theme', 'palette'], Palette);
registerIconNames(['maximize-2'], Maximize2);
registerIconNames(['minimize-2'], Minimize2);
registerIconNames(['code-xml'], CodeXml);
registerIconNames(['hand'], Hand);
registerIconNames(['zoom-in'], ZoomIn);
registerIconNames(['zoom-out'], ZoomOut);
registerIconNames(['stop'], Square);
registerIconNames(['crown-svip'], Crown);
registerIconNames(['notification'], Bell);

registerIconNames(['image-rotate'], RotateCw);
registerIconNames(['image-crop'], Crop);
registerIconNames(['image-size'], ScanSearch);
registerIconNames(['image-align', 'align-left'], AlignLeft);
registerIconNames(['align-center'], AlignCenter);
registerIconNames(['align-right'], AlignRight);
registerIconNames(['image-caption'], Captions);
registerIconNames(['image-card-style'], PanelsTopLeft);
registerIconNames(['gallery-vertical'], GalleryVerticalEnd);
registerIconNames(['video-embed'], Video);
registerIconNames(['grip-vertical'], GripVertical);

registerIconNames(['database'], Database);
registerIconNames(['table', 'table-properties'], TableProperties);
registerIconNames(['mouse-pointer-2'], MousePointer2);
registerIconNames(['pencil'], Pencil);
registerIconNames(['pen-tool'], PenTool);
registerIconNames(['file-type-corner'], FileCode2);
registerIconNames(['type-icon', 'font'], Type);
registerIconNames(['equal-approximately'], EqualApproximately);
registerIconNames(['trending-up-down'], TrendingUpDown);
registerIconNames(['sprout'], Sprout);

registerIconNames(['move-up-right'], MoveUpRight);
registerIconNames(['forward'], Forward);
registerIconNames(['move-right'], MoveRight);
registerIconNames(['move-down'], MoveDown);
registerIconNames(['move-up'], MoveUp);

registerIconNames(['bold'], Bold);
registerIconNames(['italic'], Italic);
registerIconNames(['underline'], Underline);
registerIconNames(['strikethrough'], Strikethrough);
registerIconNames(['settings-2'], Settings2);
registerIconNames(['radio-select'], Radio);
registerIconNames(['checkbox-select'], CircleCheck);
registerIconNames(['number-hash'], Hash);
registerIconNames(['calendar-date'], CalendarDays);
registerIconNames(['list-checks'], ListChecks);
registerIconNames(['paint-bucket', 'cell-fill'], PaintBucket);
registerIconNames(['arrow-left'], ArrowLeft);
registerIconNames(['arrow-right'], ArrowRight);
registerIconNames(['cell-polish'], Sparkles);
registerIconNames(['cell-translate'], Languages);
registerIconNames(['cell-more'], MoreHorizontal);
registerIconNames(['chevrons-down'], ChevronsDown);
registerIconNames(['send'], Send);
registerIconNames(['sort-az'], ArrowDownAZ);
registerIconNames(
  ['row-height', 'row-height-low', 'row-height-medium', 'row-height-high', 'row-height-extra-high'],
  BetweenVerticalEnd,
);
registerIconNames(['text-search'], TextSearch);

registerIconNames(['book'], Book);
registerIconNames(['book-open'], BookOpen);
registerIconNames(['minus'], Minus);
registerIconNames(['store'], Store);

export const uiIconSet: IconSet = {
  name: 'ui',
  icons,
};
