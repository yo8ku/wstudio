/**
 * 扩展搜索组件
 */

import React, { useState } from 'react';

interface ExtensionSearchProps {
  onSearch: (query: string) => void;
}

export const ExtensionSearch: React.FC<ExtensionSearchProps> = ({ onSearch }) => {
  const [query, setQuery] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(query);
  };

  return (
    <form className="extension-search" onSubmit={handleSubmit}>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="搜索扩展..."
      />
      <button type="submit">搜索</button>
    </form>
  );
};



