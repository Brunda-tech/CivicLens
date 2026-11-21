import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  ChevronDown,
  ChevronUp,
  Compass,
  GitMerge,
  Layers,
  MapPin,
  RotateCcw,
  Users,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import type { Complaint, ComplaintSeverity, WardSector } from '../types/civiclens';

interface SmartGrid3DMapProps {
  nodes: Complaint[];
  sectors: WardSector[];
  selectedNodeId?: number | null;
  onSelectNode?: (node: Complaint) => void;
  heightClass?: string;
}

const SEVERITY_HEX: Record<ComplaintSeverity, string> = {
  CRITICAL: '#F43F5E',
  HIGH: '#F97316',
  MEDIUM: '#FBBF24',
  LOW: '#34D399',
};

const DUPLICATE_HALO_HEX = '#818CF8';

const DEFAULT_CAMERA_POS = new THREE.Vector3(28, 23, 30);
const DEFAULT_TARGET_POS = new THREE.Vector3(0, 1.5, 0);

function detectSoftwareWebGL(renderer: THREE.WebGLRenderer): boolean {
  try {
    const gl = renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    if (dbg) {
      const str = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '');
      if (/SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(str)) {
        return true;
      }
    }
  } catch {
    // Ignore extension query errors
  }
  return false;
}

function createSmartGridTexture(): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#070D1F';
  ctx.fillRect(0, 0, size, size);

  const grad = ctx.createRadialGradient(size / 2, size / 2, 40, size / 2, size / 2, size * 0.52);
  grad.addColorStop(0, 'rgba(34, 211, 238, 0.14)');
  grad.addColorStop(0.55, 'rgba(99, 102, 241, 0.06)');
  grad.addColorStop(1, 'rgba(7, 13, 31, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const minorStep = size / 32;
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= 32; i++) {
    const p = i * minorStep;
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
  }
  ctx.stroke();

  const majorStep = size / 8;
  ctx.strokeStyle = 'rgba(34, 211, 238, 0.34)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i <= 8; i++) {
    const p = i * majorStep;
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
  }
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

function createWardLabelSprite(wardName: string, zoneLabel: string, hasCritical: boolean): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = hasCritical ? 'rgba(35, 11, 24, 0.88)' : 'rgba(11, 17, 36, 0.88)';
  ctx.strokeStyle = hasCritical ? '#F43F5E' : '#38BDF8';
  ctx.lineWidth = 3;

  const r = 18;
  const x = 14;
  const y = 16;
  const w = canvas.width - 28;
  const h = canvas.height - 32;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  const shortWard = wardName.replace(/^Ward\s+\d+\s*-\s*/i, '');
  ctx.fillStyle = '#F8FAFC';
  ctx.font = 'bold 34px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(shortWard.toUpperCase(), canvas.width / 2, 62);

  ctx.fillStyle = hasCritical ? '#FDA4AF' : '#67E8F9';
  ctx.font = '600 22px monospace';
  ctx.fillText(zoneLabel, canvas.width / 2, 95);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(5.4, 1.35, 1);
  return sprite;
}

