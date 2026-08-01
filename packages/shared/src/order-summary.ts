export function formatOrderSummary(
  type: string,
  items: { itemName: string; quantity: number }[],
  laundry?: { serviceName: string; estimatedQty?: string | null; estimatedUnit?: string | null } | null,
  shipProxy?: { trackingCode?: string | null; pickupLocation?: string | null } | null,
): string {
  if (type === 'ship_proxy') {
    const code = shipProxy?.trackingCode?.trim();
    const loc = shipProxy?.pickupLocation?.trim();
    if (code && loc) return `Nhận đồ ship hộ · ${code} · ${loc}`;
    if (code) return `Nhận đồ ship hộ · ${code}`;
    if (loc) return `Nhận đồ ship hộ · ${loc}`;
    return 'Nhận đồ ship hộ';
  }
  if (type === 'laundry' && laundry?.serviceName) {
    const unit =
      laundry.estimatedUnit === 'kg'
        ? 'kg'
        : laundry.estimatedUnit === 'item'
          ? ' món'
          : laundry.estimatedUnit === 'load'
            ? ' tải'
            : '';
    const qty = laundry.estimatedQty ? ` · ${laundry.estimatedQty}${unit}` : '';
    return `${laundry.serviceName}${qty}`;
  }
  if (items.length === 0) return '';
  if (items.length === 1) {
    const item = items[0];
    return item.quantity > 1 ? `${item.itemName} ×${item.quantity}` : item.itemName;
  }
  const parts = items
    .slice(0, 2)
    .map((item) => (item.quantity > 1 ? `${item.itemName} ×${item.quantity}` : item.itemName));
  const extra = items.length > 2 ? ` +${items.length - 2} món` : '';
  return parts.join(', ') + extra;
}
