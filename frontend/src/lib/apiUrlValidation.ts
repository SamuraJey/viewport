export const API_URL_VALIDATION_MESSAGES = {
  required: 'VITE_API_URL is required for production builds.',
  https: 'VITE_API_URL must use HTTPS in production.',
  absoluteHttps: 'VITE_API_URL must be an absolute HTTPS URL in production.',
} as const;

type ApiUrlValidationOptions = {
  invalidUrlMessage?: string;
};

export const assertRequiredHttpsApiUrl = (
  apiUrl: string | undefined,
  options: ApiUrlValidationOptions = {},
): string => {
  const configuredUrl = apiUrl?.trim();
  if (!configuredUrl) {
    throw new Error(API_URL_VALIDATION_MESSAGES.required);
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(configuredUrl);
  } catch {
    throw new Error(options.invalidUrlMessage ?? API_URL_VALIDATION_MESSAGES.https);
  }

  if (parsedUrl.protocol !== 'https:') {
    throw new Error(API_URL_VALIDATION_MESSAGES.https);
  }

  return configuredUrl;
};
