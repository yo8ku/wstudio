/**
 * Settings view component.
 * Renders settings navigation and content panes.
 */

import React, { useEffect, useRef, useState } from 'react';
import { SettingsSidebar, type SettingsCategory } from '../../Layout/Sidebar/SettingsSidebar';
import { SettingsContent } from '../../Editor/SettingsContent';
import './SettingsView.scss';

interface SettingsNavigateDetail {
  category?: SettingsCategory;
}

export const SettingsView: React.FC = () => {
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>('commonly-used');
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const scrollToCategory = (category: SettingsCategory): void => {
    if (!scrollContainerRef.current) {
      return;
    }

    const targetElement = scrollContainerRef.current.querySelector(`#category-${category}`);
    if (targetElement) {
      targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleCategoryChange = (category: SettingsCategory): void => {
    setActiveCategory(category);
    scrollToCategory(category);
  };

  useEffect(() => {
    const handleSettingsNavigate = (event: Event): void => {
      const customEvent = event as CustomEvent<SettingsNavigateDetail>;
      const category = customEvent.detail?.category;

      if (!category) {
        return;
      }

      setActiveCategory(category);
      window.setTimeout(() => {
        scrollToCategory(category);
      }, 0);
    };

    window.addEventListener('settings:navigate', handleSettingsNavigate);
    return () => {
      window.removeEventListener('settings:navigate', handleSettingsNavigate);
    };
  }, []);

  return (
    <div className="settings-view">
      <div className="settings-sidebar-container">
        <SettingsSidebar
          activeCategory={activeCategory}
          onCategoryChange={handleCategoryChange}
        />
      </div>

      <div className="settings-content-container">
        <SettingsContent
          activeCategory={activeCategory}
          onActiveCategoryChange={setActiveCategory}
          scrollContainerRef={scrollContainerRef}
        />
      </div>
    </div>
  );
};
