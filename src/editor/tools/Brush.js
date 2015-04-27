define([
  'lib/glMatrix',
  'misc/Utils',
  'misc/Tablet',
  'editor/tools/SculptBase',
  'editor/tools/Flatten'
], function (glm, Utils, Tablet, SculptBase, Flatten) {

  'use strict';

  var vec3 = glm.vec3;

  var Brush = function (states) {
    SculptBase.call(this, states);
    this.radius_ = 50;
    this.intensity_ = 0.5;
    this.negative_ = false;
    this.clay_ = true;
    this.culling_ = false;
    this.accumulate_ = true; // if we ignore the proxy
    this.idAlpha_ = 0;
    this.lockPosition_ = false;
  };

  Brush.prototype = {
    stroke: function (picking) {
      var iVertsInRadius = picking.getPickedVertices();
      var intensity = this.intensity_ * Tablet.getPressureIntensity();

      if (!this.accumulate_ && !this.lockPosition_)
        this.updateProxy(iVertsInRadius);
      // undo-redo
      this.states_.pushVertices(iVertsInRadius);
      if (!this.lockPosition_)
        iVertsInRadius = this.dynamicTopology(picking);

      var iVertsFront = this.getFrontVertices(iVertsInRadius, picking.getEyeDirection());
      if (this.culling_)
        iVertsInRadius = iVertsFront;

      var r2 = picking.getLocalRadius2();
      picking.updateAlpha(this.lockPosition_);
      picking.setIdAlpha(this.idAlpha_);

      if (!this.clay_) {
        this.brush(iVertsInRadius, picking.getPickedNormal(), picking.getIntersectionPoint(), r2, intensity, picking);
      } else {
        var aNormal = this.areaNormal(iVertsFront);
        if (!aNormal)
          return;
        var aCenter = this.lockPosition_ ? picking.getIntersectionPoint() : this.areaCenter(iVertsFront);
        var off = Math.sqrt(r2) * 0.1;
        vec3.scaleAndAdd(aCenter, aCenter, aNormal, this.negative_ ? -off : off);
        Flatten.prototype.flatten.call(this, iVertsInRadius, aNormal, aCenter, picking.getIntersectionPoint(), r2, intensity, picking);
      }

      this.mesh_.updateGeometry(this.mesh_.getFacesFromVertices(iVertsInRadius), iVertsInRadius);
    },
    brush: function (iVertsInRadius, aNormal, center, radiusSquared, intensity, picking) {
      var mesh = this.mesh_;
      var vAr = mesh.getVertices();
      var mAr = mesh.getMaterials();
      var vProxy = this.accumulate_ || this.lockPosition_ ? vAr : mesh.getVerticesProxy();
      var radius = Math.sqrt(radiusSquared);
      var deformIntensityBrush = intensity * radius * 0.1;
      if (this.negative_)
        deformIntensityBrush = -deformIntensityBrush;
      var cx = center[0];
      var cy = center[1];
      var cz = center[2];
      var anx = aNormal[0];
      var any = aNormal[1];
      var anz = aNormal[2];
      for (var i = 0, l = iVertsInRadius.length; i < l; ++i) {
        var ind = iVertsInRadius[i] * 3;
        var dx = vProxy[ind] - cx;
        var dy = vProxy[ind + 1] - cy;
        var dz = vProxy[ind + 2] - cz;
        var dist = Math.sqrt(dx * dx + dy * dy + dz * dz) / radius;
        if (dist >= 1.0)
          continue;
        var vx = vAr[ind];
        var vy = vAr[ind + 1];
        var vz = vAr[ind + 2];
        var fallOff = dist * dist;
        fallOff = 3.0 * fallOff * fallOff - 4.0 * fallOff * dist + 1.0;
        fallOff *= mAr[ind + 2] * deformIntensityBrush * picking.getAlpha(vx, vy, vz);
        vAr[ind] = vx + anx * fallOff;
        vAr[ind + 1] = vy + any * fallOff;
        vAr[ind + 2] = vz + anz * fallOff;
      }
    }
  };

  Utils.makeProxy(SculptBase, Brush);

  return Brush;
});