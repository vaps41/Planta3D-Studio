import React, { useEffect, useRef, useState } from 'react';
import {
  FloorMaterialId,
  FloorPlanDocument,
  OpeningItem,
  Point2D,
  RoomType,
  RoomZone,
  WallSegment,
} from '../types/floorplan';
import {
  applyScaleCalibration,
  autoFurnishFloorPlan,
  computePolygonAreaSqm,
  getPolygonBounds,
  isPointInPolygon,
  projectPointOnSegment,
} from '../utils/geometryAndAutoDecor';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  DoorOpen,
  Eye,
  Grid,
  Maximize2,
  MousePointer,
  PlusSquare,
  Ruler,
  Sparkles,
  Square,
  Trash2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

interface Editor2DCanvasProps {
  document: FloorPlanDocument;
  detectedDimensions?: string[];
  warnings?: string[];
  onUpdateDocument: (updater: (prev: FloorPlanDocument) => FloorPlanDocument) => void;
  onProceedTo3D: () => void;
}

type Tool2D =
  | 'select'
  | 'draw_wall'
  | 'add_door'
  | 'add_window'
  | 'calibrate_scale'
  | 'add_room';

const ROOM_TYPE_LABELS: Record<RoomType, string> = {
  living_room: 'Sala de Estar',
  dining_room: 'Sala de Jantar',
  bedroom: 'Quarto / Suíte',
  kitchen: 'Cozinha',
  bathroom: 'Banheiro',
  office: 'Escritório / Home Office',
  balcony: 'Varanda / Terraço',
  hallway: 'Circulação / Hall',
};

const FLOOR_MATERIAL_LABELS: Record<FloorMaterialId, string> = {
  oak_herringbone: 'Parquet Carvalho Espinha de Peixe',
  warm_wood_planks: 'Tábua Corrida Freijó Natural',
  porcelain_Beige: 'Porcelanato Acetinado Bege',
  carrara_marble: 'Mármore Carrara Branco',
  polished_concrete: 'Cimento Queimado Urbano',
  terracotta_rustic: 'Cerâmica Terracota Rústica',
  ceramic_grid: 'Cerâmica Técnica 60x60',
};

