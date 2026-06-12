// Bangladesh-time helpers + status rules. Time windows now come from the database
// (per-department shifts), so this file only holds the generic logic.

export function dhakaNow() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t).value;
  const hour = get('hour') === '24' ? '00' : get('hour');
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${hour}:${get('minute')}:${get('second')}`,
  };
}

const toMin = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

// PRESENT / LATE based on the employee's shift start + that shift's grace
export function statusFor(startHHMM, grace, timeHHMMSS) {
  const lateBy = toMin(timeHHMMSS.slice(0, 5)) - toMin(startHHMM);
  if (lateBy > grace) return { status: 'LATE', lateMin: lateBy };
  return { status: 'PRESENT', lateMin: 0 };
}

// Hours worked, wrapping midnight for night shifts
export function hoursWorked(inTime, outTime) {
  if (!inTime || !outTime) return null;
  let diff = toMin(outTime.slice(0, 5)) - toMin(inTime.slice(0, 5));
  if (diff < 0) diff += 1440;
  return Math.round((diff / 60) * 100) / 100;
}
