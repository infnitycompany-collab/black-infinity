"use client";
import { useEffect, useRef } from "react";
export default function InfinityScene() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = ref.current;
    if (
      !host ||
      matchMedia("(prefers-reduced-motion: reduce)").matches ||
      (navigator as any).connection?.saveData
    )
      return;
    let dispose = () => {},
      cancel = false;
    import("three").then((T) => {
      if (cancel) return;
      let renderer: InstanceType<typeof T.WebGLRenderer>;
      try {
        renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
      } catch {
        return;
      }
      renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
      host.appendChild(renderer.domElement);
      const scene = new T.Scene(),
        camera = new T.PerspectiveCamera(32, 1, 0.1, 100);
      camera.position.z = 8;
      const points = [];
      for (let i = 0; i <= 240; i++) {
        const t = (i / 240) * Math.PI * 2;
        points.push(
          new T.Vector3(
            (2 * Math.cos(t)) / (1 + Math.sin(t) ** 2),
            (2 * Math.sin(t) * Math.cos(t)) / (1 + Math.sin(t) ** 2),
            0.28 * Math.sin(t),
          ),
        );
      }
      const geometry = new T.TubeGeometry(
          new T.CatmullRomCurve3(points),
          240,
          0.17,
          12,
          true,
        ),
        material = new T.MeshPhysicalMaterial({
          color: 0x9b80ff,
          metalness: 0.65,
          roughness: 0.22,
          clearcoat: 1,
        });
      const mesh = new T.Mesh(geometry, material);
      scene.add(mesh, new T.AmbientLight(0xd6c6ff, 2));
      const light = new T.PointLight(0xbaa5ff, 70);
      light.position.set(2, 3, 4);
      scene.add(light);
      let visible = true,
        raf = 0;
      const resize = () => {
        const w = host.clientWidth,
          h = host.clientHeight;
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(host);
      const io = new IntersectionObserver(
        (e) => (visible = e[0].isIntersecting),
      );
      io.observe(host);
      const frame = (t: number) => {
        raf = requestAnimationFrame(frame);
        if (document.hidden || !visible) return;
        mesh.rotation.y = Math.sin(t * 0.00025) * 0.28;
        mesh.rotation.z = Math.sin(t * 0.00018) * 0.12;
        renderer.render(scene, camera);
      };
      raf = requestAnimationFrame(frame);
      dispose = () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        io.disconnect();
        geometry.dispose();
        material.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
    });
    return () => {
      cancel = true;
      dispose();
    };
  }, []);
  return (
    <div ref={ref} className="infinity-scene" aria-hidden="true">
      <span className="scene-fallback">∞</span>
    </div>
  );
}
