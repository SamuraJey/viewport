/**
 * Ambient declarations for the legacy File System Entry API and the
 * `webkitRelativePath` File property. These are shipped by browsers but are not
 * part of the TypeScript DOM lib, so they are declared here for the directory
 * intake feature (folder drag-and-drop and the `webkitdirectory` picker).
 *
 * The source path is a client-only identifier used to keep same-named files from
 * different subdirectories distinct during deduplication. It is never sent to the
 * backend or persisted.
 */

interface FileSystemEntry {
  readonly isFile: boolean;
  readonly isDirectory: boolean;
  readonly name: string;
  readonly fullPath: string;
}

interface FileSystemFileEntry extends FileSystemEntry {
  readonly isFile: true;
  file(
    successCallback: (file: File) => void,
    errorCallback?: (error: DOMException) => void,
  ): void;
}

interface FileSystemDirectoryEntry extends FileSystemEntry {
  readonly isDirectory: true;
  createReader(): FileSystemDirectoryReader;
}

interface FileSystemDirectoryReader {
  readEntries(
    successCallback: (entries: FileSystemEntry[]) => void,
    errorCallback?: (error: DOMException) => void,
  ): void;
}

interface DataTransferItem {
  getAsEntry?(): FileSystemEntry | null;
  webkitGetAsEntry?(): FileSystemEntry | null;
}

interface File {
  /**
   * Relative path of a file selected through a `webkitdirectory` input, e.g.
   * `photos/2024/beach.jpg`. Empty string when the file was not chosen from a
   * directory picker. Not present in the standard DOM lib.
   */
  readonly webkitRelativePath?: string;
}
