/** Number formatting (metric units). Uses the runtime locale unless set. */
let locale: string | undefined;

export function setFormatLocale(value: string | undefined): void {
  locale = value;
}

function fmt(value: number, maxFraction = 0, minFraction = 0, grouping = true): string {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: maxFraction,
    minimumFractionDigits: minFraction,
    useGrouping: grouping,
  }).format(value === 0 ? 0 : value); // avoid "-0"
}

/** "1,240" */
export function kcal(value: number): string {
  return fmt(Math.round(value));
}

/** "+320" / "−120" */
export function signedKcal(value: number): string {
  const rounded = Math.round(value);
  if (rounded > 0) return `+${fmt(rounded)}`;
  if (rounded < 0) return `−${fmt(-rounded)}`;
  return "0";
}

/** Grams: one decimal below 10 g, whole numbers above. */
export function grams(value: number): string {
  return Math.abs(value) < 10 ? fmt(value, 1) : fmt(Math.round(value));
}

/** For prefilling inputs: no grouping, up to `maxFraction` decimals. */
export function editable(value: number, maxFraction = 1): string {
  return fmt(value, maxFraction, 0, false);
}

/** "45 min", "1 h 30 min", "2 h" */
export function duration(minutes: number): string {
  const total = Math.round(minutes);
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/** Set duration: "45 s", "1:30 min" */
export function seconds(value: number): string {
  const total = Math.round(value);
  if (total < 60) return `${total} s`;
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")} min`;
}

/** Interval step: "4′", "2.5′", "30″" */
export function shortMinutes(minutes: number): string {
  if (minutes < 1) return `${Math.round(minutes * 60)}″`;
  return `${fmt(minutes, 1)}′`;
}

/** "10 km", "10.5 km" */
export function distance(km: number): string {
  return `${fmt(km, 1)} km`;
}

/** "400 m" below 1 km. */
export function shortDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : distance(km);
}

/** kg without unit: "80", "82.5" */
export function weight(kg: number): string {
  return fmt(kg, 2);
}

/** Large distances without decimals ("4,210"), small ones with one ("12.4"). */
export function distanceValue(km: number): string {
  return km >= 100 ? fmt(Math.round(km)) : fmt(km, 1);
}

/** Hours from seconds: "123", "12.5" */
export function hoursValue(seconds: number): string {
  const hours = seconds / 3600;
  return hours >= 100 ? fmt(Math.round(hours)) : fmt(hours, 1);
}

/** Training volume: kg below 10 t, tonnes above. */
export function volume(kg: number): string {
  return kg >= 10_000 ? fmt(kg / 1000, 1) : fmt(Math.round(kg));
}

export function volumeUnit(kg: number): string {
  return kg >= 10_000 ? "t" : "kg";
}

/** Parses user input; accepts "," and "." as decimal separator. */
export function parseDecimal(text: string): number | null {
  let s = text.trim().replace(/[\s ]/g, "");
  if (!s) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else {
    s = s.replace(",", ".");
  }
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  const value = Number(s);
  return Number.isFinite(value) ? value : null;
}
