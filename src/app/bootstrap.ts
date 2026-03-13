/**
 * Bootstrap: wires together all subsystems and runs the main loop.
 * Auto-starts camera on page load (no splash screen).
 */

import { AppStateManager, DEFAULT_RENDER_PARAMS, sanitizeParams } from './state';
import type { RenderParams } from './state';
import { CameraManager } from '../camera/cameraManager';
import { AnalysisPipeline } from '../analysis/analysisPipeline';
import { RenderComposer } from '../render/composer';
import { ControlsPanel } from '../ui/controls';
import { DebugOverlay } from '../ui/overlay';
import { isGetUserMediaSupported, enumerateCameras } from '../camera/permissions';
import { InputSourceManager } from '../input/inputSourceManager';
import { logger } from '../utils/logger';
import { stopwatch } from '../utils/time';

export class App {
  private stateManager = new AppStateManager();
  private params: RenderParams = { ...DEFAULT_RENDER_PARAMS };

  private camera: CameraManager | null = null;
  private analysis: AnalysisPipeline | null = null;
  private renderer: RenderComposer | null = null;
  private controls: ControlsPanel | null = null;
  private overlay: DebugOverlay | null = null;
  private inputManager = new InputSourceManager();

  private rafId: number | null = null;
  private loopRunning = false;
  private lastAnalysisMs = 0;
  private lastRenderMs = 0;
  private lastSnapshot: import('../analysis/analysisPipeline').AnalysisSnapshot | null = null;

  /** Canvas holding a captured frame for freeze-frame mode. */
  private frozenFrame: HTMLCanvasElement | null = null;

  init(): void {
    // Check browser support
    if (!isGetUserMediaSupported()) {
      this.stateManager.transition('unsupported-browser');
      return;
    }

    // Check WebGL2 support
    const testCanvas = document.createElement('canvas');
    const testGl = testCanvas.getContext('webgl2');
    if (!testGl) {
      this.stateManager.transition('unsupported-browser');
      return;
    }

    const canvas = document.getElementById('gl-canvas') as HTMLCanvasElement;
    const video = document.getElementById('camera-video') as HTMLVideoElement;

    // Initialize renderer
    try {
      this.renderer = new RenderComposer(canvas);
      this.renderer.init(
        this.params.analysisWidth,
        this.params.analysisHeight,
        Math.floor(this.params.analysisWidth / 4),
        Math.floor(this.params.analysisHeight / 4),
      );
    } catch (err) {
      logger.error('Bootstrap', 'Renderer init failed:', err);
      this.stateManager.transition('fatal-render-error');
      return;
    }

    // Initialize analysis pipeline
    this.analysis = new AnalysisPipeline(this.params.analysisWidth, this.params.analysisHeight);

    // Initialize camera manager
    this.camera = new CameraManager(video, {
      onStateChange: (cameraState, error) => {
        switch (cameraState) {
          case 'requesting':
            this.stateManager.transition('requesting-camera');
            break;
          case 'ready':
            this.stateManager.transition('running');
            this.inputManager.setCameraSource(video);
            this.startLoop();
            void this.populateCameraList();
            break;
          case 'error':
            this.stateManager.transition('camera-error', error);
            this.stopLoop();
            logger.error('Bootstrap', 'Camera error:', error?.message);
            break;
          case 'stopped':
            this.stopLoop();
            break;
        }
      },
      onStreamEnded: () => {
        this.stateManager.transition('camera-error');
        this.stopLoop();
      },
    });

    // Initialize UI
    this.controls = new ControlsPanel(this.params);
    this.controls.setOnChange((newParams) => {
      this.handleParamsChange(newParams);
    });
    this.controls.setOnCameraChange((deviceId) => {
      void this.camera?.start(deviceId);
    });

    this.overlay = new DebugOverlay();
    this.overlay.setVisible(this.params.showDebugOverlay);

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => this.handleKeydown(e));

    // Resize
    window.addEventListener('resize', () => this.handleResize());
    this.handleResize();

