import { hash, verify } from '@node-rs/argon2';

/**
 * Credential hashing shared by the seed script and the API.
 * argon2id with OWASP 2024 minimums (19 MiB, t=2, p=1).
 */
const ARGON2ID = 2;
const OPTIONS = { algorithm: ARGON2ID, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

/** True when the stored hash was produced with weaker parameters than the current ones. */
export function needsRehash(passwordHash: string): boolean {
  return !passwordHash.startsWith(`$argon2id$v=19$m=${OPTIONS.memoryCost},t=${OPTIONS.timeCost},p=${OPTIONS.parallelism}$`);
}
