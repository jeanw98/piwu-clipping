export enum Role {
  USER = 'USER',
  ADMIN = 'ADMIN',
}

export enum JobStatus {
  PENDING = 'PENDING',
  GENERATING_SCRIPT = 'GENERATING_SCRIPT',
  AWAITING_APPROVAL = 'AWAITING_APPROVAL',
  GENERATING_AUDIO = 'GENERATING_AUDIO',
  GENERATING_ASSETS = 'GENERATING_ASSETS',
  RENDERING = 'RENDERING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum MediaAssetType {
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
}

export const CLIPPING_QUEUE = 'clipping-queue' as const;

export const SOCKET_EVENTS = {
  JOB_PROGRESS: 'job:progress',
  JOB_COMPLETED: 'job:completed',
  JOB_FAILED: 'job:failed',
} as const;
