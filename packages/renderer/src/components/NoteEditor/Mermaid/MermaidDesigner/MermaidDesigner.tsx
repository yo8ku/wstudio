/**
 * Mermaid 流程图设计器组件
 * 功能：提供全屏的流程图编辑和预览功能
 * 描述：支持垂直工具栏、AI面板、连线选择、彩虹分支、配色面板等功能
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import mermaid from 'mermaid';
import { Icon } from '@/components/Icons';
import { getCachedModels, type CachedModelInfo } from '@/services/ModelCacheService';
import { isModelEnabled } from '@/services/ai';
import { ColorPicker } from '@/components/NoteEditor/components/ColorPicker';
import { NodeSelectionManager } from './NodeSelectionManager';
import { lineStyles, type LineStyleType, applyLineStyleToShape, removeRoughStyle } from './LineStyleService';
import './MermaidDesigner.scss';
import { mermaidTemplateCategories, type MermaidTemplate, type MermaidTemplateCategory } from '../templates';

// 清理 SVG 中的无效 transform 属性
const cleanSvgTransform = (svgString: string): string => {
  return svgString.replace(/transform="[^"]*(?:undefined|NaN)[^"]*"/g, 'transform="translate(0,0)"');
};

// Mermaid 渲染队列 - 确保同一时间只有一个渲染任务
class MermaidRenderQueue {
  private queue: Array<{
    id: string;
    code: string;
    resolve: (svg: string) => void;
    reject: (error: Error) => void;
    retryCount: number;
  }> = [];
  private isProcessing = false;
  private tempContainer: HTMLDivElement | null = null;
  private initialized = false;

  constructor() {
    // 创建一个隐藏的临时容器用于 Mermaid 渲染
    this.tempContainer = document.createElement('div');
    this.tempContainer.id = 'mermaid-render-container';
    this.tempContainer.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:800px;height:600px;visibility:hidden;';
    document.body.appendChild(this.tempContainer);
  }

  async add(id: string, code: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.queue.push({ id, code, resolve, reject, retryCount: 0 });
      this.process();
    });
  }

  private async process(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) return;
    
    this.isProcessing = true;
    const task = this.queue.shift();
    
    if (task) {
      try {
        // 每次渲染前重新初始化 mermaid 配置
        mermaid.initialize({
          startOnLoad: false,
          theme: 'base',
          securityLevel: 'loose',
          themeVariables: {
            darkMode: true,
            background: 'transparent',
            primaryColor: '#42A5F5',
            primaryTextColor: '#fff',
            primaryBorderColor: '#1E88E5',
            lineColor: '#90A4AE',
            textColor: '#E0E0E0',
          },
        });
        this.initialized = true;
        
        // 清理临时容器
        if (this.tempContainer) {
          this.tempContainer.innerHTML = '';
        }
        
        const previewId = `tpl-${task.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        // 使用 mermaid.render 并指定容器
        const { svg } = await mermaid.render(previewId, task.code, this.tempContainer || undefined);
        // 清理临时容器中的内容
        if (this.tempContainer) {
          this.tempContainer.innerHTML = '';
        }
        task.resolve(cleanSvgTransform(svg));
      } catch (err) {
        // 清理临时容器
        if (this.tempContainer) {
          this.tempContainer.innerHTML = '';
        }
        // 重试机制：最多重试2次
        if (task.retryCount < 2) {
          task.retryCount++;
          this.queue.push(task);
        } else {
          task.reject(err instanceof Error ? err : new Error(String(err)));
        }
      }
    }
    
    this.isProcessing = false;
    // 处理下一个任务，增加延迟确保稳定性
    if (this.queue.length > 0) {
      setTimeout(() => this.process(), 120);
    }
  }

  clear(): void {
    this.queue = [];
  }
}

// 全局渲染队列实例
const mermaidRenderQueue = new MermaidRenderQueue();

// 模板预览组件 - 使用队列确保顺序渲染
const TemplatePreview: React.FC<{ code: string; id: string; index: number }> = ({ code, id, index }) => {
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'success' | 'failed'>('loading');
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    setSvgContent(null);
    setStatus('loading');
    
    // 延迟加入队列，避免同时加入太多任务，增加延迟间隔
    const delay = index * 100 + 50;
    const timer = setTimeout(() => {
      mermaidRenderQueue.add(id, code)
        .then((svg) => {
          if (mountedRef.current) {
            setSvgContent(svg);
            setStatus('success');
          }
        })
        .catch((err) => {
          if (mountedRef.current) {
            console.debug('[TemplatePreview] 渲染失败:', id, err);
            setStatus('failed');
          }
        });
    }, delay);

    return () => {
      mountedRef.current = false;
      clearTimeout(timer);
    };
  }, [code, id, index]);

  if (status === 'loading') {
    return (
      <div className="mermaid-designer-template-preview-loading">
        <Icon iconSet="ui" name="git-branch" size={24} />
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <div className="mermaid-designer-template-preview-fallback">
        <Icon iconSet="ui" name="git-branch" size={32} />
      </div>
    );
  }

  return (
    <div
      className="mermaid-designer-template-preview-svg"
      dangerouslySetInnerHTML={{ __html: svgContent || '' }}
    />
  );
};

export interface MermaidDesignerProps {
  initialCode?: string;
  title?: string;
  onSave?: (code: string, title: string) => void;
}

type ToolType = 'ai' | 'material' | 'select' | 'brush' | 'vector' | 'text' | 'shape' | 'line' | 'image' | 'color' | 'font' | 'branch-width' | 'rainbow-branch' | 'template';

interface ShapeItem {
  id: string;
  name: string;
  syntax: string;
  icon: string;
}

interface LineType {
  id: string;
  name: string;
  iconName: string;
}

interface RainbowScheme {
  id: string;
  name: string;
  colors: string[];
}

interface ColorScheme {
  id: string;
  name: string;
  colors: string[];
}

interface AIModel {
  id: string;
  name: string;
}

// 结构预设接口 - 形状之间的连接结构
interface StructurePreset {
  id: string;
  name: string;
  description: string;
  syntax: string; // Mermaid 连接语法
  icon: string; // SVG path
  viewBox?: string; // 自定义 viewBox
}

// 画布背景类型
type CanvasBackgroundType = 'grid' | 'dots' | 'solid';

// 画布背景预设
const canvasBackgrounds: { id: CanvasBackgroundType; name: string; icon: string }[] = [
  { id: 'grid', name: '网格', icon: 'M4 4v16M8 4v16M12 4v16M16 4v16M20 4v16M4 4h16M4 8h16M4 12h16M4 16h16M4 20h16' },
  { id: 'dots', name: '点阵', icon: 'M4 4h0.01M8 4h0.01M12 4h0.01M16 4h0.01M20 4h0.01M4 8h0.01M8 8h0.01M12 8h0.01M16 8h0.01M20 8h0.01M4 12h0.01M8 12h0.01M12 12h0.01M16 12h0.01M20 12h0.01M4 16h0.01M8 16h0.01M12 16h0.01M16 16h0.01M20 16h0.01M4 20h0.01M8 20h0.01M12 20h0.01M16 20h0.01M20 20h0.01' },
  { id: 'solid', name: '纯色', icon: 'M4 4h16v16H4z' },
];

// 11种连接结构预设
const structurePresets: StructurePreset[] = [
  { id: 'logic', name: '逻辑图', description: '逻辑连接结构', syntax: '-->', viewBox: '0 0 48 28', icon: 'M36.3,5.55 C36.7142136,5.55 37.05,5.88578644 37.05,6.3 C37.05,6.67969577 36.7678461,6.99349096 36.4017706,7.04315338 L36.3,7.05 L30,7.05 C29.6736499,7.05 29.4034735,7.29050819 29.3570477,7.60394776 L29.35,7.7 L29.35,13.25 L36.1015063,13.25 C36.5157199,13.25 36.8515063,13.5857864 36.8515063,14 C36.8515063,14.3796958 36.5693524,14.693491 36.2032769,14.7431534 L36.1015063,14.75 L29.35,14.75 L29.35,20.3 L29.3570477,20.3960522 C29.4034735,20.7094918 29.6736499,20.95 30,20.95 L30,20.95 L36.3,20.95 L36.4017706,20.9568466 C36.7678461,21.006509 37.05,21.3203042 37.05,21.7 C37.05,22.1142136 36.7142136,22.45 36.3,22.45 L36.3,22.45 L30,22.45 L29.8464558,22.4446017 C28.7307041,22.3658717 27.85,21.4357856 27.85,20.3 L27.85,20.3 L27.85,14.75 L25.15,14.75 L25.15,16.83661 C25.15,17.5712865 24.5894608,18.175042 23.8727289,18.2435299 L23.73661,18.25 L11.06339,18.25 C10.2827963,18.25 9.65,17.6172037 9.65,16.83661 L9.65,16.83661 L9.65,11.16339 C9.65,10.3827963 10.2827963,9.75 11.06339,9.75 L11.06339,9.75 L23.73661,9.75 C24.5172037,9.75 25.15,10.3827963 25.15,11.16339 L25.15,11.16339 L25.15,13.25 L27.85,13.25 L27.85,7.7 C27.85,6.56421441 28.7307041,5.63412828 29.8464558,5.55539827 L30,5.55 L36.3,5.55 Z M23.65,11.25 L11.149,11.25 L11.149,16.75 L23.65,16.75 L23.65,11.25 Z' },
  { id: 'mindmap', name: '思维导图', description: '思维导图结构', syntax: '-->', viewBox: '0 0 48 28', icon: 'M9.30007971,6.6 C14.3492531,6.6 17.5752905,7.72597349 18.8711628,10.0996718 L29.0606068,10.0998676 C29.9983661,7.89675416 33.0752579,6.88638647 38.1491889,6.88638647 C38.5634024,6.88638647 38.8991889,7.22217291 38.8991889,7.63638647 C38.8991889,8.05060003 38.5634024,8.38638647 38.1491889,8.38638647 C34.2625018,8.38638647 31.8556516,8.99704708 30.8366595,10.1003127 L31.7366897,10.1001958 C32.5172834,10.1001958 33.1500797,10.7329921 33.1500797,11.5135858 L33.1500797,11.5135858 L33.1500797,17.1868058 C33.1500797,17.9673996 32.5172834,18.6001958 31.7366897,18.6001958 L31.7366897,18.6001958 L31.0155446,18.6012654 C32.1095662,19.4288499 34.4212298,19.9001958 38.0002667,19.9001958 C38.4144803,19.9001958 38.7502667,20.2359823 38.7502667,20.6501958 C38.7502667,21.0644094 38.4144803,21.4001958 38.0002667,21.4001958 C37.7484133,21.4001958 37.5016092,21.3979742 37.2598664,21.3935035 L37.2598664,21.3935035 L36.5498337,21.3733165 L35.8702399,21.3394695 C32.1705153,21.1126351 29.890122,20.2426564 29.0845488,18.6011003 L18.8218881,18.6008266 C17.4986378,20.5183872 14.3142075,21.4001958 9.30007971,21.4001958 C8.88586614,21.4001958 8.55007971,21.0644094 8.55007971,20.6501958 C8.55007971,20.2359823 8.88586614,19.9001958 9.30007971,19.9001958 C12.8260587,19.9001958 15.2688885,19.4427277 16.6434119,18.6003687 L16.2634697,18.6001958 C15.482876,18.6001958 14.8500797,17.9673996 14.8500797,17.1868058 L14.8500797,17.1868058 L14.8500797,11.5135858 C14.8500797,10.7329921 15.482876,10.1001958 16.2634697,10.1001958 L16.2634697,10.1001958 L17.0174627,10.1003889 C15.7476552,8.7924722 13.1977653,8.1 9.30007971,8.1 C8.88586614,8.1 8.55007971,7.76421356 8.55007971,7.35 C8.55007971,6.93578644 8.88586614,6.6 9.30007971,6.6 Z M10.7433198,12.1470866 L10.7500797,12.2501958 L10.7500797,16.4501958 C10.7500797,16.8644094 10.4142933,17.2001958 10.0000797,17.2001958 C9.62038394,17.2001958 9.30658874,16.9180419 9.25692632,16.5519664 L9.25007971,16.4501958 L9.25007971,13.6511958 L8.31610485,14.2742335 C8.00278984,14.4831102 7.58947028,14.4251317 7.3442853,14.1539259 L7.27604198,14.066221 C7.06716531,13.752906 7.12514379,13.3395864 7.39634962,13.0944014 L7.48405456,13.0261581 L9.58405456,11.6261581 C10.053152,11.3134265 10.6721229,11.6115258 10.7433198,12.1470866 Z M38,11.4989348 C38.3796958,11.4989348 38.693491,11.7810886 38.7431534,12.1471642 L38.75,12.2489348 L38.751,15.0469348 L39.6839749,14.424897 C39.9972899,14.2160204 40.4106094,14.2739989 40.6557944,14.5452047 L40.7240377,14.6329096 C40.9329144,14.9462246 40.8749359,15.3595442 40.6037301,15.6047292 L40.5160251,15.6729725 L38.4160251,17.0729725 C37.9469277,17.3857041 37.3279568,17.0876048 37.2567599,16.552044 L37.25,16.4489348 L37.25,12.2489348 C37.25,11.8347212 37.5857864,11.4989348 38,11.4989348 Z M31.6490797,11.6001958 L16.3490797,11.6001958 L16.3490797,17.1001958 L31.6490797,17.1001958 L31.6490797,11.6001958 Z' },
  { id: 'brace', name: '括号图', description: '括号连接结构', syntax: '-->', viewBox: '0 0 48 28', icon: 'M30.105,5.52507891 C30.5192136,5.52507891 30.855,5.86086535 30.855,6.27507891 C30.855,6.68929247 30.5192136,7.02507891 30.105,7.02507891 C29.2913005,7.02507891 28.6231075,7.64806639 28.5513752,8.44308711 L28.545,8.58507891 L28.545,12.4311938 C28.545,12.6458701 28.4531492,12.8484031 28.2957759,12.9895293 L28.2117509,13.054747 L26.809,13.991 L28.2062943,14.9078133 L28.2916121,14.9729362 C28.4514517,15.1141434 28.545,15.3183147 28.545,15.5349792 L28.545,15.5349792 L28.545,19.410085 L28.5513752,19.5520768 C28.6231075,20.3470975 29.2913005,20.970085 30.105,20.970085 C30.5192136,20.970085 30.855,21.3058714 30.855,21.720085 C30.855,22.1342985 30.5192136,22.470085 30.105,22.470085 L30.105,22.470085 L29.9252018,22.4648904 C28.3188984,22.3718191 27.045,21.0397195 27.045,19.410085 L27.045,19.410085 L27.045,15.941085 L25.0737057,14.6472508 L24.9854872,14.5796726 C24.8174951,14.4300916 24.7297298,14.21626 24.735152,14.0005257 C24.728313,13.7848371 24.8142011,13.5706783 24.9806236,13.419871 L25.0682491,13.3515256 L27.045,12.03 L27.045,8.58507891 C27.045,6.95544441 28.3188984,5.62334481 29.9252018,5.53027346 L30.105,5.52507891 Z M37.7,20.9 C38.1142136,20.9 38.45,21.2357864 38.45,21.65 C38.45,22.0296958 38.1678461,22.343491 37.8017706,22.3931534 L37.7,22.4 L34.2,22.4 C33.7857864,22.4 33.45,22.0642136 33.45,21.65 C33.45,21.2703042 33.7321539,20.956509 34.0982294,20.9068466 L34.2,20.9 L37.7,20.9 Z M21.570271,9.7 C22.3875028,9.7 23.05,10.3624972 23.05,11.179729 L23.05,11.179729 L23.05,16.020271 C23.05,16.8375028 22.3875028,17.5 21.570271,17.5 L21.570271,17.5 L11.129729,17.5 C10.3124972,17.5 9.65,16.8375028 9.65,16.020271 L9.65,16.020271 L9.65,11.179729 C9.65,10.3624972 10.3124972,9.7 11.129729,9.7 L11.129729,9.7 Z M21.549,11.2 L11.149,11.2 L11.149,16 L21.549,16 L21.549,11.2 Z M37.7,13.2 C38.1142136,13.2 38.45,13.5357864 38.45,13.95 C38.45,14.3296958 38.1678461,14.643491 37.8017706,14.6931534 L37.7,14.7 L34.2,14.7 C33.7857864,14.7 33.45,14.3642136 33.45,13.95 C33.45,13.5703042 33.7321539,13.256509 34.0982294,13.2068466 L34.2,13.2 L37.7,13.2 Z M37.7,5.5 C38.1142136,5.5 38.45,5.83578644 38.45,6.25 C38.45,6.62969577 38.1678461,6.94349096 37.8017706,6.99315338 L37.7,7 L34.2,7 C33.7857864,7 33.45,6.66421356 33.45,6.25 C33.45,5.87030423 33.7321539,5.55650904 34.0982294,5.50684662 L34.2,5.5 L37.7,5.5 Z' },
  { id: 'org', name: '组织结构图', description: '组织结构连接', syntax: '-->', viewBox: '0 0 48 28', icon: 'M30.73661,4.85 C31.5172037,4.85 32.15,5.48279626 32.15,6.26339 L32.15,6.26339 L32.15,11.23661 C32.15,12.0172037 31.5172037,12.65 30.73661,12.65 L30.73661,12.65 L25.15,12.649 L25.15,15.349 L34.9,15.35 C36.0357856,15.35 36.9658717,16.2307041 37.0446017,17.3464558 L37.05,17.5 L37.05,21.7 C37.05,22.1142136 36.7142136,22.45 36.3,22.45 C35.9203042,22.45 35.606509,22.1678461 35.5568466,21.8017706 L35.55,21.7 L35.55,17.5 C35.55,17.1736499 35.3094918,16.9034735 34.9960522,16.8570477 L34.9,16.85 L25.15,16.849 L25.15,21.7 C25.15,22.1142136 24.8142136,22.45 24.4,22.45 C24.0203042,22.45 23.706509,22.1678461 23.6568466,21.8017706 L23.65,21.7 L23.65,16.849 L13.9,16.85 L13.8039478,16.8570477 C13.4905082,16.9034735 13.25,17.1736499 13.25,17.5 L13.25,17.5 L13.25,21.7 L13.2431534,21.8017706 C13.193491,22.1678461 12.8796958,22.45 12.5,22.45 C12.0857864,22.45 11.75,22.1142136 11.75,21.7 L11.75,21.7 L11.75,17.5 L11.7553983,17.3464558 C11.8341283,16.2307041 12.7642144,15.35 13.9,15.35 L13.9,15.35 L23.65,15.349 L23.65,12.649 L18.06339,12.65 C17.3287135,12.65 16.724958,12.0894608 16.6564701,11.3727289 L16.65,11.23661 L16.65,6.26339 C16.65,5.48279626 17.2827963,4.85 18.06339,4.85 L18.06339,4.85 Z M30.65,6.35 L18.15,6.35 L18.15,11.149 L30.65,11.149 L30.65,6.35 Z' },
  { id: 'tree', name: '树形图', description: '树形连接结构', syntax: '-->', viewBox: '0 0 48 28', icon: 'M31.61,3.75 C32.2948331,3.75 32.85,4.30516691 32.85,4.99 L32.85,4.99 L32.85,11.01 C32.85,11.6948331 32.2948331,12.25 31.61,12.25 L31.61,12.25 L25.149,12.25 L25.15,15.7 C25.15,16.0263501 25.3905082,16.2965265 25.7039478,16.3429523 L25.8,16.35 L31,16.35 C31.4142136,16.35 31.75,16.6857864 31.75,17.1 C31.75,17.4796958 31.4678461,17.793491 31.1017706,17.8431534 L31,17.85 L25.8,17.85 C25.5730657,17.85 25.3543433,17.8148409 25.1489828,17.7496728 L25.15,22.7 C25.15,23.0263501 25.3905082,23.2965265 25.7039478,23.3429523 L25.8,23.35 L31,23.35 C31.4142136,23.35 31.75,23.6857864 31.75,24.1 C31.75,24.4796958 31.4678461,24.793491 31.1017706,24.8431534 L31,24.85 L25.8,24.85 C24.6642144,24.85 23.7341283,23.9692959 23.6553983,22.8535442 L23.65,22.7 L23.649,12.25 L17.19,12.25 C16.547969,12.25 16.0199024,11.7620603 15.956402,11.1367828 L15.95,11.01 L15.95,4.99 C15.95,4.30516691 16.5051669,3.75 17.19,3.75 L17.19,3.75 Z M31.349,5.25 L17.45,5.25 L17.45,10.75 L31.349,10.75 L31.349,5.25 Z' },
  { id: 'timeline', name: '时间轴图', description: '时间轴连接结构', syntax: '-->', viewBox: '0 0 48 28', icon: 'M20.0866,10 L9.41339,10 C8.6328,10 8,10.6328 8,11.4134 L8,16.59 C8,17.3706 8.6328,18 9.41339,18 L20.0866,18 C20.8672,18 21.5,17.3706 21.5,16.59 L21.5,14.7498 L25.7769,14.7498 L25.7769,16.1079 L25.7837,16.2097 C25.8334,16.5757 26.1472,16.8579 26.5269,16.8579 C26.9411,16.8579 27.2769,16.5221 27.2769,16.1079 L27.2769,14.7498 L27.4501,14.7498 L28.527,14.7498 L30.7769,14.7498 L30.7769,16.1079 L30.7837,16.2097 C30.8334,16.5757 31.1472,16.8579 31.5269,16.8579 C31.9411,16.8579 32.2769,16.5221 32.2769,16.1079 L32.2769,14.7498 L35.7769,14.7498 L35.7769,16.1079 L35.7837,16.2097 C35.8334,16.5757 36.1472,16.8579 36.5269,16.8579 C36.9411,16.8579 37.2769,16.5221 37.2769,16.1079 L37.2769,14.7498 L40.1001,14.7498 L40.2019,14.7429 C40.5679,14.6932 40.8501,14.3795 40.8501,13.9998 C40.8501,13.5855 40.5143,13.2498 40.1001,13.2498 L37.2769,13.2498 L37.2769,11.9004 L37.27,11.7986 C37.2203,11.4325 36.9066,11.1504 36.5269,11.1504 C36.1126,11.1504 35.7769,11.4862 35.7769,11.9004 L35.7769,13.2498 L32.2769,13.2498 L32.2769,11.9004 L32.27,11.7986 C32.2203,11.4325 31.9066,11.1504 31.5269,11.1504 C31.1126,11.1504 30.7769,11.4862 30.7769,11.9004 L30.7769,13.2498 L28.527,13.2498 L27.4501,13.2498 L27.2769,13.2498 L27.2769,11.9004 L27.27,11.7986 C27.2203,11.4325 26.9066,11.1504 26.5269,11.1504 C26.1126,11.1504 25.7769,11.4862 25.7769,11.9004 L25.7769,13.2498 L21.5,13.2498 L21.5,11.4134 C21.5,10.6328 20.8672,10 20.0866,10 Z M20,11.5 L20,16.5 L9.5,16.5 L9.5,11.5 L20,11.5 Z' },
  { id: 'fishbone', name: '鱼骨图', description: '鱼骨连接结构', syntax: '-->', viewBox: '0 0 48 28', icon: 'M28.9398499,7.81957045 C29.2979006,7.9459372 29.4999037,8.31644088 29.4249013,8.67817602 L29.3974873,8.77642364 L27.801,13.2996113 L32.214,13.2996113 L33.6539086,9.43839496 C33.7985823,9.05026817 34.2305024,8.85291042 34.6186292,8.99758409 C34.9744121,9.13020162 35.169896,9.50418596 35.0885704,9.86455218 L35.0594401,9.96230466 L33.815,13.2996113 L39.2484119,13.3002037 C39.6626255,13.3002037 39.9984119,13.6359901 39.9984119,14.0502037 C39.9984119,14.4298994 39.7162581,14.7436946 39.3501825,14.7933571 L39.2484119,14.8002037 L35.796,14.7996113 L37.0594401,18.1878988 L37.0885704,18.2856513 C37.169896,18.6460175 36.9744121,19.0200019 36.6186292,19.1526194 C36.2628463,19.2852369 35.8702649,19.1304531 35.6958698,18.8047783 L35.6539086,18.7118085 L34.196,14.7996113 L29.801,14.7996113 L31.3974873,19.3239844 L31.4249013,19.4222321 C31.4999037,19.7839672 31.2979006,20.1544709 30.9398499,20.2808376 C30.5817992,20.4072044 30.1919885,20.2455694 30.0233233,19.9168906 L29.9829967,19.8232002 L28.209,14.7996113 L23.29,14.8 L23.29,16.63 C23.29,17.3646765 22.7294608,17.9654291 22.0127289,18.0335637 L21.87661,18.04 L11.20339,18.04 C10.4687135,18.04 9.86495803,17.4824637 9.7964701,16.7660851 L9.79,16.63 L9.79,11.45339 C9.79,10.7187135 10.3505392,10.114958 11.0672711,10.0464701 L11.20339,10.04 L21.87661,10.04 C22.6112865,10.04 23.215042,10.6005392 23.2835299,11.3172711 L23.29,11.45339 L23.29,13.3 L26.209,13.2996113 L27.9829967,8.27720785 C28.1208513,7.88660706 28.5492491,7.68171582 28.9398499,7.81957045 Z M21.79,11.54 L11.29,11.54 L11.29,16.54 L21.79,16.54 L21.79,11.54 Z' },
];

const shapePresets: ShapeItem[] = [
  { id: 'rect-rounded', name: '圆角矩形', syntax: '[文本]', icon: 'M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z' },
  { id: 'rect', name: '矩形', syntax: '(文本)', icon: 'M4 4h16v16H4z' },
  { id: 'circle', name: '圆形', syntax: '((文本))', icon: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z' },
  { id: 'rhombus', name: '菱形', syntax: '{文本}', icon: 'M12 4l8 8-8 8-8-8z' },
  { id: 'hexagon', name: '六边形', syntax: '{{文本}}', icon: 'M12 3l7 4v10l-7 4-7-4V7z' },
  { id: 'stadium', name: '体育场形', syntax: '([文本])', icon: 'M8 6h8a6 6 0 0 1 0 12H8a6 6 0 0 1 0-12z' },
  { id: 'cylinder', name: '圆柱体', syntax: '[(文本)]', icon: 'M4 6a8 3 0 0 1 16 0v12a8 3 0 0 1-16 0zM4 6a8 3 0 0 0 16 0' },
  { id: 'triangle', name: '三角形', syntax: '@{ shape: triangle }', icon: 'M12 4l8 16H4z' },
  { id: 'double-circle', name: '双圈', syntax: '(((文本)))', icon: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 6a6 6 0 1 0 0 12 6 6 0 0 0 0-12z' },
  { id: 'subroutine', name: '子程序', syntax: '[[文本]]', icon: 'M6 4h12v16H6zM4 4v16M20 4v16' },
  { id: 'trapezoid', name: '梯形', syntax: '[/文本\\]', icon: 'M6 16h12l2-12H4z' },
  { id: 'document', name: '文档', syntax: '@{ shape: doc }', icon: 'M4 4h16v14c-2-2-4-2-8 0s-6 2-8 0V4z' },
];

const lineTypes: LineType[] = [
  { id: 'arrow-up-right', name: '斜向上箭头', iconName: 'move-up-right' },
  { id: 'forward', name: '前进箭头', iconName: 'forward' },
  { id: 'arrow-right', name: '向右箭头', iconName: 'move-right' },
  { id: 'arrow-down', name: '向下箭头', iconName: 'move-down' },
  { id: 'arrow-up', name: '向上箭头', iconName: 'move-up' },
];

const rainbowSchemes: RainbowScheme[] = [
  { id: 'rainbow', name: '彩虹', colors: ['#FF6B6B', '#FFE66D', '#4ECDC4', '#45B7D1', '#96E6A1', '#DDA0DD'] },
  { id: 'ocean', name: '海洋', colors: ['#0077B6', '#00B4D8', '#90E0EF', '#CAF0F8', '#48CAE4', '#023E8A'] },
  { id: 'sunset', name: '日落', colors: ['#FF6B35', '#F7931E', '#FFD23F', '#EE4266', '#540D6E', '#3BCEAC'] },
  { id: 'forest', name: '森林', colors: ['#2D5016', '#4A7C23', '#6B8E23', '#8FBC8F', '#98D8AA', '#C1E1C1'] },
  { id: 'candy', name: '糖果', colors: ['#FF69B4', '#FFB6C1', '#DDA0DD', '#E6E6FA', '#F0E68C', '#98FB98'] },
  { id: 'earth', name: '大地', colors: ['#8B4513', '#A0522D', '#CD853F', '#DEB887', '#D2B48C', '#F5DEB3'] },
  { id: 'neon', name: '霓虹', colors: ['#FF00FF', '#00FFFF', '#FF0080', '#80FF00', '#FFFF00', '#FF8000'] },
  { id: 'pastel', name: '粉彩', colors: ['#FFB3BA', '#FFDFBA', '#FFFFBA', '#BAFFC9', '#BAE1FF', '#E8BAFF'] },
  { id: 'mono', name: '单色', colors: ['#2C3E50', '#34495E', '#7F8C8D', '#95A5A6', '#BDC3C7', '#ECF0F1'] },
];

const colorfulSchemes: ColorScheme[] = [
  { id: 'rainbow', name: '彩虹', colors: ['#FF6B6B', '#FFE66D', '#4ECDC4', '#45B7D1', '#96E6A1', '#DDA0DD'] },
  { id: 'vitality', name: '活力', colors: ['#FF5733', '#FFC300', '#DAF7A6', '#33FF57', '#3380FF', '#8E44AD'] },
  { id: 'dance', name: '舞动', colors: ['#E91E63', '#9C27B0', '#673AB7', '#3F51B5', '#2196F3', '#00BCD4'] },
  { id: 'code', name: '代码', colors: ['#61DAFB', '#764ABC', '#F7DF1E', '#339933', '#E34F26', '#1572B6'] },
  { id: 'japanese', name: '和风', colors: ['#D4A5A5', '#A5D4D4', '#D4D4A5', '#A5A5D4', '#D4C4A5', '#C4D4A5'] },
  { id: 'island', name: '岛屿', colors: ['#00CED1', '#20B2AA', '#48D1CC', '#40E0D0', '#7FFFD4', '#66CDAA'] },
  { id: 'rose', name: '玫瑰', colors: ['#FF007F', '#FF1493', '#FF69B4', '#FFB6C1', '#FFC0CB', '#FFE4E1'] },
  { id: 'mint', name: '薄荷', colors: ['#98FF98', '#90EE90', '#00FA9A', '#00FF7F', '#3CB371', '#2E8B57'] },
  { id: 'greentea', name: '绿茶', colors: ['#9DC183', '#8FBC8F', '#6B8E23', '#556B2F', '#808000', '#6B8E23'] },
  { id: 'cosmos', name: '宇宙', colors: ['#191970', '#000080', '#4169E1', '#6495ED', '#87CEEB', '#B0E0E6'] },
  { id: 'elegant', name: '精致', colors: ['#2F4F4F', '#708090', '#778899', '#B0C4DE', '#E6E6FA', '#F8F8FF'] },
  { id: 'innocent', name: '纯真', colors: ['#FFFACD', '#FAFAD2', '#FFEFD5', '#FFE4B5', '#FFDAB9', '#EEE8AA'] },
  { id: 'macaron', name: '马卡龙', colors: ['#FFB5E8', '#B5DEFF', '#B5FFB8', '#FFFFB5', '#FFD9B5', '#E8B5FF'] },
  { id: 'woodland', name: '林地', colors: ['#228B22', '#32CD32', '#90EE90', '#98FB98', '#00FF00', '#7CFC00'] },
  { id: 'cream', name: '奶油', colors: ['#FFFDD0', '#FAEBD7', '#FFE4C4', '#FFEBCD', '#FFF8DC', '#FFFAF0'] },
  { id: 'hawaii', name: '夏威夷', colors: ['#FF6347', '#FF7F50', '#FFA500', '#FFD700', '#ADFF2F', '#00CED1'] },
];

const classicSchemes: ColorScheme[] = [
  { id: 'classic-blue', name: '经典蓝', colors: ['#003366', '#336699', '#6699CC', '#99CCFF', '#CCE5FF', '#E6F2FF'] },
  { id: 'classic-green', name: '经典绿', colors: ['#006633', '#339966', '#66CC99', '#99FFCC', '#CCFFE5', '#E6FFF2'] },
  { id: 'classic-red', name: '经典红', colors: ['#660000', '#993333', '#CC6666', '#FF9999', '#FFCCCC', '#FFE6E6'] },
  { id: 'classic-purple', name: '经典紫', colors: ['#330066', '#663399', '#9966CC', '#CC99FF', '#E5CCFF', '#F2E6FF'] },
  { id: 'classic-orange', name: '经典橙', colors: ['#CC5500', '#FF6600', '#FF9933', '#FFCC66', '#FFE5B3', '#FFF2E6'] },
  { id: 'classic-gray', name: '经典灰', colors: ['#333333', '#666666', '#999999', '#CCCCCC', '#E6E6E6', '#F5F5F5'] },
];

// 预设填充颜色（无、黑、白 + 15个颜色）
const fillPresetColors = [
  'transparent', '#000000', '#FFFFFF',
  '#FF6B6B', '#FFE66D', '#4ECDC4', '#45B7D1', '#96E6A1',
  '#DDA0DD', '#FF69B4', '#87CEEB', '#98FB98', '#F0E68C',
  '#E6E6FA', '#FFB6C1', '#B0E0E6', '#FFDAB9', '#D3D3D3',
];

// 不显示梯度的颜色
const noGradientColors = ['transparent', '#000000'];

// 解析颜色（支持 HEX 和 RGBA）
const parseColor = (color: string): { r: number; g: number; b: number; a: number } => {
  // RGBA 格式: rgba(r, g, b, a)
  const rgbaMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (rgbaMatch) {
    return {
      r: parseInt(rgbaMatch[1], 10),
      g: parseInt(rgbaMatch[2], 10),
      b: parseInt(rgbaMatch[3], 10),
      a: rgbaMatch[4] ? parseFloat(rgbaMatch[4]) : 1,
    };
  }
  
  // HEX 格式
  const hex = color.replace('#', '');
  return {
    r: parseInt(hex.substring(0, 2), 16),
    g: parseInt(hex.substring(2, 4), 16),
    b: parseInt(hex.substring(4, 6), 16),
    a: 1,
  };
};

// 生成颜色梯度（从深到浅，6个梯度，保持透明度）
const generateColorGradient = (baseColor: string): string[] => {
  const { r, g, b, a } = parseColor(baseColor);
  
  const gradients: string[] = [];
  
  // 生成3个深色（与黑色混合）
  const darkFactors = [0.2, 0.4, 0.65];
  for (const factor of darkFactors) {
    const newR = Math.round(r * factor);
    const newG = Math.round(g * factor);
    const newB = Math.round(b * factor);
    if (a < 1) {
      gradients.push(`rgba(${newR}, ${newG}, ${newB}, ${a})`);
    } else {
      gradients.push(`#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`);
    }
  }
  
  // 原色
  gradients.push(baseColor);
  
  // 生成2个浅色（与白色混合）
  const lightFactors = [0.35, 0.65];
  for (const factor of lightFactors) {
    const newR = Math.round(r + (255 - r) * factor);
    const newG = Math.round(g + (255 - g) * factor);
    const newB = Math.round(b + (255 - b) * factor);
    if (a < 1) {
      gradients.push(`rgba(${newR}, ${newG}, ${newB}, ${a})`);
    } else {
      gradients.push(`#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`);
    }
  }
  
  return gradients;
};

const zoomLevels = [25, 50, 75, 100, 125, 150, 200, 300, 400];

export const MermaidDesigner: React.FC<MermaidDesignerProps> = ({
  initialCode = 'flowchart TD\n    A[开始] --> B[结束]',
  title: initialTitle = '流程图',
  onSave,
}) => {
  const [code, setCode] = useState(initialCode);
  const [title, setTitle] = useState(initialTitle);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [scale, setScale] = useState(1);
  const [translateX, setTranslateX] = useState(0);
  const [translateY, setTranslateY] = useState(0);

  const [isDragMode, setIsDragMode] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<ToolType>('select');
  const [isShapeMenuOpen, setIsShapeMenuOpen] = useState(false);
  const [selectedShape, setSelectedShape] = useState<ShapeItem>(shapePresets[0]);
  
  const [isAIPanelOpen, setIsAIPanelOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiModels, setAiModels] = useState<AIModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<AIModel | null>(null);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  
  const [isLineDropdownOpen, setIsLineDropdownOpen] = useState(false);
  const [selectedLine, setSelectedLine] = useState<LineType>(lineTypes[0]);
  
  const [isRainbowDropdownOpen, setIsRainbowDropdownOpen] = useState(false);
  const [selectedRainbow, setSelectedRainbow] = useState<RainbowScheme>(rainbowSchemes[0]);
  
  const [isColorPanelOpen, setIsColorPanelOpen] = useState(false);
  const [colorPanelTab, setColorPanelTab] = useState<'colorful' | 'classic'>('colorful');
  const [selectedColorScheme, setSelectedColorScheme] = useState<ColorScheme>(colorfulSchemes[0]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [shapeToolbarPosition, setShapeToolbarPosition] = useState<{ x: number; y: number } | null>(null);
  const [isFontDropdownOpen, setIsFontDropdownOpen] = useState(false);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [isTopShapeMenuOpen, setIsTopShapeMenuOpen] = useState(false);
  const [isFillDropdownOpen, setIsFillDropdownOpen] = useState(false);
  const [selectedFillColor, setSelectedFillColor] = useState<string>(fillPresetColors[0]);
  const [selectedBaseColor, setSelectedBaseColor] = useState<string>(fillPresetColors[0]); // 当前选中的基础预设颜色
  const [customFillColor, setCustomFillColor] = useState<string>('#4A90D9');
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const [colorPickerAnchorRect, setColorPickerAnchorRect] = useState<DOMRect | undefined>(undefined);
  // 描边颜色相关状态
  const [isStrokeDropdownOpen, setIsStrokeDropdownOpen] = useState(false);
  const [selectedStrokeColor, setSelectedStrokeColor] = useState<string>('#000000');
  const [selectedStrokeBaseColor, setSelectedStrokeBaseColor] = useState<string>('#000000');
  const [customStrokeColor, setCustomStrokeColor] = useState<string>('#4A90D9');
  const [isStrokeColorPickerOpen, setIsStrokeColorPickerOpen] = useState(false);
  const [strokeColorPickerAnchorRect, setStrokeColorPickerAnchorRect] = useState<DOMRect | undefined>(undefined);
  // 描边样式和粗细状态
  const [strokeStyle, setStrokeStyle] = useState<'solid' | 'dashed'>('solid');
  const [strokeWidth, setStrokeWidth] = useState<number>(4);
  // 右侧样式面板状态
  const [isStylePanelOpen, setIsStylePanelOpen] = useState(false);
  const [isShapeSectionExpanded, setIsShapeSectionExpanded] = useState(true);
  const [isStylePanelShapeMenuOpen, setIsStylePanelShapeMenuOpen] = useState(false);
  const [isStylePanelStrokePickerOpen, setIsStylePanelStrokePickerOpen] = useState(false);
  const [stylePanelStrokePickerAnchorRect, setStylePanelStrokePickerAnchorRect] = useState<DOMRect | undefined>(undefined);
  // 线条风格状态
  const [lineStyle, setLineStyle] = useState<LineStyleType>('plain');
  const [isLineStyleSectionExpanded, setIsLineStyleSectionExpanded] = useState(true);
  // 结构预设状态
  const [isStructureSectionExpanded, setIsStructureSectionExpanded] = useState(true);
  const [selectedStructure, setSelectedStructure] = useState<StructurePreset>(structurePresets[0]);
  const [isStructureDropdownOpen, setIsStructureDropdownOpen] = useState(false);
  // 画布背景状态
  const [canvasBackground, setCanvasBackground] = useState<CanvasBackgroundType>('grid');
  const [isBackgroundSectionExpanded, setIsBackgroundSectionExpanded] = useState(true);
  // 模板面板状态
  const [isTemplatePanelOpen, setIsTemplatePanelOpen] = useState(false);
  const [templatePanelTab, setTemplatePanelTab] = useState<'preset' | 'my'>('preset');
  const [selectedTemplateCategory, setSelectedTemplateCategory] = useState<MermaidTemplateCategory>(mermaidTemplateCategories[0]);
  const [myTemplates] = useState<MermaidTemplate[]>([]); // 我的模板列表（后续可从存储加载）
  const [selectedTemplate, setSelectedTemplate] = useState<MermaidTemplate | null>(null); // 当前选中的模板

  const svgContainerRef = useRef<HTMLDivElement>(null);
  const shapeToolbarRef = useRef<HTMLDivElement>(null);
  const customColorBtnRef = useRef<HTMLSpanElement>(null);
  const customStrokeColorBtnRef = useRef<HTMLSpanElement>(null);
  const dragStartRef = useRef({ x: 0, y: 0, translateX: 0, translateY: 0 });
  const titleInputRef = useRef<HTMLInputElement>(null);
  const shapeMenuRef = useRef<HTMLDivElement>(null);
  const aiPanelRef = useRef<HTMLDivElement>(null);
  const lineDropdownRef = useRef<HTMLDivElement>(null);
  const rainbowDropdownRef = useRef<HTMLDivElement>(null);
  const colorPanelRef = useRef<HTMLDivElement>(null);
  const templatePanelRef = useRef<HTMLDivElement>(null);
  const nodeSelectionManagerRef = useRef<NodeSelectionManager | null>(null);
  const lineStyleRef = useRef<LineStyleType>('plain');

  useEffect(() => {
    mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'loose' });
  }, []);

  // 初始化节点选择管理器
  useEffect(() => {
    nodeSelectionManagerRef.current = new NodeSelectionManager();
    return () => {
      nodeSelectionManagerRef.current?.destroy();
    };
  }, []);

  useEffect(() => {
    const loadModels = async () => {
      const models = await getCachedModels();
      const enabledModels = models.filter((m: CachedModelInfo) => m.id && isModelEnabled(m.id));
      const mappedModels: AIModel[] = enabledModels.map((m: CachedModelInfo) => ({ id: m.id || '', name: m.name || '' }));
      setAiModels(mappedModels);
      if (mappedModels.length > 0) {
        setSelectedModel(mappedModels[0]);
      }
    };
    loadModels();
  }, []);

  // 应用彩虹分支颜色到SVG连线（分支）
  const applyRainbowColors = useCallback(() => {
    if (!svgContainerRef.current) return;
    const colors = selectedRainbow.colors;
    
    // 尝试多种选择器查找连线
    let edgePaths = svgContainerRef.current.querySelectorAll('.edgePath');
    if (edgePaths.length === 0) {
      edgePaths = svgContainerRef.current.querySelectorAll('.edge');
    }
    if (edgePaths.length === 0) {
      edgePaths = svgContainerRef.current.querySelectorAll('.flowchart-link');
    }
    if (edgePaths.length === 0) {
      // 直接查找所有path元素（排除节点内的）
      edgePaths = svgContainerRef.current.querySelectorAll('g.edgePaths path, path.flowchart-link');
    }
    
    // 如果还是找不到，尝试查找所有非节点的path
    if (edgePaths.length === 0) {
      const allPaths = svgContainerRef.current.querySelectorAll('path');
      console.log('[MermaidDesigner] 所有path数量:', allPaths.length);
      allPaths.forEach((path, index) => {
        // 排除节点内的path（通常节点在.node类下）
        if (!path.closest('.node') && !path.closest('.label')) {
          const colorIndex = index % colors.length;
          const color = colors[colorIndex];
          (path as SVGElement).style.stroke = color;
          (path as SVGElement).setAttribute('stroke', color);
        }
      });
      return;
    }
    
    console.log('[MermaidDesigner] 应用彩虹颜色, 连线数量:', edgePaths.length);
    
    edgePaths.forEach((edge, index) => {
      const colorIndex = index % colors.length;
      const color = colors[colorIndex];
      
      // 如果edge本身就是path
      if (edge.tagName.toLowerCase() === 'path') {
        (edge as SVGElement).style.stroke = color;
        (edge as SVGElement).setAttribute('stroke', color);
      } else {
        // 设置连线路径颜色
        const path = edge.querySelector('path');
        if (path) {
          (path as SVGElement).style.stroke = color;
          (path as SVGElement).setAttribute('stroke', color);
        }
      }
      
      // 获取该连线使用的marker ID并设置箭头颜色
      const pathEl = edge.tagName.toLowerCase() === 'path' ? edge : edge.querySelector('path');
      const markerEnd = pathEl?.getAttribute('marker-end');
      if (markerEnd) {
        const markerId = markerEnd.replace(/url\(#|\)/g, '');
        const marker = svgContainerRef.current?.querySelector(`#${markerId} path`);
        if (marker) {
          (marker as SVGElement).style.fill = color;
          (marker as SVGElement).style.stroke = color;
          (marker as SVGElement).setAttribute('fill', color);
          (marker as SVGElement).setAttribute('stroke', color);
        }
      }
    });
  }, [selectedRainbow]);

  // 应用配色方案到SVG节点（形状）- 设置填充色、描边色（与填充色一致）和描边粗细
  const applyColorScheme = useCallback(() => {
    if (!svgContainerRef.current) return;
    const colors = selectedColorScheme.colors;
    
    // 获取所有节点
    const nodes = svgContainerRef.current.querySelectorAll('.node');
    console.log('[MermaidDesigner] 应用配色, 节点数量:', nodes.length);
    
    nodes.forEach((node, index) => {
      const colorIndex = index % colors.length;
      const fillColor = colors[colorIndex];
      
      // 查找节点内的形状元素，设置填充色、描边色（与填充色一致）和描边粗细
      const shape = node.querySelector('rect, polygon, circle, ellipse, path');
      if (shape) {
        (shape as SVGElement).style.fill = fillColor;
        (shape as SVGElement).setAttribute('fill', fillColor);
        (shape as SVGElement).style.stroke = fillColor;
        (shape as SVGElement).setAttribute('stroke', fillColor);
        (shape as SVGElement).style.strokeWidth = '4';
        (shape as SVGElement).setAttribute('stroke-width', '4');
      }
    });
  }, [selectedColorScheme]);

  // 设置SVG样式，使其能够正常显示
  const setupSvgStyle = useCallback(() => {
    if (!svgContainerRef.current) return;
    
    const svg = svgContainerRef.current.querySelector('svg');
    if (!svg) return;
    
    const svgElement = svg as SVGSVGElement;
    
    // 只设置样式，不修改viewBox
    svgElement.style.overflow = 'visible';
    svgElement.style.maxWidth = 'none';
    svgElement.style.maxHeight = 'none';
  }, []);

  const renderMermaid = useCallback(async () => {
    if (!svgContainerRef.current) return;
    try {
      const id = `mermaid-${Date.now()}`;
      const { svg } = await mermaid.render(id, code);
      svgContainerRef.current.innerHTML = svg;
      setError(null);
      
      // 设置SVG样式
      setTimeout(() => {
        setupSvgStyle();
      }, 50);
    } catch (err) {
      setError(err instanceof Error ? err.message : '渲染失败');
    }
  }, [code, setupSvgStyle]);

  useEffect(() => { renderMermaid(); }, [renderMermaid]);
  
  // 渲染完成后应用彩虹颜色
  useEffect(() => {
    // 延迟执行确保SVG已渲染
    const timer = setTimeout(() => {
      applyRainbowColors();
    }, 100);
    return () => clearTimeout(timer);
  }, [applyRainbowColors]);

  // 当配色方案改变时，应用到节点
  useEffect(() => {
    const timer = setTimeout(() => {
      applyColorScheme();
    }, 100);
    return () => clearTimeout(timer);
  }, [applyColorScheme]);

  // 更新形状工具栏位置
  const updateShapeToolbarPosition = useCallback(() => {
    const selectedNode = nodeSelectionManagerRef.current?.getSelectedNode();
    if (!selectedNode || !svgContainerRef.current) {
      setShapeToolbarPosition(null);
      return;
    }

    const svgElement = svgContainerRef.current.querySelector('svg');
    if (!svgElement) {
      setShapeToolbarPosition(null);
      return;
    }

    const { shape } = selectedNode;
    if (!shape) {
      setShapeToolbarPosition(null);
      return;
    }

    // 使用 getBoundingClientRect 获取形状在屏幕上的实际位置
    const shapeRect = shape.getBoundingClientRect();
    
    // 工具栏位置：形状上方居中
    const toolbarX = shapeRect.left + shapeRect.width / 2;
    const toolbarY = shapeRect.top - 55;
    
    setShapeToolbarPosition({ x: toolbarX, y: toolbarY });
  }, []);

  // 更新选中形状的填充颜色
  const updateSelectedShapeFill = useCallback((color: string) => {
    const selectedNode = nodeSelectionManagerRef.current?.getSelectedNode();
    if (!selectedNode?.shape) return;
    
    const fillColor = color === 'transparent' ? 'none' : color;
    selectedNode.shape.style.fill = fillColor;
    selectedNode.shape.setAttribute('fill', fillColor);
  }, []);

  // 更新选中形状的描边颜色
  const updateSelectedShapeStroke = useCallback((color: string) => {
    const selectedNode = nodeSelectionManagerRef.current?.getSelectedNode();
    if (!selectedNode?.shape) return;
    
    const strokeColor = color === 'transparent' ? 'none' : color;
    selectedNode.shape.style.stroke = strokeColor;
    selectedNode.shape.setAttribute('stroke', strokeColor);
  }, []);

  // 更新选中形状的描边样式（实线/虚线）
  const updateSelectedShapeStrokeStyle = useCallback((style: 'solid' | 'dashed') => {
    const selectedNode = nodeSelectionManagerRef.current?.getSelectedNode();
    if (!selectedNode?.shape) return;
    
    if (style === 'dashed') {
      selectedNode.shape.style.strokeDasharray = '5,5';
      selectedNode.shape.setAttribute('stroke-dasharray', '5,5');
    } else {
      selectedNode.shape.style.strokeDasharray = 'none';
      selectedNode.shape.removeAttribute('stroke-dasharray');
    }
  }, []);

  // 更新选中形状的描边粗细
  const updateSelectedShapeStrokeWidth = useCallback((width: number) => {
    const selectedNode = nodeSelectionManagerRef.current?.getSelectedNode();
    if (!selectedNode?.shape) return;
    
    selectedNode.shape.style.strokeWidth = String(width);
    selectedNode.shape.setAttribute('stroke-width', String(width));
  }, []);

  // 更新选中形状的线条风格
  const updateSelectedShapeLineStyle = useCallback((style: LineStyleType) => {
    const selectedNode = nodeSelectionManagerRef.current?.getSelectedNode();
    if (!selectedNode?.shape || !selectedNode?.element || !svgContainerRef.current) return;
    
    const svgElement = svgContainerRef.current.querySelector('svg') as SVGSVGElement;
    if (!svgElement) return;
    
    const shape = selectedNode.shape;
    const nodeElement = selectedNode.element;
    
    // 获取当前颜色
    const currentStroke = shape.getAttribute('stroke') || shape.style.stroke || '#000000';
    const currentFill = shape.getAttribute('fill') || shape.style.fill || 'none';
    const currentStrokeWidth = parseFloat(shape.getAttribute('stroke-width') || shape.style.strokeWidth || '4');
    
    // 移除之前的 rough 元素
    removeRoughStyle(nodeElement, shape);
    
    if (style === 'plain') {
      // 朴素风格：显示原始形状，恢复透明度
      shape.style.opacity = '1';
      shape.setAttribute('stroke', currentStroke);
      shape.setAttribute('stroke-width', String(currentStrokeWidth));
      if (currentFill) {
        shape.setAttribute('fill', currentFill);
      }
    } else {
      // 艺术或漫画家风格：使用 rough.js
      const roughElement = applyLineStyleToShape(
        svgElement,
        shape,
        style,
        currentStroke,
        currentStrokeWidth,
        currentFill
      );
      
      if (roughElement && shape.parentElement) {
        // 让原始形状透明但保留用于选择框计算
        shape.style.opacity = '0';
        
        // 添加 rough 元素
        roughElement.setAttribute('class', 'rough-shape');
        roughElement.setAttribute('data-original-shape', shape.id || '');
        shape.parentElement.appendChild(roughElement);
      }
    }
  }, []);

  // 更新选中形状的类型
  const updateSelectedShapeType = useCallback(
    (shapeItem: ShapeItem) => {
      const selectedNode = nodeSelectionManagerRef.current?.getSelectedNode();
      if (!selectedNode?.shape || !selectedNode?.element) return;

      const shape = selectedNode.shape;
      const parent = shape.parentElement;
      if (!parent) return;

      // 获取当前形状的边界框
      const bbox = shape.getBBox();
      const { x, y, width, height } = bbox;

      // 获取当前填充和描边颜色
      const currentFill = shape.getAttribute('fill') || shape.style.fill || 'none';
      const currentStroke = shape.getAttribute('stroke') || shape.style.stroke || 'currentColor';
      // 使用当前状态中的描边粗细值
      const currentStrokeWidth = String(strokeWidth);

      // 创建新的形状元素
      let newShape: SVGElement | null = null;

      switch (shapeItem.id) {
        case 'rect':
          newShape = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          newShape.setAttribute('x', String(x));
          newShape.setAttribute('y', String(y));
          newShape.setAttribute('width', String(width));
          newShape.setAttribute('height', String(height));
          break;
        case 'rect-rounded':
          newShape = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          newShape.setAttribute('x', String(x));
          newShape.setAttribute('y', String(y));
          newShape.setAttribute('width', String(width));
          newShape.setAttribute('height', String(height));
          newShape.setAttribute('rx', String(Math.min(width, height) * 0.15));
          newShape.setAttribute('ry', String(Math.min(width, height) * 0.15));
          break;
        case 'circle':
          newShape = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
          newShape.setAttribute('cx', String(x + width / 2));
          newShape.setAttribute('cy', String(y + height / 2));
          newShape.setAttribute('rx', String(width / 2));
          newShape.setAttribute('ry', String(height / 2));
          break;
        case 'rhombus':
          newShape = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
          const rhombusPoints = `${x + width / 2},${y} ${x + width},${y + height / 2} ${x + width / 2},${y + height} ${x},${y + height / 2}`;
          newShape.setAttribute('points', rhombusPoints);
          break;
        case 'hexagon':
          newShape = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
          const hx = width * 0.25;
          const hexPoints = `${x + hx},${y} ${x + width - hx},${y} ${x + width},${y + height / 2} ${x + width - hx},${y + height} ${x + hx},${y + height} ${x},${y + height / 2}`;
          newShape.setAttribute('points', hexPoints);
          break;
        case 'stadium':
          newShape = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          newShape.setAttribute('x', String(x));
          newShape.setAttribute('y', String(y));
          newShape.setAttribute('width', String(width));
          newShape.setAttribute('height', String(height));
          newShape.setAttribute('rx', String(height / 2));
          newShape.setAttribute('ry', String(height / 2));
          break;
        case 'triangle':
          newShape = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
          const triPoints = `${x + width / 2},${y} ${x + width},${y + height} ${x},${y + height}`;
          newShape.setAttribute('points', triPoints);
          break;
        case 'trapezoid':
          newShape = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
          const tx = width * 0.15;
          const trapPoints = `${x + tx},${y} ${x + width - tx},${y} ${x + width},${y + height} ${x},${y + height}`;
          newShape.setAttribute('points', trapPoints);
          break;
        default:
          // 默认使用圆角矩形
          newShape = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          newShape.setAttribute('x', String(x));
          newShape.setAttribute('y', String(y));
          newShape.setAttribute('width', String(width));
          newShape.setAttribute('height', String(height));
          newShape.setAttribute('rx', String(Math.min(width, height) * 0.15));
          newShape.setAttribute('ry', String(Math.min(width, height) * 0.15));
      }

      if (newShape) {
        // 设置样式
        newShape.setAttribute('fill', currentFill);
        newShape.setAttribute('stroke', currentStroke);
        newShape.setAttribute('stroke-width', currentStrokeWidth);
        newShape.style.fill = currentFill;
        newShape.style.stroke = currentStroke;
        newShape.style.strokeWidth = currentStrokeWidth;

        // 替换旧形状
        parent.replaceChild(newShape, shape);

        // 更新选中节点的形状引用
        selectedNode.shape = newShape as SVGGraphicsElement;

        // 刷新选择框
        nodeSelectionManagerRef.current?.refreshSelection();
      }
    },
    [strokeWidth]
  );

  // 当填充颜色改变时实时更新形状
  useEffect(() => {
    if (selectedNodeId && selectedFillColor) {
      updateSelectedShapeFill(selectedFillColor);
    }
  }, [selectedNodeId, selectedFillColor, updateSelectedShapeFill]);

  // 当描边颜色改变时实时更新形状
  useEffect(() => {
    if (selectedNodeId && selectedStrokeColor) {
      updateSelectedShapeStroke(selectedStrokeColor);
    }
  }, [selectedNodeId, selectedStrokeColor, updateSelectedShapeStroke]);

  // 当描边样式改变时实时更新形状
  useEffect(() => {
    if (selectedNodeId) {
      updateSelectedShapeStrokeStyle(strokeStyle);
    }
  }, [selectedNodeId, strokeStyle, updateSelectedShapeStrokeStyle]);

  // 当描边粗细改变时实时更新形状
  useEffect(() => {
    if (selectedNodeId) {
      updateSelectedShapeStrokeWidth(strokeWidth);
    }
  }, [selectedNodeId, strokeWidth, updateSelectedShapeStrokeWidth]);

  // 当线条风格改变时实时更新形状
  useEffect(() => {
    // 同步 lineStyle 到 ref，供回调函数使用
    lineStyleRef.current = lineStyle;
    if (selectedNodeId) {
      updateSelectedShapeLineStyle(lineStyle);
    }
  }, [selectedNodeId, lineStyle, updateSelectedShapeLineStyle]);

  // 当缩放或平移改变时更新工具栏位置
  useEffect(() => {
    if (selectedNodeId) {
      updateShapeToolbarPosition();
    }
  }, [selectedNodeId, scale, translateX, translateY, updateShapeToolbarPosition]);

  // 渲染完成后初始化节点选择管理器
  useEffect(() => {
    if (!svgContainerRef.current || !nodeSelectionManagerRef.current) return;
    const timer = setTimeout(() => {
      nodeSelectionManagerRef.current?.init(
        svgContainerRef.current!,
        () => {
          // 节点大小改变后，重新应用线条风格
          if (lineStyleRef.current !== 'plain') {
            // 延迟执行，确保形状属性已更新
            setTimeout(() => {
              const selectedNode = nodeSelectionManagerRef.current?.getSelectedNode();
              if (selectedNode?.shape && selectedNode?.element && svgContainerRef.current) {
                const svgElement = svgContainerRef.current.querySelector('svg') as SVGSVGElement;
                if (svgElement) {
                  const shape = selectedNode.shape;
                  const currentStroke = shape.getAttribute('stroke') || shape.style.stroke || '#000000';
                  const currentFill = shape.getAttribute('fill') || shape.style.fill || 'none';
                  const currentStrokeWidth = parseFloat(shape.getAttribute('stroke-width') || shape.style.strokeWidth || '4');
                  
                  // 移除旧的 rough 元素
                  const roughElements = selectedNode.element.querySelectorAll('.rough-shape');
                  roughElements.forEach(el => el.remove());
                  
                  // 创建新的 rough 元素
                  const roughElement = applyLineStyleToShape(
                    svgElement,
                    shape,
                    lineStyleRef.current,
                    currentStroke,
                    currentStrokeWidth,
                    currentFill
                  );
                  
                  if (roughElement && shape.parentElement) {
                    shape.style.opacity = '0';
                    roughElement.setAttribute('class', 'rough-shape');
                    shape.parentElement.appendChild(roughElement);
                  }
                }
              }
            }, 0);
          }
        },
        (nodeId) => {
          setSelectedNodeId(nodeId);
          // 选中形状时自动切换到选择工具
          if (nodeId) {
            setActiveTool('select');
            // 更新形状工具栏位置
            updateShapeToolbarPosition();
            // 获取选中形状的填充颜色
            const selectedNode = nodeSelectionManagerRef.current?.getSelectedNode();
            if (selectedNode?.shape) {
              const fillColor = selectedNode.shape.getAttribute('fill') || 
                               selectedNode.shape.style.fill || 
                               'transparent';
              // 处理 none 或空值为 transparent
              const normalizedColor = (!fillColor || fillColor === 'none' || fillColor === '') 
                ? 'transparent' 
                : fillColor;
              setSelectedFillColor(normalizedColor);
              setSelectedBaseColor(normalizedColor);
              setCustomFillColor(normalizedColor === 'transparent' ? '#4A90D9' : normalizedColor);
              
              // 获取选中形状的描边颜色
              const strokeColor = selectedNode.shape.getAttribute('stroke') || 
                                 selectedNode.shape.style.stroke || 
                                 '#000000';
              // 处理 none、空值、currentColor 等特殊值
              let normalizedStrokeColor: string;
              if (!strokeColor || strokeColor === 'none' || strokeColor === '' || strokeColor === 'currentColor') {
                normalizedStrokeColor = 'transparent';
              } else {
                normalizedStrokeColor = strokeColor;
              }
              setSelectedStrokeColor(normalizedStrokeColor);
              setSelectedStrokeBaseColor(normalizedStrokeColor);
              setCustomStrokeColor(normalizedStrokeColor === 'transparent' ? '#4A90D9' : normalizedStrokeColor);
              
              // 获取选中形状的描边样式
              const dashArray = selectedNode.shape.getAttribute('stroke-dasharray') || 
                               selectedNode.shape.style.strokeDasharray || '';
              setStrokeStyle(dashArray && dashArray !== 'none' ? 'dashed' : 'solid');
              
              // 获取选中形状的描边粗细
              const widthStr = selectedNode.shape.getAttribute('stroke-width') || 
                              selectedNode.shape.style.strokeWidth || '2';
              const widthNum = parseFloat(widthStr);
              setStrokeWidth(isNaN(widthNum) ? 2 : widthNum);
            }
          } else {
            setShapeToolbarPosition(null);
          }
        },
        // onResizeStart: 拖动开始时隐藏 rough 元素，显示原始形状
        () => {
          if (lineStyleRef.current !== 'plain') {
            const selectedNode = nodeSelectionManagerRef.current?.getSelectedNode();
            if (selectedNode?.shape && selectedNode?.element) {
              // 移除 rough 元素
              const roughElements = selectedNode.element.querySelectorAll('.rough-shape');
              roughElements.forEach(el => el.remove());
              // 显示原始形状
              selectedNode.shape.style.opacity = '1';
            }
          }
        },
        // onDragStart: 拖动开始时隐藏工具栏
        () => {
          setShapeToolbarPosition(null);
        },
        // onDragEnd: 拖动结束时更新工具栏位置
        () => {
          setTimeout(() => {
            updateShapeToolbarPosition();
          }, 50);
        }
      );
    }, 150);
    return () => clearTimeout(timer);
  }, [code]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (shapeMenuRef.current && !shapeMenuRef.current.contains(target)) setIsShapeMenuOpen(false);
      if (aiPanelRef.current && !aiPanelRef.current.contains(target)) setIsAIPanelOpen(false);
      if (lineDropdownRef.current && !lineDropdownRef.current.contains(target)) setIsLineDropdownOpen(false);
      if (rainbowDropdownRef.current && !rainbowDropdownRef.current.contains(target)) setIsRainbowDropdownOpen(false);
      if (colorPanelRef.current && !colorPanelRef.current.contains(target)) setIsColorPanelOpen(false);
      if (shapeToolbarRef.current && !shapeToolbarRef.current.contains(target)) {
        setIsFontDropdownOpen(false);
        setIsTopShapeMenuOpen(false);
        setIsFillDropdownOpen(false);
        setIsStrokeDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectShape = (shape: ShapeItem) => { setSelectedShape(shape); setIsShapeMenuOpen(false); };
  const handleSelectLine = (line: LineType) => { setSelectedLine(line); setIsLineDropdownOpen(false); };
  const handleSelectRainbow = (scheme: RainbowScheme) => { setSelectedRainbow(scheme); setIsRainbowDropdownOpen(false); };
  const handleSelectColorScheme = (scheme: ColorScheme) => { setSelectedColorScheme(scheme); };

  const handleMouseDown = (e: React.MouseEvent) => {
    // 支持空格键+鼠标拖动 或 拖拽模式
    if (!isDragMode && !isSpacePressed) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY, translateX, translateY };
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    setTranslateX(dragStartRef.current.translateX + e.clientX - dragStartRef.current.x);
    setTranslateY(dragStartRef.current.translateY + e.clientY - dragStartRef.current.y);
  }, [isDragging]);

  const handleMouseUp = useCallback(() => { setIsDragging(false); }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // 空格键监听：按下空格键时启用拖动模式
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isEditingTitle) {
        e.preventDefault();
        setIsSpacePressed(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
        setIsDragging(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isEditingTitle]);

  const handleZoomIn = () => setScale(prev => Math.min(prev * 1.2, 4));
  const handleZoomOut = () => setScale(prev => Math.max(prev / 1.2, 0.25));
  const handleZoomReset = () => { setScale(1); setTranslateX(0); setTranslateY(0); };
  const handleZoomSelect = (level: number) => setScale(level / 100);
  const handleTitleClick = () => { setIsEditingTitle(true); setTimeout(() => titleInputRef.current?.select(), 0); };
  const handleTitleBlur = () => setIsEditingTitle(false);
  const handleTitleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter') setIsEditingTitle(false); };
  const handleSave = () => onSave?.(code, title);
  
  const handleToolClick = (tool: ToolType) => {
    setActiveTool(tool);
    setIsShapeMenuOpen(false);
    setIsAIPanelOpen(false);
    setIsLineDropdownOpen(false);
    setIsRainbowDropdownOpen(false);
    setIsColorPanelOpen(false);
    setIsTemplatePanelOpen(false);
    
    if (tool === 'shape') setIsShapeMenuOpen(true);
    else if (tool === 'ai') setIsAIPanelOpen(true);
    else if (tool === 'line') setIsLineDropdownOpen(true);
    else if (tool === 'rainbow-branch') setIsRainbowDropdownOpen(true);
    else if (tool === 'color') setIsColorPanelOpen(true);
    else if (tool === 'template') setIsTemplatePanelOpen(true);
  };

  // 选择模板
  const handleSelectTemplate = (template: MermaidTemplate) => {
    console.log('[MermaidDesigner] 应用模板:', template.name);
    // 应用模板代码
    setCode(template.code);
    // 重置视图
    setScale(1);
    setTranslateX(0);
    setTranslateY(0);
    // 关闭模板面板
    setIsTemplatePanelOpen(false);
    setSelectedTemplate(null);
  };

  const handleAIGenerate = () => { console.log('AI生成:', aiPrompt, selectedModel); };

  const getRainbowGradient = (colors: string[]) => {
    const stops = colors.map((color, index) => {
      const percent = (index / colors.length) * 100;
      const nextPercent = ((index + 1) / colors.length) * 100;
      return `${color} ${percent}% ${nextPercent}%`;
    }).join(', ');
    return `conic-gradient(${stops})`;
  };


  return (
    <div className="mermaid-designer">
      <div className="mermaid-designer-toolbar">
        <div className="mermaid-designer-toolbar-left">
          {isEditingTitle ? (
            <input ref={titleInputRef} type="text" className="mermaid-designer-title-input" value={title}
              onChange={(e) => setTitle(e.target.value)} onBlur={handleTitleBlur} onKeyDown={handleTitleKeyDown} autoFocus />
          ) : (
            <span className="mermaid-designer-title" onClick={handleTitleClick}>{title}</span>
          )}
        </div>
        <div className="mermaid-designer-toolbar-right">
          <span className="mermaid-designer-btn" onClick={handleSave} title="保存">
            <Icon iconSet="ui" name="save" size={18} />
          </span>
        </div>
      </div>

      <div className="mermaid-designer-content">
        <div className="mermaid-designer-tools">
          <div className="mermaid-designer-ai-wrapper" ref={aiPanelRef}>
            <span className={`mermaid-designer-tool-btn ${activeTool === 'ai' ? 'active' : ''}`} onClick={() => handleToolClick('ai')} title="AI">
              <Icon iconSet="ui" name="sparkles" size={18} />
            </span>
            {isAIPanelOpen && (
              <div className="mermaid-designer-ai-panel">
                <div className="mermaid-designer-ai-panel-header">
                  <span className="mermaid-designer-ai-panel-title">AI 生成</span>
                  <span className="mermaid-designer-ai-panel-close" onClick={() => setIsAIPanelOpen(false)}>
                    <Icon iconSet="ui" name="x" size={14} />
                  </span>
                </div>
                <div className="mermaid-designer-ai-panel-content">
                  <textarea className="mermaid-designer-ai-input" placeholder="描述你想要生成的流程图..."
                    value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} />
                  <div className="mermaid-designer-ai-model-select">
                    <span className="mermaid-designer-ai-model-label">模型:</span>
                    <div className="mermaid-designer-ai-model-dropdown-wrapper">
                      <span className="mermaid-designer-ai-model-trigger" onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}>
                        <span>{selectedModel?.name || '选择模型'}</span>
                        <Icon iconSet="ui" name="chevron-down" size={12} />
                      </span>
                      {isModelDropdownOpen && (
                        <div className="mermaid-designer-ai-model-dropdown">
                          {aiModels.map((model) => (
                            <span key={model.id} className={`mermaid-designer-ai-model-option ${selectedModel?.id === model.id ? 'active' : ''}`}
                              onClick={() => { setSelectedModel(model); setIsModelDropdownOpen(false); }}>
                              {model.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="mermaid-designer-ai-panel-footer">
                  <span className="mermaid-designer-ai-send-btn" onClick={handleAIGenerate}>
                    <Icon iconSet="ui" name="sparkles" size={14} />
                    <span>生成</span>
                  </span>
                </div>
              </div>
            )}
          </div>
          <span className={`mermaid-designer-tool-btn ${activeTool === 'material' ? 'active' : ''}`} onClick={() => handleToolClick('material')} title="素材库">
            <Icon iconSet="ui" name="sprout" size={18} />
          </span>
          <span className={`mermaid-designer-tool-btn ${activeTool === 'template' ? 'active' : ''}`} onClick={() => handleToolClick('template')} title="模板">
            <Icon iconSet="ui" name="templates" size={18} />
          </span>
          <div className="mermaid-designer-tool-divider" />
          <span className={`mermaid-designer-tool-btn ${activeTool === 'select' ? 'active' : ''}`} onClick={() => handleToolClick('select')} title="选择">
            <Icon iconSet="ui" name="mouse-pointer-2" size={18} />
          </span>
          <span className={`mermaid-designer-tool-btn ${activeTool === 'brush' ? 'active' : ''}`} onClick={() => handleToolClick('brush')} title="画笔">
            <Icon iconSet="ui" name="pencil" size={18} />
          </span>
          <span className={`mermaid-designer-tool-btn ${activeTool === 'vector' ? 'active' : ''}`} onClick={() => handleToolClick('vector')} title="矢量绘图">
            <Icon iconSet="ui" name="pen-tool" size={18} />
          </span>
          <span className={`mermaid-designer-tool-btn ${activeTool === 'text' ? 'active' : ''}`} onClick={() => handleToolClick('text')} title="文本">
            <Icon iconSet="ui" name="type-icon" size={18} />
          </span>
          <div className="mermaid-designer-shape-wrapper" ref={shapeMenuRef}>
            <span className={`mermaid-designer-tool-btn ${activeTool === 'shape' ? 'active' : ''}`} onClick={() => handleToolClick('shape')} title="形状">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d={selectedShape.icon} />
              </svg>
            </span>
            {isShapeMenuOpen && (
              <div className="mermaid-designer-shape-dropdown">
                {shapePresets.map((shape) => (
                  <span key={shape.id} className={`mermaid-designer-shape-item ${selectedShape.id === shape.id ? 'active' : ''}`}
                    onClick={() => handleSelectShape(shape)} title={shape.name}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d={shape.icon} />
                    </svg>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="mermaid-designer-line-wrapper" ref={lineDropdownRef}>
            <span className={`mermaid-designer-tool-btn ${activeTool === 'line' ? 'active' : ''}`} onClick={() => handleToolClick('line')} title="连线">
              <Icon iconSet="ui" name={selectedLine.iconName} size={18} />
            </span>
            {isLineDropdownOpen && (
              <div className="mermaid-designer-line-dropdown">
                {lineTypes.map((line) => (
                  <span key={line.id} className={`mermaid-designer-line-item ${selectedLine.id === line.id ? 'active' : ''}`}
                    onClick={() => handleSelectLine(line)} title={line.name}>
                    <Icon iconSet="ui" name={line.iconName} size={20} />
                  </span>
                ))}
              </div>
            )}
          </div>
          <span className={`mermaid-designer-tool-btn ${activeTool === 'image' ? 'active' : ''}`} onClick={() => handleToolClick('image')} title="图片">
            <Icon iconSet="ui" name="image-icon" size={18} />
          </span>
          <div className="mermaid-designer-tool-divider" />
          <div className="mermaid-designer-color-wrapper" ref={colorPanelRef}>
            <span className={`mermaid-designer-tool-btn ${activeTool === 'color' ? 'active' : ''}`} onClick={() => handleToolClick('color')} title="配色">
              <Icon iconSet="ui" name="palette" size={18} />
            </span>
            {isColorPanelOpen && (
              <div className="mermaid-designer-color-panel">
                <div className="mermaid-designer-color-tabs">
                  <span className={`mermaid-designer-color-tab ${colorPanelTab === 'colorful' ? 'active' : ''}`}
                    onClick={() => setColorPanelTab('colorful')}>缤纷</span>
                  <span className={`mermaid-designer-color-tab ${colorPanelTab === 'classic' ? 'active' : ''}`}
                    onClick={() => setColorPanelTab('classic')}>经典</span>
                </div>
                <div className="mermaid-designer-color-content">
                  {(colorPanelTab === 'colorful' ? colorfulSchemes : classicSchemes).map((scheme) => (
                    <div key={scheme.id} className={`mermaid-designer-color-scheme ${selectedColorScheme.id === scheme.id ? 'active' : ''}`}
                      onClick={() => handleSelectColorScheme(scheme)}>
                      <span className="mermaid-designer-color-name">{scheme.name}</span>
                      <div className="mermaid-designer-color-bar">
                        {scheme.colors.map((color, index) => (
                          <span key={index} className="mermaid-designer-color-block" style={{ backgroundColor: color }} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <span className={`mermaid-designer-tool-btn ${activeTool === 'font' ? 'active' : ''}`} onClick={() => handleToolClick('font')} title="字体">
            <Icon iconSet="ui" name="type-icon" size={18} />
          </span>
          <span className={`mermaid-designer-tool-btn ${activeTool === 'branch-width' ? 'active' : ''}`} onClick={() => handleToolClick('branch-width')} title="分支粗细">
            <Icon iconSet="ui" name="equal-approximately" size={18} />
          </span>
          <div className="mermaid-designer-rainbow-wrapper" ref={rainbowDropdownRef}>
            <span className={`mermaid-designer-tool-btn ${activeTool === 'rainbow-branch' ? 'active' : ''}`} onClick={() => handleToolClick('rainbow-branch')} title="彩虹分支">
              <span className="mermaid-designer-rainbow-btn-ring" style={{ background: getRainbowGradient(selectedRainbow.colors) }} />
            </span>
            {isRainbowDropdownOpen && (
              <div className="mermaid-designer-rainbow-dropdown">
                {rainbowSchemes.map((scheme) => (
                  <span key={scheme.id} className={`mermaid-designer-rainbow-item ${selectedRainbow.id === scheme.id ? 'active' : ''}`}
                    onClick={() => handleSelectRainbow(scheme)} title={scheme.name}>
                    <span className="mermaid-designer-rainbow-ring" style={{ background: getRainbowGradient(scheme.colors) }} />
                    <span className="mermaid-designer-rainbow-name">{scheme.name}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>


        <div className="mermaid-designer-preview">
          <div className="mermaid-designer-side-toolbar">
            <span className={`mermaid-designer-side-btn ${isDragMode ? 'active' : ''}`} onClick={() => setIsDragMode(!isDragMode)} title="拖拽模式">
              <Icon iconSet="ui" name="hand" size={16} />
            </span>
            <div className="mermaid-designer-side-divider" />
            <span className="mermaid-designer-side-btn" onClick={handleZoomIn} title="放大">
              <Icon iconSet="ui" name="zoom-in" size={16} />
            </span>
            <span className="mermaid-designer-side-btn" onClick={handleZoomOut} title="缩小">
              <Icon iconSet="ui" name="zoom-out" size={16} />
            </span>
            <div className="mermaid-designer-zoom-menu">
              <span className="mermaid-designer-zoom-label">{Math.round(scale * 100)}%</span>
              <div className="mermaid-designer-zoom-dropdown">
                {zoomLevels.map((level) => (
                  <span key={level} className={`mermaid-designer-zoom-item ${Math.round(scale * 100) === level ? 'active' : ''}`}
                    onClick={() => handleZoomSelect(level)}>{level}%</span>
                ))}
              </div>
            </div>
            <div className="mermaid-designer-side-divider" />
            <span className="mermaid-designer-side-btn" onClick={handleZoomReset} title="重置视图">
              <Icon iconSet="ui" name="maximize-2" size={16} />
            </span>
            <div className="mermaid-designer-side-divider" />
            {/* 画布背景切换 */}
            <div className="mermaid-designer-canvas-bg-wrapper">
              {canvasBackgrounds.map((bg) => (
                <span
                  key={bg.id}
                  className={`mermaid-designer-side-btn ${canvasBackground === bg.id ? 'active' : ''}`}
                  onClick={() => setCanvasBackground(bg.id)}
                  title={bg.name}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <path d={bg.icon} />
                  </svg>
                </span>
              ))}
            </div>
          </div>
          <div
            className={`mermaid-designer-preview-container ${isDragMode || isSpacePressed ? 'drag-mode' : ''} canvas-bg-${canvasBackground}`}
            onMouseDown={handleMouseDown}
            onClick={(e) => {
              // 点击空白区域取消形状选择
              const target = e.target as Element;
              if (!target.closest('.node') && !target.closest('.mermaid-shape-toolbar')) {
                nodeSelectionManagerRef.current?.clearSelection();
              }
            }}
          >
            {error ? (
              <div className="mermaid-designer-error">{error}</div>
            ) : (
              <div ref={svgContainerRef} className="mermaid-designer-svg"
                style={{ transform: `translate(${translateX}px, ${translateY}px) scale(${scale})` }} />
            )}
          </div>
        </div>
      </div>

      {/* 形状选择工具栏 */}
      {selectedNodeId && shapeToolbarPosition && !isSpacePressed && (
        <div
          ref={shapeToolbarRef}
          className="mermaid-shape-toolbar"
          style={{
            left: shapeToolbarPosition.x,
            top: shapeToolbarPosition.y,
          }}
        >
          <div className="mermaid-shape-toolbar-shape-wrapper">
            <span 
              className="mermaid-shape-toolbar-item" 
              title="形状"
              onClick={() => setIsTopShapeMenuOpen(!isTopShapeMenuOpen)}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d={selectedShape.icon} />
              </svg>
              <Icon iconSet="ui" name="chevron-down" size={10} />
            </span>
            {isTopShapeMenuOpen && (
              <div className="mermaid-shape-toolbar-shape-dropdown">
                {shapePresets.map((shape) => (
                  <span
                    key={shape.id}
                    className={`mermaid-shape-toolbar-shape-item ${selectedShape.id === shape.id ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedShape(shape);
                      updateSelectedShapeType(shape);
                      setIsTopShapeMenuOpen(false);
                    }}
                    title={shape.name}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d={shape.icon} />
                    </svg>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="mermaid-shape-toolbar-fill-wrapper">
            <span
              className="mermaid-shape-toolbar-item"
              title="填充"
              onClick={() => setIsFillDropdownOpen(!isFillDropdownOpen)}
            >
              <span
                className={`mermaid-shape-toolbar-fill-icon ${selectedFillColor === 'transparent' ? 'no-fill' : ''}`}
                style={{ backgroundColor: selectedFillColor === 'transparent' ? undefined : selectedFillColor }}
              />
            </span>
            {isFillDropdownOpen && (
              <div className="mermaid-shape-toolbar-fill-dropdown">
                <div className="mermaid-shape-toolbar-fill-section">
                  <span className="mermaid-shape-toolbar-fill-label">预设颜色</span>
                  <div className="mermaid-shape-toolbar-fill-presets">
                    {fillPresetColors.map((color) => (
                      <span
                        key={color}
                        className={`mermaid-shape-toolbar-fill-color ${selectedBaseColor === color ? 'active' : ''} ${color === 'transparent' ? 'transparent-color' : ''}`}
                        style={{ backgroundColor: color === 'transparent' ? undefined : color }}
                        onClick={() => {
                          setSelectedBaseColor(color);
                          // 如果颜色有梯度，默认选择第3个梯度颜色（index 2）
                          if (!noGradientColors.includes(color)) {
                            const gradients = generateColorGradient(color);
                            setSelectedFillColor(gradients[2]);
                          } else {
                            setSelectedFillColor(color);
                          }
                        }}
                        title={color === 'transparent' ? '无填充' : color === '#000000' ? '黑色' : color === '#FFFFFF' ? '白色' : ''}
                      />
                    ))}
                  </div>
                </div>
                {!noGradientColors.includes(selectedBaseColor) && (
                  <div className="mermaid-shape-toolbar-fill-section">
                    <span className="mermaid-shape-toolbar-fill-label">颜色梯度</span>
                    <div className="mermaid-shape-toolbar-fill-gradient">
                      {generateColorGradient(selectedBaseColor).map((color, index) => (
                        <span
                          key={index}
                          className={`mermaid-shape-toolbar-fill-color ${selectedFillColor === color ? 'active' : ''}`}
                          style={{ backgroundColor: color }}
                          onClick={() => setSelectedFillColor(color)}
                        />
                      ))}
                    </div>
                  </div>
                )}
                <div className="mermaid-shape-toolbar-fill-section mermaid-shape-toolbar-fill-custom-section">
                  <span className="mermaid-shape-toolbar-fill-label">自定义颜色</span>
                  <div className="mermaid-shape-toolbar-fill-custom">
                    <span
                      ref={customColorBtnRef}
                      className="mermaid-shape-toolbar-fill-custom-btn"
                      style={{ backgroundColor: customFillColor }}
                      onClick={() => {
                        if (customColorBtnRef.current) {
                          setColorPickerAnchorRect(customColorBtnRef.current.getBoundingClientRect());
                        }
                        setIsColorPickerOpen(!isColorPickerOpen);
                      }}
                    />
                    <span className="mermaid-shape-toolbar-fill-hex">{selectedFillColor.toUpperCase()}</span>
                  </div>
                  {isColorPickerOpen && (
                    <ColorPicker
                      initialColor={selectedFillColor}
                      anchorRect={colorPickerAnchorRect}
                      onColorChange={(color) => {
                        setSelectedFillColor(color);
                        setCustomFillColor(color);
                        // 更新基础颜色，使上方梯度区域显示自定义颜色的梯度
                        setSelectedBaseColor(color);
                      }}
                      onColorConfirm={(color) => {
                        setSelectedFillColor(color);
                        setCustomFillColor(color);
                        setSelectedBaseColor(color);
                        setIsColorPickerOpen(false);
                      }}
                      onCancel={() => {
                        setIsColorPickerOpen(false);
                      }}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="mermaid-shape-toolbar-stroke-wrapper">
            <span
              className="mermaid-shape-toolbar-item"
              title="描边"
              onClick={() => setIsStrokeDropdownOpen(!isStrokeDropdownOpen)}
            >
              <span
                className={`mermaid-shape-toolbar-stroke-icon ${selectedStrokeColor === 'transparent' ? 'no-stroke' : ''}`}
                style={{ borderColor: selectedStrokeColor === 'transparent' ? undefined : selectedStrokeColor }}
              />
            </span>
            {isStrokeDropdownOpen && (
              <div className="mermaid-shape-toolbar-stroke-dropdown">
                <div className="mermaid-shape-toolbar-stroke-section">
                  <span className="mermaid-shape-toolbar-stroke-label">描边样式</span>
                  <div className="mermaid-shape-toolbar-stroke-styles">
                    <span
                      className={`mermaid-shape-toolbar-stroke-style-item ${strokeStyle === 'solid' ? 'active' : ''}`}
                      onClick={() => setStrokeStyle('solid')}
                      title="实线"
                    >
                      <svg width="32" height="16" viewBox="0 0 32 16">
                        <line x1="2" y1="8" x2="30" y2="8" stroke="currentColor" strokeWidth="2" />
                      </svg>
                    </span>
                    <span
                      className={`mermaid-shape-toolbar-stroke-style-item ${strokeStyle === 'dashed' ? 'active' : ''}`}
                      onClick={() => setStrokeStyle('dashed')}
                      title="虚线"
                    >
                      <svg width="32" height="16" viewBox="0 0 32 16">
                        <line x1="2" y1="8" x2="30" y2="8" stroke="currentColor" strokeWidth="2" strokeDasharray="4,3" />
                      </svg>
                    </span>
                  </div>
                </div>
                <div className="mermaid-shape-toolbar-stroke-section">
                  <span className="mermaid-shape-toolbar-stroke-label">描边粗细</span>
                  <div className="mermaid-shape-toolbar-stroke-width">
                    <input
                      type="range"
                      min="1"
                      max="10"
                      step="0.5"
                      value={strokeWidth}
                      onChange={(e) => setStrokeWidth(parseFloat(e.target.value))}
                      className="mermaid-shape-toolbar-stroke-slider"
                    />
                    <span className="mermaid-shape-toolbar-stroke-width-value">{strokeWidth}px</span>
                  </div>
                </div>
                <div className="mermaid-shape-toolbar-stroke-section">
                  <span className="mermaid-shape-toolbar-stroke-label">预设颜色</span>
                  <div className="mermaid-shape-toolbar-stroke-presets">
                    {fillPresetColors.map((color) => (
                      <span
                        key={color}
                        className={`mermaid-shape-toolbar-stroke-color ${selectedStrokeBaseColor === color ? 'active' : ''} ${color === 'transparent' ? 'transparent-color' : ''}`}
                        style={{ backgroundColor: color === 'transparent' ? undefined : color }}
                        onClick={() => {
                          setSelectedStrokeBaseColor(color);
                          if (!noGradientColors.includes(color)) {
                            const gradients = generateColorGradient(color);
                            setSelectedStrokeColor(gradients[2]);
                          } else {
                            setSelectedStrokeColor(color);
                          }
                        }}
                        title={color === 'transparent' ? '无描边' : color === '#000000' ? '黑色' : color === '#FFFFFF' ? '白色' : ''}
                      />
                    ))}
                  </div>
                </div>
                {!noGradientColors.includes(selectedStrokeBaseColor) && (
                  <div className="mermaid-shape-toolbar-stroke-section">
                    <span className="mermaid-shape-toolbar-stroke-label">颜色梯度</span>
                    <div className="mermaid-shape-toolbar-stroke-gradient">
                      {generateColorGradient(selectedStrokeBaseColor).map((color, index) => (
                        <span
                          key={index}
                          className={`mermaid-shape-toolbar-stroke-color ${selectedStrokeColor === color ? 'active' : ''}`}
                          style={{ backgroundColor: color }}
                          onClick={() => setSelectedStrokeColor(color)}
                        />
                      ))}
                    </div>
                  </div>
                )}
                <div className="mermaid-shape-toolbar-stroke-section mermaid-shape-toolbar-stroke-custom-section">
                  <span className="mermaid-shape-toolbar-stroke-label">自定义颜色</span>
                  <div className="mermaid-shape-toolbar-stroke-custom">
                    <span
                      ref={customStrokeColorBtnRef}
                      className="mermaid-shape-toolbar-stroke-custom-btn"
                      style={{ backgroundColor: customStrokeColor }}
                      onClick={() => {
                        if (customStrokeColorBtnRef.current) {
                          setStrokeColorPickerAnchorRect(customStrokeColorBtnRef.current.getBoundingClientRect());
                        }
                        setIsStrokeColorPickerOpen(!isStrokeColorPickerOpen);
                      }}
                    />
                    <span className="mermaid-shape-toolbar-stroke-hex">{selectedStrokeColor.toUpperCase()}</span>
                  </div>
                  {isStrokeColorPickerOpen && (
                    <ColorPicker
                      initialColor={selectedStrokeColor}
                      anchorRect={strokeColorPickerAnchorRect}
                      onColorChange={(color) => {
                        setSelectedStrokeColor(color);
                        setCustomStrokeColor(color);
                        setSelectedStrokeBaseColor(color);
                      }}
                      onColorConfirm={(color) => {
                        setSelectedStrokeColor(color);
                        setCustomStrokeColor(color);
                        setSelectedStrokeBaseColor(color);
                        setIsStrokeColorPickerOpen(false);
                      }}
                      onCancel={() => {
                        setIsStrokeColorPickerOpen(false);
                      }}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="mermaid-shape-toolbar-divider" />
          <div className="mermaid-shape-toolbar-font-wrapper">
            <span
              className="mermaid-shape-toolbar-item"
              title="字体"
              onClick={() => setIsFontDropdownOpen(!isFontDropdownOpen)}
            >
              <span className="mermaid-shape-toolbar-font-size">14px</span>
              <Icon iconSet="ui" name="chevron-down" size={12} />
            </span>
            {isFontDropdownOpen && (
              <div className="mermaid-shape-toolbar-font-dropdown">
                <span className="mermaid-shape-toolbar-font-item" title="粗体">
                  <Icon iconSet="ui" name="bold" size={16} />
                </span>
                <span className="mermaid-shape-toolbar-font-item" title="斜体">
                  <Icon iconSet="ui" name="italic" size={16} />
                </span>
                <span className="mermaid-shape-toolbar-font-item" title="下划线">
                  <Icon iconSet="ui" name="underline" size={16} />
                </span>
                <span className="mermaid-shape-toolbar-font-item" title="删除线">
                  <Icon iconSet="ui" name="strikethrough" size={16} />
                </span>
              </div>
            )}
          </div>
          <div className="mermaid-shape-toolbar-divider" />
          <span className="mermaid-shape-toolbar-item" title="链接">
            <Icon iconSet="ui" name="link-2" size={16} />
          </span>
          <span className="mermaid-shape-toolbar-item" title="标签">
            <Icon iconSet="ui" name="tag" size={16} />
          </span>
          <span
            className="mermaid-shape-toolbar-item"
            title="设置"
            onClick={() => setIsStylePanelOpen(!isStylePanelOpen)}
          >
            <Icon iconSet="ui" name="settings-2" size={16} />
          </span>
        </div>
      )}

      {/* 右侧样式面板 */}
      {isStylePanelOpen && selectedNodeId && (
        <div className="mermaid-style-panel">
          <div className="mermaid-style-panel-header">
            <span className="mermaid-style-panel-title">样式</span>
            <span className="mermaid-style-panel-close" onClick={() => setIsStylePanelOpen(false)}>
              <Icon iconSet="ui" name="x" size={14} />
            </span>
          </div>
          <div className="mermaid-style-panel-content">
            {/* 形状分组 */}
            <div className="mermaid-style-panel-section">
              <div className="mermaid-style-panel-section-header">
                <div
                  className="mermaid-style-panel-section-left"
                  onClick={() => setIsShapeSectionExpanded(!isShapeSectionExpanded)}
                >
                  <Icon iconSet="ui" name={isShapeSectionExpanded ? 'chevron-down' : 'chevron-right'} size={14} />
                  <span className="mermaid-style-panel-section-title">形状</span>
                </div>
                <div className="mermaid-style-panel-shape-menu-wrapper">
                  <span
                    className="mermaid-style-panel-shape-trigger"
                    onClick={() => setIsStylePanelShapeMenuOpen(!isStylePanelShapeMenuOpen)}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d={selectedShape.icon} />
                    </svg>
                    <Icon iconSet="ui" name="chevron-down" size={10} />
                  </span>
                  {isStylePanelShapeMenuOpen && (
                    <div className="mermaid-style-panel-shape-dropdown">
                      {shapePresets.map((shape) => (
                        <span
                          key={shape.id}
                          className={`mermaid-style-panel-shape-option ${selectedShape.id === shape.id ? 'active' : ''}`}
                          onClick={() => {
                            setSelectedShape(shape);
                            updateSelectedShapeType(shape);
                            setIsStylePanelShapeMenuOpen(false);
                          }}
                          title={shape.name}
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d={shape.icon} />
                          </svg>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {isShapeSectionExpanded && (
                <div className="mermaid-style-panel-section-content">
                  {/* 填充 */}
                  <div className="mermaid-style-panel-row">
                    <span className="mermaid-style-panel-label">填充</span>
                    <div className="mermaid-style-panel-fill-row">
                      {/* 填充颜色 */}
                      <span
                        className={`mermaid-style-panel-fill-color ${selectedFillColor === 'transparent' ? 'no-fill' : ''}`}
                        style={{ backgroundColor: selectedFillColor === 'transparent' ? undefined : selectedFillColor }}
                      />
                    </div>
                  </div>
                  {/* 描边颜色 */}
                  <div className="mermaid-style-panel-row">
                    <span className="mermaid-style-panel-label">描边</span>
                    <div className="mermaid-style-panel-stroke-color-wrapper">
                      <span
                        className={`mermaid-style-panel-stroke-color-block ${selectedStrokeColor === 'transparent' ? 'no-fill' : ''}`}
                        style={{ backgroundColor: selectedStrokeColor === 'transparent' ? undefined : selectedStrokeColor }}
                        onClick={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setStylePanelStrokePickerAnchorRect(rect);
                          setIsStylePanelStrokePickerOpen(!isStylePanelStrokePickerOpen);
                        }}
                      />
                      {isStylePanelStrokePickerOpen && (
                        <ColorPicker
                          initialColor={selectedStrokeColor === 'transparent' ? '#000000' : selectedStrokeColor}
                          onColorChange={(color: string) => {
                            setSelectedStrokeColor(color);
                            setSelectedStrokeBaseColor(color);
                          }}
                          onCancel={() => setIsStylePanelStrokePickerOpen(false)}
                          anchorRect={stylePanelStrokePickerAnchorRect}
                        />
                      )}
                    </div>
                  </div>
                  {/* 描边粗细 */}
                  <div className="mermaid-style-panel-row">
                    <span className="mermaid-style-panel-label">粗细</span>
                    <div className="mermaid-style-panel-stroke-width">
                      <input
                        type="range"
                        min="1"
                        max="10"
                        step="0.5"
                        value={strokeWidth}
                        onChange={(e) => setStrokeWidth(parseFloat(e.target.value))}
                        className="mermaid-style-panel-slider"
                      />
                      <span className="mermaid-style-panel-stroke-value">{strokeWidth}px</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
            {/* 线条风格分组 */}
            <div className="mermaid-style-panel-section">
              <div className="mermaid-style-panel-section-header">
                <div
                  className="mermaid-style-panel-section-left"
                  onClick={() => setIsLineStyleSectionExpanded(!isLineStyleSectionExpanded)}
                >
                  <Icon iconSet="ui" name={isLineStyleSectionExpanded ? 'chevron-down' : 'chevron-right'} size={14} />
                  <span className="mermaid-style-panel-section-title">线条风格</span>
                </div>
              </div>
              {isLineStyleSectionExpanded && (
                <div className="mermaid-style-panel-section-content">
                  <div className="mermaid-style-panel-line-styles">
                    {lineStyles.map((style) => (
                      <div
                        key={style.id}
                        className={`mermaid-style-panel-line-style-item ${lineStyle === style.id ? 'active' : ''}`}
                        onClick={() => setLineStyle(style.id)}
                        title={style.description}
                      >
                        <div className="mermaid-style-panel-line-style-preview">
                          <svg width="48" height="24" viewBox="0 0 48 24">
                            {style.id === 'plain' && (
                              <rect x="4" y="4" width="40" height="16" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
                            )}
                            {style.id === 'artistic' && (
                              <path d="M4 6 Q6 4 8 6 L40 6 Q42 4 44 6 L44 18 Q42 20 40 18 L8 18 Q6 20 4 18 Z" fill="none" stroke="currentColor" strokeWidth="1.5" />
                            )}
                            {style.id === 'comic' && (
                              <path d="M5 5 Q7 3 10 6 L38 5 Q42 3 43 7 L44 17 Q43 21 39 19 L9 20 Q5 22 4 17 Z" fill="none" stroke="currentColor" strokeWidth="2" />
                            )}
                          </svg>
                        </div>
                        <span className="mermaid-style-panel-line-style-name">{style.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {/* 结构分组 */}
            <div className="mermaid-style-panel-section">
              <div className="mermaid-style-panel-section-header">
                <div
                  className="mermaid-style-panel-section-left"
                  onClick={() => setIsStructureSectionExpanded(!isStructureSectionExpanded)}
                >
                  <Icon iconSet="ui" name={isStructureSectionExpanded ? 'chevron-down' : 'chevron-right'} size={14} />
                  <span className="mermaid-style-panel-section-title">结构</span>
                </div>
                <div className="mermaid-style-panel-structure-menu-wrapper">
                  <span
                    className="mermaid-style-panel-structure-trigger"
                    onClick={() => setIsStructureDropdownOpen(!isStructureDropdownOpen)}
                  >
                    <svg
                      width="20"
                      height="14"
                      viewBox={selectedStructure.viewBox || '0 0 24 24'}
                      fill={selectedStructure.viewBox ? 'currentColor' : 'none'}
                      stroke={selectedStructure.viewBox ? 'none' : 'currentColor'}
                      strokeWidth={selectedStructure.viewBox ? undefined : 1.5}
                    >
                      <path d={selectedStructure.icon} />
                    </svg>
                    <Icon iconSet="ui" name="chevron-down" size={10} />
                  </span>
                  {isStructureDropdownOpen && (
                    <div className="mermaid-style-panel-structure-dropdown">
                      {structurePresets.map((structure) => (
                        <span
                          key={structure.id}
                          className={`mermaid-style-panel-structure-option ${selectedStructure.id === structure.id ? 'active' : ''}`}
                          onClick={() => {
                            setSelectedStructure(structure);
                            setIsStructureDropdownOpen(false);
                          }}
                          title={structure.description}
                        >
                          <svg
                            width="24"
                            height="14"
                            viewBox={structure.viewBox || '0 0 24 24'}
                            fill={structure.viewBox ? 'currentColor' : 'none'}
                            stroke={structure.viewBox ? 'none' : 'currentColor'}
                            strokeWidth={structure.viewBox ? undefined : 1.5}
                          >
                            <path d={structure.icon} />
                          </svg>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {isStructureSectionExpanded && (
                <div className="mermaid-style-panel-section-content">
                  <div className="mermaid-style-panel-structure-grid">
                    {structurePresets.map((structure) => (
                      <div
                        key={structure.id}
                        className={`mermaid-style-panel-structure-item ${selectedStructure.id === structure.id ? 'active' : ''}`}
                        onClick={() => setSelectedStructure(structure)}
                        title={structure.name}
                      >
                        <svg
                          width="36"
                          height="22"
                          viewBox={structure.viewBox || '0 0 24 24'}
                          fill={structure.viewBox ? 'currentColor' : 'none'}
                          stroke={structure.viewBox ? 'none' : 'currentColor'}
                          strokeWidth={structure.viewBox ? undefined : 1.5}
                        >
                          <path d={structure.icon} />
                        </svg>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {/* 背景风格分组 */}
            <div className="mermaid-style-panel-section">
              <div className="mermaid-style-panel-section-header">
                <div
                  className="mermaid-style-panel-section-left"
                  onClick={() => setIsBackgroundSectionExpanded(!isBackgroundSectionExpanded)}
                >
                  <Icon iconSet="ui" name={isBackgroundSectionExpanded ? 'chevron-down' : 'chevron-right'} size={14} />
                  <span className="mermaid-style-panel-section-title">背景风格</span>
                </div>
              </div>
              {isBackgroundSectionExpanded && (
                <div className="mermaid-style-panel-section-content">
                  <div className="mermaid-style-panel-background-grid">
                    {canvasBackgrounds.map((bg) => (
                      <div
                        key={bg.id}
                        className={`mermaid-style-panel-background-item ${canvasBackground === bg.id ? 'active' : ''}`}
                        onClick={() => setCanvasBackground(bg.id)}
                        title={bg.name}
                      >
                        <div className="mermaid-style-panel-background-preview">
                          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round">
                            <path d={bg.icon} />
                          </svg>
                        </div>
                        <span className="mermaid-style-panel-background-name">{bg.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 模板弹窗 */}
      {isTemplatePanelOpen && (
        <div className="mermaid-designer-template-modal-overlay" onClick={() => setIsTemplatePanelOpen(false)}>
          <div className="mermaid-designer-template-modal" onClick={(e) => e.stopPropagation()}>
            <div className="mermaid-designer-template-modal-header">
              <span className="mermaid-designer-template-modal-title">选择模板</span>
              <span className="mermaid-designer-template-modal-close" onClick={() => setIsTemplatePanelOpen(false)}>
                <Icon iconSet="ui" name="close" size={18} />
              </span>
            </div>
            <div className="mermaid-designer-template-main-tabs">
              <span
                className={`mermaid-designer-template-main-tab ${templatePanelTab === 'preset' ? 'active' : ''}`}
                onClick={() => setTemplatePanelTab('preset')}
              >
                预设模板
              </span>
              <span
                className={`mermaid-designer-template-main-tab ${templatePanelTab === 'my' ? 'active' : ''}`}
                onClick={() => setTemplatePanelTab('my')}
              >
                我的模板
              </span>
            </div>
            <div className="mermaid-designer-template-modal-body">
              {templatePanelTab === 'preset' ? (
                <>
                  <div className="mermaid-designer-template-sidebar">
                    {mermaidTemplateCategories.map((category) => (
                      <span
                        key={category.id}
                        className={`mermaid-designer-template-category ${selectedTemplateCategory.id === category.id ? 'active' : ''}`}
                        onClick={() => setSelectedTemplateCategory(category)}
                      >
                        {category.name}
                      </span>
                    ))}
                  </div>
                  <div className="mermaid-designer-template-list">
                    {selectedTemplateCategory.templates.map((template, index) => (
                      <div
                        key={template.id}
                        className={`mermaid-designer-template-card ${selectedTemplate?.id === template.id ? 'selected' : ''}`}
                        onClick={() => setSelectedTemplate(template)}
                      >
                        <div className="mermaid-designer-template-card-preview">
                          <TemplatePreview code={template.code} id={template.id} index={index} />
                        </div>
                        <div className="mermaid-designer-template-card-info">
                          <div className="mermaid-designer-template-card-text">
                            <span className="mermaid-designer-template-card-name">{template.name}</span>
                            <span className="mermaid-designer-template-card-desc">{template.description}</span>
                          </div>
                          <div
                            className="mermaid-designer-template-card-use"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectTemplate(template);
                            }}
                          >
                            使用
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="mermaid-designer-template-list mermaid-designer-template-list-full">
                  {myTemplates.length > 0 ? (
                    myTemplates.map((template, index) => (
                      <div
                        key={template.id}
                        className={`mermaid-designer-template-card ${selectedTemplate?.id === template.id ? 'selected' : ''}`}
                        onClick={() => setSelectedTemplate(template)}
                      >
                        <div className="mermaid-designer-template-card-preview">
                          <TemplatePreview code={template.code} id={template.id} index={index} />
                        </div>
                        <div className="mermaid-designer-template-card-info">
                          <div className="mermaid-designer-template-card-text">
                            <span className="mermaid-designer-template-card-name">{template.name}</span>
                            <span className="mermaid-designer-template-card-desc">{template.description}</span>
                          </div>
                          <div
                            className="mermaid-designer-template-card-use"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectTemplate(template);
                            }}
                          >
                            使用
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="mermaid-designer-template-empty">
                      <Icon iconSet="ui" name="templates" size={48} />
                      <span className="mermaid-designer-template-empty-text">暂无自定义模板</span>
                      <span className="mermaid-designer-template-empty-hint">保存当前流程图为模板后将显示在这里</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
