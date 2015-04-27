define([
  'misc/getUrlOptions',
  'render/Shader',
  'render/Buffer',
  'render/shaders/ShaderMatcap'
], function (getUrlOptions, Shader, Buffer, ShaderMatcap) {

  'use strict';

  var Render = function (gl, mesh) {
    this.mesh_ = mesh;
    this.gl_ = gl;

    this.shader_ = new Shader(gl);
    this.shaderWireframe_ = new Shader(gl);

    var opts = getUrlOptions();
    this.flatShading_ = opts.flatshading;
    this.showWireframe_ = opts.wireframe;
    this.matcap_ = Math.min(opts.matcap, ShaderMatcap.matcaps.length - 1); // matcap id
    this.curvature_ = Math.min(opts.curvature, 5.0);
    this.texture0_ = null;

    this.vertexBuffer_ = new Buffer(gl, gl.ARRAY_BUFFER, gl.DYNAMIC_DRAW);
    this.normalBuffer_ = new Buffer(gl, gl.ARRAY_BUFFER, gl.DYNAMIC_DRAW);
    this.colorBuffer_ = new Buffer(gl, gl.ARRAY_BUFFER, gl.DYNAMIC_DRAW);
    this.materialBuffer_ = new Buffer(gl, gl.ARRAY_BUFFER, gl.DYNAMIC_DRAW);
    this.texCoordBuffer_ = new Buffer(gl, gl.ARRAY_BUFFER, gl.STATIC_DRAW);
    this.indexBuffer_ = new Buffer(gl, gl.ELEMENT_ARRAY_BUFFER, gl.STATIC_DRAW);
    this.wireframeBuffer_ = new Buffer(gl, gl.ELEMENT_ARRAY_BUFFER, gl.STATIC_DRAW);

    // these material values overrides the vertex attributes
    // it's here for debug or preview
    this.albedo_ = new Float32Array([-1.0, -1.0, -1.0]);
    this.roughness_ = -0.18;
    this.metallic_ = -0.78;
    this.alpha_ = 1.0;
  };

  Render.ONLY_DRAW_ARRAYS = false;

  Render.prototype = {
    getGL: function () {
      return this.gl_;
    },
    getMesh: function () {
      return this.mesh_;
    },
    getAlbedo: function () {
      return this.albedo_;
    },
    getRoughness: function () {
      return this.roughness_;
    },
    getMetallic: function () {
      return this.metallic_;
    },
    setAlbedo: function (val) {
      this.albedo_[0] = val[0];
      this.albedo_[1] = val[1];
      this.albedo_[2] = val[2];
    },
    setRoughness: function (val) {
      this.roughness_ = val;
    },
    setMetallic: function (val) {
      this.metallic_ = val;
    },
    getShader: function () {
      return this.shader_;
    },
    getShaderType: function () {
      return this.getShader().getType();
    },
    getVertexBuffer: function () {
      return this.vertexBuffer_;
    },
    getNormalBuffer: function () {
      return this.normalBuffer_;
    },
    getColorBuffer: function () {
      return this.colorBuffer_;
    },
    getMaterialBuffer: function () {
      return this.materialBuffer_;
    },
    getTexCoordBuffer: function () {
      return this.texCoordBuffer_;
    },
    getIndexBuffer: function () {
      return this.indexBuffer_;
    },
    getWireframeBuffer: function () {
      return this.wireframeBuffer_;
    },
    /** Return true if the render is using drawArrays instead of drawElements */
    isUsingDrawArrays: function () {
      return Render.ONLY_DRAW_ARRAYS ? true : this.getFlatShading();
    },
    /** Return true if the shader is using UVs */
    isUsingTexCoords: function () {
      return this.shader_.isUsingTexCoords();
    },
    setOpacity: function (alpha) {
      this.alpha_ = alpha;
    },
    getOpacity: function () {
      return this.alpha_;
    },
    setCurvature: function (cur) {
      this.curvature_ = cur;
    },
    getCurvature: function () {
      return this.curvature_;
    },
    isTransparent: function () {
      return this.alpha_ < 0.99;
    },
    getFlatShading: function () {
      return this.flatShading_;
    },
    getShowWireframe: function () {
      return this.showWireframe_;
    },
    getTexture0: function () {
      return this.texture0_;
    },
    setTexture0: function (tex) {
      this.texture0_ = tex;
    },
    getMatcap: function () {
      return this.matcap_;
    },
    setMatcap: function (idMat) {
      this.matcap_ = idMat;
    },
    // this.setTexture0(ShaderMatcap.textures[idMat]);
    setShowWireframe: function (showWireframe) {
      this.showWireframe_ = Render.ONLY_DRAW_ARRAYS ? false : showWireframe;
      this.updateWireframeBuffer();
    },
    setFlatShading: function (flatShading) {
      this.flatShading_ = flatShading;
      this.updateFlatShading();
      this.updateBuffers();
    },
    setShader: function (shaderType) {
      var hasUV = this.mesh_.hasUV();
      if (shaderType === Shader.mode.UV && !hasUV)
        return;
      this.shader_.setType(shaderType);
      if (hasUV) {
        this.mesh_.updateDuplicateGeometry();
        this.mesh_.updateDuplicateColorsAndMaterials();
        if (this.isUsingTexCoords())
          this.updateFlatShading();
      }
      this.updateBuffers();
    },
    updateFlatShading: function (iFaces) {
      if (this.isUsingDrawArrays())
        this.mesh_.updateDrawArrays(this.getFlatShading(), iFaces);
    },
    initRender: function () {
      this.shaderWireframe_.setType(Shader.mode.WIREFRAME);
      if (this.getShaderType() === Shader.mode.MATCAP && !this.texture0_)
        this.setMatcap(this.matcap_);
      this.setShader(this.getShaderType());
      this.setShowWireframe(this.getShowWireframe());
    },
    render: function (main) {
      this.shader_.draw(this, main);
      if (this.getShowWireframe())
        this.shaderWireframe_.draw(this, main);
    },
    renderFlatColor: function (main) {
      Shader[Shader.mode.FLAT].getOrCreate(this.getGL()).draw(this, main);
    },
    updateVertexBuffer: function () {
      this.getVertexBuffer().update(this.mesh_.getRenderVertices());
    },
    updateNormalBuffer: function () {
      this.getNormalBuffer().update(this.mesh_.getRenderNormals());
    },
    updateColorBuffer: function () {
      this.getColorBuffer().update(this.mesh_.getRenderColors());
    },
    updateMaterialBuffer: function () {
      this.getMaterialBuffer().update(this.mesh_.getRenderMaterials());
    },
    updateTexCoordBuffer: function () {
      if (this.isUsingTexCoords())
        this.getTexCoordBuffer().update(this.mesh_.getRenderTexCoords());
    },
    updateIndexBuffer: function () {
      if (!this.isUsingDrawArrays())
        this.getIndexBuffer().update(this.mesh_.getRenderTriangles());
    },
    updateWireframeBuffer: function () {
      if (this.getShowWireframe())
        this.getWireframeBuffer().update(this.mesh_.getWireframe());
    },
    updateGeometryBuffers: function () {
      this.updateVertexBuffer();
      this.updateNormalBuffer();
    },
    updateBuffers: function () {
      this.updateGeometryBuffers();
      this.updateColorBuffer();
      this.updateMaterialBuffer();
      this.updateTexCoordBuffer();
      this.updateIndexBuffer();
      this.updateWireframeBuffer();
    },
    release: function () {
      if (this.getTexture0())
        this.getGL().deleteTexture(this.getTexture0());
      this.getVertexBuffer().release();
      this.getNormalBuffer().release();
      this.getColorBuffer().release();
      this.getMaterialBuffer().release();
      this.getIndexBuffer().release();
      this.getWireframeBuffer().release();
    },
    copyRenderConfig: function (mesh) {
      this.setFlatShading(mesh.getFlatShading());
      this.setShowWireframe(mesh.getShowWireframe());
      this.setShader(mesh.getShaderType());
      this.setMatcap(mesh.getMatcap());
      this.setTexture0(mesh.getTexture0());
      this.setCurvature(mesh.getCurvature());
      this.setOpacity(mesh.getOpacity());
    }
  };

  return Render;
});