/**
 * 线条风格服务
 * 功能：提供不同线条风格的渲染能力
 * 描述：支持朴素、艺术、漫画家三种线条风格
 */

import rough from 'roughjs';

// 线条风格类型
export type LineStyleType = 'plain' | 'artistic' | 'comic';

// 线条风格配置
export interface LineStyleConfig {
  id: LineStyleType;
  name: string;
  description: string;
}

// 预设线条风格
export const lineStyles: LineStyleConfig[] = [
  { id: 'plain', name: '朴素', description: '默认线条风格' },
  { id: 'artistic', name: '艺术', description: '精致细线条' },
  { id: 'comic', name: '漫画家', description: '手绘风格线条' },
];

// Rough.js 配置
interface RoughOptions {
  roughness: number;
  bowing: number;
  strokeWidth: number;
  stroke: string;
  fill?: string;
  fillStyle?: string;
}

/**
 * 获取线条风格的 Rough.js 配置
 */
export const getLineStyleOptions = (
  style: LineStyleType,
  strokeColor: string,
  strokeWidth: number,
  fillColor?: string
): RoughOptions => {
  const baseOptions: RoughOptions = {
    stroke: strokeColor,
    strokeWidth: strokeWidth,
    roughness: 0,
    bowing: 0,
  };

  if (fillColor && fillColor !== 'none' && fillColor !== 'transparent') {
    baseOptions.fill = fillColor;
    baseOptions.fillStyle = 'solid';
  }

  switch (style) {
    case 'plain':
      // 朴素：默认直线
      return {
        ...baseOptions,
        roughness: 0,
        bowing: 0,
      };
    case 'artistic':
      // 艺术：轻微手绘感，更精致
      return {
        ...baseOptions,
        roughness: 0.5,
        bowing: 0.5,
      };
    case 'comic':
      // 漫画家：明显手绘风格
      return {
        ...baseOptions,
        roughness: 1.5,
        bowing: 1,
      };
    default:
      return baseOptions;
  }
};

/**
 * 应用线条风格到形状
 */
export const applyLineStyleToShape = (
  svgElement: SVGSVGElement,
  shape: SVGGraphicsElement,
  style: LineStyleType,
  strokeColor: string,
  strokeWidth: number,
  fillColor?: string
): SVGGElement | null => {
  if (style === 'plain') {
    // 朴素风格：直接设置属性，不使用 rough.js
    shape.setAttribute('stroke', strokeColor);
    shape.setAttribute('stroke-width', String(strokeWidth));
    if (fillColor) {
      shape.setAttribute('fill', fillColor);
    }
    return null;
  }

  const rc = rough.svg(svgElement);
  const options = getLineStyleOptions(style, strokeColor, strokeWidth, fillColor);
  
  // 获取形状的边界框
  const bbox = shape.getBBox();
  const { x, y, width, height } = bbox;
  
  // 根据形状类型创建 rough 形状
  const tagName = shape.tagName.toLowerCase();
  let roughElement: SVGGElement | null = null;

  switch (tagName) {
    case 'rect': {
      const rx = parseFloat(shape.getAttribute('rx') || '0');
      if (rx > 0) {
        // 圆角矩形 - 使用路径
        roughElement = rc.path(
          `M ${x + rx} ${y} 
           L ${x + width - rx} ${y} 
           Q ${x + width} ${y} ${x + width} ${y + rx}
           L ${x + width} ${y + height - rx}
           Q ${x + width} ${y + height} ${x + width - rx} ${y + height}
           L ${x + rx} ${y + height}
           Q ${x} ${y + height} ${x} ${y + height - rx}
           L ${x} ${y + rx}
           Q ${x} ${y} ${x + rx} ${y}
           Z`,
          options
        );
      } else {
        roughElement = rc.rectangle(x, y, width, height, options);
      }
      break;
    }
    case 'ellipse': {
      const cx = parseFloat(shape.getAttribute('cx') || '0');
      const cy = parseFloat(shape.getAttribute('cy') || '0');
      const rx = parseFloat(shape.getAttribute('rx') || '0');
      const ry = parseFloat(shape.getAttribute('ry') || '0');
      roughElement = rc.ellipse(cx, cy, rx * 2, ry * 2, options);
      break;
    }
    case 'circle': {
      const cx = parseFloat(shape.getAttribute('cx') || '0');
      const cy = parseFloat(shape.getAttribute('cy') || '0');
      const r = parseFloat(shape.getAttribute('r') || '0');
      roughElement = rc.circle(cx, cy, r * 2, options);
      break;
    }
    case 'polygon': {
      const points = shape.getAttribute('points') || '';
      const pointsArray = points.split(/\s+/).map(p => {
        const [px, py] = p.split(',').map(Number);
        return [px, py] as [number, number];
      });
      if (pointsArray.length > 0) {
        roughElement = rc.polygon(pointsArray, options);
      }
      break;
    }
    default:
      // 其他形状暂不支持
      return null;
  }

  return roughElement;
};

/**
 * 替换形状为手绘风格
 */
export const replaceShapeWithRoughStyle = (
  svgElement: SVGSVGElement,
  shape: SVGGraphicsElement,
  style: LineStyleType,
  strokeColor: string,
  strokeWidth: number,
  fillColor?: string
): void => {
  if (style === 'plain') {
    // 朴素风格不需要替换
    return;
  }

  const roughElement = applyLineStyleToShape(
    svgElement,
    shape,
    style,
    strokeColor,
    strokeWidth,
    fillColor
  );

  if (roughElement && shape.parentElement) {
    // 隐藏原始形状
    shape.style.display = 'none';
    
    // 添加 rough 元素
    roughElement.setAttribute('class', 'rough-shape');
    roughElement.setAttribute('data-original-shape', shape.id || '');
    shape.parentElement.appendChild(roughElement);
  }
};

/**
 * 移除手绘风格，恢复原始形状
 */
export const removeRoughStyle = (
  nodeElement: SVGGElement,
  shape: SVGGraphicsElement
): void => {
  // 移除所有 rough 元素
  const roughElements = nodeElement.querySelectorAll('.rough-shape');
  roughElements.forEach(el => el.remove());
  
  // 恢复原始形状的透明度
  shape.style.opacity = '1';
};
