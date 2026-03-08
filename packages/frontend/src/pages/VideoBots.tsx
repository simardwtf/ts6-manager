import { useState, useCallback } from 'react';
import {
  useVideoBots, useCreateVideoBot, useUpdateVideoBot, useDeleteVideoBot,
  useStartVideoBot, useStopVideoBot, useVideoBotState,
  usePlayStream, usePlayUrl, useStopVideoPlayback, useSetVideoVolume,
  useM3uPlaylists, useCreateM3uPlaylist, useDeleteM3uPlaylist, useRefreshM3uPlaylist,
  useM3uEntries, useM3uGroups,
} from '@/hooks/use-video-bots';
import { useServers } from '@/hooks/use-servers';
import { useServerStore } from '@/stores/server.store';
import { PageLoader } from '@/components/shared/LoadingSpinner';
import { EmptyState } from '@/components/shared/EmptyState';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Plus, Trash2, Play, Square, RefreshCw, Volume2, Tv2,
  List, Search, ChevronLeft, ChevronRight, Loader2, RotateCw,
  Radio, Link,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface VideoBot {
  id: number;
  name: string;
  serverConfigId: number;
  serverConfig?: { id: number; name: string; host: string };
  nickname: string;
  defaultChannel?: string;
  volume: number;
  autoStart: boolean;
  status: string;
  nowPlaying?: { title: string; artist?: string } | null;
}

interface M3uPlaylist {
  id: number;
  name: string;
  url: string;
  lastFetched?: string | null;
  entryCount: number;
  createdAt: string;
}

