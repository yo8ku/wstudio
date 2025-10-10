import { Disposable } from './vscode';

export interface CommentController {
  id: string;
  label: string;
}

export function createCommentController(id: string, label: string): CommentController {
  return { id, label };
}



