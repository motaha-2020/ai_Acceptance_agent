// Test-only values for the LOCAL e2e/dev stack (embedded PostgreSQL + API on loopback).
// None of these are real credentials.
export const PG_PORT = Number(process.env.E2E_PG_PORT ?? 55433);
export const API_PORT = Number(process.env.E2E_API_PORT ?? 3010);
export const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 3001);
export const API_URL = `http://localhost:${API_PORT}`;
export const WEB_URL = `http://localhost:${WEB_PORT}`;

export const USERS = {
  admin: { email: 'admin@acceptance.local', password: 'E2e-Admin-Pass-123', name: 'Admin', role: 'admin' },
  reviewer: { email: 'reviewer@acceptance.local', password: 'E2e-Reviewer-Pass-123', name: 'Mona Reviewer', role: 'reviewer' },
  pm: { email: 'pm@acceptance.local', password: 'E2e-Pm-Pass-12345', name: 'Omar PM', role: 'pm' },
  technician: { email: 'tech@acceptance.local', password: 'E2e-Tech-Pass-12345', name: 'Hassan Technician', role: 'technician' },
};

export const SECRETS = {
  JWT_ACCESS_SECRET: 'e2e-only-jwt-secret-0123456789abcdef0123456789',
  STORAGE_SIGNING_SECRET: 'e2e-only-storage-secret-0123456789abcdef0123',
};
