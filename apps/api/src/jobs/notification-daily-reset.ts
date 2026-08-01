/**
 * @deprecated Job riêng đã gộp vào `data-retention` (xóa thông báo > 7 ngày lúc 0h VN).
 * Giữ export để tương thích smoke / import cũ.
 */
export {
  runDataRetention as purgeAllNotifications,
  scheduleDataRetention as scheduleNotificationDailyReset,
} from './data-retention.js';
