import { api } from '../lib/api';
import { isDemoModeEnabled } from '../lib/demoMode';
import { getDemoService } from './demoService';
import type {
  ShareLink,
  ShareLinkAnalyticsResponse,
  SelectionConfig,
  SelectionConfigUpdateRequest,
  SelectionPhotoCommentRequest,
  SelectionSession,
  SelectionSessionStartRequest,
  SelectionSessionUpdateRequest,
  SelectionSubmitResponse,
  SelectionToggleResponse,
  OwnerSelectionDetail,
  OwnerSelectionRow,
  BulkSelectionActionResponse,
  ShareLinkCreateRequest,
  ShareLinksDashboardResponse,
  ShareLinkUpdateRequest,
  PublicPhoto,
  SharedGallery,
  SharedGalleryQueryOptions,
} from '../types';

// Re-export types for backward compatibility
export type {
  ShareLink,
  ShareLinksDashboardResponse,
  ShareLinkAnalyticsResponse,
  ShareLinkUpdateRequest,
  PublicPhoto,
  SharedGallery,
  SelectionConfig,
  SelectionSession,
  SelectionSubmitResponse,
  OwnerSelectionDetail,
  OwnerSelectionRow,
};

const triggerBlobDownload = (blob: Blob, filename: string): void => {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
};

const parseDownloadFilename = (
  contentDisposition: string | null | undefined,
  fallback: string,
): string => {
  if (!contentDisposition) {
    return fallback;
  }

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]).replace(/[/\\]/g, '_');
  }

  const simpleMatch = contentDisposition.match(/filename="([^"]+)"/i);
  if (simpleMatch?.[1]) {
    return simpleMatch[1].replace(/[/\\]/g, '_');
  }

  return fallback;
};

const downloadOwnerExport = async (path: string, fallbackFilename: string): Promise<void> => {
  const response = await api.get<Blob>(path, { responseType: 'blob' });
  const contentDisposition =
    (response.headers['content-disposition'] as string | undefined) ??
    (response.headers['Content-Disposition' as keyof typeof response.headers] as
      | string
      | undefined);
  const filename = parseDownloadFilename(contentDisposition, fallbackFilename);
  triggerBlobDownload(response.data, filename);
};

const getShareLinks = async (galleryId: string): Promise<ShareLink[]> => {
  if (isDemoModeEnabled()) {
    return getDemoService().getShareLinks(galleryId);
  }

  const response = await api.get<ShareLink[]>(`/galleries/${galleryId}/share-links`);
  return response.data;
};

const createShareLink = async (
  galleryId: string,
  payload?: ShareLinkCreateRequest,
): Promise<ShareLink> => {
  if (isDemoModeEnabled()) {
    return getDemoService().createShareLink(galleryId, payload);
  }

  const response = await api.post<ShareLink>(
    `/galleries/${galleryId}/share-links`,
    payload ?? { expires_at: null },
  );
  return response.data;
};

const updateShareLink = async (
  galleryId: string,
  shareLinkId: string,
  payload: ShareLinkUpdateRequest,
): Promise<ShareLink> => {
  if (isDemoModeEnabled()) {
    return getDemoService().updateShareLink(galleryId, shareLinkId, payload);
  }

  const response = await api.patch<ShareLink>(
    `/galleries/${galleryId}/share-links/${shareLinkId}`,
    payload,
  );
  return response.data;
};

const deleteShareLink = async (galleryId: string, shareLinkId: string): Promise<void> => {
  if (isDemoModeEnabled()) {
    await getDemoService().deleteShareLink(galleryId, shareLinkId);
    return;
  }

  await api.delete(`/galleries/${galleryId}/share-links/${shareLinkId}`);
};

const getSharedGallery = async (
  shareId: string,
  options?: SharedGalleryQueryOptions,
): Promise<SharedGallery> => {
  if (isDemoModeEnabled()) {
    return getDemoService().getSharedGallery(shareId, options);
  }

  const params = new URLSearchParams();
  if (options?.limit !== undefined) {
    params.append('limit', options.limit.toString());
  }
  if (options?.offset !== undefined) {
    params.append('offset', options.offset.toString());
  }

  const nestedGalleryId = options?.galleryId ?? options?.folderId;
  const basePath = nestedGalleryId ? `/s/${shareId}/galleries/${nestedGalleryId}` : `/s/${shareId}`;
  const queryString = params.toString();
  const url = queryString ? `${basePath}?${queryString}` : basePath;
  const headers: Record<string, string> = {
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
  };
  if (options?.skipProjectViewCount) {
    headers['X-Viewport-Internal-Navigation'] = '1';
  }

  const response = await api.get(url, {
    headers,
  });
  return response.data;
};

