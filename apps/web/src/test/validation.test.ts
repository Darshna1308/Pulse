import { describe, expect, it } from 'vitest';
import { passwordStrength, safeNext, validateEmail, validateName, validatePassword } from '@/lib/validation';

describe('form validation', () => {
  it('mirrors the API password policy', () => {
    expect(validatePassword('short1')).toMatch(/10 characters/);
    expect(validatePassword('onlyletterslong')).toMatch(/letter and one number/);
    expect(validatePassword('1234567890123')).toMatch(/letter and one number/);
    expect(validatePassword('a'.repeat(128) + '1')).toMatch(/128/);
    expect(validatePassword('correct horse 9')).toBeUndefined();
  });

  it('validates email and name', () => {
    expect(validateEmail('')).toBeDefined();
    expect(validateEmail('not-an-email')).toBeDefined();
    expect(validateEmail(' ada@example.com ')).toBeUndefined();
    expect(validateName('   ')).toBeDefined();
    expect(validateName('x'.repeat(81))).toBeDefined();
    expect(validateName('Ada')).toBeUndefined();
  });

  it('scores strength only for valid passwords', () => {
    expect(passwordStrength('weak')).toBe(0);
    expect(passwordStrength('abcdefghi1')).toBe(1);
    expect(passwordStrength('Abcdefghijklm1!')).toBe(3);
  });

  it('only allows same-app redirect targets', () => {
    expect(safeNext('/app/alerts?status=open')).toBe('/app/alerts?status=open');
    expect(safeNext('https://evil.example')).toBe('/app');
    expect(safeNext('//evil.example')).toBe('/app');
    expect(safeNext('/\\evil.example')).toBe('/app');
    expect(safeNext(null, '/x')).toBe('/x');
  });
});
