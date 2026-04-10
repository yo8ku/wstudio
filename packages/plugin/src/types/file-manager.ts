/**
 * File manager contracts aligned with file mutation helpers exposed to plugins.
 */

import type { FrontMatterCache } from './metadata';
import type { DataWriteOptions, TAbstractFile, TFile, TFolder } from './vault';

export abstract class FileManager {
  public abstract getNewFileParent(sourcePath: string, newFilePath?: string): TFolder;

  public abstract renameFile(file: TAbstractFile, newPath: string): Promise<void>;

  public abstract promptForDeletion(file: TAbstractFile): Promise<void>;

  public abstract trashFile(file: TAbstractFile): Promise<void>;

  public abstract generateMarkdownLink(
    file: TFile,
    sourcePath: string,
    subpath?: string,
    alias?: string,
  ): string;

  public abstract processFrontMatter(
    file: TFile,
    mutator: (frontmatter: FrontMatterCache) => void,
    options?: DataWriteOptions,
  ): Promise<void>;

  public abstract getAvailablePathForAttachment(
    filename: string,
    sourcePath?: string,
  ): Promise<string>;
}
