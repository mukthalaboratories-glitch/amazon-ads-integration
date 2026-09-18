import { spApiClient } from './client';
import { spApiConfig } from './config';

export interface CreateReportResponse {
  reportId: string;
}

export interface ReportStatus {
  reportId: string;
  reportType: string;
  processingStatus: 'IN_PROGRESS' | 'DONE' | 'CANCELLED' | 'FATAL';
  reportDocumentId?: string;
  processingStartTime?: string;
  processingEndTime?: string;
}

export interface ReportDocumentResponse {
  reportDocumentId: string;
  url: string;
  compressionAlgorithm?: string;
}

export async function createReport(reportType: string, dataStartTime?: string, dataEndTime?: string, reportOptions?: Record<string, unknown>): Promise<CreateReportResponse> {
  const body: Record<string, unknown> = {
    reportType,
    marketplaceIds: [spApiConfig.marketplaceId],
  };
  if (dataStartTime) body.dataStartTime = dataStartTime;
  if (dataEndTime) body.dataEndTime = dataEndTime;
  if (reportOptions) body.reportOptions = reportOptions;

  return spApiClient.post<CreateReportResponse>('/reports/2021-06-30/reports', body);
}

export async function getReport(reportId: string): Promise<ReportStatus> {
  return spApiClient.get<ReportStatus>(`/reports/2021-06-30/reports/${reportId}`);
}

export async function getReportDocument(documentId: string): Promise<ReportDocumentResponse> {
  return spApiClient.get<ReportDocumentResponse>(`/reports/2021-06-30/documents/${documentId}`);
}

export async function downloadReportDocument(url: string, compressionAlgorithm?: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());

  if (compressionAlgorithm?.toUpperCase() === 'GZIP' || res.headers.get('content-type')?.includes('gzip') || url.endsWith('.gz')) {
    const { gunzipSync } = await import('zlib');
    return gunzipSync(buf).toString('utf-8');
  }

  return buf.toString('utf-8');
}

export async function requestAndDownloadReport(reportType: string, dataStartTime?: string, dataEndTime?: string, reportOptions?: Record<string, unknown>): Promise<string> {
  const { reportId } = await createReport(reportType, dataStartTime, dataEndTime, reportOptions);
  console.log(`  Report created: ${reportId}`);

  for (let i = 0; i < 120; i++) {
    await new Promise(r => setTimeout(r, 10000));
    const status = await getReport(reportId);
    if (status.processingStatus === 'DONE' && status.reportDocumentId) {
      const doc = await getReportDocument(status.reportDocumentId);
      return downloadReportDocument(doc.url, doc.compressionAlgorithm);
    }
    if (status.processingStatus === 'FATAL' || status.processingStatus === 'CANCELLED') {
      throw new Error(`Report ${reportId} ended with status: ${status.processingStatus}`);
    }
    if (i % 6 === 0) console.log(`  Waiting... status: ${status.processingStatus}`);
  }
  throw new Error(`Report ${reportId} timed out`);
}
