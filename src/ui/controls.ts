/**
 * Controls panel using lil-gui.
 */

import GUI, { Controller } from 'lil-gui';
import type { RenderParams } from '../app/state';
import { effectRegistry, type EffectCapabilities } from '../effects/effectRegistry';

type CapabilityKey = keyof EffectCapabilities;

export class ControlsPanel {
  private gui: GUI;
  private onParamsChange: ((params: RenderParams) => void) | null = null;
  private onCameraChange: ((deviceId: string) => void) | null = null;
  private proxy: RenderParams;

  private gated = new Map<CapabilityKey, Controller[]>();

  /** Dummy object for the camera selector dropdown. */
  private cameraProxy = { deviceId: '' };
  private cameraCtrl: Controller | null = null;

  constructor(initialParams: RenderParams) {
    this.proxy = { ...initialParams };
    const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;
    this.gui = new GUI({ title: 'Settings', width: isTouchDevice ? 220 : 260 });
    this.buildControls();
    this.updateForEffect('rgbDissolve');
    this.gui.close();
  }

  private buildControls(): void {
    const gui = this.gui;
    const proxy = this.proxy;
    const onChange = () => this.onParamsChange?.(this.proxy);

    // Camera selector — starts empty, populated after camera permission is granted
    this.cameraCtrl = gui.add(this.cameraProxy, 'deviceId', {})
      .name('Camera')
      .onChange((deviceId: string) => {
        this.onCameraChange?.(deviceId);
      });

    gui.add(proxy, 'mirror').name('Mirror').onChange(onChange);
    gui.add(proxy, 'invert').name('Invert').onChange(onChange);
    gui.add(proxy, 'freezeFrame').name('Freeze Frame').onChange(onChange);

    const resOptions: Record<string, number> = {
      'Low (80x45)': 80,
      'Medium (160x90)': 160,
      'High (320x180)': 320,
      'Full (720x405)': 720,
    };
    gui.add(proxy, 'analysisWidth', resOptions).name('Analysis Res')
      .onChange((v: number) => {
        proxy.analysisWidth = v;
        proxy.analysisHeight = Math.round(v * (9 / 16));
        onChange();
      });

    const thresholdCtrl = gui
      .add(proxy, 'thresholdValue', 0, 255, 1)
      .name('Threshold')
      .onChange(onChange);
    this.gate('supportsThresholding', thresholdCtrl);

    const pixelCtrl = gui
      .add(proxy, 'pixelSize', 1, 32, 0.5)
      .name('Pixel Size')
      .onChange(onChange);
    this.gate('supportsPixelGrid', pixelCtrl);

    const glitchCtrl = gui
      .add(proxy, 'glitchIntensity', 0, 1, 0.01)
      .name('Glitch')
      .onChange(onChange);
    this.gate('supportsGlitch', glitchCtrl);
  }

  private gate(cap: CapabilityKey, controller: Controller): void {
    const existing = this.gated.get(cap) ?? [];
    existing.push(controller);
    this.gated.set(cap, existing);
  }

  updateForEffect(effectId: string): void {
    const def = effectRegistry.get(effectId);
    if (!def) return;
    const caps = def.capabilities;
    for (const [capKey, controllers] of this.gated) {
      const enabled = caps[capKey] === true;
      for (const ctrl of controllers) {
        ctrl.show(enabled);
      }
    }
  }

  /**
   * Populate the camera dropdown with available devices.
   * Called after camera permission is granted so labels are available.
   */
  setCameraList(devices: MediaDeviceInfo[], activeDeviceId?: string): void {
    if (!this.cameraCtrl) return;

    const options: Record<string, string> = {};
    for (let i = 0; i < devices.length; i++) {
      const d = devices[i]!;
      const label = d.label || `Camera ${i + 1}`;
      options[label] = d.deviceId;
    }

    // lil-gui has no API to update dropdown options, so destroy and recreate
    const parent = this.cameraCtrl.parent;
    this.cameraCtrl.destroy();

    if (activeDeviceId) {
      this.cameraProxy.deviceId = activeDeviceId;
    } else if (devices.length > 0) {
      this.cameraProxy.deviceId = devices[0]!.deviceId;
    }

    this.cameraCtrl = parent.add(this.cameraProxy, 'deviceId', options)
      .name('Camera')
      .onChange((deviceId: string) => {
        this.onCameraChange?.(deviceId);
      });

    // Move the new controller to position 0 (before all others)
    const el = this.cameraCtrl.domElement;
    const container = el.parentElement;
    if (container && container.firstChild !== el) {
      container.insertBefore(el, container.firstChild);
    }

    // Hide if only one camera
    this.cameraCtrl.show(devices.length > 1);
  }

  // ─── Callbacks ────────────────────────────────────────────────────────────

  setOnChange(cb: (params: RenderParams) => void): void { this.onParamsChange = cb; }
  setOnCameraChange(cb: (deviceId: string) => void): void { this.onCameraChange = cb; }

  syncFrom(params: RenderParams): void {
    Object.assign(this.proxy, params);
    this.gui.controllersRecursive().forEach((c) => c.updateDisplay());
    this.updateForEffect(params.visualMode);
  }

  destroy(): void {
    this.gui.destroy();
  }
}
