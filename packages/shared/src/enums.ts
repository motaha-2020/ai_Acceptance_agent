import { z } from 'zod';

export const Role = z.enum(['admin', 'pm', 'reviewer', 'engineer', 'technician', 'viewer']);
export type Role = z.infer<typeof Role>;

export const PhotoCategory = z.enum([
  'rack', 'rack_base', 'router', 'patch_cords', 'armoured_cables', 'duct', 'management',
  'odf_cross_connect', 'odf_cross_connect_labels', 'odf_tie', 'odf_tie_labels', 'odf_sheet',
  'uplink', 'uplink_labels', 'pdu', 'power_path', 'earth_path', 'power_labels', 'power_system',
  'test_room',
]);
export type PhotoCategory = z.infer<typeof PhotoCategory>;

export const PhotoStatus = z.enum([
  'captured', 'uploaded', 'ai_analyzed', 'pending_review', 'approved', 'rejected', 'fixed',
]);
export type PhotoStatus = z.infer<typeof PhotoStatus>;

export const SnagStatus = z.enum(['open', 'fixed', 'verified']);
export const SnagSource = z.enum(['ai', 'human']);
export const Severity = z.enum(['minor', 'major', 'critical']);
export const ReviewDecision = z.enum(['agree', 'override', 'add_snag']);
export const Verdict = z.enum(['accept', 'reject', 'uncertain']);
