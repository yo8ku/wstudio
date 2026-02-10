/**
 * Skills 市场视图组件
 * 功能：展示和搜索 Skills 技能包市场
 * 支持关键字搜索和 AI 语义搜索
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { skillsMarketService, getAuthorAvatarUrl, type SkillInfo, type SkillSearchResponse } from '../../../../services/SkillsMarketService';
import { useExplorerStore } from '../../../../stores/explorerStore';
import { Icon } from '../../../Icons/Icon';
import './SkillsMarketView.scss';

/** 排序方式 */
type SortBy = 'stars' | 'recent';

/** 视图模式 */
type ViewMode = 'market' | 'installed' | 'local';

/** 本地 Skill 信息 */
interface LocalSkillInfo {
  name: string;
  path: string;
  isInstalled: boolean; // true: 从市场安装, false: 本地创建
  description?: string;
  githubUrl?: string;
  /** 来自 package.json 的详情信息 */
  packageInfo?: {
    version?: string;
    author?: string;
    source?: string;
    stars?: number;
    downloads?: number;
    tags?: string[];
    createdAt?: string | number;
    updatedAt?: string | number;
    installedAt?: number;
  };
}

export const SkillsMarketView: React.FC = () => {
  // 视图模式状态
  const [viewMode, setViewMode] = useState<ViewMode>('market');

  // 搜索相关状态
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('stars');

  // 数据状态
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 详情视图状态
  const [selectedSkill, setSelectedSkill] = useState<SkillInfo | null>(null);
  const [skillDetailContent, setSkillDetailContent] = useState<string | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // 安装状态
  const [installingSkillId, setInstallingSkillId] = useState<string | null>(null);
  const [installMessage, setInstallMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 获取工作区路径
  const workspacePath = useExplorerStore((state) => state.workspacePath);

  // 分页状态
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState(0);

  // 本地 Skills 状态
  const [localSkills, setLocalSkills] = useState<LocalSkillInfo[]>([]);
  const [isLoadingLocal, setIsLoadingLocal] = useState(false);

  // 跟踪是否是初始渲染（用于分页逻辑）
  const isInitialMount = useRef(true);

  // 每页显示数量
  const PAGE_SIZE = 8;

  // 预加载缓存：存储已预加载的页面数据
  const prefetchCache = useRef<Map<number, { skills: SkillInfo[], total: number }>>(new Map());

  // 正在预加载的页码（避免重复预加载）
  const prefetchingPages = useRef<Set<number>>(new Set());

  /**
   * 预加载指定页的数据（不更新 UI）
   */
  const prefetchPage = useCallback(async (targetPage: number, currentSortBy: SortBy, currentSearchQuery: string) => {
    // 如果已经在缓存中或正在预加载，跳过
    if (prefetchCache.current.has(targetPage) || prefetchingPages.current.has(targetPage)) {
      return;
    }

    prefetchingPages.current.add(targetPage);
    console.log(`[SkillsMarketView] 预加载第 ${targetPage} 页...`);

    try {
      let response: SkillSearchResponse;

      if (currentSearchQuery.trim()) {
        response = await skillsMarketService.search({
          q: currentSearchQuery,
          page: targetPage,
          limit: PAGE_SIZE,
          sortBy: currentSortBy,
        });
      } else {
        if (currentSortBy === 'stars') {
          response = await skillsMarketService.getPopular(PAGE_SIZE, targetPage);
        } else {
          response = await skillsMarketService.getRecent(PAGE_SIZE, targetPage);
        }
      }

      if (response.success && response.data) {
        const skills = response.data.skills || [];
        const total = response.data.total || skills.length;

        // 只有当有数据时才缓存
        if (skills.length > 0) {
          prefetchCache.current.set(targetPage, { skills, total });
          console.log(`[SkillsMarketView] 第 ${targetPage} 页预加载完成，共 ${skills.length} 条`);
        }
      }
    } catch (err) {
      console.error(`[SkillsMarketView] 预加载第 ${targetPage} 页失败:`, err);
    } finally {
      prefetchingPages.current.delete(targetPage);
    }
  }, []);

  /**
   * 清除预加载缓存（当搜索条件或排序变化时）
   */
  const clearPrefetchCache = useCallback(() => {
    prefetchCache.current.clear();
    prefetchingPages.current.clear();
    console.log('[SkillsMarketView] 预加载缓存已清除');
  }, []);

  /**
   * 加载技能包列表
   */
  const loadSkills = useCallback(async (resetPage = false) => {
    const currentPage = resetPage ? 1 : page;

    // 如果重置页码，清除预加载缓存
    if (resetPage) {
      clearPrefetchCache();
      setPage(1);
    }

    // 检查缓存中是否有数据
    const cachedData = prefetchCache.current.get(currentPage);
    if (cachedData && !resetPage) {
      console.log(`[SkillsMarketView] 使用缓存数据，第 ${currentPage} 页`);
      setSkills(cachedData.skills);
      setTotal(cachedData.total);
      setHasMore(cachedData.skills.length === PAGE_SIZE);
      setError(null);

      // 预加载下一页
      const nextPage = currentPage + 1;
      if (cachedData.skills.length === PAGE_SIZE) {
        prefetchPage(nextPage, sortBy, searchQuery);
      }
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      let response: SkillSearchResponse;

      if (searchQuery.trim()) {
        // 有搜索关键字，使用关键字搜索
        response = await skillsMarketService.search({
          q: searchQuery,
          page: currentPage,
          limit: PAGE_SIZE,
          sortBy,
        });
      } else {
        // 无搜索关键字，显示热门或最新
        if (sortBy === 'stars') {
          response = await skillsMarketService.getPopular(PAGE_SIZE, currentPage);
        } else {
          response = await skillsMarketService.getRecent(PAGE_SIZE, currentPage);
        }
      }

      if (response.success && response.data) {
        const newSkills = response.data.skills || [];
        const newTotal = response.data.total || newSkills.length;

        // 调试日志：确认 API 返回的 total 值
        console.log('[SkillsMarketView] API 响应 data:', response.data);
        console.log('[SkillsMarketView] response.data.total:', response.data.total);
        console.log('[SkillsMarketView] newSkills.length:', newSkills.length);
        console.log('[SkillsMarketView] newTotal:', newTotal);
        console.log('[SkillsMarketView] PAGE_SIZE:', PAGE_SIZE);
        console.log('[SkillsMarketView] totalPages:', Math.ceil(newTotal / PAGE_SIZE));

        // 页码分页模式：直接替换数据
        setSkills(newSkills);
        setTotal(newTotal);
        setHasMore(newSkills.length === PAGE_SIZE);

        // 缓存当前页数据
        if (newSkills.length > 0) {
          prefetchCache.current.set(currentPage, { skills: newSkills, total: newTotal });
        }

        // 预加载下一页
        if (newSkills.length === PAGE_SIZE) {
          const nextPage = currentPage + 1;
          prefetchPage(nextPage, sortBy, searchQuery);
        }
      } else {
        setError(response.error?.message || '加载失败');
      }
    } catch (err) {
      console.error('[SkillsMarketView] 加载技能包失败:', err);
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, sortBy, page, prefetchPage, clearPrefetchCache]);

  // 初始加载
  useEffect(() => {
    if (viewMode === 'market') {
      loadSkills(true);
    }
  }, [sortBy, viewMode]);

  // 加载本地 Skills
  const loadLocalSkills = useCallback(async () => {
    if (!workspacePath) {
      setLocalSkills([]);
      return;
    }

    setIsLoadingLocal(true);
    try {
      const response = await window.electron?.ipcRenderer.invoke('skills-market:get-local-skills', {
        workspacePath,
      });

      if (response?.success && response.data) {
        setLocalSkills(response.data.skills || []);
      } else {
        setLocalSkills([]);
      }
    } catch (err) {
      console.error('[SkillsMarketView] 加载本地技能包失败:', err);
      setLocalSkills([]);
    } finally {
      setIsLoadingLocal(false);
    }
  }, [workspacePath]);

  // 视图模式变化时加载数据
  useEffect(() => {
    if (viewMode === 'installed' || viewMode === 'local') {
      loadLocalSkills();
    }
  }, [viewMode, loadLocalSkills]);

  // 加载 Skill 详情
  useEffect(() => {
    if (selectedSkill?.githubUrl) {
      setIsLoadingDetail(true);
      setDetailError(null);
      setSkillDetailContent(null);

      skillsMarketService.getDetail(selectedSkill.githubUrl)
        .then(response => {
          if (response.success && response.data) {
            setSkillDetailContent(response.data.content);
          } else {
            setDetailError(response.error?.message || '获取详情失败');
          }
        })
        .catch(err => {
          setDetailError(err instanceof Error ? err.message : '获取详情失败');
        })
        .finally(() => {
          setIsLoadingDetail(false);
        });
    } else {
      setSkillDetailContent(null);
      setDetailError(null);
    }
  }, [selectedSkill]);

  /**
   * 处理搜索
   */
  const handleSearch = useCallback(() => {
    loadSkills(true);
  }, [loadSkills]);

  /**
   * 处理按键事件
   */
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  }, [handleSearch]);

  /**
   * 加载更多
   */
  const handleLoadMore = useCallback(() => {
    if (!isLoading && hasMore) {
      setPage(prev => prev + 1);
      loadSkills(false);
    }
  }, [isLoading, hasMore, loadSkills]);

  /**
   * 安装技能包
   */
  const handleInstallSkill = useCallback(async (skill: SkillInfo) => {
    console.log('[SkillsMarketView] 安装技能包:', skill.name);

    // 检查工作区路径
    if (!workspacePath) {
      setInstallMessage({ type: 'error', text: '请先打开一个工作区' });
      return;
    }

    // 检查 GitHub URL
    if (!skill.githubUrl) {
      setInstallMessage({ type: 'error', text: '该技能包缺少 GitHub URL，无法安装' });
      return;
    }

    // 设置安装中状态
    setInstallingSkillId(skill.id);
    setInstallMessage(null);

    try {
      const response = await skillsMarketService.installSkill(
        skill.name,
        skill.githubUrl,
        workspacePath,
        skill // 传递完整的技能包信息
      );

      if (response.success && response.data) {
        setInstallMessage({
          type: 'success',
          text: `技能包 "${skill.name}" 安装成功！共 ${response.data.filesCount} 个文件`
        });
        console.log('[SkillsMarketView] 安装成功:', response.data);
      } else {
        setInstallMessage({
          type: 'error',
          text: response.error?.message || '安装失败'
        });
        console.error('[SkillsMarketView] 安装失败:', response.error);
      }
    } catch (err) {
      console.error('[SkillsMarketView] 安装异常:', err);
      setInstallMessage({
        type: 'error',
        text: err instanceof Error ? err.message : '安装失败'
      });
    } finally {
      setInstallingSkillId(null);
    }
  }, [workspacePath]);

  /**
   * 查看技能包详情
   */
  const handleViewDetail = useCallback((skill: SkillInfo) => {
    console.log('[SkillsMarketView] 查看技能包详情:', skill.name);
    setSelectedSkill(skill);
  }, []);

  /**
   * 返回列表视图
   */
  const handleBackToList = useCallback(() => {
    setSelectedSkill(null);
  }, []);

  /**
   * 格式化日期
   * 支持 Unix 时间戳（秒）和日期字符串
   * @param dateValue 日期值
   * @param short 是否使用短格式（用于卡片显示）
   */
  const formatDate = useCallback((dateValue?: string | number, short = false) => {
    if (!dateValue) return '未知';
    try {
      let date: Date;
      if (typeof dateValue === 'number') {
        // Unix 时间戳（秒），需要转换为毫秒
        date = new Date(dateValue * 1000);
      } else {
        date = new Date(dateValue);
      }

      // 检查日期是否有效
      if (isNaN(date.getTime())) {
        return String(dateValue);
      }

      if (short) {
        // 短格式：yyyy-MM-dd
        return date.toLocaleDateString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        });
      }

      return date.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return String(dateValue);
    }
  }, []);

  /**
   * 计算总页数
   */
  const totalPages = Math.ceil(total / PAGE_SIZE) || 1;

  /**
   * 处理页码变化
   */
  const handlePageChange = useCallback((newPage: number) => {
    // 允许切换到更大的页码：如果 hasMore 为 true 或 newPage <= totalPages
    if (newPage >= 1 && (newPage <= totalPages || hasMore) && newPage !== page) {
      setPage(newPage);
    }
  }, [totalPages, page, hasMore]);

  // 页码变化时加载数据（跳过初始渲染，避免与初始加载重复）
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (viewMode === 'market') {
      loadSkills(false);
    }
  }, [page]);

  return (
    <div className="skills-market-view">
      {/* 详情视图 */}
      {selectedSkill ? (
        <div className="skills-detail-view">
          {/* 详情头部 */}
          <div className="skills-detail-header">
            <button className="back-btn" onClick={handleBackToList}>
              <Icon name="arrow-left" size={16} />
              <span>返回列表</span>
            </button>
          </div>

          {/* 详情内容 */}
          <div className="skills-detail-content">
            {/* 技能包基本信息 */}
            <div className="skills-detail-main">
              {selectedSkill.author ? (
                <img
                  className="detail-avatar"
                  src={getAuthorAvatarUrl(selectedSkill.author)}
                  alt={selectedSkill.author}
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    e.currentTarget.nextElementSibling?.classList.remove('hidden');
                  }}
                />
              ) : null}
              <div className={`detail-icon ${selectedSkill.author ? 'hidden' : ''}`}>
                <Icon name="package" size={48} />
              </div>
              <div className="detail-info">
                <h1 className="detail-name">{selectedSkill.name}</h1>
                {selectedSkill.author && (
                  <p className="detail-author">
                    <Icon name="user" size={14} />
                    <span>作者：{selectedSkill.author}</span>
                  </p>
                )}
                {selectedSkill.version && (
                  <span className="detail-version">v{selectedSkill.version}</span>
                )}
              </div>
            </div>

            {/* 统计信息 */}
            <div className="detail-stats">
              {selectedSkill.stars !== undefined && (
                <div className="stat-item">
                  <Icon name="star" size={18} />
                  <span className="stat-value">{selectedSkill.stars}</span>
                  <span className="stat-label">星标</span>
                </div>
              )}
              {selectedSkill.downloads !== undefined && (
                <div className="stat-item">
                  <Icon name="download" size={18} />
                  <span className="stat-value">{selectedSkill.downloads}</span>
                  <span className="stat-label">下载</span>
                </div>
              )}
            </div>

            {/* 描述 */}
            <div className="detail-section">
              <h3 className="section-title">描述</h3>
              <p className="detail-description">
                {selectedSkill.description || '暂无描述'}
              </p>
            </div>

            {/* Skill 使用说明 */}
            <div className="detail-section">
              <h3 className="section-title">使用说明</h3>
              {isLoadingDetail && (
                <div className="detail-loading">
                  <div className="loading-spinner small" />
                  <span>加载中...</span>
                </div>
              )}
              {detailError && (
                <div className="detail-error">
                  <Icon name="alert-circle" size={16} />
                  <span>{detailError}</span>
                </div>
              )}
              {skillDetailContent && !isLoadingDetail && (
                <div className="skill-content">
                  <pre className="skill-content-text">{skillDetailContent}</pre>
                </div>
              )}
              {!skillDetailContent && !isLoadingDetail && !detailError && !selectedSkill.githubUrl && (
                <p className="detail-no-content">暂无使用说明</p>
              )}
            </div>

            {/* 标签 */}
            {selectedSkill.tags && selectedSkill.tags.length > 0 && (
              <div className="detail-section">
                <h3 className="section-title">标签</h3>
                <div className="detail-tags">
                  {selectedSkill.tags.map((tag, index) => (
                    <span key={index} className="detail-tag">{tag}</span>
                  ))}
                </div>
              </div>
            )}

            {/* 时间信息 */}
            <div className="detail-section">
              <h3 className="section-title">信息</h3>
              <div className="detail-meta-list">
                {selectedSkill.githubUrl && (
                  <div className="meta-item">
                    <span className="meta-label">GitHub</span>
                    <a
                      className="meta-link"
                      href={selectedSkill.githubUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => {
                        e.preventDefault();
                        window.electron?.shell?.openExternal(selectedSkill.githubUrl!);
                      }}
                    >
                      {selectedSkill.githubUrl}
                    </a>
                  </div>
                )}
                {selectedSkill.skillUrl && (
                  <div className="meta-item">
                    <span className="meta-label">Skill URL</span>
                    <a
                      className="meta-link"
                      href={selectedSkill.skillUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => {
                        e.preventDefault();
                        window.electron?.shell?.openExternal(selectedSkill.skillUrl!);
                      }}
                    >
                      {selectedSkill.skillUrl}
                    </a>
                  </div>
                )}
                {selectedSkill.createdAt && (
                  <div className="meta-item">
                    <span className="meta-label">创建时间</span>
                    <span className="meta-value">{formatDate(selectedSkill.createdAt)}</span>
                  </div>
                )}
                {selectedSkill.updatedAt && (
                  <div className="meta-item">
                    <span className="meta-label">更新时间</span>
                    <span className="meta-value">{formatDate(selectedSkill.updatedAt)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* 操作按钮 */}
            <div className="detail-actions">
              {/* 详情页安装消息提示 */}
              {installMessage && (
                <div className={`install-message ${installMessage.type}`}>
                  <Icon name={installMessage.type === 'success' ? 'check-circle' : 'alert-circle'} size={16} />
                  <span>{installMessage.text}</span>
                  <button className="close-btn" onClick={() => setInstallMessage(null)}>
                    <Icon name="x" size={14} />
                  </button>
                </div>
              )}
              <button
                className={`action-btn install-btn large ${installingSkillId === selectedSkill.id ? 'installing' : ''}`}
                onClick={() => handleInstallSkill(selectedSkill)}
                disabled={installingSkillId === selectedSkill.id}
              >
                {installingSkillId === selectedSkill.id ? (
                  <>
                    <div className="loading-spinner small" />
                    <span>安装中...</span>
                  </>
                ) : (
                  <>
                    <Icon name="download" size={16} />
                    <span>安装技能包</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* 头部搜索区域 */}
      <div className="skills-market-header">
        <h2 className="skills-market-title">
          <Icon name="store" size={20} />
          <span>Skills 市场</span>
        </h2>

        {/* 视图模式切换 */}
        <div className="skills-view-tabs">
          <button
            className={`view-tab ${viewMode === 'market' ? 'active' : ''}`}
            onClick={() => setViewMode('market')}
          >
            <Icon name="store" size={14} />
            <span>市场</span>
          </button>
          <button
            className={`view-tab ${viewMode === 'installed' ? 'active' : ''}`}
            onClick={() => setViewMode('installed')}
          >
            <Icon name="folder" size={14} />
            <span>本地</span>
          </button>
        </div>

        {/* 搜索栏 - 仅在市场模式显示 */}
        {viewMode === 'market' && (
          <>
            <div className="skills-market-search">
              <div className="search-input-wrapper">
                <Icon name="search" size={16} />
                <input
                  type="text"
                  className="search-input"
                  placeholder="搜索技能包..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
                {searchQuery && (
                  <button
                    className="search-clear"
                    onClick={() => {
                      setSearchQuery('');
                      loadSkills(true);
                    }}
                  >
                    <Icon name="x" size={14} />
                  </button>
                )}
              </div>

              <button className="search-btn" onClick={handleSearch}>
                搜索
              </button>
            </div>

            {/* 排序选项 */}
            <div className="skills-market-sort">
              <span className="sort-label">排序：</span>
              <button
                className={`sort-btn ${sortBy === 'stars' ? 'active' : ''}`}
                onClick={() => setSortBy('stars')}
              >
                <Icon name="star" size={14} />
                <span>热门</span>
              </button>
              <button
                className={`sort-btn ${sortBy === 'recent' ? 'active' : ''}`}
                onClick={() => setSortBy('recent')}
              >
                <Icon name="clock" size={14} />
                <span>最新</span>
              </button>
            </div>
          </>
        )}
      </div>

      {/* 技能包列表 */}
      <div className="skills-market-content">
        {/* 安装消息提示 */}
        {installMessage && (
          <div className={`install-message ${installMessage.type}`}>
            <Icon name={installMessage.type === 'success' ? 'check-circle' : 'alert-circle'} size={16} />
            <span>{installMessage.text}</span>
            <button className="close-btn" onClick={() => setInstallMessage(null)}>
              <Icon name="x" size={14} />
            </button>
          </div>
        )}

        {/* 市场模式内容 */}
        {viewMode === 'market' && (
          <>
            {/* 加载状态 */}
            {isLoading && skills.length === 0 && (
              <div className="skills-market-loading">
                <div className="loading-spinner" />
                <span>加载中...</span>
              </div>
            )}

            {/* 错误状态 */}
            {error && (
              <div className="skills-market-error">
                <Icon name="alert-circle" size={24} />
                <span>{error}</span>
                <button className="retry-btn" onClick={() => loadSkills(true)}>
                  重试
                </button>
              </div>
            )}

            {/* 空状态 */}
            {!isLoading && !error && skills.length === 0 && (
              <div className="skills-market-empty">
                <Icon name="package" size={48} />
                <span>暂无技能包</span>
                <p>尝试使用不同的搜索关键字</p>
              </div>
            )}

            {/* 技能包网格 */}
            {skills.length > 0 && (
              <>
                <div className="skills-grid">
                  {skills.map((skill) => (
                    <div key={skill.id} className="skill-card">
                      <div className="skill-card-header">
                        {skill.author ? (
                          <img
                            className="skill-avatar"
                            src={getAuthorAvatarUrl(skill.author)}
                            alt={skill.author}
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                              e.currentTarget.nextElementSibling?.classList.remove('hidden');
                            }}
                          />
                        ) : null}
                        <div className={`skill-icon ${skill.author ? 'hidden' : ''}`}>
                          <Icon name="package" size={24} />
                        </div>
                        <div className="skill-info">
                          <h3 className="skill-name">{skill.name}</h3>
                          {skill.author && (
                            <span className="skill-author">by {skill.author}</span>
                          )}
                        </div>
                      </div>

                      <p className="skill-description">
                        {skill.description || '暂无描述'}
                      </p>

                      <div className="skill-meta">
                        {skill.version && (
                          <span className="skill-version">v{skill.version}</span>
                        )}
                        {skill.stars !== undefined && (
                          <span className="skill-stars">
                            <Icon name="star" size={12} />
                            {skill.stars}
                          </span>
                        )}
                        {skill.downloads !== undefined && (
                          <span className="skill-downloads">
                            <Icon name="download" size={12} />
                            {skill.downloads}
                          </span>
                        )}
                        {skill.updatedAt && (
                          <span className="skill-update-time" title={`更新于 ${formatDate(skill.updatedAt)}`}>
                            <Icon name="clock" size={12} />
                            {formatDate(skill.updatedAt, true)}
                          </span>
                        )}
                      </div>

                      {skill.tags && skill.tags.length > 0 && (
                        <div className="skill-tags">
                          {skill.tags.slice(0, 3).map((tag, index) => (
                            <span key={index} className="skill-tag">{tag}</span>
                          ))}
                        </div>
                      )}

                      <div className="skill-actions">
                        <button
                          className="action-btn detail-btn"
                          onClick={() => handleViewDetail(skill)}
                        >
                          详情
                        </button>
                        <button
                          className={`action-btn install-btn ${installingSkillId === skill.id ? 'installing' : ''}`}
                          onClick={() => handleInstallSkill(skill)}
                          disabled={installingSkillId === skill.id}
                        >
                          {installingSkillId === skill.id ? (
                            <>
                              <div className="loading-spinner small" />
                              安装中...
                            </>
                          ) : (
                            <>
                              <Icon name="download" size={14} />
                              安装
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* 分页控件 - 当有多页数据、还有更多数据、或已浏览多页时显示 */}
                {(totalPages > 1 || hasMore || page > 1) && (
                  <div className="skills-pagination">
                    <button
                      className="pagination-btn"
                      onClick={() => handlePageChange(page - 1)}
                      disabled={page === 1 || isLoading}
                      title="上一页"
                    >
                      <Icon name="arrow-left" size={14} />
                    </button>

                    <div className="pagination-pages">
                      {(() => {
                        // 计算显示的最大页码：如果还有更多数据，至少显示 3 页或当前页 + 2
                        const displayMaxPage = hasMore
                          ? Math.max(totalPages, page + 2, 3)
                          : Math.max(totalPages, 1);

                        return Array.from({ length: displayMaxPage }, (_, i) => i + 1)
                          .filter(p => {
                            if (p === 1 || p === displayMaxPage) return true;
                            if (Math.abs(p - page) <= 2) return true;
                            return false;
                          })
                          .reduce<(number | 'ellipsis')[]>((acc, p, i, arr) => {
                            if (i > 0 && p - (arr[i - 1] as number) > 1) {
                              acc.push('ellipsis');
                            }
                            acc.push(p);
                            return acc;
                          }, [])
                          .map((item, index) => (
                            item === 'ellipsis' ? (
                              <span key={`ellipsis-${index}`} className="pagination-ellipsis">...</span>
                            ) : (
                              <button
                                key={item}
                                className={`pagination-page ${page === item ? 'active' : ''}`}
                                onClick={() => handlePageChange(item)}
                                disabled={isLoading}
                              >
                                {item}
                              </button>
                            )
                          ));
                      })()}
                    </div>

                    <button
                      className="pagination-btn"
                      onClick={() => handlePageChange(page + 1)}
                      disabled={(!hasMore && page >= totalPages) || isLoading}
                      title="下一页"
                    >
                      <Icon name="arrow-right" size={14} />
                    </button>
                  </div>
                )}

                {/* 统计信息 */}
                <div className="skills-stats">
                  <span>共 {total} 个技能包</span>
                </div>
              </>
            )}
          </>
        )}

        {/* 已下载/本地模式内容 */}
        {(viewMode === 'installed' || viewMode === 'local') && (
          <>
            {/* 加载状态 */}
            {isLoadingLocal && (
              <div className="skills-market-loading">
                <div className="loading-spinner" />
                <span>加载中...</span>
              </div>
            )}

            {/* 无工作区提示 */}
            {!workspacePath && !isLoadingLocal && (
              <div className="skills-market-empty">
                <Icon name="folder" size={48} />
                <span>请先打开一个工作区</span>
                <p>本地技能包存储在工作区的 .wstudio/skills 目录中</p>
              </div>
            )}

            {/* 空状态 */}
            {workspacePath && !isLoadingLocal && localSkills.length === 0 && (
              <div className="skills-market-empty">
                <Icon name="package" size={48} />
                <span>暂无本地技能包</span>
                <p>从市场安装技能包或在 .wstudio/skills 目录中创建技能包</p>
              </div>
            )}

            {/* 本地技能包列表 */}
            {workspacePath && !isLoadingLocal && localSkills.length > 0 && (
              <div className="skills-grid">
                {localSkills.map((skill) => (
                    <div key={skill.path} className="skill-card local-skill">
                      <div className="skill-card-header">
                        <div className="skill-info">
                          <h3 className="skill-name">{skill.name}</h3>
                        </div>
                      </div>

                      <p className="skill-description" title={skill.description || skill.path}>
                        {skill.description
                          ? (skill.description.length > 60
                              ? skill.description.slice(0, 60) + '...'
                              : skill.description)
                          : '暂无描述'}
                      </p>

                      <div className="skill-actions">
                        <button
                          className="action-btn detail-btn"
                          onClick={async () => {
                            if (skill.isInstalled) {
                              // 从市场安装的技能包，读取本地 SKILL.md 内容显示详情
                              try {
                                const skillMdPath = `${skill.path}/SKILL.md`;
                                const content = await window.electron?.ipcRenderer.invoke('fs:read-file', skillMdPath);
                                if (content) {
                                  // 使用 packageInfo 创建更完整的 SkillInfo 对象
                                  const tempSkill: SkillInfo = {
                                    id: skill.name,
                                    name: skill.name,
                                    description: skill.description || '暂无描述',
                                    githubUrl: skill.githubUrl,
                                    author: skill.packageInfo?.author,
                                    version: skill.packageInfo?.version,
                                    stars: skill.packageInfo?.stars,
                                    downloads: skill.packageInfo?.downloads,
                                    tags: skill.packageInfo?.tags,
                                    createdAt: skill.packageInfo?.createdAt,
                                    updatedAt: skill.packageInfo?.updatedAt,
                                  };
                                  setSelectedSkill(tempSkill);
                                  setSkillDetailContent(content);
                                  setIsLoadingDetail(false);
                                  setDetailError(null);
                                }
                              } catch (err) {
                                console.error('读取 SKILL.md 失败:', err);
                              }
                            } else {
                              // 本地创建的技能包，打开目录
                              window.electron?.shell?.openExternal(`file://${skill.path}`);
                            }
                          }}
                        >
                          <Icon name="skill-detail" size={14} />
                          详情
                        </button>
                        <button
                          className="action-btn"
                          onClick={async () => {
                            // 打开 SKILL.md 文档进行编辑
                            const skillMdPath = `${skill.path}/SKILL.md`;
                            try {
                              const content = await window.electron?.ipcRenderer.invoke('fs:read-file', skillMdPath);
                              if (content !== null && content !== undefined) {
                                window.dispatchEvent(new CustomEvent('open-file', {
                                  detail: {
                                    path: skillMdPath,
                                    name: 'SKILL.md',
                                    content: content,
                                    language: 'markdown'
                                  }
                                }));
                              }
                            } catch (err) {
                              console.error('读取 SKILL.md 失败:', err);
                            }
                          }}
                        >
                          编辑
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            )}

            {/* 统计信息 */}
            {workspacePath && !isLoadingLocal && (
              <div className="skills-stats">
                <span>共 {localSkills.length} 个技能包</span>
              </div>
            )}
          </>
        )}
      </div>
        </>
      )}
    </div>
  );
};
