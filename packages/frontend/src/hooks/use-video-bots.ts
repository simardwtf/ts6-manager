import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { videoBotsApi, m3uPlaylistsApi } from '../api/video.api';

// === Video Bots ===

export function useVideoBots() {
  return useQuery({ queryKey: ['video-bots'], queryFn: videoBotsApi.list });
}

export function useCreateVideoBot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => videoBotsApi.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['video-bots'] }),
  });
}

export function useUpdateVideoBot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => videoBotsApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['video-bots'] }),
  });
}

export function useDeleteVideoBot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => videoBotsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['video-bots'] }),
  });
}

export function useStartVideoBot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => videoBotsApi.start(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['video-bots'] }),
  });
}

export function useStopVideoBot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => videoBotsApi.stop(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['video-bots'] }),
  });
}

export function useVideoBotState(id: number | null) {
  return useQuery({
    queryKey: ['video-bot-state', id],
    queryFn: () => videoBotsApi.state(id!),
    enabled: !!id,
    refetchInterval: 2000,
  });
}

export function usePlayStream() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ botId, entryId }: { botId: number; entryId: number }) =>
      videoBotsApi.playStream(botId, entryId),
    onSuccess: (_, { botId }) => qc.invalidateQueries({ queryKey: ['video-bot-state', botId] }),
  });
}

export function usePlayUrl() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ botId, url, title, group }: { botId: number; url: string; title?: string; group?: string }) =>
      videoBotsApi.playUrl(botId, url, title, group),
    onSuccess: (_, { botId }) => qc.invalidateQueries({ queryKey: ['video-bot-state', botId] }),
  });
}

export function useStopVideoPlayback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (botId: number) => videoBotsApi.stopPlayback(botId),
    onSuccess: (_, botId) => qc.invalidateQueries({ queryKey: ['video-bot-state', botId] }),
  });
}

export function useSetVideoVolume() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ botId, volume }: { botId: number; volume: number }) =>
      videoBotsApi.volume(botId, volume),
    onSuccess: (_, { botId }) => qc.invalidateQueries({ queryKey: ['video-bot-state', botId] }),
  });
}

// === M3U Playlists ===

export function useM3uPlaylists(configId: number | null) {
  return useQuery({
    queryKey: ['m3u-playlists', configId],
    queryFn: () => m3uPlaylistsApi.list(configId!),
    enabled: !!configId,
  });
}

export function useCreateM3uPlaylist(configId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; url: string }) => m3uPlaylistsApi.create(configId!, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['m3u-playlists', configId] }),
  });
}

export function useDeleteM3uPlaylist(configId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => m3uPlaylistsApi.delete(configId!, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['m3u-playlists', configId] }),
  });
}

export function useRefreshM3uPlaylist(configId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => m3uPlaylistsApi.refresh(configId!, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['m3u-playlists', configId] }),
  });
}

export function useM3uEntries(configId: number | null, playlistId: number | null, params: { group?: string; search?: string; page?: number }) {
  return useQuery({
    queryKey: ['m3u-entries', configId, playlistId, params],
    queryFn: () => m3uPlaylistsApi.entries(configId!, playlistId!, params),
    enabled: !!configId && !!playlistId,
  });
}

export function useM3uGroups(configId: number | null, playlistId: number | null) {
  return useQuery({
    queryKey: ['m3u-groups', configId, playlistId],
    queryFn: () => m3uPlaylistsApi.groups(configId!, playlistId!),
    enabled: !!configId && !!playlistId,
  });
}
