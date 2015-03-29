define([
  'lib/glMatrix',
  'misc/Utils',
  'editor/Sculpt',
  'editor/Subdivision',
  'files/Import',
  'files/ReplayWriter',
  'files/ReplayReader',
  'gui/Gui',
  'math3d/Camera',
  'math3d/Picking',
  'mesh/Background',
  'mesh/Selection',
  'mesh/Grid',
  'mesh/Mesh',
  'mesh/multiresolution/Multimesh',
  'mesh/Primitive',
  'states/States',
  'render/Render',
  'render/Rtt',
  'render/shaders/ShaderMatcap',
  'render/WebGLCaps'
], function (glm, Utils, Sculpt, Subdivision, Import, ReplayWriter, ReplayReader, Gui, Camera, Picking, Background, Selection, Grid, Mesh, Multimesh, Primitive, States, Render, Rtt, ShaderMatcap, WebGLCaps) {

  'use strict';

  var SculptGL = function () {
    this.gl_ = null; // webgl context
    this.canvas_ = document.getElementById('canvas');

    // controllers stuffs
    this.mouseX_ = 0; // the x position
    this.mouseY_ = 0; // the y position
    this.lastMouseX_ = 0; // the last x position
    this.lastMouseY_ = 0; // the last y position
    this.mouseButton_ = 0; // which mouse button is pressed

    // masking
    this.checkMask_ = false;
    this.maskX_ = 0;
    this.maskY_ = 0;

    // core of the app
    this.states_ = new States(this); // for undo-redo
    this.sculpt_ = new Sculpt(this.states_); // sculpting management
    this.camera_ = new Camera(); // the camera
    this.picking_ = new Picking(this); // the ray picking
    this.pickingSym_ = new Picking(this, true); // the symmetrical picking

    // renderable stuffs
    this.showGrid_ = true;
    this.grid_ = null; // the grid
    this.background_ = null; // the background
    this.selection_ = null; // the selection geometry
    this.meshes_ = []; // the meshes
    this.mesh_ = null; // the selected mesh
    this.rtt_ = null; // rtt

    // ui stuffs
    this.gui_ = new Gui(this); // gui
    this.focusGui_ = false; // if the gui is being focused

    // misc stuffs
    this.replayerWriter_ = new ReplayWriter(this); // the user event stack replayer
    this.replayerReader_ = new ReplayReader(this); // reader replayer
    this.isReplayed_ = false; // if we want to save the replay mode

    this.preventRender_ = false; // prevent multiple render per frame
    this.drawFullScene_ = false; // render everything on the rtt
    this.autoMatrix_ = true; // scale and center the imported meshes
  };

  SculptGL.prototype = {
    /** Initialization */
    start: function () {
      this.initWebGL();
      if (!this.gl_)
        return;
      this.background_ = new Background(this.gl_, this);
      this.selection_ = new Selection(this.gl_);
      this.grid_ = new Grid(this.gl_);
      this.rtt_ = new Rtt(this.gl_);

      this.loadTextures();
      this.gui_.initGui();
      this.onCanvasResize();
      this.addEvents();
      this.addSphere();
      this.getReplayReader().checkURL();
    },
    getReplayWriter: function () {
      return this.replayerWriter_;
    },
    getReplayReader: function () {
      return this.replayerReader_;
    },
    getBackground: function () {
      return this.background_;
    },
    getCanvas: function () {
      return this.canvas_;
    },
    getCamera: function () {
      return this.camera_;
    },
    getGui: function () {
      return this.gui_;
    },
    getMeshes: function () {
      return this.meshes_;
    },
    getMesh: function () {
      return this.mesh_;
    },
    getPicking: function () {
      return this.picking_;
    },
    getPickingSymmetry: function () {
      return this.pickingSym_;
    },
    getSculpt: function () {
      return this.sculpt_;
    },
    getStates: function () {
      return this.states_;
    },
    isReplayed: function () {
      return this.isReplayed_;
    },
    setReplayed: function (isReplayed) {
      this.isReplayed_ = isReplayed;
    },
    setMesh: function (mesh) {
      this.mesh_ = mesh;
      this.getGui().updateMesh();
      this.render();
    },
    renderSelectOverRtt: function () {
      if (this.requestRender())
        this.drawFullScene_ = false;
    },
    /** Request a render */
    render: function () {
      this.drawFullScene_ = true;
      this.requestRender();
    },
    requestRender: function () {
      if (this.preventRender_ === true)
        return false; // render already requested for the next frame
      window.requestAnimationFrame(this.applyRender.bind(this));
      this.preventRender_ = true;
      return true;
    },
    /** Render the scene */
    applyRender: function () {
      this.preventRender_ = false;
      this.computeMatricesAndSort();
      var gl = this.gl_;

      gl.disable(gl.DEPTH_TEST);
      // gl.enable(gl.CULL_FACE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.rtt_.getFramebuffer());

      if (this.drawFullScene_) {
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        this.background_.render();

        gl.enable(gl.DEPTH_TEST);
        if (this.showGrid_)
          this.grid_.render();
        for (var i = 0, meshes = this.meshes_, nb = meshes.length; i < nb; ++i)
          meshes[i].render(this);
      }

      // render to screen
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.disable(gl.DEPTH_TEST);
      this.rtt_.render();
      this.selection_.render(this);
    },
    /** Pre compute matrices and sort meshes */
    computeMatricesAndSort: function () {
      var meshes = this.meshes_;
      var cam = this.camera_;
      if (meshes.length > 0)
        cam.optimizeNearFar(this.computeBoundingBoxMeshes(meshes));
      this.grid_.computeMatrices(cam);
      for (var i = 0, nb = meshes.length; i < nb; ++i)
        meshes[i].computeMatrices(cam);
      this.selection_.computeMatrices(this);
      meshes.sort(Mesh.sortFunction);
    },
    /** Load webgl context */
    initWebGL: function () {
      var attributes = {
        antialias: false,
        stencil: true
      };
      var canvas = document.getElementById('canvas');
      var gl = this.gl_ = canvas.getContext('webgl', attributes) || canvas.getContext('experimental-webgl', attributes);
      if (!gl) {
        window.alert('Could not initialise WebGL. No WebGL, no SculptGL. Sorry.');
        return;
      }
      WebGLCaps.initWebGLExtensions(gl);
      if (!WebGLCaps.getWebGLExtension('OES_element_index_uint'))
        Render.ONLY_DRAW_ARRAYS = true;
      gl.viewportWidth = window.innerWidth;
      gl.viewportHeight = window.innerHeight;
      gl.clearColor(0.033, 0.033, 0.033, 1);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      gl.depthFunc(gl.LEQUAL);
      gl.cullFace(gl.BACK);
    },
    /** Load textures (preload) */
    loadTextures: function () {
      var self = this;
      var loadTex = function (path, idMaterial) {
        var mat = new Image();
        mat.src = path;
        var gl = self.gl_;
        mat.onload = function () {
          var idTex = gl.createTexture();
          gl.bindTexture(gl.TEXTURE_2D, idTex);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, mat);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
          gl.generateMipmap(gl.TEXTURE_2D);
          gl.bindTexture(gl.TEXTURE_2D, null);
          ShaderMatcap.textures[idMaterial] = idTex;
          self.render();
        };
      };
      for (var i = 0, mats = ShaderMatcap.matcaps, l = mats.length; i < l; ++i)
        loadTex(mats[i].path, i);

      this.initAlphaTextures();
    },
    initAlphaTextures: function () {
      var self = this;
      var alphas = Picking.ALPHAS_PATHS;
      var loadAlpha = function (alphas, id) {
        var am = new Image();
        am.src = 'resources/alpha/' + alphas[id];
        am.onload = function () {
          self.onLoadAlphaImage(am);
          if (id < alphas.length - 1)
            loadAlpha(alphas, id + 1);
        };
      };
      loadAlpha(alphas, 0);
    },
    /** Called when the window is resized */
    onCanvasResize: function () {
      var newWidth = this.gl_.viewportWidth = this.camera_.width_ = this.canvas_.width;
      var newHeight = this.gl_.viewportHeight = this.camera_.height_ = this.canvas_.height;

      if (!this.isReplayed())
        this.getReplayWriter().pushAction('CAMERA_SIZE', newWidth, newHeight);

      this.background_.onResize(newWidth, newHeight);
      this.rtt_.onResize(newWidth, newHeight);
      this.gl_.viewport(0, 0, newWidth, newHeight);
      this.camera_.updateProjection();
      this.render();
    },
    /** Initialize */
    addEvents: function () {
      var canvas = this.canvas_;

      var cbMouseMove = Utils.throttle(this.onMouseMove.bind(this), 16.66);
      var cbMouseDown = this.onMouseDown.bind(this);
      var cbMouseUp = this.onMouseUp.bind(this);
      var cbMouseOut = this.onMouseOut.bind(this);
      var cbMouseOver = this.onMouseOver.bind(this);
      var cbMouseWheel = this.onMouseWheel.bind(this);
      var cbTouchStart = this.onTouchStart.bind(this);
      var cbTouchMove = this.onTouchMove.bind(this);

      // mouse
      canvas.addEventListener('mousedown', cbMouseDown, false);
      canvas.addEventListener('mouseup', cbMouseUp, false);
      canvas.addEventListener('mouseout', cbMouseOut, false);
      canvas.addEventListener('mouseover', cbMouseOver, false);
      canvas.addEventListener('mousemove', cbMouseMove, false);
      canvas.addEventListener('mousewheel', cbMouseWheel, false);
      canvas.addEventListener('DOMMouseScroll', cbMouseWheel, false);

      // multi touch
      canvas.addEventListener('touchstart', cbTouchStart, false);
      canvas.addEventListener('touchmove', cbTouchMove, false);
      canvas.addEventListener('touchend', cbMouseUp, false);
      canvas.addEventListener('touchcancel', cbMouseUp, false);
      canvas.addEventListener('touchleave', cbMouseUp, false);

      var cbContextLost = this.onContextLost.bind(this);
      var cbContextRestored = this.onContextRestored.bind(this);
      var cbLoadFiles = this.loadFiles.bind(this);
      var cbStopAndPrevent = this.stopAndPrevent.bind(this);

      // misc
      canvas.addEventListener('webglcontextlost', cbContextLost, false);
      canvas.addEventListener('webglcontextrestored', cbContextRestored, false);
      window.addEventListener('dragenter', cbStopAndPrevent, false);
      window.addEventListener('dragover', cbStopAndPrevent, false);
      window.addEventListener('drop', cbLoadFiles, false);
      document.getElementById('fileopen').addEventListener('change', cbLoadFiles, false);

      this.removeCallback = function () {
        // mouse
        canvas.removeEventListener('mousedown', cbMouseDown, false);
        canvas.removeEventListener('mouseup', cbMouseUp, false);
        canvas.removeEventListener('mouseout', cbMouseOut, false);
        canvas.removeEventListener('mouseover', cbMouseOver, false);
        canvas.removeEventListener('mousemove', cbMouseMove, false);
        canvas.removeEventListener('mousewheel', cbMouseWheel, false);
        canvas.removeEventListener('DOMMouseScroll', cbMouseWheel, false);

        // multi touch
        canvas.removeEventListener('touchstart', cbTouchStart, false);
        canvas.removeEventListener('touchmove', cbTouchMove, false);
        canvas.removeEventListener('touchend', cbMouseUp, false);
        canvas.removeEventListener('touchcancel', cbMouseUp, false);
        canvas.removeEventListener('touchleave', cbMouseUp, false);

        // misc
        canvas.removeEventListener('webglcontextlost', cbContextLost, false);
        canvas.removeEventListener('webglcontextrestored', cbContextRestored, false);
        window.removeEventListener('dragenter', cbStopAndPrevent, false);
        window.removeEventListener('dragover', cbStopAndPrevent, false);
        window.removeEventListener('drop', cbLoadFiles, false);
        document.getElementById('fileopen').removeEventListener('change', cbLoadFiles, false);
      };
    },
    stopAndPrevent: function (event) {
      event.stopPropagation();
      event.preventDefault();
    },
    removeEvents: function () {
      if (this.removeCallback) this.removeCallback();
    },
    /** Return the file type */
    getFileType: function (name) {
      var lower = name.toLowerCase();
      if (lower.endsWith('.obj')) return 'obj';
      if (lower.endsWith('.sgl')) return 'sgl';
      if (lower.endsWith('.stl')) return 'stl';
      if (lower.endsWith('.ply')) return 'ply';
      if (lower.endsWith('.rep')) return 'rep';
      return;
    },
    /** Load file */
    loadFiles: function (event) {
      event.stopPropagation();
      event.preventDefault();
      var files = event.dataTransfer ? event.dataTransfer.files : event.target.files;
      for (var i = 0, nb = files.length; i < nb; ++i) {
        var file = files[i];
        var fileType = this.getFileType(file.name);
        this.readFile(file, fileType);
        if (fileType === 'rep')
          return;
      }
    },
    readFile: function (file, ftype) {
      var fileType = ftype || this.getFileType(file.name);
      if (!fileType)
        return;

      var reader = new FileReader();
      var self = this;
      reader.onload = function (evt) {
        if (fileType === 'rep')
          self.getReplayReader().import(evt.target.result, null, file.name.substr(0, file.name.length - 4));
        else
          self.loadScene(evt.target.result, fileType, self.autoMatrix_);
        document.getElementById('fileopen').value = '';
      };

      if (fileType === 'obj')
        reader.readAsText(file);
      else
        reader.readAsArrayBuffer(file);
    },
    computeBoundingBoxMeshes: function (meshes) {
      var bigBound = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
      var vec3 = glm.vec3;
      var min = [0.0, 0.0, 0.0];
      var max = [0.0, 0.0, 0.0];
      for (var i = 0, l = meshes.length; i < l; ++i) {
        var bound = meshes[i].getBound();
        var mat = meshes[i].getMatrix();
        vec3.transformMat4(min, bound, mat);
        max[0] = bound[3];
        max[1] = bound[4];
        max[2] = bound[5];
        vec3.transformMat4(max, max, mat);
        if (min[0] < bigBound[0]) bigBound[0] = min[0];
        if (min[1] < bigBound[1]) bigBound[1] = min[1];
        if (min[2] < bigBound[2]) bigBound[2] = min[2];
        if (max[0] > bigBound[3]) bigBound[3] = max[0];
        if (max[1] > bigBound[4]) bigBound[4] = max[1];
        if (max[2] > bigBound[5]) bigBound[5] = max[2];
      }
      return bigBound;
    },
    scaleAndCenterMeshes: function (meshes) {
      var vec3 = glm.vec3;
      var mat4 = glm.mat4;
      var box = this.computeBoundingBoxMeshes(meshes);
      var scale = Utils.SCALE / vec3.dist([box[0], box[1], box[2]], [box[3], box[4], box[5]]);

      var mCen = mat4.create();
      mat4.scale(mCen, mCen, [scale, scale, scale]);
      mat4.translate(mCen, mCen, [-(box[0] + box[3]) * 0.5, -(box[1] + box[4]) * 0.5, -(box[2] + box[5]) * 0.5]);

      for (var i = 0, l = meshes.length; i < l; ++i) {
        var mesh = meshes[i];
        var mat = mesh.getMatrix();
        mat4.mul(mat, mCen, mat);
      }
    },
    /** Load a file */
    loadScene: function (fileData, fileType, autoMatrix) {
      var newMeshes;
      if (fileType === 'obj') newMeshes = Import.importOBJ(fileData, this.gl_);
      else if (fileType === 'sgl') newMeshes = Import.importSGL(fileData, this.gl_);
      else if (fileType === 'stl') newMeshes = Import.importSTL(fileData, this.gl_);
      else if (fileType === 'ply') newMeshes = Import.importPLY(fileData, this.gl_);
      var nbNewMeshes = newMeshes.length;
      if (nbNewMeshes === 0)
        return;

      var meshes = this.meshes_;
      for (var i = 0; i < nbNewMeshes; ++i) {
        var mesh = newMeshes[i] = new Multimesh(newMeshes[i]);
        mesh.init();
        mesh.initRender();
        meshes.push(mesh);
      }

      if (!this.isReplayed())
        this.getReplayWriter().pushLoadMeshes(newMeshes, fileData, fileType, autoMatrix);

      if (autoMatrix)
        this.scaleAndCenterMeshes(newMeshes);
      this.states_.pushStateAdd(newMeshes);
      this.setMesh(meshes[meshes.length - 1]);
      this.camera_.resetView();
      return newMeshes;
    },
    /** Load the sphere */
    addSphere: function () {
      if (!this.isReplayed())
        this.getReplayWriter().pushAction('ADD_SPHERE');

      // make a cube and subdivide it
      var mesh = new Multimesh(Primitive.createCube(this.gl_));
      while (mesh.getNbFaces() < 50000)
        mesh.addLevel();
      // discard the very low res
      mesh.meshes_.splice(0, 4);
      mesh.sel_ -= 4;

      return this.addNewMesh(mesh);
    },
    addCube: function () {
      if (!this.isReplayed())
        this.getReplayWriter().pushAction('ADD_CUBE');

      var mesh = new Multimesh(Primitive.createCube(this.gl_));
      glm.mat4.scale(mesh.getMatrix(), mesh.getMatrix(), [0.7, 0.7, 0.7]);
      Subdivision.LINEAR = true;
      while (mesh.getNbFaces() < 50000)
        mesh.addLevel();
      // discard the very low res
      mesh.meshes_.splice(0, 4);
      mesh.sel_ -= 4;
      Subdivision.LINEAR = false;

      return this.addNewMesh(mesh);
    },
    addNewMesh: function (mesh) {
      this.meshes_.push(mesh);
      this.states_.pushStateAdd(mesh);
      this.setMesh(mesh);
      return mesh;
    },
    /** Clear the scene */
    clearScene: function () {
      this.getStates().reset();
      this.getMeshes().length = 0;
      this.getCamera().resetView();
      this.showGrid_ = true;
      this.setMesh(null);
      this.mouseButton_ = 0;
      this.getReplayWriter().reset();
    },
    /** Delete the current selected mesh */
    deleteCurrentMesh: function () {
      if (!this.mesh_)
        return;

      if (!this.isReplayed())
        this.getReplayWriter().pushAction('DELETE_CURRENT_MESH');

      this.states_.pushStateRemove(this.mesh_);
      this.meshes_.splice(this.meshes_.indexOf(this.mesh_), 1);
      this.setMesh(null);
    },
    /** WebGL context is lost */
    onContextLost: function () {
      window.alert('Oops... WebGL context lost.');
    },
    /** WebGL context is restored */
    onContextRestored: function () {
      window.alert('Wow... Context is restored.');
    },
    /** Mouse over event */
    onMouseOver: function () {
      this.focusGui_ = false;
    },
    /** Mouse out event */
    onMouseOut: function (event) {
      this.focusGui_ = true;
      this.onMouseUp(event);
    },
    /** Mouse released event */
    onMouseUp: function (event) {
      event.preventDefault();

      if (!this.isReplayed())
        this.getReplayWriter().pushDeviceUp();

      this.canvas_.style.cursor = 'default';
      this.mouseButton_ = 0;
      Multimesh.RENDER_HINT = Multimesh.NONE;
      this.sculpt_.end();
      if (this.checkMask_) {
        this.checkMask_ = false;
        if (this.mesh_) {
          if (this.lastMouseX_ === this.maskX_ && this.lastMouseY_ === this.maskY_)
            this.getSculpt().getTool('MASKING').invert(this.mesh_, this);
          else
            this.getSculpt().getTool('MASKING').clear(this.mesh_, this);
        }
      }
      this.render();
    },
    /** Mouse wheel event */
    onMouseWheel: function (event) {
      event.stopPropagation();
      event.preventDefault();

      var dir = (event.detail < 0 || event.wheelDelta > 0) ? 1 : -1;
      if (!this.isReplayed())
        this.getReplayWriter().pushAction('DEVICE_WHEEL', dir);

      this.camera_.zoom(dir * 0.02);
      Multimesh.RENDER_HINT = Multimesh.CAMERA;
      this.render();
      // workaround for "end mouse wheel" event
      if (this.timerEndWheel_)
        window.clearTimeout(this.timerEndWheel_);
      this.timerEndWheel_ = window.setTimeout(this.endWheel.bind(this), 300);
    },
    endWheel: function () {
      Multimesh.RENDER_HINT = Multimesh.NONE;
      this.render();
    },
    /** Set mouse position from event */
    setMousePosition: function (event) {
      this.mouseX_ = event.pageX - this.canvas_.offsetLeft;
      this.mouseY_ = event.pageY - this.canvas_.offsetTop;
    },
    /** Touch start event */
    onTouchStart: function (event) {
      event.stopPropagation();
      event.preventDefault();
      var touches = event.targetTouches;
      var evProxy = {};
      evProxy.pageX = touches[0].pageX;
      evProxy.pageY = touches[0].pageY;
      if (touches.length === 1) evProxy.which = 1;
      else if (touches.length === 2) evProxy.which = 4;
      else evProxy.which = 2;
      this.onDeviceDown(evProxy);
    },
    /** Touch move event */
    onTouchMove: function (event) {
      event.stopPropagation();
      event.preventDefault();
      var touches = event.targetTouches;
      var evProxy = {};
      evProxy.pageX = touches[0].pageX;
      evProxy.pageY = touches[0].pageY;
      this.onDeviceMove(evProxy);
    },
    /** Mouse down event */
    onMouseDown: function (event) {
      event.stopPropagation();
      event.preventDefault();
      this.onDeviceDown(event);
    },
    /** Mouse move event */
    onMouseMove: function (event) {
      event.stopPropagation();
      event.preventDefault();
      this.onDeviceMove(event);
    },
    /** Device down event */
    onDeviceDown: function (event) {
      if (!this.isReplayed()) {
        if (this.focusGui_)
          return;
        this.setMousePosition(event);
      }
      var mouseX = this.mouseX_;
      var mouseY = this.mouseY_;
      var button = this.mouseButton_ = event.which;

      if (!this.isReplayed())
        this.getReplayWriter().pushDeviceDown(button, mouseX, mouseY, event);

      if (button === 1)
        this.sculpt_.start(this);
      var picking = this.picking_;
      var pickedMesh = picking.getMesh();
      if (button === 1 && pickedMesh)
        this.canvas_.style.cursor = 'none';

      this.checkMask_ = false;
      if (button === 3 && event.ctrlKey)
        this.mouseButton_ = 4; // zoom camera
      else if (button === 2)
        this.mouseButton_ = 5; // pan camera (wheel mode)
      else if (!pickedMesh && event.ctrlKey) {
        this.maskX_ = mouseX;
        this.maskY_ = mouseY;
        this.checkMask_ = true;
        this.mouseButton_ = 0; // mask edit mode
      } else if ((!pickedMesh || button === 3) && event.altKey)
        this.mouseButton_ = 2; // pan camera
      else if (button === 3 || (button === 1 && !pickedMesh)) {
        this.mouseButton_ = 3; // rotate camera
        if (this.camera_.usePivot_)
          picking.intersectionMouseMeshes(this.meshes_, mouseX, mouseY);
        this.camera_.start(mouseX, mouseY, picking);
      }

      this.lastMouseX_ = mouseX;
      this.lastMouseY_ = mouseY;
    },
    /** Device move event */
    onDeviceMove: function (event) {
      if (!this.isReplayed()) {
        if (this.focusGui_)
          return;
        this.setMousePosition(event);
      }
      var mouseX = this.mouseX_;
      var mouseY = this.mouseY_;
      var button = this.mouseButton_;

      if (!this.isReplayed())
        this.getReplayWriter().pushDeviceMove(mouseX, mouseY, event);

      if (button !== 1 || this.sculpt_.allowPicking()) {
        Multimesh.RENDER_HINT = Multimesh.PICKING;
        if (this.mesh_ && button === 1)
          this.picking_.intersectionMouseMesh(this.mesh_, mouseX, mouseY);
        else
          this.picking_.intersectionMouseMeshes(this.meshes_, mouseX, mouseY);
        if (this.sculpt_.getSymmetry() && this.mesh_)
          this.pickingSym_.intersectionMouseMesh(this.mesh_, mouseX, mouseY);
      }
      if (button !== 0) {
        if (button === 4 || (button === 2 && !event.altKey)) {
          this.camera_.zoom((mouseX - this.lastMouseX_ + mouseY - this.lastMouseY_) / 1000);
          Multimesh.RENDER_HINT = Multimesh.CAMERA;
          this.render();
        } else if (button === 2 || button === 5) {
          this.camera_.translate((mouseX - this.lastMouseX_) / 1000, (mouseY - this.lastMouseY_) / 1000);
          Multimesh.RENDER_HINT = Multimesh.CAMERA;
          this.render();
        } else if (button === 3) {
          if (event.shiftKey) this.camera_.snapClosestRotation();
          else this.camera_.rotate(mouseX, mouseY);
          Multimesh.RENDER_HINT = Multimesh.CAMERA;
          this.render();
        } else if (button === 1) {
          Multimesh.RENDER_HINT = Multimesh.SCULPT;
          this.sculpt_.update(this);
          if (this.getMesh().getDynamicTopology)
            this.gui_.updateMeshInfo();
        }
      }
      this.lastMouseX_ = mouseX;
      this.lastMouseY_ = mouseY;
      this.renderSelectOverRtt();
    },
    getIndexMesh: function (mesh) {
      var meshes = this.meshes_;
      var id = mesh.getID();
      for (var i = 0, nbMeshes = meshes.length; i < nbMeshes; ++i) {
        var testMesh = meshes[i];
        if (testMesh === mesh || testMesh.getID() === id)
          return i;
      }
      return -1;
    },
    /** Replace a mesh in the scene */
    replaceMesh: function (mesh, newMesh) {
      var index = this.getIndexMesh(mesh);
      if (index >= 0) this.meshes_[index] = newMesh;
      if (this.mesh_ === mesh) this.setMesh(newMesh);
    },
    onLoadAlphaImage: function (img, name, tool) {
      var can = document.createElement('canvas');
      can.width = img.width;
      can.height = img.height;

      var ctx = can.getContext('2d');
      ctx.drawImage(img, 0, 0);
      var u8rgba = ctx.getImageData(0, 0, img.width, img.height).data;
      var u8lum = u8rgba.subarray(0, u8rgba.length / 4);
      for (var i = 0, j = 0, n = u8lum.length; i < n; ++i, j += 4)
        u8lum[i] = Math.round((u8rgba[j] + u8rgba[j + 1] + u8rgba[j + 2]) / 3);

      this.loadAlphaTexture(u8lum, img.width, img.height, name);

      if (!name) return;
      var id = Picking.ALPHAS.length - 1;
      var entry = {};
      entry[id] = name;
      this.getGui().addAlphaOptions(entry);
      if (tool && tool.ctrlAlpha_) tool.ctrlAlpha_.setValue(id);
    },
    loadAlphaTexture: function (u8, w, h, name) {
      if (!this.isReplayed() && name)
        this.getReplayWriter().pushLoadAlpha(u8, w, h);
      var ans = Picking.ALPHAS_NAMES;
      ans.push(name || 'alpha_' + ans.length);
      return Picking.addAlpha(u8, w, h);
    }
  };

  return SculptGL;
});