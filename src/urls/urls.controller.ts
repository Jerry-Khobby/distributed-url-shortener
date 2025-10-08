import { 
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
  Get,
  Param
  ,Res,
  NotFoundException
} from '@nestjs/common';
import type { Response } from 'express'; // ✅ fixed
import { ApiBearerAuth, ApiBody, ApiCreatedResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
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










  @Post('shorten')
  @UseGuards(SupabaseAuthGuard)
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
    @Req() req:any,
){
  return this.urlsService.createShortUrl(
      body.long_url,
      req.user.id, // From guard
      req.accessToken, // From guard
      body.password,
      body.customAlias,
    );



}

// 👇 New GET endpoint for redirect
  @Get(':shortCode')
  @ApiOperation({
    summary: 'Redirect to the original URL using a short code',
    description: 'Finds the original URL from the short code and redirects if active and valid.',
  })
  @ApiResponse({ status: 302, description: 'Redirects to the long/original URL' })
  @ApiResponse({ status: 404, description: 'Short URL not found or expired' })
  async redirectToOriginal(
    @Param('shortCode') shortCode: string,
    @Req() req: any,
    @Res() res: Response,
  ) {
    try {
      // you can allow public access — if you want it protected, you can add @UseGuards(SupabaseAuthGuard)
      const accessToken = req.headers.authorization?.split(' ')[1] || process.env.SUPABASE_ANON_KEY!;
      const userId = req.user?.id || process.env.SUPABASE_SERVICE_USER!; // fallback if no user

      const { long_url } = await this.urlsService.shortCode(shortCode, accessToken, userId);

      // 302 redirect to original URL
      return res.redirect(long_url);
    } catch (error) {
      if (error instanceof NotFoundException) {
        return res.status(404).json({ message: error.message });
      }
      return res.status(500).json({ message: 'Internal server error', error: error.message });
    }
  }


}
