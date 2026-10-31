const CSKH_REPORTING_VIEWER_EMAILS = new Set([
  'marketing@victoryholdings.com.vn',
  'marketingdirector@victoryholdings.com.vn',
]);

export function isCskhReportingViewerEmail(email?: string | null): boolean {
  return CSKH_REPORTING_VIEWER_EMAILS.has((email || '').trim().toLowerCase());
}
