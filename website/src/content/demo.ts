/** Fictional, already-started workday. No imports from the desktop application. */
export const fixture = {
  date: '2026-11-03', timeZone: 'Asia/Shanghai',
  salaryMinor: 1_680_000, monthHours: 168,
  periods: [[9 * 3600, 12 * 3600], [13 * 3600, 18 * 3600]],
  initialSecond: 14 * 3600 + 30 * 60,
  endSecond: 18 * 3600, lastSecond: 24 * 3600 - 1,
  priorRecordedMinor: 80_000,
} as const;
