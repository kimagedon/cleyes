import { GLSL_COMMON } from './common';

/**
 * Mode 2: RGB Fragment Dissolve
 *
 * Visual concept:
 * - Light/off-white background
 * - Figure dissolves into separated RGB pixel clouds
 * - Chromatic aberration: R/G/B channels sample from slightly offset UVs
 * - Edges are most dissolved — interior stays more coherent
 * - Motion causes turbulence: the channel offsets grow with motion
 * - High motion → fragments scatter further, RGB clouds spread
 */
export const RGB_DISSOLVE_FRAG_SOURCE = /* glsl */ `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_texLuminance;
uniform sampler2D u_texThreshold;
uniform sampler2D u_texMotion;
uniform sampler2D u_texEdges;
uniform sampler2D u_texTemporal;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_pixelSize;
uniform float u_glitchIntensity;

${GLSL_COMMON}

void main() {
  vec2 uv = v_uv;
  vec2 fragCoord = uv * u_resolution;

  // Pixelate to grid
  float gs = max(2.0, u_pixelSize);
  vec2 pxUV = (floor(fragCoord / gs) * gs + gs * 0.5) / u_resolution;

  // Sample motion at pixelated UV — average motion in cell
  float motion   = texture(u_texMotion, pxUV).r;
  float edges    = texture(u_texEdges, pxUV).r;
  float temporal = texture(u_texTemporal, pxUV).r;

  // --- RGB channel separation ---
  // Split amount increases with motion and edge proximity
  float splitBase = 0.003;
  float splitMotion = motion * 0.025;
  float splitEdge = edges * 0.01;
  float split = splitBase + splitMotion + splitEdge;

  // Add per-cell turbulence from noise
  float cellHash = hash21(floor(fragCoord / gs) + u_time * 0.5);
  float angle = cellHash * 6.283;
  vec2 splitDir = vec2(cos(angle), sin(angle));

  vec2 uvR = pxUV + splitDir * split;
  vec2 uvG = pxUV;
  vec2 uvB = pxUV - splitDir * split;

  float lumR = texture(u_texLuminance, uvR).r;
  float lumG = texture(u_texLuminance, uvG).r;
  float lumB = texture(u_texLuminance, uvB).r;

  float threshR = texture(u_texThreshold, uvR).r;
  float threshG = texture(u_texThreshold, uvG).r;
  float threshB = texture(u_texThreshold, uvB).r;

  // --- Dissolution: figure pixels scatter at edges ---
  // Each channel has a random presence probability based on luminance + edge
  float dissolveAmt = clamp(edges * 3.0 + motion * 2.0, 0.0, 1.0);
  float rPresence = step(hash21(floor(fragCoord / gs) * vec2(1.3, 2.7) + u_time * 0.3), 1.0 - dissolveAmt * 0.6);
  float gPresence = step(hash21(floor(fragCoord / gs) * vec2(2.1, 0.9) + u_time * 0.3 + 0.5), 1.0 - dissolveAmt * 0.7);
  float bPresence = step(hash21(floor(fragCoord / gs) * vec2(0.7, 3.1) + u_time * 0.3 + 1.0), 1.0 - dissolveAmt * 0.8);

  // --- Color mapping ---
  // Light background (near-white)
  vec3 bgColor = vec3(0.96, 0.95, 0.93);

  // Figure: pixel presence determines if we draw a figure pixel or background
  float figureR = threshR * rPresence;
  float figureG = threshG * gPresence;
  float figureB = threshB * bPresence;

  // Color: luminance mapped to palette
  // R channel: warm reddish
  vec3 colorR = mix(bgColor, vec3(lumR * 0.9, lumR * 0.15, lumR * 0.1), figureR);
  // G channel: cool greenish-cyan
  vec3 colorG = mix(bgColor, vec3(lumG * 0.05, lumG * 0.75, lumG * 0.6), figureG);
  // B channel: deep blue-violet
  vec3 colorB = mix(bgColor, vec3(lumB * 0.1, lumB * 0.15, lumB * 0.95), figureB);

  // Blend channels with additive character
  vec3 col = bgColor;
  col = mix(col, colorR, figureR * 0.7);
  col = mix(col, colorG, figureG * 0.65);
  col = mix(col, colorB, figureB * 0.65);

  // Add temporal afterimage as faint warm ghost
  col = mix(col, vec3(0.8, 0.6, 0.4) * (1.0 - lumG), temporal * 0.25);

  // Pixel boundary darkening — hint of pixel grid
  vec2 cellEdgeDist = abs(fract(fragCoord / gs) - 0.5);
  float cellEdge = max(cellEdgeDist.x, cellEdgeDist.y);
  col -= step(0.47, cellEdge) * 0.04;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;
