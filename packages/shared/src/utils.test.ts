import { describe, expect, it } from 'vitest';
import { canTransitionFood, canTransitionLaundry, canTransitionShipProxy } from './utils.js';
import {
  computeCartSubtotal,
  computeFoodLineTotal,
  computeLaundryEstimate,
  computeLaundryFinalPrice,
} from './pricing.js';

describe('canTransitionFood', () => {
  it('allows pending → accepted', () => {
    expect(canTransitionFood('pending', 'accepted')).toBe(true);
  });

  it('allows preparing → delivering', () => {
    expect(canTransitionFood('preparing', 'delivering')).toBe(true);
  });

  it('blocks completed → pending', () => {
    expect(canTransitionFood('completed', 'pending')).toBe(false);
  });

  it('blocks delivering → preparing', () => {
    expect(canTransitionFood('delivering', 'preparing')).toBe(false);
  });
});

describe('canTransitionLaundry', () => {
  it('allows picked_up → waiting_price_confirmation', () => {
    expect(canTransitionLaundry('picked_up', 'waiting_price_confirmation')).toBe(true);
  });

  it('allows waiting_price_confirmation → washing after buyer confirms', () => {
    expect(canTransitionLaundry('waiting_price_confirmation', 'washing')).toBe(true);
  });

  it('allows waiting_price_confirmation → cancelled', () => {
    expect(canTransitionLaundry('waiting_price_confirmation', 'cancelled')).toBe(true);
  });

  it('allows waiting_price_confirmation → needs_support', () => {
    expect(canTransitionLaundry('waiting_price_confirmation', 'needs_support')).toBe(true);
  });

  it('blocks pending → washing', () => {
    expect(canTransitionLaundry('pending', 'washing')).toBe(false);
  });
});

describe('canTransitionShipProxy', () => {
  it('allows preparing → picked_up → delivering', () => {
    expect(canTransitionShipProxy('preparing', 'picked_up')).toBe(true);
    expect(canTransitionShipProxy('picked_up', 'delivering')).toBe(true);
  });

  it('blocks preparing → delivering (phải qua đã nhận)', () => {
    expect(canTransitionShipProxy('preparing', 'delivering')).toBe(false);
  });
});

describe('pricing', () => {
  it('computes food line total with options', () => {
    expect(computeFoodLineTotal(35000, [10000, 5000], 2)).toBe(100000);
  });

  it('computes cart subtotal', () => {
    expect(
      computeCartSubtotal([
        { basePrice: 35000, optionDeltas: [5000], quantity: 1 },
        { basePrice: 15000, optionDeltas: [], quantity: 2 },
      ]),
    ).toBe(70000);
  });

  it('computes laundry estimate', () => {
    expect(computeLaundryEstimate(15000, 3)).toBe(45000);
  });

  it('computes laundry final price with surcharge', () => {
    expect(computeLaundryFinalPrice(2.5, 15000, 5000)).toBe(42500);
  });
});
