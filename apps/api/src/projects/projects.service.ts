import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  REFERENCE_ROLE_CAPS,
  type ProjectDto,
  type ProjectReferenceDto,
  type ReferenceRole,
} from '@piwu/shared';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.types';
import type { AuthUser } from '../auth/types/auth-user';
import {
  AddProjectReferencesDto,
  CreateProjectDto,
  UpdateProjectDto,
} from './dto/projects.dto';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async list(user: AuthUser): Promise<ProjectDto[]> {
    const rows = await this.prisma.project.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: 'desc' },
      include: {
        references: { orderBy: [{ role: 'asc' }, { sortOrder: 'asc' }] },
        _count: { select: { clipJobs: true } },
      },
    });
    return rows.map((row) => this.mapProject(row));
  }

  async getById(user: AuthUser, id: string): Promise<ProjectDto> {
    const project = await this.requireOwnedWithRefs(user, id);
    return this.mapProject(project);
  }

  async create(user: AuthUser, dto: CreateProjectDto): Promise<ProjectDto> {
    const project = await this.prisma.project.create({
      data: {
        userId: user.id,
        name: dto.name.trim(),
        description: dto.description.trim(),
        defaultVisualStyle: dto.defaultVisualStyle ?? null,
        defaultMotion: dto.defaultMotion ?? null,
      },
      include: {
        references: true,
        _count: { select: { clipJobs: true } },
      },
    });
    return this.mapProject(project);
  }

  async update(
    user: AuthUser,
    id: string,
    dto: UpdateProjectDto,
  ): Promise<ProjectDto> {
    await this.requireOwned(user, id);
    const project = await this.prisma.project.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description.trim() }
          : {}),
        ...(dto.defaultVisualStyle !== undefined
          ? { defaultVisualStyle: dto.defaultVisualStyle }
          : {}),
        ...(dto.defaultMotion !== undefined
          ? { defaultMotion: dto.defaultMotion }
          : {}),
      },
      include: {
        references: { orderBy: [{ role: 'asc' }, { sortOrder: 'asc' }] },
        _count: { select: { clipJobs: true } },
      },
    });
    return this.mapProject(project);
  }

  async delete(user: AuthUser, id: string): Promise<{ success: true }> {
    const project = await this.requireOwnedWithRefs(user, id);
    const paths: string[] = [];
    for (const ref of project.references) {
      paths.push(this.storage.toRelativePath(ref.url));
    }
    const cache = await this.prisma.projectAssetCache.findMany({
      where: { projectId: id },
      select: { url: true },
    });
    for (const row of cache) {
      paths.push(this.storage.toRelativePath(row.url));
    }
    await this.storage.deleteMany(paths);
    await this.prisma.project.delete({ where: { id } });
    return { success: true };
  }

  async addReferences(
    user: AuthUser,
    id: string,
    dto: AddProjectReferencesDto,
  ): Promise<ProjectDto> {
    const project = await this.requireOwnedWithRefs(user, id);
    const existingByRole = new Map<ReferenceRole, number>();
    for (const ref of project.references) {
      const role = ref.role as ReferenceRole;
      existingByRole.set(role, (existingByRole.get(role) ?? 0) + 1);
    }

    const created: string[] = [];
    for (const [index, item] of (dto.references ?? []).entries()) {
      const role = item.role as ReferenceRole;
      const used = existingByRole.get(role) ?? 0;
      if (used >= REFERENCE_ROLE_CAPS[role]) {
        throw new BadRequestException(
          `Project already has the maximum ${REFERENCE_ROLE_CAPS[role]} ${role} reference(s)`,
        );
      }
      const mime = (item.mime || 'image/png').toLowerCase();
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) {
        throw new BadRequestException('Reference images must be JPEG, PNG, or WebP');
      }
      const buffer = Buffer.from(item.data, 'base64');
      if (buffer.length === 0 || buffer.length > 5 * 1024 * 1024) {
        throw new BadRequestException('Each reference image must be under 5MB');
      }
      const ext =
        mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : 'png';
      const stored = await this.storage.put(
        'references',
        `project-${id}-${role}-${Date.now()}-${index}.${ext}`,
        buffer,
      );
      await this.prisma.projectReference.create({
        data: {
          projectId: id,
          role,
          url: stored.publicUrl,
          label: item.label?.trim() || null,
          sortOrder: used,
        },
      });
      existingByRole.set(role, used + 1);
      created.push(stored.publicUrl);
    }

    return this.getById(user, id);
  }

  async deleteReference(
    user: AuthUser,
    projectId: string,
    refId: string,
  ): Promise<ProjectDto> {
    await this.requireOwned(user, projectId);
    const ref = await this.prisma.projectReference.findUnique({
      where: { id: refId },
    });
    if (!ref || ref.projectId !== projectId) {
      throw new NotFoundException('Reference not found');
    }
    await this.storage.deleteMany([this.storage.toRelativePath(ref.url)]);
    await this.prisma.projectReference.delete({ where: { id: refId } });
    return this.getById(user, projectId);
  }

  private async requireOwned(user: AuthUser, id: string) {
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    if (project.userId !== user.id) {
      throw new ForbiddenException();
    }
    return project;
  }

  private async requireOwnedWithRefs(user: AuthUser, id: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: {
        references: { orderBy: [{ role: 'asc' }, { sortOrder: 'asc' }] },
        _count: { select: { clipJobs: true } },
      },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    if (project.userId !== user.id) {
      throw new ForbiddenException();
    }
    return project;
  }

  private mapProject(
    project: {
      id: string;
      userId: string;
      name: string;
      description: string;
      memorySummary: string;
      defaultVisualStyle: string | null;
      defaultMotion: string | null;
      createdAt: Date;
      updatedAt: Date;
      references?: Array<{
        id: string;
        projectId: string;
        role: string;
        url: string;
        label: string | null;
        sortOrder: number;
        createdAt: Date;
      }>;
      _count?: { clipJobs: number };
    },
  ): ProjectDto {
    return {
      id: project.id,
      userId: project.userId,
      name: project.name,
      description: project.description,
      memorySummary: project.memorySummary,
      defaultVisualStyle:
        (project.defaultVisualStyle as ProjectDto['defaultVisualStyle']) ?? null,
      defaultMotion:
        (project.defaultMotion as ProjectDto['defaultMotion']) ?? null,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
      references: (project.references ?? []).map(
        (ref): ProjectReferenceDto => ({
          id: ref.id,
          projectId: ref.projectId,
          role: ref.role as ProjectReferenceDto['role'],
          url: ref.url,
          label: ref.label,
          sortOrder: ref.sortOrder,
          createdAt: ref.createdAt.toISOString(),
        }),
      ),
      clipCount: project._count?.clipJobs,
    };
  }
}
