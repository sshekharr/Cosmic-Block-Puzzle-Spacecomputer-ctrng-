"use client";

import { memo, useEffect, useRef } from "react";
import * as THREE from "three";

function WormholeBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x000000, 100, 160);

    const camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.1,
      1000,
    );
    camera.position.set(0, 30, 100);

    const container = new THREE.Object3D();
    scene.add(container);

    const width = 150;
    const height = 150;
    const center = new THREE.Vector3(0, 0, 0);
    const maxDistance = new THREE.Vector3(width * 0.5, height * 0.5, 0).distanceTo(center);

    const planeGeom = new THREE.PlaneGeometry(width * 2, height * 2, width, height);
    planeGeom.rotateX(-Math.PI * 0.5);

    const planePositions = planeGeom.attributes.position;
    const planeMeta: { dist: number; ratio: number }[] = [];
    for (let i = 0; i < planePositions.count; i++) {
      const x = planePositions.getX(i);
      const y = planePositions.getY(i);
      const z = planePositions.getZ(i);
      const dist = new THREE.Vector3(x, y, z).distanceTo(center);
      const ratio = (maxDistance - dist) / (maxDistance * 0.9);
      planeMeta.push({ dist, ratio });
    }

    const plane = new THREE.Mesh(
      planeGeom,
      new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide }),
    );
    container.add(plane);

    const vertices: number[] = [];
    const dotsMeta: { dist: number; ratio: number }[] = [];

    for (let x = -width * 0.5; x < width * 0.5; x++) {
      for (let z = -height * 0.5; z < height * 0.5; z++) {
        const vx = x * 1.2;
        const vz = z * 1.2;
        const vec = new THREE.Vector3(vx, 0, vz);
        const dist = vec.distanceTo(center);
        const ratio = (maxDistance - dist) / (maxDistance * 0.9);
        vertices.push(vx, 0, vz);
        dotsMeta.push({ dist, ratio });
      }
    }

    const dotsGeom = new THREE.BufferGeometry();
    dotsGeom.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));

    const texture = new THREE.TextureLoader().load(
      "https://s3-us-west-2.amazonaws.com/s.cdpn.io/127738/dotTexture.png",
    );

    const dots = new THREE.Points(
      dotsGeom,
      new THREE.PointsMaterial({
        color: 0xfdd400,
        map: texture,
        transparent: true,
        alphaTest: 0.4,
        size: 1,
      }),
    );
    container.add(dots);

    let rafId = 0;
    const start = performance.now();

    const animate = () => {
      const t = performance.now() - start;
      rafId = requestAnimationFrame(animate);

      const wobble = (Math.sin(t * 0.0009) + 1) / 2;
      const easeHole = 2 * wobble;
      const easeDepth = 1.5 * wobble;

      const camWobble = (Math.sin(t * 0.001) + 1) / 2;
      camera.position.z = 50 + camWobble * 50;
      camera.position.y = 30 + camWobble * 50;

      container.rotation.y = (t / 48000) * Math.PI * 2;

      const dotPositions = dotsGeom.attributes.position;
      for (let i = 0; i < dotPositions.count; i++) {
        const ratioData = dotsMeta[i];
        let ratioA = ratioData.ratio * easeDepth + easeHole;
        ratioA *= ratioData.ratio ** 4;
        let y = ratioA * -150;
        y = Math.max(y, -100);
        y += Math.sin(-(ratioData.dist * 0.4) + t * 0.004);
        dotPositions.setY(i, y);
      }
      dotPositions.needsUpdate = true;

      for (let i = 0; i < planePositions.count; i++) {
        const ratioData = planeMeta[i];
        let ratioA = ratioData.ratio * easeDepth + easeHole;
        ratioA *= ratioData.ratio ** 4;
        let y = ratioA * -150;
        y = Math.max(y, -100);
        y += Math.sin(-(ratioData.dist * 0.4) + t * 0.004);
        planePositions.setY(i, y);
      }
      planePositions.needsUpdate = true;

      camera.lookAt(new THREE.Vector3(0, -20, 0));
      renderer.render(scene, camera);
    };

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    };

    window.addEventListener("resize", onResize);
    animate();

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
      dotsGeom.dispose();
      planeGeom.dispose();
      texture.dispose();
      renderer.dispose();
    };
  }, []);

  return <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 z-0 h-full w-full" aria-hidden="true" />;
}

export default memo(WormholeBackground);
