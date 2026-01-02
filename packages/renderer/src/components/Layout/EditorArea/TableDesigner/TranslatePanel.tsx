/**
 * 翻译面板组件
 * 功能：提供中英文互译功能，支持语言选择和实时翻译
 * 描述：右侧弹出面板，包含语言选择、输入框和翻译结果
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Icon } from '../../../Icons/Icon';
import { getOllamaTranslateService, SUPPORTED_LANGUAGES } from '../../../../services/translate';
import './TranslatePanel.scss';

/** 语言选项 */
interface LanguageOption {
  value: string;
  label: string;
}

/** 翻译面板属性 */
export interface TranslatePanelProps {
  /** 是否显示 */
  visible: boolean;
  /** 初始文本 */
  initialText?: string;
  /** 位置 */
  position: { x: number; y: number };
  /** 关闭回调 */
  onClose: () => void;
  /** 应用翻译结果回调 */
  onApply?: (translatedText: string) => void;
}

/** 语言选项列表 */
const LANGUAGE_OPTIONS: LanguageOption[] = [
  { value: SUPPORTED_LANGUAGES.CHINESE, label: '中文' },
  { value: SUPPORTED_LANGUAGES.ENGLISH, label: 'English' },
  { value: SUPPORTED_LANGUAGES.JAPANESE, label: '日本語' },
  { value: SUPPORTED_LANGUAGES.KOREAN, label: '한국어' },
  { value: SUPPORTED_LANGUAGES.FRENCH, label: 'Français' },
  { value: SUPPORTED_LANGUAGES.GERMAN, label: 'Deutsch' },
  { value: SUPPORTED_LANGUAGES.SPANISH, label: 'Español' },
  { value: SUPPORTED_LANGUAGES.RUSSIAN, label: 'Русский' },
];

