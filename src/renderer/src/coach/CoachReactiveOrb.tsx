import { useEffect, useRef, type CSSProperties } from "react";
import * as THREE from "three";
import {
  createCoachOrbitParticles,
  createCoachOrbParticles,
  getCoachTopicPalette,
  type CoachTopic,
} from "./visual";

type CoachReactiveOrbProps = {
  topic: CoachTopic;
  active: boolean;
  listening: boolean;
  speaking: boolean;
  audioLevel: number;
};

export function CoachReactiveOrb({
  topic,
  active,
  listening,
  speaking,
  audioLevel,
}: CoachReactiveOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeRef = useRef(active);
  const audioLevelRef = useRef(audioLevel);
  const paletteRef = useRef(getCoachTopicPalette(topic));
  const materialRefs = useRef<THREE.Material[]>([]);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    audioLevelRef.current = audioLevel;
  }, [audioLevel]);

  useEffect(() => {
    const palette = getCoachTopicPalette(topic);
    paletteRef.current = palette;
    for (const material of materialRefs.current) {
      if ("color" in material) {
        const colorMaterial = material as THREE.Material & {
          color: THREE.Color;
        };
        colorMaterial.color.set(palette.primary);
      }
    }
  }, [topic]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const parent = canvas.parentElement;
    if (!parent) return undefined;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 0, 6.1);

    const group = new THREE.Group();
    scene.add(group);

    const coreGeometry = new THREE.BufferGeometry();
    coreGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(
        createCoachOrbParticles({ count: 2200, radius: 1.34 }),
        3,
      ),
    );
    const coreMaterial = new THREE.PointsMaterial({
      color: paletteRef.current.primary,
      size: 0.021,
      transparent: true,
      opacity: 0.86,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const core = new THREE.Points(coreGeometry, coreMaterial);
    group.add(core);

    const orbitGeometry = new THREE.BufferGeometry();
    orbitGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(
        createCoachOrbitParticles({ count: 760, radius: 2.05 }),
        3,
      ),
    );
    const orbitMaterial = new THREE.PointsMaterial({
      color: paletteRef.current.secondary,
      size: 0.018,
      transparent: true,
      opacity: 0.78,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const orbit = new THREE.Points(orbitGeometry, orbitMaterial);
    group.add(orbit);

    const coreGlowMaterial = new THREE.MeshBasicMaterial({
      color: paletteRef.current.core,
      transparent: true,
      opacity: 0.34,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const coreGlow = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.48, 3),
      coreGlowMaterial,
    );
    group.add(coreGlow);

    const ringMaterials = [
      new THREE.MeshBasicMaterial({
        color: paletteRef.current.primary,
        transparent: true,
        opacity: 0.48,
      }),
      new THREE.MeshBasicMaterial({
        color: paletteRef.current.secondary,
        transparent: true,
        opacity: 0.34,
      }),
      new THREE.MeshBasicMaterial({
        color: paletteRef.current.primary,
        transparent: true,
        opacity: 0.28,
      }),
    ];
    const rings = [
      new THREE.Mesh(
        new THREE.TorusGeometry(1.65, 0.012, 10, 170),
        ringMaterials[0],
      ),
      new THREE.Mesh(
        new THREE.TorusGeometry(2.15, 0.01, 10, 190),
        ringMaterials[1],
      ),
      new THREE.Mesh(
        new THREE.TorusGeometry(2.62, 0.008, 10, 210),
        ringMaterials[2],
      ),
    ];
    rings[1].rotation.x = Math.PI / 2.8;
    rings[2].rotation.y = Math.PI / 3.4;
    rings.forEach((ring) => group.add(ring));

    materialRefs.current = [
      coreMaterial,
      orbitMaterial,
      coreGlowMaterial,
      ...ringMaterials,
    ];

    const resize = () => {
      const width = parent.clientWidth;
      const height = parent.clientHeight;
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
    };

    let frameId = 0;
    const clock = new THREE.Clock();
    const animate = () => {
      const elapsed = clock.getElapsedTime();
      const audioPulse = Math.min(1, audioLevelRef.current);
      const activity = activeRef.current ? 1 : 0;
      const speed = 0.65 + activity * 0.72 + audioPulse * 1.4;
      const pulse =
        1 +
        activity * 0.08 +
        Math.sin(elapsed * 4.3) * (0.025 + audioPulse * 0.07);

      group.rotation.y = elapsed * 0.11 * speed;
      group.rotation.x = Math.sin(elapsed * 0.27) * 0.16;
      core.rotation.z = elapsed * 0.08 * speed;
      orbit.rotation.y = -elapsed * 0.21 * speed;
      orbit.rotation.x = Math.sin(elapsed * 0.38) * 0.24;
      coreGlow.scale.setScalar(pulse);
      rings[0].rotation.z = elapsed * 0.22 * speed;
      rings[1].rotation.z = -elapsed * 0.17 * speed;
      rings[2].rotation.x = elapsed * 0.14 * speed;
      coreMaterial.size = 0.019 + activity * 0.004 + audioPulse * 0.009;
      orbitMaterial.size = 0.016 + activity * 0.003 + audioPulse * 0.006;

      renderer.render(scene, camera);
      frameId = window.requestAnimationFrame(animate);
    };

    resize();
    animate();
    window.addEventListener("resize", resize);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", resize);
      coreGeometry.dispose();
      orbitGeometry.dispose();
      coreMaterial.dispose();
      orbitMaterial.dispose();
      coreGlow.geometry.dispose();
      coreGlowMaterial.dispose();
      rings.forEach((ring) => ring.geometry.dispose());
      ringMaterials.forEach((material) => material.dispose());
      renderer.dispose();
      materialRefs.current = [];
    };
  }, []);

  const palette = getCoachTopicPalette(topic);
  const stateLabel = listening
    ? "listening"
    : speaking
      ? "responding"
      : active
        ? "processing"
        : "standby";

  return (
    <div
      className={`coach-orb-stage topic-${topic}`}
      data-testid="coach-orb-stage"
      style={
        {
          "--coach-orb-primary": palette.primary,
          "--coach-orb-secondary": palette.secondary,
          "--coach-orb-core": palette.core,
        } as CSSProperties
      }
    >
      <canvas
        ref={canvasRef}
        className="coach-orb-canvas"
        data-testid="coach-orb-canvas"
        aria-hidden="true"
      />
      <div className="coach-orb-frame" aria-hidden="true" />
      <div className="coach-orb-readout">
        <span>{palette.label}</span>
        <strong>{stateLabel}</strong>
      </div>
    </div>
  );
}
