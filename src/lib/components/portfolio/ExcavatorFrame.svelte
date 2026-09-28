<script lang="ts">
  import { onMount } from "svelte";
  import * as THREE from "three";
  import { OrbitControls } from "three/addons/controls/OrbitControls.js";
  import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

  let host: HTMLDivElement;
  let status = $state("");
  let started = false;

  onMount(() => {
    let renderer: THREE.WebGLRenderer | undefined;
    let controls: OrbitControls | undefined;
    let frame = 0;
    let stopped = false;
    const resizeObserver = new ResizeObserver(() => resize());

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#1e1d1b");
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 5000);
    scene.add(new THREE.HemisphereLight(0xfff4e8, 0x2c2926, 1.2));
    const key = new THREE.DirectionalLight(0xffffff, 1.8);
    key.position.set(3, 5, 4);
    scene.add(key);

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

    function begin() {
      if (started || stopped) return;
      started = true;
      window.clearInterval(timer);
      status = "Loading excavator…";

      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      host.appendChild(renderer.domElement);

      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.enablePan = false;
      controls.autoRotate = true;
      controls.autoRotateSpeed = 1.1;
      renderer.domElement.addEventListener("pointerdown", () => {
        if (controls) controls.autoRotate = false;
      });

      const loader = new GLTFLoader();
      loader.load(
        "/actathon/excavator.glb",
        (gltf) => {
          if (stopped) return;
          const model = gltf.scene;
          const box = new THREE.Box3().setFromObject(model);
          const center = box.getCenter(new THREE.Vector3());
          const size = box.getSize(new THREE.Vector3());
          model.position.sub(center);
          scene.add(model);

          const radius = size.length() * 0.5;
          const distance = radius / Math.sin((camera.fov * Math.PI) / 360);
          camera.position.set(distance * 0.72, distance * 0.28, distance * 0.78);
          camera.near = radius / 100;
          camera.far = radius * 20;
          camera.updateProjectionMatrix();
          controls?.target.set(0, 0, 0);
          controls?.update();
          status = "";
        },
        (event) => {
          if (!event.lengthComputable) return;
          status = `Loading excavator ${Math.round((event.loaded / event.total) * 100)}%`;
        },
        () => {
          status = "Could not load the excavator.";
        }
      );

      resizeObserver.observe(host);
      resize();
      loop();
    }

    const timer = window.setInterval(() => {
      if (!host) return;
      const rect = host.getBoundingClientRect();
      if (rect.bottom > -280 && rect.top < window.innerHeight + 280) begin();
    }, 300);

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      window.clearInterval(timer);
      resizeObserver.disconnect();
      controls?.dispose();
      scene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry?.dispose();
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          for (const material of materials) material?.dispose();
        }
      });
      renderer?.dispose();
      renderer?.domElement.remove();
    };
  });
</script>

<figure class="figure">
  <div class="frame" bind:this={host} role="application" aria-label="Excavator model">
    {#if status}
      <p class="status">{status}</p>
    {/if}
  </div>
  <figcaption>Mini excavator mesh used in sim. Drag to rotate.</figcaption>
</figure>

<style>
  .figure {
    margin: 1.1rem 0 1.5rem;
  }

  .frame {
    position: relative;
    height: 380px;
    border-radius: 4px;
    overflow: hidden;
    background: #1e1d1b;
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
      height: 280px;
    }
  }
</style>
