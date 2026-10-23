import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  CameraModeId,
  DecorStyleId,
  FloorPlanDocument,
  FurnitureInstance,
  LightingPresetId,
  QualityProfileId,
  RoomZone,
} from '../types/floorplan';
import { DECOR_STYLES } from '../data/presets';
import {
  FURNITURE_CATALOG,
  getPolygonBounds,
} from '../utils/geometryAndAutoDecor';
import { getProceduralFloorTexture } from '../three/proceduralTextures';
import {
  buildOpeningMeshGroup,
  buildProceduralFurnitureGroup,
} from '../three/proceduralFurniture';
import {
  Camera,
  ChevronDown,
  ChevronUp,
  Compass,
  Eye,
  Home,
  Layers,
  Maximize2,
  Move,
  Palette,
  Play,
  Plus,
  RotateCw,
  Sliders,
  Sparkles,
  Sun,
  Trash2,
  Video,
  Square,
} from 'lucide-react';

interface Viewer3DCanvasProps {
  document: FloorPlanDocument;
  onUpdateDocument: (updater: (prev: FloorPlanDocument) => FloorPlanDocument) => void;
  onAutoDecorate: () => void;
  readOnly?: boolean;
}

// Vetores pré-alocados no escopo de módulo para evitar Garbage Collection no loop de renderização 60fps
const _vec3A = new THREE.Vector3();
const _vec3B = new THREE.Vector3();
const _wallNormal = new THREE.Vector3();
const _camToWall = new THREE.Vector3();
const _groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _intersectPt = new THREE.Vector3();

/**
 * Detecta se o navegador está rodando em Software WebGL (SwiftShader/llvmpipe)
 * para calibrar custo de sombras e pixelRatio sem alterar o conteúdo da cena.
 */
const isSoftwareGl = (() => {
  if (typeof document === 'undefined') return false;
  const gl = document.createElement('canvas').getContext('webgl2');
  if (!gl) return true;
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
  const gpu = String(gl.getParameter(param));
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
})();

