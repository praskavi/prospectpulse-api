import { AppError } from './errorHandler.js';

function formatZodErrors(error) {
  const issues = error.issues || error.errors || [];

  return issues
    .map((issue) => {
      const path = issue.path.length ? issue.path.join('.') : 'body';
      return `${path}: ${issue.message}`;
    })
    .join('; ') || 'Invalid request';
}

export function validateRequest(schema) {
  return (req, res, next) => {
    const result = schema.safeParse({
      body: req.body,
      query: req.query,
      params: req.params,
    });

    if (!result.success) {
      next(new AppError(formatZodErrors(result.error), 400));
      return;
    }

    const { body, query, params } = result.data;
    if (body) req.body = body;
    if (query) res.locals.validatedQuery = query;
    if (params) req.params = params;

    next();
  };
}
