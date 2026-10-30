import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

const VALID = /^[A-Za-z0-9-]{1,64}$/;

/** Accepts a well-formed `X-Request-Id` or generates a UUID, and always echoes it back. */
export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.get('x-request-id');
  const id = incoming && VALID.test(incoming) ? incoming : randomUUID();
  res.locals.requestId = id;
  res.set('X-Request-Id', id);
  next();
};
