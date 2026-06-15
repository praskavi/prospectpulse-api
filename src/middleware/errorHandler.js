// Central Express error-handling middleware.
// Controllers call next(err) to reach here instead of duplicating res.status(500) logic.

export class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'AppError';
  }
}

// Must have 4 params so Express recognises it as an error handler.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || 500;
  const message    = err.message    || 'Internal server error';

  console.error(`[${req.method} ${req.originalUrl}] ${statusCode} — ${message}`);

  res.status(statusCode).json({
    success: false,
    message,
  });
}
