import { IsNotEmpty,IsString,Matches,IsUrl } from "class-validator";
export class UrlsDto{
@IsNotEmpty({message:'Long url is required'})
@IsString()
@Matches(/^(http|https):\/\/[^ "]+$/,{
  message:'Long_url must start with http:// or https://',

})
@IsUrl({}, { message: 'Long_url must be a valid URL' })
long_url:string;
}