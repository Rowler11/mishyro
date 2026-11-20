// Special dates shared by Inicio, Fechas especiales, Calendario and Recordatorios (docs/05 §4).
// The anniversary and the two birthdays come from the profile when they are not listed as dates.
import * as db from './db.js';
import * as profile from './profile.js';
import * as time from './time.js';
import { localDay } from './util.js';

export const KIND_ICON = { birthday: 'cake', anniversary: 'heart', pet: 'paw-print', other: 'calendar' };

/** Listed dates (not hidden or deleted). */
export async function listed() {
  return (await db.query('specialDates')).filter((d) => !d.deleted && !d.hidden);
}

// Pets (Fase 4B): their birthday and arrival day ("día que llegó a casa") join the dates on their own.
let pets = [];
export const setPets = (list) => { pets = (list || []).filter((p) => !p.deleted && !p.memorial); };
profile.onPets(setPets);

/** Birthday and arrival day of each pet still with them, unless the list already has that date. */
export function petDates(list = [], petList = pets) {
  const out = [];
  const same = (a, b) => { const x = time.monthDay(a); const y = time.monthDay(b); return x && y && x.m === y.m && x.d === y.d; };
  for (const p of petList) {
    const mine = list.filter((d) => d.kind === 'pet' && d.personOrPetId === p.id);
    if (time.monthDay(p.birth) && !mine.some((d) => same(d.date, p.birth))) out.push({ id: `pet:${p.id}:birth`, name: `Cumpleaños de ${p.name}`, kind: 'pet', date: p.birth, recurring: 'yearly', personOrPetId: p.id, auto: true });
    if (time.monthDay(p.arrival) && !mine.some((d) => same(d.date, p.arrival))) out.push({ id: `pet:${p.id}:arrival`, name: `Día que ${p.name} llegó a casa`, kind: 'pet', date: p.arrival, recurring: 'yearly', personOrPetId: p.id, auto: true });
  }
  return out;
}

/** Listed dates plus the anniversary, birthdays and pet dates the profile knows but the list lacks. */
export function withProfile(list, start = time.parseStart(profile.startDate())) {
  const out = [...petDates(list)];
  if (start && !list.some((d) => d.kind === 'anniversary')) out.push({ id: 'start', name: 'Nuestro aniversario', kind: 'anniversary', date: localDay(start), recurring: 'yearly' });
  for (const who of profile.PEOPLE) {
    const birth = profile.person(who).birth;
    if (birth && !list.some((d) => d.kind === 'birthday' && d.personOrPetId === who)) out.push({ id: `birth:${who}`, name: `Cumpleaños de ${profile.name(who)}`, kind: 'birthday', date: birth, recurring: 'yearly', personOrPetId: who });
  }
  return [...out, ...list];
}

/** Each date with its next occurrence (today included), soonest first. */
export function upcoming(list, today = new Date()) {
  return list.map((d) => ({ ...d, next: time.nextOccurrence(d.date, { recurring: d.recurring || 'yearly', today }) }))
    .filter((d) => d.next)
    .sort((a, b) => a.next.days - b.next.days);
}

/** Everything in one call: listed + profile dates with their next occurrence. */
export async function all(today = new Date()) {
  return upcoming(withProfile(await listed()), today);
}

/** Which person a birthday belongs to, if it is one of the two. */
export function personOf(d) {
  if (d.kind !== 'birthday') return null;
  if (profile.PEOPLE.includes(d.personOrPetId)) return d.personOrPetId;
  return profile.PEOPLE.find((p) => profile.name(p) && d.name?.includes(profile.name(p))) || null;
}

/** Occurrences of the dates inside a month (for the calendar grid). */
export function inMonth(list, year, month) {
  const out = [];
  for (const d of list) {
    const md = time.monthDay(d.date);
    if (!md) continue;
    const rec = d.recurring || 'yearly';
    if (rec === 'none' && (md.y !== year || md.m !== month + 1)) continue;
    if (rec !== 'monthly' && md.m !== month + 1) continue;
    const last = new Date(year, month + 1, 0).getDate();
    const day = Math.min(md.d, last);
    if (md.y && new Date(year, month, day) < new Date(md.y, md.m - 1, md.d)) continue; // not before it started
    out.push({ ...d, day, years: md.y ? year - md.y : null });
  }
  return out;
}
