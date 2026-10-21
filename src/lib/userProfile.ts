// Profile picture and display name, kept per account in this browser.

import { useSyncExternalStore } from 'react';

export interface UserProfile {
  name?: string;
  /** Square JPEG as a data URL. */
  image?: string;
}

const key = (id: string) => `nitro:profile:v1:${id}`;
const listeners = new Set<() => void>();
const cache = new Map<string, UserProfile>();

export function getUserProfile(id: string): UserProfile {
  if (!cache.has(id)) {
    let p: UserProfile = {};
    try {
      p = JSON.parse(localStorage.getItem(key(id)) || '{}');
    } catch {
      /* storage unavailable */
    }
    cache.set(id, p);
  }
  return cache.get(id)!;
}

/** Saves the profile. Returns an error message if the browser refused to store it. */
export function saveUserProfile(id: string, p: UserProfile): string | null {
  const clean: UserProfile = {};
  const name = p.name?.trim().slice(0, 24);
  if (name) clean.name = name;
  if (p.image) clean.image = p.image;
  try {
    localStorage.setItem(key(id), JSON.stringify(clean));
  } catch {
    return 'Could not save your profile in this browser.';
  }
  cache.set(id, clean);
  listeners.forEach((l) => l());
  return null;
}

export function useUserProfile(id: string): UserProfile {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => getUserProfile(id),
  );
}

/** Crops the picture to a centred square and shrinks it to 256px, so it stays small. */
export async function imageToAvatar(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Pick an image file (PNG, JPG, GIF or WebP).');
  if (file.size > 15 * 1024 * 1024) throw new Error('That image is over 15 MB.');
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, 256, 256);
  bmp.close();
  return canvas.toDataURL('image/jpeg', 0.86);
}
