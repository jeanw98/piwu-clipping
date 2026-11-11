import type { Role } from '@prisma/client';

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: Role;
}
