import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/rbac.js';
import { AppError } from '../middleware/error-handler.js';
import { validateUrl } from '../utils/url-validator.js';
import { parseM3u } from '../utils/m3u-parser.js';
import https from 'https';
import http from 'http';

export const m3uPlaylistRoutes: Router = Router();

m3uPlaylistRoutes.use(requireRole('admin'));

/** Fetch text content from an HTTP/HTTPS URL. */
function fetchText(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    lib.get(url, { timeout: 30000 }, (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error(`HTTP ${res.statusCode} fetching playlist`));
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      res.on('error', reject);
    }).on('error', reject).on('timeout', () => reject(new Error('Playlist fetch timed out')));
  });
}

// GET /servers/:configId/m3u-playlists — List playlists
m3uPlaylistRoutes.get('/', async (req: Request, res: Response, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const configId = parseInt(req.params.configId as string);
    const playlists = await prisma.m3uPlaylist.findMany({
      where: { serverConfigId: configId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, url: true, lastFetched: true, entryCount: true, createdAt: true },
    });
    res.json(playlists);
  } catch (err) { next(err); }
});

// POST /servers/:configId/m3u-playlists — Add a playlist and fetch it
m3uPlaylistRoutes.post('/', async (req: Request, res: Response, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const configId = parseInt(req.params.configId as string);
    const { name, url } = req.body;
    if (!name || !url) throw new AppError(400, 'name and url are required');

    const urlCheck = await validateUrl(url, { allowedProtocols: ['http:', 'https:'] });
    if (!urlCheck.valid) throw new AppError(400, `Invalid URL: ${urlCheck.error}`);

    const playlist = await prisma.m3uPlaylist.create({
      data: { name, url, serverConfigId: configId },
    });

    // Fetch and parse in background, respond immediately
    fetchAndStoreEntries(prisma, playlist.id, url).catch((err) => {
      console.error(`[M3uPlaylists] Background fetch failed for playlist ${playlist.id}: ${err.message}`);
    });

    res.status(201).json({ id: playlist.id, name: playlist.name, url: playlist.url, entryCount: 0 });
  } catch (err) { next(err); }
});

// POST /servers/:configId/m3u-playlists/:id/refresh — Re-fetch playlist
m3uPlaylistRoutes.post('/:id/refresh', async (req: Request, res: Response, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const id = parseInt(req.params.id as string);
    const playlist = await prisma.m3uPlaylist.findUnique({ where: { id } });
    if (!playlist) throw new AppError(404, 'Playlist not found');

    await fetchAndStoreEntries(prisma, id, playlist.url);
    const updated = await prisma.m3uPlaylist.findUnique({
      where: { id },
      select: { id: true, name: true, url: true, lastFetched: true, entryCount: true },
    });
    res.json(updated);
  } catch (err) { next(err); }
});

// DELETE /servers/:configId/m3u-playlists/:id — Delete playlist + entries
m3uPlaylistRoutes.delete('/:id', async (req: Request, res: Response, next) => {
  try {
    const prisma = req.app.locals.prisma;
    await prisma.m3uPlaylist.delete({ where: { id: parseInt(req.params.id as string) } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// GET /servers/:configId/m3u-playlists/:id/entries — Browse entries with optional group/search filter
m3uPlaylistRoutes.get('/:id/entries', async (req: Request, res: Response, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const id = parseInt(req.params.id as string);
    const { group, search, page = '1', limit = '50' } = req.query as Record<string, string>;
    const take = Math.min(parseInt(limit) || 50, 200);
    const skip = (Math.max(parseInt(page) || 1, 1) - 1) * take;

    const where: any = { playlistId: id };
    if (group) where.groupTitle = group;
    if (search) where.name = { contains: search, mode: 'insensitive' };

    const [entries, total] = await Promise.all([
      prisma.m3uEntry.findMany({
        where,
        orderBy: [{ groupTitle: 'asc' }, { position: 'asc' }],
        take,
        skip,
        select: { id: true, name: true, groupTitle: true, tvgLogo: true, url: true },
      }),
      prisma.m3uEntry.count({ where }),
    ]);

    res.json({ entries, total, page: parseInt(page) || 1, limit: take });
  } catch (err) { next(err); }
});

// GET /servers/:configId/m3u-playlists/:id/groups — List distinct groups
m3uPlaylistRoutes.get('/:id/groups', async (req: Request, res: Response, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const id = parseInt(req.params.id as string);
    const groups = await prisma.m3uEntry.findMany({
      where: { playlistId: id, groupTitle: { not: null } },
      distinct: ['groupTitle'],
      select: { groupTitle: true },
      orderBy: { groupTitle: 'asc' },
    });
    res.json(groups.map((g: any) => g.groupTitle).filter(Boolean));
  } catch (err) { next(err); }
});

// --- Helpers ---

async function fetchAndStoreEntries(prisma: any, playlistId: number, url: string): Promise<void> {
  const content = await fetchText(url);
  const parsed = parseM3u(content);

  // Replace all entries atomically
  await prisma.$transaction([
    prisma.m3uEntry.deleteMany({ where: { playlistId } }),
    prisma.m3uEntry.createMany({
      data: parsed.map((e, i) => ({
        playlistId,
        name: e.name,
        groupTitle: e.groupTitle ?? null,
        tvgLogo: e.tvgLogo ?? null,
        url: e.url,
        position: i,
      })),
    }),
    prisma.m3uPlaylist.update({
      where: { id: playlistId },
      data: { lastFetched: new Date(), entryCount: parsed.length },
    }),
  ]);
}
