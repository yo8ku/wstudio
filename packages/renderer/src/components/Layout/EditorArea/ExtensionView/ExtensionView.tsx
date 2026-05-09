import React, { useEffect, useState } from 'react';
import { Icon } from '../../../Icons';
import { notification } from '../../../Notification';
import { MOCK_LOCAL_EXTENSIONS } from '../../Sidebar/Extensions/mockExtensions';
import {
  loadInstalledPluginExtensions,
  subscribeInstalledPluginExtensions,
} from '../../Sidebar/Extensions/installedPluginExtensions';
import type { LocalExtensionItem } from '../../Sidebar/Extensions/types';
import './ExtensionView.scss';

interface ExtensionViewProps {
  readonly extensionPath: string;
}

interface OpenSettingsDetail {
  readonly category: 'plugins';
}

interface SetPluginEnabledRequest {
  readonly pluginId: string;
  readonly enabled: boolean;
}

interface UninstallPluginRequest {
  readonly pluginId: string;
}

type PendingAction = 'toggle-enabled' | 'uninstall' | null;

const EXTENSION_PATH_PREFIX = 'extension:/';
const PLUGIN_SET_ENABLED_CHANNEL = 'plugin-ui:set-plugin-enabled';
const PLUGIN_UNINSTALL_CHANNEL = 'plugin-ui:uninstall-plugin';
const EMPTY_META_VALUE = '--';

function OfficialPublisherIcon(): React.ReactElement {
  return (
    <svg
      className="extension-view__verified-icon"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      xmlns="http://www.w3.org/2000/svg"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M11.335 2.06532L11.4114 2.21789L11.9879 3.75087C12.0332 3.87159 12.1284 3.96685 12.2492 4.01214L13.7292 4.56741C14.3787 4.81108 14.7278 5.50512 14.5547 6.16178L14.5131 6.29246L13.8245 7.81529C13.7712 7.93268 13.7712 8.06739 13.8245 8.18478L14.4784 9.62399C14.7654 10.2556 14.5214 10.9931 13.9347 11.3351L13.7822 11.4115L12.2492 11.9879C12.1284 12.0332 12.0332 12.1285 11.9879 12.2492L11.4326 13.7293C11.189 14.3788 10.4949 14.7278 9.83826 14.5547L9.70758 14.5131L8.18475 13.8245C8.06736 13.7712 7.93265 13.7712 7.81526 13.8245L6.37605 14.4785C5.74448 14.7654 5.00693 14.5215 4.66498 13.9347L4.58856 13.7822L4.01211 12.2492C3.96682 12.1285 3.87156 12.0332 3.75084 11.9879L2.27076 11.4327C1.62126 11.189 1.27224 10.4949 1.44531 9.83829L1.48695 9.70761L2.17552 8.18478C2.22886 8.06739 2.22886 7.93268 2.17552 7.81529L1.52159 6.37608C1.23462 5.74451 1.47858 5.00696 2.06529 4.66501L2.21786 4.58859L3.75084 4.01214C3.87156 3.96685 3.96682 3.87159 4.01211 3.75087L4.56738 2.27079C4.81105 1.62129 5.50509 1.27227 6.16175 1.44534L6.29243 1.48698L7.81526 2.17555C7.93265 2.22889 8.06736 2.22889 8.18475 2.17555L9.62396 1.52162C10.2555 1.23465 10.9931 1.47861 11.335 2.06532ZM10.1639 5.70595L6.97825 9.34669L5.8158 8.18424C5.64139 8.00983 5.35862 8.00983 5.18421 8.18424C5.0098 8.35865 5.0098 8.64142 5.18421 8.81583L6.68421 10.3158C6.86689 10.4985 7.16599 10.4885 7.33611 10.2941L10.8361 6.29412C10.9985 6.1085 10.9797 5.82635 10.7941 5.66393C10.6085 5.50151 10.3263 5.52032 10.1639 5.70595Z" />
    </svg>
  );
}

