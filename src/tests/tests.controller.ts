import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { TestsService } from './tests.service';
import { JwtAuthGuard } from 'auth/guards/auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('tests')
export class TestsController {
  constructor(private readonly testsService: TestsService) {}

  @Get('/:id')
  getTestData(@Param('id') testId: string) {
    return this.testsService.getTestById(testId);
  }
}
