const DONE_STATUSES = new Set(['completed', 'closed']);
const VIETNAM_TIME_ZONE = 'Asia/Ho_Chi_Minh';

export function todayYmd(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: VIETNAM_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function isOpenTaskOverdue(dueDate?: string, status?: string, today = todayYmd()): boolean {
  const due = (dueDate ?? '').slice(0, 10);
  return Boolean(due) && due < today && !DONE_STATUSES.has(status ?? '');
}

export function getOverdueDays(dueDate?: string, today = todayYmd()): number {
  const due = (dueDate ?? '').slice(0, 10);
  if (!due) return 0;

  const dueTime = Date.parse(`${due}T00:00:00Z`);
  const todayTime = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(dueTime) || Number.isNaN(todayTime) || dueTime >= todayTime) return 0;

  return Math.round((todayTime - dueTime) / 86_400_000);
}
