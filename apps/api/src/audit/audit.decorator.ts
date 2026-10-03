import { SetMetadata } from '@nestjs/common';

export const AUDIT = 'audit:meta';

export type AuditEntity = 'User' | 'Project' | 'Site' | 'Device' | 'Visit' | 'Photo' | 'Snag' | 'Review' | 'Auth' | 'AppRelease' | 'OtaUpdate' | 'Report' | 'SiteDocuments';

export interface AuditMeta {
  entity: AuditEntity;
  /** Route param holding the entity id (for the `before` snapshot). Default `id`. */
  idParam?: string;
  /** Non-secret body fields worth keeping (e.g. the email of a login attempt). */
  captureBody?: string[];
}

/**
 * Names the entity a mutating route touches so the audit interceptor can store a `before`
 * snapshot. Mutations without it are still audited (method, path, actor, status, response).
 */
export const Audited = (entity: AuditEntity, opts: Omit<AuditMeta, 'entity'> = {}): MethodDecorator & ClassDecorator =>
  SetMetadata(AUDIT, { entity, ...opts } satisfies AuditMeta);
