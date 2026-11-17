import { Body, Controller, Delete, Get, Put, Res, StreamableFile, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { Readable } from 'stream';
import type { PresenterDto } from '@piwu/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthUser } from '../auth/types/auth-user';
import { PresenterService } from './presenter.service';

@Controller('presenter')
@UseGuards(JwtAuthGuard)
export class PresenterController {
  constructor(private readonly presenter: PresenterService) {}

  @Get()
  get(@CurrentUser() user: AuthUser): Promise<PresenterDto> {
    return this.presenter.get(user.id);
  }

  @Get('image')
  async image(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { buffer, contentType } = await this.presenter.image(user.id);
    res.set({ 'Content-Type': contentType, 'Cache-Control': 'private, no-cache' });
    return new StreamableFile(Readable.from(buffer));
  }

  @Put()
  save(@CurrentUser() user: AuthUser, @Body() body: unknown): Promise<PresenterDto> {
    return this.presenter.save(user.id, body);
  }

  @Delete()
  remove(@CurrentUser() user: AuthUser): Promise<PresenterDto> {
    return this.presenter.remove(user.id);
  }
}
