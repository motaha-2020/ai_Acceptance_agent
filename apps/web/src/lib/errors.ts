'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { ApiRequestError } from '@/lib/api/client';

/** Known API error codes get a translated message; anything else falls back to a generic one. */
const KNOWN = new Set([
  'INVALID_CREDENTIALS',
  'RATE_LIMITED',
  'TOO_MANY_REQUESTS',
  'FORBIDDEN',
  'NOT_FOUND',
  'VALIDATION_FAILED',
  'OPEN_SNAGS',
  'NOT_REVIEWABLE',
  'CONCURRENT_UPDATE',
  'CONFLICT',
  'EMAIL_TAKEN',
  'SELF_LOCKOUT',
  'HAS_ACTIVE_SITES',
  'HAS_OPEN_VISITS',
  'INVALID_STATE_TRANSITION',
  'SNAG_NOT_DISMISSABLE',
  'NO_AI_RESULT',
  'AI_UNCERTAIN',
  'API_UNREACHABLE',
  'NETWORK',
  'CSRF',
]);

export function useErrorMessage(): (error: unknown) => string {
  const t = useTranslations('errors');
  return useCallback(
    (error: unknown) => {
      if (error instanceof ApiRequestError) {
        if (KNOWN.has(error.code)) return t(error.code);
        if (error.status === 429) return t('RATE_LIMITED');
        if (error.status === 403) return t('FORBIDDEN');
        if (error.status === 404) return t('NOT_FOUND');
        if (error.status >= 500) return t('SERVER');
        return error.message || t('GENERIC');
      }
      return t('GENERIC');
    },
    [t],
  );
}
