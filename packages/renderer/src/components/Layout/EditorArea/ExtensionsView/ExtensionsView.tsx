/**
 * Built-in extensions workbench view.
 * Keeps extension management owned by the host app instead of third-party plugins.
 */

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../../Icons';
import './ExtensionsView.scss';

const PLUGIN_INSTALLED_PLUGINS_CHANNEL = 'plugin-ui:get-installed-plugins';
const PLUGIN_UI_CHANGED_CHANNEL = 'plugin-ui:entries-changed';

interface InstalledPluginSummary {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly publisher: string | null;
  readonly description: string | null;
  readonly fundingUrl: string | null;
  readonly iconPath: string | null;
  readonly releaseChannel: 'stable' | 'development';
  readonly enabled: boolean;
  readonly failureMessage: string | null;
}

function canOpenExternalLink(candidate: string | null): candidate is string {
  if (candidate === null) {
    return false;
  }

  try {
    const url = new URL(candidate);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

export const ExtensionsView: React.FC = () => {
  const { t } = useTranslation();
  const [plugins, setPlugins] = useState<readonly InstalledPluginSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const getReleaseChannelLabel = (releaseChannel: InstalledPluginSummary['releaseChannel']): string => {
    return releaseChannel === 'development' ? '测试插件' : '正式插件';
  };

  useEffect(() => {
    let disposed = false;

    const loadInstalledPlugins = async () => {
      const ipcRenderer = window.electron?.ipcRenderer;
      if (!ipcRenderer) {
        if (!disposed) {
          setPlugins([]);
          setLoading(false);
        }
        return;
      }

      try {
        const nextPlugins = await ipcRenderer.invoke(
          PLUGIN_INSTALLED_PLUGINS_CHANNEL,
        ) as readonly InstalledPluginSummary[];

        if (!disposed) {
          setPlugins(nextPlugins);
          setErrorMessage(null);
          setLoading(false);
        }
      } catch (error) {
        const message = error instanceof Error
          ? error.message
          : t('extensionsView.states.loadFailed');

        if (!disposed) {
          setErrorMessage(message);
          setLoading(false);
        }
      }
    };

    void loadInstalledPlugins();

    const unsubscribe = window.electron?.ipcRenderer.on(
      PLUGIN_UI_CHANGED_CHANNEL,
      () => {
        void loadInstalledPlugins();
      },
    );

    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, [t]);

  return (
    <div className="extensions-view">
      <div className="extensions-view__hero">
        <div className="extensions-view__hero-icon">
          <Icon name="extensions" size={20} />
        </div>
        <div className="extensions-view__hero-copy">
          <h2 className="extensions-view__title">{t('extensionsView.title')}</h2>
          <p className="extensions-view__description">{t('extensionsView.description')}</p>
        </div>
      </div>

      <div className="extensions-view__section">
        <div className="extensions-view__section-header">
          <span className="extensions-view__section-title">{t('extensionsView.sections.installed')}</span>
          <span className="extensions-view__section-count">
            {t('extensionsView.sections.count', { count: plugins.length })}
          </span>
        </div>

        {loading && (
          <div className="extensions-view__state">{t('extensionsView.states.loading')}</div>
        )}

        {!loading && errorMessage && (
          <div className="extensions-view__state extensions-view__state--error">
            {errorMessage}
          </div>
        )}

        {!loading && !errorMessage && plugins.length === 0 && (
          <div className="extensions-view__state">{t('extensionsView.states.empty')}</div>
        )}

        {!loading && !errorMessage && plugins.length > 0 && (
          <div className="extensions-view__list">
            {plugins.map((plugin) => {
              const fundingUrl = canOpenExternalLink(plugin.fundingUrl)
                ? plugin.fundingUrl
                : null;

              return (
                <div key={plugin.id} className="extensions-view__card">
                  <div className="extensions-view__card-header">
                    <div className="extensions-view__card-identity">
                      <div className="extensions-view__card-icon">
                        {plugin.iconPath ? (
                          <img
                            src={plugin.iconPath}
                            alt=""
                            className="extensions-view__card-icon-image"
                            aria-hidden="true"
                          />
                        ) : (
                          <Icon
                            name={plugin.releaseChannel === 'development' ? 'beaker' : 'extensions'}
                            size={18}
                          />
                        )}
                      </div>
                      <div className="extensions-view__card-title-group">
                        <span className="extensions-view__card-title">{plugin.name}</span>
                        <span className="extensions-view__card-version">v{plugin.version}</span>
                        <span
                          className={`extensions-view__channel-badge ${plugin.releaseChannel === 'development' ? 'is-development' : 'is-stable'}`}
                        >
                          {getReleaseChannelLabel(plugin.releaseChannel)}
                        </span>
                      </div>
                    </div>
                    <span
                      className={`extensions-view__status ${plugin.enabled ? 'is-enabled' : 'is-disabled'}`}
                    >
                      {plugin.enabled
                        ? t('extensionsView.status.enabled')
                        : t('extensionsView.status.disabled')}
                    </span>
                  </div>
                  <div className="extensions-view__meta">
                    <span>{plugin.publisher ?? t('extensionsView.common.unknownPublisher')}</span>
                    <span className="extensions-view__meta-separator">/</span>
                    <span className="extensions-view__plugin-id">{plugin.id}</span>
                  </div>
                  <p className="extensions-view__card-description">
                    {plugin.description ?? t('extensionsView.states.noDescription')}
                  </p>
                  {!plugin.enabled && plugin.failureMessage !== null && (
                    <p className="extensions-view__card-description extensions-view__card-description--error">
                      {plugin.failureMessage}
                    </p>
                  )}
                  {fundingUrl !== null && (
                    <div className="extensions-view__card-actions">
                      <a
                        className="extensions-view__action-link"
                        href={fundingUrl}
                        onClick={(event) => {
                          event.preventDefault();
                          void window.electron?.shell?.openExternal(fundingUrl);
                        }}
                      >
                        Funding URL
                      </a>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
