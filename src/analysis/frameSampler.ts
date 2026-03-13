/**
 * FrameSampler: downsamples a video frame to analysis resolution.
 *
 * WHY a separate low-resolution analysis buffer:
 * - Full-res video (1280×720) = 921,600 pixels → expensive to process each frame
 * - 160×90 = 14,400 pixels → ~64× less work
 * - Quality is more than sufficient for brightness/motion/edge analysis
 * - Canvas 2D drawImage + getImageData is the standard, documented approach
 *
 * The sampler owns one OffscreenCanvas (or regular Canvas) for sampling.
 * It never renders to the visible DOM.
 */

import { logger } from '../utils/logger';

export const DEFAULT_ANALYSIS_WIDTH = 160;
export const DEFAULT_ANALYSIS_HEIGHT = 90;

export interface SamplerConfig {
  width: number;
  height: number;
  mirror: boolean;
}

export class FrameSampler {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private config: SamplerConfig;

  // Reused ImageData to avoid allocation every frame (GC spike prevention).
  // IMPORTANT: This is performance-critical — allocating ImageData each frame
  // would cause measurable GC pauses at 60fps.
  private imageDataBuffer: ImageData | null = null;

  constructor(config: Partial<SamplerConfig> = {}) {
    this.config = {
      width: config.width ?? DEFAULT_ANALYSIS_WIDTH,
      height: config.height ?? DEFAULT_ANALYSIS_HEIGHT,
      mirror: config.mirror ?? false,
    };

    this.canvas = document.createElement('canvas');
    this.canvas.width = this.config.width;
    this.canvas.height = this.config.height;

    const ctx = this.canvas.getContext('2d', {
      // willReadFrequently: true tells the browser this canvas will be read back often,
      // allowing it to use a CPU-friendly memory layout instead of GPU-accelerated.
      // Reference: https://html.spec.whatwg.org/multipage/canvas.html#concept-canvas-will-read-frequently
      willReadFrequently: true,
    });

    if (!ctx) {
      throw new Error('FrameSampler: Could not acquire 2D context');
    }
    this.ctx = ctx;

    logger.info('FrameSampler', `Initialized at ${this.config.width}×${this.config.height}`);
  }

  /**
   * Sample the current video frame into the analysis buffer.
   * Returns the raw RGBA ImageData at analysis resolution.
   *
   * IMPORTANT: Returns the same ImageData object each call (buffer reuse).
   * Callers must not hold references across frames — copy data if needed.
   */
  /**
   * Sample the current source frame.
   * Accepts HTMLVideoElement or HTMLImageElement.
   */
  sample(source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement): ImageData | null {
    // Guard: source must have a drawable frame.
    if (source instanceof HTMLCanvasElement) {
      if (source.width === 0 || source.height === 0) return null;
    } else if ('videoWidth' in source) {
      const v = source;
      if (v.readyState < 2 || v.videoWidth === 0) return null;
    } else {
      const img = source;
      if (!img.complete || img.naturalWidth === 0) return null;
    }

    const ctx = this.ctx;
    const { width, height } = this.config;

    if (this.config.mirror) {
      ctx.save();
      ctx.scale(-1, 1);
      ctx.drawImage(source, -width, 0, width, height);
      ctx.restore();
    } else {
      ctx.drawImage(source, 0, 0, width, height);
    }

    // Reuse the ImageData buffer
    if (!this.imageDataBuffer) {
      this.imageDataBuffer = ctx.getImageData(0, 0, width, height);
    } else {
      const data = ctx.getImageData(0, 0, width, height);
      this.imageDataBuffer = data;
    }

    return this.imageDataBuffer;
  }

  updateConfig(partial: Partial<SamplerConfig>): void {
    const changed =
      (partial.width !== undefined && partial.width !== this.config.width) ||
      (partial.height !== undefined && partial.height !== this.config.height);

    Object.assign(this.config, partial);

    if (changed) {
      this.canvas.width = this.config.width;
      this.canvas.height = this.config.height;
      this.imageDataBuffer = null; // Invalidate buffer — size changed
      logger.info('FrameSampler', `Resized to ${this.config.width}×${this.config.height}`);
    }
  }

  /** Expose the analysis canvas for the debug overlay. */
  get debugCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  get width(): number { return this.config.width; }
  get height(): number { return this.config.height; }
}
