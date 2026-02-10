import { Image } from 'react-native';

export function buildVersionedImageUri(
  uri: string,
  version?: number | string,
  hash?: string,
): string {
  if (!uri) return uri;
  const token = version ?? hash;
  if (!token) return uri;
  const separator = uri.includes('?') ? '&' : '?';
  return `${uri}${separator}v=${encodeURIComponent(String(token))}`;
}

export function prefetchImage(uri?: string | null): void {
  if (!uri || !uri.startsWith('http')) return;
  void Image.prefetch(uri).catch(() => {
    // Best-effort image warmup for offline/fast follow-up renders.
  });
}

export function prefetchImages(uris: Array<string | undefined | null>): void {
  const unique = new Set<string>();
  uris.forEach((uri) => {
    if (uri && uri.startsWith('http')) unique.add(uri);
  });
  unique.forEach((uri) => prefetchImage(uri));
}

