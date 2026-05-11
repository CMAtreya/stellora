import { Suspense, useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Html, OrbitControls, Stars, useTexture } from '@react-three/drei'
import { Color, Group, Mesh, SRGBColorSpace, Vector3 } from 'three'

export type FlightPhase = 'orbit' | 'toLogin' | 'hidden' | 'toHome'

const earthTextureUrl = 'https://threejs.org/examples/textures/land_ocean_ice_cloud_2048.jpg'

const destinations = [
  { name: 'NYC', lat: 40.7128, lon: -74.006 },
  { name: 'Paris', lat: 48.8566, lon: 2.3522 },
  { name: 'Tokyo', lat: 35.6762, lon: 139.6503 },
]

function latLonToVec3(lat: number, lon: number, radius: number) {
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lon + 180) * (Math.PI / 180)
  const x = -radius * Math.sin(phi) * Math.cos(theta)
  const z = radius * Math.sin(phi) * Math.sin(theta)
  const y = radius * Math.cos(phi)
  return new Vector3(x, y, z)
}

function Earth({ onClick }: { onClick: () => void }) {
  const texture = useTexture(earthTextureUrl)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 8
  const rotationRef = useRef<Mesh>(null)

  useFrame((_, delta) => {
    if (rotationRef.current) {
      rotationRef.current.rotation.y += delta * 0.05
    }
  })

  return (
    <mesh ref={rotationRef} onClick={onClick} castShadow receiveShadow>
      <sphereGeometry args={[1.5, 64, 64]} />
      <meshStandardMaterial map={texture} metalness={0.05} roughness={1} />
    </mesh>
  )
}

function Atmosphere() {
  return (
    <mesh>
      <sphereGeometry args={[1.52, 64, 64]} />
      <meshStandardMaterial emissive={new Color('#7dd3fc')} emissiveIntensity={0.08} transparent opacity={0.12} />
    </mesh>
  )
}

function PlaneMesh({
  phase,
  onHideBehind,
  onReachLogin,
}: {
  phase: FlightPhase
  onHideBehind: () => void
  onReachLogin: () => void
}) {
  const group = useRef<Group>(null)
  const targetOrbitRadius = 2.2
  const angleRef = useRef(0)
  const targetLogin = useMemo(() => new Vector3(1.4, -0.2, 0.2), [])
  const targetHome = useMemo(() => new Vector3(-5, 1.8, -4), [])

  useFrame((_, delta) => {
    const plane = group.current
    if (!plane) return

    plane.visible = true

    if (phase === 'orbit') {
      angleRef.current += delta * 0.65
      const x = Math.cos(angleRef.current) * targetOrbitRadius
      const z = Math.sin(angleRef.current) * targetOrbitRadius
      const y = 0.25 * Math.sin(angleRef.current * 0.9)
      plane.position.set(x, y, z)
      plane.lookAt(0, 0, 0)
    } else if (phase === 'toLogin') {
      plane.position.lerp(targetLogin, delta * 1.5)
      plane.lookAt(0, 0, 0)
      if (plane.position.distanceTo(targetLogin) < 0.12) {
        onHideBehind()
        onReachLogin()
      }
    } else if (phase === 'toHome') {
      plane.position.lerp(targetHome, delta * 1.2)
      plane.lookAt(targetHome.clone().add(new Vector3(-1, 0.2, -1)))
    }
  })

  return (
    <group ref={group} position={[targetOrbitRadius, 0.3, 0]}>
      <pointLight position={[0.4, 0.2, 0]} intensity={1.6} distance={6} color="#f97316" />
      <mesh castShadow receiveShadow position={[0, 0, 0]}>
        <boxGeometry args={[0.68, 0.12, 0.12]} />
        <meshStandardMaterial color="#ffffff" emissive="#7dd3fc" emissiveIntensity={0.55} metalness={0.5} roughness={0.2} />
      </mesh>
      <mesh castShadow receiveShadow position={[0.36, 0, 0]}>
        <coneGeometry args={[0.1, 0.24, 16]} />
        <meshStandardMaterial color="#f97316" emissive="#f97316" emissiveIntensity={0.45} metalness={0.35} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 0.08, 0]}>
        <boxGeometry args={[0.3, 0.012, 0.44]} />
        <meshStandardMaterial color="#ffffff" roughness={0.12} metalness={0.55} />
      </mesh>
      <mesh castShadow receiveShadow position={[-0.3, 0, 0]}>
        <boxGeometry args={[0.16, 0.06, 0.12]} />
        <meshStandardMaterial color="#cbd5e1" metalness={0.25} roughness={0.35} />
      </mesh>
    </group>
  )
}

function GlobeContents({ rotationOffset, onGlobeClick }: { rotationOffset: number; onGlobeClick: () => void }) {
  const globeGroup = useRef<Group>(null)
  useFrame(() => {
    if (globeGroup.current) {
      globeGroup.current.rotation.y = rotationOffset
    }
  })

  return (
    <Suspense
      fallback={
        <Html center>
          <div className="rounded-full border border-white/15 bg-black/50 px-4 py-2 text-sm text-white/70">Loading globe…</div>
        </Html>
      }
    >
      <group ref={globeGroup} position={[0, 0, 0]}>
        <Earth onClick={onGlobeClick} />
        <Atmosphere />
        {destinations.map((dest) => {
          const pos = latLonToVec3(dest.lat, dest.lon, 1.52)
          return (
            <mesh key={dest.name} position={pos}>
              <sphereGeometry args={[0.05, 16, 16]} />
              <meshStandardMaterial color="#fbbf24" emissive="#fbbf24" emissiveIntensity={0.7} />
            </mesh>
          )
        })}
      </group>
    </Suspense>
  )
}

export function GlobeScene({
  phase,
  onGlobeClick,
  onPlaneHidden,
  onLoginApproach,
  fullBleed = false,
  rotationOffset = 0,
}: {
  phase: FlightPhase
  onGlobeClick: () => void
  onPlaneHidden: () => void
  onLoginApproach: () => void
  fullBleed?: boolean
  rotationOffset?: number
}) {
  const containerClass = fullBleed
    ? 'relative h-screen w-full overflow-hidden bg-slate-950'
    : 'relative h-[420px] w-full overflow-hidden rounded-[28px] border border-white/10 bg-slate-950/60 shadow-[0_30px_80px_-60px_rgba(0,0,0,1)]'
  return (
    <div className={containerClass}>
      <Canvas shadows camera={{ position: [0, 2.4, 5.4], fov: 35 }}>
        <color attach="background" args={[0.02, 0.03, 0.08]} />
        <ambientLight intensity={0.4} />
        <directionalLight position={[4, 4, 4]} intensity={1.1} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} />
        <spotLight position={[-4, 5, -2]} intensity={0.6} angle={0.3} penumbra={0.5} />

        <GlobeContents rotationOffset={rotationOffset} onGlobeClick={onGlobeClick} />

        <PlaneMesh phase={phase} onHideBehind={onPlaneHidden} onReachLogin={onLoginApproach} />

        <Stars radius={60} depth={30} count={8000} factor={2} saturation={0} fade speed={1} />
        <OrbitControls enableZoom={false} enablePan={false} autoRotate autoRotateSpeed={0.4} />
      </Canvas>
    </div>
  )
}
