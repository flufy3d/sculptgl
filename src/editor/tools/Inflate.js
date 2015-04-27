define([
  'misc/Utils',
  'misc/Tablet',
  'editor/tools/SculptBase',
  'editor/tools/Smooth'
], function (Utils, Tablet, SculptBase, Smooth) {

  'use strict';

  var Inflate = function (states) {
    SculptBase.call(this, states);
    this.radius_ = 50;
    this.intensity_ = 0.3;
    this.negative_ = false;
    this.culling_ = false;
    this.idAlpha_ = 0;
    this.lockPosition_ = false;
  };

  Inflate.prototype = {
    /** On stroke */
    stroke: function (picking) {
      var iVertsInRadius = picking.getPickedVertices();
      var intensity = this.intensity_ * Tablet.getPressureIntensity();

      this.updateProxy(iVertsInRadius);
      // undo-redo
      this.states_.pushVertices(iVertsInRadius);
      iVertsInRadius = this.dynamicTopology(picking);

      if (this.culling_)
        iVertsInRadius = this.getFrontVertices(iVertsInRadius, picking.getEyeDirection());

      picking.updateAlpha(this.lockPosition_);
      picking.setIdAlpha(this.idAlpha_);
      this.inflate(iVertsInRadius, picking.getIntersectionPoint(), picking.getLocalRadius2(), intensity, picking);
      Smooth.prototype.smoothTangent.call(this, iVertsInRadius, 1.0, picking);

      this.mesh_.updateGeometry(this.mesh_.getFacesFromVertices(iVertsInRadius), iVertsInRadius);
    },
    /** Inflate a group of vertices */
    inflate: function (iVerts, center, radiusSquared, intensity, picking) {
      var mesh = this.mesh_;
      var vAr = mesh.getVertices();
      var mAr = mesh.getMaterials();
      var vProxy = mesh.getVerticesProxy();
      var nAr = mesh.getNormals();
      var radius = Math.sqrt(radiusSquared);
      var deformIntensity = intensity * radius * 0.1;
      if (this.negative_)
        deformIntensity = -deformIntensity;
      var cx = center[0];
      var cy = center[1];
      var cz = center[2];
      for (var i = 0, l = iVerts.length; i < l; ++i) {
        var ind = iVerts[i] * 3;
        var dx = vProxy[ind] - cx;
        var dy = vProxy[ind + 1] - cy;
        var dz = vProxy[ind + 2] - cz;
        var dist = Math.sqrt(dx * dx + dy * dy + dz * dz) / radius;
        if (dist >= 1.0)
          continue;
        var fallOff = dist * dist;
        fallOff = 3.0 * fallOff * fallOff - 4.0 * fallOff * dist + 1.0;
        fallOff = deformIntensity * fallOff;
        var vx = vAr[ind];
        var vy = vAr[ind + 1];
        var vz = vAr[ind + 2];
        var nx = nAr[ind];
        var ny = nAr[ind + 1];
        var nz = nAr[ind + 2];
        fallOff /= Math.sqrt(nx * nx + ny * ny + nz * nz);
        fallOff *= mAr[ind + 2] * picking.getAlpha(vx, vy, vz);
        vAr[ind] = vx + nx * fallOff;
        vAr[ind + 1] = vy + ny * fallOff;
        vAr[ind + 2] = vz + nz * fallOff;
      }
    }
  };

  Utils.makeProxy(SculptBase, Inflate);

  return Inflate;
});