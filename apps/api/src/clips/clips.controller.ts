import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthUser } from '../auth/types/auth-user';
import { ClipsService } from './clips.service';
import {
  ApproveScriptDto,
  GenerateClipDto,
  ListClipsQueryDto,
} from './dto/clips.dto';

@Controller('clips')
@UseGuards(JwtAuthGuard)
export class ClipsController {
  constructor(private readonly clipsService: ClipsService) {}

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
