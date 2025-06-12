import { forwardRef, Module } from '@nestjs/common';
import { ProlificService } from './prolific.service';
import { ProlificHttpClient } from './prolific-http.client';
import { ProlificController } from './prolific.controller';
import { TestsModule } from 'tests/tests.module';

@Module({
  providers: [ProlificService, ProlificHttpClient],
  exports: [ProlificService],
  controllers: [ProlificController],
  imports: [forwardRef(() => TestsModule)],
})
export class ProlificModule {}
