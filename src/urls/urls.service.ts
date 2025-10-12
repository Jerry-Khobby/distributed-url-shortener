import { Injectable, Inject,NotFoundException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from '@nestjs/cache-manager';
import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { CodeGenerator } from '../config/code-generator';
import { encrypt,decrypt } from '../middlewares/encrypt';
import { Cron,CronExpression } from '@nestjs/schedule';
import { Request } from 'express';
import {UAParser} from 'ua-parser-js';
import geoip from 'geoip-lite';








@Injectable()
export class UrlsService {
  constructor(
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    @Inject('SUPABASE_CLIENT') private readonly supabaseBase: SupabaseClient,
    private readonly configService: ConfigService,
  ) {}


@Cron(CronExpression.EVERY_MINUTE)
async handleExpiredUrls() {
  console.log('⏰ Checking for expired URLs...');
  try {
    const now = new Date().toISOString();
    
    // Create a service role client that bypasses RLS for cron operations
    const supabaseAdmin = createClient(
      this.configService.get<string>('SUPABASE_URL')!,
      this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY')!, // Use service role key
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );
    
    // Fetch URLs that have expired
    const { data: expiredUrls, error: fetchError } = await supabaseAdmin
      .from('urls')
      .select('id, short_code')
      .lt('expires_at', now)
      .limit(100);

    if (fetchError) {
      console.error('❌ Error fetching expired URLs:', fetchError.message);
      return;
    }

    if (!expiredUrls || expiredUrls.length === 0) {
      console.log('✅ No expired URLs found.');
      return;
    }

    console.log(`🗑 Found ${expiredUrls.length} expired URL(s). Deleting...`);

    // Extract IDs and short codes
    const ids = expiredUrls.map((u) => u.id);
    const shortCodes = expiredUrls.map((u) => u.short_code);

    // Delete using the specific IDs - this will bypass RLS with service role
    const { data: deletedData, error: deleteError } = await supabaseAdmin
      .from('urls')
      .delete()
      .in('id', ids)
      .select('id'); // Verify deletion happened

    if (deleteError) {
      console.error('❌ Error deleting expired URLs:', deleteError.message);
      console.error('Delete error details:', deleteError);
      return;
    }

    // Verify deletion count
    const deletedCount = deletedData?.length || 0;
    console.log(`🧹 Successfully deleted ${deletedCount} expired URL(s): ${shortCodes.join(', ')}`);

    if (deletedCount !== expiredUrls.length) {
      console.warn(`⚠️  Warning: Expected to delete ${expiredUrls.length} URLs but only deleted ${deletedCount}`);
    }

    // Remove from cache
    for (const code of shortCodes) {
      await this.cacheManager.del(code);
    }

  } catch (err) {
    console.error('🔥 Cron job failed:', err.message);
    console.error('Stack trace:', err.stack);
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

private async recordClick(shortCode: string, req?: Request): Promise<void> {
  try {
    const supabaseAdmin = createClient(
      this.configService.get<string>('SUPABASE_URL')!,
      this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // ✅ Step 1: Extract IP properly
    const ip =
      (req?.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req?.socket?.remoteAddress?.replace('::ffff:', '') ||
      null;
      const isLocal = ip === '::1' || ip === '127.0.0.1';

    // ✅ Step 2: Device & Browser detection
    const userAgent = req?.headers['user-agent'] || '';
    const parser = new UAParser(userAgent);
    parser.setUA(userAgent || '');
    const result = parser.getResult();

    const deviceType = result.device.type || 'desktop';
    const browser = result.browser.name || 'Unknown';
    const os = result.os.name || 'Unknown';

    // ✅ Step 3: Referrer
    const referrer = req?.headers['referer'] || req?.headers['referrer'] || null;

    // ✅ Step 4: Geo lookup
    const geo = !isLocal && ip ? geoip.lookup(ip) : null;
    const country = isLocal ? 'Local' : geo?.country || null;
    const city = isLocal ? 'Localhost' : geo?.city || null;
    // ✅ Step 5: Save click
    await supabaseAdmin.from('clicks').insert({
      short_code: shortCode,
      clicked_at: new Date().toISOString(),
      ip_address: ip,
      referrer,
      device_type: deviceType,
      browser,
      os,
      country,
      city,
    });
  } catch (err) {
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
    expiresAt.setMinutes(expiresAt.getMinutes()+2);

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
  const supabase = this.supabaseBase;
    //try and cache first - fast path 
    const cache = await this.cacheManager.get<{long_url:string}>(shortCode)
    if(cache){
      this.recordClick(shortCode,req)
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
  this.recordClick(shortCode,req);


  // 🔟 Return destination
  return { long_url: decrpytedUrl };

}

async getUrlStats(

  shortCode: string,
  userId: string,
  accessToken: string,
): Promise<any> {
  // Add this method to your UrlsService class
  const supabase = createClient(
    this.configService.get<string>('SUPABASE_URL')!,
    this.configService.get<string>('SUPABASE_ANON_KEY')!,
    {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    },
  );

  // Step 1: Verify the URL exists and belongs to the user
  const { data: url, error: urlError } = await supabase
    .from('urls')
    .select('*')
    .eq('short_code', shortCode)
    .maybeSingle();

  if (urlError) {
    throw new Error(`Error fetching URL: ${urlError.message}`);
  }

  if (!url) {
    throw new NotFoundException(`URL with short code ${shortCode} not found`);
  }

  // Step 2: Verify ownership
  if (url.user_id !== userId) {
    throw new Error('You do not have permission to view stats for this URL');
  }

  // Step 3: Check cache for stats (5-minute TTL)
  const cacheKey = `stats:${shortCode}`;
  const cachedStats = await this.cacheManager.get(cacheKey);
  if (cachedStats) {
    return cachedStats;
  }

  // Step 4: Query all clicks for this URL
  const { data: clicks, error: clicksError } = await supabase
    .from('clicks')
    .select('*')
    .eq('short_code', shortCode)
    .order('clicked_at', { ascending: false });

  if (clicksError) {
    throw new Error(`Error fetching clicks: ${clicksError.message}`);
  }

  // Step 5: Calculate statistics
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const totalClicks = clicks?.length || 0;

  const clicksLast7Days = clicks?.filter(
    (c) => new Date(c.clicked_at) >= sevenDaysAgo,
  ).length || 0;

  const clicksLast30Days = clicks?.filter(
    (c) => new Date(c.clicked_at) >= thirtyDaysAgo,
  ).length || 0;

  // Group clicks by date (last 30 days)
  const clicksByDate = clicks
    ?.filter((c) => new Date(c.clicked_at) >= thirtyDaysAgo)
    .reduce((acc, click) => {
      const date = new Date(click.clicked_at).toISOString().split('T')[0];
      acc[date] = (acc[date] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

  const clicksByDateArray = Object.entries(clicksByDate || {})
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Top countries
  const countryCount = clicks?.reduce((acc, click) => {
    const country = click.country || 'Unknown';
    acc[country] = (acc[country] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

const topCountries = Object.entries(countryCount || {})
  .map(([country, count]) => ({ country, count: count as number }))
  .sort((a, b) => (b.count as number) - (a.count as number))
  .slice(0, 10);

  // Top referrers
  const referrerCount = clicks?.reduce((acc, click) => {
    const referrer = click.referrer || 'Direct';
    acc[referrer] = (acc[referrer] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

 const topReferrers = Object.entries(referrerCount || {})
  .map(([referrer, count]) => ({ referrer, count: count as number }))
  .sort((a, b) => (b.count as number) - (a.count as number))
  .slice(0, 10);

  // Device breakdown
  const deviceCount = clicks?.reduce((acc, click) => {
    const device = click.device_type || 'Unknown';
    acc[device] = (acc[device] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

const deviceBreakdown = Object.entries(deviceCount || {})
  .map(([device_type, count]) => ({ device_type, count: count as number }))
  .sort((a, b) => (b.count as number) - (a.count as number));

  // Browser breakdown
  const browserCount = clicks?.reduce((acc, click) => {
    const browser = click.browser || 'Unknown';
    acc[browser] = (acc[browser] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

const browserBreakdown = Object.entries(browserCount || {})
  .map(([browser, count]) => ({ browser, count: count as number }))
  .sort((a, b) => (b.count as number) - (a.count as number));

  // OS breakdown
  const osCount = clicks?.reduce((acc, click) => {
    const os = click.os || 'Unknown';
    acc[os] = (acc[os] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

const osBreakdown = Object.entries(osCount || {})
  .map(([os, count]) => ({ os, count: count as number }))
  .sort((a, b) => (b.count as number) - (a.count as number));

  // Step 6: Prepare response
  const stats = {
    short_code: shortCode,
    total_clicks: totalClicks,
    clicks_last_7_days: clicksLast7Days,
    clicks_last_30_days: clicksLast30Days,
    clicks_by_date: clicksByDateArray,
    top_countries: topCountries,
    top_referrers: topReferrers,
    device_breakdown: deviceBreakdown,
    browser_breakdown: browserBreakdown,
    os_breakdown: osBreakdown,
  };

  // Step 7: Cache for 5 minutes (300 seconds)
  await this.cacheManager.set(cacheKey, stats, 300);

  return stats;
}

}
