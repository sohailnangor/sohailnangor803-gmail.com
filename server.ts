import 'dotenv/config';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PushSubscription as WebPushSubscription } from 'web-push';

const require = createRequire(import.meta.url);
const webPush = require('web-push') as typeof import('web-push');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type VideoCategory = 'Film' | 'Drama' | 'Story';

interface FolderRecord {
  id: string;
  title: string;
  category: VideoCategory;
  thumbnail: string;
  created_at?: string;
}

interface VideoRecord {
  id: string;
  youtube_id: string;
  title: string;
  category: VideoCategory;
  folder_id: string;
  duration: string;
  views: string;
  created_at?: string;
}

interface UserProfileRecord {
  id: string;
  first_name: string;
  last_name: string;
  password_hash: string;
  subscribed_folders: string[];
  created_at?: string;
}

interface AdConfigRecord {
  id: string;
  top_code: string;
  feed_code: string;
  bottom_code: string;
  updated_at?: string;
}

interface SessionPayload {
  sub: string;
  role: 'user' | 'admin';
  firstName: string;
  lastName: string;
  exp: number;
}

const SESSION_SECRET =
  process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

const runtimePushKeys = (() => {
  try {
    const keys = webPush.generateVAPIDKeys();
    webPush.setVapidDetails(
      'mailto:notifications@filmdramabox.app',
      keys.publicKey,
      keys.privateKey
    );
    return keys;
  } catch {
    return null;
  }
})();

const ADMIN_PASSWORD_DIGEST =
  'c7163acf9d4785f88eec45e88b1a699563b9d077f7d5b138eef5b44f669e1c1a';

const ADMIN_KEY_786_DIGESTS = new Set<string>([
  '44cd3108256a23f3dad90bee010442623ff6425905fe55dcb5a6a972498797d9',
  '2a662024aa900baaf3908559298875ff43442f46db9202bc92cacd72103178b2',
  '30ce5b50e8cdaf29201eab33ca753cccc42af73573ccb204537d36c1344ccdd1',
  '940c3aafd709d2b70caa26eb829c6ae79cb1a2f35ec32f4b04593e1e96aa20e9',
  'c3770af3d346711de9cd2f65d077fc6399964ac19d905387f9e94d8ec25a790f',
  'f33722712b8f7cd69d1a442eaf78ad6bbb8165b41bffbc3736bba24ed76fd921',
  'fa2daa3ab2ed75141ada2a5b3f0221cf1bcd0c4e6975cca3a45125c1947d96f3',
  '2bd09b7c665625973b883fcf2e11bcec0e82617e15aaec5b9e6f7119415dd048',
  'fc57132d52cb8f246a010a36f00e536bb8c030d194af026f80121db32a522b4a',
  'b98703abc80e6ff257867bea4fb79768478d44afa96f521b4c40dddc2379a918',
  'defb3c6f3f1167e0f888871003d8b65b777eebf55a24d253e419491bc8595429',
  '8e921f883d7bceec9c7648a81b4378de1b09802d0b17e2ab243f065c1998a358',
  'ba10dd1c9638763fa1c3125db1af98a64ec32a52e5ead610e34b7d54088972a3',
  '826b4e59d67585f5b469dfc637f619e65c23bde6c09926fbbbd0a683db520c9b',
  'd5e8e69475daa0e3a4e1bf2d71af4040eb1356295c34f373c5be9e1c8f38609f',
  'ef9c316cfc7a20f5ba57ecb687d814f4051a7d28d652a5cd165cc08de1e4767a',
]);