const getProjectShareLinks = async (projectId: string): Promise<ShareLink[]> => {
  if (isDemoModeEnabled()) {
    return getDemoService().getProjectShareLinks(projectId);
  }

  const response = await api.get<ShareLink[]>(`/projects/${projectId}/share-links`);
  return response.data;
};

const getProjectWarningShareLinks = async (projectId: string): Promise<ShareLink[]> => {
  if (isDemoModeEnabled()) {
    return getDemoService().getProjectWarningShareLinks(projectId);
  }

  const response = await api.get<ShareLink[]>(`/projects/${projectId}/share-links/warnings`);
  return response.data;
};

const createProjectShareLink = async (
  projectId: string,
  payload?: ShareLinkCreateRequest,
): Promise<ShareLink> => {
  if (isDemoModeEnabled()) {
    return getDemoService().createProjectShareLink(projectId, payload);
  }

  const response = await api.post<ShareLink>(
    `/projects/${projectId}/share-links`,
    payload ?? { expires_at: null },
  );
  return response.data;
};

const updateProjectShareLink = async (
  projectId: string,
  shareLinkId: string,
  payload: ShareLinkUpdateRequest,
): Promise<ShareLink> => {
  if (isDemoModeEnabled()) {
    return getDemoService().updateProjectShareLink(projectId, shareLinkId, payload);
  }

  const response = await api.patch<ShareLink>(
    `/projects/${projectId}/share-links/${shareLinkId}`,
    payload,
  );
  return response.data;
};

const deleteProjectShareLink = async (projectId: string, shareLinkId: string): Promise<void> => {
  if (isDemoModeEnabled()) {
    await getDemoService().deleteProjectShareLink(projectId, shareLinkId);
    return;
  }

  await api.delete(`/projects/${projectId}/share-links/${shareLinkId}`);
};

const getOwnerShareLinks = async (
  page = 1,
  size = 20,
  search?: string,
  status?: 'active' | 'inactive' | 'expired',
): Promise<ShareLinksDashboardResponse> => {
  if (isDemoModeEnabled()) {
    return getDemoService().getOwnerShareLinks(page, size, search, status);
  }

  const params = new URLSearchParams({
    page: page.toString(),
    size: size.toString(),
  });
  if (search && search.trim().length > 0) {
    params.set('search', search.trim());
  }
  if (status) {
    params.set('status', status);
  }

  const response = await api.get<ShareLinksDashboardResponse>(`/share-links?${params.toString()}`);
  return response.data;
};

const getShareLinkAnalytics = async (
  shareLinkId: string,
  days = 30,
): Promise<ShareLinkAnalyticsResponse> => {
  if (isDemoModeEnabled()) {
    return getDemoService().getShareLinkAnalytics(shareLinkId, days);
  }

  const response = await api.get<ShareLinkAnalyticsResponse>(
    `/share-links/${shareLinkId}/analytics?days=${days}`,
  );
  return response.data;
};

const getPublicPhotoUrl = async (
  shareId: string,
  photoId: string,
): Promise<{ url: string; expires_in: number }> => {
  if (isDemoModeEnabled()) {
    return getDemoService().getPublicPhotoUrl(shareId, photoId);
  }

  const response = await api.get(`/s/${shareId}/photos/${photoId}/url`);
  return response.data;
};

const getAllPublicPhotoUrls = async (shareId: string): Promise<PublicPhoto[]> => {
  if (isDemoModeEnabled()) {
    return getDemoService().getAllPublicPhotoUrls(shareId);
  }

  const response = await api.get(`/s/${shareId}/photos/urls`);
  return response.data;
};

