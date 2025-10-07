import { 
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UrlsService } from './urls.service';
import { UrlsDto } from './dto/url.dto';
import { SupabaseAuthGuard } from '../middlewares/supabase.guard';

// ✅ Create a DTO for the response, so Swagger can display it nicely
export class ShortUrlResponseDto {
  short_url: string;
  short_code: string;
  long_url: string;
}

@ApiTags('URLs') // Groups endpoints under the "URLs" tag in Swagger UI
@ApiBearerAuth() // Shows "Authorize" button for JWT/Supabase tokens
@Controller('urls')
export class UrlsController {
  constructor(private readonly urlsService: UrlsService) {}

  @UseGuards(SupabaseAuthGuard)
  @Post('shorten')
  @ApiOperation({
    summary: 'Shorten a long URL',
    description:
      'Creates a new shortened URL for the authenticated user. Optionally supports password-protected and custom alias URLs.',
  })
  @ApiBody({
    description: 'Provide the URL to shorten (and optional fields)',
    type: UrlsDto,
  })
  @ApiCreatedResponse({
    description: 'Successfully created a shortened URL',
    type: ShortUrlResponseDto,
  })
  async createShortUrl(
    @Body() body: UrlsDto,
    @Req() req,
  ): Promise<ShortUrlResponseDto> {
    const userId = req.user.id;
    const accessToken = req.accessToken;
      return this.urlsService.createShortUrl(
      body.long_url,
      userId,
      accessToken,
      body.password,
      body.customAlias,
    );
  }
}
