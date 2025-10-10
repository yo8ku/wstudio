/**
 * 高级功能 API
 */

export interface SearchOptions {
  query: string;
  caseSensitive?: boolean;
  wholeWord?: boolean;
}

export async function searchInWorkspace(options: SearchOptions): Promise<string[]> {
  return [];
}

export async function indexWorkspace(): Promise<void> {
  console.log('Indexing workspace...');
}



