import { IsNotEmpty, IsString, Matches, IsUrl, IsOptional } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class UrlsDto {
  @ApiProperty({ 
    example: 'https://example.com', 
    description: 'The original long URL' 
  })
  @IsNotEmpty({ message: 'Long url is required' })
  @IsString()
  @IsUrl({}, { message: 'longUrl must be a valid URL' })
  @Matches(/^(https?):\/\/[^\s$.?#].[^\s]*$/i, {
    message: 'longUrl must start with http:// or https://',
  })
  long_url: string;

  @ApiProperty({ 
    example: 'my-custom-alias', 
    required: false, 
    description: 'Custom short alias (alphanumeric, dashes, underscores only)' 
  })
  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9_-]+$/, {
    message: 'customAlias can only contain letters, numbers, dashes, and underscores',
  })
  customAlias?: string;

  @ApiProperty({ 
    example: 'mypassword123', 
    required: false, 
    description: 'Optional password protection for the URL' 
  })
  @IsOptional()
  @IsString()
  password?: string;
}