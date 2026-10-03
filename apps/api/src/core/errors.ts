/**
 * Domain errors thrown by services; the global filter maps them to the shared ApiError shape:
 * { statusCode, error: { code, message, details? }, requestId }.
 */
export class DomainError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export const notFound = (entity: string, id?: string): DomainError =>
  new DomainError(404, 'NOT_FOUND', id ? `${entity} ${id} not found` : `${entity} not found`);

export const conflict = (code: string, message: string, details?: unknown): DomainError => new DomainError(409, code, message, details);

export const badRequest = (code: string, message: string, details?: unknown): DomainError => new DomainError(400, code, message, details);

export const forbidden = (message = 'You are not allowed to perform this action'): DomainError => new DomainError(403, 'FORBIDDEN', message);

export const unauthorized = (code = 'UNAUTHORIZED', message = 'Authentication required'): DomainError => new DomainError(401, code, message);

export const invalidTransition = (entity: string, from: string, to: string): DomainError =>
  new DomainError(409, 'INVALID_STATE_TRANSITION', `${entity} cannot go from ${from} to ${to}`, { from, to });
