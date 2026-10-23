import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ error: { code: 'not_found', message: 'Route not found', requestId: req.id } });
};

/** Consistent error envelope. Never leaks stack traces or internal messages. */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const requestId = req.id;
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details, requestId } });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'validation_error',
        message: 'Request validation failed',
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        requestId,
      },
    });
    return;
  }
  const type = (err as { type?: string }).type;
  if (type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'invalid_json', message: 'Malformed JSON body', requestId } });
    return;
  }
  if (type === 'entity.too.large') {
    res.status(413).json({ error: { code: 'payload_too_large', message: 'Request body too large', requestId } });
    return;
  }
  logger.error({ err, requestId, path: req.path }, 'Unhandled error');
  res.status(500).json({ error: { code: 'internal_error', message: 'Something went wrong', requestId } });
};