export const TranslatePanel: React.FC<TranslatePanelProps> = ({
  visible,
  initialText = '',
  position,
  onClose,
  onApply,
}) => {
  const [sourceText, setSourceText] = useState(initialText);
  const [targetText, setTargetText] = useState('');
  const [sourceLang, setSourceLang] = useState<string>(SUPPORTED_LANGUAGES.AUTO);
  const [targetLang, setTargetLang] = useState<string>(SUPPORTED_LANGUAGES.ENGLISH);
  const [isTranslating, setIsTranslating] = useState(false);
  const [error, setError] = useState<string>('');
  const [showSourceDropdown, setShowSourceDropdown] = useState(false);
  const [showTargetDropdown, setShowTargetDropdown] = useState(false);
  
  const panelRef = useRef<HTMLDivElement>(null);
  const sourceDropdownRef = useRef<HTMLDivElement>(null);
  const targetDropdownRef = useRef<HTMLDivElement>(null);
  const [adjustedPosition, setAdjustedPosition] = useState(position);

  // 计算调整后的位置，确保面板不超出视口
  useEffect(() => {
    if (visible && panelRef.current) {
      const panelWidth = 320; // 面板宽度
      const panelHeight = panelRef.current.offsetHeight || 400;
      const padding = 20; // 边距
      
      let newX = position.x;
      let newY = position.y;
      
      // 检查右边界
      if (newX + panelWidth > window.innerWidth - padding) {
        newX = window.innerWidth - panelWidth - padding;
      }
      
      // 检查左边界
      if (newX < padding) {
        newX = padding;
      }
      
      // 检查下边界
      if (newY + panelHeight > window.innerHeight - padding) {
        newY = window.innerHeight - panelHeight - padding;
      }
      
      // 检查上边界
      if (newY < padding) {
        newY = padding;
      }
      
      setAdjustedPosition({ x: newX, y: newY });
    }
  }, [visible, position]);

  // 初始化文本
  useEffect(() => {
    if (visible && initialText) {
      setSourceText(initialText);
      setTargetText('');
      setError('');
      
      // 自动检测语言方向
      const hasChinese = /[\u4e00-\u9fa5]/.test(initialText);
      if (hasChinese) {
        setSourceLang(SUPPORTED_LANGUAGES.CHINESE);
        setTargetLang(SUPPORTED_LANGUAGES.ENGLISH);
      } else {
        setSourceLang(SUPPORTED_LANGUAGES.ENGLISH);
        setTargetLang(SUPPORTED_LANGUAGES.CHINESE);
      }
    }
  }, [visible, initialText]);

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (visible) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [visible, onClose]);

  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (sourceDropdownRef.current && !sourceDropdownRef.current.contains(event.target as Node)) {
        setShowSourceDropdown(false);
      }
      if (targetDropdownRef.current && !targetDropdownRef.current.contains(event.target as Node)) {
        setShowTargetDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 执行翻译
  const handleTranslate = useCallback(async () => {
    if (!sourceText.trim()) return;
    
    setIsTranslating(true);
    setError('');
    
    try {
      const translateService = getOllamaTranslateService();
      
      // 检查服务是否可用
      const isHealthy = await translateService.checkHealth();
      if (!isHealthy) {
        setError('Ollama 服务不可用，请确保 Ollama 正在运行');
        return;
      }
      
      // 检查模型是否存在
      const hasModel = await translateService.hasTranslateModel();
      if (!hasModel) {
        setError('翻译模型未安装，请先下载模型');
        return;
      }
      
      const result = await translateService.translate({
        text: sourceText,
        targetLang,
        sourceLang: sourceLang === SUPPORTED_LANGUAGES.AUTO ? undefined : sourceLang,
      });
      
      setTargetText(result.translatedText);
    } catch (err) {
      setError('翻译失败，请重试');
      console.error('[TranslatePanel] 翻译错误:', err);
    } finally {
      setIsTranslating(false);
    }
  }, [sourceText, sourceLang, targetLang]);

  // 交换语言
  const handleSwapLanguages = useCallback(() => {
    if (sourceLang === SUPPORTED_LANGUAGES.AUTO) return;
    
    const tempLang = sourceLang;
    setSourceLang(targetLang);
    setTargetLang(tempLang);
    
    // 同时交换文本
    const tempText = sourceText;
    setSourceText(targetText);
    setTargetText(tempText);
  }, [sourceLang, targetLang, sourceText, targetText]);

  // 应用翻译结果
  const handleApply = useCallback(() => {
    if (targetText && onApply) {
      onApply(targetText);
      onClose();
    }
  }, [targetText, onApply, onClose]);

  // 获取语言标签
  const getLanguageLabel = (value: string): string => {
    if (value === SUPPORTED_LANGUAGES.AUTO) return '自动检测';
    return LANGUAGE_OPTIONS.find(opt => opt.value === value)?.label || value;
  };

  if (!visible) return null;

  return (
    <div
      ref={panelRef}
      className="translate-panel"
      style={{
        left: adjustedPosition.x,
        top: adjustedPosition.y,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* 头部 */}
      <div className="translate-panel-header">
        <span className="translate-panel-title">翻译</span>
        <span className="translate-panel-close" onClick={onClose}>
          <Icon name="close" size={14} />
        </span>
      </div>

      {/* 语言选择栏 */}
      <div className="translate-panel-lang-bar">
        {/* 源语言 */}
        <div className="translate-panel-lang-select" ref={sourceDropdownRef}>
          <span
            className="translate-panel-lang-trigger"
            onClick={() => setShowSourceDropdown(!showSourceDropdown)}
          >
            <span>{getLanguageLabel(sourceLang)}</span>
            <Icon name="chevron-down" size={12} />
          </span>
          {showSourceDropdown && (
            <div className="translate-panel-lang-dropdown">
              <div
                className={`translate-panel-lang-option ${sourceLang === SUPPORTED_LANGUAGES.AUTO ? 'selected' : ''}`}
                onClick={() => { setSourceLang(SUPPORTED_LANGUAGES.AUTO); setShowSourceDropdown(false); }}
              >
                自动检测
              </div>
              {LANGUAGE_OPTIONS.map(opt => (
                <div
                  key={opt.value}
                  className={`translate-panel-lang-option ${sourceLang === opt.value ? 'selected' : ''}`}
                  onClick={() => { setSourceLang(opt.value); setShowSourceDropdown(false); }}
                >
                  {opt.label}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 交换按钮 */}
        <span
          className={`translate-panel-swap ${sourceLang === SUPPORTED_LANGUAGES.AUTO ? 'disabled' : ''}`}
          onClick={handleSwapLanguages}
          title="交换语言"
        >
          <Icon name="refresh" size={14} />
        </span>

        {/* 目标语言 */}
        <div className="translate-panel-lang-select" ref={targetDropdownRef}>
          <span
            className="translate-panel-lang-trigger"
            onClick={() => setShowTargetDropdown(!showTargetDropdown)}
          >
            <span>{getLanguageLabel(targetLang)}</span>
            <Icon name="chevron-down" size={12} />
          </span>
          {showTargetDropdown && (
            <div className="translate-panel-lang-dropdown">
              {LANGUAGE_OPTIONS.map(opt => (
                <div
                  key={opt.value}
                  className={`translate-panel-lang-option ${targetLang === opt.value ? 'selected' : ''}`}
                  onClick={() => { setTargetLang(opt.value); setShowTargetDropdown(false); }}
                >
                  {opt.label}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 滚动内容区域 */}
      <div className="translate-panel-body">
        {/* 源文本输入 */}
        <div className="translate-panel-input-area">
          <textarea
            className="translate-panel-textarea"
            value={sourceText}
            onChange={(e) => setSourceText(e.target.value)}
            placeholder="输入要翻译的文本..."
          />
        </div>

        {/* 翻译按钮 */}
        <div className="translate-panel-actions">
          <span
            className={`translate-panel-btn translate-panel-btn-primary ${isTranslating ? 'loading' : ''}`}
            onClick={handleTranslate}
          >
            {isTranslating ? '翻译中...' : '翻译'}
          </span>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="translate-panel-error">
            <Icon name="alert-circle" size={14} />
            <span>{error}</span>
          </div>
        )}

        {/* 翻译结果 */}
        {targetText && (
          <div className="translate-panel-result-area">
            <div className="translate-panel-result-header">
              <span>翻译结果</span>
            </div>
            <div className="translate-panel-result">
              {targetText}
            </div>
            <div className="translate-panel-result-actions">
              <span className="translate-panel-btn" onClick={handleApply}>
                应用
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TranslatePanel;
