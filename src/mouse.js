(function () {
  "use strict";

  function part(scene, name, mesh, material, parent, position, scaling, rotation) {
    mesh.name = name;
    mesh.material = material;
    mesh.parent = parent;
    mesh.position.set(position[0], position[1], position[2]);
    mesh.scaling.set(scaling[0], scaling[1], scaling[2]);
    if (rotation) mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
    mesh.receiveShadows = true;
    return mesh;
  }

  function createMouseModel(scene, materials, options) {
    options = options || {};
    const root = new BABYLON.TransformNode("mouse", scene);

    const body = part(
      scene, "mouse-body",
      BABYLON.MeshBuilder.CreateSphere("mouse-body-mesh", { diameter: 1.44, segments: 10 }, scene),
      materials.mouseFur, root, [0, 0.58, -0.08], [0.88, 0.62, 1.28]
    );

    part(
      scene, "mouse-belly",
      BABYLON.MeshBuilder.CreateSphere("mouse-belly-mesh", { diameter: 0.88, segments: 9 }, scene),
      materials.mouseBelly, root, [0, 0.43, 0.44], [0.75, 0.45, 1.05]
    );

    const head = part(
      scene, "mouse-head",
      BABYLON.MeshBuilder.CreateSphere("mouse-head-mesh", { diameter: 0.96, segments: 10 }, scene),
      materials.mouseFur, root, [0, 0.76, 0.94], [0.92, 0.82, 1.08]
    );

    part(
      scene, "mouse-snout",
      BABYLON.MeshBuilder.CreateSphere("mouse-snout-mesh", { diameter: 0.5, segments: 9 }, scene),
      materials.mouseBelly, root, [0, 0.69, 1.36], [0.82, 0.62, 1.18]
    );

    part(
      scene, "mouse-nose",
      BABYLON.MeshBuilder.CreateSphere("mouse-nose-mesh", { diameter: 0.21, segments: 7 }, scene),
      materials.dark, root, [0, 0.70, 1.63], [1, 1, 1]
    );

    [-1, 1].forEach(function (side) {
      part(
        scene, "mouse-ear",
        BABYLON.MeshBuilder.CreateSphere("mouse-ear-mesh", { diameter: 0.5, segments: 8 }, scene),
        materials.mouseEar, root, [side * 0.33, 1.08, 0.75], [1, 0.32, 1],
        [Math.PI / 2, 0, 0]
      );

      part(
        scene, "mouse-eye",
        BABYLON.MeshBuilder.CreateSphere("mouse-eye-mesh", { diameter: 0.15, segments: 7 }, scene),
        materials.dark, root, [side * 0.31, 0.86, 1.24], [1, 1, 1]
      );

      part(
        scene, "mouse-front-foot",
        BABYLON.MeshBuilder.CreateSphere("mouse-front-foot-mesh", { diameter: 0.26, segments: 7 }, scene),
        materials.mouseEar, root, [side * 0.35, 0.17, 0.55], [0.85, 0.42, 1.35]
      );

      part(
        scene, "mouse-back-foot",
        BABYLON.MeshBuilder.CreateSphere("mouse-back-foot-mesh", { diameter: 0.32, segments: 7 }, scene),
        materials.mouseEar, root, [side * 0.40, 0.16, -0.52], [0.95, 0.42, 1.45]
      );
    });

    const tailPath = [
      new BABYLON.Vector3(0, 0.52, -0.90),
      new BABYLON.Vector3(0.18, 0.43, -1.25),
      new BABYLON.Vector3(0.42, 0.38, -1.62),
      new BABYLON.Vector3(0.58, 0.31, -1.98)
    ];
    const tail = BABYLON.MeshBuilder.CreateTube(
      "mouse-tail",
      { path: tailPath, radius: 0.055, tessellation: 6, cap: BABYLON.Mesh.CAP_ROUND },
      scene
    );
    tail.material = materials.mouseEar;
    tail.parent = root;

    root.metadata = {
      baseScale: options.scale || 1,
      body: body,
      head: head,
      tail: tail,
      animate: function (time, speed) {
        const stride = Math.min(1, (speed || 0) / 5);
        body.position.y = 0.58 + Math.sin(time * 12) * 0.025 * stride;
        head.rotation.z = Math.sin(time * 7) * 0.025;
        tail.rotation.y = Math.sin(time * 5) * 0.12;
      }
    };

    root.scaling.setAll(options.scale || 1);
    return root;
  }

  window.MiniWorldModels = window.MiniWorldModels || {};
  window.MiniWorldModels.createMouseModel = createMouseModel;
})();