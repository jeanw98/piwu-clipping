export type ReferenceRole = 'style' | 'protagonist' | 'scenery';

export type ReferenceDraft = {
  role: ReferenceRole;
  mime: 'image/jpeg' | 'image/png' | 'image/webp';
  data: string;
  previewUrl: string;
  name: string;
  label?: string;
};

export async function fileToReference(
  file: File,
  role: ReferenceRole,
): Promise<ReferenceDraft> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Only JPEG, PNG, or WebP');
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new Error('Each image must be under 8MB');
  }

  const bitmap = await createImageBitmap(file);
  const maxEdge = 1280;
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not process image');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) =>
        result ? resolve(result) : reject(new Error('Image compress failed')),
      'image/jpeg',
      0.82,
    );
  });
  if (blob.size > 1.5 * 1024 * 1024) {
    throw new Error('Reference still too large after compress — try another photo');
  }

  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return {
    role,
    mime: 'image/jpeg',
    data: btoa(binary),
    previewUrl: URL.createObjectURL(blob),
    name: file.name.replace(/\.\w+$/, '.jpg'),
  };
}

export const ROLE_LABELS: Record<ReferenceRole, string> = {
  protagonist: 'Protagonist',
  scenery: 'Scenery',
  style: 'Style',
};

export const ROLE_CAPS: Record<ReferenceRole, number> = {
  protagonist: 1,
  scenery: 3,
  style: 3,
};
