import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UrlsModule } from './urls/urls.module';
import { ConfigModule } from '@nestjs/config';
import { SupabaseModule } from './supabase/supabase.strategy';
import { CacheModule } from '@nestjs/cache-manager';
import { RedisOptions } from './config/app-options.constants';
import { SupabaseAuthGuard } from './middlewares/supabase.guard';

@Module({
  imports: [UrlsModule,ConfigModule.forRoot({isGlobal:true}),
SupabaseModule,
CacheModule.registerAsync(RedisOptions)
  ],
  controllers: [AppController],
  providers: [AppService,SupabaseAuthGuard],
})
export class AppModule {}
