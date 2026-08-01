export const FOOD_REVIEW_TAGS = ['Ngon', 'Đúng món', 'Giao nhanh', 'Đóng gói kỹ', 'Giá hợp lý', 'Thân thiện'] as const;
export const LAUNDRY_REVIEW_TAGS = ['Sạch sẽ', 'Thơm', 'Giao đúng hạn', 'Giá hợp lý', 'Cẩn thận'] as const;

export function reviewTagsForOrderType(type: string) {
  return type === 'laundry' ? LAUNDRY_REVIEW_TAGS : FOOD_REVIEW_TAGS;
}
