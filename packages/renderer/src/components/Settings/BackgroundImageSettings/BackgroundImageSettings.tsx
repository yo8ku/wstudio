import React from 'react';
import {
  DEFAULT_WORKBENCH_BACKGROUND_SETTINGS,
  type WorkbenchBackgroundSettings,
} from '@note-studio/shared';
import { DropdownMenu } from '@/components/common/DropdownMenu';
import { normalizeWorkbenchBackgroundSettings, toWorkbenchBackgroundImageUrl } from '@/utils/workbenchBackground';
import './BackgroundImageSettings.scss';

interface BackgroundImageSettingsProps {
  value?: WorkbenchBackgroundSettings;
  onChange: (value: WorkbenchBackgroundSettings) => void;
}

const fitOptions = [
  { value: 'cover', label: 'Cover' },
  { value: 'contain', label: 'Contain' },
  { value: 'auto', label: 'Auto' },
] as const;

export const BackgroundImageSettings: React.FC<BackgroundImageSettingsProps> = ({
  value,
  onChange,
}) => {
  const settings = normalizeWorkbenchBackgroundSettings(value ?? DEFAULT_WORKBENCH_BACKGROUND_SETTINGS);
  const previewUrl = toWorkbenchBackgroundImageUrl(settings.imagePath);

  const updateSettings = (nextValue: Partial<WorkbenchBackgroundSettings>): void => {
    onChange(normalizeWorkbenchBackgroundSettings({ ...settings, ...nextValue }));
  };

  const handleSelectImage = async (): Promise<void> => {
    const result = await window.electron?.image?.open();
    if (!result?.success || !result.data?.path) {
      return;
    }

    updateSettings({
      enabled: true,
      imagePath: result.data.path,
    });
  };

  const handleClearImage = (): void => {
    if (!settings.imagePath) {
      return;
    }

    updateSettings({
      enabled: false,
      imagePath: '',
      blur: DEFAULT_WORKBENCH_BACKGROUND_SETTINGS.blur,
      opacity: DEFAULT_WORKBENCH_BACKGROUND_SETTINGS.opacity,
      fit: DEFAULT_WORKBENCH_BACKGROUND_SETTINGS.fit,
    });
  };

  return (
    <div className="background-image-settings background-image-panel">
      <div className="background-image-settings__header">
        <div className="background-image-settings__title-group">
          <h3 className="background-image-settings__title">Background image</h3>
          <p className="background-image-settings__description">
            Configure the workbench background without going through the removed extension system.
          </p>
        </div>

        <label className="background-image-settings__toggle">
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(event) => updateSettings({ enabled: event.target.checked })}
          />
          <span>Enabled</span>
        </label>
      </div>

      <div
        className={`background-image-settings__preview ${previewUrl ? 'has-image' : ''}`}
        style={previewUrl ? { backgroundImage: `url("${previewUrl}")` } : undefined}
      >
        {!previewUrl && <span className="background-image-settings__preview-empty">No image selected</span>}
      </div>

      <div className="background-image-settings__actions">
        <div className="background-image-settings__action" onClick={() => void handleSelectImage()}>
          Choose image
        </div>
        <div
          className={`background-image-settings__action ${settings.imagePath ? '' : 'is-disabled'}`}
          onClick={handleClearImage}
        >
          Clear
        </div>
      </div>

      <div className="background-image-settings__path" title={settings.imagePath || 'No image selected'}>
        {settings.imagePath || 'No image selected'}
      </div>

      <div className="background-image-settings__grid">
        <div className="background-image-settings__field">
          <span className="background-image-settings__label">Fit</span>
          <DropdownMenu
            value={settings.fit}
            onChange={(nextValue: string) => updateSettings({ fit: nextValue as WorkbenchBackgroundSettings['fit'] })}
            items={fitOptions.map((item) => ({ value: item.value, label: item.label }))}
          />
        </div>

        <div className="background-image-settings__field">
          <div className="background-image-settings__field-header">
            <span className="background-image-settings__label">Opacity</span>
            <span className="background-image-settings__value">{Math.round(settings.opacity * 100)}%</span>
          </div>
          <input
            className="background-image-settings__range bg-slider"
            type="range"
            min={0}
            max={100}
            value={Math.round(settings.opacity * 100)}
            onChange={(event) => updateSettings({ opacity: Number(event.target.value) / 100 })}
          />
        </div>

        <div className="background-image-settings__field">
          <div className="background-image-settings__field-header">
            <span className="background-image-settings__label">Blur</span>
            <span className="background-image-settings__value">{settings.blur}px</span>
          </div>
          <input
            className="background-image-settings__range bg-slider"
            type="range"
            min={0}
            max={24}
            value={settings.blur}
            onChange={(event) => updateSettings({ blur: Number(event.target.value) })}
          />
        </div>
      </div>
    </div>
  );
};

export default BackgroundImageSettings;
