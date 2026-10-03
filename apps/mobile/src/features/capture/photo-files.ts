import { Directory, File, Paths } from 'expo-file-system';

/**
 * Captured photos live in the app's private document directory (not the cache, which Android may
 * purge, and not the shared gallery) until the server has acknowledged them.
 */
const PENDING_DIR = 'pending-photos';

function pendingDir(): Directory {
  const dir = new Directory(Paths.document, PENDING_DIR);
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/** Move the camera's temp file into permanent app storage, named by its clientUuid. */
export async function persistCapture(tempUri: string, clientUuid: string): Promise<{ uri: string; size: number | null }> {
  const src = new File(tempUri);
  const dest = new File(pendingDir(), `${clientUuid}.jpg`);
  await src.move(dest);
  const stored = new File(pendingDir(), `${clientUuid}.jpg`);
  if (!stored.exists) throw new Error('photo could not be stored');
  return { uri: stored.uri, size: stored.size ?? null };
}

export const fileOps = {
  exists(uri: string): boolean {
    return new File(uri).exists;
  },
  delete(uri: string): void {
    const f = new File(uri);
    if (f.exists) f.delete();
  },
};

/** Files in the pending directory that no queue row references (diagnostics only; never deleted). */
export function orphanPhotoUris(known: Set<string>): string[] {
  return pendingDir()
    .list()
    .filter((e): e is File => e instanceof File)
    .map((f) => f.uri)
    .filter((uri) => !known.has(uri));
}
