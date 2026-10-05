// Spanish relative dates ("hace 3 horas", "ayer", "5 meses antes"); epoch ms or undefined.
const UNITS: [RegExp, number][] = [
  [/segundo/, 1000],
  [/minuto/, 60_000],
  [/hora/, 3_600_000],
  [/d[ií]a/, 86_400_000],
  [/semana/, 7 * 86_400_000],
  [/mes/, 30 * 86_400_000],
  [/a[ñn]o/, 365 * 86_400_000],
];

export function relativeDateEs(text: string | null | undefined, now = Date.now()): number | undefined {
  const value = (text ?? '').trim().toLowerCase();
  if (!value) return undefined;
  if (value === 'hoy') return now;
  if (value === 'ayer') return now - 86_400_000;
  const amount = /(\d+)/.exec(value)?.[1];
  const count = amount ? Number(amount) : /\bun[ao]?\b/.test(value) ? 1 : undefined;
  if (count === undefined) return undefined;
  const unit = UNITS.find(([re]) => re.test(value));
  return unit ? now - count * unit[1] : undefined;
}
