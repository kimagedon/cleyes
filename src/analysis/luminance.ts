/**
 * Luminance extraction from RGBA ImageData.
 *
 * Uses BT.709 coefficients (standard for sRGB / web content):
 * Y = 0.2126 R + 0.7152 G + 0.0722 B
 *
 * Output: Uint8Array of luminance values in [0, 255].
 * Uint8 chosen over Float32 to minimize memory and GC pressure.
 * The GPU texture upload accepts Uint8 directly.
 */

export function computeLuminance(
  imageData: ImageData,
  output: Uint8Array,
): void {
  const { data } = imageData;
  const pixelCount = imageData.width * imageData.height;

  // Performance note: avoid typed array bounds checks by pre-validating size.
  if (output.length < pixelCount) {
    throw new Error(`luminance output buffer too small: ${output.length} < ${pixelCount}`);
  }

  for (let i = 0; i < pixelCount; i++) {
    const base = i * 4;
    // BT.709 luminance
    const lum =
      0.2126 * (data[base]!) +
      0.7152 * (data[base + 1]!) +
      0.0722 * (data[base + 2]!);
    output[i] = lum | 0; // Fast floor to uint8
  }
}

/** Allocate a luminance buffer for the given pixel count. */
export function allocLuminanceBuffer(pixelCount: number): Uint8Array {
  return new Uint8Array(pixelCount);
}
