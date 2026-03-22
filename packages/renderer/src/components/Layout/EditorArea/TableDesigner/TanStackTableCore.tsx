/**
 * TanStack Table 閺嶇绺剧紒鍕
 * 閸旂喕鍏橀敍姘唨娴?@tanstack/react-table 閻ㄥ嫬褰茬紓鏍帆鐞涖劍鐗哥紒鍕
 * 閹诲繗鍫敍姘暜閹镐礁宕熼崗鍐╃壐缂傛牞绶妴浣筋攽闁瀚ㄩ妴浣筋攽閹锋牗瀚块幒鎺戠碍閵嗕礁鍨€瑰€熺殶閺佹番鈧礁鐪扮痪褑顢戠粵澶婂閼?
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getExpandedRowModel,
  flexRender,
  type ColumnDef,
} from '@tanstack/react-table';
import { Icon } from '../../../Icons/Icon';
import { Checkbox } from '../../../common/Checkbox';
import { HierarchyTableManager, type FlattenedRow } from './HierarchyTableManager';
import type { TableColumn, TableRow, CellValue, ColumnType } from './types';

/** 鐞涘矂鐝猾璇茬€?*/
export type RowHeightType = 'low' | 'medium' | 'high' | 'extra-high';

interface TanStackTableCoreProps {
  columns: TableColumn[];
  rows: TableRow[];
  hiddenColumns?: Set<string>; // 闂呮劘妫岄惃鍕灙
  rowHeight?: RowHeightType; // 鐞涘矂鐝?
  selectedRows: Set<string>;
  selectedCell: { rowId: string; colId: string } | null;
  selectedColumn: string | null; // 闁鑵戦惃鍕灙ID
  editingCell: { rowId: string; colId: string } | null;
  contextMenuRowId?: string | null; // 閸欐娊鏁懣婊冨礋閹垫挸绱戦惃鍕攽ID
  isGenerating?: boolean;
  tableWrapperRef?: React.RefObject<HTMLDivElement>;
  tableRef?: React.RefObject<HTMLTableElement>;
  // 閸楁洖鍘撻弽鐓庡隘閸╃喖鈧瀚?
  selectedCellRange?: {
    startRowId: string;
    startColId: string;
    endRowId: string;
    endColId: string;
  } | null;
  onSelectedCellRangeChange?: (range: {
    startRowId: string;
    startColId: string;
    endRowId: string;
    endColId: string;
  } | null) => void;
  onRowsChange: (rows: TableRow[]) => void;
  onSelectedRowsChange: (selectedRows: Set<string>) => void;
  onSelectedCellChange: (cell: { rowId: string; colId: string } | null) => void;
  onSelectedColumnChange: (columnId: string | null) => void; // 闁鑵戦崚妤€褰夐崠鏍ф礀鐠?
  onEditingCellChange: (cell: { rowId: string; colId: string } | null, event?: React.MouseEvent<HTMLTableCellElement>) => void;
  onCellUpdate: (rowId: string, colId: string, value: CellValue) => void;
  onAddRow: () => void;
  onAddColumn: () => void;
  onColumnMenuOpen: (columnId: string, position: { x: number; y: number }) => void;
  onCellContextMenu: (rowId: string, colId: string, position: { x: number; y: number }) => void;
  onCellClick?: (rowId: string, colId: string, event: React.MouseEvent<HTMLTableCellElement>) => void;
  onAddChildRow: (parentId: string) => void;
  onToggleRowExpanded: (rowId: string) => void;
  onColumnWidthChange: (columnId: string, width: number) => void;
  renderCellContent: (row: TableRow, column: TableColumn, isEditing: boolean) => React.ReactNode;
}

/** 閼惧嘲褰囬崚妤冭閸ㄥ顕惔鏃傛畱閸ョ偓鐖ｉ崥宥囆?*/
const getColumnTypeIcon = (type: ColumnType): string => {
  const iconMap: Record<ColumnType, string> = {
    text: 'type-icon',
    number: 'number-hash',
    date: 'calendar-date',
    time: 'clock',
    checkbox: 'checkbox-select',
    select: 'radio-select',
    multiselect: 'list-checks',
    tag: 'tag',
    url: 'link-2',
    email: 'at-sign',
    password: 'eye-off',
  };
  return iconMap[type] || 'type-icon';
};


