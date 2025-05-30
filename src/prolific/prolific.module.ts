import { Module } from '@nestjs/common';
import { ProlificService } from './prolific.service';
import { ProlificHttpClient } from './prolific-http.client';
import { ProlificController } from './prolific.controller';

@Module({
  providers: [ProlificService, ProlificHttpClient],
  exports: [ProlificService],
  controllers: [ProlificController],
})
export class ProlificModule {}