interface M3uEntry {
  id: number;
  name: string;
  groupTitle?: string | null;
  tvgLogo?: string | null;
  url: string;
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    playing: 'bg-green-500/20 text-green-400 border-green-500/30',
    connected: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    starting: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    paused: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    stopped: 'bg-muted text-muted-foreground border-border',
    error: 'bg-red-500/20 text-red-400 border-red-500/30',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${map[status] ?? map.stopped}`}>
      {status}
    </span>
  );
}

// ─── Bot Card ─────────────────────────────────────────────────────────────────

function BotCard({
  bot,
  onSelect,
  selected,
  onStart,
  onStop,
  onDelete,
}: {
  bot: VideoBot;
  onSelect: () => void;
  selected: boolean;
  onStart: () => void;
  onStop: () => void;
  onDelete: () => void;
}) {
  const isRunning = bot.status !== 'stopped' && bot.status !== 'error';

  return (
    <Card
      className={`cursor-pointer transition-all hover:border-primary/50 ${selected ? 'border-primary ring-1 ring-primary' : ''}`}
      onClick={onSelect}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Tv2 className="h-4 w-4 shrink-0 text-primary" />
            <CardTitle className="text-sm truncate">{bot.name}</CardTitle>
          </div>
          <StatusBadge status={bot.status} />
        </div>
        <p className="text-xs text-muted-foreground truncate">{bot.serverConfig?.name ?? `Server ${bot.serverConfigId}`}</p>
      </CardHeader>
      <CardContent>
        {bot.nowPlaying && (
          <p className="text-xs text-muted-foreground mb-2 truncate">
            <span className="text-green-400">▶</span> {bot.nowPlaying.title}
            {bot.nowPlaying.artist && <span className="opacity-60"> · {bot.nowPlaying.artist}</span>}
          </p>
        )}
        <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
          {isRunning ? (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onStop}>
              <Square className="h-3 w-3 mr-1" /> Stop
            </Button>
          ) : (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onStart}>
              <Play className="h-3 w-3 mr-1" /> Start
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={onDelete}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Playback Panel ───────────────────────────────────────────────────────────

function PlaybackPanel({ bot }: { bot: VideoBot }) {
  const { data: state } = useVideoBotState(bot.id);
  const stopPlayback = useStopVideoPlayback();
  const setVolume = useSetVideoVolume();
  const playUrl = usePlayUrl();
  const [customUrl, setCustomUrl] = useState('');
  const [customTitle, setCustomTitle] = useState('');

  const vol = state?.volume ?? bot.volume;

  const handlePlayUrl = () => {
    if (!customUrl.trim()) return;
    playUrl.mutate({ botId: bot.id, url: customUrl.trim(), title: customTitle.trim() || undefined });
    setCustomUrl('');
    setCustomTitle('');
  };

  return (
    <div className="space-y-4">
      {/* Now Playing */}
      <div className="rounded-lg border bg-card p-4">
        <p className="text-xs font-medium text-muted-foreground mb-1">NOW PLAYING</p>
        {state?.nowPlaying ? (
          <div>
            <p className="font-semibold truncate">{state.nowPlaying.title}</p>
            {state.nowPlaying.artist && (
              <p className="text-sm text-muted-foreground">{state.nowPlaying.artist}</p>
            )}
            <div className="flex items-center gap-2 mt-2">
              <StatusBadge status={state.status} />
              {state.isStreaming && <Badge variant="outline" className="text-xs">LIVE</Badge>}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">Nothing streaming</p>
        )}
        {state?.nowPlaying && (
          <Button
            size="sm"
            variant="outline"
            className="mt-3 h-7 text-xs"
            onClick={() => stopPlayback.mutate(bot.id)}
          >
            <Square className="h-3 w-3 mr-1" /> Stop Stream
          </Button>
        )}
      </div>

      {/* Volume */}
      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Volume2 className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Volume</span>
          <span className="ml-auto text-sm text-muted-foreground">{vol}%</span>
        </div>
        <Slider
          min={0} max={100} step={1}
          value={[vol]}
          onValueChange={([v]) => setVolume.mutate({ botId: bot.id, volume: v })}
          className="w-full"
        />
      </div>

      {/* Quick Play URL */}
      <div className="rounded-lg border bg-card p-4 space-y-2">
        <div className="flex items-center gap-2 mb-1">
          <Link className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Stream a URL directly</span>
        </div>
        <Input
          placeholder="https://... (M3U8, MP4, stream URL)"
          value={customUrl}
          onChange={(e) => setCustomUrl(e.target.value)}
          className="text-sm h-8"
        />
        <Input
          placeholder="Title (optional)"
          value={customTitle}
          onChange={(e) => setCustomTitle(e.target.value)}
          className="text-sm h-8"
        />
        <Button
          size="sm"
          className="w-full h-8 text-xs"
          onClick={handlePlayUrl}
          disabled={!customUrl.trim() || playUrl.isPending}
        >
          {playUrl.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Play className="h-3 w-3 mr-1" />}
          Stream
        </Button>
      </div>
    </div>
  );
}

// ─── M3U Browser Panel ────────────────────────────────────────────────────────

function M3uBrowserPanel({
  configId,
  bot,
}: {
  configId: number;
  bot: VideoBot | null;
}) {
  const [selectedPlaylist, setSelectedPlaylist] = useState<M3uPlaylist | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<string>('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showAddPlaylist, setShowAddPlaylist] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [newPlaylistUrl, setNewPlaylistUrl] = useState('');
  const [deletePlaylistId, setDeletePlaylistId] = useState<number | null>(null);

  const { data: playlists = [], isLoading: loadingPlaylists } = useM3uPlaylists(configId);
  const { data: groups = [] } = useM3uGroups(configId, selectedPlaylist?.id ?? null);
  const { data: entriesData, isLoading: loadingEntries } = useM3uEntries(
    configId,
    selectedPlaylist?.id ?? null,
    { group: selectedGroup || undefined, search: search || undefined, page }
  );

  const createPlaylist = useCreateM3uPlaylist(configId);
  const deletePlaylist = useDeleteM3uPlaylist(configId);
  const refreshPlaylist = useRefreshM3uPlaylist(configId);
  const playStream = usePlayStream();

  const entries: M3uEntry[] = entriesData?.entries ?? [];
  const totalEntries: number = entriesData?.total ?? 0;
  const totalPages = Math.ceil(totalEntries / (entriesData?.limit ?? 50));

  const handleAddPlaylist = async () => {
    if (!newPlaylistName.trim() || !newPlaylistUrl.trim()) return;
    await createPlaylist.mutateAsync({ name: newPlaylistName.trim(), url: newPlaylistUrl.trim() });
    setNewPlaylistName('');
    setNewPlaylistUrl('');
    setShowAddPlaylist(false);
  };

  const handleSelectGroup = (g: string) => {
    setSelectedGroup(g === '__all__' ? '' : g);
    setPage(1);
  };

  const handleSearch = useCallback((val: string) => {
    setSearch(val);
    setPage(1);
  }, []);

  return (
    <div className="flex gap-4 h-full min-h-0">
      {/* Playlist list */}
      <div className="w-56 shrink-0 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">Playlists</span>
          <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => setShowAddPlaylist(true)}>
            <Plus className="h-3 w-3" />
          </Button>
        </div>
        {loadingPlaylists ? (
          <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin" /></div>
        ) : playlists.length === 0 ? (
          <p className="text-xs text-muted-foreground">No playlists yet.</p>
        ) : (
          <ScrollArea className="h-[420px]">
            <div className="space-y-1 pr-2">
              {playlists.map((pl: M3uPlaylist) => (
                <div
                  key={pl.id}
                  className={`rounded-md px-2 py-1.5 cursor-pointer text-xs transition-colors group flex items-center justify-between gap-1 ${selectedPlaylist?.id === pl.id ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'}`}
                  onClick={() => { setSelectedPlaylist(pl); setSelectedGroup(''); setSearch(''); setPage(1); }}
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate">{pl.name}</p>
                    <p className="text-muted-foreground">{pl.entryCount} entries</p>
                  </div>
                  <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <Button
                      size="sm" variant="ghost" className="h-5 w-5 p-0"
                      onClick={() => refreshPlaylist.mutate(pl.id)}
                      disabled={refreshPlaylist.isPending}
                    >
                      <RotateCw className="h-2.5 w-2.5" />
                    </Button>
                    <Button
                      size="sm" variant="ghost" className="h-5 w-5 p-0 text-destructive"
                      onClick={() => setDeletePlaylistId(pl.id)}
                    >
                      <Trash2 className="h-2.5 w-2.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>

      <Separator orientation="vertical" />

      {/* Entry browser */}
      <div className="flex-1 min-w-0 flex flex-col gap-3">
        {selectedPlaylist ? (
          <>
            {/* Filter bar */}
            <div className="flex items-center gap-2">
              <Select value={selectedGroup || '__all__'} onValueChange={handleSelectGroup}>
                <SelectTrigger className="w-40 h-8 text-xs">
                  <SelectValue placeholder="All groups" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All groups</SelectItem>
                  {groups.map((g: string) => (
                    <SelectItem key={g} value={g}>{g}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                <Input
                  className="h-8 text-xs pl-7"
                  placeholder="Search channels..."
                  value={search}
                  onChange={(e) => handleSearch(e.target.value)}
                />
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap">{totalEntries} results</span>
            </div>

            {/* Entry list */}
            {loadingEntries ? (
              <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
            ) : entries.length === 0 ? (
              <p className="text-sm text-muted-foreground italic text-center py-8">No entries found.</p>
            ) : (
              <ScrollArea className="flex-1 min-h-0 max-h-[340px]">
                <div className="space-y-0.5 pr-2">
                  {entries.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent/50 group text-sm"
                    >
                      {entry.tvgLogo ? (
                        <img src={entry.tvgLogo} alt="" className="h-5 w-8 object-contain rounded shrink-0 bg-muted" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      ) : (
                        <Radio className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">{entry.name}</p>
                        {entry.groupTitle && <p className="text-xs text-muted-foreground truncate">{entry.groupTitle}</p>}
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-xs opacity-0 group-hover:opacity-100 shrink-0"
                        disabled={!bot || (bot.status !== 'connected' && bot.status !== 'playing') || playStream.isPending}
                        onClick={() => bot && playStream.mutate({ botId: bot.id, entryId: entry.id })}
                      >
                        <Play className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-1">
                <Button
                  size="sm" variant="outline" className="h-7 px-2"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft className="h-3 w-3" />
                </Button>
                <span className="text-xs text-muted-foreground">Page {page} / {totalPages}</span>
                <Button
                  size="sm" variant="outline" className="h-7 px-2"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="h-3 w-3" />
                </Button>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-muted-foreground">Select a playlist to browse its channels.</p>
          </div>
        )}
      </div>

      {/* Add playlist dialog */}
      <Dialog open={showAddPlaylist} onOpenChange={setShowAddPlaylist}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add M3U Playlist</DialogTitle>
            <DialogDescription>Provide a name and the URL of an M3U or M3U8 playlist file.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Name</Label>
              <Input
                className="mt-1 h-8 text-sm"
                placeholder="My IPTV Playlist"
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">M3U / M3U8 URL</Label>
              <Input
                className="mt-1 h-8 text-sm"
                placeholder="http://provider.com/list.m3u"
                value={newPlaylistUrl}
                onChange={(e) => setNewPlaylistUrl(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowAddPlaylist(false)}>Cancel</Button>
            <Button
              size="sm"
              onClick={handleAddPlaylist}
              disabled={!newPlaylistName.trim() || !newPlaylistUrl.trim() || createPlaylist.isPending}
            >
              {createPlaylist.isPending && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
              Add & Fetch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete playlist confirm */}
      <ConfirmDialog
        open={deletePlaylistId !== null}
        title="Delete Playlist"
        description="This will permanently remove the playlist and all its entries."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => { if (deletePlaylistId != null) deletePlaylist.mutate(deletePlaylistId); setDeletePlaylistId(null); }}
        onCancel={() => setDeletePlaylistId(null)}
      />
    </div>
  );
}

// ─── Create Bot Dialog ────────────────────────────────────────────────────────

function CreateBotDialog({
  open,
  onOpenChange,
  servers,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  servers: any[];
}) {
  const createBot = useCreateVideoBot();
  const [form, setForm] = useState({
    name: '',
    serverConfigId: '',
    nickname: 'VideoBot',
    defaultChannel: '',
    serverPassword: '',
    channelPassword: '',
    volume: 50,
    autoStart: false,
  });

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const handleCreate = async () => {
    if (!form.name || !form.serverConfigId) return;
    await createBot.mutateAsync({
      name: form.name,
      serverConfigId: parseInt(form.serverConfigId),
      nickname: form.nickname || 'VideoBot',
      defaultChannel: form.defaultChannel || undefined,
      serverPassword: form.serverPassword || undefined,
      channelPassword: form.channelPassword || undefined,
      volume: form.volume,
      autoStart: form.autoStart,
    });
    onOpenChange(false);
    setForm({ name: '', serverConfigId: '', nickname: 'VideoBot', defaultChannel: '', serverPassword: '', channelPassword: '', volume: 50, autoStart: false });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Create Video Bot</DialogTitle>
          <DialogDescription>A video bot connects to your TeamSpeak server and streams IPTV/M3U content as audio.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Bot Name</Label>
            <Input className="mt-1 h-8 text-sm" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="My Video Bot" />
          </div>
          <div>
            <Label className="text-xs">Server</Label>
            <Select value={form.serverConfigId} onValueChange={(v) => set('serverConfigId', v)}>
              <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue placeholder="Select server…" /></SelectTrigger>
              <SelectContent>
                {servers.map((s: any) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Nickname</Label>
            <Input className="mt-1 h-8 text-sm" value={form.nickname} onChange={(e) => set('nickname', e.target.value)} placeholder="VideoBot" />
          </div>
          <div>
            <Label className="text-xs">Default Channel (name or ID)</Label>
            <Input className="mt-1 h-8 text-sm" value={form.defaultChannel} onChange={(e) => set('defaultChannel', e.target.value)} placeholder="Movies" />
          </div>
          <div>
            <Label className="text-xs">Server Password</Label>
            <Input type="password" className="mt-1 h-8 text-sm" value={form.serverPassword} onChange={(e) => set('serverPassword', e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Channel Password</Label>
            <Input type="password" className="mt-1 h-8 text-sm" value={form.channelPassword} onChange={(e) => set('channelPassword', e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Default Volume: {form.volume}%</Label>
            <Slider min={0} max={100} step={1} value={[form.volume]} onValueChange={([v]) => set('volume', v)} className="mt-2" />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={form.autoStart} onCheckedChange={(v) => set('autoStart', v)} id="autostart-video" />
            <Label htmlFor="autostart-video" className="text-xs cursor-pointer">Auto-start on server launch</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" onClick={handleCreate} disabled={!form.name || !form.serverConfigId || createBot.isPending}>
            {createBot.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function VideoBots() {
  const { data: bots = [], isLoading } = useVideoBots();
  const { data: servers = [] } = useServers();
  const selectedConfigId = useServerStore((s) => s.selectedConfigId);

  const startBot = useStartVideoBot();
  const stopBot = useStopVideoBot();
  const deleteBot = useDeleteVideoBot();

  const [selectedBotId, setSelectedBotId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteBotId, setDeleteBotId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState('playback');

  const selectedBot: VideoBot | null = bots.find((b: VideoBot) => b.id === selectedBotId) ?? null;

  if (isLoading) return <PageLoader />;

  return (
    <div className="flex flex-col gap-6 h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Tv2 className="h-6 w-6 text-primary" />
            Video Bots
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Stream TV shows and movies from M3U/M3U8 playlists via TS6
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" /> New Video Bot
        </Button>
      </div>

      {bots.length === 0 ? (
        <EmptyState
          title="No video bots yet"
          description="Create a video bot to start streaming IPTV channels, TV shows and movies into your TeamSpeak server."
          action={{ label: 'Create Video Bot', onClick: () => setCreateOpen(true) }}
        />
      ) : (
        <div className="flex gap-6 flex-1 min-h-0">
          {/* Bot list */}
          <div className="w-64 shrink-0 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">Bots</p>
            <ScrollArea className="h-[calc(100vh-220px)]">
              <div className="space-y-2 pr-1">
                {bots.map((bot: VideoBot) => (
                  <BotCard
                    key={bot.id}
                    bot={bot}
                    selected={bot.id === selectedBotId}
                    onSelect={() => setSelectedBotId(bot.id)}
                    onStart={() => startBot.mutate(bot.id)}
                    onStop={() => stopBot.mutate(bot.id)}
                    onDelete={() => setDeleteBotId(bot.id)}
                  />
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Detail panel */}
          {selectedBot ? (
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-4">
                <Tv2 className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold">{selectedBot.name}</h2>
                <StatusBadge status={selectedBot.status} />
                {selectedBot.status === 'stopped' || selectedBot.status === 'error' ? (
                  <Button size="sm" variant="outline" className="h-7 ml-auto" onClick={() => startBot.mutate(selectedBot.id)}>
                    <Play className="h-3 w-3 mr-1" /> Start
                  </Button>
                ) : (
                  <div className="flex gap-2 ml-auto">
                    <Button size="sm" variant="outline" className="h-7" onClick={() => stopBot.mutate(selectedBot.id)}>
                      <Square className="h-3 w-3 mr-1" /> Stop
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7">
                      <RefreshCw className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>

              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="mb-4">
                  <TabsTrigger value="playback" className="gap-1.5 text-xs">
                    <Radio className="h-3 w-3" /> Playback
                  </TabsTrigger>
                  <TabsTrigger value="browser" className="gap-1.5 text-xs">
                    <List className="h-3 w-3" /> M3U Browser
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="playback">
                  <PlaybackPanel bot={selectedBot} />
                </TabsContent>

                <TabsContent value="browser" className="flex-1">
                  <M3uBrowserPanel
                    configId={selectedBot.serverConfigId}
                    bot={selectedBot.status === 'connected' || selectedBot.status === 'playing' ? selectedBot : null}
                  />
                </TabsContent>
              </Tabs>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-sm text-muted-foreground">Select a bot to control it.</p>
            </div>
          )}
        </div>
      )}

      {/* Dialogs */}
      <CreateBotDialog open={createOpen} onOpenChange={setCreateOpen} servers={servers} />

      <ConfirmDialog
        open={deleteBotId !== null}
        title="Delete Video Bot"
        description="This will permanently remove the video bot."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => { if (deleteBotId != null) deleteBot.mutate(deleteBotId); setDeleteBotId(null); if (selectedBotId === deleteBotId) setSelectedBotId(null); }}
        onCancel={() => setDeleteBotId(null)}
      />
    </div>
  );
}
