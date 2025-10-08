import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from '@nestjs/cache-manager';
import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { CodeGenerator } from '../config/code-generator';
import { encrypt } from '../middlewares/encrypt';

interface UrlCache {
  long_url: string;
}

@Injectable()
export class UrlsService {
  constructor(
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    @Inject('SUPABASE_CLIENT') private readonly supabaseBase: SupabaseClient,
    private readonly configService: ConfigService,
  ) {}

async createShortUrl(
  long_url: string,
  userId: string,
  accessToken: string,
  password?: string,
  customAlias?: string,
): Promise<{ short_url: string; short_code: string; long_url: string }> {
  // Create an authenticated Supabase client
  const supabase = createClient(
    this.configService.get<string>('SUPABASE_URL')!,
    this.configService.get<string>('SUPABASE_ANON_KEY')!,
    {
      global: {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    }
  );

  // Step 1: Verify token and user
  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !userData.user || userData.user.id !== userId) {
    throw new Error('Invalid authentication token or user mismatch');
  }

  const verifiedUserId = userData.user.id;

  // ✅ REMOVE THIS ENTIRE PROFILE CHECK SECTION
  // The trigger handles profile creation automatically!
  // No need to check or create profiles manually anymore

  // Step 2: Check if the same URL already exists for this user
  const { data: existingUrl, error: existingError } = await supabase
    .from('urls')
    .select('*')
    .eq('long_url', long_url)
    .eq('user_id', verifiedUserId)
    .maybeSingle(); // ✅ Use maybeSingle() instead of single()

  if (existingError) {
    throw new Error(`Error checking existing URL: ${existingError.message}`);
  }

  if (existingUrl) {
    // ✅ Return existing URL instead of throwing error
    const shortUrl = `${process.env.SHORT_URL_DOMAIN}/${existingUrl.short_code}`;
    return {
      short_url: shortUrl,
      short_code: existingUrl.short_code,
      long_url: long_url,
    };
  }

  // Step 3: Determine short code
  let shortCode = customAlias || CodeGenerator();

  // Step 4: Check alias collisions
  let attempts = 0;
  while (attempts < 5) { // ✅ Add max attempts to prevent infinite loop
    const { data: existingCode } = await supabase
      .from('urls')
      .select('short_code')
      .eq('short_code', shortCode)
      .maybeSingle();

    if (!existingCode) break;

    if (customAlias) {
      throw new Error('Custom alias already taken');
    }

    shortCode = CodeGenerator();
    attempts++;
  }

  if (attempts >= 5) {
    throw new Error('Failed to generate unique short code. Please try again.');
  }

  // Step 5: Optional password hash
  let passwordHash: string | null = null;
  if (password) {
    passwordHash = await bcrypt.hash(password, 10);
  }

  // Step 6: Encrypt long URL
  const encryptedLongUrl = encrypt(long_url);

  // Step 7: Insert into Supabase
  const { error: insertError } = await supabase.from('urls').insert({
    short_code: shortCode,
    long_url: encryptedLongUrl,
    user_id: verifiedUserId,
    custom_alias: !!customAlias,
    password_hash: passwordHash,
    is_active: true,
  });

  if (insertError) {
    throw new Error(`Error inserting URL: ${insertError.message}`);
  }

  // Step 8: Cache the mapping for 1 day
  const cacheData: UrlCache = { long_url };
  await this.cacheManager.set(shortCode, cacheData, 86400);

  // Step 9: Return response
  const shortUrl = `${process.env.SHORT_URL_DOMAIN}/${shortCode}`;

  return {
    short_url: shortUrl,
    short_code: shortCode,
    long_url,
  };
}


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

    // Verify user
    const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
    
    if (userError || !userData.user) {
      throw new Error('Invalid authentication token');
    }

    const { error } = await supabase
      .from('urls')
      .delete()
      .eq('short_code', shortCode)
      .eq('user_id', userData.user.id); // Use verified user ID

    if (error) {
      throw new Error(`Error deleting URL: ${error.message}`);
    }

    // Remove from cache
    await this.cacheManager.del(shortCode);

    return { message: 'URL deleted successfully' };
  }
}