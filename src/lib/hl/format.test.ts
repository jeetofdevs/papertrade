import { describe, expect, it } from 'vitest';
import { formatPrice, formatSize } from './client';

describe('hyperliquid number formatting', () => {
  it('keeps at most 5 significant figures', () => {
    expect(formatPrice(3.123456, 1)).toBe('3.1235');
    expect(formatPrice(4123.456, 4)).toBe('4123.5');
    expect(formatPrice(209.8765, 2)).toBe('209.88');
  });
  it('allows whole numbers of any length', () => {
    expect(formatPrice(112345.67, 5)).toBe('112350');
    expect(formatPrice(112000, 5)).toBe('112000');
  });
  it('limits decimals to 6 - szDecimals', () => {
    expect(formatPrice(0.0123456, 4)).toBe('0.01');
    expect(formatPrice(0.0123456, 0)).toBe('0.012346');
  });
  it('rounds sizes down to size decimals', () => {
    expect(formatSize(12.56789, 1)).toBe('12.5');
    expect(formatSize(0.000999, 5)).toBe('0.00099');
    expect(formatSize(3, 0)).toBe('3');
  });
});
