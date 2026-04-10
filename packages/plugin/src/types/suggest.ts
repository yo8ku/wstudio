/**
 * Suggestion and search result types shared by modal and inline completion APIs.
 */

export interface Instruction {
  readonly command: string;
  readonly purpose: string;
}

export interface ISuggestOwner<TValue> {
  renderSuggestion(value: TValue, el: HTMLElement): void;
  selectSuggestion(value: TValue, evt: MouseEvent | KeyboardEvent): void;
}

export type SearchMatchPart = [number, number];

export type SearchMatches = SearchMatchPart[];

export interface SearchResult {
  readonly score: number;
  readonly matches: SearchMatches;
}

export interface SearchResultContainer {
  readonly match: SearchResult;
}

export interface FuzzyMatch<TValue> {
  readonly item: TValue;
  readonly match: SearchResult;
}

export type SuggestionValue =
  | string
  | number
  | boolean
  | bigint
  | symbol
  | object
  | null
  | undefined;
