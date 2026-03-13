/**
 * Analysis texture management.
 *
 * Each analysis map (luminance, threshold, motion, edges, temporal, occupancy)
 * is uploaded to a WebGL texture every frame.
 *
 * Texture format choices:
 * - luminance, threshold, motion, edges: R8 (GL_RED, UNSIGNED_BYTE)
 *   → Minimal bandwidth, perfect for [0, 255] single-channel maps
 * - temporal: R8 (UNSIGNED_BYTE) — we convert Float32→Uint8 before upload
 *   → Avoids the need for EXT_color_buffer_float or float texture extensions
 * - occupancy: R8 (GL_RED, UNSIGNED_BYTE) at grid resolution
 *
 * All textures use NEAREST filtering (no interpolation) for the raw analysis maps.
 * The fragment shader samples them at UV coordinates and the pixelated look
 * is intentional — we want the discrete nature to be visible.
 *
 * Linear filtering is intentionally NOT used: we want crisp analysis boundaries.
 * (Exception: if a mode wants to blur, it should implement that in GLSL.)
 */

import { logger } from '../utils/logger';

export type TextureName =
  | 'luminance'
  | 'threshold'
  | 'motion'
  | 'edges'
  | 'temporal'
  | 'occupancy';

export interface TextureSet {
  luminance: WebGLTexture;
  threshold: WebGLTexture;
  motion: WebGLTexture;
  edges: WebGLTexture;
  temporal: WebGLTexture;
  occupancy: WebGLTexture;
}

/** Texture unit assignments — fixed so we can just set them once per program. */
export const TEXTURE_UNITS: Record<TextureName, number> = {
  luminance: 0,
  threshold: 1,
  motion: 2,
  edges: 3,
  temporal: 4,
  occupancy: 5,
};

export function createTexture(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
): WebGLTexture {
  const tex = gl.createTexture();
  if (!tex) throw new Error('Failed to create WebGL texture');

  gl.bindTexture(gl.TEXTURE_2D, tex);

  // Allocate storage
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.R8,           // Internal format: 8-bit red channel
    width,
    height,
    0,
    gl.RED,          // Format
    gl.UNSIGNED_BYTE,
    null,            // No initial data
  );

  // NEAREST filtering — we want pixel-accurate analysis maps
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  // CLAMP_TO_EDGE: out-of-bounds samples return edge pixel (not wrap)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  gl.bindTexture(gl.TEXTURE_2D, null);
  return tex;
}

export function createAnalysisTextures(
  gl: WebGL2RenderingContext,
  analysisWidth: number,
  analysisHeight: number,
  occupancyWidth: number,
  occupancyHeight: number,
): TextureSet {
  return {
    luminance: createTexture(gl, analysisWidth, analysisHeight),
    threshold: createTexture(gl, analysisWidth, analysisHeight),
    motion: createTexture(gl, analysisWidth, analysisHeight),
    edges: createTexture(gl, analysisWidth, analysisHeight),
    temporal: createTexture(gl, analysisWidth, analysisHeight),
    occupancy: createTexture(gl, occupancyWidth, occupancyHeight),
  };
}

export function uploadTexture(
  gl: WebGL2RenderingContext,
  texture: WebGLTexture,
  data: Uint8Array,
  width: number,
  height: number,
): void {
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texSubImage2D(
    gl.TEXTURE_2D,
    0,          // mip level
    0, 0,       // xoffset, yoffset
    width,
    height,
    gl.RED,
    gl.UNSIGNED_BYTE,
    data,
  );
  gl.bindTexture(gl.TEXTURE_2D, null);
}

export function bindTexturesToUnits(
  gl: WebGL2RenderingContext,
  textures: TextureSet,
): void {
  const names = Object.keys(TEXTURE_UNITS) as TextureName[];
  for (const name of names) {
    const unit = TEXTURE_UNITS[name];
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, textures[name]);
  }
}

export function deleteTextures(gl: WebGL2RenderingContext, textures: TextureSet): void {
  const names = Object.keys(textures) as TextureName[];
  for (const name of names) {
    gl.deleteTexture(textures[name]);
    logger.debug('Buffers', `Deleted texture: ${name}`);
  }
}
