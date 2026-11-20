// iCalendar (.ics) files made on the device (docs/05 §4, §21, §41). The phone's calendar fires the
// alarms (VALARM), the only reliable way to get a reminder without a server. Times are "floating"
// (no time zone), so the phone reads them in its own zone.

const pad = (n) => String(n).padStart(2, '0');
const PRODID = '-//Aishiteru//ES';

/** Escapes text per RFC 5545 (backslash, semicolon, comma and line breaks). */
export function escapeText(s = '') {
  return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Folds a content line to 75 octets, continuing with CRLF + space; never splits a UTF-8 character. */
export function fold(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out = [];
  let cur = ''; let size = 0; let limit = 75;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (size + b > limit) { out.push(cur); cur = ''; size = 0; limit = 74; }
    cur += ch; size += b;
  }
  out.push(cur);
  return out.join('\r\n ');
}

const dateValue = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
const dateTimeValue = (d) => `${dateValue(d)}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
const utcStamp = (d = new Date()) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

const span = (m) => (m % 1440 === 0 ? `P${m / 1440}D` : m % 60 === 0 ? `PT${m / 60}H` : `PT${m}M`);
/** TRIGGER for an alarm at `offsetMin` minutes from the start: negative is before ("-P1D"), positive after. */
export function trigger(offsetMin) {
  const m = Math.round(offsetMin);
  if (!m) return 'PT0M';
  return m < 0 ? `-${span(-m)}` : span(m);
}

/** Alarm offset for an all-day event: `daysBefore` days earlier at "HH:MM" (all-day events start at 00:00). */
export const dayAlarm = (daysBefore, time = '09:00') => {
  const [h, mi] = String(time).split(':').map(Number);
  return -daysBefore * 1440 + (h || 0) * 60 + (mi || 0);
};

/**
 * One VEVENT. start: Date. allDay: true for a whole day. durationMin: for timed events (default 60).
 * rrule: e.g. "FREQ=YEARLY". alarms: offsets in minutes from the start (negative = before), see trigger().
 */
export function vevent({ uid, title, start, allDay = false, durationMin = 60, location = '', description = '', rrule = '', alarms = [], stamp = new Date() }) {
  const lines = ['BEGIN:VEVENT', `UID:${uid}@aishiteru`, `DTSTAMP:${utcStamp(stamp)}`];
  if (allDay) {
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
    lines.push(`DTSTART;VALUE=DATE:${dateValue(start)}`, `DTEND;VALUE=DATE:${dateValue(end)}`);
  } else {
    lines.push(`DTSTART:${dateTimeValue(start)}`, `DTEND:${dateTimeValue(new Date(start.getTime() + durationMin * 60000))}`);
  }
  lines.push(`SUMMARY:${escapeText(title)}`);
  if (location) lines.push(`LOCATION:${escapeText(location)}`);
  if (description) lines.push(`DESCRIPTION:${escapeText(description)}`);
  if (rrule) lines.push(`RRULE:${rrule}`);
  for (const a of alarms) {
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapeText(title)}`, `TRIGGER:${trigger(a)}`, 'END:VALARM');
  }
  lines.push('END:VEVENT');
  return lines;
}

/** A whole calendar file from event option objects. */
export function calendar(events, { name = 'Aishiteru' } = {}) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:${PRODID}`, 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${escapeText(name)}`];
  for (const e of events) lines.push(...vevent(e));
  lines.push('END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

/** Saves the file; Android opens it with the calendar app. */
export function download(filename, text) {
  const blob = new Blob([text], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename.endsWith('.ics') ? filename : `${filename}.ics`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** File name without accents or odd characters. */
export const fileName = (s) => (String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'evento');
