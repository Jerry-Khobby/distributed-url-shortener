import { Injectable, Inject,NotFoundException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from '@nestjs/cache-manager';
import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { CodeGenerator } from '../config/code-generator';
import { encrypt,decrypt } from '../middlewares/encrypt';
import { Cron,CronExpression } from '@nestjs/schedule';








@Injectable()
export class UrlsService {
  constructor(
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    @Inject('SUPABASE_CLIENT') private readonly supabaseBase: SupabaseClient,
    private readonly configService: ConfigService,
  ) {}


 //@Cron('*/10 * * * * *')
 async handleExpiredUrls(){
  console.log('⏰ Checking for expired URLs...')
  try{
    const now = new Date().toISOString();
    // fetch URL that have expired 
    const {data:expiredUrls,error:fetchError} = await this.supabaseBase.from('urls').select('id,short_code')
    .lt('expires_at',now)

    if(fetchError){
      console.error('❌ Error fetching expired URLs:', fetchError.message);
        return;
    }
    if(!expiredUrls || expiredUrls.length===0){
        console.log('✅ No expired URLs found.');
        return;
    }
    console.log(`🗑 Found ${expiredUrls.length} expired URL(s). Deleting...`);
    const shortCodes = expiredUrls.map((u)=>u.short_code);

    const {error:deleteError}= await this.supabaseBase
    .from('urls')
    .delete()
    .lt('expires_at',now)
          if (deleteError) {
        console.error('❌ Error deleting expired URLs:', deleteError.message);
      } else {
        console.log(`🧹 Deleted expired URLs: ${shortCodes.join(', ')}`);

        // Optional: remove them from cache too
        for (const code of shortCodes) {
          await this.cacheManager.del(code);
        }
      }

  }catch(err){
console.error('🔥 Cron job failed:', err.message);
  }
 }

private async ensureProfileExists(
  supabase: SupabaseClient,
  userId: string,
  email: string,
): Promise<void> {
  const maxRetries = 3;
  const retryDelay = 1000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`🔍 [ensureProfileExists] Attempt ${attempt} for user: ${userId}`);

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.error('❌ Error checking profile:', error.message);
      throw new Error(`Error checking profile: ${error.message}`);
    }

    if (profile) {
      console.log('✅ Profile exists already');
      return;
    }

    console.log('⚙️ Trying to create profile manually...');
    const { error: insertError } = await supabase
      .from('profiles')
      .insert({ id: userId, email })
      .select()
      .single();

    if (!insertError) {
      console.log('✅ Profile successfully created');
      return;
    }

    console.error('❌ Insert error:', insertError.message, insertError.details || '');
    if (insertError.code === '23505') return;

    if (attempt < maxRetries) {
      console.log(`⏳ Retry ${attempt + 1} after delay...`);
      await new Promise((resolve) => setTimeout(resolve, retryDelay * attempt));
    } else {
      throw new Error('Failed to ensure profile exists after multiple attempts');
    }
  }
}