export function SmartGrid3DMap({
  nodes,
  sectors,
  selectedNodeId,
  onSelectNode,
  heightClass = 'h-[560px]',
}: SmartGrid3DMapProps) {
  const { t } = useLanguage();
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [contextLost, setContextLost] = useState(false);
  const [hudCollapsed, setHudCollapsed] = useState(false);
  const [autoOrbit, setAutoOrbit] = useState(true);
  const [filterMode, setFilterMode] = useState<'ALL' | 'CRITICAL' | 'HIGH' | 'DUPLICATES'>('ALL');
  const [activeWard, setActiveWard] = useState<string>('ALL');
  const [internalSelected, setInternalSelected] = useState<Complaint | null>(null);

  const filteredNodes = useMemo(() => {
    return nodes.filter((n) => {
      if (activeWard !== 'ALL' && n.ward !== activeWard) return false;
      if (filterMode === 'CRITICAL') return n.severity === 'CRITICAL';
      if (filterMode === 'HIGH') return n.severity === 'CRITICAL' || n.severity === 'HIGH';
      if (filterMode === 'DUPLICATES') return n.is_suspected_duplicate === 1 || n.community_impact_count > 1;
      return true;
    });
  }, [nodes, filterMode, activeWard]);

  const activeSelectedNode = useMemo(() => {
    if (selectedNodeId) {
      return nodes.find((n) => n.id === selectedNodeId) ?? internalSelected;
    }
    return internalSelected;
  }, [nodes, selectedNodeId, internalSelected]);

  const desiredCamPosRef = useRef(DEFAULT_CAMERA_POS.clone());
  const desiredTargetRef = useRef(DEFAULT_TARGET_POS.clone());
  const cameraAnimatingRef = useRef(false);
  const autoOrbitRef = useRef(autoOrbit);
  const cameraObjRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsObjRef = useRef<OrbitControls | null>(null);
  const beaconTargetsRef = useRef<Array<{ mesh: THREE.Object3D; node: Complaint }>>([]);
  const onSelectRef = useRef(onSelectNode);

  useEffect(() => {
    autoOrbitRef.current = autoOrbit;
  }, [autoOrbit]);

  useEffect(() => {
    onSelectRef.current = onSelectNode;
  }, [onSelectNode]);

  const zoomBy = useCallback((deltaDistance: number) => {
    const cam = cameraObjRef.current;
    const ctrl = controlsObjRef.current;
    if (!cam || !ctrl) return;

    const target = ctrl.target.clone();
    const offset = cam.position.clone().sub(target);
    const currentDist = offset.length();
    const nextDist = THREE.MathUtils.clamp(currentDist + deltaDistance, 10, 62);
    offset.normalize().multiplyScalar(nextDist);

    desiredTargetRef.current.copy(target);
    desiredCamPosRef.current.copy(target).add(offset);
    cameraAnimatingRef.current = true;
  }, []);

  const resetCameraView = useCallback(() => {
    setActiveWard('ALL');
    desiredTargetRef.current.copy(DEFAULT_TARGET_POS);
    desiredCamPosRef.current.copy(DEFAULT_CAMERA_POS);
    cameraAnimatingRef.current = true;
  }, []);

  const flyToSectorOrNode = useCallback((x: number, z: number, dist = 16) => {
    desiredTargetRef.current.set(x, 1.8, z);
    desiredCamPosRef.current.set(x + dist * 0.72, dist * 0.72, z + dist * 0.78);
    cameraAnimatingRef.current = true;
  }, []);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let disposed = false;
    let rafId = 0;

    const width = container.clientWidth || 960;
    const height = container.clientHeight || 540;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: 'high-performance',
      });
    } catch {
      setContextLost(true);
      return;
    }

    const isSoftwareGl = detectSoftwareWebGL(renderer);
    if (isSoftwareGl) {
      renderer.dispose();
      renderer = new THREE.WebGLRenderer({
        antialias: false,
        powerPreference: 'default',
      });
    }

    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = !isSoftwareGl;
    if (renderer.shadowMap.enabled) {
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }

    const canvas = renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    container.innerHTML = '';
    container.appendChild(canvas);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setContextLost(true);
    };
    canvas.addEventListener('webglcontextlost', onContextLost);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#070B19');
    scene.fog = new THREE.FogExp2('#070B19', 0.0115);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmrem.fromScene(roomEnv, 0.04);
    scene.environment = envTarget.texture;
    roomEnv.dispose();
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.5, 220);
    camera.position.copy(desiredCamPosRef.current);
    cameraObjRef.current = camera;

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 10;
    controls.maxDistance = 64;
    controls.maxPolarAngle = Math.PI / 2.12;
    controls.target.copy(desiredTargetRef.current);
    controlsObjRef.current = controls;

    controls.addEventListener('start', () => {
      cameraAnimatingRef.current = false;
      setAutoOrbit(false);
    });

    const hemi = new THREE.HemisphereLight('#93C5FD', '#0F172A', 0.9);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight('#FFF7ED', 1.8);
    keyLight.position.set(22, 34, 18);
    if (renderer.shadowMap.enabled) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.near = 5;
      keyLight.shadow.camera.far = 90;
      const s = 30;
      keyLight.shadow.camera.left = -s;
      keyLight.shadow.camera.right = s;
      keyLight.shadow.camera.top = s;
      keyLight.shadow.camera.bottom = -s;
      keyLight.shadow.bias = -0.0005;
    }
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight('#22D3EE', 1.0);
    rimLight.position.set(-24, 16, -20);
    scene.add(rimLight);

    const gridTex = createSmartGridTexture();
    gridTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const groundGeo = new THREE.PlaneGeometry(58, 58);
    const groundMat = new THREE.MeshStandardMaterial({
      map: gridTex,
      roughness: 0.72,
      metalness: 0.25,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    ground.receiveShadow = true;
    scene.add(ground);

    const gridHelper = new THREE.GridHelper(58, 29, '#22D3EE', '#1E293B');
    gridHelper.position.y = 0.02;
    (gridHelper.material as THREE.Material).transparent = true;
    (gridHelper.material as THREE.Material).opacity = 0.32;
    scene.add(gridHelper);

    const scanRingGeo = new THREE.RingGeometry(0.92, 1.05, 64);
    const scanRingMat = new THREE.MeshBasicMaterial({
      color: '#22D3EE',
      transparent: true,
      opacity: 0.38,
      side: THREE.DoubleSide,
    });
    const scanRing = new THREE.Mesh(scanRingGeo, scanRingMat);
    scanRing.rotation.x = -Math.PI / 2;
    scanRing.position.y = 0.05;
    scene.add(scanRing);

    const roadMat = new THREE.MeshStandardMaterial({
      color: '#1E293B',
      emissive: '#0EA5E9',
      emissiveIntensity: 0.28,
      roughness: 0.4,
      metalness: 0.6,
    });
    sectors.forEach((sector) => {
      const dist = Math.hypot(sector.gridX, sector.gridZ);
      if (dist > 0.1) {
        const roadGeo = new THREE.BoxGeometry(0.18, 0.04, dist);
        const road = new THREE.Mesh(roadGeo, roadMat);
        road.position.set(sector.gridX / 2, 0.03, sector.gridZ / 2);
        road.lookAt(sector.gridX, 0.03, sector.gridZ);
        scene.add(road);
      }
    });

    const plinthGeo = new THREE.BoxGeometry(5.6, 0.28, 5.6);
    const plinthMat = new THREE.MeshStandardMaterial({
      color: '#0F172A',
      roughness: 0.55,
      metalness: 0.5,
    });
    const buildingMat = new THREE.MeshStandardMaterial({
      color: '#1E293B',
      roughness: 0.35,
      metalness: 0.72,
    });
    const glassBandMat = new THREE.MeshStandardMaterial({
      color: '#38BDF8',
      emissive: '#0284C7',
      emissiveIntensity: 0.35,
      roughness: 0.2,
      metalness: 0.85,
    });

    sectors.forEach((sector) => {
      const sectorGroup = new THREE.Group();
      sectorGroup.position.set(sector.gridX, 0, sector.gridZ);

      const plinth = new THREE.Mesh(plinthGeo, plinthMat);
      plinth.position.y = 0.14;
      plinth.receiveShadow = true;
      sectorGroup.add(plinth);

      const offsets = [
        { x: -1.8, z: -1.8, w: 1.0, d: 1.0, h: 1.2 + sector.districtDensity * 0.35 },
        { x: 1.7, z: -1.7, w: 0.85, d: 1.1, h: 0.95 + sector.districtDensity * 0.25 },
        { x: -1.6, z: 1.8, w: 1.1, d: 0.8, h: 0.8 + sector.districtDensity * 0.2 },
      ];
      offsets.forEach((b) => {
        const tower = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), buildingMat);
        tower.position.set(b.x, 0.28 + b.h / 2, b.z);
        tower.castShadow = renderer.shadowMap.enabled;
        tower.receiveShadow = true;
        sectorGroup.add(tower);

        const cap = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.04, 0.1, b.d + 0.04), glassBandMat);
        cap.position.set(b.x, 0.28 + b.h + 0.05, b.z);
        sectorGroup.add(cap);
      });

      const hasCritical = filteredNodes.some((n) => n.ward === sector.ward && n.severity === 'CRITICAL');
      const sprite = createWardLabelSprite(sector.ward, sector.zoneLabel, hasCritical);
      sprite.position.set(0, 3.3, 0);
      sectorGroup.add(sprite);

      scene.add(sectorGroup);
    });

    const animBeacons: Array<{
      group: THREE.Group;
      core: THREE.Mesh;
      halo: THREE.Mesh | null;
      pulseRing: THREE.Mesh;
      baseY: number;
      phase: number;
    }> = [];
    beaconTargetsRef.current = [];

    filteredNodes.forEach((node, idx) => {
      const hex = SEVERITY_HEX[node.severity] || '#38BDF8';
      const isSelected = activeSelectedNode?.id === node.id;
      const isDupCluster = node.is_suspected_duplicate === 1 || node.community_impact_count > 1;
      const towerHeight = 1.6 + (Math.max(15, node.priority_score) / 100) * 4.4;

      const beaconGroup = new THREE.Group();
      beaconGroup.position.set(node.grid_x, 0, node.grid_z);

      const baseMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.42, 0.54, 0.26, 6),
        new THREE.MeshStandardMaterial({
          color: '#0F172A',
          emissive: hex,
          emissiveIntensity: isSelected ? 0.85 : 0.45,
          roughness: 0.35,
          metalness: 0.75,
        })
      );
      baseMesh.position.y = 0.13;
      beaconGroup.add(baseMesh);

      const spireMat = new THREE.MeshStandardMaterial({
        color: hex,
        emissive: hex,
        emissiveIntensity: isSelected ? 1.25 : 0.65,
        roughness: 0.22,
        metalness: 0.45,
        transparent: true,
        opacity: node.status === 'Resolved' ? 0.42 : 0.92,
      });
      const spireMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, towerHeight, 12), spireMat);
      spireMesh.position.y = 0.26 + towerHeight / 2;
      spireMesh.castShadow = renderer.shadowMap.enabled;
      beaconGroup.add(spireMesh);

      const coreMesh = new THREE.Mesh(
        new THREE.OctahedronGeometry(isSelected ? 0.52 : 0.38, 0),
        new THREE.MeshStandardMaterial({
          color: '#FFFFFF',
          emissive: hex,
          emissiveIntensity: 1.4,
          roughness: 0.15,
          metalness: 0.8,
        })
      );
      const baseCoreY = 0.26 + towerHeight + 0.65;
      coreMesh.position.y = baseCoreY;
      beaconGroup.add(coreMesh);

      const pulseRing = new THREE.Mesh(
        new THREE.RingGeometry(0.58, 0.74, 24),
        new THREE.MeshBasicMaterial({
          color: hex,
          transparent: true,
          opacity: 0.65,
          side: THREE.DoubleSide,
        })
      );
      pulseRing.rotation.x = -Math.PI / 2;
      pulseRing.position.y = 0.06;
      beaconGroup.add(pulseRing);

      let haloMesh: THREE.Mesh | null = null;
      if (isDupCluster) {
        haloMesh = new THREE.Mesh(
          new THREE.TorusGeometry(0.68, 0.065, 10, 28),
          new THREE.MeshStandardMaterial({
            color: DUPLICATE_HALO_HEX,
            emissive: DUPLICATE_HALO_HEX,
            emissiveIntensity: 1.1,
            roughness: 0.2,
          })
        );
        haloMesh.rotation.x = Math.PI / 2.4;
        haloMesh.position.y = baseCoreY;
        beaconGroup.add(haloMesh);
      }

      if (isSelected) {
        const selRing = new THREE.Mesh(
          new THREE.RingGeometry(0.9, 1.08, 32),
          new THREE.MeshBasicMaterial({ color: '#FFFFFF', side: THREE.DoubleSide })
        );
        selRing.rotation.x = -Math.PI / 2;
        selRing.position.y = 0.08;
        beaconGroup.add(selRing);
      }

      const hitMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.75, 0.75, towerHeight + 1.8, 8),
        new THREE.MeshBasicMaterial({ visible: false })
      );
      hitMesh.position.y = (towerHeight + 1.8) / 2;
      beaconGroup.add(hitMesh);

      beaconTargetsRef.current.push({ mesh: hitMesh, node });
      animBeacons.push({
        group: beaconGroup,
        core: coreMesh,
        halo: haloMesh,
        pulseRing,
        baseY: baseCoreY,
        phase: idx * 0.7,
      });

      scene.add(beaconGroup);
    });

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerDownPos = { x: 0, y: 0 };

    const onPointerDown = (e: PointerEvent) => {
      pointerDownPos = { x: e.clientX, y: e.clientY };
    };

    const onPointerUp = (e: PointerEvent) => {
      const moved = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
      if (moved > 6) return;

      const rect = canvas.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(pointer, camera);
      const hitMeshes = beaconTargetsRef.current.map((b) => b.mesh);
      const intersects = raycaster.intersectObjects(hitMeshes, false);

      if (intersects.length > 0) {
        const matched = beaconTargetsRef.current.find((b) => b.mesh === intersects[0].object);
        if (matched) {
          setInternalSelected(matched.node);
          onSelectRef.current?.(matched.node);
          flyToSectorOrNode(matched.node.grid_x, matched.node.grid_z, 13);
        }
      }
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointerup', onPointerUp);

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(200, Math.floor(entry.contentRect.width));
        const h = Math.max(200, Math.floor(entry.contentRect.height));
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      }
    });
    ro.observe(container);

    let prevTime = performance.now();
    const gl = isSoftwareGl ? renderer.getContext() : null;

    const afterDraw = () => {
      if (disposed) return;
      rafId = requestAnimationFrame(tick);
    };

    const tick = (now: number) => {
      if (disposed) return;
      const dt = Math.min((now - prevTime) / 1000, 0.05);
      prevTime = now;
      const elapsed = now * 0.001;

      const radarCycle = (elapsed * 0.35) % 1;
      const radarScale = 2 + radarCycle * 25;
      scanRing.scale.set(radarScale, radarScale, 1);
      scanRingMat.opacity = (1 - radarCycle) * 0.32;

      for (let i = 0; i < animBeacons.length; i++) {
        const b = animBeacons[i];
        b.core.rotation.y += dt * 1.4;
        b.core.position.y = b.baseY + Math.sin(elapsed * 2.3 + b.phase) * 0.16;

        const pCycle = (elapsed * 0.8 + b.phase) % 1;
        const pScale = 1 + pCycle * 1.1;
        b.pulseRing.scale.set(pScale, pScale, 1);
        (b.pulseRing.material as THREE.MeshBasicMaterial).opacity = (1 - pCycle) * 0.55;

        if (b.halo) {
          b.halo.rotation.z += dt * 1.8;
          b.halo.position.y = b.core.position.y;
        }
      }

      if (cameraAnimatingRef.current) {
        camera.position.x = THREE.MathUtils.damp(camera.position.x, desiredCamPosRef.current.x, 6.5, dt);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, desiredCamPosRef.current.y, 6.5, dt);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, desiredCamPosRef.current.z, 6.5, dt);
        controls.target.x = THREE.MathUtils.damp(controls.target.x, desiredTargetRef.current.x, 6.5, dt);
        controls.target.y = THREE.MathUtils.damp(controls.target.y, desiredTargetRef.current.y, 6.5, dt);
        controls.target.z = THREE.MathUtils.damp(controls.target.z, desiredTargetRef.current.z, 6.5, dt);

        if (
          camera.position.distanceTo(desiredCamPosRef.current) < 0.08 &&
          controls.target.distanceTo(desiredTargetRef.current) < 0.05
        ) {
          cameraAnimatingRef.current = false;
        }
      } else if (autoOrbitRef.current) {
        controls.autoRotate = true;
        controls.autoRotateSpeed = 0.55;
      } else {
        controls.autoRotate = false;
      }

      controls.update();
      renderer.render(scene, camera);

      if (gl && 'fenceSync' in gl && typeof (gl as WebGL2RenderingContext).fenceSync === 'function') {
        const gl2 = gl as WebGL2RenderingContext;
        const sync = gl2.fenceSync(gl2.SYNC_GPU_COMMANDS_COMPLETE, 0);
        if (sync) {
          gl2.flush();
          const poll = () => {
            if (disposed) {
              gl2.deleteSync(sync);
              return;
            }
            const status = gl2.clientWaitSync(sync, 0, 0);
            if (status === gl2.TIMEOUT_EXPIRED) {
              setTimeout(poll, 4);
            } else {
              gl2.deleteSync(sync);
              afterDraw();
            }
          };
          poll();
          return;
        }
      }
      afterDraw();
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      controls.dispose();
      envTarget.dispose();
      gridTex.dispose();
      scene.traverse((obj) => {
        if ((obj as THREE.Mesh).geometry) (obj as THREE.Mesh).geometry.dispose();
        const mat = (obj as THREE.Mesh).material;
        if (Array.isArray(mat)) {
          mat.forEach((m) => m.dispose());
        } else if (mat) {
          mat.dispose();
        }
      });
      renderer.dispose();
    };
  }, [filteredNodes, sectors, activeSelectedNode?.id, flyToSectorOrNode]);

  if (contextLost) {
    return (
      <div className={`${heightClass} rounded-2xl border border-slate-800 bg-[#070B19] text-slate-200 flex flex-col items-center justify-center p-8 text-center`}>
        <Compass className="w-8 h-8 text-cyan-400 mb-3" />
        <p className="text-sm font-bold text-white">{t.webglFallbackTitle}</p>
        <p className="text-xs text-slate-400 mt-1 max-w-md">{t.webglFallbackDesc}</p>
      </div>
    );
  }

  return (
    <div className={`relative w-full ${heightClass} rounded-2xl overflow-hidden border border-slate-800 bg-[#070B19]`}>
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      <div className="absolute top-3.5 left-3.5 z-10 pointer-events-auto bg-[#0B1124]/92 border border-white/15 rounded-xl px-3.5 py-2.5 text-[11px] text-slate-200 max-w-xs">
        <div className="flex items-center justify-between gap-3">
          <span className="font-bold text-white font-display">{t.smartGridMapTitle}</span>
          <span className="font-mono text-cyan-300 tabular-nums">
            {filteredNodes.length} {t.nodesCount}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#F43F5E]" />
            {t.severityCritical}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#F97316]" />
            {t.severityHigh}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#FBBF24]" />
            {t.severityMedium}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#34D399]" />
            {t.severityLow}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full border-2 border-[#818CF8]" />
            {t.duplicateHalo}
          </span>
        </div>
      </div>

      {activeSelectedNode && (
        <div className="absolute top-3.5 right-3.5 z-10 w-72 bg-[#0B1124]/95 border border-cyan-400/35 rounded-xl p-3.5 text-slate-100 shadow-2xl">
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="font-mono text-xs font-bold text-cyan-300 tabular-nums">
                {activeSelectedNode.ticket_id}
              </span>
              <p className="text-xs font-bold text-white mt-0.5 line-clamp-2">
                {activeSelectedNode.ai_summary}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setInternalSelected(null)}
              aria-label="Close selected node details"
              className="p-1 text-slate-400 hover:text-white rounded"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-2.5 grid grid-cols-2 gap-2 text-[11px] pt-2 border-t border-white/10">
            <div>
              <span className="text-slate-400">{t.priorityLabel}</span>
              <p className="font-mono font-bold text-white tabular-nums">
                {activeSelectedNode.priority_score}/100 ({activeSelectedNode.severity})
              </p>
            </div>
            <div>
              <span className="text-slate-400">{t.impactLabel}</span>
              <p className="font-semibold text-slate-100 flex items-center gap-1 tabular-nums">
                <Users className="w-3 h-3 text-cyan-400" />
                {activeSelectedNode.affected_people_count} {t.pplShort}
              </p>
            </div>
            <div className="col-span-2">
              <span className="text-slate-400">{t.assignedCrewLabel}</span>
              <p className="font-semibold text-cyan-300 truncate">
                {activeSelectedNode.assigned_crew || t.unassignedCrew} · {activeSelectedNode.status}
              </p>
            </div>
            <div className="col-span-2">
              <span className="text-slate-400 flex items-center gap-1">
                <MapPin className="w-3 h-3 text-cyan-400" />
                {activeSelectedNode.ward}
              </span>
              <p className="text-slate-200 truncate">{activeSelectedNode.street_landmark}</p>
            </div>
          </div>

          {(activeSelectedNode.is_suspected_duplicate === 1 ||
            activeSelectedNode.community_impact_count > 1) && (
            <div className="mt-2 px-2 py-1 rounded bg-violet-500/20 border border-violet-400/30 text-[11px] text-violet-200 flex items-center gap-1.5">
              <GitMerge className="w-3 h-3 shrink-0" />
              <span>
                {activeSelectedNode.community_impact_count} {t.clusterReportsLocation}
              </span>
            </div>
          )}
        </div>
      )}

      <div className="absolute bottom-3.5 left-1/2 -translate-x-1/2 z-10 w-[calc(100%-1.5rem)] max-w-3xl">
        <div className="bg-[#0B1124]/92 border border-white/15 rounded-xl px-3 py-2 text-slate-100 shadow-2xl">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => zoomBy(-8)}
                className="px-2.5 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/30 text-xs font-semibold text-cyan-200 inline-flex items-center gap-1 whitespace-nowrap"
              >
                <ZoomIn className="w-3.5 h-3.5" />
                <span>{t.zoomIn}</span>
              </button>
              <button
                type="button"
                onClick={() => zoomBy(8)}
                className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10 text-xs font-semibold text-slate-200 inline-flex items-center gap-1 whitespace-nowrap"
              >
                <ZoomOut className="w-3.5 h-3.5" />
                <span>{t.zoomOut}</span>
              </button>
              <button
                type="button"
                onClick={resetCameraView}
                className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10 text-xs font-semibold text-slate-200 inline-flex items-center gap-1 whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t.resetView}</span>
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setAutoOrbit((prev) => !prev)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap ${
                  autoOrbit
                    ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-200'
                    : 'bg-white/5 border-white/10 text-slate-300'
                }`}
              >
                {autoOrbit ? t.orbitOn : t.orbitOff}
              </button>
              <button
                type="button"
                onClick={() => setHudCollapsed((c) => !c)}
                aria-label="Toggle filter controls"
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300"
              >
                {hudCollapsed ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {!hudCollapsed && (
            <div className="mt-2 pt-2 border-t border-white/10 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1">
                {(['ALL', 'CRITICAL', 'HIGH', 'DUPLICATES'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setFilterMode(mode)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors whitespace-nowrap ${
                      filterMode === mode
                        ? 'bg-cyan-500 text-slate-950'
                        : 'bg-white/5 text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    {mode === 'ALL'
                      ? t.filterAllZones
                      : mode === 'CRITICAL'
                      ? t.filterCriticalRed
                      : mode === 'HIGH'
                      ? t.filterHighCritical
                      : t.filterDuplicateClusters}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-cyan-400" />
                <select
                  aria-label="Fly to municipal ward"
                  value={activeWard}
                  onChange={(e) => {
                    const nextWard = e.target.value;
                    setActiveWard(nextWard);
                    if (nextWard === 'ALL') {
                      resetCameraView();
                    } else {
                      const sec = sectors.find((s) => s.ward === nextWard);
                      if (sec) flyToSectorOrNode(sec.gridX, sec.gridZ, 15);
                    }
                  }}
                  className="bg-slate-900 border border-white/15 rounded-md px-2 py-1 text-[11px] font-semibold text-slate-100 focus:outline-none"
                >
                  <option value="ALL">{t.allWardsOverview}</option>
                  {sectors.map((s) => (
                    <option key={s.ward} value={s.ward}>
                      {s.ward}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