    // Tab visibility — stop rendering when tab is hidden
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.pauseLoop();
      } else if (this.stateManager.current === 'running') {
        this.resumeLoop();
      }
    });

    // Auto-start camera immediately
    void this.camera.start();

    logger.info('Bootstrap', 'App initialized');
  }

  private async populateCameraList(): Promise<void> {
    const devices = await enumerateCameras();
    const video = document.getElementById('camera-video') as HTMLVideoElement;
    const stream = video.srcObject instanceof MediaStream ? video.srcObject : null;
    const activeTrack = stream?.getVideoTracks()[0];
    const activeDeviceId = activeTrack?.getSettings().deviceId;
    this.controls?.setCameraList(devices, activeDeviceId);
  }

  private handleParamsChange(newParams: RenderParams): void {
    const sanitized = sanitizeParams(newParams);
    const prevAnalysisW = this.params.analysisWidth;

    this.params = sanitized;

    // Analysis resolution change — requires pipeline resize
    if (sanitized.analysisWidth !== prevAnalysisW && this.analysis) {
      this.analysis.resize(sanitized.analysisWidth, sanitized.analysisHeight);
      this.renderer?.init(
        sanitized.analysisWidth,
        sanitized.analysisHeight,
        Math.floor(sanitized.analysisWidth / 4),
        Math.floor(sanitized.analysisHeight / 4),
      );
    }

    // Debug overlay toggle
    this.overlay?.setVisible(sanitized.showDebugOverlay);
  }

  private startLoop(): void {
    if (this.loopRunning) {
      logger.warn('Bootstrap', 'startLoop() called while loop is already running');
      return;
    }
    this.loopRunning = true;
    this.loop();
  }

  private stopLoop(): void {
    this.loopRunning = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private pauseLoop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private resumeLoop(): void {
    if (this.loopRunning && this.rafId === null) {
      this.loop();
    }
  }

  private resume(): void {
    if (this.stateManager.current === 'paused') {
      this.stateManager.transition('running');
      this.resumeLoop();
    }
  }

  private loop(): void {
    if (!this.loopRunning) return;

    this.rafId = requestAnimationFrame((timestamp) => {
      this.frame(timestamp);
    });
  }

  private frame(timestamp: number): void {
    if (!this.loopRunning) return;

    const params = this.params;
    const source = this.inputManager.getDrawable();

    // Freeze-frame: capture source once, then re-run analysis from the capture
    if (params.freezeFrame) {
      if (!this.frozenFrame && source) {
        this.frozenFrame = this.captureFrame(source);
      }
    } else {
      this.frozenFrame = null;
    }

    const analysisSource = params.freezeFrame ? this.frozenFrame : source;

    if (this.analysis && analysisSource) {
      const analysisTimer = stopwatch();
      this.lastSnapshot = this.analysis.process(analysisSource, {
        thresholdValue: params.thresholdValue,
        motionSensitivity: params.motionSensitivity,
        temporalDecay: params.temporalDecay,
        mirror: params.mirror,
        invert: params.invert,
      });
      this.lastAnalysisMs = analysisTimer();
    }

    // Render
    if (this.lastSnapshot && this.renderer) {
      const renderTimer = stopwatch();
      try {
        this.renderer.render(this.lastSnapshot, params);
      } catch (err) {
        logger.error('Bootstrap', 'Render error:', err);
      }
      this.lastRenderMs = renderTimer();

      // Update debug overlay
      if (params.showDebugOverlay && this.overlay) {
        this.overlay.update(
          this.lastSnapshot,
          this.lastRenderMs,
          this.lastAnalysisMs,
          this.renderer.activeMode,
          this.camera?.isReady ? 'connected' : 'disconnected',
          timestamp,
        );
      }
    }

    // Schedule next frame
    this.rafId = requestAnimationFrame((ts) => this.frame(ts));
  }

  /** Capture the current video frame at full resolution onto an offscreen canvas. */
  private captureFrame(source: HTMLVideoElement): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = source.videoWidth;
    canvas.height = source.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.drawImage(source, 0, 0);
    return canvas;
  }

  private handleResize(): void {
    const canvas = document.getElementById('gl-canvas') as HTMLCanvasElement;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    this.renderer?.handleResize(canvas.width, canvas.height);
    logger.debug('Bootstrap', `Resize: ${canvas.width}×${canvas.height} (dpr=${dpr})`);
  }

  private handleKeydown(e: KeyboardEvent): void {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

    switch (e.key) {
      case ' ':
      case 'p':
      case 'P': {
        e.preventDefault();
        const state = this.stateManager.current;
        if (state === 'running') {
          this.stateManager.transition('paused');
          this.pauseLoop();
        } else if (state === 'paused') {
          this.resume();
        }
        break;
      }

      // Debug overlay toggle
      case 'd':
      case 'D': {
        this.params = { ...this.params, showDebugOverlay: !this.params.showDebugOverlay };
        this.overlay?.setVisible(this.params.showDebugOverlay);
        this.controls?.syncFrom(this.params);
        break;
      }

      // Screenshot
      case 's':
      case 'S': {
        if (e.ctrlKey || e.metaKey) break;
        this.takeScreenshot();
        break;
      }
    }
  }

  private takeScreenshot(): void {
    const canvas = document.getElementById('gl-canvas') as HTMLCanvasElement;
    try {
      const dataURL = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataURL;
      a.download = `cleyes-${Date.now()}.png`;
      a.click();
    } catch (err) {
      logger.warn('Bootstrap', 'Screenshot failed:', err);
    }
  }

  destroy(): void {
    this.stopLoop();
    this.camera?.stop();
    this.renderer?.destroy();
    this.controls?.destroy();
    this.inputManager.dispose();
    logger.info('Bootstrap', 'App destroyed');
  }
}
