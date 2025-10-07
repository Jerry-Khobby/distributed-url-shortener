import { 
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
 } from '@nestjs/common';

import { UrlsService } from './urls.service';
import { UrlsDto } from './dto/url.dto';
import { SupabaseAuthGuard } from '../middlewares/supabase.guard';


@Controller('urls')
export class UrlsController {
  constructor(private readonly urlsService: UrlsService) {}

  @UseGuards(SupabaseAuthGuard)
  @Post('shorten')
async createShortUrl(
  @Body() body: UrlsDto,
  @Req() req
): Promise<{ short_url: string; short_code: string; long_url: string }> {
  const userId = req.user.id;
  const { short_url, short_code, long_url } = await this.urlsService.createShortUrl(
    body.long_url,
    userId,
  );

  return { short_url, short_code, long_url };
}
}
