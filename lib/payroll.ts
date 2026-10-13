// Pure payroll maths. No DB access here.
// CONFIRM THESE RULES WITH THE CLIENT before going live.
export const POLICY = {
  dailyPayWeeklyOff: false, // daily-wage staff paid for weekly off?
  dailyPayHoliday: true,    // daily-wage staff paid for declared holidays?
  paidLeave: true,          // approved LEAVE days are paid
};

export const r2 = (n: number) => Math.round(n * 100) / 100;

export type DayIn = { status: string; siteId: string; workedHours: number; otHours: number };
export type EmpIn = { wageType: "DAILY" | "MONTHLY"; wageRate: number; otRate: number };

export function computePay(emp: EmpIn, days: DayIn[], daysInMonth: number, eligibleDays: number) {
  let present = 0, half = 0, absent = 0, leave = 0, ot = 0, worked = 0, dailyPaid = 0;
  const sites = new Map<string, { days: number; hours: number }>();

  for (const d of days) {
    let pay = 0;
    switch (d.status) {
      case "PRESENT": present++; pay = 1; break;
      case "HALF_DAY": half++; pay = 0.5; break;
      case "ABSENT": absent++; break;
      case "LEAVE": leave++; pay = POLICY.paidLeave ? 1 : 0; break;
      case "WEEKLY_OFF": pay = POLICY.dailyPayWeeklyOff ? 1 : 0; break;
      case "HOLIDAY": pay = POLICY.dailyPayHoliday ? 1 : 0; break;
    }
    dailyPaid += pay;
    ot += d.otHours;
    worked += d.workedHours;

    // weight used to split labour cost across sites
    const w = emp.wageType === "MONTHLY"
      ? d.status === "ABSENT" ? 0 : d.status === "HALF_DAY" ? 0.5 : 1
      : pay;
    const s = sites.get(d.siteId) ?? { days: 0, hours: 0 };
    s.days += w;
    s.hours += d.workedHours;
    sites.set(d.siteId, s);
  }

  let basic: number;
  if (emp.wageType === "DAILY") {
    basic = dailyPaid * emp.wageRate;
  } else {
    const payable = Math.max(0, eligibleDays - absent - 0.5 * half - (POLICY.paidLeave ? 0 : leave));
    basic = (emp.wageRate / daysInMonth) * payable;
  }

  return {
    presentDays: present + 0.5 * half,
    absentDays: absent + 0.5 * half,
    leaveDays: leave,
    regularHours: r2(worked - ot),
    otHours: r2(ot),
    basicPay: r2(basic),
    otPay: r2(ot * emp.otRate),
    sites: Array.from(sites.entries()).map(([siteId, v]) => ({ siteId, days: v.days, hours: r2(v.hours) })),
  };
}

// Split an amount across weights; last item takes the rounding remainder
export function splitAmount(total: number, weights: number[]) {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) return weights.map(() => 0);
  let used = 0;
  return weights.map((w, i) => {
    if (i === weights.length - 1) return r2(total - used);
    const a = r2((total * w) / sum);
    used += a;
    return a;
  });
}
