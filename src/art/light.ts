/**
 * Light that adds to the real room. In passthrough the app's frame is composited over the camera image
 * by its alpha: plain additive blending still writes alpha, so a dim glow darkens the room behind it.
 * This blend adds colour and leaves alpha untouched, so a glow only ever brightens what you see.
 */
import { AddEquation, CustomBlending, OneFactor, SrcAlphaFactor, ZeroFactor, type Material } from '@iwsdk/core';

export function asLight<M extends Material>(m: M): M {
  m.transparent = true;
  m.depthWrite = false;
  m.blending = CustomBlending;
  m.blendEquation = AddEquation;
  m.blendSrc = SrcAlphaFactor;
  m.blendDst = OneFactor;
  m.blendEquationAlpha = AddEquation;
  m.blendSrcAlpha = ZeroFactor;
  m.blendDstAlpha = OneFactor;
  return m;
}
