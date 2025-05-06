import { Module } from '@nestjs/common';
import { AdalineService } from './adaline.service';
import { AdalineHttpClient } from './adaline-http.client';

@Module({
  providers: [AdalineService, AdalineHttpClient],
  exports: [AdalineService],
})
export class AdalineModule {}
