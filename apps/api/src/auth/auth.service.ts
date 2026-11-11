import {
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import type { AuthResponse, UserDto } from '@piwu/shared';
import type { EnvConfig } from '../config/env.schema';
import { PrismaService } from '../prisma/prisma.service';
import type { LoginDto } from './dto/auth.dto';
import type { AuthUser } from './types/auth-user';

const BCRYPT_ROUNDS = 10;

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureSingleAdmin();
  }

  /** Creates/updates the only allowed login user from ADMIN_EMAIL / ADMIN_PASSWORD. */
  private async ensureSingleAdmin(): Promise<void> {
    const email = this.config
      .get('ADMIN_EMAIL', { infer: true })
      .toLowerCase()
      .trim();
    const password = this.config.get('ADMIN_PASSWORD', { infer: true });
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    await this.prisma.user.upsert({
      where: { email },
      create: {
        email,
        passwordHash,
        name: 'Admin',
        role: 'ADMIN',
      },
      update: {
        passwordHash,
        name: 'Admin',
        role: 'ADMIN',
      },
    });

    const removed = await this.prisma.user.deleteMany({
      where: { email: { not: email } },
    });
    if (removed.count > 0) {
      this.logger.warn(`Removed ${removed.count} non-admin user(s)`);
    }
    this.logger.log(`Single-admin login ready → ${email}`);
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokens = await this.issueTokens(user.id, user.email);
    return { ...tokens, user: this.toUserDto(user) };
  }

  async refresh(refreshToken: string): Promise<AuthResponse> {
    let payload: { sub: string; email: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: this.config.get('JWT_REFRESH_SECRET', { infer: true }),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const tokenHash = this.hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { token: tokenHash },
      include: { user: true },
    });

    if (!stored || stored.expiresAt < new Date() || stored.userId !== payload.sub) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    await this.prisma.refreshToken.delete({ where: { id: stored.id } });
    const tokens = await this.issueTokens(stored.user.id, stored.user.email);
    return { ...tokens, user: this.toUserDto(stored.user) };
  }

  async logout(refreshToken: string): Promise<{ success: true }> {
    const tokenHash = this.hashToken(refreshToken);
    await this.prisma.refreshToken.deleteMany({ where: { token: tokenHash } });
    return { success: true };
  }

  async me(user: AuthUser): Promise<UserDto> {
    const full = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    });
    return this.toUserDto(full);
  }

  private async issueTokens(
    userId: string,
    email: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const accessToken = await this.jwt.signAsync(
      { sub: userId, email },
      {
        secret: this.config.get('JWT_SECRET', { infer: true }),
        expiresIn: this.config.get('JWT_EXPIRATION', { infer: true }),
      },
    );

    const refreshToken = await this.jwt.signAsync(
      { sub: userId, email, jti: randomBytes(16).toString('hex') },
      {
        secret: this.config.get('JWT_REFRESH_SECRET', { infer: true }),
        expiresIn: this.config.get('JWT_REFRESH_EXPIRATION', { infer: true }),
      },
    );

    const expiresAt = this.resolveRefreshExpiry();
    await this.prisma.refreshToken.create({
      data: {
        token: this.hashToken(refreshToken),
        userId,
        expiresAt,
      },
    });

    return { accessToken, refreshToken };
  }

  private resolveRefreshExpiry(): Date {
    const raw = this.config.get('JWT_REFRESH_EXPIRATION', { infer: true });
    const match = /^(\d+)([smhd])$/.exec(raw);
    const now = Date.now();
    if (!match) {
      return new Date(now + 7 * 24 * 60 * 60 * 1000);
    }
    const amount = Number(match[1]);
    const unit = match[2];
    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };
    return new Date(now + amount * multipliers[unit]);
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private toUserDto(user: {
    id: string;
    email: string;
    name: string | null;
    role: string;
    createdAt: Date;
  }): UserDto {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as UserDto['role'],
      createdAt: user.createdAt.toISOString(),
    };
  }
}
