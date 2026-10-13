// Pure helpers (safe to import in client components). IST = UTC+05:30.
export const IST = "+05:30";
export const NO_TIME_STATUSES = ["ABSENT", "LEAVE", "WEEKLY_OFF", "HOLIDAY"];

export const istDate = (d: Date) =>
  new Date(d.getTime() + 330 * 60000).toISOString().slice(0, 10);

export const istTime = (d: Date) =>
  new Date(d.getTime() + 330 * 60000).toISOString().slice(11, 16);

// "YYYY-MM-DD" -> Date at UTC midnight (matches @db.Date)
export const dateOnly = (s: string) => new Date(s + "T00:00:00.000Z");

// "YYYY-MM-DD" + "HH:mm" in IST -> absolute Date
export const atTime = (date: string, hhmm: string) =>
  new Date(`${date}T${hhmm}:00${IST}`);

const r2 = (n: number) => Math.round(n * 100) / 100;

export function calcHours(
  inn: Date | null,
  out: Date | null,
  regularHours: number,
  status: string
) {
  if (!inn || !out) return { checkOut: out, workedHours: 0, otHours: 0 };
  let o = out;
  if (o.getTime() <= inn.getTime()) o = new Date(o.getTime() + 86400000); // night shift
  const worked = r2((o.getTime() - inn.getTime()) / 3600000);
  const ot = status === "HALF_DAY" ? 0 : Math.max(0, r2(worked - regularHours));
  return { checkOut: o, workedHours: worked, otHours: ot };
}

export function buildTimes(
  date: string,
  status: string,
  inT: string | undefined,
  outT: string | undefined,
  regularHours: number
) {
  if (NO_TIME_STATUSES.includes(status))
    return { checkIn: null, checkOut: null, workedHours: 0, otHours: 0, tooLong: false };
  const inn = inT ? atTime(date, inT) : null;
  const out = outT ? atTime(date, outT) : null;
  const r = calcHours(inn, out, regularHours, status);
  return {
    checkIn: inn,
    checkOut: r.checkOut,
    workedHours: r.workedHours,
    otHours: r.otHours,
    tooLong: r.workedHours > 20,
  };
}
