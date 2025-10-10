import { Disposable } from './vscode';

export interface TestController {
  id: string;
  label: string;
}

export function createTestController(id: string, label: string): TestController {
  return { id, label };
}



