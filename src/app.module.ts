import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UrlsModule } from './urls/urls.module';
import { ConfigModule } from '@nestjs/config';
@Module({
  imports: [AuthModule, UrlsModule,ConfigModule.forRoot({isGlobal:true})],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
