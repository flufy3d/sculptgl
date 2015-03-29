define([
  'render/shaders/ShaderBase',
  'render/Attribute'
], function (ShaderBase, Attribute) {

  'use strict';

  var ShaderRtt = ShaderBase.getCopy();
  ShaderRtt.uniforms = {};
  ShaderRtt.attributes = {};

  ShaderRtt.uniformNames = ['uTexture0'];

  ShaderRtt.vertex = [
    'attribute vec2 aVertex;',
    'varying vec2 vTexCoord;',
    'void main() {',
    '  vTexCoord = aVertex * 0.5 + 0.5;',
    '  gl_Position = vec4(aVertex, 0.5, 1.0);',
    '}'
  ].join('\n');

  ShaderRtt.fragment = [
    'precision mediump float;',
    'uniform sampler2D uTexture0;',
    'varying vec2 vTexCoord;',
    'void main() {',
    // http://filmicgames.com/archives/75
    '  vec3 x = max(vec3(0.0), texture2D(uTexture0,vTexCoord).rgb-vec3(0.004));',
    '  gl_FragColor = vec4((x*(6.2*x+0.5))/(x*(6.2*x+1.7)+0.06) , 1.0);',
    '}'
  ].join('\n');

  ShaderRtt.draw = function (rtt) {
    var gl = rtt.getGL();
    gl.useProgram(this.program);

    ShaderRtt.attributes.aVertex.bindToBuffer(rtt.getVertexBuffer());

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, rtt.getTexture());
    gl.uniform1i(this.uniforms.uTexture0, 0);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };
  ShaderRtt.initAttributes = function (gl) {
    ShaderRtt.attributes.aVertex = new Attribute(gl, ShaderRtt.program, 'aVertex', 2, gl.FLOAT);
  };

  return ShaderRtt;
});