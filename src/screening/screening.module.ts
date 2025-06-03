import { Module } from '@nestjs/common';
import { ScreeningService } from './screening.service';
import { OpenAiModule } from 'open-ai/open-ai.module';
import { ScreeningController } from './screening.controller';

@Module({
  providers: [ScreeningService],
  imports: [OpenAiModule],
  controllers: [ScreeningController]
})
export class ScreeningModule {}
