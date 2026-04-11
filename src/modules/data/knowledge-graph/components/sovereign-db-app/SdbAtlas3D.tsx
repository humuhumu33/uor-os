/**
 * SdbAtlas3D — WebGL 3D torus visualization of the 96-vertex Atlas.
 * ══════════════════════════════════════════════════════════════════
 *
 * Uses react-three-fiber to render vertices on a torus surface with
 * adjacency edges, auto-rotation, and interactive orbit controls.
 *
 * @product SovereignDB
 */

import { useRef, useMemo, useState, useCallback } from "react";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Text } from "@react-three/drei";
import * as THREE from "three";
import { getAtlas, type AtlasVertex } from "@/modules/research/atlas/atlas";
import { decodeTriality } from "@/modules/research/atlas/triality";

// ── Colors ───────────────────────────────────────────────────────────────

const SC_COLORS = [
  new THREE.Color("hsl(210, 80%, 60%)"),
  new THREE.Color("hsl(180, 70%, 50%)"),
  new THREE.Color("hsl(150, 70%, 50%)"),
  new THREE.Color("hsl(120, 60%, 55%)"),
  new THREE.Color("hsl(40, 85%, 55%)"),
  new THREE.Color("hsl(20, 85%, 55%)"),
  new THREE.Color("hsl(340, 70%, 55%)"),
  new THREE.Color("hsl(270, 60%, 60%)"),
];

// ── Torus math ───────────────────────────────────────────────────────────

const MAJOR_R = 3.5;
const MINOR_R = 1.2;

function torusXYZ(v: AtlasVertex): [number, number, number] {
  const c = decodeTriality(v.index);
  const theta = (2 * Math.PI * (c.quadrant * 3 + c.modality)) / 12;
  const phi = (2 * Math.PI * c.slot) / 8;
  const x = (MAJOR_R + MINOR_R * Math.cos(phi)) * Math.cos(theta);
  const y = (MAJOR_R + MINOR_R * Math.cos(phi)) * Math.sin(theta);
  const z = MINOR_R * Math.sin(phi);
  return [x, y, z];
}

// ── Vertex spheres ───────────────────────────────────────────────────────

interface VertexProps {
  position: [number, number, number];
  color: THREE.Color;
  label: string;
  index: number;
  onSelect: (idx: number) => void;
  selected: boolean;
  hovered: boolean;
  onHover: (idx: number | null) => void;
}

function Vertex({ position, color, label, index, onSelect, selected, hovered, onHover }: VertexProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const baseScale = selected ? 1.6 : hovered ? 1.3 : 1;

  useFrame(() => {
    if (meshRef.current) {
      const s = meshRef.current.scale.x;
      const target = baseScale;
      meshRef.current.scale.setScalar(s + (target - s) * 0.15);
    }
  });

  return (
    <mesh
      ref={meshRef}
      position={position}
      onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onSelect(index); }}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); onHover(index); }}
      onPointerOut={() => onHover(null)}
    >
      <sphereGeometry args={[0.08, 16, 16]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={selected ? 0.8 : hovered ? 0.5 : 0.2}
        roughness={0.3}
        metalness={0.1}
      />
    </mesh>
  );
}

// ── Edge lines ───────────────────────────────────────────────────────────

function Edges({ positions }: { positions: Float32Array }) {
  const ref = useRef<THREE.LineSegments>(null);
  return (
    <lineSegments ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
      </bufferGeometry>
      <lineBasicMaterial color="hsl(0, 0%, 40%)" transparent opacity={0.15} />
    </lineSegments>
  );
}

// ── Rotating group ───────────────────────────────────────────────────────

function RotatingGroup({ children, autoRotate }: { children: React.ReactNode; autoRotate: boolean }) {
  const groupRef = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (groupRef.current && autoRotate) {
      groupRef.current.rotation.y += delta * 0.08;
    }
  });
  return <group ref={groupRef}>{children}</group>;
}

// ── Ghost torus surface ─────────────────────────────────────────────────

function GhostTorus() {
  return (
    <mesh>
      <torusGeometry args={[MAJOR_R, MINOR_R, 48, 96]} />
      <meshStandardMaterial
        color="hsl(210, 20%, 25%)"
        transparent
        opacity={0.04}
        wireframe
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

// ── Main 3D Scene ────────────────────────────────────────────────────────

interface SceneProps {
  onSelectVertex: (idx: number | null) => void;
  selectedIdx: number | null;
}

function AtlasScene({ onSelectVertex, selectedIdx }: SceneProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const atlas = useMemo(() => getAtlas(), []);

  const vertexData = useMemo(() =>
    atlas.vertices.map(v => ({
      pos: torusXYZ(v) as [number, number, number],
      color: SC_COLORS[v.signClass],
      label: `v${v.index}`,
      vertex: v,
    })),
  [atlas]);

  // Edge line geometry
  const edgePositions = useMemo(() => {
    const seen = new Set<string>();
    const pts: number[] = [];
    for (const v of atlas.vertices) {
      for (const nIdx of v.neighbors) {
        const key = `${Math.min(v.index, nIdx)}-${Math.max(v.index, nIdx)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const a = torusXYZ(v);
        const b = torusXYZ(atlas.vertices[nIdx]);
        pts.push(...a, ...b);
      }
    }
    return new Float32Array(pts);
  }, [atlas]);

  return (
    <>
      <ambientLight intensity={0.6} />
      <pointLight position={[10, 10, 10]} intensity={0.8} />
      <pointLight position={[-10, -5, -10]} intensity={0.3} />

      <RotatingGroup autoRotate={selectedIdx === null}>
        <GhostTorus />
        <Edges positions={edgePositions} />

        {vertexData.map((vd, i) => (
          <Vertex
            key={i}
            position={vd.pos}
            color={vd.color}
            label={vd.label}
            index={vd.vertex.index}
            onSelect={onSelectVertex}
            selected={selectedIdx === vd.vertex.index}
            hovered={hoveredIdx === vd.vertex.index}
            onHover={setHoveredIdx}
          />
        ))}
      </RotatingGroup>

      <OrbitControls
        enablePan
        enableZoom
        enableRotate
        minDistance={3}
        maxDistance={15}
        makeDefault
      />
    </>
  );
}

// ── Exported component ───────────────────────────────────────────────────

interface Props {
  onSelectVertex?: (idx: number | null) => void;
  selectedIdx?: number | null;
}

export function SdbAtlas3D({ onSelectVertex, selectedIdx = null }: Props) {
  const handleSelect = useCallback((idx: number | null) => {
    onSelectVertex?.(idx);
  }, [onSelectVertex]);

  return (
    <div className="w-full h-full bg-background">
      <Canvas
        camera={{ position: [0, 4, 8], fov: 50 }}
        gl={{ antialias: true, alpha: false }}
        onPointerMissed={() => handleSelect(null)}
      >
        <color attach="background" args={["hsl(222, 47%, 6%)"]} />
        <fog attach="fog" args={["hsl(222, 47%, 6%)", 10, 20]} />
        <AtlasScene onSelectVertex={handleSelect} selectedIdx={selectedIdx} />
      </Canvas>
    </div>
  );
}
