import type { ArchiveAnalyticsResponse, ArchiveBrowserResponse, CasebookPayload, DatasetBrowserResponse, DemoState, InferenceStatus, QueueResponse, ReviewListResponse, ReviewRecord, ReviewUpdateRequest, UploadedPackageScoreResponse } from '../types/api';

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

async function postCsv<T>(url: string, csvText: string): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/csv' },
    body: csvText,
  });
  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const payload = await response.json() as { detail?: unknown };
      const value = payload.detail;
      if (typeof value === 'string') detail = value;
      else if (value && typeof value === 'object') {
        const data = value as { error?: string; missing_columns?: string[]; fields?: Array<{ column?: string; rows?: number[] }> };
        if (data.error === 'missing_required_columns' && data.missing_columns?.length) detail = `Kolom wajib belum ada: ${data.missing_columns.join(', ')}`;
        else if (data.error === 'invalid_numeric_fields' && data.fields?.length) detail = `Angka tidak valid di kolom ${data.fields.map((field) => field.column).join(', ')}`;
        else if (data.error === 'invalid_date_fields' && data.fields?.length) detail = `Tanggal tidak valid di kolom ${data.fields.map((field) => field.column).join(', ')}`;
        else if (data.error) detail = data.error;
      }
    } catch {
      // Keep the HTTP fallback message.
    }
    throw new Error(detail);
  }
  return response.json() as Promise<T>;
}

async function uploadCsv<T>(url: string, file: File): Promise<T> {
  return postCsv<T>(url, await file.text());
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
  review: (caseId: string) => getJson<ReviewRecord>(`/api/reviews/${encodeURIComponent(caseId)}`),
  saveReview: (caseId: string, payload: ReviewUpdateRequest) => putJson<ReviewRecord>(`/api/reviews/${encodeURIComponent(caseId)}`, payload),
  casebook: (caseId: string) => getJson<CasebookPayload>(`/api/casebook/${encodeURIComponent(caseId)}`),
  exportUrl: (caseId: string) => `/api/casebook/${encodeURIComponent(caseId)}/export.html`,
  uploadTenderPackages: (file: File) => uploadCsv<UploadedPackageScoreResponse>('/api/uploads/tender-packages', file),
  scoreTenderPackageCsv: (csvText: string) => postCsv<UploadedPackageScoreResponse>('/api/uploads/tender-packages', csvText),
  tenderPackageTemplateUrl: () => '/api/uploads/tender-packages/template',
};
