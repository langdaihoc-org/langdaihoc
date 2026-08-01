export type SeedFoodItem = {
  name: string;
  price: string;
  desc: string;
  cat: string;
  prep: number;
};

export const EXTRA_CATEGORIES = [
  { name: 'Bún phở', slug: 'bun-pho', type: 'food' as const },
  { name: 'Ăn vặt', slug: 'an-vat', type: 'food' as const },
  { name: 'Combo', slug: 'combo', type: 'food' as const },
  { name: 'Giặt nhanh', slug: 'giat-nhanh', type: 'laundry' as const },
];

/** Seller chờ admin duyệt — dùng test trang /admin/sellers (local) */
export const PENDING_SELLER = {
  email: 'pending.seller@demo.local',
  role: 'seller' as const,
  fullName: 'Chủ quán chờ duyệt',
  phone: '0909998877',
  shopName: 'Quán Mới KTX',
  serviceTypes: 'food' as const,
  description: 'Đăng ký mới — chờ admin duyệt loại dịch vụ',
  businessAddress: 'KTX khu E, ĐHQG',
};

export const EXTRA_SELLERS = [
  {
    email: 'food.seller2@demo.local',
    role: 'seller' as const,
    fullName: 'Chủ quán Bún Phở',
    phone: '0902111222',
    shopName: 'Bún Phở SV',
    serviceTypes: 'food' as const,
    description: 'Bún, phở, hủ tiếu — ship nhanh KTX',
    businessAddress: 'KTX khu C, ĐHQG',
    serviceAreas: ['KTX C', 'KTX B', 'Làng ĐHQG'],
    avgDeliveryMinutes: 20,
  },
  {
    email: 'laundry.seller3@demo.local',
    role: 'seller' as const,
    fullName: 'Chủ tiệm Giặt Sạch',
    phone: '0903334455',
    shopName: 'Giặt Sạch 24h',
    serviceTypes: 'laundry' as const,
    description: 'Giặt ủi, giặt khô — lấy trả tại tòa / rào',
    businessAddress: 'KTX khu D, ĐHQG',
    serviceAreas: ['KTX D', 'KTX E', 'Linh Trung'],
    avgDeliveryMinutes: 120,
  },
  {
    email: 'ship.seller4@demo.local',
    role: 'seller' as const,
    fullName: 'Shipper Làng ĐH',
    phone: '0904445566',
    shopName: 'Nhận Ship Hộ Làng ĐH',
    serviceTypes: 'ship_proxy' as const,
    description: 'Nhận hộ Shopee/Lazada quanh KTX — giao lại tại tòa / rào',
    businessAddress: 'KTX khu A, ĐHQG',
    serviceAreas: ['KTX A', 'KTX B', 'KTX C', 'Làng ĐHQG'],
    avgDeliveryMinutes: 45,
  },
];

export const MAIN_SELLER_FOOD: SeedFoodItem[] = [
  { name: 'Cơm sườn nướng', price: '32000', desc: 'Sườn nướng thơm', cat: 'com', prep: 15 },
  { name: 'Cơm gà roti', price: '38000', desc: 'Gà roti giòn da', cat: 'com', prep: 18 },
  { name: 'Cơm bò lúc lắc', price: '42000', desc: 'Bò lúc lắc + salad', cat: 'com', prep: 20 },
  { name: 'Cơm chiên dương châu', price: '30000', desc: 'Cơm chiên thập cẩm', cat: 'com', prep: 12 },
  { name: 'Trà chanh', price: '12000', desc: 'Trà chanh mát', cat: 'do-uong', prep: 5 },
  { name: 'Cafe sữa đá', price: '18000', desc: 'Cafe robusta', cat: 'do-uong', prep: 5 },
  { name: 'Sinh tố bơ', price: '22000', desc: 'Bơ sáp dẻo', cat: 'do-uong', prep: 8 },
  { name: 'Combo cơm + trà', price: '45000', desc: 'Tiết kiệm buổi trưa', cat: 'combo', prep: 15 },
  { name: 'Khoai tây chiên', price: '20000', desc: 'Phô mai tan chảy', cat: 'an-vat', prep: 10 },
  { name: 'Xúc xích nướng', price: '15000', desc: '2 xiên', cat: 'an-vat', prep: 8 },
];

export const SELLER2_FOOD: SeedFoodItem[] = [
  { name: 'Bún bò Huế', price: '40000', desc: 'Nước dùng đậm vị', cat: 'bun-pho', prep: 15 },
  { name: 'Phở bò tái', price: '45000', desc: 'Phở bò truyền thống', cat: 'bun-pho', prep: 12 },
  { name: 'Hủ tiếu Nam Vang', price: '35000', desc: 'Hủ tiếu khô / nước', cat: 'bun-pho', prep: 12 },
  { name: 'Bún riêu cua', price: '38000', desc: 'Riêu cua đậm đà', cat: 'bun-pho', prep: 15 },
  { name: 'Mì xào bò', price: '42000', desc: 'Mì trứng xào bò', cat: 'bun-pho', prep: 14 },
  { name: 'Bánh mì thịt nướng', price: '25000', desc: 'Bánh mì Sài Gòn', cat: 'an-vat', prep: 8 },
  { name: 'Chả giò (4 cuốn)', price: '28000', desc: 'Chả giò giòn rụm', cat: 'an-vat', prep: 10 },
  { name: 'Combo bún + trà đào', price: '52000', desc: 'No nê buổi trưa', cat: 'combo', prep: 15 },
];

