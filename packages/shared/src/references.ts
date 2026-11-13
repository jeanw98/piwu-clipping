import { z } from 'zod';

export const REFERENCE_ROLES = ['style', 'protagonist', 'scenery'] as const;
export type ReferenceRole = (typeof REFERENCE_ROLES)[number];

export const REFERENCE_ROLE_CAPS: Record<ReferenceRole, number> = {
  protagonist: 1,
  scenery: 3,
  style: 3,
};

export const referenceRoleSchema = z.enum(REFERENCE_ROLES);

export const typedReferenceMetaSchema = z.object({
  role: referenceRoleSchema,
  url: z.string().min(1),
  label: z.string().max(120).optional(),
});

export type TypedReferenceMeta = z.infer<typeof typedReferenceMetaSchema>;

export const typedReferenceUploadSchema = z.object({
  role: referenceRoleSchema,
  mime: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  data: z.string().min(32),
  label: z.string().max(120).optional(),
});

export type TypedReferenceUpload = z.infer<typeof typedReferenceUploadSchema>;

/** Normalize meta: enforce caps, drop invalids. */
export function normalizeReferenceMeta(
  items: unknown,
): TypedReferenceMeta[] {
  if (!Array.isArray(items)) return [];
  const counts: Record<ReferenceRole, number> = {
    protagonist: 0,
    scenery: 0,
    style: 0,
  };
  const out: TypedReferenceMeta[] = [];
  for (const raw of items) {
    const parsed = typedReferenceMetaSchema.safeParse(raw);
    if (!parsed.success) continue;
    const role = parsed.data.role;
    if (counts[role] >= REFERENCE_ROLE_CAPS[role]) continue;
    counts[role] += 1;
    out.push({
      role,
      url: parsed.data.url,
      label: parsed.data.label,
    });
  }
  return out;
}

/**
 * Merge job overrides with project defaults.
 * Job entries win per role until that role's cap is filled.
 */
export function mergeReferenceMeta(
  jobMeta: TypedReferenceMeta[] | null | undefined,
  projectMeta: TypedReferenceMeta[] | null | undefined,
): TypedReferenceMeta[] {
  const job = normalizeReferenceMeta(jobMeta ?? []);
  const project = normalizeReferenceMeta(projectMeta ?? []);
  const counts: Record<ReferenceRole, number> = {
    protagonist: 0,
    scenery: 0,
    style: 0,
  };
  const out: TypedReferenceMeta[] = [];
  for (const item of [...job, ...project]) {
    if (counts[item.role] >= REFERENCE_ROLE_CAPS[item.role]) continue;
    counts[item.role] += 1;
    out.push(item);
  }
  return out;
}

/** Legacy flat URLs: index 0 → protagonist, rest → style. */
export function metaFromLegacyUrls(urls: string[]): TypedReferenceMeta[] {
  return normalizeReferenceMeta(
    urls.filter(Boolean).map((url, index) => ({
      role: index === 0 ? 'protagonist' : 'style',
      url,
    })),
  );
}

export function urlsFromReferenceMeta(meta: TypedReferenceMeta[]): string[] {
  return meta.map((item) => item.url);
}

export const MEMORY_SUMMARY_MAX_CHARS = 5500;

export function appendProjectMemory(
  existing: string,
  block: string,
  maxChars = MEMORY_SUMMARY_MAX_CHARS,
): string {
  const next = [existing.trim(), block.trim()].filter(Boolean).join('\n\n---\n\n');
  if (next.length <= maxChars) return next;
  // Drop oldest chunks until under budget.
  const parts = next.split(/\n\n---\n\n/);
  while (parts.length > 1 && parts.join('\n\n---\n\n').length > maxChars) {
    parts.shift();
  }
  const trimmed = parts.join('\n\n---\n\n');
  return trimmed.length > maxChars
    ? trimmed.slice(trimmed.length - maxChars)
    : trimmed;
}
