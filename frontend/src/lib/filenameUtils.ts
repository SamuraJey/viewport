import sanitize from 'sanitize-filename';

/**
 * Sanitizes a filename stem (the part before the extension).
 * Trims whitespace, sanitizes according to OS rules, and removes leading/trailing dots.
 */
export const sanitizeFilenameStem = (stem: string): string => {
    let sanitized = sanitize(stem.trim());
    // Trim dots from start and end of stem
    sanitized = sanitized.replace(/^\.+|\.+$/g, '');
    return sanitized;
};

/**
 * Splited a full filename into stem and extension, while ensuring the stem is safe.
 * If the resulting stem is empty, it uses 'unnamed_file' as a fallback.
 */
export const getSafeNameAndExtension = (filename: string): { stem: string; ext: string } => {
    const lastDotIndex = filename.lastIndexOf('.');

    let stem: string;
    let ext: string;

    if (lastDotIndex > 0) {
        stem = filename.slice(0, lastDotIndex);
        ext = filename.slice(lastDotIndex);
    } else {
        stem = filename;
        ext = '';
    }

    const sanitizedStem = sanitizeFilenameStem(stem);

    if (!sanitizedStem || sanitizedStem.trim().length === 0) {
        return { stem: 'unnamed_file', ext };
    }

    return { stem: sanitizedStem, ext };
};

/**
 * Validates if the sanitized stem contains at least one non-dot character.
 */
export const isValidFilenameStem = (stem: string): boolean => {
    const sanitized = sanitizeFilenameStem(stem);
    return sanitized.length > 0 && sanitized.trim().length > 0;
};
