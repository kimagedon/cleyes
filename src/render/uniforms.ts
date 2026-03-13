/**
 * Uniform management for WebGL shader programs.
 *
 * Caches uniform locations to avoid repeated getUniformLocation() calls.
 * getUniformLocation is not free — calling it every frame is wasteful.
 *
 * UniformCache stores locations per program.
 * Usage: cache.set(gl, program, 'u_time', 1.23);
 */

import { logger } from '../utils/logger';
import { isValidUniform } from '../utils/math';

export class UniformCache {
  private locations: Map<WebGLProgram, Map<string, WebGLUniformLocation | null>> = new Map();

  private getLocation(
    gl: WebGL2RenderingContext,
    program: WebGLProgram,
    name: string,
  ): WebGLUniformLocation | null {
    let programMap = this.locations.get(program);
    if (!programMap) {
      programMap = new Map();
      this.locations.set(program, programMap);
    }

    if (!programMap.has(name)) {
      const loc = gl.getUniformLocation(program, name);
      if (loc === null) {
        logger.debug('Uniforms', `Uniform "${name}" not found in program (may be optimized out)`);
      }
      programMap.set(name, loc);
    }

    return programMap.get(name) ?? null;
  }

  set1f(gl: WebGL2RenderingContext, program: WebGLProgram, name: string, value: number): void {
    const loc = this.getLocation(gl, program, name);
    if (loc === null) return;
    if (!isValidUniform(value)) {
      logger.warn('Uniforms', `Invalid uniform value for "${name}": ${value}, skipping`);
      return;
    }
    gl.uniform1f(loc, value);
  }

  set2f(gl: WebGL2RenderingContext, program: WebGLProgram, name: string, x: number, y: number): void {
    const loc = this.getLocation(gl, program, name);
    if (loc === null) return;
    gl.uniform2f(loc, x, y);
  }

  set1i(gl: WebGL2RenderingContext, program: WebGLProgram, name: string, value: number): void {
    const loc = this.getLocation(gl, program, name);
    if (loc === null) return;
    gl.uniform1i(loc, value);
  }

  /** Remove cached locations for a program (call when program is deleted). */
  invalidate(program: WebGLProgram): void {
    this.locations.delete(program);
  }
}
