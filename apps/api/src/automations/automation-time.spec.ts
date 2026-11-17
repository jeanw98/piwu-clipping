import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { isDue, localParts, nextRunAt } from './automation-time';

const base = { enabled: true, runHour: 6, runMinute: 30, timezone: 'America/Guayaquil', lastScheduledDate: null };

describe('automation schedule', () => {
  it('reads wall-clock time in the automation time zone', () => {
    // 11:00 UTC = 06:00 in Guayaquil (UTC-5)
    assert.deepEqual(localParts(new Date('2026-11-17T11:00:00Z'), 'America/Guayaquil'), {
      date: '2026-11-17',
      minutes: 360,
    });
  });

  it('is due only after the run time, once per local day', () => {
    assert.equal(isDue(base, new Date('2026-11-17T11:20:00Z')).due, false); // 06:20
    assert.equal(isDue(base, new Date('2026-11-17T11:35:00Z')).due, true); // 06:35
    assert.equal(
      isDue({ ...base, lastScheduledDate: '2026-11-17' }, new Date('2026-11-17T20:00:00Z')).due,
      false,
    );
    assert.equal(isDue({ ...base, enabled: false }, new Date('2026-11-17T11:35:00Z')).due, false);
  });

  it('local date rolls over by time zone, not UTC', () => {
    // 03:00 UTC on the 18th is still the 17th (22:00) in Guayaquil
    assert.equal(isDue(base, new Date('2026-11-18T03:00:00Z')).localDate, '2026-11-17');
  });

  it('computes the next run', () => {
    assert.equal(nextRunAt(base, new Date('2026-11-17T10:00:00Z'))?.toISOString(), '2026-11-17T11:30:00.000Z');
    assert.equal(
      nextRunAt({ ...base, lastScheduledDate: '2026-11-17' }, new Date('2026-11-17T12:00:00Z'))?.toISOString(),
      '2026-11-18T11:30:00.000Z',
    );
    assert.equal(nextRunAt({ ...base, enabled: false }, new Date()), null);
  });
});
