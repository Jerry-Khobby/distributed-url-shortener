import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from '@nestjs/cache-manager';
import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { CodeGenerator } from '../config/code-generator';
import { encrypt } from '../middlewares/encrypt';

interface UrlCache {
  longUrl: string;
}

@Injectable()
export class UrlsService {
  constructor(
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    @Inject('SUPABASE_CLIENT') private readonly supabaseBase: SupabaseClient,
    private readonly configService: ConfigService,
  ) {}

  async createShortUrl(
    longUrl: string,
    userId: string,
    accessToken: string,
    password?: string,
    customAlias?: string,
  ): Promise<{ short_url: string; short_code: string; long_url: string }> {
    
    // Create an authenticated Supabase client for this request
    const supabase = createClient(
      this.configService.get<string>('SUPABASE_URL')!,
      this.configService.get<string>('SUPABASE_ANON_KEY')!,
      {
        global: {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      }
    );

    // Step 1: Check if URL already shortened
    const { data: existingUrl, error: existingError } = await supabase
      .from('urls')
      .select('*')
      .eq('long_url', longUrl)
      .single();

    if (existingError && existingError.code !== 'PGRST116') {
      throw new Error('Error checking existing URL');
    }
    
    if (existingUrl) {
      throw new Error('URL already shortened');
    }

    // Step 2: Determine short_code (custom alias or random)
    let shortCode = customAlias || CodeGenerator();

    // Step 3: Check for collision
    while (true) {
      const { data: existingCode } = await supabase
        .from('urls')
        .select('short_code')
        .eq('short_code', shortCode)
        .single();

      if (!existingCode) break; // No collision, good to use

      if (customAlias) {
        throw new Error('Custom alias already taken');
      }

      shortCode = CodeGenerator(); // Generate new random code
    }

    // Step 4: Hash password if provided
    let passwordHash: string | null = null;
    if (password) {
      passwordHash = await bcrypt.hash(password, 10);
    }

    // Step 5: Encrypt long URL
    const encryptedLongUrl = encrypt(longUrl);

    // Step 6: Insert into Supabase with authenticated client
    const { error: insertError } = await supabase.from('urls').insert({
      short_code: shortCode,
      long_url: encryptedLongUrl,
      user_id: userId,
      custom_alias: !!customAlias,
      password_hash: passwordHash,
      is_active: true,
    });

    if (insertError) {
      throw new Error(`Error inserting URL: ${insertError.message}`);
    }

    // Step 7: Cache the mapping for 1 day (86400s)
    const cacheData: UrlCache = { longUrl };
    await this.cacheManager.set(shortCode, cacheData, 86400);

    // Step 8: Return the full short URL
    const shortUrl = `${process.env.SHORT_URL_DOMAIN}/${shortCode}`;
    
    return {
      short_url: shortUrl,
      short_code: shortCode,
      long_url: longUrl,
    };
  }

  // Example: Get user's URLs (also uses authenticated client)
  async getUserUrls(userId: string, accessToken: string) {
    const supabase = createClient(
      this.configService.get<string>('SUPABASE_URL')!,
      this.configService.get<string>('SUPABASE_ANON_KEY')!,
      {
        global: {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      }
    );

    const { data, error } = await supabase
      .from('urls')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Error fetching URLs: ${error.message}`);
    }

    return data;
  }

  // Example: Delete URL (also uses authenticated client)
  async deleteUrl(shortCode: string, userId: string, accessToken: string) {
    const supabase = createClient(
      this.configService.get<string>('SUPABASE_URL')!,
      this.configService.get<string>('SUPABASE_ANON_KEY')!,
      {
        global: {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      }
    );

    const { error } = await supabase
      .from('urls')
      .delete()
      .eq('short_code', shortCode)
      .eq('user_id', userId);

    if (error) {
      throw new Error(`Error deleting URL: ${error.message}`);
    }

    // Remove from cache
    await this.cacheManager.del(shortCode);

    return { message: 'URL deleted successfully' };
  }
}