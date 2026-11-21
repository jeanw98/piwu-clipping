import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthUser } from '../auth/types/auth-user';
import { ClipsService } from './clips.service';
import { SourceUploadService } from './source-upload.service';
import {
  ApproveScriptDto,
  GenerateClipDto,
  ListClipsQueryDto,
} from './dto/clips.dto';

@Controller('clips')
@UseGuards(JwtAuthGuard)
export class ClipsController {
  constructor(
    private readonly clipsService: ClipsService,
    private readonly uploads: SourceUploadService,
  ) {}

  /** Direct-to-S3 upload, step 1: signed PUT URL (or mode 'api'). */
  @Post('uploads/init')
  initUpload(
    @CurrentUser() user: AuthUser,
    @Body() body: { filename?: string; contentType?: string; sizeBytes?: number },
  ) {
    return this.uploads.init(user.id, body ?? {});
  }

  /** Direct-to-S3 upload, step 2: validate the stored file. */
  @Post('uploads/complete')
  completeUpload(
    @CurrentUser() user: AuthUser,
    @Body() body: { sourceRef?: string; filename?: string },
  ) {
    return this.uploads.complete(user.id, String(body?.sourceRef ?? ''), body?.filename);
  }

  /**
   * Upload a source video to clip (raw body, Content-Type video/*,
   * X-Filename header). Returns the `sourceRef` for /clips/generate.
   */
  @Put('uploads')
  uploadSource(@CurrentUser() user: AuthUser, @Req() req: Request) {
    const length = Number(req.headers['content-length']);
    return this.uploads.receive(user.id, req, {
      filename: String(req.headers['x-filename'] ?? ''),
      contentLength: Number.isFinite(length) ? length : undefined,
      contentType: String(req.headers['content-type'] ?? ''),
    });
  }

  @Post('generate')
  generate(@CurrentUser() user: AuthUser, @Body() dto: GenerateClipDto) {
    return this.clipsService.generate(user, dto);
  }

  @Post('script')
  createScript(@CurrentUser() user: AuthUser, @Body() dto: GenerateClipDto) {
    return this.clipsService.createScript(user, dto);
  }

  @Post(':id/regenerate-script')
  regenerateScript(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.clipsService.regenerateScript(user, id);
  }

  @Post(':id/approve')
  approveScript(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ApproveScriptDto,
  ) {
    return this.clipsService.approveScript(user, id, dto);
  }

  /** Most viewed recent YouTube videos for a topic (suggestions for the link field). */
  @Get('youtube/trending')
  trendingYoutube(@Query('q') q?: string, @Query('recency') recency?: string) {
    return this.clipsService.trendingYoutube(q ?? '', recency);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListClipsQueryDto) {
    return this.clipsService.list(user, query);
  }

  @Get(':id')
  getOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.clipsService.getById(user, id);
  }

  @Get(':id/download')
  download(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('variantId') variantId?: string,
  ) {
    return this.clipsService.getDownloadUrl(user, id, variantId);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.clipsService.delete(user, id);
  }
}
