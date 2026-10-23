/** Client-side checks that mirror the API's Zod rules. The server stays authoritative. */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(value: string): string | undefined {
  const v = value.trim();
  if (!v) return 'Email is required';
  if (v.length > 254 || !EMAIL.test(v)) return 'Enter a valid email address';
  return undefined;
}

export function validatePassword(value: string): string | undefined {
  if (value.length < 10) return 'Use at least 10 characters';
  if (value.length > 128) return 'Use at most 128 characters';
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) return 'Include at least one letter and one number';
  return undefined;
}

export function validateName(value: string): string | undefined {
  const v = value.trim();
  if (!v) return 'Name is required';
  if (v.length > 80) return 'Use at most 80 characters';
  return undefined;
}

/** Rough strength meter for feedback only: 0 (weak) to 3 (strong). */
export function passwordStrength(value: string): 0 | 1 | 2 | 3 {
  if (validatePassword(value)) return 0;
  let score = 1;
  if (value.length >= 14) score++;
  if (/[^A-Za-z0-9]/.test(value) || (/[a-z]/.test(value) && /[A-Z]/.test(value))) score++;
  return Math.min(score, 3) as 1 | 2 | 3;
}

/** Only allow in-app redirects after sign-in (prevents open redirects via ?next=). */
export function safeNext(next: string | null, fallback = '/app'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback;
  return next;
}
