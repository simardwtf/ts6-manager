import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/rbac.js';
import { AppError } from '../middleware/error-handler.js';
import type { VideoBotManager } from '../voice/video-bot-manager.js';

export const videoBotRoutes: Router = Router();

videoBotRoutes.use(requireRole('admin'));

// GET / — List all video bots
videoBotRoutes.get('/', async (req: Request, res: Response, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const manager: VideoBotManager = req.app.locals.videoBotManager;
    const dbBots = await prisma.videoBot.findMany({
      include: { serverConfig: { select: { id: true, name: true, host: true } } },
      orderBy: { id: 'asc' },
    });

    const runtimeInfo = manager.listBots();
    const runtimeMap = new Map(runtimeInfo.map((b: any) => [b.id, b]));

    res.json(dbBots.map((b: any) => {
      const runtime = runtimeMap.get(b.id);
      return {
        id: b.id,
        name: b.name,
        serverConfigId: b.serverConfigId,
        serverConfig: b.serverConfig,
        nickname: b.nickname,
        defaultChannel: b.defaultChannel,
        volume: b.volume,
        autoStart: b.autoStart,
        status: runtime?.status ?? 'stopped',
        nowPlaying: runtime?.nowPlaying ?? null,
        createdAt: b.createdAt,
      };
    }));
  } catch (err) { next(err); }
});

// GET /:id — Get bot details + runtime state
videoBotRoutes.get('/:id', async (req: Request, res: Response, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const manager: VideoBotManager = req.app.locals.videoBotManager;
    const id = parseInt(req.params.id as string);
    const dbBot = await prisma.videoBot.findUnique({
      where: { id },
      include: { serverConfig: { select: { id: true, name: true, host: true } } },
    });
    if (!dbBot) throw new AppError(404, 'Video bot not found');

    const bot = manager.getBot(id);
    res.json({
      ...dbBot,
      identityData: undefined,
      status: bot?.status ?? 'stopped',
      nowPlaying: bot?.nowPlaying ?? null,
      playbackProgress: bot?.playbackProgress ?? null,
    });
  } catch (err) { next(err); }
});

// POST / — Create bot
videoBotRoutes.post('/', async (req: Request, res: Response, next) => {
  try {
    const manager: VideoBotManager = req.app.locals.videoBotManager;
    const { name, serverConfigId, nickname, serverPassword, defaultChannel, channelPassword, volume, autoStart } = req.body;
    if (!name || !serverConfigId) throw new AppError(400, 'name and serverConfigId are required');

    const result = await manager.createBot({
      name,
      serverConfigId: parseInt(serverConfigId),
      nickname,
      serverPassword,
      defaultChannel,
      channelPassword,
      volume: volume != null ? parseInt(volume) : undefined,
      autoStart: autoStart ?? false,
    });

    res.status(201).json(result);
  } catch (err) { next(err); }
});

// PUT /:id — Update bot config
videoBotRoutes.put('/:id', async (req: Request, res: Response, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const manager: VideoBotManager = req.app.locals.videoBotManager;
    const id = parseInt(req.params.id as string);
    const { name, nickname, serverPassword, defaultChannel, channelPassword, volume, autoStart } = req.body;

    await prisma.videoBot.update({
      where: { id },
      data: {
        ...(name != null && { name }),
        ...(nickname != null && { nickname }),
        ...(serverPassword !== undefined && { serverPassword }),
        ...(defaultChannel !== undefined && { defaultChannel }),
        ...(channelPassword !== undefined && { channelPassword }),
        ...(volume != null && { volume: parseInt(volume) }),
        ...(autoStart != null && { autoStart }),
      },
    });

    const bot = manager.getBot(id);
    if (bot) {
      bot.updateConfig({
        ...(name != null && { name }),
        ...(nickname != null && { nickname }),
        ...(serverPassword !== undefined && { serverPassword: serverPassword || undefined }),
        ...(defaultChannel !== undefined && { defaultChannel: defaultChannel || undefined }),
        ...(channelPassword !== undefined && { channelPassword: channelPassword || undefined }),
        ...(volume != null && { volume: parseInt(volume) }),
      });
    }

    res.json({ success: true });
  } catch (err) { next(err); }
});

