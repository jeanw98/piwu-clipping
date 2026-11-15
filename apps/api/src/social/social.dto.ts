import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { POST_PRIVACY, type PostPrivacy } from '@piwu/shared';

export class SchedulePostDto {
  @IsUUID()
  clipJobId!: string;

  @IsOptional()
  @IsUUID()
  variantId?: string | null;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsUUID('all', { each: true })
  accountIds!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(100)
  title?: string;

  @IsString()
  @MaxLength(2200)
  caption!: string;

  @IsOptional()
  @IsIn(POST_PRIVACY as unknown as string[])
  privacy?: PostPrivacy;

  /** ISO date-time; omitted/null = publish now. */
  @IsOptional()
  @IsISO8601()
  scheduledAt?: string | null;
}

export class ListPostsQueryDto {
  @IsOptional()
  @IsUUID()
  clipJobId?: string;
}
