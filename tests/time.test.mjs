// Pure date logic for Inicio (js/core/time.js). Runs in Node: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as t from '../js/core/time.js';

const d = (s, h = 0, m = 0, sec = 0) => { const [y, mo, da] = s.split('-').map(Number); return new Date(y, mo - 1, da, h, m, sec); };

test('parseStart keeps the calendar day of a full ISO and of a plain day', () => {
  assert.equal(t.parseStart('2025-01-15T00:00:00-05:00').getDate(), 15);
  assert.equal(t.parseStart('2025-01-15').getMonth(), 0);
  assert.equal(t.parseStart(''), null);
  assert.equal(t.parseStart('mañana'), null);
});

test('elapsed counts months by calendar, not by 30 days', () => {
  assert.deepEqual(t.elapsed(d('2025-01-31'), d('2025-03-01')), { years: 0, months: 1, days: 1, hours: 0, minutes: 0, seconds: 0, totalDays: 29 });
  const e = t.elapsed(d('2025-01-15'), d('2026-11-19', 10, 5, 7));
  assert.deepEqual([e.years, e.months, e.days, e.hours, e.minutes, e.seconds], [1, 10, 4, 10, 5, 7]);
  assert.equal(e.totalDays, 673);
});

test('elapsed handles leap days and month ends', () => {
  const e = t.elapsed(d('2024-02-29'), d('2025-02-28'));
  assert.deepEqual([e.years, e.months, e.days], [1, 0, 0]);
  const f = t.elapsed(d('2025-03-31'), d('2025-04-30', 23, 59, 59));
  assert.deepEqual([f.months, f.days, f.hours], [1, 0, 23]);
});

test('elapsed is never negative', () => {
  const e = t.elapsed(d('2030-01-01'), d('2026-01-01'));
  assert.ok(Object.values(e).every((v) => v === 0));
  const same = t.elapsed(d('2026-01-01'), d('2026-01-01'));
  assert.equal(same.totalDays, 0);
});

test('nextOccurrence: yearly today, later this year and next year', () => {
  assert.equal(t.nextOccurrence('2025-05-02', { today: d('2026-05-02') }).days, 0);
  const later = t.nextOccurrence('2025-05-02', { today: d('2026-04-30') });
  assert.equal(later.days, 2);
  assert.equal(later.years, 1);
  const next = t.nextOccurrence({ y: 2000, m: 3, d: 10 }, { today: d('2026-11-19') });
  assert.equal(next.date.getFullYear(), 2027);
  assert.equal(next.years, 27);
});

test('nextOccurrence: Feb 29 falls on Feb 28 in common years; monthly and one-off dates', () => {
  const leap = t.nextOccurrence('2024-02-29', { today: d('2026-02-01') });
  assert.equal(leap.date.getDate(), 28);
  const monthly = t.nextOccurrence('2025-01-31', { recurring: 'monthly', today: d('2026-02-10') });
  assert.equal(monthly.date.getDate(), 28);
  assert.equal(t.nextOccurrence('2026-01-01', { recurring: 'none', today: d('2026-02-01') }), null);
});

test('milestoneProgress finds today, next and progress', () => {
  const ms = [{ days: 100 }, { days: 200 }, { days: 365 }];
  const a = t.milestoneProgress(ms, 150);
  assert.equal(a.next.days, 200);
  assert.equal(a.daysLeft, 50);
  assert.equal(a.progress, 0.5);
  assert.equal(t.milestoneProgress(ms, 200).today.days, 200);
  assert.equal(t.milestoneProgress(ms, 400).next, null);
});

test('dailyPick: same pick all day, no repeats within the list length', () => {
  const items = Array.from({ length: 30 }, (_, i) => ({ id: `x${i}` }));
  assert.equal(t.dailyPick(items, { day: d('2026-11-19', 1) }).id, t.dailyPick(items, { day: d('2026-11-19', 23) }).id);
  const run = new Set(Array.from({ length: 30 }, (_, i) => t.dailyPick(items, { day: new Date(2026, 5, 1 + i) }).id));
  assert.equal(run.size, 30);
});

test('randomOther never repeats the previous item', () => {
  const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  for (let i = 0; i < 200; i++) assert.notEqual(t.randomOther(items, 'b').id, 'b');
  assert.equal(t.randomOther([{ id: 'a' }], 'a').id, 'a');
});

test('dayPart follows the greeting hours', () => {
  assert.equal(t.dayPart(d('2026-01-01', 8)), 'morning');
  assert.equal(t.dayPart(d('2026-01-01', 15)), 'afternoon');
  assert.equal(t.dayPart(d('2026-01-01', 21)), 'night');
});
