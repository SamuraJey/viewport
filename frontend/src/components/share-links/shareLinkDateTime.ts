const UTC_DATE_SUFFIX_RE = /([zZ]|[+-]\d{2}:\d{2})$/;

const parseUtcDate = (value: string | null): Date | null => {
    if (!value) {
        return null;
    }

    const normalizedValue = UTC_DATE_SUFFIX_RE.test(value) ? value : `${value}Z`;
    const date = new Date(normalizedValue);

    if (Number.isNaN(date.getTime())) {
        return null;
    }

    return date;
};

const pad = (value: number) => String(value).padStart(2, '0');

export const formatUtcDateTimeInputValue = (isoValue: string | null): string => {
    const date = parseUtcDate(isoValue);
    if (!date) {
        return '';
    }

    const year = date.getUTCFullYear();
    const month = pad(date.getUTCMonth() + 1);
    const day = pad(date.getUTCDate());
    const hours = pad(date.getUTCHours());
    const minutes = pad(date.getUTCMinutes());

    return `${year}-${month}-${day}T${hours}:${minutes}`;
};

export const parseUtcDateTimeInputValue = (value: string): string | null => {
    if (!value) {
        return null;
    }

    const date = parseUtcDate(`${value}Z`);
    if (!date) {
        return null;
    }

    return date.toISOString();
};
