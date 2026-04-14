import { create } from 'zustand';

export type ReadabilityFontScale = '100' | '125' | '150';
export type ReadabilityContrast = 'black-on-white' | 'white-on-black';
export type ReadabilityLineSpacing = 'normal' | 'comfortable' | 'spacious';

export interface ReadabilitySettings {
  enabled: boolean;
  fontScale: ReadabilityFontScale;
  contrast: ReadabilityContrast;
  lineSpacing: ReadabilityLineSpacing;
}

interface ReadabilityState extends ReadabilitySettings {
  isHydrated: boolean;
  setHydrated: (value: boolean) => void;
  hydrate: () => void;
  setEnabled: (enabled: boolean) => void;
  toggleEnabled: () => void;
  setFontScale: (fontScale: ReadabilityFontScale) => void;
  setContrast: (contrast: ReadabilityContrast) => void;
  setLineSpacing: (lineSpacing: ReadabilityLineSpacing) => void;
  reset: () => void;
}

const READABILITY_STORAGE_KEY = 'readability-preferences';

const DEFAULT_SETTINGS: ReadabilitySettings = {
  enabled: false,
  fontScale: '100',
  contrast: 'black-on-white',
  lineSpacing: 'normal',
};

const isFontScale = (value: unknown): value is ReadabilityFontScale =>
  value === '100' || value === '125' || value === '150';

const normalizeContrast = (value: unknown): ReadabilityContrast | null => {
  switch (value) {
    case 'black-on-white':
      return 'black-on-white';
    case 'white-on-black':
      return 'white-on-black';
    default:
      return null;
  }
};

const normalizeLineSpacing = (value: unknown): ReadabilityLineSpacing | null => {
  switch (value) {
    case 'normal':
      return 'normal';
    case 'comfortable':
      return 'comfortable';
    case 'spacious':
      return 'spacious';
    default:
      return null;
  }
};

const parseStoredSettings = (): ReadabilitySettings => {
  if (typeof window === 'undefined') {
    return DEFAULT_SETTINGS;
  }

  try {
    const raw = window.localStorage.getItem(READABILITY_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_SETTINGS;
    }

    const parsed = JSON.parse(raw) as Partial<ReadabilitySettings>;

    return {
      enabled: parsed.enabled === true,
      fontScale: isFontScale(parsed.fontScale) ? parsed.fontScale : DEFAULT_SETTINGS.fontScale,
      contrast: normalizeContrast(parsed.contrast) ?? DEFAULT_SETTINGS.contrast,
      lineSpacing: normalizeLineSpacing(parsed.lineSpacing) ?? DEFAULT_SETTINGS.lineSpacing,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
};

const applyReadabilitySettings = (settings: ReadabilitySettings) => {
  if (typeof document === 'undefined') {
    return;
  }

  const root = document.documentElement;
  root.dataset.readabilityMode = settings.enabled ? 'on' : 'off';
  root.dataset.readabilityFontScale = settings.fontScale;
  root.dataset.readabilityContrast = settings.contrast;
  root.dataset.readabilityLineSpacing = settings.lineSpacing;
};

const persistReadabilitySettings = (settings: ReadabilitySettings) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(READABILITY_STORAGE_KEY, JSON.stringify(settings));
};

const initialSettings = parseStoredSettings();
applyReadabilitySettings(initialSettings);

const updateSettings = (
  currentState: ReadabilityState,
  partial: Partial<ReadabilitySettings>,
): Partial<ReadabilityState> => {
  const nextSettings: ReadabilitySettings = {
    enabled: partial.enabled ?? currentState.enabled,
    fontScale: partial.fontScale ?? currentState.fontScale,
    contrast: partial.contrast ?? currentState.contrast,
    lineSpacing: partial.lineSpacing ?? currentState.lineSpacing,
  };

  persistReadabilitySettings(nextSettings);
  applyReadabilitySettings(nextSettings);

  return nextSettings;
};

export const useReadabilityStore = create<ReadabilityState>()((set) => ({
  ...initialSettings,
  isHydrated: false,
  setHydrated: (value) => set({ isHydrated: value }),
  hydrate: () => {
    const nextSettings = parseStoredSettings();
    applyReadabilitySettings(nextSettings);
    set({ ...nextSettings, isHydrated: true });
  },
  setEnabled: (enabled) => set((state) => updateSettings(state, { enabled })),
  toggleEnabled: () => set((state) => updateSettings(state, { enabled: !state.enabled })),
  setFontScale: (fontScale) => set((state) => updateSettings(state, { fontScale })),
  setContrast: (contrast) => set((state) => updateSettings(state, { contrast })),
  setLineSpacing: (lineSpacing) => set((state) => updateSettings(state, { lineSpacing })),
  reset: () => {
    const nextSettings = { ...DEFAULT_SETTINGS };
    persistReadabilitySettings(nextSettings);
    applyReadabilitySettings(nextSettings);
    set(nextSettings);
  },
}));

export const readabilityStorageKey = READABILITY_STORAGE_KEY;
