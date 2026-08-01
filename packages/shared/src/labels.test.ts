import { describe, expect, it } from 'vitest';
import { orderTypeLabel, serviceTypeLabel } from './labels.js';

describe('labels', () => {
  it('maps service types', () => {
    expect(serviceTypeLabel('food')).toBe('Ăn uống');
    expect(serviceTypeLabel('laundry')).toBe('Giặt đồ');
    expect(serviceTypeLabel('unknown')).toBe('unknown');
  });

  it('maps order types', () => {
    expect(orderTypeLabel('food')).toBe('Ăn uống');
    expect(orderTypeLabel('laundry')).toBe('Giặt');
  });
});
