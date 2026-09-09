/**
 * Format-specific export handlers for the dashboard's export toolbar.
 * The orchestrator validates requests via `validateExportRequest` before
 * ever calling `exportData`; this module never re-validates.
 */

export type ExportFormat = 'csv' | 'json';

export type ExportSource =
  | 'customer-data'
  | 'health-score-report'
  | 'alert-history'
  | 'market-intelligence';

export interface DateRange {
  start: string; // ISO date string
  end: string; // ISO date string
}

export interface ExportRequest {
  format: ExportFormat;
  dateRange: DateRange;
  segment: string;
  source: ExportSource;
}

export interface ExportValidationResult {
  valid: boolean;
  errors: string[];
}

const VALID_FORMATS: readonly ExportFormat[] = ['csv', 'json'];
const VALID_SEGMENTS = ['all', 'enterprise', 'premium', 'basic', 'at-risk', 'healthy'] as const;
const VALID_SOURCES: readonly ExportSource[] = [
  'customer-data',
  'health-score-report',
  'alert-history',
  'market-intelligence',
];

export function validateExportRequest(request: ExportRequest): ExportValidationResult {
  const errors: string[] = [];

  if (!VALID_FORMATS.includes(request.format)) {
    errors.push('Export format must be "csv" or "json".');
  }

  const start = new Date(request.dateRange?.start ?? '');
  const end = new Date(request.dateRange?.end ?? '');
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    errors.push('Date range must contain valid start and end dates.');
  } else if (start > end) {
    errors.push('Start date must be before or equal to the end date.');
  }

  if (!request.segment || !(VALID_SEGMENTS as readonly string[]).includes(request.segment)) {
    errors.push('Customer segment filter is invalid.');
  }

  if (!request.source || !VALID_SOURCES.includes(request.source)) {
    errors.push('Export request is missing a valid requesting widget/source.');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Serializes rows to the requested format. Callers must validate the
 * request with `validateExportRequest` first; this function assumes
 * already-sanitized input and does not re-validate.
 */
export function exportData<T extends Record<string, unknown>>(format: ExportFormat, rows: T[]): string {
  return format === 'json' ? toJson(rows) : toCsv(rows);
}

function toJson<T>(rows: T[]): string {
  return JSON.stringify(rows, null, 2);
}

function toCsv<T extends Record<string, unknown>>(rows: T[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(','));
  }
  return lines.join('\n');
}

export function triggerDownload(filename: string, content: string, format: ExportFormat): void {
  if (typeof document === 'undefined') return; // SSR guard
  const mime = format === 'json' ? 'application/json' : 'text/csv';
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
