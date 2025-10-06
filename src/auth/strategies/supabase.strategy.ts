import { Module,Global } from "@nestjs/common";
import { ConfigModule,ConfigService } from "@nestjs/config";
import { createClient } from "@supabase/supabase-js";



@Global()
@Module({
  imports:[ConfigModule],
  providers:[
    {
    provide:'SUPABASE_CLIENT',
    useFactory:(configService:ConfigService)=>{
      const supabaseUrl=configService.get<string>('SUPABASE_URL');
      const supabaseAnonKey=configService.get<string>('SUPABASE_ANON_KEY');
      if(!supabaseUrl || !supabaseAnonKey){
        throw new Error('Missing Supabase environment variables');
      }
      const client = createClient(supabaseUrl,supabaseAnonKey);
      return client;
    },
    inject:[ConfigService],
  }
  ],
  exports:['SUPABASE_CLIENT'],
})



export class SupabaseModule{}