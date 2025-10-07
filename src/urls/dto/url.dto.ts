import { IsNotEmpty,IsString,Matches,IsUrl,IsOptional } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class UrlsDto{
@IsNotEmpty({message:'Long url is required'})
@IsString()
@Matches(/^(http|https):\/\/[^ "]+$/,{
  message:'Long_url must start with http:// or https://',

})
@ApiProperty({ example: 'https://example.com', description: 'The original long URL' })
@IsUrl({}, { message: 'Long_url must be a valid URL' })
long_url:string;

  @ApiProperty({ example: 'my-custom-alias', required: false, description: 'Custom short alias' })
  @IsOptional()
  @IsString()
  customAlias?: string;

  @ApiProperty({ example: 'mypassword123', required: false, description: 'Optional password protection for the URL' })
  @IsOptional()
  @IsString()
  password?: string;
}