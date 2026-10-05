// Vietnamese relative dates ("5 phút trước", "vừa xong", "hôm qua"); epoch ms or undefined.
const UNITS: [string, number][] = [
  ['giây', 1000],
  ['phút', 60_000],
  ['giờ', 3_600_000],
  ['ngày', 86_400_000],
  ['tuần', 7 * 86_400_000],
  ['tháng', 30 * 86_400_000],
  ['năm', 365 * 86_400_000],
];

export function relativeDateVi(text: string | null | undefined, now = Date.now()): number | undefined {
  const value = (text ?? '').trim().toLowerCase();
  if (!value) return undefined;
  if (value.includes('vừa xong') || value.includes('hôm nay')) return now;
  if (value.includes('hôm qua')) return now - 86_400_000;
  const amount = Number.parseInt(/(\d+)/.exec(value)?.[1] ?? '', 10);
  if (Number.isNaN(amount)) return undefined;
  const unit = UNITS.find(([name]) => value.includes(name));
  return unit ? now - amount * unit[1] : undefined;
}
