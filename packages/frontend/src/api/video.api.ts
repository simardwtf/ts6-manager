import api from './client';

// === Video Bot API ===

export const videoBotsApi = {
  list: () => api.get('/video-bots').then((r) => r.data),
  get: (id: number) => api.get(`/video-bots/${id}`).then((r) => r.data),
  create: (data: any) => api.post('/video-bots', data).then((r) => r.data),
  update: (id: number, data: any) => api.put(`/video-bots/${id}`, data).then((r) => r.data),
  delete: (id: number) => api.delete(`/video-bots/${id}`),
  start: (id: number) => api.post(`/video-bots/${id}/start`).then((r) => r.data),
  stop: (id: number) => api.post(`/video-bots/${id}/stop`).then((r) => r.data),
  restart: (id: number) => api.post(`/video-bots/${id}/restart`).then((r) => r.data),
  state: (id: number) => api.get(`/video-bots/${id}/state`).then((r) => r.data),

  // Playback
  playStream: (id: number, entryId: number) =>
    api.post(`/video-bots/${id}/play-stream`, { entryId }).then((r) => r.data),
  playUrl: (id: number, url: string, title?: string, group?: string) =>
    api.post(`/video-bots/${id}/play-url`, { url, title, group }).then((r) => r.data),
  stopPlayback: (id: number) => api.post(`/video-bots/${id}/stop-playback`).then((r) => r.data),
  volume: (id: number, volume: number) =>
    api.post(`/video-bots/${id}/volume`, { volume }).then((r) => r.data),
};

// === M3U Playlist API ===

export const m3uPlaylistsApi = {
  list: (configId: number) =>
    api.get(`/servers/${configId}/m3u-playlists`).then((r) => r.data),
  create: (configId: number, data: { name: string; url: string }) =>
    api.post(`/servers/${configId}/m3u-playlists`, data).then((r) => r.data),
  delete: (configId: number, id: number) =>
    api.delete(`/servers/${configId}/m3u-playlists/${id}`).then((r) => r.data),
  refresh: (configId: number, id: number) =>
    api.post(`/servers/${configId}/m3u-playlists/${id}/refresh`).then((r) => r.data),
  entries: (configId: number, id: number, params: { group?: string; search?: string; page?: number; limit?: number }) =>
    api.get(`/servers/${configId}/m3u-playlists/${id}/entries`, { params }).then((r) => r.data),
  groups: (configId: number, id: number) =>
    api.get(`/servers/${configId}/m3u-playlists/${id}/groups`).then((r) => r.data),
};
