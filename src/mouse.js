import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.186.0/build/three.module.js";

const makeMaterial = (color, roughness = 0.86) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });

const makeMesh = (geometry, material) => {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
};

/**
 * Low-poly mouse model for Mini World: Evolution.
 * Faces +Z. Ground contact is around y = 0.
 */
export function createMouseModel(options = {}) {
  const fur = options.color ?? 0x8f7f78;
  const bellyColor = options.bellyColor ?? 0xcbb7aa;
  const earColor = options.earColor ?? 0xd89a9e;

  const root = new THREE.Group();
  root.name = "Mouse";

  const furMat = makeMaterial(fur);
  const bellyMat = makeMaterial(bellyColor);
  const earMat = makeMaterial(earColor, 0.78);
  const darkMat = makeMaterial(0x17171a, 0.65);
  const pinkMat = makeMaterial(0xe49aa1, 0.72);

  const body = makeMesh(new THREE.SphereGeometry(0.72, 12, 8), furMat);
  body.scale.set(0.88, 0.62, 1.28);
  body.position.set(0, 0.58, -0.08);
  root.add(body);

  const belly = makeMesh(new THREE.SphereGeometry(0.44, 10, 7), bellyMat);
  belly.scale.set(0.75, 0.45, 1.05);
  belly.position.set(0, 0.43, 0.44);
  root.add(belly);

  const head = makeMesh(new THREE.SphereGeometry(0.48, 12, 8), furMat);
  head.scale.set(0.92, 0.82, 1.08);
  head.position.set(0, 0.76, 0.94);
  root.add(head);

  const snout = makeMesh(new THREE.SphereGeometry(0.25, 10, 7), bellyMat);
  snout.scale.set(0.82, 0.62, 1.18);
  snout.position.set(0, 0.69, 1.36);
  root.add(snout);

  const nose = makeMesh(new THREE.SphereGeometry(0.105, 8, 6), darkMat);
  nose.position.set(0, 0.7, 1.63);
  root.add(nose);

  for (const side of [-1, 1]) {
    const ear = makeMesh(new THREE.SphereGeometry(0.25, 10, 7), earMat);
    ear.scale.set(1, 0.32, 1);
    ear.rotation.x = Math.PI / 2;
    ear.position.set(side * 0.33, 1.08, 0.75);
    root.add(ear);

    const eye = makeMesh(new THREE.SphereGeometry(0.075, 8, 6), darkMat);
    eye.position.set(side * 0.31, 0.86, 1.24);
    root.add(eye);

    const footFront = makeMesh(new THREE.SphereGeometry(0.13, 8, 6), pinkMat);
    footFront.scale.set(0.85, 0.42, 1.35);
    footFront.position.set(side * 0.35, 0.17, 0.55);
    root.add(footFront);

    const footBack = makeMesh(new THREE.SphereGeometry(0.16, 8, 6), pinkMat);
    footBack.scale.set(0.95, 0.42, 1.45);
    footBack.position.set(side * 0.4, 0.16, -0.52);
    root.add(footBack);
  }

  const tailCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.52, -0.9),
    new THREE.Vector3(0.18, 0.43, -1.25),
    new THREE.Vector3(0.42, 0.38, -1.62),
    new THREE.Vector3(0.58, 0.31, -1.98)
  ]);
  const tail = makeMesh(new THREE.TubeGeometry(tailCurve, 12, 0.055, 5, false), pinkMat);
  root.add(tail);

  root.userData.parts = { body, head, tail };
  root.userData.animate = (time, speed = 0) => {
    const stride = Math.min(1, speed / 5);
    body.position.y = 0.58 + Math.sin(time * 12) * 0.025 * stride;
    head.rotation.z = Math.sin(time * 7) * 0.025;
    tail.rotation.y = Math.sin(time * 5) * 0.12;
  };

  root.scale.setScalar(options.scale ?? 1);
  return root;
}
