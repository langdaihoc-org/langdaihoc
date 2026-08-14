import { describe, expect, it } from 'vitest';
import { formatOrderSummary } from './order-summary.js';

describe('formatOrderSummary', () => {
  it('formats single food item', () => {
    expect(formatOrderSummary('food', [{ itemName: 'Cơm tấm sườn bì', quantity: 1 }], null)).toBe(
      'Cơm tấm sườn bì',
    );
  });

  it('formats multiple food items', () => {
    expect(
      formatOrderSummary(
        'food',
        [
          { itemName: 'Cơm gà', quantity: 2 },
          { itemName: 'Trà đào', quantity: 1 },
          { itemName: 'Chè', quantity: 1 },
        ],
        null,
      ),
    ).toBe('Cơm gà ×2, Trà đào +1 món');
  });

  it('formats laundry service', () => {
    expect(
      formatOrderSummary('laundry', [], {
        serviceName: 'Giặt express',
        estimatedQty: '2.5',
        estimatedUnit: 'kg',
      }),
    ).toBe('Giặt express');
  });
});
