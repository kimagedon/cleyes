/**
 * DebugOverlay: shows analysis maps and performance data.
 *
 * Renders small canvas previews of each analysis map using Canvas 2D.
 * Toggle with the showDebugOverlay param or keyboard shortcut.
 */

import type { AnalysisSnapshot } from '../analysis/analysisPipeline';
import { FPSCounter } from '../utils/time';

const PREVIEW_SCALE = 2; // Each analysis pixel becomes PREVIEW_SCALE × PREVIEW_SCALE display pixels
const PREVIEW_MAPS = ['luminance', 'motion', 'threshold', 'edges', 'temporal'] as const;
type PreviewMapName = typeof PREVIEW_MAPS[number];

export class DebugOverlay {
  private container: HTMLElement;
  private canvasesDiv: HTMLElement;
  private canvases: Partial<Record<PreviewMapName, HTMLCanvasElement>> = {};
  private contexts: Partial<Record<PreviewMapName, CanvasRenderingContext2D>> = {};
  private fps: FPSCounter = new FPSCounter(30);

  // DOM references for stats
  private fpsEl: HTMLElement;
  private renderMsEl: HTMLElement;
  private analysisMsEl: HTMLElement;
  private modeEl: HTMLElement;
  private resolutionEl: HTMLElement;
  private cameraEl: HTMLElement;

  constructor() {
    this.container = document.getElementById('debug-overlay')!;
    this.canvasesDiv = document.getElementById('dbg-canvases')!;
    this.fpsEl = document.getElementById('dbg-fps')!;
    this.renderMsEl = document.getElementById('dbg-render-ms')!;
    this.analysisMsEl = document.getElementById('dbg-analysis-ms')!;
    this.modeEl = document.getElementById('dbg-mode')!;
    this.resolutionEl = document.getElementById('dbg-resolution')!;
    this.cameraEl = document.getElementById('dbg-camera')!;
  }

  setVisible(visible: boolean): void {
    this.container.classList.toggle('visible', visible);
    if (visible && Object.keys(this.canvases).length === 0) {
      this.createCanvases();
    }
  }

  private createCanvases(): void {
    for (const name of PREVIEW_MAPS) {
      const canvas = document.createElement('canvas');
      canvas.width = 160;
      canvas.height = 90;
      canvas.style.width = `${160 / PREVIEW_SCALE}px`;
      canvas.style.height = `${90 / PREVIEW_SCALE}px`;
      canvas.title = name;

      const label = document.createElement('div');
      label.style.cssText = 'color:rgba(255,255,255,0.4);font-size:9px;margin-top:6px;';
      label.textContent = name;

      this.canvasesDiv.appendChild(label);
      this.canvasesDiv.appendChild(canvas);

      const ctx = canvas.getContext('2d', { willReadFrequently: false });
      if (ctx) {
        this.canvases[name] = canvas;
        this.contexts[name] = ctx;
      }
    }
  }

  update(
    snapshot: AnalysisSnapshot,
    renderMs: number,
    analysisMs: number,
    mode: string,
    cameraStatus: string,
    timestamp: number,
  ): void {
    this.fps.tick(timestamp);
    this.fpsEl.textContent = this.fps.fps.toFixed(1);
    this.renderMsEl.textContent = renderMs.toFixed(2);
    this.analysisMsEl.textContent = analysisMs.toFixed(2);
    this.modeEl.textContent = mode;
    this.resolutionEl.textContent = `${snapshot.width}×${snapshot.height}`;
    this.cameraEl.textContent = cameraStatus;

    // Draw map canvases (only if visible)
    if (!this.container.classList.contains('visible')) return;

    this.drawMap('luminance', snapshot.luminance, snapshot.width, snapshot.height);
    this.drawMap('motion', snapshot.motion, snapshot.width, snapshot.height);
    this.drawMap('threshold', snapshot.threshold, snapshot.width, snapshot.height);
    this.drawMap('edges', snapshot.edges, snapshot.width, snapshot.height);
    this.drawMap('temporal', snapshot.temporal, snapshot.width, snapshot.height);
  }

  private drawMap(
    name: PreviewMapName,
    data: Uint8Array,
    width: number,
    height: number,
  ): void {
    const ctx = this.contexts[name];
    if (!ctx) return;

    const canvas = this.canvases[name]!;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    const imageData = ctx.createImageData(width, height);
    const pixels = imageData.data;

    for (let i = 0; i < data.length; i++) {
      const v = data[i]!;
      const base = i * 4;
      pixels[base] = v;
      pixels[base + 1] = v;
      pixels[base + 2] = v;
      pixels[base + 3] = 255;
    }

    ctx.putImageData(imageData, 0, 0);
  }
}
