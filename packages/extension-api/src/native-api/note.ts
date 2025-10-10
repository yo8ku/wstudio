/**
 * 笔记专属 API
 */

export interface Note {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export async function createNote(title: string, content: string): Promise<Note> {
  return {
    id: Date.now().toString(),
    title,
    content,
    tags: [],
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

export async function getNotes(): Promise<Note[]> {
  return [];
}

export async function updateNote(id: string, updates: Partial<Note>): Promise<Note | null> {
  return null;
}

export async function deleteNote(id: string): Promise<boolean> {
  return true;
}



