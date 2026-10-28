import * as THREE from "three";
/** Original, demand-baked ground shadow. Depth capture + separable blur; no external textures. */
export function createContactShadow(
  renderer: THREE.WebGLRenderer,
  resolution: number,
) {
  const textureSize = THREE.MathUtils.clamp(Math.round(resolution), 128, 1024);
  const targets = [0, 1, 2].map(
    (index) =>
      new THREE.WebGLRenderTarget(textureSize, textureSize, {
        depthBuffer: index === 0,
        stencilBuffer: false,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        generateMipmaps: false,
      }),
  );
  const capture = new THREE.Scene();
  capture.background = new THREE.Color(0x000000);
  const depth = new THREE.MeshDepthMaterial({ side: THREE.DoubleSide });
  const depthRange = { value: 5 },
    cameraToGround = { value: 0.04 },
    falloff = { value: 0.4 };
  depth.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { depthRange, cameraToGround, falloff });
    shader.fragmentShader =
      "uniform float depthRange; uniform float cameraToGround; uniform float falloff;\n" +
      shader.fragmentShader.replace(
        "gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );",
        "float heightAboveGround = max(fragCoordZ * depthRange - cameraToGround, 0.0); gl_FragColor = vec4(vec3(exp(-heightAboveGround / falloff)), 1.0);",
      );
  };
  depth.customProgramCacheKey = () => "alacam-contact-height-v2";
  capture.overrideMaterial = depth;
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 5);
  camera.up.set(0, 0, -1);
  const blur = new THREE.ShaderMaterial({
    uniforms: {
      image: { value: null },
      direction: { value: new THREE.Vector2() },
    },
    vertexShader:
      "varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position,1.);}",
    fragmentShader:
      "uniform sampler2D image; uniform vec2 direction; varying vec2 vUv; void main(){vec3 c=texture2D(image,vUv).rgb*.227027; c+=texture2D(image,vUv+direction*1.384615).rgb*.316216; c+=texture2D(image,vUv-direction*1.384615).rgb*.316216; c+=texture2D(image,vUv+direction*3.230769).rgb*.070270; c+=texture2D(image,vUv-direction*3.230769).rgb*.070270;gl_FragColor=vec4(c,1.);}",
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blur),
    blurScene = new THREE.Scene(),
    screenCamera = new THREE.Camera();
  blurScene.add(quad);
  const material = new THREE.MeshBasicMaterial({
    color: 0x30353c,
    alphaMap: targets[2].texture,
    transparent: true,
    depthWrite: false,
    opacity: 0.4,
    toneMapped: false,
  });
  const geometry = new THREE.PlaneGeometry(1, 1),
    uv = geometry.getAttribute("uv");
  // The depth camera views the footprint from below; invert its horizontal
  // texture coordinate when projecting it onto the upward-facing ground.
  for (let index = 0; index < uv.count; index++)
    uv.setX(index, 1 - uv.getX(index));
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.name = "contact_shadow";
  mesh.visible = false;
  return {
    mesh,
    update(root: THREE.Group) {
      root.updateWorldMatrix(true, true);
      const bounds = new THREE.Box3().setFromObject(root),
        size = bounds.getSize(new THREE.Vector3()),
        center = bounds.getCenter(new THREE.Vector3());
      if (bounds.isEmpty() || !Number.isFinite(size.length())) {
        mesh.visible = false;
        return;
      }
      const padding = THREE.MathUtils.clamp(size.y * 0.45, 1.2, 3.5),
        width = Math.max(0.1, size.x + padding),
        height = Math.max(0.1, size.z + padding),
        ground = bounds.min.y - 0.008,
        gap = Math.max(0.025, size.y * 0.01),
        blurWorld = THREE.MathUtils.clamp(size.y * 0.009, 0.015, 0.045);
      camera.left = -width / 2;
      camera.right = width / 2;
      camera.top = height / 2;
      camera.bottom = -height / 2;
      camera.near = 0.001;
      camera.far = Math.max(0.1, size.y + gap + 0.1);
      camera.position.set(center.x, ground - gap, center.z);
      camera.lookAt(center.x, ground + size.y + 1, center.z);
      camera.updateProjectionMatrix();
      depthRange.value = camera.far - camera.near;
      cameraToGround.value = gap - camera.near;
      falloff.value = Math.max(0.08, size.y * 0.115);
      mesh.position.set(center.x, ground, center.z);
      mesh.scale.set(width, height, 1);
      mesh.visible = true;
      const parent = root.parent,
        childIndex = parent?.children.indexOf(root) ?? -1,
        localMatrix = root.matrix.clone(),
        worldMatrix = root.matrixWorld.clone(),
        matrixAutoUpdate = root.matrixAutoUpdate,
        previousTarget = renderer.getRenderTarget(),
        previousCubeFace = renderer.getActiveCubeFace(),
        previousMipmap = renderer.getActiveMipmapLevel(),
        viewport = renderer.getViewport(new THREE.Vector4()),
        scissor = renderer.getScissor(new THREE.Vector4()),
        scissorTest = renderer.getScissorTest(),
        clear = renderer.getClearColor(new THREE.Color()),
        alpha = renderer.getClearAlpha(),
        toneMapping = renderer.toneMapping,
        autoClear = renderer.autoClear,
        shadowMapEnabled = renderer.shadowMap.enabled,
        xrEnabled = renderer.xr.enabled;
      try {
        capture.add(root);
        // Retain the captured world transform even when its owner is transformed.
        root.matrixAutoUpdate = false;
        root.matrix.copy(worldMatrix);
        renderer.toneMapping = THREE.NoToneMapping;
        renderer.autoClear = true;
        renderer.shadowMap.enabled = false;
        renderer.xr.enabled = false;
        renderer.setScissorTest(false);
        renderer.setClearColor(0x000000, 1);
        renderer.setRenderTarget(targets[0]);
        renderer.clear();
        renderer.render(capture, camera);
        blur.uniforms.image.value = targets[0].texture;
        blur.uniforms.direction.value.set(blurWorld / width, 0);
        renderer.setRenderTarget(targets[1]);
        renderer.render(blurScene, screenCamera);
        blur.uniforms.image.value = targets[1].texture;
        blur.uniforms.direction.value.set(0, blurWorld / height);
        renderer.setRenderTarget(targets[2]);
        renderer.render(blurScene, screenCamera);
      } finally {
        capture.remove(root);
        if (parent) {
          parent.add(root);
          // Reparenting must not move the product behind its sibling objects.
          parent.children.splice(parent.children.indexOf(root), 1);
          parent.children.splice(childIndex, 0, root);
        }
        root.matrixAutoUpdate = matrixAutoUpdate;
        root.matrix.copy(localMatrix);
        root.updateWorldMatrix(true, true);
        renderer.toneMapping = toneMapping;
        renderer.autoClear = autoClear;
        renderer.shadowMap.enabled = shadowMapEnabled;
        renderer.xr.enabled = xrEnabled;
        renderer.setRenderTarget(
          previousTarget,
          previousCubeFace,
          previousMipmap,
        );
        renderer.setViewport(viewport);
        renderer.setScissor(scissor);
        renderer.setScissorTest(scissorTest);
        renderer.setClearColor(clear, alpha);
      }
    },
    dispose() {
      targets.forEach((t) => t.dispose());
      depth.dispose();
      quad.geometry.dispose();
      blur.dispose();
      mesh.geometry.dispose();
      material.dispose();
    },
  };
}
