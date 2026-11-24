// Avisos programados (v0.15.0, option A chosen 2026-11-24). Each device works out its own caring
// notices for the coming weeks and hands them to the server sealed (sync.scheduleNotices), so they
// ring with the app closed: what is turned on in Recordatorios (mesiversario, aniversario, birthdays,
// pets, the weekly date, their own), plans in the Calendario with a reminder, and, at the hour they
// pick, "¿Ya enviaste amor hoy?" on the days this person has not sent it yet. Recomputed when the
// app opens and whenever any of that changes.
import { db, util, profile } from '../core.js';
import * as sync from '../core/sync.js';
import * as dates from '../core/dates.js';
import { load, occurrences } from './recordatorios.js';

const REMIND_DAYS = 60;
const LOVE_DAYS = 21;
const WATCH = new Set(['reminders', 'events', 'specialDates', 'streaks', 'profile', 'pets']);

const at = (day, hm = '09:00') => {
  const [h, m] = String(hm).split(':').map(Number);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h || 0, m || 0).getTime();
};
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** The list of { at, k } for this device. Pure apart from reading the stores. */
export async function plan(now = new Date()) {
  const prefs = sync.noticePrefs();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const items = [];
  if (prefs.reminders) {
    const { list } = await load();
    const special = dates.withProfile(await dates.listed());
    for (const r of list.filter((x) => x.enabled)) {
      const leads = r.leadDays?.length ? r.leadDays : [0];
      const hm = r.kind === 'weeklyDate' ? '10:00' : r.rule?.time || '09:00';
      for (let i = 0; i <= REMIND_DAYS; i++) {
        const day = addDays(today, i);
        for (const lead of leads) {
          const hit = occurrences(r, { special, today: addDays(day, lead) }).some((o) => o.next.days === 0);
          if (hit) items.push({ at: at(day, hm), k: `r:${r.kind}:${lead}` });
        }
      }
    }
    // The anniversary is also a monthiversary: keep only the anniversary notice that day.
    const yearly = new Set(items.filter((x) => x.k.startsWith('r:anniversary:')).map((x) => `${new Date(x.at).toDateString()}:${x.k.split(':')[2]}`));
    for (let i = items.length - 1; i >= 0; i--) {
      const x = items[i];
      if (x.k.startsWith('r:monthiversary:') && yearly.has(`${new Date(x.at).toDateString()}:${x.k.split(':')[2]}`)) items.splice(i, 1);
    }
    const events = (await db.query('events').catch(() => [])).filter((e) => !e.deleted && e.start && e.remind && e.remind !== 'none');
    for (const e of events) {
      const day = util.parseDay(String(e.start).slice(0, 10)); if (!day) continue;
      const hm = String(e.start).slice(11, 16);
      if (e.remind === '1d') items.push({ at: at(addDays(day, -1), '09:00'), k: 'r:event:1' });
      else if (e.remind === '1h') items.push({ at: hm ? at(day, hm) - 3600000 : at(day, '08:00'), k: 'r:event:0' });
    }
  }
  if (prefs.love) {
    const me = sync.status().me || profile.active(); // the person this device belongs to
    const sent = new Set((await db.query('streaks', { index: 'type', range: IDBKeyRange.only('love') }).catch(() => []))
      .filter((r) => !r.deleted && r.by === me).map((r) => r.day));
    for (let i = 0; i < LOVE_DAYS; i++) {
      const day = addDays(today, i);
      if (!sent.has(util.localDay(day))) items.push({ at: at(day, prefs.loveAt), k: 'loveRemind' });
    }
  }
  const seen = new Set();
  return items.filter((x) => x.at > now.getTime() && !seen.has(`${x.at}:${x.k}`) && seen.add(`${x.at}:${x.k}`));
}

let timer = null;
let running = false;
/** Plan again and send, a moment later (changes come in bursts). Never throws. */
export function refresh(delay = 1500) {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    if (running) { refresh(delay); return; }
    running = true;
    try { if (sync.isLinked() && sync.status().notify) await sync.scheduleNotices(await plan()); } catch (e) { console.warn('avisos', e?.message); }
    running = false;
  }, delay);
}

let started = false;
export function start() {
  if (started) return; started = true;
  db.onChange((store) => { if (WATCH.has(store)) refresh(4000); });
  sync.onStatus(() => refresh(3000));
  refresh(5000);
}
