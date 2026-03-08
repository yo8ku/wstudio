import React, { useEffect, useRef, useState } from 'react';
import { Icon } from '../../Icons';
import './SearchInput.scss';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  defaultExpanded?: boolean;
  alwaysExpanded?: boolean;
  className?: string;
  expandedWidth?: number | string;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  collapseOnBlur?: 'empty' | 'always' | 'never';
  clearOnCollapse?: boolean;
  hideIconWhenExpanded?: boolean;
  iconSize?: number;
}

export const SearchInput: React.FC<SearchInputProps> = ({
  value,
  onChange,
  placeholder = '搜索',
  defaultExpanded = false,
  alwaysExpanded = false,
  className = '',
  expandedWidth = 280,
  expanded,
  onExpandedChange,
  collapseOnBlur = 'empty',
  clearOnCollapse = false,
  hideIconWhenExpanded = false,
  iconSize = 16
}) => {
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded || alwaysExpanded);
  const inputRef = useRef<HTMLInputElement>(null);
  const isControlled = expanded !== undefined;
  const isExpanded = alwaysExpanded ? true : (isControlled ? expanded : internalExpanded);

  const setExpanded = (nextExpanded: boolean) => {
    if (alwaysExpanded) {
      return;
    }

    if (!isControlled) {
      setInternalExpanded(nextExpanded);
    }

    onExpandedChange?.(nextExpanded);
  };

  useEffect(() => {
    if (isExpanded) {
      inputRef.current?.focus();
    }
  }, [isExpanded]);

  const handleIconClick = () => {
    if (!alwaysExpanded && !isExpanded) {
      setExpanded(true);
    }
  };

  const handleBlur = () => {
    if (alwaysExpanded || collapseOnBlur === 'never') {
      return;
    }

    const shouldCollapse = collapseOnBlur === 'always' || (collapseOnBlur === 'empty' && !value);

    if (!shouldCollapse) {
      return;
    }

    if (clearOnCollapse) {
      onChange('');
    }

    setExpanded(false);
  };

  const handleClear = () => {
    onChange('');

    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const widthStyle = typeof expandedWidth === 'number' ? `${expandedWidth}px` : expandedWidth;

  return (
    <div
      className={`search-input-container ${isExpanded ? 'expanded' : 'collapsed'} ${className}`}
      style={{ width: isExpanded ? widthStyle : '32px' }}
    >
      {(!isExpanded || !hideIconWhenExpanded) && (
        <div className="search-input-icon" onClick={handleIconClick}>
          <Icon name="search" size={iconSize} />
        </div>
      )}

      {isExpanded && (
        <>
          <input
            ref={inputRef}
            type="text"
            className="search-input-field"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onBlur={handleBlur}
            placeholder={placeholder}
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
          />
          {value && (
            <div
              className="search-input-clear"
              onMouseDown={(event) => event.preventDefault()}
              onClick={handleClear}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default SearchInput;
