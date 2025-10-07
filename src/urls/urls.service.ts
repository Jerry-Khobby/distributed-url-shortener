import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from '@nestjs/cache-manager';
import { SupabaseClient } from '@supabase/supabase-js';
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
    @Inject('SUPABASE_CLIENT') private readonly supabase: SupabaseClient,
  ) {}

  async createShortUrl(
    longUrl: string,
    userId: string,          // 👈 Supabase-authenticated user ID
    password?: string,       // optional password
    customAlias?: string,    // optional custom alias
  ): Promise<{ short_url: string; short_code: string; long_url: string }> {

    // ✅ Step 1. Check if URL already shortened
    const { data: existingUrl, error: existingError } = await this.supabase
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

    // ✅ Step 2. Determine short_code (custom alias or random)
    let shortCode = customAlias || CodeGenerator();

    // ✅ Step 3. Check for collision
    while (true) {
      const { data: existingCode } = await this.supabase
        .from('urls')
        .select('short_code')
        .eq('short_code', shortCode)
        .single();

      if (!existingCode) break; // no collision, good to use

      if (customAlias) {
        throw new Error('Alias already taken');
      }

      shortCode = CodeGenerator(); // generate new random code
    }

    // ✅ Step 4. Hash password if provided
    let passwordHash: string | null = null;
    if (password) {
      passwordHash = await bcrypt.hash(password, 10);
    }

    // ✅ Step 5. Encrypt long URL (optional, as you mentioned)
    const encryptedLongUrl = encrypt(longUrl);

    // ✅ Step 6. Insert into Supabase
    const { error: insertError } = await this.supabase.from('urls').insert({
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

    // ✅ Step 7. Cache the mapping for 1 day (86400s)
    const cacheData: UrlCache = { longUrl };
    await this.cacheManager.set(shortCode, cacheData, 86400);

    // ✅ Step 8. Return the full short URL
    const shortUrl = `${process.env.SHORT_URL_DOMAIN}/${shortCode}`;
    const response={
      short_url:shortUrl,
      short_code:shortCode,
      long_url:longUrl,
    }
    return response;
  }
}
