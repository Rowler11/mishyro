// Calendar math for Inicio (docs/05 Pestaña 1, docs/06): elapsed time by calendar,
// next occurrence of yearly/monthly dates, milestones and deterministic daily picks.
// Pure functions: no DOM, no storage. All dates are local.
import { parseDay, daysBetween, localDay } from './util.js';

/** Start of the relationship as a local Date. Accepts "YYYY-MM-DD" or a full ISO string. */
export function parseStart(value) {
  if (!value) return null;
  const day = parseDay(value);
  if (day) return day;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return null;
  // The day is what matters: a time or offset in the ISO must not move it to another date.
  return parseDay(`${m[1]}-${m[2]}-${m[3]}`);
}

const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();

/** Same day-of-month `months` later, clamped to the month's length (Jan 31 + 1 month -> Feb 28/29). */
export function addMonths(date, months) {
  const total = date.getFullYear() * 12 + date.getMonth() + months;
  const y = Math.floor(total / 12); const m = total - y * 12;
  return new Date(y, m, Math.min(date.getDate(), daysInMonth(y, m)), date.getHours(), date.getMinutes(), date.getSeconds());
}

/**
 * Time since `start` broken down by calendar: whole months first (no 30-day months),
 * then days, hours, minutes and seconds. Never negative: a future start gives all zeros.
 */
export function elapsed(start, now = new Date()) {
  const zero = { years: 0, months: 0, days: 0, hours: 0, minutes: 0, seconds: 0, totalDays: 0 };
  if (!start || now < start) return zero;
  let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  let anchor = addMonths(start, months);
  while (months > 0 && anchor > now) { months--; anchor = addMonths(start, months); }
  // Whole calendar days after the anchor; the time of day is counted from local midnight.
  let days = daysBetween(anchor, now);
  let dayStart = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + days, anchor.getHours(), anchor.getMinutes(), anchor.getSeconds());
  if (dayStart > now) { days--; dayStart = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + days, anchor.getHours(), anchor.getMinutes(), anchor.getSeconds()); }
  const rest = Math.max(0, Math.floor((now - dayStart) / 1000));
  return {
    years: Math.floor(months / 12), months: months % 12, days,
    hours: Math.floor(rest / 3600), minutes: Math.floor((rest % 3600) / 60), seconds: rest % 60,
    totalDays: Math.max(0, daysBetween(start, now)),
  };
}

/** Month/day of a stored date: "YYYY-MM-DD" string or { y, m, d } (year may be null). */
export function monthDay(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    const d = parseStart(value);
    return d ? { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() } : null;
  }
  return value.m && value.d ? { y: value.y || null, m: value.m, d: value.d } : null;
}

/** Date for month/day in a given year; Feb 29 falls on Feb 28 in common years. */
function onYear(md, year) {
  return new Date(year, md.m - 1, Math.min(md.d, daysInMonth(year, md.m - 1)));
}

/**
 * Next occurrence (today included) of a recurring date.
 * recurring: 'yearly' | 'monthly' | 'none'. Returns { date, days, years } or null when it already passed.
 */
export function nextOccurrence(value, { recurring = 'yearly', today = new Date() } = {}) {
  const md = monthDay(value);
  if (!md) return null;
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let date;
  if (recurring === 'none') {
    if (!md.y) return null;
    date = new Date(md.y, md.m - 1, md.d);
    if (date < t) return null;
  } else if (recurring === 'monthly') {
    date = new Date(t.getFullYear(), t.getMonth(), Math.min(md.d, daysInMonth(t.getFullYear(), t.getMonth())));
    if (date < t) { const n = addMonths(new Date(t.getFullYear(), t.getMonth(), 1), 1); date = new Date(n.getFullYear(), n.getMonth(), Math.min(md.d, daysInMonth(n.getFullYear(), n.getMonth()))); }
  } else {
    date = onYear(md, t.getFullYear());
    if (date < t) date = onYear(md, t.getFullYear() + 1);
  }
  return { date, days: daysBetween(t, date), years: md.y ? date.getFullYear() - md.y : null };
}

/** Next milestone after today's total days, the previous one, and progress 0..1 between them. */
export function milestoneProgress(milestones, totalDays) {
  const list = [...milestones].filter((m) => Number(m.days) > 0).sort((a, b) => a.days - b.days);
  const today = list.find((m) => m.days === totalDays) || null;
  const next = list.find((m) => m.days > totalDays) || null;
  const prev = [...list].reverse().find((m) => m.days <= totalDays) || null;
  const from = prev ? prev.days : 0;
  const progress = next ? Math.min(1, Math.max(0, (totalDays - from) / (next.days - from))) : 1;
  return { today, next, prev, progress, daysLeft: next ? next.days - totalDays : 0 };
}

/** Days since 1970-01-01 for a local date: a stable "day number" for daily picks. */
export const dayNumber = (d = new Date()) => daysBetween(new Date(1970, 0, 1), d);

// Small deterministic PRNG (mulberry32) so a list's daily order is the same on every device.
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

/**
 * One item per day, the same all day long. Walks a fixed shuffle of the list, so an item
 * does not repeat until the whole list has been shown (30 items -> no repeats in 30 days).
 */
export function dailyPick(items, { day = new Date(), salt = '' } = {}) {
  if (!items.length) return null;
  const ids = items.map((x) => x.id).sort();
  const order = ids.map((id) => ({ id, k: rng(hash(`${salt}|${id}`))() })).sort((a, b) => a.k - b.k).map((x) => x.id);
  const id = order[dayNumber(day) % order.length];
  return items.find((x) => x.id === id);
}

/** Random item different from `previousId` when there is more than one. */
export function randomOther(items, previousId) {
  if (!items.length) return null;
  const pool = items.length > 1 ? items.filter((x) => x.id !== previousId) : items;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Part of the day for greetings and backgrounds (docs/05 §24): before 12, 12-19, from 19. */
export function dayPart(now = new Date()) {
  const h = now.getHours();
  if (h < 12) return 'morning';
  if (h < 19) return 'afternoon';
  return 'night';
}

export { localDay };