const getPublicPhotosByIds = async (
  shareId: string,
  photoIds: string[],
): Promise<PublicPhoto[]> => {
  if (isDemoModeEnabled()) {
    return getDemoService().getPublicPhotosByIds(shareId, photoIds);
  }

  const params = new URLSearchParams();
  photoIds.forEach((photoId) => {
    if (photoId.trim().length > 0) {
      params.append('photo_ids', photoId.trim());
    }
  });

  if (!params.toString()) {
    return [];
  }

  const response = await api.get<PublicPhoto[]>(`/s/${shareId}/photos/by-ids?${params.toString()}`);
  return response.data;
};

const getPublicSelectionConfig = async (shareId: string): Promise<SelectionConfig> => {
  if (isDemoModeEnabled()) {
    return getDemoService().getPublicSelectionConfig(shareId);
  }

  const response = await api.get<SelectionConfig>(`/s/${shareId}/selection/config`);
  return response.data;
};

const startPublicSelectionSession = async (
  shareId: string,
  payload: SelectionSessionStartRequest,
): Promise<SelectionSession> => {
  if (isDemoModeEnabled()) {
    return getDemoService().startPublicSelectionSession(shareId, payload);
  }

  const response = await api.post<SelectionSession>(`/s/${shareId}/selection/session`, payload);
  return response.data;
};

const getPublicSelectionSession = async (
  shareId: string,
  resumeToken?: string,
): Promise<SelectionSession> => {
  if (isDemoModeEnabled()) {
    return getDemoService().getPublicSelectionSession(shareId, resumeToken);
  }

  const params = new URLSearchParams();
  if (resumeToken && resumeToken.trim().length > 0) {
    params.set('resume_token', resumeToken.trim());
  }
  const query = params.toString();
  const url = query
    ? `/s/${shareId}/selection/session/me?${query}`
    : `/s/${shareId}/selection/session/me`;
  const response = await api.get<SelectionSession>(url);
  return response.data;
};

const togglePublicSelectionItem = async (
  shareId: string,
  photoId: string,
  resumeToken?: string,
): Promise<SelectionToggleResponse> => {
  if (isDemoModeEnabled()) {
    return getDemoService().togglePublicSelectionItem(shareId, photoId, resumeToken);
  }

  const params = new URLSearchParams();
  if (resumeToken && resumeToken.trim().length > 0) {
    params.set('resume_token', resumeToken.trim());
  }
  const query = params.toString();
  const url = query
    ? `/s/${shareId}/selection/session/items/${photoId}?${query}`
    : `/s/${shareId}/selection/session/items/${photoId}`;
  const response = await api.put<SelectionToggleResponse>(url);
  return response.data;
};

const updatePublicSelectionItemComment = async (
  shareId: string,
  photoId: string,
  payload: SelectionPhotoCommentRequest,
  resumeToken?: string,
): Promise<SelectionSession['items'][number]> => {
  if (isDemoModeEnabled()) {
    return getDemoService().updatePublicSelectionItemComment(
      shareId,
      photoId,
      payload,
      resumeToken,
    );
  }

  const params = new URLSearchParams();
  if (resumeToken && resumeToken.trim().length > 0) {
    params.set('resume_token', resumeToken.trim());
  }
  const query = params.toString();
  const url = query
    ? `/s/${shareId}/selection/session/items/${photoId}?${query}`
    : `/s/${shareId}/selection/session/items/${photoId}`;
  const response = await api.patch<SelectionSession['items'][number]>(url, payload);
  return response.data;
};

const updatePublicSelectionSession = async (
  shareId: string,
  payload: SelectionSessionUpdateRequest,
  resumeToken?: string,
): Promise<SelectionSession> => {
  if (isDemoModeEnabled()) {
    return getDemoService().updatePublicSelectionSession(shareId, payload, resumeToken);
  }

  const params = new URLSearchParams();
  if (resumeToken && resumeToken.trim().length > 0) {
    params.set('resume_token', resumeToken.trim());
  }
  const query = params.toString();
  const url = query
    ? `/s/${shareId}/selection/session?${query}`
    : `/s/${shareId}/selection/session`;
  const response = await api.patch<SelectionSession>(url, payload);
  return response.data;
};

