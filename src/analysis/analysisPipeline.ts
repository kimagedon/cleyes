/**
 * AnalysisPipeline: orchestrates all CPU-side image analysis in the correct order.
 *
 * Frame processing order (all on CPU, O(pixelCount) each):
 * 1. FrameSampler → downsampled ImageData
 * 2. Luminance → Uint8Array [0, 255]
 * 3. Motion    → Uint8Array [0, 255] (diff with previous luminance)
 * 4. Threshold → Uint8Array [0 or 255]
 * 5. Edges     → Uint8Array [0, 255]
 * 6. Temporal  → Float32Array → Uint8Array for upload
 * 7. Occupancy → Uint8Array [0, 255] at grid resolution
 * 8. Swap luminance → previous (for next frame's motion)
 *
 * All buffers are pre-allocated and reused — no per-frame allocations.
 *
 * The pipeline returns a snapshot of all analysis maps ready for GPU upload.
 * Returned data is valid until the next call to process().
 */

import { FrameSampler } from './frameSampler';
import { computeLuminance, allocLuminanceBuffer } from './luminance';
import { computeThreshold, allocThresholdBuffer } from './threshold';
import { computeMotion, allocMotionBuffer, swapMotionBuffers } from './motion';
import { computeEdges, allocEdgesBuffer } from './edges';
import { TemporalField } from './temporalField';
import { OccupancyGrid } from './occupancy';
import { clamp } from '../utils/math';

export interface AnalysisParams {
  thresholdValue: number;    // [0, 255]
  motionSensitivity: number; // [0.5, 5.0]
  temporalDecay: number;     // [0.5, 0.99]
  mirror: boolean;
  invert: boolean;
}

export interface AnalysisSnapshot {
  luminance: Uint8Array;
  threshold: Uint8Array;
  motion: Uint8Array;
  edges: Uint8Array;
  temporal: Uint8Array;      // Uint8 version of temporal field, for GPU upload
  occupancy: Uint8Array;
  width: number;
  height: number;
  occupancyWidth: number;
  occupancyHeight: number;
  frameCount: number;
}

export class AnalysisPipeline {
  private sampler: FrameSampler;
  private luminanceCurrent: Uint8Array;
  private luminancePrevious: Uint8Array;
  private threshold: Uint8Array;
  private motion: Uint8Array;
  private edges: Uint8Array;
  private temporal: TemporalField;
  private occupancy: OccupancyGrid;
  private frameCount = 0;

  constructor(width: number, height: number) {
    this.sampler = new FrameSampler({ width, height });
    const count = width * height;
    this.luminanceCurrent = allocLuminanceBuffer(count);
    this.luminancePrevious = allocLuminanceBuffer(count);
    this.threshold = allocThresholdBuffer(count);
    this.motion = allocMotionBuffer(count);
    this.edges = allocEdgesBuffer(count);
    this.temporal = new TemporalField(width, height);
    this.occupancy = new OccupancyGrid(width, height);
  }

  /**
   * Process a single video frame.
   * Returns null if video is not ready to provide a frame.
   */
  process(source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement, params: AnalysisParams): AnalysisSnapshot | null {
    // Update sampler mirror setting
    this.sampler.updateConfig({ mirror: params.mirror });

    const imageData = this.sampler.sample(source);
    if (!imageData) return null;

    const { width, height } = this.sampler;

    // 1. Luminance
    computeLuminance(imageData, this.luminanceCurrent);

    // 1b. Invert if requested
    if (params.invert) {
      const buf = this.luminanceCurrent;
      for (let i = 0; i < buf.length; i++) {
        buf[i] = 255 - buf[i]!;
      }
    }

    // 2. Motion (before threshold — uses raw luminance)
    computeMotion(
      this.luminanceCurrent,
      this.luminancePrevious,
      this.motion,
      clamp(params.motionSensitivity, 0.5, 10),
    );

    // 3. Threshold
    computeThreshold(
      this.luminanceCurrent,
      this.threshold,
      clamp(params.thresholdValue, 0, 255),
    );

    // 4. Edges
    computeEdges(this.luminanceCurrent, this.edges, width, height, 2);

    // 5. Temporal decay
    this.temporal.update(
      this.motion,
      clamp(params.temporalDecay, 0.5, 0.9999),
      1.0,
    );

    // 6. Occupancy
    this.occupancy.compute(this.luminanceCurrent, width);

    // 7. Swap for next frame
    swapMotionBuffers(this.luminanceCurrent, this.luminancePrevious);

    this.frameCount++;

    return {
      luminance: this.luminanceCurrent,
      threshold: this.threshold,
      motion: this.motion,
      edges: this.edges,
      temporal: this.temporal.toUint8(),
      occupancy: this.occupancy.data,
      width,
      height,
      occupancyWidth: this.occupancy.gridWidth,
      occupancyHeight: this.occupancy.gridHeight,
      frameCount: this.frameCount,
    };
  }

  get debugCanvas(): HTMLCanvasElement {
    return this.sampler.debugCanvas;
  }

  get width(): number { return this.sampler.width; }
  get height(): number { return this.sampler.height; }

  /** Resize all buffers. Creates new allocations — call sparingly. */
  resize(width: number, height: number): void {
    this.sampler.updateConfig({ width, height });
    const count = width * height;
    this.luminanceCurrent = allocLuminanceBuffer(count);
    this.luminancePrevious = allocLuminanceBuffer(count);
    this.threshold = allocThresholdBuffer(count);
    this.motion = allocMotionBuffer(count);
    this.edges = allocEdgesBuffer(count);
    this.temporal.resize(width, height);
    this.occupancy = new OccupancyGrid(width, height);
    this.frameCount = 0;
  }
}
