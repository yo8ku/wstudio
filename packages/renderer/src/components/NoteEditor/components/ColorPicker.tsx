/**
 * 自定义颜色选择器组件
 * 功能：提供可拖动选择的颜色面板，替代原生 input[type="color"]
 * 描述：支持色相选择、饱和度/亮度选择、透明度选择、手动输入、实时预览
 */

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './ColorPicker.scss';

interface ColorPickerProps {
  /** 初始颜色值 */
  initialColor?: string;
  /** 颜色变化时的回调（实时预览） */
  onColorChange?: (color: string) => void;
  /** 确认选择时的回调 */
  onColorConfirm?: (color: string) => void;
  /** 取消选择时的回调 */
  onCancel?: () => void;
  /** 触发元素的位置 */
  anchorRect?: DOMRect;
}

/**
 * HSV 转 RGB
 */
function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;

  let r = 0,
    g = 0,
    b = 0;

  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }

  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

/**
 * RGB 转 Hex
 */
function rgbToHex(r: number, g: number, b: number): string {
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

/**
 * RGBA 转带透明度的颜色字符串
 */
function rgbaToString(r: number, g: number, b: number, a: number): string {
  if (a === 1) {
    return rgbToHex(r, g, b);
  }
  return `rgba(${r}, ${g}, ${b}, ${a.toFixed(2)})`;
}

/**
 * 解析颜色字符串，返回 HSV 和 Alpha
 */
function parseColor(color: string): { hsv: [number, number, number]; alpha: number } | null {
  // 解析 hex 格式
  const hexMatch = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(color);
  if (hexMatch) {
    const r = parseInt(hexMatch[1], 16) / 255;
    const g = parseInt(hexMatch[2], 16) / 255;
    const b = parseInt(hexMatch[3], 16) / 255;
    return { hsv: rgbToHsv(r, g, b), alpha: 1 };
  }

  // 解析 3 位 hex 格式
  const hex3Match = /^#?([a-f\d])([a-f\d])([a-f\d])$/i.exec(color);
  if (hex3Match) {
    const r = parseInt(hex3Match[1] + hex3Match[1], 16) / 255;
    const g = parseInt(hex3Match[2] + hex3Match[2], 16) / 255;
    const b = parseInt(hex3Match[3] + hex3Match[3], 16) / 255;
    return { hsv: rgbToHsv(r, g, b), alpha: 1 };
  }

  // 解析 rgba 格式
  const rgbaMatch = /^rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)$/i.exec(
    color
  );
  if (rgbaMatch) {
    const r = parseInt(rgbaMatch[1], 10) / 255;
    const g = parseInt(rgbaMatch[2], 10) / 255;
    const b = parseInt(rgbaMatch[3], 10) / 255;
    const a = rgbaMatch[4] ? parseFloat(rgbaMatch[4]) : 1;
    return { hsv: rgbToHsv(r, g, b), alpha: Math.max(0, Math.min(1, a)) };
  }

  return null;
}

/**
 * RGB 转 HSV（输入范围 0-1）
 */
function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;

  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;

  if (max !== min) {
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
        break;
      case g:
        h = ((b - r) / d + 2) * 60;
        break;
      case b:
        h = ((r - g) / d + 4) * 60;
        break;
    }
  }

  return [h, s, v];
}

/**
 * Hex 转 HSV
 */
function hexToHsv(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return [0, 1, 1];

  const r = parseInt(result[1], 16) / 255;
  const g = parseInt(result[2], 16) / 255;
  const b = parseInt(result[3], 16) / 255;

  return rgbToHsv(r, g, b);
}

