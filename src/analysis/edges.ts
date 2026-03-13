/**
 * Edge detection via simplified Sobel operator on the luminance field.
 *
 * Full Sobel uses two 3×3 kernels (Gx, Gy) and computes sqrt(Gx²+Gy²).
 * We use a fast approximation: abs(Gx) + abs(Gy) (Manhattan distance).
 * This is ~20% faster than sqrt and visually indistinguishable for our use case.
 *
 * Performance note: We iterate over interior pixels only (ignoring border row/col).
 * Border pixels are set to 0. This avoids bounds checking in the inner loop.
 */

export function computeEdges(
  luminance: Uint8Array,
  output: Uint8Array,
  width: number,
  height: number,
  scale: number = 2, // Amplification factor for visibility
): void {
  if (output.length < width * height || luminance.length < width * height) {
    throw new Error('edges: buffer size mismatch');
  }

  const clampedScale = Math.max(1, Math.min(10, scale));

  // Compute interior pixels (skip 1px border for Sobel kernel)
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;

      // Sobel Gx: horizontal gradient
      const gx =
        -luminance[i - width - 1]! +
        luminance[i - width + 1]! +
        -2 * luminance[i - 1]! +
        2 * luminance[i + 1]! +
        -luminance[i + width - 1]! +
        luminance[i + width + 1]!;

      // Sobel Gy: vertical gradient
      const gy =
        -luminance[i - width - 1]! +
        -2 * luminance[i - width]! +
        -luminance[i - width + 1]! +
        luminance[i + width - 1]! +
        2 * luminance[i + width]! +
        luminance[i + width + 1]!;

      // Fast Manhattan approximation
      const magnitude = (Math.abs(gx) + Math.abs(gy)) / 4; // /4 normalizes ~8x scale from 3×3 kernel
      output[i] = Math.min(255, (magnitude * clampedScale) | 0);
    }
  }

  // Copy nearest interior values to border (avoids visible seam at screen edges)
  for (let x = 0; x < width; x++) {
    output[x] = output[width + x]!;                                  // top row ← row 1
    output[(height - 1) * width + x] = output[(height - 2) * width + x]!; // bottom row ← row h-2
  }
  for (let y = 0; y < height; y++) {
    output[y * width] = output[y * width + 1]!;                      // left col ← col 1
    output[y * width + (width - 1)] = output[y * width + (width - 2)]!; // right col ← col w-2
  }
}

export function allocEdgesBuffer(pixelCount: number): Uint8Array {
  return new Uint8Array(pixelCount);
}
