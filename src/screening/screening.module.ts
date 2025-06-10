import { Module } from '@nestjs/common';
import { ScreeningService } from './screening.service';
import { OpenAiModule } from 'open-ai/open-ai.module';
import { ScreeningController } from './screening.controller';
import { AdalineModule } from 'adaline/adaline.module';

@Module({
  providers: [ScreeningService],
  imports: [OpenAiModule, AdalineModule],
  controllers: [ScreeningController],
})
export class ScreeningModule {}
