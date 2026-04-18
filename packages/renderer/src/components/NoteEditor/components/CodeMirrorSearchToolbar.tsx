/**
 * CodeMirror 搜索工具栏组件。
 * 功能：渲染与终端搜索框风格对齐的编辑器内搜索条。
 */
import React from 'react';
import { SearchToolbarField } from '../../common/SearchToolbarField';
import { SearchToolbarIcon } from '../../common/SearchToolbarIcon';

export type CodeMirrorSearchOptionKey = 'caseSensitive' | 'wholeWord' | 'useRegex';

interface CodeMirrorSearchToolbarTexts {
  readonly placeholder: string;
  readonly matchCase: string;
  readonly wholeWord: string;
  readonly useRegex: string;
  readonly previousResult: string;
  readonly nextResult: string;
  readonly closeSearch: string;
}

export interface CodeMirrorSearchToolbarProps {
  readonly query: string;
  readonly caseSensitive: boolean;
  readonly wholeWord: boolean;
  readonly useRegex: boolean;
  readonly resultLabel: string;
  readonly statusTone: 'default' | 'error';
  readonly canNavigate: boolean;
  readonly inputRef: React.RefObject<HTMLInputElement>;
  readonly texts: CodeMirrorSearchToolbarTexts;
  readonly onQueryChange: (value: string) => void;
  readonly onInputKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  readonly onToggleOption: (option: CodeMirrorSearchOptionKey) => void;
  readonly onPrevious: () => void;
  readonly onNext: () => void;
  readonly onClose: () => void;
}

interface SearchToolbarActionProps {
  readonly ariaLabel: string;
  readonly disabled?: boolean;
  readonly onPress: () => void;
  readonly title: string;
  readonly children: React.ReactNode;
}

const SearchToolbarAction: React.FC<SearchToolbarActionProps> = ({
  ariaLabel,
  disabled = false,
  onPress,
  title,
  children,
}) => {
  const handleClick = (): void => {
    if (!disabled) {
      onPress();
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (disabled) {
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onPress();
    }
  };

  const preventMouseFocusShift = (event: React.MouseEvent<HTMLDivElement>): void => {
    event.preventDefault();
  };

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={ariaLabel}
      aria-disabled={disabled ? 'true' : 'false'}
      className="cm-search-toolbar-action"
      title={title}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onMouseDown={preventMouseFocusShift}
    >
      {children}
    </div>
  );
};

interface SearchToolbarOptionProps {
  readonly active: boolean;
  readonly iconName: 'caseSensitive' | 'wholeWord' | 'regex';
  readonly label: string;
  readonly onPress: () => void;
}

const SearchToolbarOption: React.FC<SearchToolbarOptionProps> = ({
  active,
  iconName,
  label,
  onPress,
}) => {
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onPress();
    }
  };

  const preventMouseFocusShift = (event: React.MouseEvent<HTMLDivElement>): void => {
    event.preventDefault();
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={`search-toolbar-field__option ${active ? 'is-active' : ''}`}
      onClick={onPress}
      onKeyDown={handleKeyDown}
      onMouseDown={preventMouseFocusShift}
    >
      <SearchToolbarIcon
        name={iconName}
        className="search-toolbar-field__option-icon"
      />
    </div>
  );
};

const SearchToolbarPrefixIcon: React.FC = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
  >
    <path
      d="m10 17 5-5-5-5"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    />
  </svg>
);

const SearchToolbarPreviousIcon: React.FC = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
  >
    <path
      d="m5 12 7-7 7 7"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
    />
    <path
      d="M12 19V5"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
    />
  </svg>
);

const SearchToolbarNextIcon: React.FC = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
  >
    <path
      d="M12 5v14"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
    />
    <path
      d="m19 12-7 7-7-7"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
    />
  </svg>
);

const SearchToolbarCloseIcon: React.FC = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    aria-hidden="true"
  >
    <path
      d="M4 4L12 12M12 4L4 12"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
    />
  </svg>
);

export const CodeMirrorSearchToolbar: React.FC<CodeMirrorSearchToolbarProps> = ({
  query,
  caseSensitive,
  wholeWord,
  useRegex,
  resultLabel,
  statusTone,
  canNavigate,
  inputRef,
  texts,
  onQueryChange,
  onInputKeyDown,
  onToggleOption,
  onPrevious,
  onNext,
  onClose,
}) => {
  return (
    <div
      className="cm-search-toolbar"
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="cm-search-toolbar-prefix" aria-hidden="true">
        <SearchToolbarPrefixIcon />
      </div>
      <SearchToolbarField
        className="cm-search-toolbar-field"
        actions={(
          <>
            <SearchToolbarOption
              active={caseSensitive}
              iconName="caseSensitive"
              label={texts.matchCase}
              onPress={() => onToggleOption('caseSensitive')}
            />
            <SearchToolbarOption
              active={wholeWord}
              iconName="wholeWord"
              label={texts.wholeWord}
              onPress={() => onToggleOption('wholeWord')}
            />
            <SearchToolbarOption
              active={useRegex}
              iconName="regex"
              label={texts.useRegex}
              onPress={() => onToggleOption('useRegex')}
            />
          </>
        )}
      >
        <input
          ref={inputRef}
          type="text"
          spellCheck={false}
          autoComplete="off"
          className="cm-search-toolbar-input"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={onInputKeyDown}
          placeholder={texts.placeholder}
          aria-label={texts.placeholder}
        />
      </SearchToolbarField>
      <span className="cm-search-toolbar-status" data-tone={statusTone}>
        {resultLabel}
      </span>
      <div className="cm-search-toolbar-navigation">
        <SearchToolbarAction
          ariaLabel={texts.previousResult}
          title={texts.previousResult}
          disabled={!canNavigate}
          onPress={onPrevious}
        >
          <SearchToolbarPreviousIcon />
        </SearchToolbarAction>
        <SearchToolbarAction
          ariaLabel={texts.nextResult}
          title={texts.nextResult}
          disabled={!canNavigate}
          onPress={onNext}
        >
          <SearchToolbarNextIcon />
        </SearchToolbarAction>
        <SearchToolbarAction
          ariaLabel={texts.closeSearch}
          title={texts.closeSearch}
          onPress={onClose}
        >
          <SearchToolbarCloseIcon />
        </SearchToolbarAction>
      </div>
    </div>
  );
};
