import { ContactShadows, Html, OrbitControls, RoundedBox } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { useMemo, useRef, useState, type RefObject } from 'react'
import * as THREE from 'three'
import type { OverviewBed } from '../../types'

const COLORS = {
  ok: '#10b981',
  warning: '#f59e0b',
  critical: '#ef4444',
  offline: '#94a3b8',
  idle: '#1e293b',
  navy: '#0b1f3a',
  nurse: '#0d9488',
  tech: '#7c3aed',
}

function screenColor(bed: OverviewBed) {
  const m = bed.monitor
  if (!m) return COLORS.idle
  if (m.connection === 'lost') return COLORS.offline
  if (bed.alarms.highest === 'critical') return COLORS.critical
  if (bed.alarms.highest === 'warning' || m.sensor_status !== 'ok') return COLORS.warning
  return COLORS.ok
}

function hasTechnicalIssue(bed: OverviewBed) {
  const m = bed.monitor
  return !!m && (m.connection === 'lost' || m.sensor_status !== 'ok' || m.battery_pct <= 20)
}

function AlarmRing({ severity, acknowledged }: { severity: 'critical' | 'warning'; acknowledged: boolean }) {
  const ref = useRef<THREE.Mesh>(null)
  const mat = useRef<THREE.MeshBasicMaterial>(null)
  useFrame(({ clock }) => {
    if (!ref.current || !mat.current) return
    const speed = acknowledged ? 1.2 : severity === 'critical' ? 5 : 2.5
    const s = 1 + Math.sin(clock.elapsedTime * speed) * (acknowledged ? 0.02 : 0.08)
    ref.current.scale.set(s, s, 1)
    mat.current.opacity = acknowledged ? 0.35 : 0.55 + Math.sin(clock.elapsedTime * speed) * 0.3
  })
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
      <ringGeometry args={[1.75, 2.0, 48]} />
      <meshBasicMaterial ref={mat} color={severity === 'critical' ? COLORS.critical : COLORS.warning} transparent />
    </mesh>
  )
}

function Screen({ color, offline }: { color: string; offline: boolean }) {
  const mat = useRef<THREE.MeshStandardMaterial>(null)
  useFrame(({ clock }) => {
    if (mat.current && offline) mat.current.emissiveIntensity = Math.random() > 0.92 ? 0.05 : 0.5 + Math.sin(clock.elapsedTime * 3) * 0.1
  })
  return (
    <mesh position={[0, 0, 0.056]}>
      <planeGeometry args={[0.62, 0.42]} />
      <meshStandardMaterial ref={mat} color={color} emissive={color} emissiveIntensity={0.7} />
    </mesh>
  )
}

