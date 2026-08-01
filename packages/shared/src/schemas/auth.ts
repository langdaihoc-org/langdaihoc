import { z } from 'zod';
import { isEmailLike, isPhoneLike, normalizePhoneVN } from '../phone.js';

const passwordSchema = z
  .string()
  .min(8, 'Mật khẩu tối thiểu 8 ký tự')
  .regex(/[a-zA-Z]/, 'Mật khẩu phải có ít nhất một chữ cái')
  .regex(/[0-9]/, 'Mật khẩu phải có ít nhất một chữ số');

const phoneField = z
  .string()
  .trim()
  .min(9, 'Số điện thoại không hợp lệ')
  .max(15, 'Số điện thoại không hợp lệ')
  .transform(normalizePhoneVN)
  .refine((p) => isPhoneLike(p), { message: 'Số điện thoại không hợp lệ' });

export const buyerRegisterSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, 'Họ tên quá ngắn')
      .max(100, 'Họ tên quá dài'),
    email: z.string().email('Email không hợp lệ').toLowerCase(),
    phone: z
      .string()
      .trim()
      .optional()
      .transform((v) => {
        if (!v) return undefined;
        const n = normalizePhoneVN(v);
        return n || undefined;
      })
      .refine((v) => v === undefined || isPhoneLike(v), {
        message: 'Số điện thoại không hợp lệ',
      }),
    password: passwordSchema,
    confirmPassword: z.string(),
    agreeTerms: z.literal(true, {
      errorMap: () => ({ message: 'Bạn phải đồng ý điều khoản sử dụng' }),
    }),
    agreePrivacy: z.literal(true, {
      errorMap: () => ({ message: 'Bạn phải đồng ý chính sách bảo mật' }),
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Xác nhận mật khẩu không khớp',
    path: ['confirmPassword'],
  });

export const sellerRegisterSchema = z
  .object({
    fullName: z.string().trim().min(2).max(100),
    email: z.string().email().toLowerCase(),
    phone: phoneField,
    password: passwordSchema,
    confirmPassword: z.string(),
    /** Mong muốn bán ăn / giặt — admin xác nhận khi duyệt */
    intendedService: z.enum(['food', 'laundry']),
    contactNote: z.string().trim().max(500).optional(),
    agreeTerms: z.literal(true),
    agreePrivacy: z.literal(true),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Xác nhận mật khẩu không khớp',
    path: ['confirmPassword'],
  });

/**
 * Đăng nhập bằng email hoặc SĐT.
 * Giữ field `email` legacy để smoke/e2e cũ vẫn gửi được.
 */
export const loginSchema = z
  .object({
    identifier: z.string().trim().min(3).max(255).optional(),
    email: z.string().trim().min(3).max(255).optional(),
    password: z.string().min(1, 'Vui lòng nhập mật khẩu'),
    rememberMe: z.boolean(),
  })
  .superRefine((data, ctx) => {
    const id = (data.identifier ?? data.email ?? '').trim();
    if (!id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Nhập email hoặc số điện thoại',
        path: ['identifier'],
      });
      return;
    }
    if (!isEmailLike(id) && !isPhoneLike(id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Email hoặc số điện thoại không hợp lệ',
        path: ['identifier'],
      });
    }
  })
  .transform((data) => {
    const raw = (data.identifier ?? data.email ?? '').trim();
    const identifier = isEmailLike(raw) ? raw.toLowerCase() : normalizePhoneVN(raw);
    return {
      identifier,
      password: data.password,
      rememberMe: data.rememberMe,
    };
  });

export const forgotPasswordSchema = z
  .object({
    identifier: z.string().trim().min(3).max(255).optional(),
    email: z.string().trim().min(3).max(255).optional(),
  })
  .superRefine((data, ctx) => {
    const id = (data.identifier ?? data.email ?? '').trim();
    if (!id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Nhập email hoặc số điện thoại đã đăng ký',
        path: ['identifier'],
      });
      return;
    }
    if (!isEmailLike(id) && !isPhoneLike(id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Email hoặc số điện thoại không hợp lệ',
        path: ['identifier'],
      });
    }
  })
  .transform((data) => {
    const raw = (data.identifier ?? data.email ?? '').trim();
    return {
      identifier: isEmailLike(raw) ? raw.toLowerCase() : normalizePhoneVN(raw),
    };
  });

export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Xác nhận mật khẩu không khớp',
    path: ['confirmPassword'],
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Nhập mật khẩu hiện tại'),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Xác nhận mật khẩu không khớp',
    path: ['confirmPassword'],
  });

export const profileUpdateSchema = z.object({
  fullName: z.string().trim().min(2).max(100).optional(),
  email: z.string().trim().email('Email không hợp lệ').toLowerCase().optional(),
  /** Bắt buộc khi đổi email (kiểm tra thêm ở API). */
  currentPassword: z.string().min(1).optional(),
  phone: z
    .union([phoneField, z.literal(''), z.null()])
    .optional()
    .transform((v) => {
      if (v === undefined) return undefined;
      if (v === '' || v === null) return null;
      return v;
    }),
});

export type BuyerRegisterInput = z.infer<typeof buyerRegisterSchema>;
export type SellerRegisterInput = z.infer<typeof sellerRegisterSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
