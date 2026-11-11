import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class ScriptReferenceDto {
  @IsString()
  @IsIn(['image/jpeg', 'image/png', 'image/webp'])
  mime!: 'image/jpeg' | 'image/png' | 'image/webp';

  /** Raw base64 (no data: prefix). */
  @IsString()
  @MinLength(32)
  data!: string;
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
  @ValidateIf((dto: GenerateClipDto) => (dto.sourceType ?? 'prompt') !== 'youtube')
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  prompt?: string;

  @IsOptional()
  @IsIn(['prompt', 'youtube'])
  sourceType?: 'prompt' | 'youtube';

  @ValidateIf((dto: GenerateClipDto) => dto.sourceType === 'youtube')
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
  @IsIn(['auto', 'stills', 'fake', 'semi', 'full', 'animated'])
  motion?: 'auto' | 'stills' | 'fake' | 'semi' | 'full' | 'animated';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([3, 5, 8])
  clipCount?: 3 | 5 | 8;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
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
}