export const LAUNDRY_SELLER3_SERVICES = [
  { name: 'Giặt thường', price: '15000', unit: 'kg' as const, hours: 24 },
  { name: 'Giặt express', price: '20000', unit: 'kg' as const, hours: 12 },
  { name: 'Giặt chăn mền', price: '80000', unit: 'item' as const, hours: 48 },
  { name: 'Giặt giày', price: '35000', unit: 'item' as const, hours: 24 },
];

export type DemoOrderSeed = {
  orderCode: string;
  type: 'food' | 'laundry';
  status: string;
  sellerEmail: string;
  subtotal: string;
  total: string;
  paymentMethod?: 'cash' | 'bank_transfer';
  paymentStatus?: string;
  foodItems?: { name: string; unitPrice: string; quantity: number; lineTotal: string }[];
  laundry?: {
    serviceName: string;
    estimatedQty: string;
    estimatedUnit: 'kg' | 'item';
    actualQty?: string;
    unitPrice?: string;
    surcharge?: string;
    finalPrice?: string;
  };
  history?: { fromStatus: string | null; toStatus: string }[];
  completed?: boolean;
  cancelReason?: string;
};

export const DEMO_ORDERS: DemoOrderSeed[] = [
  {
    orderCode: 'SEED-FD-PENDING',
    type: 'food',
    status: 'pending',
    sellerEmail: 'seller@demo.local',
    subtotal: '35000',
    total: '35000',
    foodItems: [{ name: 'Cơm tấm sườn bì', unitPrice: '35000', quantity: 1, lineTotal: '35000' }],
    history: [{ fromStatus: null, toStatus: 'pending' }],
  },
  {
    orderCode: 'SEED-FD-PREP',
    type: 'food',
    status: 'preparing',
    sellerEmail: 'seller@demo.local',
    subtotal: '80000',
    total: '80000',
    foodItems: [{ name: 'Cơm gà xối mỡ', unitPrice: '40000', quantity: 2, lineTotal: '80000' }],
    history: [
      { fromStatus: null, toStatus: 'pending' },
      { fromStatus: 'pending', toStatus: 'accepted' },
      { fromStatus: 'accepted', toStatus: 'preparing' },
    ],
  },
  {
    orderCode: 'SEED-FD-DONE',
    type: 'food',
    status: 'completed',
    sellerEmail: 'seller@demo.local',
    subtotal: '25000',
    total: '25000',
    paymentStatus: 'paid',
    foodItems: [{ name: 'Trà sữa trân châu', unitPrice: '25000', quantity: 1, lineTotal: '25000' }],
    history: [
      { fromStatus: null, toStatus: 'pending' },
      { fromStatus: 'pending', toStatus: 'accepted' },
      { fromStatus: 'accepted', toStatus: 'preparing' },
      { fromStatus: 'preparing', toStatus: 'delivering' },
      { fromStatus: 'delivering', toStatus: 'completed' },
    ],
    completed: true,
  },
  {
    orderCode: 'SEED-FD-CANCEL',
    type: 'food',
    status: 'cancelled',
    sellerEmail: 'food.seller2@demo.local',
    subtotal: '40000',
    total: '40000',
    foodItems: [{ name: 'Bún bò Huế', unitPrice: '40000', quantity: 1, lineTotal: '40000' }],
    history: [
      { fromStatus: null, toStatus: 'pending' },
      { fromStatus: 'pending', toStatus: 'cancelled' },
    ],
    cancelReason: 'Đổi ý — hủy đơn',
  },
  {
    orderCode: 'SEED-LD-PENDING',
    type: 'laundry',
    status: 'pending',
    sellerEmail: 'laundry.seller3@demo.local',
    subtotal: '45000',
    total: '45000',
    paymentMethod: 'cash',
    laundry: { serviceName: 'Giặt thường', estimatedQty: '3', estimatedUnit: 'kg' },
    history: [{ fromStatus: null, toStatus: 'pending' }],
  },
  {
    orderCode: 'SEED-LD-QUOTE',
    type: 'laundry',
    status: 'waiting_price_confirmation',
    sellerEmail: 'laundry.seller3@demo.local',
    subtotal: '40000',
    total: '40000',
    paymentMethod: 'bank_transfer',
    paymentStatus: 'pending',
    laundry: {
      serviceName: 'Giặt express',
      estimatedQty: '2',
      estimatedUnit: 'kg',
      actualQty: '2.5',
      unitPrice: '20000',
      surcharge: '0',
      finalPrice: '50000',
    },
    history: [
      { fromStatus: null, toStatus: 'pending' },
      { fromStatus: 'pending', toStatus: 'accepted' },
      { fromStatus: 'accepted', toStatus: 'picking_up' },
      { fromStatus: 'picking_up', toStatus: 'picked_up' },
      { fromStatus: 'picked_up', toStatus: 'waiting_price_confirmation' },
    ],
  },
  {
    orderCode: 'SEED-LD-WASH',
    type: 'laundry',
    status: 'washing',
    sellerEmail: 'laundry.seller3@demo.local',
    subtotal: '50000',
    total: '50000',
    paymentMethod: 'bank_transfer',
    paymentStatus: 'pending',
    laundry: {
      serviceName: 'Giặt khô',
      estimatedQty: '1',
      estimatedUnit: 'item',
      actualQty: '1',
      unitPrice: '50000',
      surcharge: '0',
      finalPrice: '50000',
    },
    history: [
      { fromStatus: null, toStatus: 'pending' },
      { fromStatus: 'pending', toStatus: 'accepted' },
      { fromStatus: 'accepted', toStatus: 'picking_up' },
      { fromStatus: 'picking_up', toStatus: 'picked_up' },
      { fromStatus: 'picked_up', toStatus: 'waiting_price_confirmation' },
      { fromStatus: 'waiting_price_confirmation', toStatus: 'washing' },
    ],
  },
];
