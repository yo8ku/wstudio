/**
 * Select 缁勪欢 - 鍩轰簬 Portal 鐨勪笅鎷夐€夋嫨鍣?
 * 鍔熻兘锛氫娇鐢?Portal 灏嗕笅鎷夎彍鍗曟覆鏌撳埌 body锛岄伩鍏嶅眰绾ч伄鎸￠棶棰?
 * 鎻忚堪锛氱敤浜庢浛浠?DropdownMenu锛岃В鍐宠竟妗嗛伄鎸′笅鎷夎彍鍗曠殑闂
 */

import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../Icons/Icon';
import { CustomScrollbar, type CustomScrollbarRef } from '../CustomScrollbar/CustomScrollbar';
import './Select.scss';

export interface SelectItem {
  value: string;
  label: string | React.ReactNode;
  icon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  disabled?: boolean;
  /** 鏁版嵁绫诲瀷鏍囪瘑锛岀敤浜庡尯鍒嗘枃浠舵垨鏂囦欢澶圭瓑 */
  dataType?: string;
  /** 娣卞害灞傜骇锛岀敤浜庢枃浠舵爲缂╄繘锛堜粠0寮€濮嬶級 */
  depth?: number;
  /** 灞曞紑/鎶樺彔鏃朵娇鐢ㄧ殑鍊硷紙鐢ㄤ簬琛ㄥ崟绛夊彲灞曞紑椤癸紝鐐瑰嚮鍥炬爣鏃惰Е鍙戯級 */
  expandValue?: string;
}

export interface SelectGroup {
  groupName: string;
  items: SelectItem[];
  /** 鏄惁鍦ㄥ垎缁勪笂鏂规樉绀哄垎鍓茬嚎 */
  showDivider?: boolean;
}

export interface SelectProps {
  /** 褰撳墠閫変腑鐨勫€?*/
  value: string;
  /** 褰撳墠楂樹寒鐨勫€硷紙涓嶄細浣滀负鐪熷疄閫変腑鍊硷級 */
  highlightedValue?: string;
  /** 鍊煎彉鍖栧洖璋?*/
  onChange: (value: string) => void;
  /** 鑿滃崟椤瑰垪琛紙鏀寔鍒嗙粍鎴栨墎骞冲垪琛級 */
  items?: SelectItem[];
  /** 鍒嗙粍鍒楄〃 */
  groups?: SelectGroup[];
  /** 鍗犱綅绗?*/
  placeholder?: string;
  /** 鏄惁绂佺敤 */
  disabled?: boolean;
  /** 鑷畾涔夌被鍚?*/
  className?: string;
  /** 鏄惁鏄剧ず鎼滅储妗?*/
  showSearch?: boolean;
  /** 鑿滃崟寮瑰嚭浣嶇疆 */
  placement?: 'top' | 'bottom';
  /** 鑿滃崟鎵撳紑/鍏抽棴鐘舵€佸彉鍖栧洖璋?*/
  onOpenChange?: (isOpen: boolean) => void;
  /** 鍙楁帶妯″紡锛氳彍鍗曟槸鍚︽墦寮€ */
  open?: boolean;
  /** 澶撮儴宸︿晶鍥炬爣锛堢敤浜庢樉绀哄悗閫€绠ご绛夛級 */
  headerLeftIcon?: React.ReactNode;
  /** 澶撮儴宸︿晶鍥炬爣鐐瑰嚮鍥炶皟 */
  onHeaderLeftClick?: () => void;
  /** 鑿滃崟椤圭偣鍑诲洖璋冿紝杩斿洖 false 鏃朵笉鍏抽棴鑿滃崟 */
  onItemClick?: (value: string) => boolean | void;
  /** 鑿滃崟瀵归綈鏂瑰紡锛歭eft-宸﹀榻愬埌瑙﹀彂鍣ㄥ乏杈圭紭锛宺ight-鍙冲榻愬埌瑙﹀彂鍣ㄥ彸杈圭紭锛宲arent-宸﹀榻愬埌鐖跺鍣ㄥ乏杈圭紭 */
  align?: 'left' | 'right' | 'parent';
  /** 鑿滃崟涓庤Е鍙戝櫒涔嬮棿鐨勯棿璺濓紙鍍忕礌锛夛紝榛樿涓? */
  menuGap?: number;
  /** 鍥哄畾楂樺害锛堝儚绱狅級锛岀敤浜庝繚鎸佽彍鍗曢珮搴︿竴鑷?*/
  fixedHeight?: number;
  /** 鑿滃崟楂樺害鍙樺寲鍥炶皟锛岀敤浜庤褰曚竴绾ц彍鍗曢珮搴?*/
  onHeightChange?: (height: number) => void;
  /** 鎵撳紑鍚庨亣鍒板閮ㄦ粴鍔ㄦ椂鏄惁鍏抽棴鑿滃崟 */
  closeOnScroll?: boolean;
  onDropdownKeyDown?: React.KeyboardEventHandler<HTMLElement>;
  onKeyboardNavigatingChange?: (isKeyboardNavigating: boolean) => void;
  useCustomScrollbar?: boolean;
}

