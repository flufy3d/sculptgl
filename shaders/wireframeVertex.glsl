attribute vec3 vertex, normal, barycenter;
uniform mat4 mvMat, mvpMat;
uniform mat3 nMat;
varying vec3 vVertex, vNormal, vBarycenter;
varying vec2 vTexCoord;
void main()
{
  vBarycenter = barycenter;
  vec4 vertex4 = vec4(vertex, 1.0);
  vNormal = nMat * normal;
  vVertex = vec3(mvMat * vertex4);
  gl_Position = mvpMat * vertex4;
}