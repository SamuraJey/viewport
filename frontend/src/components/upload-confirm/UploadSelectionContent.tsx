import { AlertTriangle, FileImage, X } from 'lucide-react';
import { formatFileSize } from '../../lib/utils';
import {
  getFileUploadErrorText,
  hasFileUploadError,
  isFileTypeInvalid,
  isFileTooLarge,
} from './uploadConfirmUtils';

interface UploadSelectionContentProps {
  files: File[];
  totalSize: number;
  hasLargeFiles: boolean;
  hasInvalidTypes: boolean;
  isUploading: boolean;
  onRemoveFile: (fileName: string) => void;
}

export const UploadSelectionContent = ({
  files,
  totalSize,
  hasLargeFiles,
  hasInvalidTypes,
  isUploading,
  onRemoveFile,
}: UploadSelectionContentProps) => {
  return (
    <>
      {(hasLargeFiles || hasInvalidTypes) && (
        <div className="p-4 bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-200 dark:border-yellow-500/20 rounded-lg animate-in fade-in">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 shrink-0 text-yellow-600 dark:text-yellow-400 mt-0.5" />
            <div>
              <span className="font-semibold text-sm text-yellow-800 dark:text-yellow-200 block mb-2">
                ⚠ Warning
              </span>
              <ul className="text-xs sm:text-sm text-yellow-700 dark:text-yellow-300 space-y-1">
                {hasLargeFiles && <li>• Files larger than 10MB will be rejected</li>}
                {hasInvalidTypes && <li>• Only JPG and PNG formats are supported</li>}
              </ul>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 p-4 rounded-lg bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20">
        <div className="shrink-0 w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center">
          <FileImage className="w-5 h-5 text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <p className="font-semibold text-sm text-text dark:text-white">
            {files.length} Photo{files.length !== 1 ? 's' : ''} Selected
          </p>
          <p className="text-xs text-muted">Total size: {formatFileSize(totalSize)}</p>
        </div>
      </div>

      <div className="space-y-2">
        {files.map((file, index) => {
          const hasError = hasFileUploadError(file);
          const isInvalid = isFileTypeInvalid(file);
          const isLarge = isFileTooLarge(file);
          const fileErrorText = getFileUploadErrorText(file);

          return (
            <div
              key={`${file.name}-${index}`}
              className={`flex items-start gap-3 p-3 rounded-lg transition-all duration-200 group ${
                hasError
                  ? 'bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20'
                  : 'bg-surface-foreground dark:bg-surface border border-border hover:border-blue-300 dark:hover:border-blue-500/30'
              }`}
            >
              <div className="shrink-0 w-10 h-10 rounded-lg bg-surface dark:bg-surface-foreground flex items-center justify-center">
                <FileImage
                  className={`w-5 h-5 ${
                    hasError ? 'text-red-500 dark:text-red-400' : 'text-blue-500 dark:text-blue-400'
                  }`}
                />
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-xs sm:text-sm font-medium text-text dark:text-white truncate">
                  {file.name}
                </p>
                <p className="text-xs text-muted">{formatFileSize(file.size)}</p>
                {hasError && fileErrorText && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-medium">
                    {fileErrorText}
                  </p>
                )}
              </div>

              <button
                onClick={() => onRemoveFile(file.name)}
                disabled={isUploading}
                className="shrink-0 p-2 opacity-0 group-hover:opacity-100 transition-all duration-200 text-red-500 hover:text-red-600 hover:bg-red-100 dark:hover:bg-red-500/20 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                title="Remove file"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
};
