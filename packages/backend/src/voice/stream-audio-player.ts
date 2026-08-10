import { AudioPipeline, FRAME_MS, BYTES_PER_FRAME } from './audio/pipeline.js';
import type { Ts3Client } from './tslib/client.js';

/**
 * Streams the AUDIO of any ffmpeg-readable URL (IPTV/HLS, YouTube direct URL,
 * etc.) straight into the bot's TeamSpeak voice channel as Opus voice packets —
 * the same proven path the music/radio player uses.
 *
 * This runs independently of the music queue and in parallel with the WebRTC
 * video sidecar. The TS6 screen-share receiver does not reliably render the
 * stream's own audio track for viewers, so we deliver the sound through the
 * normal voice channel instead: everyone in the bot's channel hears it while
 * they watch the shared video.
 */
export class StreamAudioPlayer {
  private pipeline = new AudioPipeline();
  private kill: (() => void) | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private chunks: Buffer[] = [];
  private chunksSize = 0;
  private epoch = 0;
  private _active = false;

  constructor(
    private client: Ts3Client,
    private getVolume: () => number,
  ) {}

  get active(): boolean {
    return this._active;
  }

  /** Start streaming a URL's audio into the voice channel. Replaces any active stream. */
  async start(url: string): Promise<void> {
    this.stop();
    const myEpoch = ++this.epoch;
    this._active = true;

    let stream: Awaited<ReturnType<AudioPipeline['toPcmStream']>>;
    try {
      stream = await this.pipeline.toPcmStream(url);
    } catch (err) {
      this._active = false;
      throw err;
    }

    // Superseded while awaiting ffmpeg spawn.
    if (myEpoch !== this.epoch) {
      try { stream.kill(); } catch {}
      return;
    }

    this.kill = stream.kill;
    this.chunks = [];
    this.chunksSize = 0;

    const MAX_BUFFER = BYTES_PER_FRAME * 250; // ~5s ceiling to bound memory
    stream.stdout.on('data', (chunk: Buffer) => {
      if (myEpoch !== this.epoch) return;
      this.chunks.push(chunk);
      this.chunksSize += chunk.length;
      while (this.chunksSize > MAX_BUFFER && this.chunks.length > 1) {
        const dropped = this.chunks.shift()!;
        this.chunksSize -= dropped.length;
      }
    });

    stream.process.on('close', () => { if (myEpoch === this.epoch) this.stop(); });
    stream.process.on('error', () => { if (myEpoch === this.epoch) this.stop(); });

    // Clock-based 20ms pacing (mirrors the radio streaming loop).
    let nextDue = performance.now() + 200; // initial buffer delay
    const tick = () => {
      if (myEpoch !== this.epoch) return;

      const now = performance.now();
      if (now < nextDue) {
        this.timer = setTimeout(tick, Math.max(1, nextDue - now));
        return;
      }

      const lagMs = now - nextDue;
      if (lagMs >= FRAME_MS) nextDue = now + FRAME_MS;

      const frame = this.takeFrame(BYTES_PER_FRAME);
      if (frame) {
        try {
          const opus = this.pipeline.encodeFrame(frame, this.getVolume());
          this.client.sendVoice(opus);
        } catch {}
      }

      nextDue += FRAME_MS;
      if (now - nextDue > 5 * FRAME_MS) nextDue = now + FRAME_MS;

      const delay = nextDue - performance.now();
      if (delay > 2) this.timer = setTimeout(tick, delay);
      else setImmediate(tick);
    };
    this.timer = setTimeout(tick, 200);
  }

  /** Stop streaming and go silent. */
  stop(): void {
    this.epoch++;
    this._active = false;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (this.kill) { try { this.kill(); } catch {} this.kill = null; }
    this.chunks = [];
    this.chunksSize = 0;
    try { this.client.sendVoiceStop(); } catch {}
  }

  private takeFrame(n: number): Buffer | null {
    if (this.chunksSize < n) return null;
    const out = Buffer.allocUnsafe(n);
    let offset = 0;
    while (offset < n) {
      const head = this.chunks[0];
      const need = n - offset;
      if (head.length <= need) {
        head.copy(out, offset);
        offset += head.length;
        this.chunks.shift();
      } else {
        head.copy(out, offset, 0, need);
        this.chunks[0] = head.subarray(need);
        offset += need;
      }
    }
    this.chunksSize -= n;
    return out;
  }
}