/**
 * Select 缁勪欢
 */
export const Select: React.FC<SelectProps> = ({
  value,
  highlightedValue = '',
  onChange,
  items = [],
  groups = [],
  placeholder = '璇烽€夋嫨',
  disabled = false,
  className = '',
  showSearch = false,
  placement = 'bottom',
  onOpenChange,
  open,
  headerLeftIcon,
  onHeaderLeftClick,
  onItemClick,
  align = 'left',
  menuGap = 4,
  fixedHeight,
  onHeightChange,
  closeOnScroll = false,
  onDropdownKeyDown,
  onKeyboardNavigatingChange,
  useCustomScrollbar = false,
}) => {
  // 濡傛灉鎻愪緵浜?open 灞炴€э紝浣跨敤鍙楁帶妯″紡锛涘惁鍒欎娇鐢ㄥ唴閮ㄧ姸鎬?
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isOpen = open !== undefined ? open : internalIsOpen;
  const setIsOpen = (newIsOpen: boolean) => {
    if (open === undefined) {
      setInternalIsOpen(newIsOpen);
    }
    onOpenChange?.(newIsOpen);
  };
  const [searchQuery, setSearchQuery] = useState('');
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });
  const [actualPlacement, setActualPlacement] = useState<'top' | 'bottom'>('bottom');
  const [isPositionReady, setIsPositionReady] = useState(false); // 浣嶇疆鏄惁宸茶绠楀畬鎴?
  const [isKeyboardNavigating, setIsKeyboardNavigating] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const menuListRef = useRef<HTMLDivElement>(null);
  const customScrollbarRef = useRef<CustomScrollbarRef>(null);
  const selectedItemRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const lastRectRef = useRef<{ top: number; left: number; width: number; height: number } | null>(null);

  const getMenuListElement = useCallback((): HTMLDivElement | null => (
    useCustomScrollbar
      ? (customScrollbarRef.current?.getContentElement() ?? null)
      : menuListRef.current
  ), [useCustomScrollbar]);

  // 璁＄畻涓嬫媺鑿滃崟浣嶇疆
  const updatePosition = useCallback((providedRect?: DOMRect) => {
    if (!containerRef.current && !providedRect) {
      return;
    }

    const rect = providedRect ?? containerRef.current!.getBoundingClientRect();

    // 璁＄畻涓嬫媺鑿滃崟鐨勯浼伴珮搴﹀拰瀹藉害
    // 濡傛灉鑿滃崟宸茬粡娓叉煋锛屼娇鐢ㄥ疄闄呭昂瀵革紱鍚﹀垯浣跨敤棰勪及鍊?
    let menuHeight = 300; // 榛樿棰勪及楂樺害
    let menuWidth = Math.max(rect.width, 200); // 榛樿瀹藉害鑷冲皯200px
    if (contentRef.current) {
      const actualHeight = contentRef.current.offsetHeight;
      const actualWidth = contentRef.current.offsetWidth;
      if (actualHeight > 0) {
        menuHeight = actualHeight;
      }
      if (actualWidth > 0) {
        menuWidth = actualWidth;
      }
    } else {
      const menuListElement = getMenuListElement();

      if (menuListElement) {
        // 濡傛灉鑿滃崟鍒楄〃宸叉覆鏌撲絾瀹瑰櫒鏈覆鏌擄紝浣跨敤鍒楄〃楂樺害鍔犱笂鎼滅储妗嗛珮搴︼紙濡傛灉鏈夛級
        const listHeight = menuListElement.scrollHeight;
        const searchHeight = showSearch ? 40 : 0; // 鎼滅储妗嗛珮搴︾害 40px
        menuHeight = Math.min(listHeight + searchHeight, 500); // 鏈€澶ч珮搴﹂檺鍒朵负 500px
      }
    }

    // 璁＄畻鍙敤绌洪棿锛堝瀭鐩存柟鍚戯級
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const edgeSpacing = 4; // 杈圭紭闂磋窛锛堥槻姝㈣彍鍗曡创杈癸級

    // 鍒ゆ柇搴旇鍚戜笂杩樻槸鍚戜笅鏄剧ず
    // 濡傛灉搴曢儴绌洪棿涓嶅涓斾笂鏂圭┖闂磋冻澶燂紝鍒欏悜涓婃樉绀?
    const shouldShowTop = spaceBelow < menuHeight + menuGap && spaceAbove > menuHeight + menuGap;

    // 濡傛灉 placement 鏄?'top'锛屾垨鑰呭簲璇ュ悜涓婃樉绀猴紝鍒欏悜涓婂脊鍑?
    const calculatedPlacement = placement === 'top' || shouldShowTop ? 'top' : 'bottom';
    
    // 淇濆瓨瀹為檯鏂瑰悜
    setActualPlacement(calculatedPlacement);

    // 璁＄畻姘村钩浣嶇疆
    let leftPosition: number;
    
    if (align === 'parent' && containerRef.current) {
      // 鏅鸿兘瀵归綈锛氫紭鍏堝乏瀵归綈锛屽鏋滃彸渚х┖闂翠笉澶熷垯鍙冲榻?
      // 璁＄畻宸﹀榻愭椂鍙充晶鍓╀綑绌洪棿
      const spaceRightIfLeftAlign = window.innerWidth - rect.left;
      
      if (spaceRightIfLeftAlign >= menuWidth + edgeSpacing) {
        // 鍙充晶绌洪棿瓒冲锛屼娇鐢ㄥ乏瀵归綈锛堣彍鍗曞乏杈圭紭涓庤Е鍙戝櫒宸﹁竟缂樺榻愶級
        leftPosition = rect.left;
      } else {
        // 鍙充晶绌洪棿涓嶅锛屼娇鐢ㄥ彸瀵归綈锛堣彍鍗曞彸杈圭紭涓庤Е鍙戝櫒鍙宠竟缂樺榻愶級
        leftPosition = rect.right - menuWidth;
      }
    } else if (align === 'right') {
      // 鍙冲榻愶細鑿滃崟鍙宠竟缂樹笌瑙﹀彂鍣ㄥ彸杈圭紭瀵归綈
      leftPosition = rect.right - menuWidth;
    } else {
      // 宸﹀榻愶紙榛樿锛夛細鑿滃崟宸﹁竟缂樹笌瑙﹀彂鍣ㄥ乏杈圭紭瀵归綈
      leftPosition = rect.left;
    }
    
    // 杈圭晫妫€鏌ワ細闃叉鑿滃崟瓒呭嚭瑙嗙獥
    // 妫€鏌ュ乏杈圭晫
    if (leftPosition < edgeSpacing) {
      leftPosition = edgeSpacing;
    }
    // 妫€鏌ュ彸杈圭晫
    const spaceRight = window.innerWidth - leftPosition;
    if (spaceRight < menuWidth + edgeSpacing) {
      leftPosition = Math.max(edgeSpacing, window.innerWidth - menuWidth - edgeSpacing);
    }

    setPosition({
      top: calculatedPlacement === 'top' 
        ? rect.top - menuHeight - menuGap  // fixed 瀹氫綅锛氱洿鎺ヤ娇鐢ㄨ鍙ｅ潗鏍?
        : rect.bottom + menuGap,
      left: leftPosition,
      width: rect.width,
    });
    
    // 鏍囪浣嶇疆宸茶绠楀畬鎴?
    setIsPositionReady(true);
  }, [placement, showSearch, align, menuGap, getMenuListElement]);

  // 鎵撳紑鑿滃崟鏃舵洿鏂颁綅缃?
  useLayoutEffect(() => {
    if (!isOpen) {
      setIsPositionReady(false);
      setIsKeyboardNavigating(false);
      lastRectRef.current = null;
      return;
    }

    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      lastRectRef.current = {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      };
    }

    setIsPositionReady(false);
    updatePosition(rect);
  }, [isOpen, updatePosition]);

  const handleDropdownKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (
      event.key === 'ArrowUp' ||
      event.key === 'ArrowDown' ||
      event.key === 'Enter' ||
      event.key === 'Escape'
    ) {
      setIsKeyboardNavigating(true);
    }

    onDropdownKeyDown?.(event);
  };

  const handleDropdownMouseMove = () => {
    if (isKeyboardNavigating) {
      setIsKeyboardNavigating(false);
    }
  };

  useEffect(() => {
    onKeyboardNavigatingChange?.(isKeyboardNavigating);
  }, [isKeyboardNavigating, onKeyboardNavigatingChange]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const timer = window.setTimeout(() => {
      updatePosition();
    }, 0);

    const rafTimer = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        updatePosition();
      });
    });

    const handleResize = () => updatePosition();
    const handleScroll = (event: Event) => {
      if (closeOnScroll) {
        const target = event.target;
        if (
          target instanceof Node &&
          (
            containerRef.current?.contains(target) ||
            contentRef.current?.contains(target)
          )
        ) {
          return;
        }

        setIsOpen(false);
        setSearchQuery('');
        return;
      }

      updatePosition();
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(rafTimer);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [closeOnScroll, isOpen, updatePosition]);

  // 褰撻€変腑鍊煎彉鍖栨椂锛屾彁鍓嶆洿鏂颁綅缃互閬垮厤浣嶇疆璺冲姩
  // 濡傛灉鑿滃崟鍏抽棴锛屾彁鍓嶈绠椾綅缃紝杩欐牱涓嬫鎵撳紑鏃朵綅缃氨鏄纭殑
  // 濡傛灉鑿滃崟鎵撳紑锛屼篃闇€瑕佹洿鏂颁綅缃互淇濇寔瀵归綈
  useEffect(() => {
    if (containerRef.current) {
      // 浣跨敤 requestAnimationFrame 纭繚 DOM 宸茬粡鏇存柊锛堟枃鏈唴瀹瑰凡鍙樺寲锛?
      requestAnimationFrame(() => {
        updatePosition();
      });
    }
  }, [highlightedValue, updatePosition, value]);

  // 褰撹彍鍗曞唴瀹癸紙groups 鎴?items锛夊彉鍖栨椂锛岄噸鏂拌绠椾綅缃?
  // 杩欏浜庝簩绾ц彍鍗曞垏鎹㈡椂淇濇寔姝ｇ‘鐨勪綅缃緢閲嶈
  useEffect(() => {
    if (isOpen && contentRef.current) {
      // 浣跨敤鍙岄噸 requestAnimationFrame 纭繚 DOM 瀹屽叏鏇存柊鍚庡啀璁＄畻浣嶇疆
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          updatePosition();
          // 鎶ュ憡鑿滃崟楂樺害锛堜粎鍦ㄦ病鏈夊浐瀹氶珮搴︽椂锛?
          if (!fixedHeight && contentRef.current && onHeightChange) {
            const height = contentRef.current.offsetHeight;
            if (height > 0) {
              onHeightChange(height);
            }
          }
        });
      });
    }
  }, [isOpen, groups, items, updatePosition, fixedHeight, onHeightChange]);

  // 杩借釜瑙﹀彂鍣ㄤ綅缃彉鍖栵紙渚嬪鍐呰仈瀹瑰櫒闅忕紪杈戝櫒绉诲姩锛?
  useEffect(() => {
    if (!isOpen) {
      lastRectRef.current = null;
      return;
    }

    let rafId: number;

    const trackPosition = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const lastRect = lastRectRef.current;
        if (
          !lastRect ||
          Math.abs(rect.top - lastRect.top) > 0.5 ||
          Math.abs(rect.left - lastRect.left) > 0.5 ||
          Math.abs(rect.width - lastRect.width) > 0.5
        ) {
          lastRectRef.current = {
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
          };
          updatePosition(rect);
        }
      }
      rafId = requestAnimationFrame(trackPosition);
    };

    trackPosition();

    return () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [isOpen, updatePosition]);

  // 鐐瑰嚮澶栭儴鍏抽棴鑿滃崟
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        containerRef.current && 
        !containerRef.current.contains(target) &&
        contentRef.current &&
        !contentRef.current.contains(target)
      ) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };

    if (isOpen) {
      // 浣跨敤 setTimeout 纭繚 Portal 鍐呭宸茬粡娓叉煋
      const timer = window.setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside, true);
      }, 0);
      return () => {
        window.clearTimeout(timer);
        document.removeEventListener('mousedown', handleClickOutside, true);
      };
    }
  }, [isOpen, onOpenChange]);

  // 澶卞幓鐒︾偣鏃跺叧闂彍鍗?
  useEffect(() => {
    if (!isOpen) return;

    const handleWindowBlur = () => {
      // 绐楀彛澶卞幓鐒︾偣鏃跺叧闂彍鍗?
      setIsOpen(false);
      setSearchQuery('');
      onOpenChange?.(false);
    };

    // 鐩戝惉绐楀彛澶卞幓鐒︾偣浜嬩欢
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [isOpen, onOpenChange]);

  // 鎵撳紑鑿滃崟鏃惰仛鐒︽悳绱㈡
  useEffect(() => {
    if (isOpen && showSearch && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen, showSearch]);

  // 鎵撳紑鑿滃崟鎴栧綋鍓嶉」鍙樺寲鏃舵粴鍔ㄥ埌閫変腑鐨勯」
  useEffect(() => {
    const menuListElement = getMenuListElement();

    if (isOpen && selectedItemRef.current && menuListElement) {
      setTimeout(() => {
        const currentMenuListElement = getMenuListElement();

        if (selectedItemRef.current && currentMenuListElement) {
          const menuList = currentMenuListElement;
          const selectedItem = selectedItemRef.current;
          
          const itemOffsetTop = selectedItem.offsetTop;
          const itemHeight = selectedItem.offsetHeight;
          const menuHeight = menuList.offsetHeight;
          const menuScrollTop = menuList.scrollTop;
          
          if (itemOffsetTop < menuScrollTop) {
            menuList.scrollTop = itemOffsetTop;
          } else if (itemOffsetTop + itemHeight > menuScrollTop + menuHeight) {
            menuList.scrollTop = itemOffsetTop + itemHeight - menuHeight + 5;
          }
        }
      }, 0);
    }
  }, [getMenuListElement, highlightedValue, isOpen, value]);

  // 鑾峰彇鏄剧ず鏂囨湰
  const getDisplayText = (): string => {
    if (!value) return placeholder;

    for (const group of groups) {
      const item = group.items.find(i => i.value === value);
      if (item) {
        if (typeof item.label === 'string') {
          return item.label;
        }
        // 濡傛灉鏄?React 鍏冪礌锛屽皾璇曟彁鍙栨枃鏈垨杩斿洖榛樿鍊?
        return '宸查€夋嫨';
      }
    }

    const item = items.find(i => i.value === value);
    if (item) {
      if (typeof item.label === 'string') {
        return item.label;
      }
      return '宸查€夋嫨';
    }
    return placeholder;
  };

  // 杩囨护鑿滃崟椤?
  const filterItems = (itemList: SelectItem[]): SelectItem[] => {
    if (!searchQuery) return itemList;
    return itemList.filter(item => {
      if (typeof item.label === 'string') {
        return item.label.toLowerCase().includes(searchQuery.toLowerCase());
      }
      // 濡傛灉鏄?React 鍏冪礌锛屾殏鏃朵笉杩囨护锛堝彲浠ユ牴鎹渶瑕佸疄鐜版枃鏈彁鍙栵級
      return true;
    });
  };

  // 澶勭悊鑿滃崟椤圭偣鍑?
  const handleItemClick = (itemValue: string, itemDisabled?: boolean) => {
    if (itemDisabled) return;
    onChange(itemValue);
    
    // 濡傛灉鎻愪緵浜?onItemClick 鍥炶皟锛屼娇鐢ㄥ畠鐨勮繑鍥炲€煎喅瀹氭槸鍚﹀叧闂彍鍗?
    // 濡傛灉杩斿洖 false锛屽垯涓嶅叧闂彍鍗曪紱鍚﹀垯鎴栨湭鎻愪緵鍥炶皟锛岄粯璁ゅ叧闂彍鍗?
    const shouldClose = onItemClick ? onItemClick(itemValue) !== false : true;
    
    if (shouldClose) {
      setIsOpen(false);
      setSearchQuery('');
      onOpenChange?.(false);
    } else {
      // 鍗充娇涓嶅叧闂彍鍗曪紝涔熸竻绌烘悳绱㈡锛屼互渚夸笅娆℃樉绀烘椂鏄共鍑€鐨?
      setSearchQuery('');
    }
  };

  // 鍒囨崲鑿滃崟鎵撳紑/鍏抽棴
  const toggleMenu = () => {
    if (!disabled) {
      const newIsOpen = !isOpen;
      setIsOpen(newIsOpen);
      onOpenChange?.(newIsOpen);
    }
  };

  // 娓叉煋鑿滃崟椤?
  const renderItem = (item: SelectItem) => {
    const isSelected = item.value === value;
    const isHighlighted = !isSelected && item.value === highlightedValue;
    const selectedStyle: React.CSSProperties | undefined = isSelected
      ? {
          backgroundColor: 'var(--ws-list-activeSelectionBackground, var(--ws-list-active-selection-background, var(--list-active-bg, var(--ws-list-hoverBackground, rgba(127, 127, 127, 0.22)))))',
          color: 'var(--ws-list-activeSelectionForeground, var(--ws-list-active-selection-foreground, var(--list-active-fg, var(--ws-foreground))))',
        }
      : undefined;
    
    // 澶勭悊鍥炬爣鐐瑰嚮锛堢敤浜庡睍寮€/鎶樺彔锛?
    const handleIconClick = (e: React.MouseEvent) => {
      if (item.expandValue) {
        e.stopPropagation();
        handleItemClick(item.expandValue, item.disabled);
      }
    };
    
    return (
      <div
        key={item.value}
        ref={isSelected || isHighlighted ? selectedItemRef : null}
        className={`select-item ${isSelected ? 'selected' : ''} ${isHighlighted ? 'keyboard-highlighted' : ''} ${item.disabled ? 'disabled' : ''}`}
        onClick={() => handleItemClick(item.value, item.disabled)}
        style={selectedStyle}
        aria-selected={isSelected || isHighlighted}
        data-selected={isSelected ? 'true' : 'false'}
        data-type={item.dataType}
        data-depth={item.depth !== undefined ? item.depth : undefined}
      >
        <span className="select-item-check">{isSelected && <Icon name="check" size={14} />}</span>
        {item.icon && (
          <span 
            className={`select-item-icon ${item.expandValue ? 'expandable' : ''}`}
            onClick={item.expandValue ? handleIconClick : undefined}
          >
            {item.icon}
          </span>
        )}
        <span className="select-item-label">{item.label}</span>
        {item.rightIcon && <span className="select-item-right-icon">{item.rightIcon}</span>}
      </div>
    );
  };

  // 娓叉煋鑿滃崟鍐呭
  const renderMenuContent = () => {
    if (groups.length > 0) {
      return groups.map((group, groupIndex) => {
        const filteredItems = filterItems(group.items);
        if (filteredItems.length === 0) return null;

        // 浣跨敤绱㈠紩鍜?groupName 缁勫悎浣滀负 key锛岀‘淇濆敮涓€鎬?
        const groupKey = group.groupName ? `${group.groupName}-${groupIndex}` : `group-${groupIndex}`;

        return (
          <div 
            key={groupKey} 
            className={`select-group ${group.showDivider ? 'show-divider' : ''}`}
          >
            {group.groupName && <div className="select-group-title">{group.groupName}</div>}
            {filteredItems.map(renderItem)}
          </div>
        );
      });
    } else {
      const filteredItems = filterItems(items);
      if (filteredItems.length === 0) {
        return <div className="select-empty">鏃犲尮閰嶉」</div>;
      }
      return filteredItems.map(renderItem);
    }
  };

  // 娓叉煋涓嬫媺鑿滃崟鍐呭锛堜娇鐢?Portal锛?
  const renderDropdownContent = () => {
    if (!isOpen) return null;

    return createPortal(
      <div
        ref={contentRef}
        className={`select-content ${actualPlacement === 'top' ? 'placement-top' : ''} ${isKeyboardNavigating ? 'keyboard-nav' : ''} ${className ? `${className}-content` : ''}`}
        onKeyDown={handleDropdownKeyDown}
        onMouseMove={handleDropdownMouseMove}
        style={{
          '--select-content-top': `${position.top}px`,
          '--select-content-left': `${position.left}px`,
          '--select-content-width': `${position.width}px`,
          opacity: isPositionReady ? 1 : 0,
          visibility: isPositionReady ? 'visible' : 'hidden',
          ...(fixedHeight ? { height: `${fixedHeight}px` } : {}),
        } as React.CSSProperties}
      >
        {headerLeftIcon && (
          <div className="select-header">
            <div 
              className="select-header-left"
              onClick={(e) => {
                e.stopPropagation();
                onHeaderLeftClick?.();
              }}
            >
              {headerLeftIcon}
            </div>
            {showSearch && (
              <div className="select-search">
                <Icon name="search" size={14} />
                <input
                  ref={searchInputRef}
                  type="text"
                  className="select-search-input"
                  placeholder={'\u641c\u7d22...'}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={handleDropdownKeyDown}
                />
              </div>
            )}
          </div>
        )}
        {!headerLeftIcon && showSearch && (
          <div className="select-search">
            <Icon name="search" size={14} />
            <input
              ref={searchInputRef}
              type="text"
              className="select-search-input"
              placeholder={'\u641c\u7d22...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={handleDropdownKeyDown}
            />
          </div>
        )}
        {useCustomScrollbar ? (
          <CustomScrollbar
            ref={customScrollbarRef}
            className="select-list-custom-scrollbar"
            scrollbarWidth={6}
          >
            {renderMenuContent()}
          </CustomScrollbar>
        ) : (
          <div ref={menuListRef} className="select-list">
            {renderMenuContent()}
          </div>
        )}
      </div>,
      document.body
    );
  };

  return (
    <>
      <div
        ref={containerRef}
        className={`select ${isOpen ? 'open' : ''} ${disabled ? 'disabled' : ''} ${className}`}
      >
        <div className="select-trigger" onClick={toggleMenu}>
          <span className="select-text">{getDisplayText()}</span>
          <Icon name="chevron-down" size={14} className="select-arrow" />
        </div>
      </div>
      {renderDropdownContent()}
    </>
  );
};


