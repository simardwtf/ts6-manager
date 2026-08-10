import { AudioPipeline, FRAME_MS, BYTES_PER_FRAME } from './audio/pipeline.js';
import type { Ts3Client } from './tslib/client.js';

const DEFAULT_DELAY_MS = Number(process.env.STREAM_AUDIO_DELAY_MS) || 2000;
const MAX_DELAY_MS = 10000;

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
 *
 * The video path (sidecar → WebRTC → client jitter buffer) is inherently
 * delayed by a second or more, while this voice audio is near-instant, so the
 * audio is held back by a tunable `delayMs` to line the two up. The delay can
 * be adjusted live while streaming.
 */
export class StreamAudioPlayer {
  private pipeline = new AudioPipeline();
  private kill: (() => void) | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private chunks: Buffer[] = [];
  private chunksSize = 0;
  private epoch = 0;
  private _active = false;
  private delayMs = DEFAULT_DELAY_MS;
  private nextDue = 0;

  constructor(
    private client: Ts3Client,
    private getVolume: () => number,
  ) {}

  get active(): boolean {
    return this._active;
  }

  getDelay(): number {
    return this.delayMs;
  }

  /**
   * Adjust the audio delay (ms) live. Increasing holds audio back further;
   * decreasing drops buffered audio to catch up. Persists across source changes.
   */
  setDelay(ms: number): number {
    const clamped = Math.max(0, Math.min(MAX_DELAY_MS, Math.round(ms)));
    const deltaMs = clamped - this.delayMs;
    this.delayMs = clamped;

    if (this._active && deltaMs !== 0) {
      if (deltaMs > 0) {
        // Hold sending back by the extra delay.
        this.nextDue += deltaMs;
      } else {
        // Catch up by discarding that much buffered audio from the front.
        const dropBytes = Math.min(
          this.chunksSize,
          Math.round(-deltaMs / FRAME_MS) * BYTES_PER_FRAME,
        );
        this.dropFront(dropBytes);
      }
    }
    return this.delayMs;
  }

  /** Bytes of PCM we allow to buffer: the delay window plus a few seconds of slack. */
  private maxBufferBytes(): number {
    return Math.ceil((this.delayMs + 3000) / FRAME_MS) * BYTES_PER_FRAME;
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

    stream.stdout.on('data', (chunk: Buffer) => {
      if (myEpoch !== this.epoch) return;
      this.chunks.push(chunk);
      this.chunksSize += chunk.length;
      const cap = this.maxBufferBytes();
      while (this.chunksSize > cap && this.chunks.length > 1) {
        const dropped = this.chunks.shift()!;
        this.chunksSize -= dropped.length;
      }
    });

    stream.process.on('close', () => { if (myEpoch === this.epoch) this.stop(); });
    stream.process.on('error', () => { if (myEpoch === this.epoch) this.stop(); });

    // Clock-based 20ms pacing (mirrors the radio streaming loop). The first
    // frame is held until `delayMs` has elapsed so the buffer fills to the
    // target latency, delaying the audio to match the video.
    this.nextDue = performance.now() + this.delayMs;
    const tick = () => {
      if (myEpoch !== this.epoch) return;

      const now = performance.now();
      if (now < this.nextDue) {
        this.timer = setTimeout(tick, Math.max(1, this.nextDue - now));
        return;
      }

      const lagMs = now - this.nextDue;
      if (lagMs >= FRAME_MS) this.nextDue = now + FRAME_MS;

      const frame = this.takeFrame(BYTES_PER_FRAME);
      if (frame) {
        try {
          const opus = this.pipeline.encodeFrame(frame, this.getVolume());
          this.client.sendVoice(opus);
        } catch {}
      }

      this.nextDue += FRAME_MS;
      if (now - this.nextDue > 5 * FRAME_MS) this.nextDue = now + FRAME_MS;

      const delay = this.nextDue - performance.now();
      if (delay > 2) this.timer = setTimeout(tick, delay);
      else setImmediate(tick);
    };
    this.timer = setTimeout(tick, 50);
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

  private dropFront(bytes: number): void {
    let toDrop = bytes;
    while (toDrop > 0 && this.chunks.length > 0) {
      const head = this.chunks[0];
      if (head.length <= toDrop) {
        this.chunks.shift();
        this.chunksSize -= head.length;
        toDrop -= head.length;
      } else {
        this.chunks[0] = head.subarray(toDrop);
        this.chunksSize -= toDrop;
        toDrop = 0;
      }
    }
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
