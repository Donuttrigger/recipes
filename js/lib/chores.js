// Repeat maths for chores. Mirrors chore_step() in supabase-chores.sql:
// repeats are counted from the first date, so garbage day stays on its weekday
// and "every month from the 31st" lands on the last day of shorter months.
import { dayString } from '../db.js';

export const REPEATS = [
  { value: '', label: "Doesn't repeat" },
  { value: '1 day', label: 'Every day' },
  { value: '1 week', label: 'Every week' },
  { value: '2 week', label: 'Every 2 weeks' },
  { value: '1 month', label: 'Every month' },
  { value: '2 month', label: 'Every 2 months' },
  { value: '3 month', label: 'Every 3 months' },
  { value: '6 month', label: 'Every 6 months' },
  { value: '1 year', label: 'Every year' },
];

// Ideas for the add sheet. Garbage day etc. start on the next matching day the person picks.
export const IDEAS = [
  { title: 'Garbage day', repeat: '1 week' },
  { title: 'Recycling day', repeat: '2 week' },
  { title: 'Change furnace filter', repeat: '3 month' },
  { title: 'Pool: test the water', repeat: '1 week' },
  { title: 'Pool: clean the filter', repeat: '2 week' },
  { title: 'Test smoke alarms', repeat: '1 month' },
  { title: 'Clean the fridge', repeat: '1 month' },
  { title: 'Change water filter', repeat: '6 month' },
];

export const repeatValue = (c) => (c.repeat_unit ? `${c.repeat_every} ${c.repeat_unit}` : '');
export function repeatLabel(c) {
  const v = repeatValue(c);
  const preset = REPEATS.find((r) => r.value === v);
  if (preset) return preset.label;
  return `Every ${c.repeat_every} ${c.repeat_unit}s`;
}

export const parseDay = (s) => new Date(`${s}T12:00:00`);

function step(anchor, unit, every, k) {
  const a = parseDay(anchor);
  if (unit === 'day' || unit === 'week') {
    a.setDate(a.getDate() + every * k * (unit === 'week' ? 7 : 1));
    return dayString(a);
  }
  const months = every * k * (unit === 'year' ? 12 : 1);
  const y = a.getFullYear() + Math.floor((a.getMonth() + months) / 12);
  const m = (a.getMonth() + months) % 12;
  const lastDay = new Date(y, m + 1, 0).getDate();
  return dayString(new Date(y, m, Math.min(a.getDate(), lastDay), 12));
}

// Days (YYYY-MM-DD) from..to on which this chore is due, starting at its next due date.
export function dueDays(c, from, to) {
  if (c.done_at) return [];
  if (!c.repeat_unit) return c.next_due >= from && c.next_due <= to ? [c.next_due] : [];
  const out = [];
  let k = 0;
  let d = step(c.anchor, c.repeat_unit, c.repeat_every, 0);
  while (d < c.next_due && k < 20000) d = step(c.anchor, c.repeat_unit, c.repeat_every, ++k);
  if (c.next_due < d) d = c.next_due; // next_due set by hand off the pattern
  while (d <= to && out.length < 400) {
    if (d >= from) out.push(d);
    d = step(c.anchor, c.repeat_unit, c.repeat_every, ++k);
  }
  return out;
}
