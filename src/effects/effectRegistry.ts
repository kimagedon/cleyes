/**
 * Effect Registry — single effect: RGB Fragment Dissolve.
 */

export interface EffectCapabilities {
  supportsPixelGrid: boolean;
  supportsGlitch: boolean;
  supportsThresholding: boolean;
}

const NO_CAPABILITIES: Readonly<EffectCapabilities> = {
  supportsPixelGrid: false,
  supportsGlitch: false,
  supportsThresholding: false,
};

export interface EffectDefinition {
  readonly id: string;
  readonly name: string;
  readonly capabilities: Readonly<EffectCapabilities>;
}

export class EffectRegistry {
  private readonly defs = new Map<string, EffectDefinition>();

  register(def: EffectDefinition): void {
    if (this.defs.has(def.id)) {
      throw new Error(`[EffectRegistry] Effect "${def.id}" is already registered`);
    }
    this.defs.set(def.id, Object.freeze({ ...def, capabilities: Object.freeze({ ...def.capabilities }) }));
  }

  get(id: string): EffectDefinition | undefined {
    return this.defs.get(id);
  }
}

export const effectRegistry = new EffectRegistry();

effectRegistry.register({
  id: 'rgbDissolve',
  name: 'RGB Fragment Dissolve',
  capabilities: {
    ...NO_CAPABILITIES,
    supportsPixelGrid: true,
    supportsThresholding: true,
  },
});
