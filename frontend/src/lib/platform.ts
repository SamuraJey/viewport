/** True when the current platform is Apple (macOS/iOS/iPadOS).
 *  Used for platform-aware keyboard hints (⌘ vs Ctrl). */
export const isMacPlatform =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
