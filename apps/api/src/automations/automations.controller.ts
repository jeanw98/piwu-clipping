import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthUser } from '../auth/types/auth-user';
import { AutomationsService } from './automations.service';

@Controller('automations')
@UseGuards(JwtAuthGuard)
export class AutomationsController {
  constructor(private readonly automations: AutomationsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.automations.list(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.automations.create(user.id, body);
  }

  @Get('runs/:runId')
  run(@CurrentUser() user: AuthUser, @Param('runId') runId: string) {
    return this.automations.run(user.id, runId);
  }

  /** Signed URL (S3) or the file itself (local storage). */
  @Get('runs/:runId/download')
  async download(
    @CurrentUser() user: AuthUser,
    @Param('runId') runId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const access = await this.automations.download(user.id, runId);
    if (access.direct) return { url: access.url, direct: true, filename: access.filename };
    const buffer = await this.automations.readZip(access.relativePath);
    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${access.filename}"`,
    });
    return new StreamableFile(buffer);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.automations.get(user.id, id);
  }

  @Put(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.automations.update(user.id, id, body);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.automations.remove(user.id, id);
  }

  @Get(':id/runs')
  runs(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.automations.runs(user.id, id);
  }

  @Post(':id/run')
  runNow(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.automations.runNow(user.id, id);
  }
}
