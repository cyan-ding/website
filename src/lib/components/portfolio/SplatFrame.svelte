<script lang="ts">
  import { onMount } from "svelte";
  import * as THREE from "three";
  import { OrbitControls } from "three/addons/controls/OrbitControls.js";

  let host: HTMLDivElement;
  let status = $state("");
  let started = false;

  function percentile(values: number[], q: number) {
    if (values.length === 0) return 0;
    const sorted = values.slice().sort((a, b) => a - b);
    const index = (sorted.length - 1) * q;
    const lo = Math.floor(index);
    const hi = Math.min(sorted.length - 1, lo + 1);
    const t = index - lo;
    return sorted[lo] * (1 - t) + sorted[hi] * t;
  }

  // Scaniverse exports the standard 3DGS frame (Y down). Spark's own examples
  // stand that up with a 180° turn about X. The file also contains floaters
  // hundreds of meters out, so the view is framed on the dense lot only.
  function frameSplat(
    mesh: {
      quaternion: THREE.Quaternion;
      forEachSplat: (
        callback: (index: number, center: THREE.Vector3, scales: THREE.Vector3) => void
      ) => void;
    },
    camera: THREE.PerspectiveCamera,
    controls: OrbitControls
  ) {
    mesh.quaternion.set(1, 0, 0, 0);
    const point = new THREE.Vector3();
    const xs: number[] = [];
    const ys: number[] = [];
    const zs: number[] = [];
    mesh.forEachSplat((_index, center, scales) => {
      if (Math.max(scales.x, scales.y, scales.z) > 0.15) return;
      point.copy(center).applyQuaternion(mesh.quaternion);
      xs.push(point.x);
      ys.push(point.y);
      zs.push(point.z);
    });
    if (xs.length < 32) return;

    const yLo = percentile(ys, 0.02);
    const yHi = percentile(ys, 0.98);
    const bins = 48;
    const hist = new Array<number>(bins).fill(0);
    const span = Math.max(yHi - yLo, 1e-3);
    for (const y of ys) {
      if (y < yLo || y > yHi) continue;
      const bin = Math.min(bins - 1, Math.floor(((y - yLo) / span) * bins));
      hist[bin] += 1;
    }
    let densest = 0;
    for (let i = 1; i < bins; i++) if (hist[i] > hist[densest]) densest = i;
    let ground = yLo + ((densest + 0.5) / bins) * span;

    // Dense pavement should sit at the bottom. If it doesn't, the export is
    // already Y-up and the extra turn put the lot on its head.
    if (ground > (yLo + yHi) * 0.5) {
      mesh.quaternion.identity();
      for (let i = 0; i < ys.length; i++) {
        ys[i] = -ys[i];
        zs[i] = -zs[i];
      }
      const flippedLo = percentile(ys, 0.02);
      const flippedHi = percentile(ys, 0.98);
      const flippedSpan = Math.max(flippedHi - flippedLo, 1e-3);
      hist.fill(0);
      for (const y of ys) {
        if (y < flippedLo || y > flippedHi) continue;
        const bin = Math.min(bins - 1, Math.floor(((y - flippedLo) / flippedSpan) * bins));
        hist[bin] += 1;
      }
      densest = 0;
      for (let i = 1; i < bins; i++) if (hist[i] > hist[densest]) densest = i;
      ground = flippedLo + ((densest + 0.5) / bins) * flippedSpan;
    }

    const x0 = percentile(xs, 0.08);
    const x1 = percentile(xs, 0.92);
    const z0 = percentile(zs, 0.08);
    const z1 = percentile(zs, 0.92);
    const cx = (x0 + x1) * 0.5;
    const cz = (z0 + z1) * 0.5;
    const zSpan = Math.max(z1 - z0, 1);
    const reach = Math.max(zSpan, x1 - x0, 4);

    camera.fov = 60;
    // Stand just inside the scan and look across the lot toward its center.
    // The outer fringe is mostly floaters, so the eye stays off that edge.
    // Start on the open side of the lot. The near face of the building is a
    // messy reconstruction, and it fills the frame if the camera sits against it.
    camera.position.set(cx + zSpan * 0.28, ground + 1.55, z0 + zSpan * 0.22);
    controls.target.set(cx - zSpan * 0.05, ground + 0.45, cz + zSpan * 0.2);
    camera.near = 0.15;
    camera.far = Math.max(reach * 8, 80);
    camera.updateProjectionMatrix();
    controls.minDistance = 0.3;
    controls.maxDistance = reach * 2.2;
    controls.update();
  }

  onMount(() => {
    let renderer: THREE.WebGLRenderer | undefined;
    let controls: OrbitControls | undefined;
    let spark: { dispose: () => void } | undefined;
    let splat: { dispose: () => void } | undefined;
    let frame = 0;
    let stopped = false;
    const resizeObserver = new ResizeObserver(() => resize());

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#9aa3ab");
    const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 200);

    function resize() {
      if (!renderer || !host) return;
      const width = host.clientWidth;
      const height = host.clientHeight;
      if (width === 0 || height === 0) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    }

    function loop() {
      if (stopped) return;
      frame = requestAnimationFrame(loop);
      controls?.update();
      renderer?.render(scene, camera);
    }

    async function begin() {
      if (started || stopped) return;
      started = true;
      window.clearInterval(timer);
      status = "Loading splat…";

      const { SparkRenderer, SplatMesh } = await import("@sparkjsdev/spark");
      if (stopped) return;

      renderer = new THREE.WebGLRenderer({ antialias: false });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      host.appendChild(renderer.domElement);

      // Full-precision positions and rotations. The packed path stores centers
      // as float16 and orientations in 8 bits, which breaks up fine surfaces.
      spark = new SparkRenderer({
        renderer,
        accumExtSplats: true,
        // Depth sort matches training. The 0.3 covariance epsilon is what the
        // original 3DGS rasterizer (and Scaniverse) adds so splats meet
        // instead of leaving speckled holes. Spark's default blur is the
        // mip-splatting compensation, which makes this scan look hazy.
        sortRadial: false,
        preBlurAmount: 0.3,
        blurAmount: 0,
        focalAdjustment: 2
      });
      scene.add(spark);

      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.rotateSpeed = 0.65;
      controls.zoomSpeed = 0.7;

      const mesh = new SplatMesh({
        url: "/actathon/wyandotte.spz",
        extSplats: true,
        onProgress: (event: ProgressEvent) => {
          if (!event.lengthComputable || event.total === 0) return;
          status = `Loading splat ${Math.round((event.loaded / event.total) * 100)}%`;
        }
      });
      splat = mesh;
      scene.add(mesh);

      resizeObserver.observe(host);
      resize();
      loop();

      try {
        await mesh.initialized;
        if (stopped) return;
        frameSplat(mesh, camera, controls);
        status = "";
      } catch {
        status = "Could not load the splat.";
      }
    }

    const timer = window.setInterval(() => {
      if (!host) return;
      const rect = host.getBoundingClientRect();
      if (rect.bottom > -280 && rect.top < window.innerHeight + 280) void begin();
    }, 300);

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      window.clearInterval(timer);
      resizeObserver.disconnect();
      controls?.dispose();
      splat?.dispose();
      spark?.dispose();
      renderer?.dispose();
      renderer?.domElement.remove();
    };
  });
</script>

<figure class="figure">
  <div class="frame" bind:this={host} role="application" aria-label="Parking lot gaussian splat">
    {#if status}
      <p class="status">{status}</p>
    {/if}
  </div>
  <figcaption>Gaussian splat of the Wyandotte St parking lot. Drag to look around.</figcaption>
</figure>

<style>
  .figure {
    margin: 1.1rem 0 1.5rem;
  }

  .frame {
    position: relative;
    height: 520px;
    border-radius: 4px;
    overflow: hidden;
    background: #9aa3ab;
  }

  .frame :global(canvas) {
    display: block;
    width: 100%;
    height: 100%;
    touch-action: none;
  }

  .status {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0;
    color: #c8c2b8;
    font-size: 0.78rem;
    letter-spacing: 0.02em;
    pointer-events: none;
  }

  figcaption {
    margin: 0.45rem 0 0;
    color: #8a8a8a;
    font-size: 0.76rem;
    line-height: 1.5;
  }

  @media (max-width: 640px) {
    .frame {
      height: 340px;
    }
  }
</style>
