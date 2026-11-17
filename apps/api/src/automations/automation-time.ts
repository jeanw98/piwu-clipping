/** Wall-clock date and minute-of-day of `date` in an IANA time zone. */
export function localParts(date: Date, timeZone: string): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '00';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

/** True when today's run time has passed and today's scheduled run has not fired yet. */
export function isDue(
  automation: { enabled: boolean; runHour: number; runMinute: number; timezone: string; lastScheduledDate: string | null },
  now: Date,
): { due: boolean; localDate: string } {
  const local = localParts(now, automation.timezone);
  const due =
    automation.enabled &&
    local.minutes >= automation.runHour * 60 + automation.runMinute &&
    automation.lastScheduledDate !== local.date;
  return { due, localDate: local.date };
}

/** Next time the automation will fire (for the UI). */
export function nextRunAt(
  automation: { enabled: boolean; runHour: number; runMinute: number; timezone: string; lastScheduledDate: string | null },
  now: Date,
): Date | null {
  if (!automation.enabled) return null;
  const target = automation.runHour * 60 + automation.runMinute;
  // Walk forward minute-accurately over the next 48 h; cheap and DST-safe.
  const start = Math.ceil(now.getTime() / 60_000) * 60_000;
  for (let offset = 0; offset <= 48 * 60; offset += 1) {
    const candidate = new Date(start + offset * 60_000);
    const local = localParts(candidate, automation.timezone);
    if (local.minutes === target && local.date !== automation.lastScheduledDate) return candidate;
  }
  return null;
}
