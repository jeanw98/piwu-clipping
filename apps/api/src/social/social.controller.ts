import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import type { SocialProvider } from '@piwu/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthUser } from '../auth/types/auth-user';
import { PostsService } from './posts.service';
import { ListPostsQueryDto, SchedulePostDto } from './social.dto';
import { SocialService } from './social.service';

@Controller('social')
export class SocialController {
  constructor(private readonly social: SocialService) {}

  /** Which networks the server can link right now (and what's missing). */
  @Get('providers')
  @UseGuards(JwtAuthGuard)
  providers() {
    return this.social.statuses();
  }

  @Get('accounts')
  @UseGuards(JwtAuthGuard)
  accounts(@CurrentUser() user: AuthUser) {
    return this.social.list(user.id);
  }

  @Delete('accounts/:id')
  @UseGuards(JwtAuthGuard)
  async unlink(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.social.remove(user.id, id);
    return { ok: true };
  }

  /** Returns the provider's OAuth URL; the web app navigates to it. */
  @Get(':provider/connect')
  @UseGuards(JwtAuthGuard)
  connect(@CurrentUser() user: AuthUser, @Param('provider') provider: string) {
    this.social.adapter(provider);
    return { url: this.social.connectUrl(user.id, provider as SocialProvider) };
  }

  /** OAuth redirect target (public: authenticated by the signed `state`). */
  @Get(':provider/callback')
  @SkipThrottle()
  async callback(
    @Param('provider') provider: string,
    @Query() query: { code?: string; state?: string; error?: string; error_description?: string },
    @Res() res: Response,
  ) {
    this.social.adapter(provider);
    const url = await this.social.handleCallback(provider as SocialProvider, query);
    res.redirect(302, url);
  }
}

@Controller('posts')
@UseGuards(JwtAuthGuard)
export class PostsController {
  constructor(private readonly posts: PostsService) {}

  @Post()
  schedule(@CurrentUser() user: AuthUser, @Body() dto: SchedulePostDto) {
    return this.posts.schedule(user.id, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListPostsQueryDto) {
    return this.posts.list(user.id, query.clipJobId);
  }

  @Delete(':id')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.posts.cancel(user.id, id);
  }

  @Post(':id/retry')
  retry(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.posts.retry(user.id, id);
  }
}