function Bed({ bed, selected, onSelect, portal }: { bed: OverviewBed; selected: boolean; onSelect: (b: OverviewBed) => void; portal: RefObject<HTMLDivElement | null> }) {
  const [hover, setHover] = useState(false)
  const facing = bed.position_z < 0 ? 0 : Math.PI
  const color = screenColor(bed)
  const m = bed.monitor
  const offline = m?.connection === 'lost'
  const lift = hover || selected ? 0.08 : 0
  return (
    <group position={[bed.position_x, 0, bed.position_z]}>
      {bed.alarms.highest && bed.alarms.highest !== 'advisory' && <AlarmRing severity={bed.alarms.highest} acknowledged={bed.alarms.unacknowledged === 0} />}
      <group
        rotation={[0, facing, 0]}
        position={[0, lift, 0]}
        onPointerOver={(e) => {
          e.stopPropagation()
          setHover(true)
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          setHover(false)
          document.body.style.cursor = ''
        }}
        onClick={(e) => {
          e.stopPropagation()
          onSelect(bed)
        }}
      >
        {/* frame + mattress + pillow */}
        <RoundedBox args={[1.35, 0.42, 2.5]} radius={0.06} position={[0, 0.32, 0]} castShadow receiveShadow>
          <meshStandardMaterial color={hover || selected ? '#c7d6ec' : '#dbe4f0'} />
        </RoundedBox>
        <RoundedBox args={[1.22, 0.16, 2.3]} radius={0.06} position={[0, 0.6, 0.02]} castShadow>
          <meshStandardMaterial color="#ffffff" />
        </RoundedBox>
        <RoundedBox args={[0.8, 0.12, 0.38]} radius={0.05} position={[0, 0.74, -0.9]}>
          <meshStandardMaterial color="#f1f5f9" />
        </RoundedBox>
        {/* headboard */}
        <RoundedBox args={[1.4, 0.8, 0.08]} radius={0.03} position={[0, 0.7, -1.27]} castShadow>
          <meshStandardMaterial color={COLORS.navy} />
        </RoundedBox>
        {/* patient */}
        {bed.occupied && (
          <group position={[0, 0.82, 0.05]}>
            <mesh position={[0, 0, 0.15]} rotation={[Math.PI / 2, 0, 0]} castShadow>
              <capsuleGeometry args={[0.26, 1.1, 6, 12]} />
              <meshStandardMaterial color="#93c5fd" />
            </mesh>
            <mesh position={[0, 0.06, -0.85]} castShadow>
              <sphereGeometry args={[0.19, 20, 16]} />
              <meshStandardMaterial color="#f2c6a0" />
            </mesh>
          </group>
        )}
        {/* monitor on a pole at the head of the bed */}
        {m && (
          <group position={[0.85, 0, -1.15]}>
            <mesh position={[0, 0.85, 0]} castShadow>
              <cylinderGeometry args={[0.03, 0.03, 1.7, 10]} />
              <meshStandardMaterial color="#94a3b8" metalness={0.6} roughness={0.3} />
            </mesh>
            <group position={[0, 1.7, 0.05]} rotation={[-0.15, -0.35, 0]}>
              <RoundedBox args={[0.74, 0.54, 0.1]} radius={0.03} castShadow>
                <meshStandardMaterial color="#1e293b" />
              </RoundedBox>
              <Screen color={color} offline={offline} />
            </group>
          </group>
        )}
      </group>

      <Html position={[0, 2.75, 0]} center distanceFactor={14} zIndexRange={[10, 0]} portal={portal as RefObject<HTMLElement>} style={{ pointerEvents: 'none' }}>
        <div
          style={{ borderColor: bed.alarms.highest === 'critical' ? COLORS.critical : bed.alarms.highest === 'warning' ? COLORS.warning : '#dce3ec' }}
          className="min-w-[96px] rounded-lg border-2 bg-white/95 px-2 py-1 text-center shadow-md select-none"
        >
          <div className="text-[11px] font-bold text-navy-900">{bed.display}</div>
          {m && !offline && (
            <div className="num flex justify-center gap-2 text-[15px] leading-tight font-bold">
              <span style={{ color: '#0e9f6e' }}>{m.vitals.hr ?? '––'}</span>
              <span style={{ color: '#0284c7' }}>{m.vitals.spo2 ?? '––'}%</span>
            </div>
          )}
          {offline && <div className="text-[11px] font-bold text-crit">OFFLINE</div>}
          {!bed.occupied && <div className="text-[10px] text-muted">Available</div>}
        </div>
      </Html>
    </group>
  )
}

/** A staff member who walks from the central station to the bed that needs attention. */
function Responder({ target, color, home, label, portal }: { target: THREE.Vector3 | null; color: string; home: THREE.Vector3; label: string; portal: RefObject<HTMLDivElement | null> }) {
  const ref = useRef<THREE.Group>(null)
  const placed = useRef(false)
  useFrame(({ clock }, delta) => {
    const g = ref.current
    if (!g) return
    if (!placed.current) {
      g.position.copy(home)
      placed.current = true
    }
    const dest = target ?? home
    const pos = g.position
    const dir = new THREE.Vector3(dest.x - pos.x, 0, dest.z - pos.z)
    const dist = dir.length()
    if (dist > 0.05) {
      dir.normalize()
      const step = Math.min(dist, delta * 3.2)
      pos.addScaledVector(dir, step)
      g.rotation.y = Math.atan2(dir.x, dir.z)
      g.position.y = Math.abs(Math.sin(clock.elapsedTime * 10)) * 0.06
    } else {
      g.position.y = 0
    }
  })
  return (
    <group ref={ref}>
      <mesh position={[0, 0.65, 0]} castShadow>
        <capsuleGeometry args={[0.22, 0.7, 6, 12]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, 1.33, 0]} castShadow>
        <sphereGeometry args={[0.18, 20, 16]} />
        <meshStandardMaterial color="#f2c6a0" />
      </mesh>
      <Html position={[0, 1.85, 0]} center distanceFactor={14} portal={portal as RefObject<HTMLElement>} style={{ pointerEvents: 'none' }}>
        <div className="rounded-full px-2 py-0.5 text-[10px] font-bold whitespace-nowrap text-white shadow" style={{ background: color }}>
          {label}
        </div>
      </Html>
    </group>
  )
}

