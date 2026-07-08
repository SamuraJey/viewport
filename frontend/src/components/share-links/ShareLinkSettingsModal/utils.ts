import type { SelectionSettingsDraft, TtlPreset } from './types';
import { DEFAULT_SELECTION_DRAFT } from './constants';
import { parseUtcDateTimeInputValue } from '../shareLinkDateTime';

export const parseSelectionLimit = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 1) {
    return null;
  }

  return parsed;
};

export const addHoursIso = (hours: number): string => {
  const date = new Date(Date.now() + hours * 60 * 60 * 1000);
  return date.toISOString();
};

export const resolvePresetExpiry = (preset: TtlPreset, customValue: string): string | null => {
  if (preset === 'none') {
    return null;
  }
  if (preset === '24h') {
    return addHoursIso(24);
  }
  if (preset === '7d') {
    return addHoursIso(24 * 7);
  }
  if (preset === '30d') {
    return addHoursIso(24 * 30);
  }
  return parseUtcDateTimeInputValue(customValue);
};

export const formatExpirySummary = (expiresAt: string | null): string => {
  if (!expiresAt) {
    return 'No expiration';
  }

  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) {
    return 'Invalid expiration';
  }

  return `${date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  })} UTC`;
};

export const isDefaultSelectionDraft = (draft: SelectionSettingsDraft): boolean =>
  draft.is_enabled === DEFAULT_SELECTION_DRAFT.is_enabled &&
  draft.list_title.trim() === DEFAULT_SELECTION_DRAFT.list_title &&
  draft.limit_enabled === DEFAULT_SELECTION_DRAFT.limit_enabled &&
  draft.limit_value.trim() === DEFAULT_SELECTION_DRAFT.limit_value &&
  draft.allow_photo_comments === DEFAULT_SELECTION_DRAFT.allow_photo_comments &&
  draft.require_email === DEFAULT_SELECTION_DRAFT.require_email &&
  draft.require_phone === DEFAULT_SELECTION_DRAFT.require_phone &&
  draft.require_client_note === DEFAULT_SELECTION_DRAFT.require_client_note;
