export function inclusiveDayCount(start: string, end: string): number {
  const from = Date.parse(`${start}T00:00:00`);
  const to = Date.parse(`${end}T00:00:00`);
  if (Number.isNaN(from) || Number.isNaN(to) || to < from) return 0;
  return Math.round((to - from) / 86400000) + 1;
}

export function remainingDaysFromToday(endDate: string, today = new Date().toISOString().slice(0, 10)): number {
  const end = Date.parse(`${endDate}T00:00:00`);
  const now = Date.parse(`${today}T00:00:00`);
  if (Number.isNaN(end) || Number.isNaN(now)) return 0;
  return Math.max(Math.round((end - now) / 86400000), 0);
}

export function remainingFreezeDays(used: number, max: number): number {
  return Math.max(max - used, 0);
}
