import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        message: err.message,
        code: err.code,
      },
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        message: 'Dữ liệu không hợp lệ',
        code: 'VALIDATION_ERROR',
        details: err.flatten().fieldErrors,
      },
    });
    return;
  }

  /**
   * Lỗi từ express.json — lỗi phía client, không phải sự cố hệ thống.
   * Nếu để rơi xuống nhánh 500 bên dưới thì vừa báo sai cho người dùng, vừa làm
   * nhiễu tỉ lệ lỗi 5xx khiến cảnh báo vận hành mất ý nghĩa.
   */
  const bodyErr = err as { type?: string; status?: number; statusCode?: number };
  if (bodyErr?.type === 'entity.too.large') {
    res.status(413).json({
      error: {
        message: 'Dữ liệu gửi lên quá lớn. Ảnh tối đa 5MB.',
        code: 'PAYLOAD_TOO_LARGE',
      },
    });
    return;
  }
  if (bodyErr?.type === 'entity.parse.failed' || bodyErr?.type === 'encoding.unsupported') {
    res.status(400).json({
      error: {
        message: 'Dữ liệu gửi lên không đọc được',
        code: 'BAD_REQUEST',
      },
    });
    return;
  }

  console.error(err);
  res.status(500).json({
    error: {
      message: 'Đã xảy ra lỗi hệ thống',
      code: 'INTERNAL_ERROR',
    },
  });
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}
