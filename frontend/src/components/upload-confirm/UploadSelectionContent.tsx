import { AlertTriangle, FileImage, X } from 'lucide-react';
import { MAX_UPLOAD_FILE_SIZE_MB } from '../../constants/upload';
import { formatFileSize } from '../../lib/utils';
import { getFileUploadErrorText, hasFileUploadError } from './uploadConfirmUtils';

interface UploadSelectionContentProps {
  files: File[];
  totalSize: number;
  hasLargeFiles: boolean;
  hasInvalidTypes: boolean;
  renameWarnings: Array<{ original: string; unique: string }>;
  isUploading: boolean;
  onRemoveFile: (fileIndex: number) => void;
}

export const UploadSelectionContent = ({
  files,
  totalSize,
  hasLargeFiles,
  hasInvalidTypes,
  renameWarnings,
  isUploading,
  onRemoveFile,
}: UploadSelectionContentProps) => {
  return (
    <>
      {(hasLargeFiles || hasInvalidTypes || renameWarnings.length > 0) && (
        <div className="p-4 bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-200 dark:border-yellow-500/20 rounded-2xl shadow-xs">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 shrink-0 text-yellow-600 dark:text-yellow-400 mt-0.5" />
            <div>
              <span className="font-bold text-sm text-yellow-800 dark:text-yellow-200 block mb-2">
                ⚠ Warning
              </span>
              <ul className="text-sm font-medium text-yellow-700 dark:text-yellow-300 space-y-1 ml-4 list-disc">
                {hasLargeFiles && (
                  <li>Files larger than {MAX_UPLOAD_FILE_SIZE_MB}MB will be rejected</li>
                )}
                {hasInvalidTypes && <li>Only JPG and PNG formats are supported</li>}
                {renameWarnings.length > 0 && (
                  <li>
                    Duplicate names will be renamed before upload:
                    <ul className="ml-4 mt-1 space-y-1 list-disc">
                      {renameWarnings.slice(0, 5).map((warning, index) => (
                        <li key={`${warning.original}-${warning.unique}-${index}`}>
                          {warning.original} → {warning.unique}
                        </li>
                      ))}
                      {renameWarnings.length > 5 && (
                        <li>...and {renameWarnings.length - 5} more</li>
                      )}
                    </ul>
                  </li>
                )}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="flex items-center gap-5 p-5 rounded-2xl bg-accent/5 border border-accent/20 shadow-xs">
        <div className="shrink-0 w-14 h-14 rounded-xl bg-accent/20 flex items-center justify-center text-accent">
          <FileImage className="w-7 h-7" />
        </div>
        <div>
          <p className="font-bold text-lg text-text dark:text-white">
            {files.length} Photo{files.length !== 1 ? 's' : ''} Selected
          </p>
          <p className="text-sm font-medium text-muted mt-0.5">
            Total size: {formatFileSize(totalSize)}
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {files.map((file, index) => {
          const hasError = hasFileUploadError(file);
          const fileErrorText = getFileUploadErrorText(file);

          return (
            <div
              key={`${file.name}-${index}`}
              className={`flex items-center gap-4 p-3 rounded-2xl transition-all duration-200 group ${
                hasError
                  ? 'bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20'
                  : 'bg-surface-1 dark:bg-surface-dark-1 border border-border/50 hover:border-accent/30 hover:shadow-sm hover:-translate-y-0.5'
              }`}
            >
              <div
                className={`shrink-0 w-12 h-12 rounded-xl flex items-center justify-center shadow-sm ${
                  hasError ? 'bg-red-100 dark:bg-red-500/20' : 'bg-surface dark:bg-surface-dark-2'
                }`}
              >
                <FileImage
                  className={`w-6 h-6 ${
                    hasError ? 'text-red-500 dark:text-red-400' : 'text-accent'
                  }`}
                />
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-text dark:text-white truncate mb-0.5">
                  {file.name}
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-muted bg-surface/50 dark:bg-surface-dark-2/50 px-2 py-0.5 rounded-md border border-border/30">
                    {formatFileSize(file.size)}
                  </span>
                  {hasError && fileErrorText && (
                    <span className="text-xs text-red-600 dark:text-red-400 font-bold flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      {fileErrorText}
                    </span>
                  )}
                </div>
              </div>

              <button
                onClick={() => onRemoveFile(index)}
                disabled={isUploading}
                className="shrink-0 p-2.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-all duration-200 text-muted hover:text-danger hover:bg-danger/10 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed focus:outline-hidden focus-visible:ring-2 focus-visible:ring-danger"
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
