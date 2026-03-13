/**
 * RenderComposer — simplified single-effect renderer for rgbDissolve.
 *
 * Renders the rgbDissolve fragment shader as a single fullscreen pass.
 * No FBOs, no multi-pass pipeline, no particles.
 *
 * Texture units:
 *   0  u_texLuminance
 *   1  u_texThreshold
 *   2  u_texMotion
 *   3  u_texEdges
 *   4  u_texTemporal
 *   5  u_texOccupancy
 */

import { logger } from '../utils/logger';
import { UniformCache } from './uniforms';
import {
  TextureSet,
  TEXTURE_UNITS,
  createAnalysisTextures,
  uploadTexture,
  bindTexturesToUnits,
  deleteTextures,
} from './buffers';
import { VERTEX_SHADER_SOURCE } from './shaders/vertex';
import { RGB_DISSOLVE_FRAG_SOURCE } from './shaders/rgbDissolve.frag';
import type { AnalysisSnapshot } from '../analysis/analysisPipeline';
import type { RenderParams } from '../app/state';

// ─── Shader compilation helpers ───────────────────────────────────────────────

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    logger.error('Composer', `Shader compile error:\n${gl.getShaderInfoLog(shader) ?? '?'}`);
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(
  gl: WebGL2RenderingContext,
  fragSrc: string,
  label: string,
): WebGLProgram | null {
  const vert = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
  if (!vert) return null;
  const frag = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);
  if (!frag) { gl.deleteShader(vert); return null; }
  const prog = gl.createProgram();
  if (!prog) { gl.deleteShader(vert); gl.deleteShader(frag); return null; }
  gl.attachShader(prog, vert);
  gl.attachShader(prog, frag);
  gl.linkProgram(prog);
  gl.deleteShader(vert);
  gl.deleteShader(frag);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    logger.error('Composer', `Link error "${label}": ${gl.getProgramInfoLog(prog) ?? '?'}`);
    gl.deleteProgram(prog);
    return null;
  }
  logger.info('Composer', `Program "${label}" ready`);
  return prog;
}

// ─── RenderComposer ──────────────────────────────────────────────────────────

export type EffectId = string;

export class RenderComposer {
  private gl: WebGL2RenderingContext;
  private canvas: HTMLCanvasElement;
  private vao: WebGLVertexArrayObject | null = null;

  // Analysis textures
  private textures: TextureSet | null = null;
  private analysisWidth = 0;
  private analysisHeight = 0;
  private occupancyWidth = 0;
  private occupancyHeight = 0;

  // Single program for rgbDissolve
  private program: WebGLProgram | null = null;

  // Uniform cache
  private uniforms = new UniformCache();

  // Timing
  private startTime = performance.now();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('webgl2', {
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
    });
    if (!ctx) throw new Error('WebGL2 not available');
    this.gl = ctx;

    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      logger.error('Composer', 'WebGL context lost');
    });
    canvas.addEventListener('webglcontextrestored', () => {
      logger.info('Composer', 'WebGL context restored — reinitializing');
      this.init(this.analysisWidth, this.analysisHeight, this.occupancyWidth, this.occupancyHeight);
    });
  }

  // ─── Init ─────────────────────────────────────────────────────────────────

  init(aw: number, ah: number, ow: number, oh: number): void {
    const gl = this.gl;
    this.analysisWidth = aw;
    this.analysisHeight = ah;
    this.occupancyWidth = ow;
    this.occupancyHeight = oh;

    // Fullscreen quad VAO
    this.vao = this.createQuad();

    // Compile rgbDissolve program
    const prog = createProgram(gl, RGB_DISSOLVE_FRAG_SOURCE, 'rgbDissolve');
    if (prog) {
      this.program = prog;
      this.bindStandardSamplers(prog);
    }

    // Analysis textures
    if (this.textures) deleteTextures(gl, this.textures);
    this.textures = createAnalysisTextures(gl, aw, ah, ow, oh);

    logger.info('Composer', `Initialized. Program=${this.program ? 'ready' : 'failed'}`);
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  render(snapshot: AnalysisSnapshot, params: RenderParams): void {
    const gl = this.gl;
    if (!this.textures || !this.vao || !this.program) return;

    // Upload analysis textures
    const { luminance, threshold, motion, edges, temporal, occupancy } = snapshot;
    const { width: aw, height: ah, occupancyWidth: ow, occupancyHeight: oh } = snapshot;
    uploadTexture(gl, this.textures.luminance, luminance, aw, ah);
    uploadTexture(gl, this.textures.threshold, threshold, aw, ah);
    uploadTexture(gl, this.textures.motion, motion, aw, ah);
    uploadTexture(gl, this.textures.edges, edges, aw, ah);
    uploadTexture(gl, this.textures.temporal, temporal, aw, ah);
    uploadTexture(gl, this.textures.occupancy, occupancy, ow, oh);

    // Bind analysis textures to units 0-5
    bindTexturesToUnits(gl, this.textures);

    const t = (performance.now() - this.startTime) / 1000;
    const u = this.uniforms;
    const program = this.program;

    // Render directly to canvas
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);

    u.set1f(gl, program, 'u_time', t);
    u.set2f(gl, program, 'u_resolution', this.canvas.width, this.canvas.height);
    u.set1f(gl, program, 'u_pixelSize', params.pixelSize);
    u.set1f(gl, program, 'u_glitchIntensity', params.glitchIntensity);

    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
  }

  // ─── Uniform helpers ──────────────────────────────────────────────────────

  private bindStandardSamplers(prog: WebGLProgram): void {
    const gl = this.gl;
    gl.useProgram(prog);
    const samplers: Record<string, number> = {
      u_texLuminance: TEXTURE_UNITS.luminance,
      u_texThreshold: TEXTURE_UNITS.threshold,
      u_texMotion: TEXTURE_UNITS.motion,
      u_texEdges: TEXTURE_UNITS.edges,
      u_texTemporal: TEXTURE_UNITS.temporal,
      u_texOccupancy: TEXTURE_UNITS.occupancy,
    };
    for (const [name, unit] of Object.entries(samplers)) {
      const loc = gl.getUniformLocation(prog, name);
      if (loc !== null) gl.uniform1i(loc, unit);
    }
  }

  // ─── Quad ─────────────────────────────────────────────────────────────────

  private createQuad(): WebGLVertexArrayObject {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    if (!vao) throw new Error('Failed to create VAO');
    gl.bindVertexArray(vao);
    const vertices = new Float32Array([-1,-1, 1,-1, -1,1, 1,-1, 1,1, -1,1]);
    const vbo = gl.createBuffer();
    if (!vbo) throw new Error('Failed to create VBO');
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    return vao;
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  setMode(_effectId: EffectId): boolean {
    return true; // Only one mode
  }

  get activeMode(): EffectId {
    return 'rgbDissolve';
  }

  get isWebGL2Available(): boolean {
    return this.gl !== null;
  }

  handleResize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
    logger.debug('Composer', `Resized to ${width}×${height}`);
  }

  destroy(): void {
    const gl = this.gl;
    if (this.textures) { deleteTextures(gl, this.textures); this.textures = null; }
    if (this.program) {
      this.uniforms.invalidate(this.program);
      gl.deleteProgram(this.program);
      this.program = null;
    }
    if (this.vao) { gl.deleteVertexArray(this.vao); this.vao = null; }
    logger.info('Composer', 'Destroyed');
  }
}