export const Editor2DCanvas: React.FC<Editor2DCanvasProps> = ({
  document: floorDoc,
  detectedDimensions = [],
  warnings = [],
  onUpdateDocument,
  onProceedTo3D,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bgImageRef = useRef<HTMLImageElement | null>(null);

  const [activeTool, setActiveTool] = useState<Tool2D>('select');
  const [zoom, setZoom] = useState<number>(56); // Pixels de tela por metro do modelo
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 90, y: 75 });
  const [bgOpacity, setBgOpacity] = useState<number>(0.38);

  // Seleções ativas para inspeção e edição na barra lateral
  const [selectedWallId, setSelectedWallId] = useState<string | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(
    floorDoc.rooms[0]?.id || null
  );
  const [selectedOpeningId, setSelectedOpeningId] = useState<string | null>(
    null
  );

  // Estados de desenho e arraste de vértices
  const [draggingEndpoint, setDraggingEndpoint] = useState<{
    wallId: string;
    endpoint: 'start' | 'end';
  } | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const [wallDraftStart, setWallDraftStart] = useState<Point2D | null>(null);
  const [hoverWorldPt, setHoverWorldPt] = useState<Point2D | null>(null);

  // Estado da Régua de Calibração de Escala
  const [rulerPtA, setRulerPtA] = useState<Point2D | null>(null);
  const [rulerPtB, setRulerPtB] = useState<Point2D | null>(null);
  const [knownLengthInput, setKnownLengthInput] = useState<string>('3.50');
  const [calibrationBannerMsg, setCalibrationBannerMsg] = useState<string | null>(
    null
  );

  // Carrega imagem de fundo da planta baixa quando disponível
  useEffect(() => {
    if (!floorDoc.sourceImageDataUrl) {
      bgImageRef.current = null;
      return;
    }
    const img = new Image();
    img.onload = () => {
      bgImageRef.current = img;
    };
    img.src = floorDoc.sourceImageDataUrl;
  }, [floorDoc.sourceImageDataUrl]);

  // Conversão entre coordenadas de tela (px) e coordenadas do mundo (metros)
  const screenToWorld = (sx: number, sy: number): Point2D => {
    const rawX = (sx - pan.x) / zoom;
    const rawZ = (sy - pan.y) / zoom;
    return {
      x: Math.round(rawX * 10) / 10, // Snap magnético a cada 10 cm
      z: Math.round(rawZ * 10) / 10,
    };
  };

  const worldToScreen = (pt: Point2D) => ({
    x: pan.x + pt.x * zoom,
    y: pan.y + pt.z * zoom,
  });

  // Renderização vetorial do Canvas 2D
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const parent = canvas.parentElement;
    const width = parent?.clientWidth || 900;
    const height = parent?.clientHeight || 620;
    canvas.width = width;
    canvas.height = height;

    // 1. Fundo escuro técnico do editor CAD
    ctx.fillStyle = '#0B0F15';
    ctx.fillRect(0, 0, width, height);

    // 2. Grade métrica (linhas a cada 0.5m e destaque a cada 1.0m)
    const stepHalf = zoom * 0.5;
    if (stepHalf >= 12) {
      for (let x = pan.x % stepHalf; x < width; x += stepHalf) {
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.06)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = pan.y % stepHalf; y < height; y += stepHalf) {
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.06)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
    }

    // 3. Imagem original da planta baixa sob o desenho vetorial (alinhada à origem)
    if (bgImageRef.current && bgOpacity > 0.02) {
      let maxX = 8;
      let maxZ = 6;
      for (const w of floorDoc.walls) {
        maxX = Math.max(maxX, w.start.x, w.end.x);
        maxZ = Math.max(maxZ, w.start.z, w.end.z);
      }
      ctx.save();
      ctx.globalAlpha = bgOpacity;
      ctx.drawImage(
        bgImageRef.current,
        pan.x - zoom * 0.8,
        pan.y - zoom * 0.8,
        (maxX + 1.6) * zoom,
        (maxZ + 1.6) * zoom
      );
      ctx.restore();
    }

    // 4. Desenho dos Polígonos de Cômodos e Rótulos de Área (m²)
    const roomColors: Record<RoomType, string> = {
      living_room: 'rgba(245, 158, 11, 0.16)',
      dining_room: 'rgba(249, 115, 22, 0.16)',
      bedroom: 'rgba(56, 189, 248, 0.16)',
      kitchen: 'rgba(16, 185, 129, 0.16)',
      bathroom: 'rgba(99, 102, 241, 0.18)',
      office: 'rgba(168, 85, 247, 0.16)',
      balcony: 'rgba(34, 197, 94, 0.16)',
      hallway: 'rgba(148, 163, 184, 0.14)',
    };

    for (const room of floorDoc.rooms) {
      if (room.polygon.length < 3) continue;
      const isSelected = room.id === selectedRoomId;

      ctx.beginPath();
      room.polygon.forEach((pt, idx) => {
        const s = worldToScreen(pt);
        if (idx === 0) ctx.moveTo(s.x, s.y);
        else ctx.lineTo(s.x, s.y);
      });
      ctx.closePath();

      ctx.fillStyle = isSelected
        ? 'rgba(245, 158, 11, 0.28)'
        : roomColors[room.type] || 'rgba(148, 163, 184, 0.15)';
      ctx.fill();

      ctx.strokeStyle = isSelected
        ? '#F59E0B'
        : 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.stroke();

      // Texto central com Nome do Cômodo, Tipologia e Área Calculada
      const b = getPolygonBounds(room.polygon);
      const centerS = worldToScreen({ x: b.centerX, z: b.centerZ });

      ctx.fillStyle = '#F8FAFC';
      ctx.font = '600 12px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(room.name, centerS.x, centerS.y - 6);

      ctx.fillStyle = '#FBBF24';
      ctx.font = '500 11px "JetBrains Mono", monospace';
      ctx.fillText(
        `${room.areaSqm.toFixed(2)} m² (${b.width.toFixed(2)}×${b.depth.toFixed(2)}m)`,
        centerS.x,
        centerS.y + 10
      );
    }

    // 5. Desenho da Silhueta 2D do Mobiliário
    for (const furn of floorDoc.furniture) {
      const s = worldToScreen({ x: furn.position.x, z: furn.position.z });
      const wPx = furn.dimensions.width * zoom;
      const dPx = furn.dimensions.depth * zoom;

      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(-furn.rotationY);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.65)';
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.roundRect(-wPx / 2, -dPx / 2, wPx, dPx, 4);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // 6. Desenho das Paredes e Cotas Lineares (em metros)
    for (const wall of floorDoc.walls) {
      const s1 = worldToScreen(wall.start);
      const s2 = worldToScreen(wall.end);
      const isSelected = wall.id === selectedWallId;
      const thickPx = Math.max(6, (wall.thickness || 0.15) * zoom);

      // Corpo da parede
      ctx.strokeStyle = isSelected
        ? '#F59E0B'
        : wall.isExterior
          ? '#E2E8F0'
          : '#94A3B8';
      ctx.lineWidth = thickPx;
      ctx.lineCap = 'square';
      ctx.beginPath();
      ctx.moveTo(s1.x, s1.y);
      ctx.lineTo(s2.x, s2.y);
      ctx.stroke();

      // Vértices editáveis nas extremidades
      for (const endPt of [s1, s2]) {
        ctx.fillStyle = isSelected ? '#F59E0B' : '#0EA5E9';
        ctx.beginPath();
        ctx.arc(endPt.x, endPt.y, 4.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Cota em metros no meio da parede
      if (floorDoc.settings.showDimensions2D) {
        const lenM = Math.hypot(
          wall.end.x - wall.start.x,
          wall.end.z - wall.start.z
        );
        if (lenM >= 0.6) {
          const midX = (s1.x + s2.x) / 2;
          const midY = (s1.y + s2.y) / 2;
          const label = `${lenM.toFixed(2)}m`;

          ctx.fillStyle = 'rgba(15, 20, 25, 0.88)';
          ctx.fillRect(midX - 24, midY - 9, 48, 17);
          ctx.strokeStyle = 'rgba(255,255,255,0.15)';
          ctx.lineWidth = 1;
          ctx.strokeRect(midX - 24, midY - 9, 48, 17);

          ctx.fillStyle = '#38BDF8';
          ctx.font = '600 10px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.fillText(label, midX, midY + 3);
        }
      }
    }

    // 7. Desenho das Portas (com arco de giro 90°) e Janelas sobre as paredes
    for (const op of floorDoc.openings) {
      const wall = floorDoc.walls.find((w) => w.id === op.wallId);
      if (!wall) continue;

      const wx = wall.start.x + (wall.end.x - wall.start.x) * op.offset;
      const wz = wall.start.z + (wall.end.z - wall.start.z) * op.offset;
      const sCenter = worldToScreen({ x: wx, z: wz });
      const angle = Math.atan2(
        wall.end.z - wall.start.z,
        wall.end.x - wall.start.x
      );
      const wPx = op.width * zoom;
      const isOpSelected = op.id === selectedOpeningId;

      ctx.save();
      ctx.translate(sCenter.x, sCenter.y);
      ctx.rotate(angle);

      if (op.type === 'door') {
        // Vão da porta + folha + arco de abertura
        ctx.fillStyle = '#0B0F15';
        ctx.fillRect(-wPx / 2, -8, wPx, 16);

        ctx.strokeStyle = isOpSelected ? '#F59E0B' : '#FBBF24';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-wPx / 2, 0);
        ctx.lineTo(-wPx / 2, wPx * 0.85);
        ctx.stroke();

        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(-wPx / 2, 0, wPx * 0.85, 0, Math.PI / 2);
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        // Janela técnica (caixilho duplo azul ciano)
        ctx.fillStyle = '#0EA5E9';
        ctx.fillRect(-wPx / 2, -4, wPx, 8);
        ctx.strokeStyle = isOpSelected ? '#F59E0B' : '#E0F2FE';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(-wPx / 2, -4, wPx, 8);
      }
      ctx.restore();
    }

    // 8. Preview de Nova Parede sendo desenhada
    if (activeTool === 'draw_wall' && wallDraftStart && hoverWorldPt) {
      const s1 = worldToScreen(wallDraftStart);
      const s2 = worldToScreen(hoverWorldPt);
      ctx.strokeStyle = '#F59E0B';
      ctx.lineWidth = 6;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(s1.x, s1.y);
      ctx.lineTo(s2.x, s2.y);
      ctx.stroke();
      ctx.setLineDash([]);

      const d = Math.hypot(
        hoverWorldPt.x - wallDraftStart.x,
        hoverWorldPt.z - wallDraftStart.z
      );
      ctx.fillStyle = '#F59E0B';
      ctx.font = '600 12px "JetBrains Mono", monospace';
      ctx.fillText(`${d.toFixed(2)} m`, (s1.x + s2.x) / 2, (s1.y + s2.y) / 2 - 10);
    }

    // 9. Desenho da Régua de Calibração de Escala
    if (activeTool === 'calibrate_scale') {
      const pt1 = rulerPtA;
      const pt2 = rulerPtB || hoverWorldPt;
      if (pt1 && pt2) {
        const s1 = worldToScreen(pt1);
        const s2 = worldToScreen(pt2);
        ctx.strokeStyle = '#10B981';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(s1.x, s1.y);
        ctx.lineTo(s2.x, s2.y);
        ctx.stroke();

        for (const p of [s1, s2]) {
          ctx.fillStyle = '#10B981';
          ctx.beginPath();
          ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }, [
    floorDoc,
    zoom,
    pan,
    bgOpacity,
    selectedWallId,
    selectedRoomId,
    selectedOpeningId,
    activeTool,
    wallDraftStart,
    hoverWorldPt,
    rulerPtA,
    rulerPtB,
  ]);

  // Interações de Mouse e Toque no Canvas 2D
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const worldPt = screenToWorld(sx, sy);

    if (e.button === 1 || e.shiftKey) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      return;
    }

    if (activeTool === 'calibrate_scale') {
      if (!rulerPtA || (rulerPtA && rulerPtB)) {
        setRulerPtA(worldPt);
        setRulerPtB(null);
      } else {
        setRulerPtB(worldPt);
        const dist = Math.hypot(
          worldPt.x - rulerPtA.x,
          worldPt.z - rulerPtA.z
        );
        if (dist > 0.1) {
          setKnownLengthInput(dist.toFixed(2));
        }
      }
      return;
    }

    if (activeTool === 'draw_wall') {
      if (!wallDraftStart) {
        setWallDraftStart(worldPt);
      } else {
        const len = Math.hypot(
          worldPt.x - wallDraftStart.x,
          worldPt.z - wallDraftStart.z
        );
        if (len >= 0.3) {
          const newWall: WallSegment = {
            id: `w_manual_${Date.now()}`,
            start: { ...wallDraftStart },
            end: { ...worldPt },
            thickness: floorDoc.settings.defaultWallThickness || 0.15,
            height: floorDoc.settings.ceilingHeight || 2.7,
            isExterior: false,
          };
          onUpdateDocument((prev) => ({
            ...prev,
            walls: [...prev.walls, newWall],
          }));
          setSelectedWallId(newWall.id);
        }
        setWallDraftStart(null);
      }
      return;
    }

    if (activeTool === 'add_door' || activeTool === 'add_window') {
      // Encontra a parede mais próxima do clique
      let bestWall: WallSegment | null = null;
      let bestDist = Infinity;
      let bestT = 0.5;

      for (const w of floorDoc.walls) {
        const proj = projectPointOnSegment(worldPt, w.start, w.end);
        if (proj.distance < bestDist) {
          bestDist = proj.distance;
          bestWall = w;
          bestT = Math.max(0.15, Math.min(0.85, proj.t));
        }
      }

      if (bestWall && bestDist < 0.75) {
        const newOpening: OpeningItem = {
          id: `op_${Date.now()}`,
          wallId: bestWall.id,
          type: activeTool === 'add_door' ? 'door' : 'window',
          offset: Math.round(bestT * 100) / 100,
          width: activeTool === 'add_door' ? 0.85 : 1.5,
          height: activeTool === 'add_door' ? 2.1 : 1.25,
          elevation: activeTool === 'add_door' ? 0 : 0.85,
          swing: 'left',
        };
        onUpdateDocument((prev) => ({
          ...prev,
          openings: [...prev.openings, newOpening],
        }));
        setSelectedOpeningId(newOpening.id);
        setActiveTool('select');
      }
      return;
    }

    if (activeTool === 'add_room') {
      const halfW = 1.8;
      const halfD = 1.6;
      const poly: Point2D[] = [
        { x: Math.max(0, worldPt.x - halfW), z: Math.max(0, worldPt.z - halfD) },
        { x: worldPt.x + halfW, z: Math.max(0, worldPt.z - halfD) },
        { x: worldPt.x + halfW, z: worldPt.z + halfD },
        { x: Math.max(0, worldPt.x - halfW), z: worldPt.z + halfD },
      ];
      const newRoom: RoomZone = {
        id: `room_${Date.now()}`,
        name: `Novo Ambiente ${floorDoc.rooms.length + 1}`,
        type: 'bedroom',
        polygon: poly,
        areaSqm: computePolygonAreaSqm(poly),
        floorMaterial: 'oak_herringbone',
        wallColor: '#F4F1EA',
      };
      onUpdateDocument((prev) => ({
        ...prev,
        rooms: [...prev.rooms, newRoom],
      }));
      setSelectedRoomId(newRoom.id);
      setActiveTool('select');
      return;
    }

    // Modo Selecionar: 1º verifica extremidades de parede (vértices) para arrastar
    for (const w of floorDoc.walls) {
      if (Math.hypot(worldPt.x - w.start.x, worldPt.z - w.start.z) < 0.35) {
        setDraggingEndpoint({ wallId: w.id, endpoint: 'start' });
        setSelectedWallId(w.id);
        return;
      }
      if (Math.hypot(worldPt.x - w.end.x, worldPt.z - w.end.z) < 0.35) {
        setDraggingEndpoint({ wallId: w.id, endpoint: 'end' });
        setSelectedWallId(w.id);
        return;
      }
    }

    // 2º verifica clique em porta/janela
    for (const op of floorDoc.openings) {
      const w = floorDoc.walls.find((wall) => wall.id === op.wallId);
      if (!w) continue;
      const ox = w.start.x + (w.end.x - w.start.x) * op.offset;
      const oz = w.start.z + (w.end.z - w.start.z) * op.offset;
      if (Math.hypot(worldPt.x - ox, worldPt.z - oz) < 0.45) {
        setSelectedOpeningId(op.id);
        setSelectedWallId(null);
        return;
      }
    }

    // 3º verifica clique no corpo de uma parede
    for (const w of floorDoc.walls) {
      const proj = projectPointOnSegment(worldPt, w.start, w.end);
      if (proj.distance < 0.28) {
        setSelectedWallId(w.id);
        setSelectedOpeningId(null);
        return;
      }
    }

    // 4º verifica clique dentro de um cômodo
    for (const r of floorDoc.rooms) {
      if (isPointInPolygon(worldPt, r.polygon)) {
        setSelectedRoomId(r.id);
        setSelectedWallId(null);
        setSelectedOpeningId(null);
        return;
      }
    }

    // Caso clique no vazio, inicia pan do canvas
    setIsPanning(true);
    setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const worldPt = screenToWorld(sx, sy);
    setHoverWorldPt(worldPt);

    if (isPanning) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      });
      return;
    }

    if (draggingEndpoint) {
      onUpdateDocument((prev) => ({
        ...prev,
        walls: prev.walls.map((w) => {
          if (w.id !== draggingEndpoint.wallId) return w;
          return draggingEndpoint.endpoint === 'start'
            ? { ...w, start: { ...worldPt } }
            : { ...w, end: { ...worldPt } };
        }),
      }));
    }
  };

  const handlePointerUp = () => {
    setIsPanning(false);
    setDraggingEndpoint(null);
  };

  // Aplica a calibração explícita de escala informada pelo usuário
  const handleConfirmScaleCalibration = () => {
    const parsedLen = parseFloat(knownLengthInput.replace(',', '.'));
    if (isNaN(parsedLen) || parsedLen <= 0.1) return;

    let currentModelDist = floorDoc.scale.referenceLengthMeters || 3.5;
    if (rulerPtA && rulerPtB) {
      const d = Math.hypot(rulerPtB.x - rulerPtA.x, rulerPtB.z - rulerPtA.z);
      if (d > 0.1) currentModelDist = d;
    } else if (selectedWallId) {
      const w = floorDoc.walls.find((wall) => wall.id === selectedWallId);
      if (w) {
        currentModelDist = Math.hypot(
          w.end.x - w.start.x,
          w.end.z - w.start.z
        );
      }
    }

    onUpdateDocument((prev) => {
      const calibratedDoc = applyScaleCalibration(
        prev,
        currentModelDist,
        parsedLen
      );
      return {
        ...calibratedDoc,
        furniture: autoFurnishFloorPlan(
          calibratedDoc.rooms,
          calibratedDoc.walls,
          calibratedDoc.openings
        ),
      };
    });

    setCalibrationBannerMsg(
      `Escala calibrada com sucesso (${parsedLen.toFixed(2)} m de referência). Áreas e móveis recalculados.`
    );
    setActiveTool('select');
    setRulerPtA(null);
    setRulerPtB(null);
  };

  const selectedRoomObj = floorDoc.rooms.find((r) => r.id === selectedRoomId);
  const selectedWallObj = floorDoc.walls.find((w) => w.id === selectedWallId);
  const selectedOpeningObj = floorDoc.openings.find(
    (op) => op.id === selectedOpeningId
  );

  return (
    <div className="flex flex-col lg:flex-row w-full h-[calc(100vh-64px)] bg-[#0F1419] overflow-hidden">
      {/* Área Principal do Editor Vetorial 2D */}
      <div className="relative flex-1 h-full flex flex-col">
        {/* Alerta de Escala e Avisos de Visão Computacional */}
        {(!floorDoc.scale.calibrated || warnings.length > 0 || calibrationBannerMsg) && (
          <div className="bg-[#161F2C] border-b border-white/10 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-xs">
              {!floorDoc.scale.calibrated ? (
                <>
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="text-amber-200 font-medium">
                    Atenção: A escala desta planta foi estimada. Use a{' '}
                    <strong>Régua de Escala</strong> ou informe uma medida conhecida ao lado para precisão real.
                  </span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="text-slate-200">
                    {calibrationBannerMsg ||
                      `Escala calibrada (${floorDoc.scale.pixelsPerMeter.toFixed(1)} px/m · Confiança ${Math.round(floorDoc.scale.confidence * 100)}%)`}
                  </span>
                </>
              )}
            </div>

            {detectedDimensions.length > 0 && (
              <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
                <span>Cotas lidas (OCR):</span>
                <span className="text-sky-300">
                  {detectedDimensions.slice(0, 3).join(' · ')}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Barra de Ferramentas Vetoriais 2D */}
        <div className="bg-[#121820] border-b border-white/10 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setActiveTool('select')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                activeTool === 'select'
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'bg-slate-800/80 text-slate-200 hover:bg-slate-700'
              }`}
            >
              <MousePointer className="w-3.5 h-3.5" />
              <span>Mover / Selecionar</span>
            </button>

            <button
              onClick={() => {
                setActiveTool('draw_wall');
                setWallDraftStart(null);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                activeTool === 'draw_wall'
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'bg-slate-800/80 text-slate-200 hover:bg-slate-700'
              }`}
            >
              <PlusSquare className="w-3.5 h-3.5" />
              <span>Desenhar Parede</span>
            </button>

            <button
              onClick={() => setActiveTool('add_door')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                activeTool === 'add_door'
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'bg-slate-800/80 text-slate-200 hover:bg-slate-700'
              }`}
            >
              <DoorOpen className="w-3.5 h-3.5" />
              <span>+ Porta</span>
            </button>

            <button
              onClick={() => setActiveTool('add_window')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                activeTool === 'add_window'
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'bg-slate-800/80 text-slate-200 hover:bg-slate-700'
              }`}
            >
              <Square className="w-3.5 h-3.5" />
              <span>+ Janela</span>
            </button>

            <button
              onClick={() => setActiveTool('add_room')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                activeTool === 'add_room'
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'bg-slate-800/80 text-slate-200 hover:bg-slate-700'
              }`}
            >
              <Grid className="w-3.5 h-3.5" />
              <span>+ Cômodo</span>
            </button>

            <button
              onClick={() => {
                setActiveTool('calibrate_scale');
                setRulerPtA(null);
                setRulerPtB(null);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                activeTool === 'calibrate_scale'
                  ? 'bg-emerald-500 text-slate-950 font-semibold'
                  : 'bg-emerald-950/70 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-900/60'
              }`}
            >
              <Ruler className="w-3.5 h-3.5" />
              <span>Régua de Escala</span>
            </button>
          </div>

          {/* Controles de Zoom e Opacidade da Planta Base */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <Eye className="w-3.5 h-3.5" />
              <span>Planta Base:</span>
              <input
                type="range"
                min={0}
                max={0.9}
                step={0.05}
                value={bgOpacity}
                onChange={(e) => setBgOpacity(parseFloat(e.target.value))}
                className="w-20 accent-amber-500"
              />
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setZoom((z) => Math.max(28, z - 8))}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-200"
                title="Reduzir Zoom"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setZoom((z) => Math.min(110, z + 8))}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-200"
                title="Ampliar Zoom"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Canvas Vetorial 2D */}
        <div className="relative flex-1 w-full h-full overflow-hidden">
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            className="w-full h-full block cursor-crosshair"
          />

          {/* Instrução Contextual da Ferramenta Ativa */}
          <div className="absolute bottom-4 left-4 bg-[#121820]/95 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-slate-300 pointer-events-none">
            {activeTool === 'select' &&
              'Arraste os pontos azuis para mover paredes, clique em um cômodo para renomear ou arraste o fundo para mover a vista.'}
            {activeTool === 'draw_wall' &&
              'Clique no ponto inicial e depois no ponto final para desenhar uma nova parede com alinhamento métrico.'}
            {activeTool === 'add_door' &&
              'Clique sobre qualquer parede existente para inserir uma porta com vão real de 0,85 m.'}
            {activeTool === 'add_window' &&
              'Clique sobre qualquer parede externa ou interna para inserir uma janela de 1,50 m.'}
            {activeTool === 'calibrate_scale' &&
              'Clique nos dois extremos de uma parede/cota conhecida e confirme a medida em metros no painel direito.'}
            {activeTool === 'add_room' &&
              'Clique na posição desejada para inserir uma nova zona de ambiente editável.'}
          </div>
        </div>
      </div>

      {/* Painel Direito de Inspeção: Calibração de Escala, Cômodos e Ação 3D */}
      <aside className="w-full lg:w-96 bg-[#121820] border-l border-white/10 p-5 flex flex-col justify-between overflow-y-auto gap-5">
        <div className="space-y-5">
          {/* 1. Calibração Explícita de Escala (Metros por Pixel) */}
          <div className="bg-[#0B0F15] border border-white/10 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Ruler className="w-4 h-4 text-emerald-400" />
                <span>Calibração de Escala Real</span>
              </h3>
              <span className="text-xs font-mono text-emerald-400 tabular-nums">
                {floorDoc.scale.pixelsPerMeter.toFixed(1)} px/m
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed mb-3">
              Informe a medida real em metros da parede selecionada ou do trecho marcado com a Régua de Escala:
            </p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.05"
                min="0.3"
                max="50"
                value={knownLengthInput}
                onChange={(e) => setKnownLengthInput(e.target.value)}
                className="w-28 px-3 py-2 bg-[#161F2C] border border-white/15 rounded-lg text-sm font-mono text-white focus:outline-none focus:border-amber-500"
              />
              <span className="text-xs text-slate-400 font-mono">metros</span>
              <button
                onClick={handleConfirmScaleCalibration}
                className="flex-1 px-3 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold rounded-lg text-xs transition-colors whitespace-nowrap"
              >
                Aplicar Escala
              </button>
            </div>
          </div>

          {/* 2. Edição de Cômodo Selecionado */}
          {selectedRoomObj && (
            <div className="bg-[#0B0F15] border border-white/10 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">
                  Ambiente Selecionado
                </h3>
                <button
                  onClick={() => {
                    onUpdateDocument((prev) => ({
                      ...prev,
                      rooms: prev.rooms.filter(
                        (r) => r.id !== selectedRoomObj.id
                      ),
                    }));
                    setSelectedRoomId(null);
                  }}
                  className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Excluir</span>
                </button>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Nome do Ambiente (exibido no 2D e no Tour)
                </label>
                <input
                  type="text"
                  value={selectedRoomObj.name}
                  onChange={(e) => {
                    const val = e.target.value;
                    onUpdateDocument((prev) => ({
                      ...prev,
                      rooms: prev.rooms.map((r) =>
                        r.id === selectedRoomObj.id ? { ...r, name: val } : r
                      ),
                    }));
                  }}
                  className="w-full px-3 py-2 bg-[#161F2C] border border-white/15 rounded-lg text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Tipologia (Auto-Móveis)
                  </label>
                  <select
                    value={selectedRoomObj.type}
                    onChange={(e) => {
                      const newType = e.target.value as RoomType;
                      onUpdateDocument((prev) => {
                        const updatedRooms = prev.rooms.map((r) =>
                          r.id === selectedRoomObj.id
                            ? { ...r, type: newType }
                            : r
                        );
                        return {
                          ...prev,
                          rooms: updatedRooms,
                          furniture: autoFurnishFloorPlan(
                            updatedRooms,
                            prev.walls,
                            prev.openings
                          ),
                        };
                      });
                    }}
                    className="w-full px-2.5 py-2 bg-[#161F2C] border border-white/15 rounded-lg text-xs text-white"
                  >
                    {(Object.keys(ROOM_TYPE_LABELS) as RoomType[]).map((rt) => (
                      <option key={rt} value={rt}>
                        {ROOM_TYPE_LABELS[rt]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Revestimento de Piso
                  </label>
                  <select
                    value={selectedRoomObj.floorMaterial}
                    onChange={(e) => {
                      const mat = e.target.value as FloorMaterialId;
                      onUpdateDocument((prev) => ({
                        ...prev,
                        rooms: prev.rooms.map((r) =>
                          r.id === selectedRoomObj.id
                            ? { ...r, floorMaterial: mat }
                            : r
                        ),
                      }));
                    }}
                    className="w-full px-2.5 py-2 bg-[#161F2C] border border-white/15 rounded-lg text-xs text-white"
                  >
                    {(
                      Object.keys(FLOOR_MATERIAL_LABELS) as FloorMaterialId[]
                    ).map((fm) => (
                      <option key={fm} value={fm}>
                        {FLOOR_MATERIAL_LABELS[fm]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* 3. Edição de Parede ou Esquadria Selecionada */}
          {selectedWallObj && (
            <div className="bg-[#0B0F15] border border-amber-500/30 rounded-xl p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">
                  Parede Selecionada
                </h3>
                <button
                  onClick={() => {
                    onUpdateDocument((prev) => ({
                      ...prev,
                      walls: prev.walls.filter(
                        (w) => w.id !== selectedWallObj.id
                      ),
                      openings: prev.openings.filter(
                        (op) => op.wallId !== selectedWallObj.id
                      ),
                    }));
                    setSelectedWallId(null);
                  }}
                  className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remover Parede</span>
                </button>
              </div>
              <div className="text-xs font-mono text-slate-300">
                Comprimento:{' '}
                {Math.hypot(
                  selectedWallObj.end.x - selectedWallObj.start.x,
                  selectedWallObj.end.z - selectedWallObj.start.z
                ).toFixed(2)}{' '}
                m · Espessura: {selectedWallObj.thickness.toFixed(2)} m
              </div>
            </div>
          )}

          {selectedOpeningObj && (
            <div className="bg-[#0B0F15] border border-sky-500/30 rounded-xl p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">
                  {selectedOpeningObj.type === 'door'
                    ? 'Porta Selecionada'
                    : 'Janela Selecionada'}
                </h3>
                <button
                  onClick={() => {
                    onUpdateDocument((prev) => ({
                      ...prev,
                      openings: prev.openings.filter(
                        (op) => op.id !== selectedOpeningObj.id
                      ),
                    }));
                    setSelectedOpeningId(null);
                  }}
                  className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Excluir</span>
                </button>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-400">Largura (m):</label>
                <input
                  type="number"
                  step="0.05"
                  min="0.5"
                  max="3.5"
                  value={selectedOpeningObj.width}
                  onChange={(e) => {
                    const w = parseFloat(e.target.value) || 0.85;
                    onUpdateDocument((prev) => ({
                      ...prev,
                      openings: prev.openings.map((op) =>
                        op.id === selectedOpeningObj.id
                          ? { ...op, width: w }
                          : op
                      ),
                    }));
                  }}
                  className="w-24 px-2.5 py-1 bg-[#161F2C] border border-white/15 rounded text-xs font-mono text-white"
                />
              </div>
            </div>
          )}

          {/* Lista Rápida de Todos os Ambientes da Planta */}
          <div className="bg-[#0B0F15] border border-white/10 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="text-xs font-semibold text-slate-300">
                Ambientes Mapeados ({floorDoc.rooms.length})
              </h3>
              <button
                onClick={() =>
                  onUpdateDocument((prev) => ({
                    ...prev,
                    furniture: autoFurnishFloorPlan(
                      prev.rooms,
                      prev.walls,
                      prev.openings
                    ),
                  }))
                }
                className="text-xs text-amber-400 hover:text-amber-300 font-medium flex items-center gap-1"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Recalcular Móveis</span>
              </button>
            </div>
            <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
              {floorDoc.rooms.map((rm) => (
                <button
                  key={rm.id}
                  onClick={() => setSelectedRoomId(rm.id)}
                  className={`w-full px-3 py-2 rounded-lg text-left flex items-center justify-between text-xs transition-colors ${
                    rm.id === selectedRoomId
                      ? 'bg-amber-500/20 border border-amber-500/50 text-white'
                      : 'bg-[#161F2C] text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <span className="font-medium truncate">{rm.name}</span>
                  <span className="font-mono text-slate-400 tabular-nums shrink-0 ml-2">
                    {rm.areaSqm.toFixed(1)} m²
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* CTA Principal para Geração do Modelo 3D Decorado */}
        <button
          onClick={onProceedTo3D}
          className="w-full py-3.5 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold rounded-xl text-sm flex items-center justify-center gap-2 shadow-lg transition-colors whitespace-nowrap"
        >
          <span>Gerar Modelo 3D Decorado</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </aside>
    </div>
  );
};
