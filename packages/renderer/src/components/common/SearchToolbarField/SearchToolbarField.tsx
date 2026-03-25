import React from 'react';
import './SearchToolbarField.scss';

export interface SearchToolbarFieldProps extends React.HTMLAttributes<HTMLDivElement> {
  actions?: React.ReactNode;
  actionsClassName?: string;
}

export const SearchToolbarField: React.FC<SearchToolbarFieldProps> = ({
  actions,
  actionsClassName = '',
  children,
  className = '',
  ...rest
}) => {
  const rootClassName = className
    ? `search-toolbar-field ${className}`
    : 'search-toolbar-field';
  const toolbarActionsClassName = actionsClassName
    ? `search-toolbar-field__actions ${actionsClassName}`
    : 'search-toolbar-field__actions';

  return (
    <div className={rootClassName} {...rest}>
      <div className="search-toolbar-field__content">{children}</div>
      {actions ? <div className={toolbarActionsClassName}>{actions}</div> : null}
    </div>
  );
};
