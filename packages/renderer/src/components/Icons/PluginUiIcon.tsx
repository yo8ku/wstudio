import React, { useMemo } from 'react';
import { Icon } from './Icon';

export interface PluginUiIconProps {
  readonly name?: string | null;
  readonly svgContent?: string | null;
  readonly size?: number;
  readonly className?: string;
  readonly iconSet?: string;
}

function sanitizeSvgContent(svgContent: string): string | null {
  const parsed = new DOMParser().parseFromString(svgContent, 'image/svg+xml');
  const svgEl = parsed.documentElement;

  if (!(svgEl instanceof SVGSVGElement) || svgEl.tagName.toLowerCase() !== 'svg') {
    return null;
  }

  const elements = [svgEl, ...Array.from(svgEl.querySelectorAll('*'))];

  for (const element of elements) {
    if (element.tagName.toLowerCase() === 'script' || element.tagName.toLowerCase() === 'foreignobject') {
      element.remove();
      continue;
    }

    for (const attribute of [...element.attributes]) {
      const attributeName = attribute.name.toLowerCase();
      const attributeValue = attribute.value.trim().toLowerCase();

      if (attributeName.startsWith('on')) {
        element.removeAttribute(attribute.name);
        continue;
      }

      if (
        (attributeName === 'href' || attributeName === 'xlink:href')
        && attributeValue.startsWith('javascript:')
      ) {
        element.removeAttribute(attribute.name);
      }
    }
  }

  svgEl.setAttribute('width', '100%');
  svgEl.setAttribute('height', '100%');
  svgEl.setAttribute('focusable', 'false');
  svgEl.setAttribute('aria-hidden', 'true');

  return new XMLSerializer().serializeToString(svgEl);
}

export const PluginUiIcon: React.FC<PluginUiIconProps> = ({
  name,
  svgContent,
  size = 16,
  className,
  iconSet,
}) => {
  const sanitizedSvgContent = useMemo(
    () => (typeof svgContent === 'string' ? sanitizeSvgContent(svgContent) : null),
    [svgContent],
  );

  if (sanitizedSvgContent !== null) {
    return (
      <span
        className={className}
        style={{
          width: size,
          height: size,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          fontSize: size,
          lineHeight: 0,
        }}
        dangerouslySetInnerHTML={{ __html: sanitizedSvgContent }}
      />
    );
  }

  return (
    <Icon
      iconSet={iconSet}
      name={name ?? 'extensions'}
      size={size}
      className={className}
    />
  );
};

export default PluginUiIcon;
