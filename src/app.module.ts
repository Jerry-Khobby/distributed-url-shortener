import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UrlsModule } from './urls/urls.module';
import { ConfigModule } from '@nestjs/config';
import { SupabaseModule } from './supabase/supabase.strategy';
import { CacheModule } from '@nestjs/cache-manager';
import { RedisOptions } from './config/app-options.constants';
@Module({
  imports: [AuthModule, UrlsModule,ConfigModule.forRoot({isGlobal:true}),
SupabaseModule,
CacheModule.registerAsync(RedisOptions)
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
