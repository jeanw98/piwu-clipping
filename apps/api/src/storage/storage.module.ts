import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../config/env.schema';
import { LocalStorageAdapter } from './local-storage.adapter';
import { S3StorageAdapter } from './s3-storage.adapter';
import { StorageController } from './storage.controller';
import { StorageService } from './storage.types';

@Global()
@Module({
  controllers: [StorageController],
  providers: [
    LocalStorageAdapter,
    S3StorageAdapter,
    {
      provide: StorageService,
      inject: [ConfigService, LocalStorageAdapter, S3StorageAdapter],
      useFactory: (
        config: ConfigService<EnvConfig, true>,
        local: LocalStorageAdapter,
        s3: S3StorageAdapter,
      ) => {
        const driver = config.get('STORAGE_DRIVER', { infer: true });
        return driver === 's3' ? s3 : local;
      },
    },
  ],
  exports: [StorageService],
})
export class StorageModule {}
