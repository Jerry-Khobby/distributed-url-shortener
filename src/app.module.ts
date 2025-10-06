import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UrlsModule } from './urls/urls.module';
import { ConfigModule } from '@nestjs/config';
import { SupabaseModule } from './auth/strategies/supabase.strategy';
@Module({
  imports: [AuthModule, UrlsModule,ConfigModule.forRoot({isGlobal:true}),
SupabaseModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