function normalizeText(raw: string): string {
  return String(raw || '')
    .toLowerCase()
    .replace(/[\u200c\u200d\u064b-\u065f\u0901-\u0903\u093c]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function timingSafeMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function isAdminIdentity(firstName: string, lastName: string): boolean {
  const f = normalizeText(firstName);
  const l = normalizeText(lastName);
  return f === 'sohail' && (l === 'nangor' || l === 'nangoor');
}

function isValidAdminPassword(password: string): boolean {
  const trimmed = String(password || '').trim();
  if (!trimmed) return false;
  const envPassword = (process.env.ADMIN_PASSWORD || '').trim();
  if (envPassword) {
    return timingSafeMatch(trimmed, envPassword);
  }
  return timingSafeMatch(sha256Hex(trimmed), ADMIN_PASSWORD_DIGEST);
}

function isAdminPasskeyMatch(candidates: string[]): boolean {
  const envPasskey = (process.env.ADMIN_PASSKEY || '').trim();
  for (const raw of candidates) {
    const trimmed = String(raw || '').trim();
    if (!trimmed) continue;

    if (envPasskey && timingSafeMatch(trimmed, envPasskey)) {
      return true;
    }

    const norm = normalizeText(trimmed);
    const compact = norm.replace(/\s+/g, '');
    if (
      ADMIN_KEY_786_DIGESTS.has(sha256Hex(norm)) ||
      ADMIN_KEY_786_DIGESTS.has(sha256Hex(compact))
    ) {
      return true;
    }
  }
  return false;
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(':');
  if (parts.length !== 2) return false;
  const [salt, originalHash] = parts;
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return timingSafeMatch(derived, originalHash);
}

function signSession(payload: Omit<SessionPayload, 'exp'>): string {
  const full: SessionPayload = {
    ...payload,
    exp: Date.now() + 1000 * 60 * 60 * 24 * 7,
  };
  const body = Buffer.from(JSON.stringify(full)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(body)
    .digest('base64url');
  return `${body}.${sig}`;
}

function verifySession(token: string): SessionPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [body, sig] = parts;
    const expected = crypto
      .createHmac('sha256', SESSION_SECRET)
      .update(body)
      .digest('base64url');
    if (!timingSafeMatch(sig, expected)) return null;
    const decoded = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload;
    if (!decoded.exp || decoded.exp < Date.now()) return null;
    return decoded;
  } catch {
    return null;
  }
}

function extractYouTubeId(input: string): string | null {
  const clean = String(input || '').trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(clean)) return clean;
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/,
    /[?&]v=([a-zA-Z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = clean.match(pattern);
    if (match && match[1]) return match[1];
  }
  return null;
}

function sanitizeCategory(cat: unknown): VideoCategory {
  if (cat === 'Film' || cat === 'Drama' || cat === 'Story') return cat;
  return 'Story';
}

function createSupabase(): SupabaseClient | null {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
  const key = (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim();
  if (!url || !key) return null;
  try {
    return createClient(url, key, { auth: { persistSession: false } });
  } catch {
    return null;
  }
}

const supabase = createSupabase();

// In-memory store (zero demo items) used when Supabase is not yet configured
const memoryFolders: FolderRecord[] = [];
const memoryVideos: VideoRecord[] = [];
const memoryProfiles = new Map<string, UserProfileRecord>();
const memoryPushSubscriptions = new Map<string, WebPushSubscription>();
const sseClients = new Set<Response>();
let memoryAdConfig: AdConfigRecord = {
  id: 'default',
  top_code: '',
  feed_code: '',
  bottom_code: '',
};

function formatDurationSeconds(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return '';
  const total = Math.floor(totalSeconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function parseIsoDuration(iso: string): string {
  const match = String(iso || '').match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i);
  if (!match) return '';
  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);
  return formatDurationSeconds(hours * 3600 + minutes * 60 + seconds);
}

function sanitizeRealDuration(raw: unknown): string {
  const clean = String(raw || '').trim();
  if (!clean || clean.toUpperCase() === 'HD') return '';
  const hmsMatch = clean.match(/^(\d{1,3}):([0-5]\d):([0-5]\d)$/);
  if (hmsMatch) {
    const secs =
      Number(hmsMatch[1]) * 3600 + Number(hmsMatch[2]) * 60 + Number(hmsMatch[3]);
    return formatDurationSeconds(secs);
  }
  const msMatch = clean.match(/^(\d{1,3}):([0-5]\d)$/);
  if (msMatch) {
    const secs = Number(msMatch[1]) * 60 + Number(msMatch[2]);
    return formatDurationSeconds(secs);
  }
  return '';
}

interface VideoPushNotificationPayload {
  title: string;
  body: string;
  icon: string;
  image: string;
  badge: string;
  url: string;
  videoId: string;
  youtubeId: string;
  category: VideoCategory;
  videoTitle: string;
}

async function broadcastNewVideoNotification(
  payload: VideoPushNotificationPayload
): Promise<void> {
  const sseData = `event: new_video\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(sseData);
    } catch {
      sseClients.delete(client);
    }
  }

  if (supabase) {
    try {
      const channel = supabase.channel('filmdrama-releases');
      await channel.send({
        type: 'broadcast',
        event: 'new_video',
        payload,
      });
      await supabase.removeChannel(channel);
    } catch {
      // Ignore realtime broadcast errors gracefully
    }
  }

  if (!runtimePushKeys) return;

  const subMap = new Map<string, WebPushSubscription>(memoryPushSubscriptions);
  if (supabase) {
    try {
      const { data } = await supabase
        .from('push_subscriptions')
        .select('endpoint,subscription');
      if (Array.isArray(data)) {
        for (const row of data) {
          const sub = row.subscription as WebPushSubscription | null;
          if (sub && typeof sub.endpoint === 'string') {
            subMap.set(sub.endpoint, sub);
          }
        }
      }
    } catch {
      // Table optional if user has not created push_subscriptions yet
    }
  }

  if (subMap.size === 0) return;

  const jsonPayload = JSON.stringify(payload);
  await Promise.allSettled(
    Array.from(subMap.entries()).map(async ([endpoint, subscription]) => {
      try {
        await webPush.sendNotification(subscription, jsonPayload);
      } catch (err) {
        const statusCode =
          typeof err === 'object' && err !== null && 'statusCode' in err
            ? Number((err as { statusCode?: number }).statusCode)
            : 0;
        if (statusCode === 404 || statusCode === 410) {
          memoryPushSubscriptions.delete(endpoint);
          if (supabase) {
            try {
              await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
            } catch {
              // Ignore cleanup error
            }
          }
        }
      }
    })
  );
}

interface AuthedRequest extends Request {
  session?: SessionPayload;
}

function readBearer(req: Request): SessionPayload | null {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  return verifySession(header.slice(7).trim());
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const session = readBearer(req);
  if (!session) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  req.session = session;
  next();
}

function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction): void {
  const session = readBearer(req);
  if (!session || session.role !== 'admin') {
    res.status(403).json({ error: 'Admin authorization required' });
    return;
  }
  req.session = session;
  next();
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // Bootstrap app state (Zero demo data; syncs with Supabase when available)
  app.get('/api/bootstrap', async (_req: Request, res: Response) => {
    if (!supabase) {
      res.json({
        supabaseConnected: false,
        folders: memoryFolders,
        videos: memoryVideos,
        adConfig: {
          topCode: memoryAdConfig.top_code,
          feedCode: memoryAdConfig.feed_code,
          bottomCode: memoryAdConfig.bottom_code,
        },
      });
      return;
    }

    try {
      const [foldersRes, videosRes, adsRes] = await Promise.all([
        supabase.from('folders').select('id,title,category,thumbnail,created_at').order('created_at', { ascending: false }),
        supabase.from('videos').select('id,youtube_id,title,category,folder_id,duration,views,created_at').order('created_at', { ascending: false }),
        supabase.from('ad_config').select('id,top_code,feed_code,bottom_code').eq('id', 'default').maybeSingle(),
      ]);

      if (foldersRes.error || videosRes.error) {
        res.json({
          supabaseConnected: false,
          folders: memoryFolders,
          videos: memoryVideos,
          adConfig: {
            topCode: memoryAdConfig.top_code,
            feedCode: memoryAdConfig.feed_code,
            bottomCode: memoryAdConfig.bottom_code,
          },
        });
        return;
      }

      res.json({
        supabaseConnected: true,
        folders: foldersRes.data || [],
        videos: videosRes.data || [],
        adConfig: {
          topCode: adsRes.data?.top_code || '',
          feedCode: adsRes.data?.feed_code || '',
          bottomCode: adsRes.data?.bottom_code || '',
        },
      });
    } catch {
      res.json({
        supabaseConnected: false,
        folders: memoryFolders,
        videos: memoryVideos,
        adConfig: {
          topCode: memoryAdConfig.top_code,
          feedCode: memoryAdConfig.feed_code,
          bottomCode: memoryAdConfig.bottom_code,
        },
      });
    }
  });

  // Profile Sign-In / Registration & Admin Login Verification
  app.post('/api/profile/auth', async (req: Request, res: Response) => {
    const firstName = String(req.body?.firstName || '').trim();
    const lastName = String(req.body?.lastName || '').trim();
    const password = String(req.body?.password || '');

    if (isAdminIdentity(firstName, lastName)) {
      if (!isValidAdminPassword(password) && !isAdminPasskeyMatch([password])) {
        res.status(401).json({ error: 'Incorrect password for this account.' });
        return;
      }
      const token = signSession({
        sub: 'admin',
        role: 'admin',
        firstName,
        lastName,
      });
      res.json({
        role: 'admin',
        token,
        profile: {
          id: 'admin',
          firstName,
          lastName,
          subscribedFolders: [],
        },
      });
      return;
    }

    if (isAdminPasskeyMatch([firstName, lastName, password, `${firstName} ${lastName}`])) {
      const token = signSession({
        sub: 'admin',
        role: 'admin',
        firstName: 'Sohail',
        lastName: 'Nangoor',
      });
      res.json({
        role: 'admin',
        token,
        profile: {
          id: 'admin',
          firstName: 'Sohail',
          lastName: 'Nangoor',
          subscribedFolders: [],
        },
      });
      return;
    }

    if (!firstName || !lastName || password.length < 4) {
      res.status(400).json({
        error: 'First Name, Last Name, and a password (at least 4 characters) are required.',
      });
      return;
    }

    const profileId = `user_${sha256Hex(`${firstName.toLowerCase()}::${lastName.toLowerCase()}`).slice(0, 20)}`;

    if (supabase) {
      try {
        const existing = await supabase
          .from('user_profiles')
          .select('id,first_name,last_name,password_hash,subscribed_folders')
          .eq('id', profileId)
          .maybeSingle();

        if (!existing.error && existing.data) {
          if (!verifyPassword(password, existing.data.password_hash)) {
            res.status(401).json({ error: 'Incorrect password for this account.' });
            return;
          }
          const token = signSession({
            sub: existing.data.id,
            role: 'user',
            firstName: existing.data.first_name,
            lastName: existing.data.last_name,
          });
          res.json({
            role: 'user',
            token,
            profile: {
              id: existing.data.id,
              firstName: existing.data.first_name,
              lastName: existing.data.last_name,
              subscribedFolders: Array.isArray(existing.data.subscribed_folders)
                ? existing.data.subscribed_folders
                : [],
            },
          });
          return;
        }

        if (!existing.error) {
          const passwordHash = hashPassword(password);
          const inserted = await supabase
            .from('user_profiles')
            .insert({
              id: profileId,
              first_name: firstName,
              last_name: lastName,
              password_hash: passwordHash,
              subscribed_folders: [],
            })
            .select('id,first_name,last_name,subscribed_folders')
            .single();

          if (!inserted.error && inserted.data) {
            const token = signSession({
              sub: inserted.data.id,
              role: 'user',
              firstName: inserted.data.first_name,
              lastName: inserted.data.last_name,
            });
            res.json({
              role: 'user',
              token,
              profile: {
                id: inserted.data.id,
                firstName: inserted.data.first_name,
                lastName: inserted.data.last_name,
                subscribedFolders: [],
              },
            });
            return;
          }
        }
      } catch {
        // Fall back cleanly to memory profile store
      }
    }

    const memExisting = memoryProfiles.get(profileId);
    if (memExisting) {
      if (!verifyPassword(password, memExisting.password_hash)) {
        res.status(401).json({ error: 'Incorrect password for this account.' });
        return;
      }
      const token = signSession({
        sub: memExisting.id,
        role: 'user',
        firstName: memExisting.first_name,
        lastName: memExisting.last_name,
      });
      res.json({
        role: 'user',
        token,
        profile: {
          id: memExisting.id,
          firstName: memExisting.first_name,
          lastName: memExisting.last_name,
          subscribedFolders: memExisting.subscribed_folders,
        },
      });
      return;
    }

    const created: UserProfileRecord = {
      id: profileId,
      first_name: firstName,
      last_name: lastName,
      password_hash: hashPassword(password),
      subscribed_folders: [],
    };
    memoryProfiles.set(profileId, created);

    const token = signSession({
      sub: created.id,
      role: 'user',
      firstName: created.first_name,
      lastName: created.last_name,
    });
    res.json({
      role: 'user',
      token,
      profile: {
        id: created.id,
        firstName: created.first_name,
        lastName: created.last_name,
        subscribedFolders: [],
      },
    });
  });

  // Sync user folder subscriptions
  app.post('/api/profile/subscriptions', requireAuth, async (req: AuthedRequest, res: Response) => {
    const subscribedFolders = Array.isArray(req.body?.subscribedFolders)
      ? req.body.subscribedFolders.filter((v: unknown): v is string => typeof v === 'string')
      : [];
    const userId = req.session?.sub;
    if (!userId || req.session?.role === 'admin') {
      res.json({ ok: true, subscribedFolders });
      return;
    }

    const mem = memoryProfiles.get(userId);
    if (mem) {
      mem.subscribed_folders = subscribedFolders;
    }

    if (supabase) {
      try {
        await supabase
          .from('user_profiles')
          .update({ subscribed_folders: subscribedFolders })
          .eq('id', userId);
      } catch {
        // Ignore if table unavailable
      }
    }

    res.json({ ok: true, subscribedFolders });
  });

  async function fetchYouTubeDurationServer(youtubeId: string): Promise<{
    duration: string;
    title?: string;
  }> {

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    try {
      const watchRes = await fetch(`https://www.youtube.com/watch?v=${encodeURIComponent(youtubeId)}`, {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
          Cookie: 'SOCS=CAI; CONSENT=YES+cb.20210328-17-p0.en+FX+634',
        },
      });
      clearTimeout(timeout);
      if (watchRes.ok) {
        const html = await watchRes.text();
        const lenMatch = html.match(/"lengthSeconds":"(\d+)"/);
        if (lenMatch && lenMatch[1]) {
          const formatted = formatDurationSeconds(Number(lenMatch[1]));
          if (formatted) return { duration: formatted };
        }
        const approxMatch = html.match(/"approxDurationMs":"(\d+)"/);
        if (approxMatch && approxMatch[1]) {
          const formatted = formatDurationSeconds(Math.round(Number(approxMatch[1]) / 1000));
          if (formatted) return { duration: formatted };
        }
        const isoMatch = html.match(/itemprop="duration" content="(PT[^"]+)"/i);
        if (isoMatch && isoMatch[1]) {
          const formatted = parseIsoDuration(isoMatch[1]);
          if (formatted) return { duration: formatted };
        }
      }
    } catch {
      clearTimeout(timeout);
    }

    return { duration: '' };
  }

  async function fetchYouTubeMeta(youtubeId: string): Promise<{
    valid: boolean;
    title: string;
    authorName: string;
    duration: string;
    error?: string;
    status: number;
  }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    try {
      const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(
        `https://www.youtube.com/watch?v=${youtubeId}`
      )}&format=json`;
      const [response, durationMeta] = await Promise.all([
        fetch(oembedUrl, {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        }),
        fetchYouTubeDurationServer(youtubeId),
      ]);
      clearTimeout(timeout);

      if (!response.ok) {
        return {
          valid: false,
          title: '',
          authorName: '',
          duration: '',
          status: 422,
          error: 'Video is unavailable, private, or embedding is disabled on YouTube.',
        };
      }

      const data = (await response.json()) as { title?: string; author_name?: string };
      return {
        valid: true,
        title:
          (typeof data.title === 'string' ? data.title.trim() : '') ||
          durationMeta.title ||
          '',
        authorName: typeof data.author_name === 'string' ? data.author_name.trim() : '',
        duration: durationMeta.duration || '',
        status: 200,
      };
    } catch {
      clearTimeout(timeout);
      return {
        valid: false,
        title: '',
        authorName: '',
        duration: '',
        status: 502,
        error: 'Unable to reach YouTube to verify this video right now.',
      };
    }
  }

  // Layer (b): YouTube Link Detector (strict allowlisted YouTube oEmbed + real duration check)
  app.post('/api/youtube/verify', requireAdmin, async (req: Request, res: Response) => {
    const rawInput = String(req.body?.urlOrId || '').trim();
    const youtubeId = extractYouTubeId(rawInput);
    if (!youtubeId) {
      res.status(400).json({
        valid: false,
        error: 'Invalid YouTube URL or 11-character Video ID.',
      });
      return;
    }

    const meta = await fetchYouTubeMeta(youtubeId);
    if (!meta.valid) {
      res.status(meta.status).json({
        valid: false,
        youtubeId,
        error: meta.error,
      });
      return;
    }

    res.json({
      valid: true,
      youtubeId,
      title: meta.title || `YouTube Video (${youtubeId})`,
      authorName: meta.authorName,
      duration: meta.duration,
      thumbnail: `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`,
    });
  });

  // Web Push & Live Release Notifications
  app.get('/api/notifications/vapid-public-key', (_req: Request, res: Response) => {
    res.json({ publicKey: runtimePushKeys?.publicKey || '' });
  });

  app.post('/api/notifications/subscribe', async (req: Request, res: Response) => {
    const sub = req.body?.subscription as WebPushSubscription | undefined;
    const endpoint = typeof sub?.endpoint === 'string' ? sub.endpoint.trim() : '';
    const p256dh = typeof sub?.keys?.p256dh === 'string' ? sub.keys.p256dh.trim() : '';
    const auth = typeof sub?.keys?.auth === 'string' ? sub.keys.auth.trim() : '';

    if (!endpoint || !/^https:\/\//i.test(endpoint) || !p256dh || !auth) {
      res.status(400).json({ error: 'Invalid push subscription payload.' });
      return;
    }

    const cleanSub: WebPushSubscription = {
      endpoint,
      keys: { p256dh, auth },
      expirationTime: sub?.expirationTime ?? null,
    };

    memoryPushSubscriptions.set(endpoint, cleanSub);

    if (supabase) {
      try {
        await supabase.from('push_subscriptions').upsert({
          endpoint,
          subscription: cleanSub,
        });
      } catch {
        // Optional table
      }
    }

    res.json({ ok: true });
  });

  app.post('/api/notifications/unsubscribe', async (req: Request, res: Response) => {
    const endpoint = String(req.body?.endpoint || '').trim();
    if (endpoint) {
      memoryPushSubscriptions.delete(endpoint);
      if (supabase) {
        try {
          await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
        } catch {
          // Optional table
        }
      }
    }
    res.json({ ok: true });
  });

  app.get('/api/notifications/stream', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    res.write(': connected\n\n');

    sseClients.add(res);
    const heartbeat = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {
        clearInterval(heartbeat);
        sseClients.delete(res);
      }
    }, 25000);

    req.on('close', () => {
      clearInterval(heartbeat);
      sseClients.delete(res);
    });
  });

  // Layer (a): Content & Playlist Routing — Folders
  app.post('/api/folders', requireAdmin, async (req: Request, res: Response) => {
    const title = String(req.body?.title || '').trim();
    const category = sanitizeCategory(req.body?.category);
    const thumbnail = String(req.body?.thumbnail || '').trim();

    if (!title) {
      res.status(400).json({ error: 'Folder title is required.' });
      return;
    }
    if (thumbnail && !/^https?:\/\//i.test(thumbnail)) {
      res.status(400).json({ error: 'Thumbnail URL must use http:// or https://.' });
      return;
    }

    const record: FolderRecord = {
      id: `folder-${Date.now()}`,
      title,
      category,
      thumbnail,
      created_at: new Date().toISOString(),
    };

    memoryFolders.unshift(record);
    let supabaseSynced = false;

    if (supabase) {
      try {
        const { error } = await supabase.from('folders').insert(record);
        if (error) {
          console.error('Supabase folders insert error:', error.message);
        } else {
          supabaseSynced = true;
        }
      } catch (err) {
        console.error('Supabase folders insert failed:', err);
      }
    }

    res.json({ folder: record, supabaseSynced });
  });

  app.delete('/api/folders/:id', requireAdmin, async (req: Request, res: Response) => {
    const folderId = String(req.params.id || '').trim();
    const idx = memoryFolders.findIndex((f) => f.id === folderId);
    if (idx !== -1) memoryFolders.splice(idx, 1);
    for (const v of memoryVideos) {
      if (v.folder_id === folderId) v.folder_id = '';
    }

    if (supabase) {
      try {
        await supabase.from('videos').update({ folder_id: '' }).eq('folder_id', folderId);
        await supabase.from('folders').delete().eq('id', folderId);
      } catch (err) {
        console.error('Supabase folder delete failed:', err);
      }
    }

    res.json({ ok: true });
  });

  // Layer (a): Content & Playlist Routing — Videos
  app.post('/api/videos', requireAdmin, async (req: Request, res: Response) => {
    const youtubeId = extractYouTubeId(String(req.body?.youtubeId || ''));
    let title = String(req.body?.title || '').trim();
    const category = sanitizeCategory(req.body?.category);
    const folderId = String(req.body?.folderId || '').trim();
    let duration = sanitizeRealDuration(req.body?.duration);

    if (!youtubeId) {
      res.status(400).json({ error: 'Valid YouTube Video ID is required.' });
      return;
    }

    if (!title || !duration) {
      const meta = await fetchYouTubeMeta(youtubeId);
      if (!title) {
        title = meta.title || `YouTube Video (${youtubeId})`;
      }
      if (!duration && meta.duration) {
        duration = meta.duration;
      }
    }

    const record: VideoRecord = {
      id: `vid-${Date.now()}`,
      youtube_id: youtubeId,
      title,
      category,
      folder_id: folderId,
      duration,
      views: 'New',
      created_at: new Date().toISOString(),
    };

    memoryVideos.unshift(record);
    let supabaseSynced = false;

    const autoThumb = `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`;
    if (folderId) {
      const targetFolder = memoryFolders.find((f) => f.id === folderId);
      if (targetFolder && !targetFolder.thumbnail) {
        targetFolder.thumbnail = autoThumb;
      }
    }

    if (supabase) {
      try {
        const { error } = await supabase.from('videos').insert(record);
        if (error) {
          console.error('Supabase videos insert error:', error.message);
        } else {
          supabaseSynced = true;
          if (folderId) {
            const { data: fData } = await supabase
              .from('folders')
              .select('thumbnail')
              .eq('id', folderId)
              .maybeSingle();
            if (fData && !fData.thumbnail) {
              await supabase.from('folders').update({ thumbnail: autoThumb }).eq('id', folderId);
            }
          }
        }
      } catch (err) {
        console.error('Supabase videos insert failed:', err);
      }
    }

    await Promise.race([
      broadcastNewVideoNotification({
        title: `New ${record.category}: ${record.title}`,
        body: 'Tap to watch now on FilmDrama Box',
        icon: autoThumb,
        image: autoThumb,
        badge: '/pwa-192x192.png',
        url: `/?watch=${encodeURIComponent(record.id)}`,
        videoId: record.id,
        youtubeId: record.youtube_id,
        category: record.category,
        videoTitle: record.title,
      }),
      new Promise<void>((resolve) => setTimeout(resolve, 2500)),
    ]);

    res.json({ video: record, supabaseSynced });
  });

  // Persist detected real duration for videos missing a formatted time
  app.patch('/api/videos/:id/duration', async (req: Request, res: Response) => {
    const videoId = String(req.params.id || '').trim();
    const duration = sanitizeRealDuration(req.body?.duration);
    if (!videoId || !duration) {
      res.status(400).json({ error: 'Valid duration is required.' });
      return;
    }

    const memVideo = memoryVideos.find((v) => v.id === videoId);
    if (memVideo) {
      const existingValid = sanitizeRealDuration(memVideo.duration);
      if (!existingValid) {
        memVideo.duration = duration;
      }
    }

    if (supabase) {
      try {
        const { data } = await supabase
          .from('videos')
          .select('duration')
          .eq('id', videoId)
          .maybeSingle();
        if (data && !sanitizeRealDuration(data.duration)) {
          await supabase.from('videos').update({ duration }).eq('id', videoId);
        }
      } catch {
        // Ignore DB update error gracefully
      }
    }

    res.json({ ok: true, duration });
  });

  app.delete('/api/videos/:id', requireAdmin, async (req: Request, res: Response) => {
    const videoId = String(req.params.id || '').trim();
    const idx = memoryVideos.findIndex((v) => v.id === videoId);
    if (idx !== -1) memoryVideos.splice(idx, 1);

    if (supabase) {
      try {
        await supabase.from('videos').delete().eq('id', videoId);
      } catch (err) {
        console.error('Supabase video delete failed:', err);
      }
    }

    res.json({ ok: true });
  });

  // Layer (c): Internal Ad Router — Save live ad snippets (Admin only)
  app.put('/api/ads', requireAdmin, async (req: Request, res: Response) => {
    const topCode = String(req.body?.topCode || '');
    const feedCode = String(req.body?.feedCode || '');
    const bottomCode = String(req.body?.bottomCode || '');

    memoryAdConfig = {
      id: 'default',
      top_code: topCode,
      feed_code: feedCode,
      bottom_code: bottomCode,
      updated_at: new Date().toISOString(),
    };

    let supabaseSynced = false;
    if (supabase) {
      try {
        const { error } = await supabase.from('ad_config').upsert(memoryAdConfig);
        if (error) {
          console.error('Supabase ad_config upsert error:', error.message);
        } else {
          supabaseSynced = true;
        }
      } catch (err) {
        console.error('Supabase ad_config upsert failed:', err);
      }
    }

    res.json({
      supabaseSynced,
      adConfig: {
        topCode,
        feedCode,
        bottomCode,
      },
    });
  });

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const port = process.env.NODE_ENV === 'production' ? Number(process.env.PORT) || 3000 : 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`FilmDrama Box server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