private async recordClick(
  supabase: SupabaseClient,
  shortCode: string,
  req?: any, // express Request
): Promise<void> {
  try {
    const ip =
      req?.headers['x-forwarded-for']?.toString().split(',')[0] ||
      req?.socket?.remoteAddress ||
      null;

    const userAgent = req?.headers['user-agent'] || null;
    const referrer = req?.headers['referer'] || req?.headers['referrer'] || null;

    await supabase.from('clicks').insert({
      short_code: shortCode,
      clicked_at: new Date().toISOString(),
      ip_address: ip,
      user_agent: userAgent,
      referrer: referrer,
    });
  } catch (err) {
    // Silent fail — don’t block redirect
    console.error('Failed to record click:', err.message);
  }
}


  async createShortUrl(
    long_url: string,
    userId: string,
    accessToken: string,
    password?: string,
    customAlias?: string,
  ): Promise<{ short_url: string; short_code: string; long_url: string }> {
    const supabase = createClient(
      this.configService.get<string>('SUPABASE_URL')!,
      this.configService.get<string>('SUPABASE_ANON_KEY')!,
      {
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
      },
    );

    // Step 1: Verify token and user
    const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
    if (userError || !userData.user || userData.user.id !== userId) {
      throw new Error('Invalid authentication token or user mismatch');
    }

    const verifiedUserId = userData.user.id;

    // ✅ Step 1.5: Ensure profile exists before URL insert
    await this.ensureProfileExists(supabase, verifiedUserId, userData.user.email!);

    // Step 2: Check for existing URL
    const { data: existingUrl, error: existingError } = await supabase
      .from('urls')
      .select('*')
      .eq('long_url', long_url)
      .eq('user_id', verifiedUserId)
      .maybeSingle();

    if (existingError) throw new Error(`Error checking existing URL: ${existingError.message}`);
    if (existingUrl) {
      const shortUrl = `${process.env.SHORT_URL_DOMAIN}/${existingUrl.short_code}`;
      return { short_url: shortUrl, short_code: existingUrl.short_code, long_url };
    }

    // Step 3: Generate short code
    let shortCode = customAlias || CodeGenerator();

    // Step 4: Prevent alias collisions
    let attempts = 0;
    while (attempts < 5) {
      const { data: existingCode } = await supabase
        .from('urls')
        .select('short_code')
        .eq('short_code', shortCode)
        .maybeSingle();

      if (!existingCode) break;
      if (customAlias) throw new Error('Custom alias already taken');

      shortCode = CodeGenerator();
      attempts++;
    }
    if (attempts >= 5) throw new Error('Failed to generate unique short code. Please try again.');

    // Step 5: Optional password
    let passwordHash: string | null = null;
    if (password) passwordHash = await bcrypt.hash(password, 10);

    // Step 6: Encrypt long URL
    const encryptedLongUrl = encrypt(long_url);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getMinutes()+2);

    // Step 7: Insert into Supabase
    const { error: insertError } = await supabase.from('urls').insert({
      short_code: shortCode,
      long_url: encryptedLongUrl,
      user_id: verifiedUserId,
      custom_alias: !!customAlias,
      password_hash: passwordHash,
      is_active: true,
      expires_at: expiresAt.toISOString(),
    });

    if (insertError) throw new Error(`Error inserting URL: ${insertError.message}`);

    // Step 8: Cache for 1 day
    await this.cacheManager.set(shortCode, { long_url }, 86400);

    // Step 9: Return
    return {
      short_url: `${process.env.SHORT_URL_DOMAIN}/${shortCode}`,
      short_code: shortCode,
      long_url,
    };
  }



//I want to get the shortens urls,I want to grab the shorten url or the short code 
async shortCode(shortCode:string,accessToken:string,userId:string,req?:any):Promise<{long_url:string}>{
  //I have to check if there is a shortcode in the database urls 
  const supabase = createClient(
          this.configService.get<string>('SUPABASE_URL')!,
      this.configService.get<string>('SUPABASE_ANON_KEY')!,
      {
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
      },
  )
    //try and cache first - fast path 
    const cache = await this.cacheManager.get<{long_url:string}>(shortCode)
    if(cache){
      this.recordClick(supabase,shortCode,req)
      return {long_url:cache.long_url}
    }

    const {data:existingShortCode,error} = await supabase.from('urls').select('*').eq('short_code',shortCode)
    .maybeSingle();
    if(!existingShortCode){
      throw new NotFoundException(`Url with this short code ${shortCode} not found.`)
    }
    const now = new Date();

    if(new Date(existingShortCode.expires_at)<now){
      throw new NotFoundException("This short URL has expired");
    }
    // I would also love to check the cache, everything there 
    if(!existingShortCode.is_active){
      throw new NotFoundException('This short URL is inactive.');
    }
    //cdepcrypt long url 
    const decrpytedUrl = decrypt(existingShortCode.long_url);
  // 8️⃣ Cache result (1 day)
  await this.cacheManager.set(shortCode, { long_url: decrpytedUrl }, 86400);

 // 9️⃣ Record click (non-blocking)
  this.recordClick(supabase, shortCode,req);


  // 🔟 Return destination
  return { long_url: decrpytedUrl };

}

}
