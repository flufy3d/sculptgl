define([
  'misc/Utils',
  'render/Render',
  'render/Buffer'
], function (Utils, Render, Buffer) {

  'use strict';

  var LowRender = function (render) {
    this.renderOrigin_ = render; // the base render

    var gl = render.getGL(); // webgl context
    this.indexBuffer_ = new Buffer(gl, gl.ELEMENT_ARRAY_BUFFER, gl.STATIC_DRAW); // index buffer
    this.wireframeBuffer_ = new Buffer(gl, gl.ELEMENT_ARRAY_BUFFER, gl.STATIC_DRAW); // wireframe buffer
  };

  LowRender.prototype = {
    /** Return base render */
    getRenderOrigin: function () {
      return this.renderOrigin_;
    },
    /** Return index buffer */
    getIndexBuffer: function () {
      return this.indexBuffer_;
    },
    /** Return wireframe buffer */
    getWireframeBuffer: function () {
      return this.wireframeBuffer_;
    },
    /** No flat shading because we can't share vertices buffer with higher resolution */
    isUsingDrawArrays: function () {
      return false;
    },
    /** Updates buffer */
    updateBuffers: function (mesh) {
      this.getIndexBuffer().update(mesh.getTriangles());
      this.getWireframeBuffer().update(mesh.getWireframe());
    },
    /** Render the mesh */
    render: function (main) {
      var ro = this.getRenderOrigin();
      ro.shader_.draw(this, main);
      if (ro.getShowWireframe())
        ro.shaderWireframe_.draw(this, main);
    },
    /** Free gl memory */
    release: function () {
      this.getIndexBuffer().release();
      this.getWireframeBuffer().release();
    }
  };

  Utils.makeProxy(Render, LowRender, function (proto) {
    return function () {
      return proto.apply(this.getRenderOrigin(), arguments);
    };
  });

  return LowRender;
});