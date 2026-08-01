/** Unit price including selected option deltas. */
export function computeFoodUnitPrice(basePrice: number, optionDeltas: number[]): number {
  return basePrice + optionDeltas.reduce((sum, delta) => sum + delta, 0);
}

export function computeFoodLineTotal(basePrice: number, optionDeltas: number[], quantity: number): number {
  return computeFoodUnitPrice(basePrice, optionDeltas) * quantity;
}

export function computeCartSubtotal(
  items: { basePrice: number; optionDeltas: number[]; quantity: number }[],
): number {
  return items.reduce(
    (sum, item) => sum + computeFoodLineTotal(item.basePrice, item.optionDeltas, item.quantity),
    0,
  );
}

export function computeLaundryEstimate(basePrice: number, estimatedQty: number): number {
  return basePrice * estimatedQty;
}

export function computeLaundryFinalPrice(
  actualQty: number,
  unitPrice: number,
  surcharge = 0,
): number {
  return actualQty * unitPrice + surcharge;
}

/** Phí nhận đồ ship hộ — server quyết định, không tin client. */
export const SHIP_PROXY_FEE_VND = 15_000;
