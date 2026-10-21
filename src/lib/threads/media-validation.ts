import {
  THREADS_ASPECT_MAX,
  THREADS_ASPECT_MIN,
  THREADS_IMAGE_MAX_BYTES,
  THREADS_IMAGE_MIME_TYPES,
  THREADS_MEDIA_MAX_ITEMS,
} from "@/lib/threads/limits";

export function validateImageFile(file: { type: string; size: number; name: string }, currentCount: number): string | null {
  if (currentCount >= THREADS_MEDIA_MAX_ITEMS) return `You can attach up to ${THREADS_MEDIA_MAX_ITEMS} images.`;
  if (!(THREADS_IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) return `${file.name}: only JPEG and PNG images are supported by Threads.`;
  if (file.size > THREADS_IMAGE_MAX_BYTES) return `${file.name}: images can be at most 8 MB.`;
  if (file.size === 0) return `${file.name}: the file is empty.`;
  return null;
}

export function validateAspectRatio(width: number, height: number): string | null {
  if (width <= 0 || height <= 0) return "The image dimensions could not be read.";
  const ratio = width / height;
  if (ratio < THREADS_ASPECT_MIN || ratio > THREADS_ASPECT_MAX) return "Threads accepts aspect ratios between 0.01:1 and 10:1.";
  return null;
}
