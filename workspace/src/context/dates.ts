/**
 * Dates as the prompt writes them, each with its weekday (brief 111, amendment (g)): the model once named
 * Oct 16, 2026 a Wednesday, so the runner states every weekday and the model never works one out.
 *
 * The weekday always comes from the calendar date itself, read in UTC so no time zone can shift it:
 * an instant is first put on the New York wall clock, and its New York date then names the day. The
 * names are fixed English words, never the host's locale. Text that is not a date stays as it is.
 */

const NEW_YORK = 'America/New_York';
const DATE_SHAPE = /^(\d{4})-(\d{2})-(\d{2})$/;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const;
const SHORT_NAME_CHARS = 3;
const MS_PER_DAY = 86_400_000;
/** 1970-01-01, day 0 of the count, was a Thursday (index 4 of WEEKDAYS). */
const EPOCH_WEEKDAY = 4;
const DAYS_PER_WEEK = 7;
/** Date.UTC reads a year under 100 as 19xx; no feed date is that old. */
const MIN_YEAR = 1000;

const NEW_YORK_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: NEW_YORK,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

interface CalendarDate {
  readonly text: string;
  readonly month: number;
  readonly day: number;
  readonly year: number;
  readonly weekday: number;
}

/** A real `YYYY-MM-DD` as its parts and weekday; null for anything else (2026-02-30 included). */
function calendarDateOf(text: string): CalendarDate | null {
  const match = DATE_SHAPE.exec(text);
  if (match === null) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (year < MIN_YEAR || month < 1 || month > MONTHS.length || day < 1) return null;
  // Pure arithmetic on UTC midnights: no clock is read and no time zone can move the day.
  const firstOfMonth = Date.UTC(year, month - 1, 1);
  const daysInMonth = (Date.UTC(year, month, 1) - firstOfMonth) / MS_PER_DAY;
  if (day > daysInMonth) return null;
  const dayNumber = Math.floor(Date.UTC(year, month - 1, day) / MS_PER_DAY);
  const weekday = (((dayNumber + EPOCH_WEEKDAY) % DAYS_PER_WEEK) + DAYS_PER_WEEK) % DAYS_PER_WEEK;
  return { text, year, month, day, weekday };
}

const shortName = (date: CalendarDate): string => WEEKDAYS[date.weekday]?.slice(0, SHORT_NAME_CHARS) ?? '';

/** `YYYY-MM-DD Ddd` for a plain date, e.g. `2026-10-16 Fri`; the text itself when it is not a date. */
export function dateWithWeekday(text: string): string {
  const date = calendarDateOf(text);
  return date === null ? text : `${date.text} ${shortName(date)}`;
}

/** The weekday's whole name for a plain date, e.g. `Friday`; null when it is not a date. */
export function weekdayNameOf(text: string): string | null {
  const date = calendarDateOf(text);
  return date === null ? null : (WEEKDAYS[date.weekday] ?? null);
}

/** `Friday, October 16, 2026` for a plain date; null when it is not a date. */
export function longDayOf(text: string): string | null {
  const date = calendarDateOf(text);
  if (date === null) return null;
  return `${WEEKDAYS[date.weekday]}, ${MONTHS[date.month - 1]} ${date.day}, ${date.year}`;
}

interface NewYorkClock {
  readonly date: string;
  readonly time: string;
}

/** An instant on the New York wall clock; null when the text is not an instant. */
function newYorkClockOf(iso: string): NewYorkClock | null {
  // Date.parse and a number keep this a reading of the instant it is given, never of the clock.
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return null;
  const p = Object.fromEntries(NEW_YORK_FORMAT.formatToParts(at).map((part) => [part.type, part.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

/** The New York date of an instant, `YYYY-MM-DD`; null when the text is not an instant. */
export function newYorkDayOf(iso: string): string | null {
  return newYorkClockOf(iso)?.date ?? null;
}

/** `YYYY-MM-DD Ddd` of an instant on the New York wall clock; the text itself when it is not an instant. */
export function newYorkDate(iso: string): string {
  const clock = newYorkClockOf(iso);
  return clock === null ? iso : dateWithWeekday(clock.date);
}

/** `YYYY-MM-DD Ddd HH:MM` on the New York wall clock; the text itself when it is not an instant. */
export function newYorkDateTime(iso: string): string {
  const clock = newYorkClockOf(iso);
  return clock === null ? iso : `${dateWithWeekday(clock.date)} ${clock.time}`;
}
