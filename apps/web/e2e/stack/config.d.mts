export const PG_PORT: number;
export const API_PORT: number;
export const WEB_PORT: number;
export const API_URL: string;
export const WEB_URL: string;
export interface E2eUser {
  email: string;
  password: string;
  name: string;
  role: 'admin' | 'reviewer' | 'pm' | 'technician' | 'viewer';
}
export const USERS: { admin: E2eUser; reviewer: E2eUser; pm: E2eUser; technician: E2eUser; viewer: E2eUser };
export const SECRETS: { JWT_ACCESS_SECRET: string; STORAGE_SIGNING_SECRET: string };
