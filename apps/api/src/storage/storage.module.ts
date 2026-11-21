import { Global, Module } from '@nestjs/common';
import { LocalStorageService } from './local-storage.service';
import { StorageController } from './storage.controller';
import { SupabaseStorageService } from './supabase-storage.service';

@Global()
@Module({
  controllers: [StorageController],
  providers: [
    LocalStorageService,
    SupabaseStorageService,
    {
      provide: 'STORAGE_SERVICE',
      useFactory: (local: LocalStorageService, supabase: SupabaseStorageService) => process.env.STORAGE_DRIVER === 'supabase' ? supabase : local,
      inject: [LocalStorageService, SupabaseStorageService],
    },
  ],
  exports: ['STORAGE_SERVICE', LocalStorageService],
})
export class StorageModule {}
