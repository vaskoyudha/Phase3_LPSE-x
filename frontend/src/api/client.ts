import type { ArchiveAnalyticsResponse, ArchiveBrowserResponse, DatasetBrowserResponse, DemoState, InferenceStatus, QueueResponse, ReviewListResponse, ReviewRecord, ReviewUpdateRequest } from '../types/api';

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}


async function putJson<T>(url: string, payload: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  demoState: () => getJson<DemoState>('/api/demo-state'),
  inferenceStatus: () => getJson<InferenceStatus>('/api/inference-status'),
  queue: (params: URLSearchParams = new URLSearchParams()) => {
    const query = params.toString();
    return getJson<QueueResponse>(`/api/queue${query ? `?${query}` : ''}`);
  },
  dataset: (params: URLSearchParams = new URLSearchParams()) => {
    const query = params.toString();
    return getJson<DatasetBrowserResponse>(`/api/dataset${query ? `?${query}` : ''}`);
  },
  archive: (params: URLSearchParams = new URLSearchParams()) => {
    const query = params.toString();
    return getJson<ArchiveBrowserResponse>(`/api/archive${query ? `?${query}` : ''}`);
  },
  archiveAnalytics: (params: URLSearchParams = new URLSearchParams()) => {
    const query = params.toString();
    return getJson<ArchiveAnalyticsResponse>(`/api/archive/analytics${query ? `?${query}` : ''}`);
  },
  reviews: (params: URLSearchParams = new URLSearchParams()) => {
    const query = params.toString();
    return getJson<ReviewListResponse>(`/api/reviews${query ? `?${query}` : ''}`);
  },
};
