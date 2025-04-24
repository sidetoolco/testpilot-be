import { Module } from '@nestjs/common';
import { ProlificService } from './prolific.service';
import { ProlificHttpClient } from './prolific-http.client';

@Module({
  providers: [ProlificService, ProlificHttpClient],
  exports: [ProlificService],
})
export class ProlificModule {}
