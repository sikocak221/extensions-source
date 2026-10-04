// Dates of Arabic sites: "26 سبتمبر، 2026", "منذ 3 ساعات", "اليوم" (Java's Locale("ar") month names are not in
// the shared parser).
const MONTHS: [RegExp, number][] = [
  [/كانون\s*الثاني|يناير/, 0],
  [/شباط|فبراير/, 1],
  [/آذار|مارس/, 2],
  [/نيسان|[أاإ]بريل/, 3],
  [/أيار|مايو/, 4],
  [/حزيران|يونيو|يونيه/, 5],
  [/تموز|يوليو|يوليه/, 6],
  [/آب|[أا]غسطس/, 7],
  [/أيلول|سبتمبر/, 8],
  [/تشرين\s*الأول|[أا]كتوبر/, 9],
  [/تشرين\s*الثاني|نوفمبر/, 10],
  [/كانون\s*الأول|ديسمبر/, 11],
];

const UNITS: [RegExp, number][] = [
  [/ثاني|ثوان/, 1_000],
  [/دقيق|دقائق/, 60_000],
  [/ساع/, 3_600_000],
  [/يوم|أيام/, 86_400_000],
  [/أسبوع|اسبوع|أسابيع|اسابيع/, 7 * 86_400_000],
  [/شهر|أشهر|شهور/, 30 * 86_400_000],
  [/سنة|سنوات|سنين|عام|أعوام/, 365 * 86_400_000],
];

export function parseArabicDate(text: string | null | undefined, now = Date.now()): number | undefined {
  if (!text) return undefined;
  const value = text
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/\s+/g, ' ')
    .trim();
  const startOfDay = Math.floor(now / 86_400_000) * 86_400_000;
  if (value.startsWith('اليوم')) return startOfDay;
  if (value.startsWith('أمس') || value.startsWith('امس')) return startOfDay - 86_400_000;
  if (value.startsWith('منذ')) {
    const unit = UNITS.find(([re]) => re.test(value));
    if (!unit) return undefined;
    const amount = /\d+/.exec(value)?.[0];
    // "منذ ساعة" = one hour ago, "منذ ساعتين" = two.
    return now - (amount ? Number(amount) : /ين\b/.test(value) ? 2 : 1) * unit[1];
  }
  const match = /(\d{1,2})\s*([^\d\s،,]+(?:\s*(?:الأول|الثاني))?)[\s،,]*(\d{4})/.exec(value);
  if (!match) return undefined;
  const month = MONTHS.find(([re]) => re.test(match[2]!));
  return month ? Date.UTC(Number(match[3]), month[1], Number(match[1])) : undefined;
}
