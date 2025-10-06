import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport'
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from './guards/jwt.auth.guard';
import { SupabaseStrategy } from './strategies/supabase.strategy';
import { config } from 'process';
@Module({
  imports:[
    PassportModule,
    ConfigModule,
    JwtModule.registerAsync({
      useFactory:(configService:ConfigService)=>{
        return{
          global:true,
          secret:configService.get<string>('SUPABASE_JWT_SECRET'),
          signOptions:{expiresIn:3600},
        }
      },
      inject:[ConfigService]
    })
  ],
    providers: [JwtAuthGuard, SupabaseStrategy],
    exports: [JwtAuthGuard, JwtModule]
})

export class AuthModule {}
