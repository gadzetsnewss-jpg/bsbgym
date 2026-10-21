/** Small date helpers shared by finance screens (dates only, no time zones). */

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function startOfMonthIso(): string {
  return `${todayIso().slice(0, 7)}-01`;
}

/** Default finance window: current calendar month to date. */
export function defaultFinanceRange(): { from: string; to: string } {
  return { from: startOfMonthIso(), to: todayIso() };
}