export const TanStackTableCore: React.FC<TanStackTableCoreProps> = ({
  columns,
  rows,
  hiddenColumns = new Set(),
  rowHeight = 'medium',
  selectedRows,
  selectedCell,
  selectedColumn,
  editingCell,
  contextMenuRowId,
  isGenerating = false,
  tableWrapperRef: externalTableWrapperRef,
  tableRef: externalTableRef,
  selectedCellRange,
  onSelectedCellRangeChange,
  onRowsChange,
  onSelectedRowsChange,
  onSelectedCellChange,
  onSelectedColumnChange,
  onEditingCellChange,
  onAddRow,
  onAddColumn,
  onColumnMenuOpen,
  onCellContextMenu,
  onCellClick,
  onAddChildRow,
  onToggleRowExpanded,
  onColumnWidthChange,
  renderCellContent,
}) => {
  const internalTableRef = useRef<HTMLTableElement>(null);
  const tableRef = externalTableRef || internalTableRef;
  const internalTableWrapperRef = useRef<HTMLDivElement>(null);
  const tableWrapperRef = externalTableWrapperRef || internalTableWrapperRef;
  
  // 娴ｈ法鏁?ref 娣囨繃瀵?editingCell 閻ㄥ嫭娓堕弬鏉库偓纭风礉闁灝鍘?useMemo 娓氭繆绂嗙€佃壈鍤ч柌宥嗚閺?
  const editingCellRef = useRef(editingCell);
  editingCellRef.current = editingCell;
  
  // 瀵搫鍩楅弴瀛樻煀鐠佲剝鏆熼崳顭掔礉閻劋绨崷?editingCell 閸欐ê瀵查弮鎯靶曢崣鎴濆礋閸忓啯鐗搁柌宥嗚閺?
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    forceUpdate(n => n + 1);
  }, [editingCell]);
  
  // 閹锋牕濮╅柅澶嬪鐞涘瞼濮搁幀?
  const [isDraggingSelect, setIsDraggingSelect] = useState(false);
  const dragStartRowIndex = useRef<number>(-1);
  
  // 閹锋牕濮╅柅澶嬪閸楁洖鍘撻弽鐓庡隘閸╃喓濮搁幀?
  const [isDraggingCellSelect, setIsDraggingCellSelect] = useState(false);
  const cellDragStartRef = useRef<{ rowId: string; colId: string } | null>(null);
  
  // 閹锋牕濮╃悰灞惧笓鎼村繒濮搁幀?
  const [isDraggingRow, setIsDraggingRow] = useState(false);
  const [dragRowIndex, setDragRowIndex] = useState<number>(-1);
  const [dropTargetIndex, setDropTargetIndex] = useState<number>(-1);
  const [dropIndicatorPosition, setDropIndicatorPosition] = useState<'top' | 'bottom'>('top');
  const dragRowIndexRef = useRef<number>(-1);
  const dropTargetIndexRef = useRef<number>(-1);
  const dropIndicatorPositionRef = useRef<'top' | 'bottom'>('top');
  
  // 閸掓顔旈幏鏍уЗ閻樿埖鈧?
  const [resizingColumn, setResizingColumn] = useState<string | null>(null);
  const resizeStartX = useRef<number>(0);
  const resizeStartWidth = useRef<number>(0);
  
  // 閺勵垰鎯侀棁鈧憰浣告祼鐎规艾鍨?
  const [needStickyColumn, setNeedStickyColumn] = useState(false);
  
  // 闁鑵戦崠鍝勭厵鐟曞棛娲婄仦鍌欑秴缂?
  const [selectionOverlay, setSelectionOverlay] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);

  // 鐠侊紕鐣婚幍浣搁挬閸栨牜娈戠仦鍌滈獓鐞涘本鏆熼幑?
  const flattenedRows = useMemo(() => {
    return HierarchyTableManager.flattenRows(rows);
  }, [rows]);

  // 娴ｈ法鏁?ref 鐎涙ê鍋?flattenedRows閿涘奔浜掓笟鍨躬娴滃娆㈡径鍕倞閸ｃ劋鑵戠拋鍧楁６閺堚偓閺傛澘鈧?
  const flattenedRowsRef = useRef(flattenedRows);
  useEffect(() => {
    flattenedRowsRef.current = flattenedRows;
  }, [flattenedRows]);

  // 閸掋倖鏌囬崡鏇炲帗閺嶅吋妲搁崥锕€婀柅澶夎厬閸栧搫鐓欓崘鍜冪礄閻劋绨〒鍛敄閸愬懎顔愰弮璁圭礆
  const isCellInRange = useCallback((rowId: string, colId: string): boolean => {
    if (!selectedCellRange) return false;
    
    const { startRowId, startColId, endRowId, endColId } = selectedCellRange;
    
    // 娴ｈ法鏁?flattenedRows 閼惧嘲褰囩悰宀€鍌ㄥ鏇″瘱閸ヨ揪绱欓崶鐘辫礋鐞涖劍鐗搁弰鍓с仛閻ㄥ嫭妲搁幍浣搁挬閸栨牕鎮楅惃鍕殶閹诡噯绱?
    const startRowIndex = flattenedRows.findIndex(fr => fr.row.id === startRowId);
    const endRowIndex = flattenedRows.findIndex(fr => fr.row.id === endRowId);
    const currentRowIndex = flattenedRows.findIndex(fr => fr.row.id === rowId);
    const minRowIndex = Math.min(startRowIndex, endRowIndex);
    const maxRowIndex = Math.max(startRowIndex, endRowIndex);
    
    // 閼惧嘲褰囬崚妤冨偍瀵洝瀵栭崶?
    const startColIndex = columns.findIndex(c => c.id === startColId);
    const endColIndex = columns.findIndex(c => c.id === endColId);
    const currentColIndex = columns.findIndex(c => c.id === colId);
    const minColIndex = Math.min(startColIndex, endColIndex);
    const maxColIndex = Math.max(startColIndex, endColIndex);
    
    return currentRowIndex >= minRowIndex && currentRowIndex <= maxRowIndex &&
           currentColIndex >= minColIndex && currentColIndex <= maxColIndex;
  }, [selectedCellRange, flattenedRows, columns]);

  // 鐠侊紕鐣婚柅澶夎厬閸栧搫鐓欑憰鍡欐磰鐏炲倷缍呯純?
  useEffect(() => {
    if (!selectedCellRange || !tableRef.current || !tableWrapperRef.current) {
      setSelectionOverlay(null);
      return;
    }
    
    const { startRowId, startColId, endRowId, endColId } = selectedCellRange;
    
    // 閹垫儳鍩岀挧宄邦潗閸滃瞼绮ㄩ弶鐔峰礋閸忓啯鐗搁惃?DOM 閸忓啰绀?
    const startCell = tableRef.current.querySelector(`td[data-row-id="${startRowId}"][data-col-id="${startColId}"]`);
    const endCell = tableRef.current.querySelector(`td[data-row-id="${endRowId}"][data-col-id="${endColId}"]`);
    
    if (!startCell || !endCell) {
      setSelectionOverlay(null);
      return;
    }
    
    const startRect = startCell.getBoundingClientRect();
    const endRect = endCell.getBoundingClientRect();
    const wrapperRect = tableWrapperRef.current.getBoundingClientRect();
    
    // 鐠侊紕鐣婚柅澶夎厬閸栧搫鐓欓惃鍕珶閻ｅ矉绱欓惄绋款嚠娴?wrapper閿涘矁鈧啳妾诲姘З閸嬪繒些閿?
    const scrollLeft = tableWrapperRef.current.scrollLeft;
    const scrollTop = tableWrapperRef.current.scrollTop;
    
    const minLeft = Math.min(startRect.left, endRect.left) - wrapperRect.left + scrollLeft;
    const minTop = Math.min(startRect.top, endRect.top) - wrapperRect.top + scrollTop;
    const maxRight = Math.max(startRect.right, endRect.right) - wrapperRect.left + scrollLeft;
    const maxBottom = Math.max(startRect.bottom, endRect.bottom) - wrapperRect.top + scrollTop;
    
    setSelectionOverlay({
      top: minTop,
      left: minLeft,
      width: maxRight - minLeft,
      height: maxBottom - minTop,
    });
  }, [selectedCellRange]);

  // 濡偓濞村妲搁崥锕傛付鐟曚礁娴愮€规艾鍨?
  useEffect(() => {
    const checkNeedStickyColumn = () => {
      if (!tableWrapperRef.current) return;
      const wrapper = tableWrapperRef.current;
      const hasHorizontalScroll = wrapper.scrollWidth > wrapper.clientWidth;
      const hasScrolled = wrapper.scrollLeft > 0;
      setNeedStickyColumn(hasHorizontalScroll && hasScrolled);
    };

    const wrapper = tableWrapperRef.current;
    wrapper?.addEventListener('scroll', checkNeedStickyColumn);
    window.addEventListener('resize', checkNeedStickyColumn);
    checkNeedStickyColumn();

    return () => {
      wrapper?.removeEventListener('scroll', checkNeedStickyColumn);
      window.removeEventListener('resize', checkNeedStickyColumn);
    };
  }, [columns]);

  // 閻╂垵鎯夐柧鐐复閸楁洖鍘撻弽鑲╂畱閸欏苯鍤懛顏勭暰娑斿绨ㄦ禒?
  useEffect(() => {
    const handleLinkDoubleClick = (e: Event) => {
      const customEvent = e as CustomEvent<{ rowId: string; colId: string }>;
      const { rowId, colId } = customEvent.detail;
      if (rowId && colId) {
        const column = columns.find(c => c.id === colId);
        if (column?.type !== 'checkbox') {
          onEditingCellChange({ rowId, colId });
        }
      }
    };

    const wrapper = tableWrapperRef.current;
    wrapper?.addEventListener('cell-double-click', handleLinkDoubleClick);

    return () => {
      wrapper?.removeEventListener('cell-double-click', handleLinkDoubleClick);
    };
  }, [columns, onEditingCellChange]);

  // 閸掓顔旈幏鏍уЗ婢跺嫮鎮?
  const handleResizeStart = useCallback((columnId: string, event: React.MouseEvent) => {
    console.log('[handleResizeStart] columnId:', columnId);
    event.preventDefault();
    event.stopPropagation();
    const column = columns.find(c => c.id === columnId);
    if (column) {
      setResizingColumn(columnId);
      resizeStartX.current = event.clientX;
      resizeStartWidth.current = column.width || 150;
      console.log('[handleResizeStart] started, width:', column.width);
    }
  }, [columns]);

  useEffect(() => {
    if (!resizingColumn) return;

    const handleResizeMove = (event: MouseEvent) => {
      const delta = event.clientX - resizeStartX.current;
      const newWidth = Math.max(80, resizeStartWidth.current + delta);
      onColumnWidthChange(resizingColumn, newWidth);
    };

    const handleResizeEnd = () => {
      console.log('[handleResizeEnd] ended');
      setResizingColumn(null);
    };

    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', handleResizeEnd);

    return () => {
      document.removeEventListener('mousemove', handleResizeMove);
      document.removeEventListener('mouseup', handleResizeEnd);
    };
  }, [resizingColumn, onColumnWidthChange]);

  // 鐞涘矂鈧瀚ㄦ径鍕倞
  const handleToggleRowSelect = useCallback((rowId: string) => {
    const next = new Set(selectedRows);
    const isSelecting = !next.has(rowId);
    
    if (isSelecting) {
      next.add(rowId);
    } else {
      next.delete(rowId);
    }
    
    // 閹垫儳鍩岃ぐ鎾冲鐞?
    const currentRow = rows.find(r => r.id === rowId);
    
    // 濡偓閺屻儱缍嬮崜宥堫攽閺勵垰鎯侀張澶婄摍鐠佹澘缍?
    const children = rows.filter(r => r.parentId === rowId);
    if (children.length > 0) {
      if (isSelecting) {
        // 瑜版挸澧犵悰灞炬Ц閻栨儼顢戞稉鏃囶潶闁鑵戦敍灞芥倱閺冨爼鈧鑵戦幍鈧張澶婄摍鐠佹澘缍?
        children.forEach(child => {
          next.add(child.id);
        });
      } else {
        // 瑜版挸澧犵悰灞炬Ц閻栨儼顢戞稉鏃囶潶閸欐牗绉烽柅澶夎厬閿涘苯鎮撻弮璺哄絿濞戝牊澧嶉張澶婄摍鐠佹澘缍嶉惃鍕偓澶夎厬
        children.forEach(child => {
          next.delete(child.id);
        });
      }
    }
    
    // 濡偓閺屻儲妲搁崥锕傛付鐟曚浇鍤滈崝銊┾偓澶夎厬閻栨儼顢?
    if (currentRow?.parentId) {
      // 瑜版挸澧犵悰灞炬Ц鐎涙劘顔囪ぐ鏇礉濡偓閺屻儱鎮撴稉鈧悥鎯邦攽閻ㄥ嫭澧嶉張澶婄摍鐠佹澘缍嶉弰顖氭儊闁€燁潶闁鑵?
      const siblings = rows.filter(r => r.parentId === currentRow.parentId);
      const allSiblingsSelected = siblings.every(sibling => next.has(sibling.id));
      if (allSiblingsSelected) {
        // 閹碘偓閺堝鐡欑拋鏉跨秿闁€燁潶闁鑵戦敍宀冨殰閸斻劑鈧鑵戦悥鎯邦攽
        next.add(currentRow.parentId);
      } else {
        // 閺堝鐡欑拋鏉跨秿閺堫亪鈧鑵戦敍灞藉絿濞戝牏鍩楃悰宀勨偓澶夎厬
        next.delete(currentRow.parentId);
      }
    }
    
    onSelectedRowsChange(next);
  }, [selectedRows, rows, onSelectedRowsChange]);

  // 閸忋劑鈧?閸欐牗绉烽崗銊┾偓?
  const handleToggleSelectAll = useCallback(() => {
    if (selectedRows.size === rows.length) {
      onSelectedRowsChange(new Set());
    } else {
      onSelectedRowsChange(new Set(rows.map(r => r.id)));
    }
  }, [rows, selectedRows.size, onSelectedRowsChange]);

  // 閹锋牕濮╅柅澶嬪瀵偓婵?- 閸欘亣顔囪ぐ鏇℃崳婵缍呯純顕嗙礉娑撳秵娲块弬鎵Ц閹?
  const handleRowDragSelectStart = useCallback((flatIndex: number, event: React.MouseEvent) => {
    if (event.button !== 0) return;
    if (editingCell) return;
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' && target.classList.contains('editing')) return;
    
    // 濡偓閺屻儲妲搁崥锔惧仯閸戣崵娈戦弰顖濐攽閸欏嘲鍨敍鍧癳lector閿?
    const td = target.closest('td');
    if (!td || !td.classList.contains('row-selector-cell')) {
      // 娑撳秵妲哥悰灞藉娇閸掓绱濇稉宥埿曢崣鎴ｎ攽闁瀚?
      return;
    }
    
    // 閸欘亣顔囪ぐ鏇℃崳婵缍呯純顕嗙礉娑撳秵娲块弬鎵Ц閹緤绱欓柆鍨帳闁插秵鏌婂〒鍙夌厠瑜板崬鎼烽崣灞藉毊娴滃娆㈤敍?
    dragStartRowIndex.current = flatIndex;
    // 濞撳懐鈹栭崡鏇炲帗閺嶇厧灏崺鐔尖偓澶嬪
    onSelectedCellRangeChange?.(null);
  }, [editingCell, onSelectedCellRangeChange]);

  // 閸楁洖鍘撻弽鍏煎珛閸斻劑鈧瀚ㄥ鈧慨?
  const handleCellDragSelectStart = useCallback((rowId: string, colId: string, event: React.MouseEvent) => {
    if (event.button !== 0) return;
    if (editingCell) return;
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' && target.classList.contains('editing')) return;
    
    // 閸欘亣顔囪ぐ鏇℃崳婵宕熼崗鍐╃壐閿涘奔绗夌粩瀣祮鐠佸墽鐤?selectedCellRange
    // 缁涘鍩岄惇鐔割劀閹锋牗瀚跨粔璇插З閸掗绗夐崥灞藉礋閸忓啯鐗搁弮鑸靛鐠佸墽鐤?
    cellDragStartRef.current = { rowId, colId };
    // 濞撳懐鈹栫悰宀勨偓澶嬪
    onSelectedRowsChange(new Set());
  }, [editingCell, onSelectedRowsChange]);

  // 閸楁洖鍘撻弽鍏煎珛閸斻劑鈧瀚ㄧ粔璇插З
  const updateCellDragSelection = useCallback((rowId: string, colId: string) => {
    if (!cellDragStartRef.current) return;
    
    const startCell = cellDragStartRef.current;
    // 閸欘亝婀佽ぐ鎾村珛閹疯棄鍩屾稉宥呮倱閸楁洖鍘撻弽鍏兼閹靛秷顔曠純顕€鈧鑵戦崠鍝勭厵
    if (startCell.rowId === rowId && startCell.colId === colId) {
      // 鏉╂ê婀崥灞肩娑擃亜宕熼崗鍐╃壐閿涘奔绗夌拋鍓х枂閸栧搫鐓欓柅澶嬪
      return;
    }
    
    // 濞撳懐鈹栭崡鏇氶嚋閸楁洖鍘撻弽濂糕偓澶嬪閿涘牊瀚嬮幏浠嬧偓澶嬪閸滃苯宕熼崙濠氣偓澶嬪娴滄帗鏋奸敍?
    onSelectedCellChange(null);
    
    onSelectedCellRangeChange?.({
      startRowId: startCell.rowId,
      startColId: startCell.colId,
      endRowId: rowId,
      endColId: colId,
    });
  }, [onSelectedCellRangeChange, onSelectedCellChange]);

  // 閸楁洖鍘撻弽鍏煎珛閸斻劑鈧瀚ㄩ惄鎴濇儔
  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!cellDragStartRef.current) return;
      
      const target = event.target as HTMLElement;
      const td = target.closest('td');
      if (!td || !tableRef.current?.contains(td)) return;
      
      const rowId = td.getAttribute('data-row-id');
      const colId = td.getAttribute('data-col-id');
      if (!rowId || !colId || colId === 'selector' || colId === 'add-column') return;
      
      setIsDraggingCellSelect(true);
      updateCellDragSelection(rowId, colId);
    };

    const handleMouseUp = () => {
      setIsDraggingCellSelect(false);
      cellDragStartRef.current = null;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [updateCellDragSelection]);

  // 閹锋牕濮╅柅澶嬪缁夎濮?
  const updateDragSelection = useCallback((flatIndex: number) => {
    if (dragStartRowIndex.current === -1) return;
    const startIndex = Math.min(dragStartRowIndex.current, flatIndex);
    const endIndex = Math.max(dragStartRowIndex.current, flatIndex);
    const selectedIds = new Set<string>();
    for (let i = startIndex; i <= endIndex; i++) {
      if (flattenedRows[i]) {
        selectedIds.add(flattenedRows[i].row.id);
      }
    }
    onSelectedRowsChange(selectedIds);
  }, [flattenedRows, onSelectedRowsChange]);


  // 閹锋牕濮╅柅澶嬪閻╂垵鎯?- 娴ｈ法鏁?dragStartRowIndex 閼板奔绗夐弰?isDraggingSelect
  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      // 閸欘亝婀佽ぐ?dragStartRowIndex 閺堝鏅ラ弮鑸靛婢跺嫮鎮?
      if (dragStartRowIndex.current === -1) return;
      
      const target = event.target as HTMLElement;
      const tr = target.closest('tr');
      if (!tr || !tableRef.current?.contains(tr)) return;
      
      const tbody = tableRef.current.querySelector('tbody');
      if (!tbody) return;
      const allRows = Array.from(tbody.querySelectorAll('tr:not(.add-row-tr)'));
      const rowIndex = allRows.indexOf(tr);
      if (rowIndex >= 0 && rowIndex !== dragStartRowIndex.current) {
        // 閸欘亝婀佽ぐ鎾缎╅崝銊ュ煂娑撳秴鎮撶悰灞炬閹靛秵娲块弬浼粹偓澶嬪
        setIsDraggingSelect(true);
        updateDragSelection(rowIndex);
      }
    };

    const handleMouseUp = () => {
      setIsDraggingSelect(false);
      dragStartRowIndex.current = -1;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [updateDragSelection]);

  // 鐞涘本瀚嬮幏鑺ュ笓鎼村繐绱戞慨?
  const handleRowDragStart = useCallback((flatIndex: number, event: React.MouseEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    
    // 婵″倹鐏夎ぐ鎾冲閹锋牗瀚块惃鍕攽閺堝鐡欑拋鏉跨秿娑撴柨鍑＄仦鏇炵磻閿涘矁鍤滈崝銊﹀閸?
    const flatRow = flattenedRows[flatIndex];
    if (flatRow) {
      const hasChildren = rows.some(r => r.parentId === flatRow.row.id);
      if (hasChildren && flatRow.expanded) {
        onToggleRowExpanded(flatRow.row.id);
      }
    }
    
    setIsDraggingRow(true);
    setDragRowIndex(flatIndex);
    setDropTargetIndex(flatIndex);
    dragRowIndexRef.current = flatIndex;
    dropTargetIndexRef.current = flatIndex;
  }, [flattenedRows, rows, onToggleRowExpanded]);

  // 鐞涘本瀚嬮幏鑺ュ笓鎼村繒娲冮崥?
  useEffect(() => {
    if (!isDraggingRow) return;
    
    // 閼惧嘲褰囩悮顐ｅ珛閹峰€燁攽閻ㄥ嫪淇婇幁顖ょ礄娴ｈ法鏁?ref 閼惧嘲褰囬張鈧弬鐗堟殶閹诡噯绱?
    const currentFlattenedRows = flattenedRowsRef.current;
    const fromFlatRow = currentFlattenedRows[dragRowIndexRef.current];
    const fromRowHasChildren = fromFlatRow ? rows.some(r => r.parentId === fromFlatRow.row.id) : false;
    
    // 鐠佹澘缍嶆稉濠佺濞嗭繝绱堕弽鍢崸鎰垼閿涘瞼鏁ゆ禍搴″灲閺傤厽瀚嬮幏鑺ユ煙閸氭埊绱欓崚婵嗩潗閸栨牔璐?-1 鐞涖劎銇氶張顏囶啎缂冾噯绱?
    let lastMouseY = -1;

    const handleMouseMove = (event: MouseEvent) => {
      // 濮ｅ繑顐肩粔璇插З閺冩儼骞忛崣鏍ㄦ付閺傛壆娈?flattenedRows
      const latestFlattenedRows = flattenedRowsRef.current;
      
      const target = event.target as HTMLElement;
      const tr = target.closest('tr');
      if (!tr || !tableRef.current?.contains(tr)) return;
      
      const tbody = tableRef.current.querySelector('tbody');
      if (!tbody) return;
      const allRows = Array.from(tbody.querySelectorAll('tr:not(.add-row-tr)'));
      let flatIndex = allRows.indexOf(tr);
      
      // 閸掋倖鏌囬幏鏍ㄥ閺傜懓鎮滈敍鍫㈩儑娑撯偓濞嗭紕些閸斻劍妞傞弽瑙勫祦閻╊喗鐖ｆ担宥囩枂娑撳氦鎹ｆ慨瀣╃秴缂冾喖鍨介弬顓ㄧ礆
      let isDraggingDown: boolean;
      if (lastMouseY === -1) {
        // 缁楊兛绔村▎锛勑╅崝顭掔礉閺嶈宓侀惄顔界垼缁便垹绱╂稉搴ゆ崳婵鍌ㄥ鏇炲灲閺傤厽鏌熼崥?
        isDraggingDown = flatIndex > dragRowIndexRef.current;
      } else {
        isDraggingDown = event.clientY > lastMouseY;
      }
      lastMouseY = event.clientY;
      
      if (flatIndex >= 0 && flatIndex < latestFlattenedRows.length) {
        const targetFlatRow = latestFlattenedRows[flatIndex];
        // 姒涙顓婚幐鍥┿仛缁惧じ缍呯純顕嗙窗閸氭垳绗呴幏鏍ㄥ閺勫墽銇氶崷銊ょ瑓閺傜櫢绱濋崥鎴滅瑐閹锋牗瀚块弰鍓с仛閸︺劋绗傞弬?
        let indicatorPos: 'top' | 'bottom' = isDraggingDown ? 'bottom' : 'top';
        
        // 婵″倹鐏夌悮顐ｅ珛閹风晫娈戠悰灞炬箒鐎涙劘顔囪ぐ?
        if (fromRowHasChildren && targetFlatRow) {
          // 閹懎鍠?: 閻╊喗鐖ｉ弰顖氱摍鐠佹澘缍嶉敍鍧塭pth > 0閿?
          if (targetFlatRow.depth > 0) {
            // 閸氭垳绗傞弻銉﹀閻栨儼顢?
            let parentIndex = flatIndex - 1;
            while (parentIndex >= 0 && latestFlattenedRows[parentIndex].depth > 0) {
              parentIndex--;
            }
            
            if (parentIndex >= 0) {
              // 閹垫儳鍩岀拠銉у煑鐞涘瞼绮嶉惃鍕付閸氬簼绔存稉顏勭摍鐠佹澘缍?
              let lastChildIndex = parentIndex;
              for (let i = parentIndex + 1; i < latestFlattenedRows.length; i++) {
                if (latestFlattenedRows[i].depth > 0) {
                  lastChildIndex = i;
                } else {
                  break;
                }
              }
              
              if (isDraggingDown) {
                // 閸氭垳绗呴幏鏍ㄥ閿涘矁鐑﹂崚棰佺瑓娑撯偓娑擃亞鍩楃悰宀嬬礉閹稿洨銇氱痪鎸庢▔缁€鍝勬躬鐠囥儴顢戞稉濠冩煙
                const nextParentIndex = lastChildIndex + 1;
                if (nextParentIndex < latestFlattenedRows.length) {
                  flatIndex = nextParentIndex;
                  indicatorPos = 'top'; // 閺勫墽銇氶崷銊ょ瑓娑撯偓娑擃亞鍩楃悰宀€娈戞稉濠冩煙
                } else {
                  // 濞屸剝婀佹稉瀣╃娑擃亞鍩楃悰宀嬬礉娣囨繃瀵旈崷銊ョ秼閸撳秶鍩楃悰?
                  flatIndex = parentIndex;
                  indicatorPos = 'bottom';
                }
              } else {
                // 閸氭垳绗傞幏鏍ㄥ閿涘矁鐑﹂崚鎵煑鐞?
                flatIndex = parentIndex;
                indicatorPos = 'top';
              }
            }
          }
          // 閹懎鍠?: 閻╊喗鐖ｉ弰顖涙箒鐏炴洖绱戠€涙劘顔囪ぐ鏇犳畱閻栨儼顢戦敍鍫濇倻娑撳瀚嬮幏鑺ユ鐠哄疇绻冪€涙劘顔囪ぐ鏇炲隘閸╃噦绱?
          else if (isDraggingDown && targetFlatRow.depth === 0 && targetFlatRow.hasChildren && targetFlatRow.expanded) {
            // 閹垫儳鍩岀拠銉у煑鐞涘瞼娈戦張鈧崥搴濈娑擃亜鐡欑拋鏉跨秿
            let lastChildIndex = flatIndex;
            for (let i = flatIndex + 1; i < latestFlattenedRows.length; i++) {
              if (latestFlattenedRows[i].depth > 0) {
                lastChildIndex = i;
              } else {
                break;
              }
            }
            // 鐠哄啿鍩屾稉瀣╃娑擃亞鍩楃悰宀嬬礉閹稿洨銇氱痪鎸庢▔缁€鍝勬躬鐠囥儴顢戞稉濠冩煙
            const nextParentIndex = lastChildIndex + 1;
            if (nextParentIndex < latestFlattenedRows.length) {
              flatIndex = nextParentIndex;
              indicatorPos = 'top';
            } else {
              // 濞屸剝婀佹稉瀣╃娑擃亞鍩楃悰宀嬬礉娣囨繃瀵旈崷銊︽付閸氬簼绔存稉顏勭摍鐠佹澘缍嶉敍灞炬▔缁€鍝勬躬娑撳鏌?
              flatIndex = lastChildIndex;
              indicatorPos = 'bottom';
            }
          }
        }
        
        if (flatIndex !== dropTargetIndexRef.current || indicatorPos !== dropIndicatorPositionRef.current) {
          dropTargetIndexRef.current = flatIndex;
          dropIndicatorPositionRef.current = indicatorPos;
          setDropTargetIndex(flatIndex);
          setDropIndicatorPosition(indicatorPos);
        }
      }
    };

    const handleMouseUp = () => {
      // 娴ｈ法鏁?ref 閼惧嘲褰囬張鈧弬鎵畱 flattenedRows
      const latestFlattenedRows = flattenedRowsRef.current;
      const fromFlatIndex = dragRowIndexRef.current;
      const toFlatIndex = dropTargetIndexRef.current;
      const indicatorPos = dropIndicatorPositionRef.current;
      
      // 閸掋倖鏌囬弰顖氭儊闂団偓鐟曚焦澧界悰宀€些閸斻劍鎼锋担?
      // 1. 婵″倹鐏夐惄顔界垼缁便垹绱╃粵澶夌艾鐠у嘲顫愮槐銏犵穿閿涘奔绗夌粔璇插З
      // 2. 婵″倹鐏夐幐鍥┿仛缁惧灝婀幏鏍ㄥ鐞涘本顒滄稉瀣煙閿涘澅oFlatIndex === fromFlatIndex + 1 娑?indicatorPos === 'top'閿涘绱濇稉宥囆╅崝?
      const isNoOp = fromFlatIndex === toFlatIndex || 
        (toFlatIndex === fromFlatIndex + 1 && indicatorPos === 'top');
      
      if (fromFlatIndex !== -1 && toFlatIndex !== -1 && !isNoOp) {
        const fromFlatRow = latestFlattenedRows[fromFlatIndex];
        const toFlatRow = latestFlattenedRows[toFlatIndex];
        
        if (fromFlatRow && toFlatRow) {
          const fromRow = fromFlatRow.row;
          const toRow = toFlatRow.row;
          
          // 濡偓閺屻儴顫﹂幏鏍ㄥ閻ㄥ嫯顢戦弰顖氭儊閺堝鐡欑拋鏉跨秿
          const fromRowHasChildren = rows.some(r => r.parentId === fromRow.id);
          
          // 闂勬劕鍩?: 閺堝鐡欑拋鏉跨秿閻ㄥ嫯顢戞稉宥堝厴閹锋牗瀚块崚鏉跨摍鐠佹澘缍嶆担宥囩枂閿涘牅绗夐懗鑺ュ灇娑撳搫鍙炬禒鏍攽閻ㄥ嫬鐡欑拋鏉跨秿閿?
          if (fromRowHasChildren && toRow.parentId) {
            // 娑撳秴鍘戠拋鍛婂珛閹锋枻绱濋惄瀛樺复鏉╂柨娲?
            setIsDraggingRow(false);
            setDragRowIndex(-1);
            setDropTargetIndex(-1);
            dragRowIndexRef.current = -1;
            dropTargetIndexRef.current = -1;
            dropIndicatorPositionRef.current = 'top';
            return;
          }
          
          // 闂勬劕鍩?: 閺堝鐡欑拋鏉跨秿閻ㄥ嫯顢戞稉宥堝厴閹锋牗瀚块崚鐗堟箒鐎涙劘顔囪ぐ鏇犳畱鐞涘奔鑵戦敍鍫㈡窗閺嶅洩顢戦張澶婄摍鐠佹澘缍嶉弮璁圭礆
          const toRowHasChildren = rows.some(r => r.parentId === toRow.id);
          if (fromRowHasChildren && toRowHasChildren && toRow.parentId) {
            // 娑撳秴鍘戠拋鍛婂珛閹锋枻绱濋惄瀛樺复鏉╂柨娲?
            setIsDraggingRow(false);
            setDragRowIndex(-1);
            setDropTargetIndex(-1);
            dragRowIndexRef.current = -1;
            dropTargetIndexRef.current = -1;
            dropIndicatorPositionRef.current = 'top';
            return;
          }
          
          const fromOriginalIndex = rows.findIndex(r => r.id === fromRow.id);
          const toOriginalIndex = rows.findIndex(r => r.id === toRow.id);
          
          if (fromOriginalIndex !== -1 && toOriginalIndex !== -1) {
            const newRows = [...rows];
            const [movedRow] = newRows.splice(fromOriginalIndex, 1);
            
            // 婵″倹鐏夐惄顔界垼鐞涘本妲哥€涙劘顔囪ぐ鏇礉鐏忓棜顫﹂幏鏍ㄥ閻ㄥ嫯顢戞稊鐔峰綁閹存劕鎮撴稉鈧悥鎯邦攽閻ㄥ嫬鐡欑拋鏉跨秿
            // 娴ｅ棗顩ч弸婊嗩潶閹锋牗瀚块惃鍕攽閺堝鐡欑拋鏉跨秿閿涘苯鍨稉宥堝厴閸欐ɑ鍨氱€涙劘顔囪ぐ鏇礄娣囨繃瀵旀稉铏瑰煑鐞涘矉绱?
            if (toRow.parentId && !fromRowHasChildren) {
              movedRow.parentId = toRow.parentId;
            } else {
              // 婵″倹鐏夐惄顔界垼鐞涘奔绗夐弰顖氱摍鐠佹澘缍嶉敍灞惧灗閼板懓顫﹂幏鏍ㄥ閻ㄥ嫯顢戦張澶婄摍鐠佹澘缍嶉敍灞剧闂勩倛顫﹂幏鏍ㄥ鐞涘瞼娈戦悥鎯邦攽閸忓磭閮?
              delete movedRow.parentId;
            }
            
            const adjustedToIndex = toOriginalIndex > fromOriginalIndex ? toOriginalIndex : toOriginalIndex;
            newRows.splice(adjustedToIndex, 0, movedRow);
            onRowsChange(newRows);
          }
        }
      }
      setIsDraggingRow(false);
      setDragRowIndex(-1);
      setDropTargetIndex(-1);
      dragRowIndexRef.current = -1;
      dropTargetIndexRef.current = -1;
      dropIndicatorPositionRef.current = 'top';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingRow, rows, onRowsChange]);

  // 閸楁洖鍘撻弽鑲╁仯閸?
  const handleCellClick = useCallback((rowId: string, colId: string, event: React.MouseEvent<HTMLTableCellElement>) => {
    event.stopPropagation();
    // 濞撳懐鈹栭崡鏇炲帗閺嶇厧灏崺鐔尖偓澶嬪閿涘牆宕熼崙濠氣偓澶夎厬閸滃本瀚嬮幏浠嬧偓澶夎厬娴滄帗鏋奸敍?
    onSelectedCellRangeChange?.(null);
    onSelectedCellChange({ rowId, colId });
    // 鐠嬪啰鏁ゆ径鏍劥閻?onCellClick 閸ョ偠鐨熼敍鍫㈡暏娴滃孩妯夌粈鍝勪紣閸忛攱鐖敍?
    onCellClick?.(rowId, colId, event);
  }, [onSelectedCellChange, onSelectedCellRangeChange, onCellClick]);

  // 閸楁洖鍘撻弽鐓庡蓟閸?
  const handleCellDoubleClick = useCallback((rowId: string, colId: string, event: React.MouseEvent<HTMLTableCellElement>) => {
    console.log('[TanStackTableCore] handleCellDoubleClick called, rowId:', rowId, 'colId:', colId);
    const column = columns.find(c => c.id === colId);
    if (column?.type !== 'checkbox') {
      onEditingCellChange({ rowId, colId }, event);
    }
  }, [columns, onEditingCellChange]);

  // 閸楁洖鍘撻弽鐓庡礁闁款喛褰嶉崡?
  const handleCellRightClick = useCallback((rowId: string, colId: string, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    onCellContextMenu(rowId, colId, { x: event.clientX, y: event.clientY });
  }, [onCellContextMenu]);

  // 閸掓銇旈悙鐟板毊 - 闁鑵戦崚?
  const handleColumnHeaderClick = useCallback((columnId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    // 濞撳懘娅庨崡鏇炲帗閺嶅ジ鈧鑵戦悩鑸碘偓?
    onSelectedCellChange(null);
    // 闁鑵戠拠銉ュ灙
    onSelectedColumnChange(columnId);
  }, [onSelectedCellChange, onSelectedColumnChange]);

  // 閸掓銇旀稉瀣缁狀厼銇旈悙鐟板毊 - 閹垫挸绱戦懣婊冨礋
  const handleColumnMenuClick = useCallback((columnId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    onColumnMenuOpen(columnId, { x: event.clientX, y: event.clientY });
  }, [onColumnMenuOpen]);


  // 閺嬪嫬缂?TanStack Table 閸掓鐣炬稊?
  const tableColumns = useMemo<ColumnDef<FlattenedRow>[]>(() => {
    // 闁瀚ㄩ崳銊ュ灙
    const selectorColumn: ColumnDef<FlattenedRow> = {
      id: 'selector',
      size: 56,
      minSize: 56,
      maxSize: 56,
      header: () => (
        <div className="row-selector-cell header-cell">
          <span className="row-drag-handle" style={{ visibility: 'hidden' }}>
            <Icon name="grip-vertical" size={12} />
          </span>
          <Checkbox
            checked={selectedRows.size === rows.length && rows.length > 0}
            onChange={handleToggleSelectAll}
            className="row-checkbox"
          />
        </div>
      ),
      cell: ({ row }) => {
        const flatRow = row.original;
        const { row: dataRow, depth, hasChildren, expanded: isExpanded, flatIndex } = flatRow;
        const topLevelIndex = depth === 0 
          ? flattenedRows.slice(0, flatIndex + 1).filter(r => r.depth === 0).length
          : 0;
        // 閹锋牗瀚块弮璺哄涧閺勫墽銇氱悮顐ｅ珛閹峰€燁攽閻ㄥ嫭瀚嬮幏钘夋禈閺?
        const showDragHandle = !isDraggingRow || dragRowIndex === flatIndex;
        
        return (
          <div className={`row-selector-cell ${hasChildren ? 'has-children' : ''} ${depth > 0 ? 'child-row-cell' : ''}`}>
            {showDragHandle && (
              <span 
                className="row-drag-handle"
                onMouseDown={(e) => handleRowDragStart(flatIndex, e)}
              >
                <Icon name="grip-vertical" size={12} />
              </span>
            )}
            {depth === 0 && (
              <span className="row-number">{topLevelIndex}</span>
            )}
            {hasChildren && (
              <span 
                className="hierarchy-toggle"
                onClick={(e) => { e.stopPropagation(); onToggleRowExpanded(dataRow.id); }}
              >
                <Icon name={isExpanded ? 'chevron-down' : 'chevron-right'} size={14} />
              </span>
            )}
            <Checkbox
              checked={selectedRows.has(dataRow.id)}
              onChange={() => handleToggleRowSelect(dataRow.id)}
              className="row-checkbox"
            />
          </div>
        );
      },
    };

    // 閺佺増宓侀崚妤嬬礄鏉╁洦鎶ら幒澶愭閽樺繒娈戦崚妤嬬礆
    const visibleColumns = columns.filter(col => !hiddenColumns.has(col.id));
    const dataColumns: ColumnDef<FlattenedRow>[] = visibleColumns.map((col, colIndex) => ({
      id: col.id,
      accessorFn: (flatRow: FlattenedRow) => flatRow.row.cells[col.id],
      size: col.width || 150,
      minSize: 80,
      header: () => (
        <div 
          className="column-header"
          onClick={(e) => handleColumnHeaderClick(col.id, e)}
        >
          <span className="column-type-icon">
            <Icon name={getColumnTypeIcon(col.type)} size={14} />
          </span>
          <span className="column-name">{col.name}</span>
          <span 
            className="column-menu-icon"
            onClick={(e) => handleColumnMenuClick(col.id, e)}
          >
            <Icon name="chevron-down" size={12} />
          </span>
        </div>
      ),
      cell: ({ row }) => {
        const flatRow = row.original;
        const { row: dataRow, depth, hasChildren } = flatRow;
        // 娴ｈ法鏁?ref 閼惧嘲褰囬張鈧弬鎵畱 editingCell閿涘矂浼╅崗?useMemo 娓氭繆绂嗙€佃壈鍤ч柌宥嗚閺?
        const currentEditingCell = editingCellRef.current;
        const isEditing = currentEditingCell?.rowId === dataRow.id && currentEditingCell?.colId === col.id;
        const childCount = colIndex === 0 && hasChildren 
          ? HierarchyTableManager.getDirectChildren(rows, dataRow.id).length 
          : 0;

        // 缁楊兛绔撮崚妤冨濞堝﹤顦╅悶?
        if (colIndex === 0) {
          if (depth > 0) {
            // 鐎涙劘顔囪ぐ鏇氬▏閻⑩暚adding-left缂傗晞绻橀敍鍫モ偓姘崇箖 wrapper 閻?padding閿?
            return (
              <div className="cell-hierarchy-wrapper child-row-indent">
                <div className="cell-content-wrapper">
                  {renderCellContent(dataRow, col, isEditing)}
                </div>
              </div>
            );
          } else if (hasChildren) {
            // 閺堝鐡欑拋鏉跨秿閺冭埖妯夌粈鐑樺潑閸旂姴鐡欑拋鏉跨秿閹稿鎸抽崪宀冾吀閺?
            return (
              <div className="cell-with-children">
                <div className="cell-content-wrapper">
                  {renderCellContent(dataRow, col, isEditing)}
                </div>
                <span 
                  className="add-child-btn"
                  onClick={(e) => { e.stopPropagation(); onAddChildRow(dataRow.id); }}
                  title={'\u65b0\u589e\u5b50\u884c'}
                >
                  <Icon name="plus" size={12} />
                </span>
                <span className="child-count-badge">{childCount}</span>
              </div>
            );
          }
          // 閺咁噣鈧俺顢戦敍鍫熸￥鐎涙劘顔囪ぐ鏇礆閻╁瓨甯村〒鍙夌厠
        }

        return renderCellContent(dataRow, col, isEditing);
      },
    }));

    // 濞ｈ濮為崚妤佸瘻闁筋喖鍨?
    const addColumnCol: ColumnDef<FlattenedRow> = {
      id: 'add-column',
      size: 40,
      minSize: 40,
      maxSize: 40,
      header: () => (
        <div className="add-column-cell">
          <span 
            className={`add-column-btn ${isGenerating ? 'disabled' : ''}`}
            onClick={isGenerating ? undefined : onAddColumn}
            title={'\u65b0\u589e\u5217'}
          >
            <Icon name="plus" size={14} />
          </span>
        </div>
      ),
      cell: () => <div className="add-column-cell" />,
    };

    return [selectorColumn, ...dataColumns, addColumnCol];
  }, [
    columns, rows, flattenedRows, selectedRows, selectedColumn, hiddenColumns, isGenerating,
    handleToggleSelectAll, handleToggleRowSelect, handleRowDragStart,
    handleColumnHeaderClick, handleColumnMenuClick, onToggleRowExpanded, onAddChildRow, onAddColumn, renderCellContent
  ]);


  // 閸掓稑缂?TanStack Table 鐎圭偘绶?
  const table = useReactTable({
    data: flattenedRows,
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    columnResizeMode: 'onChange',
    enableColumnResizing: true,
  });

  // 閼惧嘲褰囩悰銊︾壐缁鎮?
  const getTableClassName = () => {
    const classes = ['design-table'];
    if (needStickyColumn) classes.push('sticky-enabled');
    if (isDraggingRow) classes.push('row-reordering');
    // 閸欘亝婀侀崗銊┾偓澶嬫閹靛秵鍧婇崝?has-selected-rows 缁?
    if (selectedRows.size === rows.length && rows.length > 0) classes.push('has-selected-rows');
    // 濞ｈ濮炵悰宀勭彯缁鎮?
    classes.push(`row-height-${rowHeight}`);
    return classes.join(' ');
  };

  // 閼惧嘲褰囩悰宀€琚崥?
  const getRowClassName = (flatRow: FlattenedRow, flatIndex: number) => {
    const classes: string[] = [];
    if (selectedRows.has(flatRow.row.id)) classes.push('row-selected');
    if (flatRow.depth > 0) classes.push('child-row');
    if (isDraggingRow && dragRowIndex === flatIndex) classes.push('row-dragging');
    // 缂傛牞绶悩鑸碘偓浣烘畱鐞?
    if (editingCell?.rowId === flatRow.row.id) classes.push('row-editing');
    // 闁鑵戦崡鏇炲帗閺嶅吋澧嶉崷銊ф畱鐞?
    if (selectedCell?.rowId === flatRow.row.id) classes.push('row-cell-selected');
    // 閸欐娊鏁懣婊冨礋閹垫挸绱戦惃鍕攽
    if (contextMenuRowId === flatRow.row.id) classes.push('row-context-menu');
    // 閺佺顢戞繅顐ュ閻ㄥ嫯顢戦敍鍫濆涧閺堝顢戦懗灞炬珯閼瑰弶妞傞幍宥囶洣閻劍鍋撻崑婊勬櫏閺嬫粣绱?
    if (flatRow.row.backgroundColor) {
      classes.push('row-filled');
    }
    // 閺堝宕熼崗鍐╃壐婵夘偉澹婇惃鍕攽閿涘牅绗夌粋浣烘暏閹剙浠犻弫鍫熺亯閿?
    if (flatRow.row.cellColors && Object.keys(flatRow.row.cellColors).length > 0) {
      classes.push('row-has-cell-colors');
    }
    return classes.join(' ');
  };

  // 閼惧嘲褰囩悰灞剧壉瀵?
  const getRowStyle = (flatRow: FlattenedRow): React.CSSProperties => {
    const style: React.CSSProperties = {};
    // 婵″倹鐏夌悰灞炬箒閼冲本娅欓懝璇х礉鐠佸墽鐤嗛懗灞炬珯閼?
    if (flatRow.row.backgroundColor) {
      style.backgroundColor = flatRow.row.backgroundColor;
    }
    return style;
  };

  // 閼惧嘲褰囬崡鏇炲帗閺嶅吋鐗卞?
  // 閸ュ搫鐣鹃崚妤嬬礄selector 閸滃瞼顑囨稉鈧弫鐗堝祦閸掓绱氶棁鈧憰浣稿礋閻欘剝顔曠純顔垮剹閺咁垵澹婇敍灞芥儊閸掓瑦绮撮崝銊︽娴兼俺顫﹂柆顔藉皡
  // 閺€顖涘瘮閿涙俺顢戦懗灞炬珯閼瑰眰鈧礁宕熼崗鍐╃壐妫版粏澹婇妴浣稿灙閼冲本娅欓懝?
  const getCellStyle = (
    flatRow: FlattenedRow,
    cellWidth: number,
    isSelector: boolean,
    isFirstDataColumn: boolean,
    column?: TableColumn
  ): React.CSSProperties => {
    const style: Record<string, string> = {
      width: `${cellWidth}px`,
      minWidth: `${cellWidth}px`,
      maxWidth: `${cellWidth}px`,
    };
    
    // 绾喖鐣鹃崡鏇炲帗閺嶈偐娈戦懗灞炬珯閼硅绱欐导妯哄帥缁狙嶇窗閸楁洖鍘撻弽濂割杹閼?> 鐞涘矁鍎楅弲顖濆 > 閸掓鍎楅弲顖濆閿?
    let cellBgColor: string | undefined;
    
    // 1. 閸楁洖鍘撻弽濂割杹閼硅绱欓張鈧妯圭喘閸忓牏楠囬敍?
    if (column && flatRow.row.cellColors && flatRow.row.cellColors[column.name]) {
      cellBgColor = flatRow.row.cellColors[column.name];
    }
    // 2. 鐞涘矁鍎楅弲顖濆
    else if (flatRow.row.backgroundColor) {
      cellBgColor = flatRow.row.backgroundColor;
    }
    // 3. 閸掓鍎楅弲顖濆閿涘牊娓舵担搴濈喘閸忓牏楠囬敍?
    else if (column?.backgroundColor) {
      cellBgColor = column.backgroundColor;
    }
    
    // 鐠佸墽鐤嗛懗灞炬珯閼?
    if (cellBgColor) {
      // 閹碘偓閺堝鍨柈鎴掑▏閻?CSS 閸欐﹢鍣洪敍宀勨偓姘崇箖娴碱亜鍘撶槐鐘虫▔缁€鍝勶綖閼?
      // 鏉╂瑦鐗遍崣顖欎簰绾喕绻氶幍鈧張澶婂灙閻ㄥ嫰顤侀懝韫閼?
      style['--cell-fill-color'] = cellBgColor;
    }
    
    return style as React.CSSProperties;
  };

  // 閸掋倖鏌囬弰顖氭儊閺勫墽銇氶幏鏍ㄥ閹稿洨銇氱痪?
  const shouldShowDropIndicator = (flatIndex: number): 'top' | 'bottom' | null => {
    if (!isDraggingRow || dropTargetIndex === -1 || dragRowIndex === -1) return null;
    if (flatIndex === dropTargetIndex && flatIndex !== dragRowIndex) {
      return dropIndicatorPosition;
    }
    return null;
  };

  // 閼惧嘲褰囬崡鏇炲帗閺嶈偐琚崥?
  const getCellClassName = (colId: string, rowId: string, colIndex: number) => {
    const classes: string[] = [];
    if (colId === 'selector') {
      classes.push('row-selector-cell');
    } else if (colId === 'add-column') {
      classes.push('add-column-cell');
    } else {
      // 缁楊兛绔撮弫鐗堝祦閸掓妲哥槐銏犵穿1閿涘澃elector=0, first-data=1閿?
      if (colIndex === 1) classes.push('first-data-column');
      const isEditing = editingCell?.rowId === rowId && editingCell?.colId === colId;
      // 缂傛牞绶悩鑸碘偓浣瑰潑閸旂姷琚崥?
      if (isEditing) {
        classes.push('editing-cell');
      }
      // 闁鑵戦悩鑸碘偓渚婄礄缂傛牞绶悩鑸碘偓浣风瑓娑撳秵妯夌粈娲偓澶夎厬鏉堣顢嬮敍?
      if (selectedCell?.rowId === rowId && selectedCell?.colId === colId && !isEditing) {
        classes.push('selected-cell');
      }
      // 闁鑵戦崚妤冨Ц閹?
      if (selectedColumn === colId) {
        classes.push('column-selected-cell');
      }
      // 闁剧偓甯撮崚妤佸潑閸?url-cell 缁鎮?
      const column = columns.find(c => c.id === colId);
      if (column?.type === 'url') {
        classes.push('url-cell');
      }
    }
    return classes.join(' ');
  };

  return (
    <div className="table-wrapper" ref={tableWrapperRef}>
      <table className={getTableClassName()} ref={tableRef}>
        <thead>
          {table.getHeaderGroups().map(headerGroup => (
            <tr key={headerGroup.id} className="header-row">
              {headerGroup.headers.map((header, headerIndex) => {
                const isSelector = header.id === 'selector';
                const isAddColumn = header.id === 'add-column';
                const column = columns.find(c => c.id === header.id);
                // 娴ｈ法鏁olumns娑擃厾娈戠€硅棄瀹抽敍宀冣偓灞肩瑝閺勭柖anStack Table閻ㄥ埀etSize()
                const headerWidth = isSelector ? 56 : isAddColumn ? 40 : (column?.width || 150);
                // 缁楊兛绔撮弫鐗堝祦閸掓妲哥槐銏犵穿1閿涘澃elector=0, first-data=1閿?
                const isFirstDataColumn = headerIndex === 1;
                // 閺勵垰鎯侀柅澶夎厬鐠囥儱鍨?
                const isColumnSelected = selectedColumn === header.id;
                
                return (
                  <th
                    key={header.id}
                    className={`${isSelector ? 'row-selector-cell' : ''} ${isAddColumn ? 'add-column-cell' : ''} ${isFirstDataColumn ? 'first-data-column' : ''} ${isColumnSelected ? 'column-selected' : ''}`}
                    style={{ width: `${headerWidth}px`, minWidth: `${headerWidth}px`, maxWidth: `${headerWidth}px` }}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {column && (
                      <div
                        className={`column-resize-handle ${resizingColumn === column.id ? 'resizing' : ''}`}
                        onMouseDown={(e) => handleResizeStart(column.id, e)}
                      />
                    )}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row, rowIndex) => {
            const flatRow = row.original;
            const dropIndicator = shouldShowDropIndicator(rowIndex);
            return (
              <tr
                key={row.id}
                className={`${getRowClassName(flatRow, rowIndex)} ${dropIndicator ? 'drop-target-' + dropIndicator : ''}`}
                style={getRowStyle(flatRow)}
                onMouseDown={(e) => handleRowDragSelectStart(rowIndex, e)}
              >
                {row.getVisibleCells().map((cell, cellIndex) => {
                  const colId = cell.column.id;
                  const isSelector = colId === 'selector';
                  const isAddColumn = colId === 'add-column';
                  const column = columns.find(c => c.id === colId);
                  const canInteract = !isSelector && !isAddColumn && column;
                  // 娴ｈ法鏁olumns娑擃厾娈戠€硅棄瀹抽敍宀冣偓灞肩瑝閺勭柖anStack Table閻ㄥ埀etSize()
                  const cellWidth = isSelector ? 56 : isAddColumn ? 40 : (column?.width || 150);
                  // 缁楊兛绔撮弫鐗堝祦閸掓妲哥槐銏犵穿1閿涘澃elector=0, first-data=1閿?
                  const isFirstDataColumn = cellIndex === 1;

                  return (
                    <td
                      key={cell.id}
                      className={getCellClassName(colId, flatRow.row.id, cellIndex)}
                      style={getCellStyle(flatRow, cellWidth, isSelector, isFirstDataColumn, column)}
                      data-row-id={flatRow.row.id}
                      data-col-id={colId}
                      onMouseDown={canInteract ? (e) => {
                        // 婵″倹鐏夐悙鐟板毊閻ㄥ嫭妲搁柧鐐复閸忓啰绀岄敍灞肩瑝婢跺嫮鎮婇幏鏍ㄥ闁瀚?
                        const target = e.target as HTMLElement;
                        if (target.classList.contains('cell-url-link') || target.classList.contains('cell-url-link-input')) {
                          return;
                        }
                        e.stopPropagation(); // 闂冪粯顒涢崘鎺撳満閸?tr 閻ㄥ嫯顢戦柅澶嬪
                        handleCellDragSelectStart(flatRow.row.id, colId, e);
                      } : undefined}
                      onClick={(e) => {
                        if (canInteract) {
                          // 濡偓濞村寮婚崙浼欑窗婵″倹鐏夐崷?300ms 閸愬懓绻涚紒顓犲仯閸戣鎮撴稉鈧稉顏勫礋閸忓啯鐗?
                          const now = Date.now();
                          const lastClick = (e.currentTarget as HTMLElement).dataset.lastClick;
                          const lastClickTime = lastClick ? parseInt(lastClick, 10) : 0;
                          (e.currentTarget as HTMLElement).dataset.lastClick = String(now);
                          
                          const isDoubleClick = now - lastClickTime < 300;
                          
                          if (isDoubleClick) {
                            // 閸欏苯鍤?- 鏉╂稑鍙嗙紓鏍帆閻樿埖鈧?
                            handleCellDoubleClick(flatRow.row.id, colId, e);
                          } else {
                            // 閸楁洖鍤?- 闁鑵戦崡鏇炲帗閺?
                            handleCellClick(flatRow.row.id, colId, e);
                          }
                        }
                      }}
                      onContextMenu={canInteract ? (e) => handleCellRightClick(flatRow.row.id, colId, e) : undefined}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  );
                })}
              </tr>
            );
          })}
          {/* 濞ｈ濮炵悰?*/}
          <tr className="add-row-tr">
            <td className="row-selector-cell">
              <span 
                className={`add-row-btn ${isGenerating ? 'disabled' : ''}`}
                onClick={isGenerating ? undefined : onAddRow}
                title={'\u65b0\u589e\u884c'}
              >
                <Icon name="plus" size={14} />
              </span>
            </td>
            {columns.map((col, colIndex) => (
              <td 
                key={col.id} 
                className={`add-row-cell ${colIndex === 0 ? 'first-data-column' : ''}`}
                style={{ width: col.width || 150 }}
              />
            ))}
            <td className="add-row-placeholder-cell" />
          </tr>
        </tbody>
      </table>
      {/* 闁鑵戦崠鍝勭厵鐟曞棛娲婄仦?*/}
      {selectionOverlay && (
        <div 
          className="cell-selection-overlay"
          style={{
            top: selectionOverlay.top,
            left: selectionOverlay.left,
            width: selectionOverlay.width,
            height: selectionOverlay.height,
          }}
        />
      )}
    </div>
  );
};