export const Viewer3DCanvas: React.FC<Viewer3DCanvasProps> = ({
  document: floorDoc,
  onUpdateDocument,
  onAutoDecorate,
  readOnly = false,
}) => {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);

  // Estados da UI do HUD 3D
  const [cameraMode, setCameraMode] = useState<CameraModeId>('orbit');
  const [selectedFurnitureId, setSelectedFurnitureId] = useState<string | null>(
    null
  );
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [activeDockTab, setActiveDockTab] = useState<
    'camera' | 'style' | 'furniture' | 'lighting'
  >('style');
  const [guidedRoomIndex, setGuidedRoomIndex] = useState(0);
  const [isRecordingVideo, setIsRecordingVideo] = useState(false);
  const [gyroEnabled, setGyroEnabled] = useState(false);

  // Refs mutáveis sincronizadas com o loop WebGL para evitar recriar o canvas React
  const docRef = useRef<FloorPlanDocument>(floorDoc);
  docRef.current = floorDoc;

  const cameraModeRef = useRef<CameraModeId>(cameraMode);
  cameraModeRef.current = cameraMode;

  const selectedFurnRef = useRef<string | null>(selectedFurnitureId);
  selectedFurnRef.current = selectedFurnitureId;

  const guidedIndexRef = useRef<number>(guidedRoomIndex);
  guidedIndexRef.current = guidedRoomIndex;

  // Refs de objetos Three.js para captura de foto/vídeo e reconstrução sob demanda
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const rebuildSceneFnRef = useRef<(() => void) | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  // Controles de caminhada em 1ª pessoa (WASD + Setas + Botões Touch)
  const keysHeldRef = useRef<Record<string, boolean>>({});
  const fpYawRef = useRef<number>(0);
  const fpPitchRef = useRef<number>(0);
  const fpPosRef = useRef<THREE.Vector3>(new THREE.Vector3(2.2, 1.6, 2.2));

  // Calcula centro global da planta para posicionar a câmera e as luzes
  const getPlanCenter = (doc: FloorPlanDocument) => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const w of doc.walls) {
      minX = Math.min(minX, w.start.x, w.end.x);
      maxX = Math.max(maxX, w.start.x, w.end.x);
      minZ = Math.min(minZ, w.start.z, w.end.z);
      maxZ = Math.max(maxZ, w.start.z, w.end.z);
    }
    if (!isFinite(minX)) {
      return { cx: 4, cz: 3, span: 10 };
    }
    return {
      cx: (minX + maxX) / 2,
      cz: (minZ + maxZ) / 2,
      span: Math.max(6, maxX - minX, maxZ - minZ),
    };
  };

  // Inicialização única do WebGLRenderer, Cena, Luzes e Controles
  useEffect(() => {
    const mountEl = canvasMountRef.current;
    if (!mountEl) return;

    const width = mountEl.clientWidth || window.innerWidth;
    const height = mountEl.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0F1419');
    scene.fog = new THREE.FogExp2('#0F1419', 0.018);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 150);
    const { cx, cz, span } = getPlanCenter(docRef.current);
    camera.position.set(cx + span * 0.75, span * 0.85, cz + span * 0.95);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.setPixelRatio(
      isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2)
    );
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;

    mountEl.innerHTML = '';
    mountEl.appendChild(renderer.domElement);

    // Environment Map procedural (RoomEnvironment via PMREMGenerator) para reflexos realistas
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(
      new RoomEnvironment(),
      0.04
    ).texture;
    pmremGenerator.dispose();

    // Controles de Órbita com amortecimento suave
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.07;
    controls.maxPolarAngle = Math.PI / 2 - 0.03;
    controls.minDistance = 1.5;
    controls.maxDistance = 42;
    controls.target.set(cx, 0.8, cz);
    controls.update();
    controlsRef.current = controls;

    // Grupos dedicados da arquitetura e iluminação
    const environmentGroup = new THREE.Group();
    environmentGroup.name = 'environmentGroup';
    const architectureGroup = new THREE.Group();
    architectureGroup.name = 'architectureGroup';
    const furnitureGroup = new THREE.Group();
    furnitureGroup.name = 'furnitureGroup';
    const lightsGroup = new THREE.Group();
    lightsGroup.name = 'lightsGroup';

    scene.add(environmentGroup, architectureGroup, furnitureGroup, lightsGroup);

    // Lista de malhas de parede para corte dinâmico no modo Dollhouse
    const wallMeshesForCutaway: Array<{
      mesh: THREE.Mesh;
      normalX: number;
      normalZ: number;
      midX: number;
      midZ: number;
      fullHeight: number;
    }> = [];

    /**
     * Reconstrói a geometria 3D a partir do FloorPlanDocument (fonte única de verdade).
     */
    const rebuildSceneGeometry = () => {
      const doc = docRef.current;
      const style =
        DECOR_STYLES[doc.settings.decorStyle] || DECOR_STYLES.scandinavian;
      const planInfo = getPlanCenter(doc);
      const maxAniso = renderer.capabilities.getMaxAnisotropy();

      // Limpa grupos anteriores
      const clearGroup = (grp: THREE.Group) => {
        while (grp.children.length > 0) {
          const child = grp.children[0];
          grp.remove(child);
        }
      };
      clearGroup(environmentGroup);
      clearGroup(architectureGroup);
      clearGroup(furnitureGroup);
      clearGroup(lightsGroup);
      wallMeshesForCutaway.length = 0;

      // Ajusta qualidade gráfica conforme perfil selecionado (baixo, médio, alto)
      const qProfile = doc.settings.qualityProfile;
      if (!isSoftwareGl) {
        renderer.setPixelRatio(
          qProfile === 'low'
            ? 1
            : qProfile === 'medium'
              ? Math.min(window.devicePixelRatio, 1.5)
              : Math.min(window.devicePixelRatio, 2)
        );
        renderer.shadowMap.enabled = qProfile !== 'low';
      }

      // Configuração de Iluminação PBR e Ciclo Dia/Noite
      const preset = doc.settings.lightingPreset;
      let skyColor = '#1E293B';
      let groundColor = '#0F1419';
      let sunColor = '#FFF7ED';
      let sunIntensity = 2.2;
      let hemiIntensity = 0.85;
      let sunPos = new THREE.Vector3(
        planInfo.cx + 12,
        18,
        planInfo.cz + 10
      );

      if (preset === 'morning') {
        skyColor = '#1E293B';
        sunColor = '#FEF3C7';
        sunIntensity = 2.0;
        hemiIntensity = 0.9;
        sunPos.set(planInfo.cx + 16, 12, planInfo.cz - 8);
      } else if (preset === 'noon') {
        skyColor = '#1E293B';
        sunColor = '#FFFFFF';
        sunIntensity = 2.6;
        hemiIntensity = 1.05;
        sunPos.set(planInfo.cx + 4, 24, planInfo.cz + 4);
      } else if (preset === 'golden_hour') {
        skyColor = '#1C1917';
        sunColor = '#FDBA74';
        sunIntensity = 2.4;
        hemiIntensity = 0.75;
        sunPos.set(planInfo.cx - 16, 9.5, planInfo.cz + 12);
      } else if (preset === 'night') {
        skyColor = '#090D16';
        sunColor = '#60A5FA';
        sunIntensity = 0.45;
        hemiIntensity = 0.35;
        sunPos.set(planInfo.cx - 10, 16, planInfo.cz - 10);
      }

      scene.background = new THREE.Color(skyColor);
      scene.fog = new THREE.FogExp2(skyColor, 0.016);

      const hemiLight = new THREE.HemisphereLight(
        preset === 'night' ? '#3B82F6' : '#E0F2FE',
        groundColor,
        hemiIntensity
      );
      lightsGroup.add(hemiLight);

      const sunLight = new THREE.DirectionalLight(sunColor, sunIntensity);
      sunLight.position.copy(sunPos);
      sunLight.target.position.set(planInfo.cx, 0, planInfo.cz);
      sunLight.castShadow = !isSoftwareGl && qProfile !== 'low';
      const d = Math.max(10, planInfo.span * 0.9);
      sunLight.shadow.camera.left = -d;
      sunLight.shadow.camera.right = d;
      sunLight.shadow.camera.top = d;
      sunLight.shadow.camera.bottom = -d;
      sunLight.shadow.camera.near = 1;
      sunLight.shadow.camera.far = 55;
      sunLight.shadow.mapSize.set(
        qProfile === 'high' ? 2048 : 1024,
        qProfile === 'high' ? 2048 : 1024
      );
      sunLight.shadow.bias = -0.0005;
      sunLight.shadow.normalBias = 0.02;
      lightsGroup.add(sunLight, sunLight.target);

      // Base arquitetônica externa (terreno sob a maquete com grade técnica sutil)
      const podiumGeo = new THREE.BoxGeometry(
        planInfo.span * 2.2,
        0.16,
        planInfo.span * 2.2
      );
      const podiumMat = new THREE.MeshStandardMaterial({
        color: '#161F29',
        roughness: 0.88,
        metalness: 0.08,
      });
      const podium = new THREE.Mesh(podiumGeo, podiumMat);
      podium.position.set(planInfo.cx, -0.09, planInfo.cz);
      podium.receiveShadow = true;
      environmentGroup.add(podium);

      const gridHelper = new THREE.GridHelper(
        Math.round(planInfo.span * 2.2),
        Math.round(planInfo.span * 2.2),
        0x334155,
        0x1e293b
      );
      gridHelper.position.set(planInfo.cx, -0.005, planInfo.cz);
      environmentGroup.add(gridHelper);

      // 1. Construção dos Pisos por Cômodo e Iluminação Interna Quente
      for (const room of doc.rooms) {
        if (room.polygon.length < 3) continue;

        let floorMatId = room.floorMaterial;
        if (room.type === 'living_room' || room.type === 'dining_room') {
          floorMatId = style.livingFloor;
        } else if (room.type === 'bedroom' || room.type === 'office') {
          floorMatId = style.bedroomFloor;
        } else if (room.type === 'kitchen' || room.type === 'bathroom') {
          floorMatId = style.wetFloor;
        }

        const floorTex = getProceduralFloorTexture(floorMatId, maxAniso);

        const shape = new THREE.Shape();
        room.polygon.forEach((pt, idx) => {
          if (idx === 0) shape.moveTo(pt.x, pt.z);
          else shape.lineTo(pt.x, pt.z);
        });
        shape.closePath();

        const floorGeo = new THREE.ShapeGeometry(shape);
        floorGeo.rotateX(Math.PI / 2);

        const floorMat = new THREE.MeshStandardMaterial({
          map: floorTex,
          roughness:
            floorMatId === 'carrara_marble' || floorMatId === 'porcelain_Beige'
              ? 0.22
              : 0.48,
          metalness: 0.04,
          side: THREE.DoubleSide,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
        });

        const floorMesh = new THREE.Mesh(floorGeo, floorMat);
        floorMesh.position.y = 0.01;
        floorMesh.receiveShadow = true;
        architectureGroup.add(floorMesh);

        // Ponto de luz interna quente no teto de cada cômodo
        const rb = getPolygonBounds(room.polygon);
        const roomLight = new THREE.PointLight(
          '#FDE68A',
          preset === 'night' ? 1.8 : 0.55,
          Math.max(rb.width, rb.depth) * 1.8,
          1.8
        );
        roomLight.position.set(
          rb.centerX,
          doc.settings.ceilingHeight - 0.18,
          rb.centerZ
        );
        lightsGroup.add(roomLight);
      }

      // 2. Extrusão de Paredes com Recortes Reais para Portas e Janelas + Rodapés
      const wallMat = new THREE.MeshStandardMaterial({
        color: style.wallColor,
        roughness: 0.72,
        metalness: 0.02,
      });

      const baseboardMat = new THREE.MeshStandardMaterial({
        color: style.baseboardColor,
        roughness: 0.45,
        metalness: 0.05,
      });

      const ceilingH = doc.settings.ceilingHeight || 2.7;

      for (const wall of doc.walls) {
        const dx = wall.end.x - wall.start.x;
        const dz = wall.end.z - wall.start.z;
        const length = Math.hypot(dx, dz);
        if (length < 0.05) continue;

        const angle = Math.atan2(dz, dx);
        const thickness = wall.thickness || doc.settings.defaultWallThickness || 0.15;
        const wallH = wall.height || ceilingH;

        const wallContainer = new THREE.Group();
        wallContainer.position.set(wall.start.x, 0, wall.start.z);
        wallContainer.rotation.y = -angle;

        // Filtra e ordena aberturas (portas e janelas) contidas nesta parede
        const wallOpenings = doc.openings
          .filter((op) => op.wallId === wall.id)
          .sort((a, b) => a.offset - b.offset);

        let cursorX = 0;

        const addSolidWallSegment = (segStart: number, segEnd: number) => {
          const segLen = segEnd - segStart;
          if (segLen <= 0.03) return;

          const segGeo = new THREE.BoxGeometry(segLen, wallH, thickness);
          segGeo.translate(0, wallH / 2, 0);
          const segMesh = new THREE.Mesh(segGeo, wallMat);
          segMesh.position.set(segStart + segLen / 2, 0, 0);
          segMesh.castShadow = true;
          segMesh.receiveShadow = true;
          wallContainer.add(segMesh);

          // Rodapé duplo na base do segmento de parede
          const baseGeo = new THREE.BoxGeometry(
            segLen,
            0.09,
            thickness + 0.016
          );
          const baseMesh = new THREE.Mesh(baseGeo, baseboardMat);
          baseMesh.position.set(segStart + segLen / 2, 0.045, 0);
          wallContainer.add(baseMesh);

          // Registra para corte dinâmico no modo Dollhouse
          if (wall.isExterior) {
            const midDist = segStart + segLen / 2;
            const worldMidX = wall.start.x + (dx / length) * midDist;
            const worldMidZ = wall.start.z + (dz / length) * midDist;
            // Normal apontando para fora do centro da planta
            let nx = -dz / length;
            let nz = dx / length;
            const toOutX = worldMidX - planInfo.cx;
            const toOutZ = worldMidZ - planInfo.cz;
            if (nx * toOutX + nz * toOutZ < 0) {
              nx = -nx;
              nz = -nz;
            }
            wallMeshesForCutaway.push({
              mesh: segMesh,
              normalX: nx,
              normalZ: nz,
              midX: worldMidX,
              midZ: worldMidZ,
              fullHeight: wallH,
            });
          }
        };

        for (const op of wallOpenings) {
          const centerDist = Math.max(
            op.width / 2 + 0.08,
            Math.min(length - op.width / 2 - 0.08, op.offset * length)
          );
          const opStart = Math.max(cursorX, centerDist - op.width / 2);
          const opEnd = Math.min(length, centerDist + op.width / 2);

          // Segmento sólido antes da abertura
          addSolidWallSegment(cursorX, opStart);

          const actualOpWidth = opEnd - opStart;
          if (actualOpWidth > 0.2) {
            const opCenter = (opStart + opEnd) / 2;
            const opHeight = op.height || (op.type === 'door' ? 2.1 : 1.25);
            const opElev = op.type === 'door' ? 0 : op.elevation || 0.85;

            // Verga superior acima da porta ou janela
            const lintelH = wallH - (opElev + opHeight);
            if (lintelH > 0.04) {
              const lintelGeo = new THREE.BoxGeometry(
                actualOpWidth,
                lintelH,
                thickness
              );
              const lintelMesh = new THREE.Mesh(lintelGeo, wallMat);
              lintelMesh.position.set(
                opCenter,
                opElev + opHeight + lintelH / 2,
                0
              );
              lintelMesh.castShadow = true;
              wallContainer.add(lintelMesh);
            }

            // Peitoril inferior abaixo da janela
            if (opElev > 0.04) {
              const sillWallGeo = new THREE.BoxGeometry(
                actualOpWidth,
                opElev,
                thickness
              );
              const sillWallMesh = new THREE.Mesh(sillWallGeo, wallMat);
              sillWallMesh.position.set(opCenter, opElev / 2, 0);
              sillWallMesh.castShadow = true;
              sillWallMesh.receiveShadow = true;
              wallContainer.add(sillWallMesh);
            }

            // Modelo 3D composto da Porta ou Janela
            const openingGroup = buildOpeningMeshGroup(
              { ...op, width: actualOpWidth },
              thickness,
              style,
              isSoftwareGl
            );
            openingGroup.position.set(opCenter, 0, 0);
            wallContainer.add(openingGroup);
          }

          cursorX = opEnd;
        }

        // Segmento final da parede após a última abertura
        addSolidWallSegment(cursorX, length);
        architectureGroup.add(wallContainer);
      }

      // 3. Teto opcional (exibido quando showRoof está ativo ou em caminhada 1ª pessoa)
      if (
        doc.settings.showRoof ||
        cameraModeRef.current === 'first_person'
      ) {
        for (const room of doc.rooms) {
          if (room.polygon.length < 3) continue;
          const shape = new THREE.Shape();
          room.polygon.forEach((pt, idx) => {
            if (idx === 0) shape.moveTo(pt.x, pt.z);
            else shape.lineTo(pt.x, pt.z);
          });
          shape.closePath();
          const ceilGeo = new THREE.ShapeGeometry(shape);
          ceilGeo.rotateX(Math.PI / 2);
          const ceilMat = new THREE.MeshStandardMaterial({
            color: '#F8FAFC',
            roughness: 0.85,
            side: THREE.DoubleSide,
          });
          const ceilMesh = new THREE.Mesh(ceilGeo, ceilMat);
          ceilMesh.position.y = ceilingH;
          architectureGroup.add(ceilMesh);
        }
      }

      // 4. Construção do Mobiliário 3D Composto
      for (const furn of doc.furniture) {
        const isSel = furn.id === selectedFurnRef.current;
        const furnMeshGroup = buildProceduralFurnitureGroup(
          furn,
          style,
          isSel,
          isSoftwareGl
        );
        furnitureGroup.add(furnMeshGroup);
      }
    };

    rebuildSceneFnRef.current = rebuildSceneGeometry;
    rebuildSceneGeometry();

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // Interação de Raycasting para selecionar e arrastar móveis no plano XZ
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let isDraggingFurniture = false;
    let draggedFurnId: string | null = null;
    let isLookingFirstPerson = false;
    let lastPointerX = 0;
    let lastPointerY = 0;

    const updateNormalizedPointer = (ev: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const onPointerDown = (ev: PointerEvent) => {
      if (cameraModeRef.current === 'first_person') {
        isLookingFirstPerson = true;
        lastPointerX = ev.clientX;
        lastPointerY = ev.clientY;
        return;
      }

      if (readOnly) return;

      updateNormalizedPointer(ev);
      raycaster.setFromCamera(pointer, camera);

      const intersects = raycaster.intersectObjects(
        furnitureGroup.children,
        true
      );
      if (intersects.length > 0) {
        let obj: THREE.Object3D | null = intersects[0].object;
        while (obj && !obj.userData?.isFurnitureRoot) {
          obj = obj.parent;
        }
        if (obj && obj.userData?.furnitureId) {
          const fId = obj.userData.furnitureId as string;
          setSelectedFurnitureId(fId);
          selectedFurnRef.current = fId;
          isDraggingFurniture = true;
          draggedFurnId = fId;
          controls.enabled = false;
          return;
        }
      } else {
        setSelectedFurnitureId(null);
        selectedFurnRef.current = null;
      }
    };

    const onPointerMove = (ev: PointerEvent) => {
      if (cameraModeRef.current === 'first_person' && isLookingFirstPerson) {
        const dx = ev.clientX - lastPointerX;
        const dy = ev.clientY - lastPointerY;
        lastPointerX = ev.clientX;
        lastPointerY = ev.clientY;
        fpYawRef.current -= dx * 0.0045;
        fpPitchRef.current = Math.max(
          -Math.PI / 3,
          Math.min(Math.PI / 3, fpPitchRef.current - dy * 0.0045)
        );
        return;
      }

      if (!isDraggingFurniture || !draggedFurnId) return;

      updateNormalizedPointer(ev);
      raycaster.setFromCamera(pointer, camera);
      if (raycaster.ray.intersectPlane(_groundPlane, _intersectPt)) {
        const targetGroup = furnitureGroup.children.find(
          (ch) => ch.userData?.furnitureId === draggedFurnId
        );
        if (targetGroup) {
          targetGroup.position.x = Math.round(_intersectPt.x * 20) / 20;
          targetGroup.position.z = Math.round(_intersectPt.z * 20) / 20;
        }
      }
    };

    const onPointerUp = () => {
      isLookingFirstPerson = false;
      if (isDraggingFurniture && draggedFurnId) {
        const targetGroup = furnitureGroup.children.find(
          (ch) => ch.userData?.furnitureId === draggedFurnId
        );
        if (targetGroup) {
          const finalX = Math.round(targetGroup.position.x * 100) / 100;
          const finalZ = Math.round(targetGroup.position.z * 100) / 100;
          const idToUpdate = draggedFurnId;
          onUpdateDocument((prev) => ({
            ...prev,
            furniture: prev.furniture.map((f) =>
              f.id === idToUpdate
                ? { ...f, position: { ...f.position, x: finalX, z: finalZ } }
                : f
            ),
          }));
        }
      }
      isDraggingFurniture = false;
      draggedFurnId = null;
      if (
        cameraModeRef.current === 'orbit' ||
        cameraModeRef.current === 'dollhouse'
      ) {
        controls.enabled = true;
      }
    };

    const domEl = renderer.domElement;
    domEl.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    // Eventos de teclado para caminhada WASD e atalhos (H para ocultar dock, R para girar móvel)
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      ) {
        return;
      }
      keysHeldRef.current[e.code] = true;
      if (e.code === 'KeyH') {
        setDockCollapsed((prev) => !prev);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysHeldRef.current[e.code] = false;
    };

    const onBlur = () => {
      keysHeldRef.current = {};
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    const onResize = () => {
      if (!mountEl) return;
      const w = mountEl.clientWidth || window.innerWidth;
      const h = mountEl.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    // Loop de animação com amortecimento exponencial e afterDraw para Software WebGL
    const clock = new THREE.Clock();
    let frameId = 0;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick() {
      const dt = Math.min(clock.getDelta(), 0.05);
      const mode = cameraModeRef.current;
      const doc = docRef.current;

      // 1. Corte dinâmico de paredes no modo Dollhouse (revela o interior sem obstrução)
      for (const item of wallMeshesForCutaway) {
        let targetScaleY = 1.0;
        if (mode === 'dollhouse') {
          _camToWall
            .set(
              camera.position.x - item.midX,
              0,
              camera.position.z - item.midZ
            )
            .normalize();
          _wallNormal.set(item.normalX, 0, item.normalZ);
          const dot = _wallNormal.dot(_camToWall);
          if (dot > 0.2) {
            targetScaleY = 0.16; // Rebaixa paredes frontais para 45cm
          }
        }
        item.mesh.scale.y = THREE.MathUtils.damp(
          item.mesh.scale.y,
          targetScaleY,
          8,
          dt
        );
      }

      // 2. Atualização da Câmera conforme o modo de Tour ativo
      if (mode === 'orbit' || mode === 'dollhouse') {
        controls.enabled = !isDraggingFurniture;
        controls.update();
      } else if (mode === 'first_person') {
        controls.enabled = false;
        const moveSpeed = 2.8 * dt;
        const forward =
          (keysHeldRef.current['KeyW'] || keysHeldRef.current['ArrowUp']
            ? 1
            : 0) -
          (keysHeldRef.current['KeyS'] || keysHeldRef.current['ArrowDown']
            ? 1
            : 0);
        const strafe =
          (keysHeldRef.current['KeyD'] || keysHeldRef.current['ArrowRight']
            ? 1
            : 0) -
          (keysHeldRef.current['KeyA'] || keysHeldRef.current['ArrowLeft']
            ? 1
            : 0);

        if (keysHeldRef.current['KeyQ']) fpYawRef.current += 1.6 * dt;
        if (keysHeldRef.current['KeyE']) fpYawRef.current -= 1.6 * dt;

        const sinY = Math.sin(fpYawRef.current);
        const cosY = Math.cos(fpYawRef.current);

        const nextX =
          fpPosRef.current.x +
          (-sinY * forward + cosY * strafe) * moveSpeed;
        const nextZ =
          fpPosRef.current.z +
          (-cosY * forward - sinY * strafe) * moveSpeed;

        // Verificação de colisão circular contra paredes (raio de corpo = 0.28m)
        let blocked = false;
        for (const w of doc.walls) {
          const dx = w.end.x - w.start.x;
          const dz = w.end.z - w.start.z;
          const lenSq = dx * dx + dz * dz;
          if (lenSq < 0.01) continue;
          const t = Math.max(
            0,
            Math.min(
              1,
              ((nextX - w.start.x) * dx + (nextZ - w.start.z) * dz) / lenSq
            )
          );
          const closestX = w.start.x + t * dx;
          const closestZ = w.start.z + t * dz;
          const dist = Math.hypot(nextX - closestX, nextZ - closestZ);

          if (dist < 0.28) {
            // Permite atravessar se houver uma porta nessa posição da parede
            const hasDoorHere = doc.openings.some(
              (op) =>
                op.wallId === w.id &&
                op.type === 'door' &&
                Math.abs(op.offset - t) * Math.sqrt(lenSq) < op.width * 0.48
            );
            if (!hasDoorHere) {
              blocked = true;
              break;
            }
          }
        }

        if (!blocked) {
          fpPosRef.current.x = nextX;
          fpPosRef.current.z = nextZ;
        }
        fpPosRef.current.y = 1.6; // Altura exata dos olhos de 1,60 m

        camera.position.lerp(fpPosRef.current, 1 - Math.exp(-14 * dt));
        _vec3A.set(
          camera.position.x - Math.sin(fpYawRef.current) * Math.cos(fpPitchRef.current),
          1.6 + Math.sin(fpPitchRef.current),
          camera.position.z - Math.cos(fpYawRef.current) * Math.cos(fpPitchRef.current)
        );
        camera.lookAt(_vec3A);
      } else if (mode === 'guided_tour') {
        controls.enabled = false;
        const rooms = doc.rooms;
        if (rooms.length > 0) {
          const targetRoom =
            rooms[guidedIndexRef.current % rooms.length] || rooms[0];
          const b = getPolygonBounds(targetRoom.polygon);
          const time = clock.getElapsedTime();
          const orbitAngle = time * 0.32;

          _vec3A.set(
            b.centerX + Math.cos(orbitAngle) * Math.max(2.2, b.width * 0.55),
            2.15,
            b.centerZ + Math.sin(orbitAngle) * Math.max(2.2, b.depth * 0.55)
          );
          camera.position.lerp(_vec3A, 1 - Math.exp(-3.5 * dt));

          _vec3B.set(b.centerX, 0.75, b.centerZ);
          controls.target.lerp(_vec3B, 1 - Math.exp(-4.5 * dt));
          camera.lookAt(controls.target);
        }
      }

      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    frameId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      domEl.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('resize', onResize);
      controls.dispose();
      renderer.dispose();
    };
  }, []);

  // Reconstrói geometria 3D sempre que o FloorPlanDocument, móvel selecionado ou modo de câmera mudar
  useEffect(() => {
    if (rebuildSceneFnRef.current) {
      rebuildSceneFnRef.current();
    }
  }, [floorDoc, selectedFurnitureId, cameraMode]);

  // Avanço automático entre cômodos durante o Tour Guiado Automático
  useEffect(() => {
    if (cameraMode !== 'guided_tour') return;
    const interval = window.setInterval(() => {
      setGuidedRoomIndex((prev) =>
        floorDoc.rooms.length > 0 ? (prev + 1) % floorDoc.rooms.length : 0
      );
    }, 5500);
    return () => clearInterval(interval);
  }, [cameraMode, floorDoc.rooms.length]);

  // Suporte opcional a Giroscópio em dispositivos móveis durante caminhada 1ª pessoa
  useEffect(() => {
    if (!gyroEnabled || cameraMode !== 'first_person') return;
    const handleOrientation = (event: DeviceOrientationEvent) => {
      if (event.alpha !== null) {
        fpYawRef.current = THREE.MathUtils.degToRad(event.alpha);
      }
      if (event.beta !== null) {
        const clampedBeta = Math.max(45, Math.min(135, event.beta));
        fpPitchRef.current = THREE.MathUtils.degToRad(90 - clampedBeta) * 0.5;
      }
    };
    window.addEventListener('deviceorientation', handleOrientation);
    return () =>
      window.removeEventListener('deviceorientation', handleOrientation);
  }, [gyroEnabled, cameraMode]);

  // Alterna o modo de câmera reposicionando suavemente
  const handleSelectCameraMode = (mode: CameraModeId) => {
    setCameraMode(mode);
    const cam = cameraRef.current;
    const ctrl = controlsRef.current;
    const { cx, cz, span } = getPlanCenter(floorDoc);

    if (mode === 'first_person') {
      const firstRoom = floorDoc.rooms[0];
      if (firstRoom) {
        const b = getPolygonBounds(firstRoom.polygon);
        fpPosRef.current.set(b.centerX, 1.6, b.centerZ);
      } else {
        fpPosRef.current.set(cx, 1.6, cz);
      }
      fpYawRef.current = 0;
      fpPitchRef.current = -0.05;
    } else if (mode === 'dollhouse' && cam && ctrl) {
      cam.position.set(cx + span * 0.55, span * 0.72, cz + span * 0.78);
      ctrl.target.set(cx, 0.5, cz);
      ctrl.update();
    } else if (mode === 'orbit' && cam && ctrl) {
      cam.position.set(cx + span * 0.75, span * 0.85, cz + span * 0.95);
      ctrl.target.set(cx, 0.8, cz);
      ctrl.update();
    }
  };

  // Troca de Estilo de Decoração em Tempo Real
  const handleStyleChange = (styleId: DecorStyleId) => {
    onUpdateDocument((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        decorStyle: styleId,
      },
    }));
  };

  // Manipulação do móvel selecionado (Girar 45°, Remover ou Adicionar novo)
  const handleRotateSelectedFurniture = () => {
    if (!selectedFurnitureId) return;
    onUpdateDocument((prev) => ({
      ...prev,
      furniture: prev.furniture.map((f) =>
        f.id === selectedFurnitureId
          ? { ...f, rotationY: f.rotationY + Math.PI / 4 }
          : f
      ),
    }));
  };

  const handleDeleteSelectedFurniture = () => {
    if (!selectedFurnitureId) return;
    const idToDelete = selectedFurnitureId;
    setSelectedFurnitureId(null);
    onUpdateDocument((prev) => ({
      ...prev,
      furniture: prev.furniture.filter((f) => f.id !== idToDelete),
    }));
  };

  const handleAddFurnitureFromCatalog = (catalogId: string) => {
    const spec = FURNITURE_CATALOG.find((c) => c.catalogId === catalogId);
    if (!spec) return;
    const targetRoom =
      floorDoc.rooms.find((r) => r.type === spec.category) ||
      floorDoc.rooms[0];
    const b = targetRoom
      ? getPolygonBounds(targetRoom.polygon)
      : { centerX: 3, centerZ: 3 };

    const newInst: FurnitureInstance = {
      id: `furn_manual_${Date.now()}`,
      roomId: targetRoom?.id || 'default',
      catalogId: spec.catalogId,
      name: spec.name,
      position: {
        x: Math.round(b.centerX * 100) / 100,
        y: 0,
        z: Math.round(b.centerZ * 100) / 100,
      },
      rotationY: 0,
      dimensions: { ...spec.dimensions },
    };

    onUpdateDocument((prev) => ({
      ...prev,
      furniture: [...prev.furniture, newInst],
    }));
    setSelectedFurnitureId(newInst.id);
  };

  // Exportação de Foto PNG em Alta Resolução
  const handleCapturePhoto = () => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    if (!renderer || !scene || !camera) return;

    renderer.render(scene, camera);
    const dataUrl = renderer.domElement.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${floorDoc.name.toLowerCase().replace(/\s+/g, '-')}-3d.png`;
    a.click();
  };

  // Gravação de Vídeo WebM do Tour Virtual
  const handleToggleVideoRecording = () => {
    const renderer = rendererRef.current;
    if (!renderer) return;

    if (isRecordingVideo && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecordingVideo(false);
      return;
    }

    try {
      const stream = renderer.domElement.captureStream(30);
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      recordedChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `tour-3d-${floorDoc.id}.webm`;
        a.click();
        URL.revokeObjectURL(url);
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecordingVideo(true);
    } catch {
      // Fallback caso o navegador restrinja MediaRecorder
      handleCapturePhoto();
    }
  };

  const currentGuidedRoom: RoomZone | undefined =
    floorDoc.rooms[guidedRoomIndex % Math.max(1, floorDoc.rooms.length)];
  const selectedFurnitureObj = floorDoc.furniture.find(
    (f) => f.id === selectedFurnitureId
  );
  const totalAreaSqm = floorDoc.rooms.reduce((acc, r) => acc + r.areaSqm, 0);

  return (
    <div className="relative w-full h-[calc(100vh-64px)] bg-[#0F1419] overflow-hidden select-none">
      {/* Container Isolado do Canvas WebGL (100% desobstruído no centro) */}
      <div ref={canvasMountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Selo Superior Esquerdo — Especificação Arquitetônica e Marca da Construtora */}
      <div className="absolute top-4 left-4 z-10 pointer-events-none flex flex-col gap-2 max-w-sm">
        <div className="pointer-events-auto bg-[#121820]/95 border border-white/10 rounded-xl px-4 py-3 shadow-xl">
          <div className="flex items-center gap-2.5">
            <span
              className="px-2 py-0.5 text-[11px] font-bold tracking-wider rounded text-slate-950 whitespace-nowrap shrink-0"
              style={{
                backgroundColor:
                  floorDoc.settings.branding.primaryColor || '#F59E0B',
              }}
            >
              {floorDoc.settings.branding.logoText || 'CONSTRUTORA'}
            </span>
            <h2 className="text-sm font-semibold text-white truncate">
              {floorDoc.name}
            </h2>
          </div>
          <div className="mt-1.5 flex items-center gap-2 text-xs text-slate-400 font-mono tabular-nums">
            <span>{totalAreaSqm.toFixed(1)} m² área útil</span>
            <span aria-hidden="true">·</span>
            <span>{floorDoc.rooms.length} ambientes</span>
            <span aria-hidden="true">·</span>
            <span>Pé-direito {floorDoc.settings.ceilingHeight.toFixed(2)} m</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            <span>{floorDoc.settings.branding.agentName}</span>
            <span className="mx-1.5" aria-hidden="true">·</span>
            <span className="font-mono">{floorDoc.settings.branding.agentRegistry}</span>
          </div>
        </div>

        {/* Cartão do Cômodo Ativo durante o Tour Guiado Automático */}
        {cameraMode === 'guided_tour' && currentGuidedRoom && (
          <div className="pointer-events-auto bg-[#121820]/95 border border-amber-500/40 rounded-xl px-4 py-3 shadow-xl">
            <div className="text-[11px] font-medium text-amber-400">
              Tour Guiado Automático ({guidedRoomIndex + 1}/{floorDoc.rooms.length})
            </div>
            <div className="text-base font-semibold text-white mt-0.5">
              {currentGuidedRoom.name}
            </div>
            <div className="text-xs text-slate-300 font-mono tabular-nums mt-0.5">
              Área: {currentGuidedRoom.areaSqm.toFixed(2)} m² · Estilo:{' '}
              {DECOR_STYLES[floorDoc.settings.decorStyle].name}
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              {floorDoc.rooms.map((rm, idx) => (
                <button
                  key={rm.id}
                  onClick={() => setGuidedRoomIndex(idx)}
                  className={`px-2 py-1 text-[11px] rounded font-medium transition-colors whitespace-nowrap shrink-0 ${
                    idx === guidedRoomIndex
                      ? 'bg-amber-500 text-slate-950 font-semibold'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {rm.name.split(' ')[0]}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Barra de Contexto quando um Móvel está Selecionado no 3D */}
        {!readOnly && selectedFurnitureObj && (
          <div className="pointer-events-auto bg-[#121820]/95 border border-amber-500/40 rounded-xl px-3.5 py-2.5 shadow-xl flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] text-amber-400 font-medium">
                Móvel Selecionado (Arraste no piso)
              </div>
              <div className="text-xs font-semibold text-white truncate">
                {selectedFurnitureObj.name}
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={handleRotateSelectedFurniture}
                title="Girar 45°"
                className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors whitespace-nowrap shrink-0"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>Girar 45°</span>
              </button>
              <button
                onClick={handleDeleteSelectedFurniture}
                title="Remover móvel"
                className="p-1.5 bg-rose-950/80 hover:bg-rose-900 text-rose-200 rounded-lg transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Ações Rápidas de Captura (Foto PNG / Vídeo do Tour) no Topo Direito */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
        <button
          onClick={handleCapturePhoto}
          className="px-3 py-2 bg-[#121820]/95 hover:bg-slate-800 text-slate-100 border border-white/10 rounded-lg text-xs font-medium flex items-center gap-1.5 shadow-lg transition-colors whitespace-nowrap shrink-0"
        >
          <Camera className="w-3.5 h-3.5 text-amber-400" />
          <span>Exportar Foto 3D</span>
        </button>
        <button
          onClick={handleToggleVideoRecording}
          className={`px-3 py-2 border rounded-lg text-xs font-medium flex items-center gap-1.5 shadow-lg transition-colors whitespace-nowrap shrink-0 ${
            isRecordingVideo
              ? 'bg-rose-600 hover:bg-rose-500 text-white border-rose-400'
              : 'bg-[#121820]/95 hover:bg-slate-800 text-slate-100 border-white/10'
          }`}
        >
          {isRecordingVideo ? (
            <>
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>Parar e Baixar Vídeo</span>
            </>
          ) : (
            <>
              <Video className="w-3.5 h-3.5 text-sky-400" />
              <span>Gravar Vídeo do Tour</span>
            </>
          )}
        </button>
      </div>

      {/* Controles Virtuais de Caminhada 1ª Pessoa (Touch / Mobile & Teclado WASD) */}
      {cameraMode === 'first_person' && (
        <div className="absolute bottom-28 right-5 z-10 bg-[#121820]/95 border border-white/10 rounded-xl p-3 shadow-xl flex flex-col items-center gap-1.5">
          <div className="text-[11px] text-slate-400 font-mono mb-1">
            Olhos: 1,60 m · WASD / Toque
          </div>
          <button
            onPointerDown={() => (keysHeldRef.current['KeyW'] = true)}
            onPointerUp={() => (keysHeldRef.current['KeyW'] = false)}
            onPointerLeave={() => (keysHeldRef.current['KeyW'] = false)}
            className="w-10 h-9 bg-slate-800 hover:bg-slate-700 active:bg-amber-500 active:text-slate-950 rounded-lg text-xs font-bold text-white"
          >
            W
          </button>
          <div className="flex items-center gap-1.5">
            <button
              onPointerDown={() => (keysHeldRef.current['KeyA'] = true)}
              onPointerUp={() => (keysHeldRef.current['KeyA'] = false)}
              onPointerLeave={() => (keysHeldRef.current['KeyA'] = false)}
              className="w-10 h-9 bg-slate-800 hover:bg-slate-700 active:bg-amber-500 active:text-slate-950 rounded-lg text-xs font-bold text-white"
            >
              A
            </button>
            <button
              onPointerDown={() => (keysHeldRef.current['KeyS'] = true)}
              onPointerUp={() => (keysHeldRef.current['KeyS'] = false)}
              onPointerLeave={() => (keysHeldRef.current['KeyS'] = false)}
              className="w-10 h-9 bg-slate-800 hover:bg-slate-700 active:bg-amber-500 active:text-slate-950 rounded-lg text-xs font-bold text-white"
            >
              S
            </button>
            <button
              onPointerDown={() => (keysHeldRef.current['KeyD'] = true)}
              onPointerUp={() => (keysHeldRef.current['KeyD'] = false)}
              onPointerLeave={() => (keysHeldRef.current['KeyD'] = false)}
              className="w-10 h-9 bg-slate-800 hover:bg-slate-700 active:bg-amber-500 active:text-slate-950 rounded-lg text-xs font-bold text-white"
            >
              D
            </button>
          </div>
          <button
            onClick={() => setGyroEnabled((prev) => !prev)}
            className={`mt-1 px-2.5 py-1 rounded text-[11px] font-medium transition-colors whitespace-nowrap ${
              gyroEnabled
                ? 'bg-amber-500 text-slate-950'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            Giroscópio: {gyroEnabled ? 'Ativo' : 'Off'}
          </button>
        </div>
      )}

      {/* Dock Inferior Unificado e Retrátil (Zero obstrução central e sem backdrop-filter) */}
      <div
        className={`absolute left-1/2 -translate-x-1/2 bottom-4 z-10 w-[min(940px,95vw)] transition-transform duration-200 ${
          dockCollapsed ? 'translate-y-[calc(100%-32px)]' : 'translate-y-0'
        }`}
      >
        {/* Botão de Recolher / Expandir Modo Apresentação */}
        <div className="flex justify-center mb-1.5">
          <button
            onClick={() => setDockCollapsed((prev) => !prev)}
            className="px-3.5 py-1 bg-[#121820] hover:bg-slate-800 text-slate-300 border border-white/10 rounded-full text-xs font-medium flex items-center gap-1.5 shadow-lg transition-colors whitespace-nowrap shrink-0"
          >
            {dockCollapsed ? (
              <>
                <ChevronUp className="w-3.5 h-3.5 text-amber-400" />
                <span>Mostrar Controles 3D (H)</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5 text-amber-400" />
                <span>Ocultar Controles · Modo Apresentação (H)</span>
              </>
            )}
          </button>
        </div>

        <div className="bg-[#121820] border border-white/12 rounded-2xl p-3 shadow-2xl">
          {/* Linha Superior do Dock: Modos de Tour & Abas de Personalização */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-white/10">
            {/* Seletor dos 4 Modos de Visualização e Tour */}
            <div className="flex items-center gap-1 bg-[#0B0F14] p-1 rounded-xl">
              <button
                onClick={() => handleSelectCameraMode('orbit')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                  cameraMode === 'orbit'
                    ? 'bg-amber-500 text-slate-950 font-semibold'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Compass className="w-3.5 h-3.5" />
                <span>Vista Aérea</span>
              </button>
              <button
                onClick={() => handleSelectCameraMode('dollhouse')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                  cameraMode === 'dollhouse'
                    ? 'bg-amber-500 text-slate-950 font-semibold'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Corte (Dollhouse)</span>
              </button>
              <button
                onClick={() => handleSelectCameraMode('first_person')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                  cameraMode === 'first_person'
                    ? 'bg-amber-500 text-slate-950 font-semibold'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>1ª Pessoa (1,60m)</span>
              </button>
              <button
                onClick={() => handleSelectCameraMode('guided_tour')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                  cameraMode === 'guided_tour'
                    ? 'bg-amber-500 text-slate-950 font-semibold'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Play className="w-3.5 h-3.5" />
                <span>Tour Guiado</span>
              </button>
            </div>

            {/* Abas do Dock */}
            <div className="flex items-center gap-1 bg-[#0B0F14] p-1 rounded-xl">
              <button
                onClick={() => setActiveDockTab('style')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                  activeDockTab === 'style'
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Palette className="w-3.5 h-3.5 text-amber-400" />
                <span>6 Estilos</span>
              </button>
              {!readOnly && (
                <button
                  onClick={() => setActiveDockTab('furniture')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                    activeDockTab === 'furniture'
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Home className="w-3.5 h-3.5 text-sky-400" />
                  <span>Mobiliário ({floorDoc.furniture.length})</span>
                </button>
              )}
              <button
                onClick={() => setActiveDockTab('lighting')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                  activeDockTab === 'lighting'
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Sun className="w-3.5 h-3.5 text-amber-300" />
                <span>Luz & Pé-direito</span>
              </button>
            </div>
          </div>

          {/* Conteúdo da Aba Ativa no Dock */}
          {activeDockTab === 'style' && (
            <div className="flex items-center justify-between gap-2 overflow-x-auto py-0.5">
              <div className="flex items-center gap-2">
                {(Object.keys(DECOR_STYLES) as DecorStyleId[]).map((stKey) => {
                  const st = DECOR_STYLES[stKey];
                  const isActive = floorDoc.settings.decorStyle === stKey;
                  return (
                    <button
                      key={st.id}
                      onClick={() => handleStyleChange(st.id)}
                      className={`px-3 py-2 rounded-xl border text-left transition-all flex items-center gap-2.5 shrink-0 ${
                        isActive
                          ? 'bg-slate-800/90 border-amber-500 text-white shadow-md'
                          : 'bg-[#0B0F14] border-white/8 text-slate-300 hover:border-white/20'
                      }`}
                    >
                      <div className="flex -space-x-1 shrink-0">
                        <span
                          className="w-4 h-4 rounded-full border border-black/40"
                          style={{ backgroundColor: st.woodColor }}
                        />
                        <span
                          className="w-4 h-4 rounded-full border border-black/40"
                          style={{ backgroundColor: st.fabricPrimaryColor }}
                        />
                        <span
                          className="w-4 h-4 rounded-full border border-black/40"
                          style={{ backgroundColor: st.accentWallColor }}
                        />
                      </div>
                      <div>
                        <div className="text-xs font-semibold whitespace-nowrap">
                          {st.name}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate max-w-[140px]">
                          {st.tagline}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {!readOnly && (
                <button
                  onClick={onAutoDecorate}
                  className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold rounded-xl text-xs flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Auto-Decorar</span>
                </button>
              )}
            </div>
          )}

          {activeDockTab === 'furniture' && !readOnly && (
            <div className="flex items-center gap-2 overflow-x-auto py-0.5">
              {FURNITURE_CATALOG.map((cat) => (
                <button
                  key={cat.catalogId}
                  onClick={() => handleAddFurnitureFromCatalog(cat.catalogId)}
                  className="px-3 py-2 bg-[#0B0F14] hover:bg-slate-800 border border-white/10 rounded-xl text-left transition-colors flex items-center gap-2 shrink-0"
                >
                  <Plus className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <div>
                    <div className="text-xs font-medium text-white whitespace-nowrap">
                      {cat.name}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono">
                      {cat.dimensions.width.toFixed(2)}m ×{' '}
                      {cat.dimensions.depth.toFixed(2)}m
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {activeDockTab === 'lighting' && (
            <div className="flex flex-wrap items-center justify-between gap-4 py-0.5">
              {/* Ciclo Solar */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-400 mr-1 whitespace-nowrap">
                  Horário Solar:
                </span>
                {(
                  [
                    ['morning', 'Manhã'],
                    ['noon', 'Meio-Dia'],
                    ['golden_hour', 'Golden Hour'],
                    ['night', 'Noturno'],
                  ] as Array<[LightingPresetId, string]>
                ).map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() =>
                      onUpdateDocument((prev) => ({
                        ...prev,
                        settings: { ...prev.settings, lightingPreset: id },
                      }))
                    }
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      floorDoc.settings.lightingPreset === id
                        ? 'bg-amber-500 text-slate-950 font-semibold'
                        : 'bg-[#0B0F14] text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Pé-direito configurável */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 whitespace-nowrap">
                  Pé-direito:
                </span>
                <input
                  type="range"
                  min={2.4}
                  max={3.8}
                  step={0.05}
                  value={floorDoc.settings.ceilingHeight}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    onUpdateDocument((prev) => ({
                      ...prev,
                      settings: { ...prev.settings, ceilingHeight: val },
                      walls: prev.walls.map((w) => ({ ...w, height: val })),
                    }));
                  }}
                  className="w-24 accent-amber-500"
                />
                <span className="text-xs font-mono text-white tabular-nums w-12">
                  {floorDoc.settings.ceilingHeight.toFixed(2)} m
                </span>
              </div>

              {/* Perfil de Desempenho Gráfico */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-400 whitespace-nowrap">
                  Desempenho:
                </span>
                {(
                  [
                    ['low', 'Baixo'],
                    ['medium', 'Médio'],
                    ['high', 'Alto PBR'],
                  ] as Array<[QualityProfileId, string]>
                ).map(([qId, qLabel]) => (
                  <button
                    key={qId}
                    onClick={() =>
                      onUpdateDocument((prev) => ({
                        ...prev,
                        settings: { ...prev.settings, qualityProfile: qId },
                      }))
                    }
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      floorDoc.settings.qualityProfile === qId
                        ? 'bg-sky-500 text-slate-950 font-semibold'
                        : 'bg-[#0B0F14] text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    {qLabel}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
