import { Transform, Type } from 'class-transformer';
import { normalizeMotionWire } from '@piwu/shared';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsObject,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class ScriptReferenceDto {
  @IsOptional()
  @IsIn(['style', 'protagonist', 'scenery'])
  role?: 'style' | 'protagonist' | 'scenery';

  @IsString()
  @IsIn(['image/jpeg', 'image/png', 'image/webp'])
  mime!: 'image/jpeg' | 'image/png' | 'image/webp';

  /** Raw base64 (no data: prefix). */
  @IsString()
  @MinLength(32)
  data!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;
}

export class CaptionStyleDto {
  @IsBoolean()
  enabled!: boolean;

  @IsIn(['sm', 'md', 'lg', 'xl'])
  size!: 'sm' | 'md' | 'lg' | 'xl';

  @Matches(/^#[0-9a-fA-F]{6}$/)
  color!: string;

  @Matches(/^#[0-9a-fA-F]{6}$/)
  highlight!: string;

  @IsIn(['top', 'middle', 'bottom'])
  position!: 'top' | 'middle' | 'bottom';

  @IsIn(['stroke', 'pill'])
  look!: 'stroke' | 'pill';
}

export class GenerateClipDto {
  @ValidateIf(
    (dto: GenerateClipDto) =>
      !['youtube', 'instagram', 'upload'].includes(dto.sourceType ?? 'prompt'),
  )
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  prompt?: string;

  @IsOptional()
  @IsIn(['prompt', 'youtube', 'instagram', 'upload'])
  sourceType?: 'prompt' | 'youtube' | 'instagram' | 'upload';

  @ValidateIf(
    (dto: GenerateClipDto) =>
      dto.sourceType === 'youtube' || dto.sourceType === 'instagram' || dto.sourceType === 'upload',
  )
  @IsString()
  @MinLength(12)
  @MaxLength(500)
  sourceUrl?: string;

  @IsOptional()
  @IsIn(['viral', 'cinematic', 'educational', 'comedy', 'dramatic'])
  stylePreset?: 'viral' | 'cinematic' | 'educational' | 'comedy' | 'dramatic';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([15, 30, 45, 60])
  durationSec?: 15 | 30 | 45 | 60;

  @IsOptional()
  @IsIn(['portrait', 'landscape', 'square'])
  orientation?: 'portrait' | 'landscape' | 'square';

  @IsOptional()
  @IsIn(['720p', '1080p'])
  resolution?: '720p' | '1080p';

  @IsOptional()
  @IsIn(['tiktok', 'reels', 'shorts', 'custom'])
  platform?: 'tiktok' | 'reels' | 'shorts' | 'custom';

  @IsOptional()
  @IsIn([
    'es-LA',
    'es-ES',
    'en-US',
    'en-GB',
    'pt-BR',
    'fr-FR',
    'de-DE',
    'it-IT',
  ])
  language?:
    | 'es-LA'
    | 'es-ES'
    | 'en-US'
    | 'en-GB'
    | 'pt-BR'
    | 'fr-FR'
    | 'de-DE'
    | 'it-IT';

  @IsOptional()
  @ValidateNested()
  @Type(() => CaptionStyleDto)
  captionStyle?: CaptionStyleDto;

  @IsOptional()
  @IsIn(['ugc', 'cinematic', 'flat-2d', 'anime', 'documentary'])
  visualStyle?: 'ugc' | 'cinematic' | 'flat-2d' | 'anime' | 'documentary';

  @IsOptional()
  @Transform(({ value }) => normalizeMotionWire(value))
  @IsIn(['auto', 'stills', 'stills_dynamic', 'semi', 'full', 'graphics', 'animated'])
  motion?:
    | 'auto'
    | 'stills'
    | 'stills_dynamic'
    | 'semi'
    | 'full'
    | 'graphics'
    | 'animated';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([3, 5, 8])
  clipCount?: 3 | 5 | 8;

  /** ElevenLabs voice id; omitted = project default or ELEVENLABS_VOICE_ID. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  voiceId?: string | null;

  @IsOptional()
  @IsUUID()
  projectId?: string | null;

  /** Content format; "what-if" forces Motion Graphics. */
  @IsOptional()
  @IsIn(['free', 'what-if'])
  format?: 'free' | 'what-if';

  /** what-if: show the user's presenter on screen (default true when one exists). */
  @IsOptional()
  @IsBoolean()
  presenter?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Type(() => ScriptReferenceDto)
  references?: ScriptReferenceDto[];
}

export class ListClipsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 10;

  @IsOptional()
  @IsUUID()
  projectId?: string;

  /** Bucket filter: in_progress | ready | failed */
  @IsOptional()
  @IsIn(['in_progress', 'ready', 'failed'])
  statusGroup?: 'in_progress' | 'ready' | 'failed';
}

/** Optional reviewer edits sent with POST /clips/:id/approve. */
export class ApproveScriptDto {
  /** Edited MotionGraphicsSpec (validated with zod in the service). */
  @IsOptional()
  @IsObject()
  motionGraphics?: Record<string, unknown>;
}