const submitPublicSelectionSession = async (
  shareId: string,
  resumeToken?: string,
): Promise<SelectionSubmitResponse> => {
  if (isDemoModeEnabled()) {
    return getDemoService().submitPublicSelectionSession(shareId, resumeToken);
  }

  const params = new URLSearchParams();
  if (resumeToken && resumeToken.trim().length > 0) {
    params.set('resume_token', resumeToken.trim());
  }
  const query = params.toString();
  const url = query
    ? `/s/${shareId}/selection/session/submit?${query}`
    : `/s/${shareId}/selection/session/submit`;
  const response = await api.post<SelectionSubmitResponse>(url);
  return response.data;
};

const getOwnerSelectionConfig = async (
  galleryId: string,
  shareLinkId: string,
): Promise<SelectionConfig> => {
  if (isDemoModeEnabled()) {
    return getDemoService().getOwnerSelectionConfig(galleryId, shareLinkId);
  }

  const response = await api.get<SelectionConfig>(
    `/galleries/${galleryId}/share-links/${shareLinkId}/selection-config`,
  );
  return response.data;
};

const updateOwnerSelectionConfig = async (
  galleryId: string,
  shareLinkId: string,
  payload: SelectionConfigUpdateRequest,
): Promise<SelectionConfig> => {
  if (isDemoModeEnabled()) {
    return getDemoService().updateOwnerSelectionConfig(galleryId, shareLinkId, payload);
  }

  const response = await api.patch<SelectionConfig>(
    `/galleries/${galleryId}/share-links/${shareLinkId}/selection-config`,
    payload,
  );
  return response.data;
};

const getShareLinkSelectionConfig = async (shareLinkId: string): Promise<SelectionConfig> => {
  if (isDemoModeEnabled()) {
    return getDemoService().getShareLinkSelectionConfig(shareLinkId);
  }

  const response = await api.get<SelectionConfig>(`/share-links/${shareLinkId}/selection-config`);
  return response.data;
};

const updateShareLinkSelectionConfig = async (
  shareLinkId: string,
  payload: SelectionConfigUpdateRequest,
): Promise<SelectionConfig> => {
  if (isDemoModeEnabled()) {
    return getDemoService().updateShareLinkSelectionConfig(shareLinkId, payload);
  }

  const response = await api.patch<SelectionConfig>(
    `/share-links/${shareLinkId}/selection-config`,
    payload,
  );
  return response.data;
};

const getOwnerSelectionDetail = async (shareLinkId: string): Promise<OwnerSelectionDetail> => {
  if (isDemoModeEnabled()) {
    return getDemoService().getOwnerSelectionDetail(shareLinkId);
  }

  const response = await api.get<OwnerSelectionDetail>(`/share-links/${shareLinkId}/selection`);
  return response.data;
};

const closeOwnerSelection = async (shareLinkId: string): Promise<SelectionSession> => {
  if (isDemoModeEnabled()) {
    return getDemoService().closeOwnerSelection(shareLinkId);
  }

  const response = await api.post<SelectionSession>(`/share-links/${shareLinkId}/selection/close`);
  return response.data;
};

const reopenOwnerSelection = async (shareLinkId: string): Promise<SelectionSession> => {
  if (isDemoModeEnabled()) {
    return getDemoService().reopenOwnerSelection(shareLinkId);
  }

  const response = await api.post<SelectionSession>(`/share-links/${shareLinkId}/selection/reopen`);
  return response.data;
};

const getOwnerSelectionSessionDetail = async (
  shareLinkId: string,
  sessionId: string,
): Promise<SelectionSession> => {
  if (isDemoModeEnabled()) {
    return getDemoService().getOwnerSelectionSessionDetail(shareLinkId, sessionId);
  }

  const response = await api.get<SelectionSession>(
    `/share-links/${shareLinkId}/selection/sessions/${sessionId}`,
  );
  return response.data;
};

const closeOwnerSelectionSession = async (
  shareLinkId: string,
  sessionId: string,
): Promise<SelectionSession> => {
  if (isDemoModeEnabled()) {
    return getDemoService().closeOwnerSelectionSession(shareLinkId, sessionId);
  }

  const response = await api.post<SelectionSession>(
    `/share-links/${shareLinkId}/selection/sessions/${sessionId}/close`,
  );
  return response.data;
};

const reopenOwnerSelectionSession = async (
  shareLinkId: string,
  sessionId: string,
): Promise<SelectionSession> => {
  if (isDemoModeEnabled()) {
    return getDemoService().reopenOwnerSelectionSession(shareLinkId, sessionId);
  }

  const response = await api.post<SelectionSession>(
    `/share-links/${shareLinkId}/selection/sessions/${sessionId}/reopen`,
  );
  return response.data;
};

