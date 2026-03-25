import React from 'react';
import {
  getSearchToolbarIconDefinition,
  type SearchToolbarIconName,
} from './SearchToolbarIcon';

interface SearchToolbarIconProps extends React.SVGProps<SVGSVGElement> {
  name: SearchToolbarIconName;
}

export const SearchToolbarIcon: React.FC<SearchToolbarIconProps> = ({
  name,
  children,
  ...rest
}) => {
  const definition = getSearchToolbarIconDefinition(name);

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox={definition.viewBox}
      fill="currentColor"
      aria-hidden="true"
      {...rest}
    >
      {definition.paths.map((pathDefinition, index) => (
        <path
          key={`${name}-${index}`}
          d={pathDefinition.d}
          fillRule={pathDefinition.fillRule}
          clipRule={pathDefinition.clipRule}
        />
      ))}
      {children}
    </svg>
  );
};
