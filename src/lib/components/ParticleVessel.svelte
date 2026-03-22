<script lang="ts">
  import { onMount } from "svelte";
  import * as THREE from "three";
  import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

  let mountEl: HTMLDivElement;

  onMount(() => {
    if (!mountEl) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(44, 1, 0.1, 200);
    camera.position.set(-6, 2.4, 22);
    camera.lookAt(0, 2.4, 0);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance"
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mountEl.clientWidth, mountEl.clientHeight);
    renderer.setClearColor(0x000000, 0);
    mountEl.appendChild(renderer.domElement);

    const treeGroup = new THREE.Group();
    scene.add(treeGroup);

    type Vec3 = [number, number, number];
    const TREE_X = 8;

    const cylinderGeos: THREE.BufferGeometry[] = [];
    const branchMidpoints: { pos: Vec3; depth: number }[] = [];
    const tipPositions: number[][] = [];

    const makeCylinder = (from: Vec3, to: Vec3, rBot: number, rTop: number) => {
      const dx = to[0] - from[0];
      const dy = to[1] - from[1];
      const dz = to[2] - from[2];
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (len < 0.001) return;

      const segs = rBot > 0.06 ? 8 : 5;
      const geo = new THREE.CylinderGeometry(rTop, rBot, len, segs);
      const dir = new THREE.Vector3(dx, dy, dz).normalize();
      const quat = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        dir
      );
      geo.applyQuaternion(quat);
      geo.translate(
        (from[0] + to[0]) / 2,
        (from[1] + to[1]) / 2,
        (from[2] + to[2]) / 2
      );
      cylinderGeos.push(geo);
    };

    const curveSeg = (
      from: Vec3,
      to: Vec3,
      rBot: number,
      rTop: number,
      bendStr: number
    ) => {
      const mx = (from[0] + to[0]) / 2 + (Math.random() - 0.5) * bendStr;
      const my = (from[1] + to[1]) / 2 + (Math.random() - 0.3) * bendStr * 0.5;
      const mz = (from[2] + to[2]) / 2 + (Math.random() - 0.5) * bendStr * 0.4;
      const mid: Vec3 = [mx, my, mz];
      const rMid = (rBot + rTop) / 2;

      makeCylinder(from, mid, rBot, rMid);
      makeCylinder(mid, to, rMid, rTop);
    };

    const grow = (
      origin: Vec3,
      dir: Vec3,
      len: number,
      radius: number,
      depth: number,
      maxDepth: number
    ) => {
      const end: Vec3 = [
        origin[0] + dir[0] * len,
        origin[1] + dir[1] * len,
        origin[2] + dir[2] * len
      ];

      const rTop = radius * 0.7;
      const bend = 0.12 + depth * 0.09;
      curveSeg(origin, end, radius, rTop, bend);

      if (depth >= 2) {
        branchMidpoints.push({
          pos: [
            (origin[0] + end[0]) / 2,
            (origin[1] + end[1]) / 2,
            (origin[2] + end[2]) / 2
          ],
          depth
        });
      }

      if (depth >= maxDepth) {
        tipPositions.push([end[0], end[1], end[2]]);
        return;
      }

      if (depth >= maxDepth - 2) {
        tipPositions.push([end[0], end[1], end[2]]);
      }

      const forks = depth < 1 ? 4 : depth < 3 ? 3 : 2 + Math.floor(Math.random() * 2);

      for (let f = 0; f < forks; f++) {
        const spreadAmt = 0.45 + Math.random() * 0.5;
        const tilt = (Math.random() - 0.5) * spreadAmt * 2.8;
        const lean = (Math.random() - 0.5) * spreadAmt * 2.0;
        const upBias = Math.max(0.1, 0.65 - depth * 0.1);

        const nd: Vec3 = [
          dir[0] + tilt,
          dir[1] * upBias + (0.2 + Math.random() * 0.35),
          dir[2] + lean * 0.6
        ];
        const mag = Math.sqrt(nd[0] ** 2 + nd[1] ** 2 + nd[2] ** 2);
        nd[0] /= mag;
        nd[1] /= mag;
        nd[2] /= mag;

        const childLen = len * (0.54 + Math.random() * 0.22);
        const childRadius = rTop * (0.52 + Math.random() * 0.22);
        grow(end, nd, childLen, childRadius, depth + 1, maxDepth);
      }
    };

    grow([0, -2.2, 0], [0.02, 1, 0], 1.1, 0.24, 0, 6);

    if (cylinderGeos.length > 0) {
      const merged = mergeGeometries(cylinderGeos, false);
      if (merged) {
        const trunkMat = new THREE.MeshBasicMaterial({
          color: new THREE.Color(0.3, 0.2, 0.14),
          transparent: true,
          opacity: 0.5,
          depthTest: false
        });
        const trunkMesh = new THREE.Mesh(merged, trunkMat);
        trunkMesh.renderOrder = -1;
        treeGroup.add(trunkMesh);
      }
      cylinderGeos.forEach((g) => g.dispose());
    }

    const blossomPositions: number[] = [];
    const blossomPhases: number[] = [];

    let canopyCenterY = 0;
    let canopyCenterX = 0;
    let canopyCenterZ = 0;
    for (const tip of tipPositions) {
      canopyCenterX += tip[0];
      canopyCenterY += tip[1];
      canopyCenterZ += tip[2];
    }
    canopyCenterX /= tipPositions.length;
    canopyCenterY /= tipPositions.length;
    canopyCenterZ /= tipPositions.length;

    let canopyMaxR = 0;
    for (const tip of tipPositions) {
      const dx = tip[0] - canopyCenterX;
      const dy = (tip[1] - canopyCenterY) * 1.4;
      const dz = tip[2] - canopyCenterZ;
      const r = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (r > canopyMaxR) canopyMaxR = r;
    }

    for (const tip of tipPositions) {
      const dx = tip[0] - canopyCenterX;
      const dy = (tip[1] - canopyCenterY) * 1.4;
      const dz = tip[2] - canopyCenterZ;
      const distFromCenter = Math.sqrt(dx * dx + dy * dy + dz * dz) / canopyMaxR;

      const density = 1.0 - distFromCenter * 0.7;
      const count = Math.floor((48 + Math.random() * 30) * density);
      const spreadScale = 0.6 + distFromCenter * 0.6;

      for (let b = 0; b < count; b++) {
        const spread = (0.15 + Math.random() * 1.5) * spreadScale;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.random() * Math.PI;
        blossomPositions.push(
          tip[0] + Math.sin(phi) * Math.cos(theta) * spread * 1.3,
          tip[1] + Math.sin(phi) * Math.sin(theta) * spread * 0.65 + Math.random() * 0.15,
          tip[2] + Math.cos(phi) * spread * 0.7
        );
        blossomPhases.push(Math.random());
      }
    }

    for (const bp of branchMidpoints) {
      const count = Math.floor(12 + Math.random() * 10);
      for (let b = 0; b < count; b++) {
        const spread = 0.2 + Math.random() * 0.6;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.random() * Math.PI;
        blossomPositions.push(
          bp.pos[0] + Math.sin(phi) * Math.cos(theta) * spread,
          bp.pos[1] + Math.sin(phi) * Math.sin(theta) * spread * 0.5,
          bp.pos[2] + Math.cos(phi) * spread * 0.6
        );
        blossomPhases.push(Math.random());
      }
    }

    const petalCount = 1400;
    const totalBlossoms = blossomPositions.length / 3;
    const totalPoints = totalBlossoms + petalCount;

    const pointPos = new Float32Array(totalPoints * 3);
    const pointCol = new Float32Array(totalPoints * 3);
    const pointSize = new Float32Array(totalPoints);
    const pointKind = new Float32Array(totalPoints);
    const pointPhase = new Float32Array(totalPoints);

    for (let i = 0; i < totalBlossoms; i++) {
      const i3 = i * 3;
      pointPos[i3] = blossomPositions[i3];
      pointPos[i3 + 1] = blossomPositions[i3 + 1];
      pointPos[i3 + 2] = blossomPositions[i3 + 2];

      const v = Math.random();
      if (v < 0.5) {
        pointCol[i3] = 0.94 + Math.random() * 0.05;
        pointCol[i3 + 1] = 0.6 + Math.random() * 0.15;
        pointCol[i3 + 2] = 0.7 + Math.random() * 0.12;
      } else if (v < 0.8) {
        pointCol[i3] = 0.97 + Math.random() * 0.02;
        pointCol[i3 + 1] = 0.78 + Math.random() * 0.1;
        pointCol[i3 + 2] = 0.84 + Math.random() * 0.08;
      } else {
        pointCol[i3] = 0.88 + Math.random() * 0.06;
        pointCol[i3 + 1] = 0.5 + Math.random() * 0.12;
        pointCol[i3 + 2] = 0.6 + Math.random() * 0.1;
      }

      pointSize[i] = 0.42 + Math.random() * 0.62;
      pointKind[i] = 0.0;
      pointPhase[i] = blossomPhases[i];
    }

    for (let i = 0; i < petalCount; i++) {
      const pi = totalBlossoms + i;
      const i3 = pi * 3;
      const srcIdx = Math.floor(Math.random() * totalBlossoms);
      pointPos[i3] = blossomPositions[srcIdx * 3] + (Math.random() - 0.5) * 0.6;
      pointPos[i3 + 1] = blossomPositions[srcIdx * 3 + 1];
      pointPos[i3 + 2] = blossomPositions[srcIdx * 3 + 2] + (Math.random() - 0.5) * 0.3;

      pointCol[i3] = 0.97;
      pointCol[i3 + 1] = 0.7 + Math.random() * 0.14;
      pointCol[i3 + 2] = 0.76 + Math.random() * 0.1;

      pointSize[pi] = 0.55 + Math.random() * 0.65;
      pointKind[pi] = 1.0;
      pointPhase[pi] = Math.random();
    }

    const pointGeo = new THREE.BufferGeometry();
    pointGeo.setAttribute("position", new THREE.BufferAttribute(pointPos, 3));
    pointGeo.setAttribute("aColor", new THREE.BufferAttribute(pointCol, 3));
    pointGeo.setAttribute("aSize", new THREE.BufferAttribute(pointSize, 1));
    pointGeo.setAttribute("aKind", new THREE.BufferAttribute(pointKind, 1));
    pointGeo.setAttribute("aPhase", new THREE.BufferAttribute(pointPhase, 1));
    pointGeo.computeBoundingSphere();

    const pointMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: `
        uniform float uTime;
        attribute float aSize;
        attribute vec3 aColor;
        attribute float aKind;
        attribute float aPhase;
        varying vec3 vColor;
        varying float vAlpha;

        void main() {
          vColor = aColor;
          vec3 p = position;

          float sway = sin(uTime * 0.28 + p.y * 0.5 + aPhase * 6.283) * 0.03;
          p.x += sway;

          if (aKind > 0.5) {
            float fall = fract(aPhase + uTime * 0.038);
            float startY = p.y;
            p.y -= fall * 7.0;
            p.y = max(p.y, -2.2);
            float landed = 1.0 - step(-2.19, p.y);
            p.x += sin(uTime * 0.4 + aPhase * 24.0) * 0.6 * fall * (1.0 - landed * 0.85);
            p.z += cos(uTime * 0.3 + aPhase * 16.0) * 0.18 * (1.0 - landed * 0.85);
            vAlpha = smoothstep(0.0, 0.06, fall) * smoothstep(1.0, 0.5, fall) * 0.72;
          } else {
            p.x += sin(uTime * 0.35 + aPhase * 10.0) * 0.01;
            p.y += cos(uTime * 0.22 + aPhase * 14.0) * 0.007;
            vAlpha = 0.82;
          }

          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = aSize * (220.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vAlpha;

        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d2 = dot(c, c);
          if (d2 > 0.25) discard;

          float soft = exp(-d2 * 5.0) * 0.6 + exp(-d2 * 1.4) * 0.4;
          float a = soft * vAlpha;
          gl_FragColor = vec4(vColor, a);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending
    });

    const pointMesh = new THREE.Points(pointGeo, pointMat);
    treeGroup.add(pointMesh);

    treeGroup.scale.set(3, 3, 3);
    treeGroup.position.set(TREE_X, 0, 0);

    let targetRotY = 0;
    let currentRotY = 0;
    let isDragging = false;
    let dragStartX = 0;
    let dragStartRot = 0;

    const raycaster = new THREE.Raycaster();
    raycaster.params.Points = { threshold: 0.8 };
    const pointer = new THREE.Vector2();

    const hitTest = (e: PointerEvent): boolean => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      return raycaster.intersectObjects(treeGroup.children, true).length > 0;
    };

    const canvas = renderer.domElement;
    canvas.style.pointerEvents = "auto";

    const onPointerDown = (e: PointerEvent) => {
      if (!hitTest(e)) return;
      isDragging = true;
      dragStartX = e.clientX;
      dragStartRot = targetRotY;
      e.preventDefault();
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - dragStartX;
      targetRotY = dragStartRot + dx * 0.005;
    };

    const onPointerUp = () => {
      isDragging = false;
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);

    const clock = new THREE.Clock();
    let raf = 0;

    const resize = () => {
      if (!mountEl) return;
      const w = mountEl.clientWidth;
      const h = mountEl.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    const ro = new ResizeObserver(resize);
    ro.observe(mountEl);
    window.addEventListener("resize", resize, { passive: true });

    const animate = () => {
      const t = clock.getElapsedTime();
      pointMat.uniforms.uTime.value = t;

      currentRotY += (targetRotY - currentRotY) * 0.06;
      treeGroup.rotation.y = currentRotY;

      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };

    resize();
    animate();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      ro.disconnect();
      treeGroup.children.forEach((c) => {
        if (c instanceof THREE.Mesh || c instanceof THREE.Points) {
          c.geometry.dispose();
          if (c.material instanceof THREE.Material) c.material.dispose();
        }
      });
      renderer.dispose();
      renderer.forceContextLoss();
      if (mountEl?.contains(renderer.domElement)) {
        mountEl.removeChild(renderer.domElement);
      }
    };
  });
</script>

<div class="vessel" bind:this={mountEl}></div>

<style>
  .vessel {
    position: fixed;
    inset: 0;
    z-index: 0;
    pointer-events: none;
  }
</style>