function getExtensionId(extensionPath: string): string {
  if (!extensionPath.startsWith(EXTENSION_PATH_PREFIX)) {
    return extensionPath;
  }

  return extensionPath.slice(EXTENSION_PATH_PREFIX.length);
}

function findExtension(extensionPath: string): LocalExtensionItem | null {
  const extensionId = getExtensionId(extensionPath);
  return MOCK_LOCAL_EXTENSIONS.find(item => item.id === extensionId) ?? null;
}

function canOpenExternalLink(candidate: string | undefined): candidate is string {
  if (typeof candidate !== 'string') {
    return false;
  }

  try {
    const url = new URL(candidate);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

export const ExtensionView: React.FC<ExtensionViewProps> = ({ extensionPath }) => {
  const [installedPluginExtensions, setInstalledPluginExtensions] = useState<readonly LocalExtensionItem[]>([]);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const extensionId = getExtensionId(extensionPath);

  useEffect(() => {
    let disposed = false;

    const refreshInstalledPluginExtensions = async (): Promise<void> => {
      try {
        const nextExtensions = await loadInstalledPluginExtensions();

        if (!disposed) {
          setInstalledPluginExtensions(nextExtensions);
        }
      } catch (error) {
        console.error('[ExtensionView] failed to load installed plugin extensions:', error);

        if (!disposed) {
          setInstalledPluginExtensions([]);
        }
      }
    };

    void refreshInstalledPluginExtensions();

    const unsubscribe = subscribeInstalledPluginExtensions(() => {
      void refreshInstalledPluginExtensions();
    });

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, []);

  const extension = installedPluginExtensions.find(item => item.id === extensionId)
    ?? findExtension(extensionPath);
  const isEnabled = extension?.status === 'enabled';
  const isErrorDisabled = extension?.status === 'error';
  const canToggleEnabled = extension?.canToggleEnabled === true;
  const canUninstall = extension?.canUninstall === true;
  const canOpenSettings = extension?.hasSettings === true;
  const publisherUrl = canOpenExternalLink(extension?.publisherUrl) ? extension.publisherUrl : null;
  const downloadsLabel = extension?.downloadsLabel ?? EMPTY_META_VALUE;
  const ratingLabel = extension?.rating ?? EMPTY_META_VALUE;

  const handleOpenSettings = (): void => {
    window.dispatchEvent(new CustomEvent<OpenSettingsDetail>('open-settings', {
      detail: { category: 'plugins' },
    }));
  };

  const handleOpenPublisherLink = (event: React.MouseEvent<HTMLAnchorElement>): void => {
    if (publisherUrl === null) {
      return;
    }

    event.preventDefault();
    void window.electron?.shell?.openExternal(publisherUrl);
  };

  const handleToggleEnabled = async (): Promise<void> => {
    if (!extension || !canToggleEnabled) {
      return;
    }

    const ipcRenderer = window.electron?.ipcRenderer;

    if (!ipcRenderer) {
      notification.error('当前环境无法切换插件启用状态');
      return;
    }

    setPendingAction('toggle-enabled');

    try {
      const request: SetPluginEnabledRequest = {
        pluginId: extension.id,
        enabled: !isEnabled,
      };
      await ipcRenderer.invoke(PLUGIN_SET_ENABLED_CHANNEL, request);
      notification.success(isEnabled ? '插件已禁用' : '插件已启用');
    } catch (error) {
      const message = error instanceof Error ? error.message : '切换插件启用状态失败';
      notification.error(message);
    } finally {
      setPendingAction(null);
    }
  };

  const handleUninstall = async (): Promise<void> => {
    if (!extension || !canUninstall) {
      return;
    }

    const ipcRenderer = window.electron?.ipcRenderer;

    if (!ipcRenderer) {
      notification.error('当前环境无法卸载插件');
      return;
    }

    const confirmed = window.confirm(`确认卸载插件“${extension.displayName}”吗？`);

    if (!confirmed) {
      return;
    }

    setPendingAction('uninstall');

    try {
      const request: UninstallPluginRequest = {
        pluginId: extension.id,
      };
      await ipcRenderer.invoke(PLUGIN_UNINSTALL_CHANNEL, request);
      notification.success('插件已卸载');
    } catch (error) {
      const message = error instanceof Error ? error.message : '卸载插件失败';
      notification.error(message);
    } finally {
      setPendingAction(null);
    }
  };

  if (!extension) {
    return (
      <div className="extension-view extension-view--empty">
        <div className="extension-view__empty">未找到对应的插件详情。</div>
      </div>
    );
  }

  return (
    <div className="extension-view">
      <header className="extension-view__header">
        <div className="extension-view__icon">
          {extension.iconPath ? (
            <img
              src={extension.iconPath}
              alt=""
              className="extension-view__icon-image"
              aria-hidden="true"
            />
          ) : (
            <Icon name={extension.iconName} size={26} />
          )}
        </div>
        <div className="extension-view__summary">
          <div className="extension-view__title-row">
            <h1 className="extension-view__title" title={extension.displayName}>
              {extension.displayName}
            </h1>
            <span
              className={`extension-view__status ${isEnabled ? 'is-enabled' : isErrorDisabled ? 'is-error' : 'is-disabled'}`}
            >
              {isEnabled ? '已启用' : isErrorDisabled ? '异常停用' : '已禁用'}
            </span>
          </div>

          <div className="extension-view__meta">
            <span className="extension-view__meta-item" title={extension.publisher}>
              {extension.publisher}
            </span>

            {extension.isOfficialPublisher && (
              <span className="extension-view__meta-item extension-view__verified">
                <OfficialPublisherIcon />
                {publisherUrl === null ? (
                  <span>已认证</span>
                ) : (
                  <a
                    className="extension-view__verified-link"
                    href={publisherUrl}
                    onClick={handleOpenPublisherLink}
                  >
                    已认证
                  </a>
                )}
              </span>
            )}

            {!extension.isOfficialPublisher && publisherUrl !== null && (
              <a
                className="extension-view__meta-link"
                href={publisherUrl}
                onClick={handleOpenPublisherLink}
              >
                作者主页
              </a>
            )}

            <span className="extension-view__meta-item extension-view__meta-stat">
              <Icon name="download" size={14} />
              <span>{downloadsLabel}</span>
            </span>

            <span className="extension-view__meta-item extension-view__meta-stat">
              <Icon name="star" size={14} />
              <span>{ratingLabel}</span>
            </span>
          </div>
        </div>
      </header>

      <p className="extension-view__description">{extension.description}</p>

      {extension.failureMessage && (
        <p className="extension-view__alert">{extension.failureMessage}</p>
      )}

      {(canToggleEnabled || canUninstall || canOpenSettings) && (
        <div className="extension-view__actions">
          {canToggleEnabled && (
            <button
              type="button"
              className="extension-view__action-button"
              onClick={() => {
                void handleToggleEnabled();
              }}
              disabled={pendingAction !== null}
            >
              {pendingAction === 'toggle-enabled'
                ? '处理中...'
                : isEnabled
                  ? '禁用'
                  : '启用'}
            </button>
          )}

          {canUninstall && (
            <button
              type="button"
              className="extension-view__action-button extension-view__action-button--danger"
              onClick={() => {
                void handleUninstall();
              }}
              disabled={pendingAction !== null}
            >
              {pendingAction === 'uninstall' ? '卸载中...' : '卸载'}
            </button>
          )}

          {canOpenSettings && (
            <button
              type="button"
              className="extension-view__icon-button"
              onClick={handleOpenSettings}
              disabled={pendingAction !== null}
              aria-label="打开插件设置"
              title="打开插件设置"
            >
              <Icon name="settings" size={16} />
            </button>
          )}
        </div>
      )}

      {!isEnabled && extension.capabilities.length > 0 && (
        <div className="extension-view__capabilities">
          {extension.capabilities.map((capability) => (
            <span key={capability} className="extension-view__capability">
              {capability}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
