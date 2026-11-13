import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CreateProjectDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(4000)
  description!: string;

  @IsOptional()
  @IsIn(['ugc', 'cinematic', 'flat-2d', 'anime', 'documentary'])
  defaultVisualStyle?: 'ugc' | 'cinematic' | 'flat-2d' | 'anime' | 'documentary' | null;

  @IsOptional()
  @IsIn(['auto', 'stills', 'fake', 'semi', 'full'])
  defaultMotion?: 'auto' | 'stills' | 'fake' | 'semi' | 'full' | null;
}

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(4000)
  description?: string;

  @IsOptional()
  @IsIn(['ugc', 'cinematic', 'flat-2d', 'anime', 'documentary'])
  defaultVisualStyle?: 'ugc' | 'cinematic' | 'flat-2d' | 'anime' | 'documentary' | null;

  @IsOptional()
  @IsIn(['auto', 'stills', 'fake', 'semi', 'full'])
  defaultMotion?: 'auto' | 'stills' | 'fake' | 'semi' | 'full' | null;
}

export class ProjectReferenceUploadDto {
  @IsIn(['style', 'protagonist', 'scenery'])
  role!: 'style' | 'protagonist' | 'scenery';

  @IsString()
  @IsIn(['image/jpeg', 'image/png', 'image/webp'])
  mime!: 'image/jpeg' | 'image/png' | 'image/webp';

  @IsString()
  @MinLength(32)
  data!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;
}

export class AddProjectReferencesDto {
  @IsArray()
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Type(() => ProjectReferenceUploadDto)
  references!: ProjectReferenceUploadDto[];
}

export class ProjectIdParamDto {
  @IsUUID()
  id!: string;
}
