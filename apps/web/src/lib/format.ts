const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat('en');

export const fmtNumber = (n: number | null | undefined) => (n == null ? '—' : n >= 10_000 ? compact.format(n) : whole.format(n));

export const fmtPercent = (r: number | null | undefined, digits = 1) =>
  r == null ? '—' : `${(r * 100).toFixed(r > 0 && r < 0.001 ? 2 : digits)}%`;

export const fmtMs = (ms: number | null | undefined) =>
  ms == null ? '—' : ms >= 1000 ? `${(ms / 1000).toFixed(ms >= 10_000 ? 0 : 1)} s` : `${Math.round(ms)} ms`;

export function fmtBytes(b: number | null | undefined) {
  if (b == null) return '—';
  if (b >= 1 << 20) return `${(b / (1 << 20)).toFixed(1)} MB`;
  if (b >= 1 << 10) return `${(b / (1 << 10)).toFixed(1)} KB`;
  return `${Math.round(b)} B`;
}

export const fmtScore = (s: number | null | undefined) => (s == null ? '—' : s.toFixed(3));

export function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function fmtRelative(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return 'never';
  const diff = Math.round((now - new Date(iso).getTime()) / 1000);
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  if (abs < 60) return rtf.format(-diff, 'second');
  if (abs < 3600) return rtf.format(-Math.round(diff / 60), 'minute');
  if (abs < 86_400) return rtf.format(-Math.round(diff / 3600), 'hour');
  return rtf.format(-Math.round(diff / 86_400), 'day');
}

export function fmtEvidenceValue(value: number | null, unit: string) {
  if (value == null) return '—';
  switch (unit) {
    case 'ratio':
      return fmtPercent(value, 0);
    case 'bytes':
      return fmtBytes(value);
    case 'ms':
      return fmtMs(value);
    case 'x':
      return `${value.toFixed(1)}×`;
    case 'status':
      return String(value);
    default:
      return `${fmtNumber(Math.round(value))} ${unit}`;
  }
}

export function describeUserAgent(ua: string | null) {
  if (!ua) return 'Unknown device';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : /curl|node|undici/i.test(ua) ? 'API client' : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${browser} on ${os}` : browser;
}