// DELETE /:id — Delete bot
videoBotRoutes.delete('/:id', async (req: Request, res: Response, next) => {
  try {
    const manager: VideoBotManager = req.app.locals.videoBotManager;
    const id = parseInt(req.params.id as string);
    await manager.removeBot(id);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /:id/start
videoBotRoutes.post('/:id/start', async (req: Request, res: Response, next) => {
  try {
    const manager: VideoBotManager = req.app.locals.videoBotManager;
    await manager.startBot(parseInt(req.params.id as string));
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /:id/stop
videoBotRoutes.post('/:id/stop', async (req: Request, res: Response, next) => {
  try {
    const manager: VideoBotManager = req.app.locals.videoBotManager;
    await manager.stopBot(parseInt(req.params.id as string));
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /:id/restart
videoBotRoutes.post('/:id/restart', async (req: Request, res: Response, next) => {
  try {
    const manager: VideoBotManager = req.app.locals.videoBotManager;
    const bot = manager.getBot(parseInt(req.params.id as string));
    if (!bot) throw new AppError(404, 'Video bot not found');
    await bot.restart();
    res.json({ success: true });
  } catch (err) { next(err); }
});

// === Playback Control ===

// POST /:id/play-stream — Stream an M3U entry
videoBotRoutes.post('/:id/play-stream', async (req: Request, res: Response, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const manager: VideoBotManager = req.app.locals.videoBotManager;
    const id = parseInt(req.params.id as string);
    const { entryId } = req.body;
    if (!entryId) throw new AppError(400, 'entryId is required');

    const bot = manager.getBot(id);
    if (!bot) throw new AppError(404, 'Video bot not found');
    if (bot.status !== 'connected' && bot.status !== 'playing' && bot.status !== 'paused') {
      throw new AppError(400, 'Bot is not connected');
    }

    const entry = await prisma.m3uEntry.findUnique({ where: { id: parseInt(entryId) } });
    if (!entry) throw new AppError(404, 'M3U entry not found');

    const queueItem = {
      id: `m3u_${entry.id}`,
      title: entry.name,
      artist: entry.groupTitle ?? 'IPTV',
      filePath: '',
      source: 'radio' as const,
      streamUrl: entry.url,
    };

    await bot.playStream(queueItem);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /:id/play-url — Stream a raw URL directly
videoBotRoutes.post('/:id/play-url', async (req: Request, res: Response, next) => {
  try {
    const manager: VideoBotManager = req.app.locals.videoBotManager;
    const id = parseInt(req.params.id as string);
    const { url, title, group } = req.body;
    if (!url) throw new AppError(400, 'url is required');

    const bot = manager.getBot(id);
    if (!bot) throw new AppError(404, 'Video bot not found');
    if (bot.status !== 'connected' && bot.status !== 'playing' && bot.status !== 'paused') {
      throw new AppError(400, 'Bot is not connected');
    }

    const queueItem = {
      id: `url_${Date.now()}`,
      title: title || url,
      artist: group || 'Stream',
      filePath: '',
      source: 'radio' as const,
      streamUrl: url,
    };

    await bot.playStream(queueItem);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /:id/stop-playback
videoBotRoutes.post('/:id/stop-playback', async (req: Request, res: Response, next) => {
  try {
    const manager: VideoBotManager = req.app.locals.videoBotManager;
    const bot = manager.getBot(parseInt(req.params.id as string));
    if (!bot) throw new AppError(404, 'Video bot not found');
    bot.stopAudio();
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /:id/volume
videoBotRoutes.post('/:id/volume', async (req: Request, res: Response, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const manager: VideoBotManager = req.app.locals.videoBotManager;
    const id = parseInt(req.params.id as string);
    const vol = Math.max(0, Math.min(100, parseInt(req.body.volume) || 50));

    const bot = manager.getBot(id);
    if (bot) bot.setVolume(vol);
    await prisma.videoBot.update({ where: { id }, data: { volume: vol } });

    res.json({ success: true, volume: vol });
  } catch (err) { next(err); }
});

// GET /:id/state
videoBotRoutes.get('/:id/state', async (req: Request, res: Response, next) => {
  try {
    const manager: VideoBotManager = req.app.locals.videoBotManager;
    const bot = manager.getBot(parseInt(req.params.id as string));
    if (!bot) throw new AppError(404, 'Video bot not found');

    const progress = bot.playbackProgress;
    res.json({
      status: bot.status,
      nowPlaying: bot.nowPlaying,
      position: progress?.position ?? 0,
      duration: progress?.duration ?? 0,
      volume: bot.currentConfig.volume,
      isStreaming: bot.isStreaming,
    });
  } catch (err) { next(err); }
});
