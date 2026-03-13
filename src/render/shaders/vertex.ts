/**
 * Vertex shader: draws a fullscreen quad.
 *
 * Input: attribute a_position in [-1, 1] (clip space)
 * Output: v_uv in [0, 1], gl_Position in clip space
 *
 * UV (0,0) = top-left, matching canvas/video orientation (Y flipped).
 */
export const VERTEX_SHADER_SOURCE = /* glsl */ `#version 300 es
precision highp float;

in vec2 a_position;

out vec2 v_uv;

void main() {
  v_uv = vec2(a_position.x * 0.5 + 0.5, 0.5 - a_position.y * 0.5);
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;
