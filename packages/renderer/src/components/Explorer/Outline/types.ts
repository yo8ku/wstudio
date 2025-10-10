export interface OutlineNode {
  id: string;
  name: string;
  kind: OutlineSymbolKind;
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  children?: OutlineNode[];
  expanded?: boolean;
}

export enum OutlineSymbolKind {
  File = 0,
  Module = 1,
  Namespace = 2,
  Package = 3,
  Class = 4,
  Method = 5,
  Property = 6,
  Field = 7,
  Constructor = 8,
  Enum = 9,
  Interface = 10,
  Function = 11,
  Variable = 12,
  Constant = 13,
  String = 14,
  Number = 15,
  Boolean = 16,
  Array = 17,
  Object = 18,
  Key = 19,
  Null = 20,
  EnumMember = 21,
  Struct = 22,
  Event = 23,
  Operator = 24,
  TypeParameter = 25,
}

export interface OutlineAction {
  id: string;
  icon: string;
  tooltip: string;
  onClick: () => void;
}





















