/**
 * Temporal decay field — motion memory / afterimage system.
 *
 * Algorithm:
 * 1. Every frame, multiply all values by decayFactor (exponential decay)
 * 2. Add current motion values (clamped to [0, 1])
 * 3. Clamp result to [0, 1]
 *
 * decayFactor range: [0.5, 0.99]
 * - 0.5: very short memory (1-2 frames visible)
 * - 0.99: very long persistence (~100 frames ghost)
 *
 * WHY Float32Array instead of Uint8Array:
 * The decay multiplication (e.g. 0.95 * x) loses precision rapidly in integer space.
 * A Uint8 value of 1 * 0.95 = 0.95 → rounds to 0 immediately.
 * Float32 preserves the gradual decay properly.
 *
 * For GPU upload: we convert to Uint8 just before upload to save bandwidth.
 * The conversion is done in-place into a separate Uint8Array upload buffer.
 */

export class TemporalField {
  private field: Float32Array;
  private uploadBuffer: Uint8Array;
  readonly width: number;
  readonly height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    const count = width * height;
    this.field = new Float32Array(count);
    this.uploadBuffer = new Uint8Array(count);
  }

  /**
   * Update the temporal field for one frame.
   * @param motion Uint8Array [0, 255] — current motion map
   * @param decayFactor [0.5, 0.99] — per-frame decay multiplier
   * @param accumStrength [0, 1] — how strongly new motion adds to the field
   */
  update(motion: Uint8Array, decayFactor: number, accumStrength: number = 1): void {
    const count = this.field.length;
    const decay = Math.max(0.5, Math.min(0.9999, decayFactor));
    const strength = Math.max(0, Math.min(2, accumStrength));

    for (let i = 0; i < count; i++) {
      // Decay existing field value
      let val = this.field[i]! * decay;
      // Accumulate motion — normalized from [0, 255] to [0, 1]
      val += (motion[i]! / 255) * strength;
      // Clamp to [0, 1]
      this.field[i] = val > 1 ? 1 : val;
    }
  }

  /**
   * Convert Float32 field to Uint8 for GPU texture upload.
   * Returns the same upload buffer (reused each frame — no allocation).
   */
  toUint8(): Uint8Array {
    const count = this.field.length;
    for (let i = 0; i < count; i++) {
      this.uploadBuffer[i] = (this.field[i]! * 255) | 0;
    }
    return this.uploadBuffer;
  }

  /**
   * Get raw float value at position (for debug purposes).
   */
  getValue(x: number, y: number): number {
    return this.field[y * this.width + x] ?? 0;
  }

  reset(): void {
    this.field.fill(0);
  }

  resize(width: number, height: number): void {
    (this as { width: number }).width = width;
    (this as { height: number }).height = height;
    const count = width * height;
    this.field = new Float32Array(count);
    this.uploadBuffer = new Uint8Array(count);
  }
}