const getGallerySelections = async (galleryId: string): Promise<OwnerSelectionRow[]> => {
  if (isDemoModeEnabled()) {
    return getDemoService().getGallerySelections(galleryId);
  }

  const response = await api.get<OwnerSelectionRow[]>(`/galleries/${galleryId}/selections`);
  return response.data;
};

const closeAllGallerySelections = async (
  galleryId: string,
): Promise<BulkSelectionActionResponse> => {
  if (isDemoModeEnabled()) {
    return getDemoService().closeAllGallerySelections(galleryId);
  }

  const response = await api.post<BulkSelectionActionResponse>(
    `/galleries/${galleryId}/selections/actions/close-all`,
  );
  return response.data;
};

const openAllGallerySelections = async (
  galleryId: string,
): Promise<BulkSelectionActionResponse> => {
  if (isDemoModeEnabled()) {
    return getDemoService().openAllGallerySelections(galleryId);
  }

  const response = await api.post<BulkSelectionActionResponse>(
    `/galleries/${galleryId}/selections/actions/open-all`,
  );
  return response.data;
};

const exportShareLinkSelectionFilesCsv = async (shareLinkId: string): Promise<void> => {
  if (isDemoModeEnabled()) {
    await getDemoService().exportShareLinkSelectionFilesCsv(shareLinkId);
    return;
  }
  await downloadOwnerExport(
    `/share-links/${shareLinkId}/selection/export/files.csv`,
    `selection_${shareLinkId}_files.csv`,
  );
};

const exportShareLinkSelectionLightroom = async (shareLinkId: string): Promise<void> => {
  if (isDemoModeEnabled()) {
    await getDemoService().exportShareLinkSelectionLightroom(shareLinkId);
    return;
  }
  await downloadOwnerExport(
    `/share-links/${shareLinkId}/selection/export/lightroom.txt`,
    `selection_${shareLinkId}_lightroom.txt`,
  );
};

const exportGallerySelectionSummaryCsv = async (galleryId: string): Promise<void> => {
  if (isDemoModeEnabled()) {
    await getDemoService().exportGallerySelectionSummaryCsv(galleryId);
    return;
  }
  await downloadOwnerExport(
    `/galleries/${galleryId}/selections/export/summary.csv`,
    `gallery_${galleryId}_selection_summary.csv`,
  );
};

const exportGallerySelectionLinksCsv = async (galleryId: string): Promise<void> => {
  if (isDemoModeEnabled()) {
    await getDemoService().exportGallerySelectionLinksCsv(galleryId);
    return;
  }
  await downloadOwnerExport(
    `/galleries/${galleryId}/selections/export/links.csv`,
    `gallery_${galleryId}_selection_links.csv`,
  );
};

export const shareLinkService = {
  getShareLinks,
  createShareLink,
  getProjectShareLinks,
  getProjectWarningShareLinks,
  createProjectShareLink,
  updateProjectShareLink,
  deleteProjectShareLink,
  updateShareLink,
  deleteShareLink,
  getSharedGallery,
  getPublicPhotoUrl,
  getAllPublicPhotoUrls,
  getPublicPhotosByIds,
  getOwnerShareLinks,
  getShareLinkAnalytics,
  getPublicSelectionConfig,
  startPublicSelectionSession,
  getPublicSelectionSession,
  togglePublicSelectionItem,
  updatePublicSelectionItemComment,
  updatePublicSelectionSession,
  submitPublicSelectionSession,
  getOwnerSelectionConfig,
  updateOwnerSelectionConfig,
  getShareLinkSelectionConfig,
  updateShareLinkSelectionConfig,
  getOwnerSelectionDetail,
  closeOwnerSelection,
  reopenOwnerSelection,
  getOwnerSelectionSessionDetail,
  closeOwnerSelectionSession,
  reopenOwnerSelectionSession,
  getGallerySelections,
  closeAllGallerySelections,
  openAllGallerySelections,
  exportShareLinkSelectionFilesCsv,
  exportShareLinkSelectionLightroom,
  exportGallerySelectionSummaryCsv,
  exportGallerySelectionLinksCsv,
};
