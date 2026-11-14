import { Global, Module } from '@nestjs/common';
import { LocalStorageService } from './local-storage.service';
import { StorageController } from './storage.controller';

@Global()
@Module({
  controllers: [StorageController],
  providers: [
    LocalStorageService,
    {
      provide: 'STORAGE_SERVICE',
      useClass: LocalStorageService,
    },
  ],
  exports: ['STORAGE_SERVICE', LocalStorageService],
})
export class StorageModule {}