function Room({ width, depth }: { width: number; depth: number }) {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial color="#f8fafc" />
      </mesh>
      <gridHelper args={[Math.max(width, depth), Math.max(width, depth) / 1.5, '#e2e8f0', '#e2e8f0']} position={[0, 0.005, 0]} />
      {[
        [0, -depth / 2, width, 0.15],
        [0, depth / 2, width, 0.15],
      ].map(([x, z, w, d], i) => (
        <mesh key={i} position={[x, 0.4, z]} castShadow receiveShadow>
          <boxGeometry args={[w, 0.8, d]} />
          <meshStandardMaterial color="#cbd5e1" />
        </mesh>
      ))}
      {[-width / 2, width / 2].map((x) => (
        <mesh key={x} position={[x, 0.4, 0]} receiveShadow>
          <boxGeometry args={[0.15, 0.8, depth]} />
          <meshStandardMaterial color="#cbd5e1" />
        </mesh>
      ))}
      {/* central nurse station */}
      <RoundedBox args={[3.6, 1, 1.1]} radius={0.12} position={[0, 0.5, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={COLORS.navy} />
      </RoundedBox>
      {[-1, 0, 1].map((i) => (
        <mesh key={i} position={[i * 1.05, 1.3, -0.2]} rotation={[-0.2, 0, 0]}>
          <boxGeometry args={[0.9, 0.55, 0.06]} />
          <meshStandardMaterial color="#0f172a" emissive="#5eead4" emissiveIntensity={0.25} />
        </mesh>
      ))}
    </group>
  )
}

export default function Ward3D({ beds, onSelect, selectedId }: { beds: OverviewBed[]; onSelect: (b: OverviewBed) => void; selectedId?: string }) {
  const width = Math.max(...beds.map((b) => Math.abs(b.position_x))) * 2 + 6
  const depth = 17

  const nurseTarget = useMemo(() => {
    const candidates = beds
      .filter((b) => b.top_alarm && !b.top_alarm.acknowledged && !hasTechnicalIssue(b))
      .sort((a, b) => (a.alarms.highest === 'critical' ? -1 : 1) - (b.alarms.highest === 'critical' ? -1 : 1))
    const b = candidates[0]
    return b ? new THREE.Vector3(b.position_x - 1.3, 0, b.position_z + (b.position_z < 0 ? 1.6 : -1.6)) : null
  }, [beds])

  // Labels attach to this wrapper; without an explicit portal drei can mount the first label too early.
  const wrapRef = useRef<HTMLDivElement>(null)
  const homes = useMemo(() => [new THREE.Vector3(-0.8, 0, 1.2), new THREE.Vector3(0.8, 0, 1.2)], [])

  const techTarget = useMemo(() => {
    const b = beds.find(hasTechnicalIssue)
    return b ? new THREE.Vector3(b.position_x + 1.4, 0, b.position_z + (b.position_z < 0 ? 0.6 : -0.6)) : null
  }, [beds])

  return (
    <div ref={wrapRef} className="relative h-full w-full">
    <Canvas shadows camera={{ position: [0, width * 0.78, width * 0.92], fov: 42 }} dpr={[1, 2]}>
      <color attach="background" args={['#eef3fa']} />
      <ambientLight intensity={0.75} />
      <directionalLight position={[8, 16, 8]} intensity={1.1} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-16} shadow-camera-right={16} shadow-camera-top={12} shadow-camera-bottom={-12} />
      <Room width={width} depth={depth} />
      {beds.map((b) => (
        <Bed key={b.id} bed={b} selected={b.id === selectedId} onSelect={onSelect} portal={wrapRef} />
      ))}
      <Responder target={nurseTarget} color={COLORS.nurse} home={homes[0]} label="Nurse" portal={wrapRef} />
      <Responder target={techTarget} color={COLORS.tech} home={homes[1]} label="Biomed" portal={wrapRef} />
      <ContactShadows position={[0, 0.01, 0]} opacity={0.25} scale={40} blur={2.4} far={6} />
      <OrbitControls makeDefault enablePan maxPolarAngle={Math.PI / 2.25} minDistance={8} maxDistance={40} target={[0, 0, 0]} />
    </Canvas>
    </div>
  )
}
