import type { MotionGraphicsSpec } from './motion-graphics';
import type { ClipCostBreakdown } from './cost-projection';
import type { JobStatus, MediaAssetType, Role } from './enums';
import type {
  ClipDurationSec,
  ClipLanguage,
  CaptionStyle,
  ClipCount,
  ClipMotion,
  ClipSourceType,
  ClipOrientation,
  ClipPlatform,
  ClipResolution,
  StylePreset,
  VisualStyle,
} from './schemas';
import type { TypedReferenceMeta } from './references';

export interface UserDto {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse extends AuthTokens {
  user: UserDto;
}

export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
}

export interface SceneScript {
  index: number;
  narration: string;
  visualPrompt: string;
  type: MediaAssetType;
  durationSec: number;
  /** Planned or speech-aligned start (seconds). */
  startSec?: number;
  /** Planned or speech-aligned end (seconds). */
  endSec?: number;
  /**
   * VIDEO scenes only: concrete Hailuo motion — subject + physical action +
   * camera + what stays unchanged.
   */
  motion?: string;
}

export interface GeneratedScript {
  title: string;
  audioScript: string;
  /** One sentence that keeps the subject and look the same in every scene. */
  styleAnchor: string;
  scenes: SceneScript[];
  /** Present only in Motion Graphics mode (wire `graphics`). */
  motionGraphics?: MotionGraphicsSpec;
}

export interface ClipVariantDto {
  id: string;
  clipJobId: string;
  index: number;
  title: string;
  score: number;
  reason: string;
  startSec: number;
  endSec: number;
  outputVideoUrl: string | null;
  status: JobStatus;
}

export interface MediaAssetDto {
  id: string;
  clipJobId: string;
  sceneIndex: number;
  prompt: string;
  type: MediaAssetType | string;
  url: string;
  durationSec: number;
  createdAt: string;
}

export interface ProjectReferenceDto {
  id: string;
  projectId: string;
  role: TypedReferenceMeta['role'];
  url: string;
  label: string | null;
  sortOrder: number;
  createdAt: string;
}

export interface ProjectDto {
  id: string;
  userId: string;
  name: string;
  description: string;
  memorySummary: string;
  defaultVisualStyle: VisualStyle | null;
  defaultMotion: ClipMotion | null;
  defaultVoiceId?: string | null;
  createdAt: string;
  updatedAt: string;
  references?: ProjectReferenceDto[];
  clipCount?: number;
}

export interface ClipJobDto {
  id: string;
  userId: string;
  projectId?: string | null;
  projectName?: string | null;
  prompt: string;
  status: JobStatus;
  progress: number;
  title: string | null;
  audioScript: string | null;
  audioUrl: string | null;
  timestampsJson: WordTimestamp[] | null;
  outputVideoUrl: string | null;
  /** Poster/cover image for library thumbnails (JPEG). */
  coverUrl?: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  assets?: MediaAssetDto[];
  stylePreset?: StylePreset;
  durationSec?: ClipDurationSec | number;
  orientation?: ClipOrientation;
  resolution?: ClipResolution;
  platform?: ClipPlatform;
  language?: ClipLanguage;
  sourceType?: ClipSourceType;
  sourceUrl?: string | null;
  captionStyle?: CaptionStyle | null;
  clipCount?: ClipCount | number;
  visualStyle?: VisualStyle;
  motion?: ClipMotion;
  /** Content format ("free" | "what-if"). */
  format?: string | null;
  /** Presenter image snapshot used by this clip (what-if). */
  presenterUrl?: string | null;
  variants?: ClipVariantDto[];
  scriptJson?: GeneratedScript | null;
  referenceUrls?: string[];
  referenceMeta?: TypedReferenceMeta[];
  costJson?: ClipCostBreakdown | null;
}

export interface GenerateClipResponse {
  jobId: string;
  status: JobStatus;
  script?: GeneratedScript;
}

export type ProviderUsageStatus = 'ok' | 'low' | 'empty' | 'unavailable';

export interface ProviderUsageDto {
  id: string;
  name: string;
  status: ProviderUsageStatus;
  summary: string;
  detail?: string;
}

export interface ProviderUsageResponse {
  checkedAt: string;
  providers: ProviderUsageDto[];
  video?: {
    model: string;
    resolution: string;
  };
}

export interface PaginatedResponse<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface JobProgressPayload {
  jobId: string;
  status: JobStatus;
  progress: number;
  title?: string | null;
  errorMessage?: string | null;
}

export interface RemotionCompositionProps {
  title: string;
  audioUrl: string;
  assets: Array<{
    sceneIndex: number;
    type: string;
    url: string;
    durationSec: number;
    prompt: string;
    /** Actual AI clip length (always 6 for Hailuo). Remotion slows / freezes to the scene. */
    mediaDurationSec?: number;
    /** Per-asset override (e.g. a VIDEO scene degraded to a dynamic still). */
    imageMotion?: 'kenburns' | 'dynamic';
  }>;
  whisperTimestamps: WordTimestamp[];
  scenes: SceneScript[];
  width?: number;
  height?: number;
  fps?: number;
  /** Hard cap for the rendered clip (seconds). */
  targetDurationSec?: number;
  captionStyle?: CaptionStyle;
  /** Lift bottom captions above TikTok and Reels UI. */
  captionSafeZone?: boolean;
  /**
   * How still IMAGE scenes move in Remotion.
   * `kenburns` = Stills zoom. `dynamic` = Stills v2 cinematic camera.
   */
  imageMotion?: 'kenburns' | 'dynamic';
}

/** ElevenLabs voice available to the account (GET /voices). */
export interface VoiceDto {
  id: string;
  name: string;
  category: string;
  /** accent, gender, age, description, use_case… */
  labels: Record<string, string>;
  description: string | null;
  /** Short public sample (free to play, no credits used). */
  previewUrl: string | null;
  /** The voice used when none is chosen (ELEVENLABS_VOICE_ID). */
  isDefault: boolean;
  /** "account" = already in the ElevenLabs account; "library" = public Voice Library. */
  source: 'account' | 'library';
  /** Native to the requested clip language/variant. */
  matchesLanguage: boolean;
  accent: string | null;
  locale: string | null;
  /** Library voices: owner id needed to add the voice to the account. */
  publicOwnerId?: string | null;
}