export const ColorPicker: React.FC<ColorPickerProps> = ({
  initialColor = '#ff0000',
  onColorChange,
  onColorConfirm,
  onCancel,
  anchorRect,
}) => {
  const [hsv, setHsv] = useState<[number, number, number]>(() => hexToHsv(initialColor));
  const [alpha, setAlpha] = useState(1);
  const [currentColor, setCurrentColor] = useState(initialColor);
  const [inputValue, setInputValue] = useState(initialColor);
  const saturationRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);
  const alphaRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingSaturation = useRef(false);
  const isDraggingHue = useRef(false);
  const isDraggingAlpha = useRef(false);

  // 状态栏高度
  const STATUS_BAR_HEIGHT = 28;

  // 计算位置
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isPositioned, setIsPositioned] = useState(false);

  // 初始位置
  useLayoutEffect(() => {
    if (anchorRect) {
      setPosition({ x: anchorRect.right + 10, y: anchorRect.top });
      setIsPositioned(false);
    }
  }, [anchorRect]);

  // 调整位置，避免被状态栏遮挡（在组件渲染后）
  useLayoutEffect(() => {
    if (containerRef.current && anchorRect) {
      const pickerRect = containerRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      const availableBottom = viewportHeight - STATUS_BAR_HEIGHT;

      let x = anchorRect.right + 10;
      let y = anchorRect.top;

      // 如果右边空间不足，显示在左边
      if (x + pickerRect.width > viewportWidth) {
        x = anchorRect.left - pickerRect.width - 10;
      }

      // 如果底部超出可用区域，向上调整
      if (y + pickerRect.height > availableBottom) {
        y = availableBottom - pickerRect.height - 10;
      }

      // 确保不超出顶部
      y = Math.max(10, y);
      x = Math.max(10, x);

      setPosition({ x, y });
      setIsPositioned(true);
    }
  }, [anchorRect]);

  // 更新颜色
  const updateColor = useCallback(
    (h: number, s: number, v: number, a: number) => {
      const [r, g, b] = hsvToRgb(h, s, v);
      const colorStr = rgbaToString(r, g, b, a);
      setCurrentColor(colorStr);
      setInputValue(colorStr);
      onColorChange?.(colorStr);
    },
    [onColorChange]
  );

  // 处理手动输入
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setInputValue(value);

      const parsed = parseColor(value);
      if (parsed) {
        setHsv(parsed.hsv);
        setAlpha(parsed.alpha);
        const [r, g, b] = hsvToRgb(parsed.hsv[0], parsed.hsv[1], parsed.hsv[2]);
        const colorStr = rgbaToString(r, g, b, parsed.alpha);
        setCurrentColor(colorStr);
        onColorChange?.(colorStr);
      }
    },
    [onColorChange]
  );

  // 输入框失焦时，如果输入无效则恢复当前颜色
  const handleInputBlur = useCallback(() => {
    const parsed = parseColor(inputValue);
    if (!parsed) {
      setInputValue(currentColor);
    }
  }, [inputValue, currentColor]);

  // 处理饱和度/亮度选择
  const handleSaturationMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      isDraggingSaturation.current = true;

      const updateSaturation = (clientX: number, clientY: number) => {
        if (!saturationRef.current) return;
        const rect = saturationRef.current.getBoundingClientRect();
        const s = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        const v = Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height));
        setHsv([hsv[0], s, v]);
        updateColor(hsv[0], s, v, alpha);
      };

      updateSaturation(e.clientX, e.clientY);

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (isDraggingSaturation.current) {
          updateSaturation(moveEvent.clientX, moveEvent.clientY);
        }
      };

      const handleMouseUp = () => {
        isDraggingSaturation.current = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [hsv, alpha, updateColor]
  );

  // 处理色相选择
  const handleHueMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      isDraggingHue.current = true;

      const updateHue = (clientX: number) => {
        if (!hueRef.current) return;
        const rect = hueRef.current.getBoundingClientRect();
        const h = Math.max(0, Math.min(360, ((clientX - rect.left) / rect.width) * 360));
        setHsv([h, hsv[1], hsv[2]]);
        updateColor(h, hsv[1], hsv[2], alpha);
      };

      updateHue(e.clientX);

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (isDraggingHue.current) {
          updateHue(moveEvent.clientX);
        }
      };

      const handleMouseUp = () => {
        isDraggingHue.current = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [hsv, alpha, updateColor]
  );

  // 处理透明度选择
  const handleAlphaMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      isDraggingAlpha.current = true;

      const updateAlpha = (clientX: number) => {
        if (!alphaRef.current) return;
        const rect = alphaRef.current.getBoundingClientRect();
        const a = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        setAlpha(a);
        updateColor(hsv[0], hsv[1], hsv[2], a);
      };

      updateAlpha(e.clientX);

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (isDraggingAlpha.current) {
          updateAlpha(moveEvent.clientX);
        }
      };

      const handleMouseUp = () => {
        isDraggingAlpha.current = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [hsv, updateColor]
  );

  // 确认选择
  const handleConfirm = useCallback(() => {
    onColorConfirm?.(currentColor);
  }, [currentColor, onColorConfirm]);

  // 取消选择 - 恢复初始颜色
  const handleCancel = useCallback(() => {
    // 通知父组件恢复初始颜色
    onColorChange?.(initialColor);
    onCancel?.();
  }, [initialColor, onColorChange, onCancel]);

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        handleCancel();
      }
    };

    setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [handleCancel]);

  const [r, g, b] = hsvToRgb(hsv[0], 1, 1);
  const hueColor = rgbToHex(r, g, b);
  const [currentR, currentG, currentB] = hsvToRgb(hsv[0], hsv[1], hsv[2]);
  const solidColor = rgbToHex(currentR, currentG, currentB);

  const content = (
    <div
      ref={containerRef}
      className="custom-color-picker"
      style={{
        left: position.x,
        top: position.y,
        visibility: isPositioned ? 'visible' : 'hidden',
        pointerEvents: isPositioned ? 'auto' : 'none',
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* 饱和度/亮度选择区域 */}
      <div
        ref={saturationRef}
        className="color-picker-saturation"
        style={{ backgroundColor: hueColor }}
        onMouseDown={handleSaturationMouseDown}
      >
        <div className="saturation-white" />
        <div className="saturation-black" />
        <div
          className="saturation-cursor"
          style={{
            left: `${hsv[1] * 100}%`,
            top: `${(1 - hsv[2]) * 100}%`,
          }}
        />
      </div>

      {/* 色相选择条 */}
      <div ref={hueRef} className="color-picker-hue" onMouseDown={handleHueMouseDown}>
        <div
          className="hue-cursor"
          style={{
            left: `${(hsv[0] / 360) * 100}%`,
          }}
        />
      </div>

      {/* 透明度选择条 */}
      <div
        ref={alphaRef}
        className="color-picker-alpha"
        onMouseDown={handleAlphaMouseDown}
      >
        <div
          className="alpha-gradient"
          style={{
            background: `linear-gradient(to right, transparent, ${solidColor})`,
          }}
        />
        <div
          className="alpha-cursor"
          style={{
            left: `${alpha * 100}%`,
          }}
        />
      </div>

      {/* 预览和操作 */}
      <div className="color-picker-footer">
        <div className="color-preview-wrapper">
          <div className="color-preview" style={{ backgroundColor: currentColor }} />
        </div>
        <input
          type="text"
          className="color-input"
          value={inputValue}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          spellCheck={false}
        />
        <div className="color-picker-actions">
          <span className="color-picker-btn cancel" onClick={handleCancel}>
            取消
          </span>
          <span className="color-picker-btn confirm" onClick={handleConfirm}>
            确定
          </span>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
};
