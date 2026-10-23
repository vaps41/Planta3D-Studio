import {
  FloorPlanDocument,
  FurnitureCatalogItem,
  FurnitureInstance,
  OpeningItem,
  Point2D,
  PreprocessSettings,
  RoomType,
  RoomZone,
  WallSegment,
} from '../types/floorplan';

/**
 * Catálogo completo de mobiliário arquitetônico parametrizado para auto-decoração e edição manual.
 * Todas as medidas estão em metros (largura, profundidade, altura e raio de circulação livre).
 */
export const FURNITURE_CATALOG: FurnitureCatalogItem[] = [
  // Sala de Estar e Jantar
  {
    catalogId: 'sofa_3_seater',
    name: 'Sofá 3 Lugares Living',
    category: 'living_room',
    dimensions: { width: 2.2, depth: 0.92, height: 0.82 },
    clearanceRadius: 0.55,
  },
  {
    catalogId: 'tv_console',
    name: 'Rack Suspenso & Smart TV 65"',
    category: 'living_room',
    dimensions: { width: 1.85, depth: 0.45, height: 1.35 },
    clearanceRadius: 0.4,
  },
  {
    catalogId: 'coffee_table',
    name: 'Mesa de Centro Orgânica',
    category: 'living_room',
    dimensions: { width: 1.15, depth: 0.65, height: 0.38 },
    clearanceRadius: 0.35,
  },
  {
    catalogId: 'dining_table_4',
    name: 'Mesa de Jantar 4 Lugares',
    category: 'dining_room',
    dimensions: { width: 1.45, depth: 0.9, height: 0.76 },
    clearanceRadius: 0.6,
  },
  {
    catalogId: 'lounge_armchair',
    name: 'Poltrona de Leitura',
    category: 'living_room',
    dimensions: { width: 0.82, depth: 0.82, height: 0.78 },
    clearanceRadius: 0.4,
  },
  // Quarto / Suíte
  {
    catalogId: 'queen_bed',
    name: 'Cama Queen com Cabeceira',
    category: 'bedroom',
    dimensions: { width: 1.65, depth: 2.05, height: 1.05 },
    clearanceRadius: 0.55,
  },
  {
    catalogId: 'wardrobe_sliding',
    name: 'Guarda-Roupa 3 Portas',
    category: 'bedroom',
    dimensions: { width: 1.9, depth: 0.58, height: 2.25 },
    clearanceRadius: 0.6,
  },
  {
    catalogId: 'nightstand',
    name: 'Mesa de Cabeceira com Abajur',
    category: 'bedroom',
    dimensions: { width: 0.52, depth: 0.44, height: 0.85 },
    clearanceRadius: 0.25,
  },
  // Cozinha
  {
    catalogId: 'kitchen_counter_sink',
    name: 'Bancada Gourmet com Cuba Inox',
    category: 'kitchen',
    dimensions: { width: 1.8, depth: 0.62, height: 0.9 },
    clearanceRadius: 0.7,
  },
  {
    catalogId: 'refrigerator_duplex',
    name: 'Geladeira Inverse Inox',
    category: 'kitchen',
    dimensions: { width: 0.74, depth: 0.72, height: 1.88 },
    clearanceRadius: 0.65,
  },
  {
    catalogId: 'stove_oven',
    name: 'Cooktop 4 Bocas & Forno',
    category: 'kitchen',
    dimensions: { width: 0.68, depth: 0.62, height: 0.9 },
    clearanceRadius: 0.65,
  },
  // Banheiro
  {
    catalogId: 'bathroom_vanity',
    name: 'Bancada Esculpida com Espelho',
    category: 'bathroom',
    dimensions: { width: 0.85, depth: 0.48, height: 1.8 },
    clearanceRadius: 0.5,
  },
  {
    catalogId: 'toilet_modern',
    name: 'Bacia Sanitária com Caixa Acoplada',
    category: 'bathroom',
    dimensions: { width: 0.46, depth: 0.66, height: 0.78 },
    clearanceRadius: 0.5,
  },
  {
    catalogId: 'shower_box',
    name: 'Box de Vidro Temperado & Ducha',
    category: 'bathroom',
    dimensions: { width: 1.1, depth: 0.9, height: 2.1 },
    clearanceRadius: 0.3,
  },
  // Escritório e Varanda
  {
    catalogId: 'office_desk',
    name: 'Estação Home Office Executiva',
    category: 'office',
    dimensions: { width: 1.35, depth: 0.65, height: 1.15 },
    clearanceRadius: 0.65,
  },
  {
    catalogId: 'indoor_plant',
    name: 'Vaso Cerâmico Costela-de-Adão',
    category: 'balcony',
    dimensions: { width: 0.55, depth: 0.55, height: 1.25 },
    clearanceRadius: 0.2,
  },
];

/**
 * Calcula a área de um polígono 2D em metros quadrados usando a Fórmula de Gauss (Shoelace).
 */
export function computePolygonAreaSqm(polygon: Point2D[]): number {
  if (polygon.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < polygon.length; i++) {
    const curr = polygon[i];
    const next = polygon[(i + 1) % polygon.length];
    sum += curr.x * next.z - next.x * curr.z;
  }
  return Math.round(Math.abs(sum * 0.5) * 100) / 100;
}

/**
 * Calcula o centro geométrico (centroide) e a caixa delimitadora (AABB) de um polígono.
 */
export function getPolygonBounds(polygon: Point2D[]) {
  if (polygon.length === 0) {
    return {
      minX: 0,
      maxX: 1,
      minZ: 0,
      maxZ: 1,
      width: 1,
      depth: 1,
      centerX: 0.5,
      centerZ: 0.5,
    };
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (const pt of polygon) {
    if (pt.x < minX) minX = pt.x;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.z < minZ) minZ = pt.z;
    if (pt.z > maxZ) maxZ = pt.z;
  }

  return {
    minX,
    maxX,
    minZ,
    maxZ,
    width: Math.max(0.2, maxX - minX),
    depth: Math.max(0.2, maxZ - minZ),
    centerX: (minX + maxX) / 2,
    centerZ: (minZ + maxZ) / 2,
  };
}

/**
 * Verifica se um ponto 2D (x, z) está dentro de um polígono usando Ray-Casting.
 */
export function isPointInPolygon(pt: Point2D, polygon: Point2D[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const zi = polygon[i].z;
    const xj = polygon[j].x;
    const zj = polygon[j].z;

    const intersect =
      zi > pt.z !== zj > pt.z &&
      pt.x < ((xj - xi) * (pt.z - zi)) / (zj - zi + 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Calcula a distância mínima entre um ponto P e um segmento de parede AB,
 * retornando também a fração normalizada t (0 a 1) ao longo da parede.
 */
export function projectPointOnSegment(
  pt: Point2D,
  start: Point2D,
  end: Point2D
): { distance: number; t: number; closest: Point2D } {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lenSq = dx * dx + dz * dz;
  if (lenSq < 1e-6) {
    const dist = Math.hypot(pt.x - start.x, pt.z - start.z);
    return { distance: dist, t: 0.5, closest: { ...start } };
  }
  let t = ((pt.x - start.x) * dx + (pt.z - start.z) * dz) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const closest = {
    x: start.x + t * dx,
    z: start.z + t * dz,
  };
  const distance = Math.hypot(pt.x - closest.x, pt.z - closest.z);
  return { distance, t, closest };
}

/**
 * Recalibra proporcionalmente todas as paredes, cômodos, aberturas e móveis
 * quando o usuário informa uma medida real conhecida na Régua de Escala.
 */
export function applyScaleCalibration(
  doc: FloorPlanDocument,
  measuredDistanceMetersInCurrentModel: number,
  userInformedRealMeters: number
): FloorPlanDocument {
  if (
    measuredDistanceMetersInCurrentModel <= 0.05 ||
    userInformedRealMeters <= 0.05
  ) {
    return doc;
  }

  const ratio = userInformedRealMeters / measuredDistanceMetersInCurrentModel;
  const newPixelsPerMeter =
    Math.round((doc.scale.pixelsPerMeter / ratio) * 100) / 100;

  const scalePoint = (p: Point2D): Point2D => ({
    x: Math.round(p.x * ratio * 100) / 100,
    z: Math.round(p.z * ratio * 100) / 100,
  });

  const updatedWalls: WallSegment[] = doc.walls.map((w) => ({
    ...w,
    start: scalePoint(w.start),
    end: scalePoint(w.end),
  }));

  const updatedRooms: RoomZone[] = doc.rooms.map((r) => {
    const scaledPoly = r.polygon.map(scalePoint);
    return {
      ...r,
      polygon: scaledPoly,
      areaSqm: computePolygonAreaSqm(scaledPoly),
    };
  });

  const updatedFurniture: FurnitureInstance[] = doc.furniture.map((f) => ({
    ...f,
    position: {
      x: Math.round(f.position.x * ratio * 100) / 100,
      y: f.position.y,
      z: Math.round(f.position.z * ratio * 100) / 100,
    },
  }));

  return {
    ...doc,
    version: doc.version + 1,
    updatedAt: new Date().toISOString(),
    scale: {
      pixelsPerMeter: newPixelsPerMeter,
      calibrated: true,
      referenceLengthMeters: userInformedRealMeters,
      confidence: 1.0,
      source: 'user_ruler',
    },
    walls: updatedWalls,
    rooms: updatedRooms,
    furniture: updatedFurniture,
  };
}

/**
 * Calcula a posição 2D no mundo de cada porta para evitar colisões na auto-decoração.
 */
function getDoorPositions(
  walls: WallSegment[],
  openings: OpeningItem[]
): Point2D[] {
  const positions: Point2D[] = [];
  for (const op of openings) {
    if (op.type !== 'door') continue;
    const wall = walls.find((w) => w.id === op.wallId);
    if (!wall) continue;
    positions.push({
      x: wall.start.x + (wall.end.x - wall.start.x) * op.offset,
      z: wall.start.z + (wall.end.z - wall.start.z) * op.offset,
    });
  }
  return positions;
}

/**
 * Verifica se duas caixas delimitadoras de móveis (com margem de circulação) colidem no plano XZ.
 */
function checkFurnitureOverlap(
  aPos: { x: number; z: number },
  aDim: { width: number; depth: number },
  aRot: number,
  bPos: { x: number; z: number },
  bDim: { width: number; depth: number },
  bRot: number,
  padding = 0.18
): boolean {
  const aSwapped = Math.abs(Math.sin(aRot)) > 0.7;
  const bSwapped = Math.abs(Math.sin(bRot)) > 0.7;

  const aHalfW = (aSwapped ? aDim.depth : aDim.width) / 2 + padding;
  const aHalfD = (aSwapped ? aDim.width : aDim.depth) / 2 + padding;
  const bHalfW = (bSwapped ? bDim.depth : bDim.width) / 2 + padding;
  const bHalfD = (bSwapped ? bDim.width : bDim.depth) / 2 + padding;

  return (
    Math.abs(aPos.x - bPos.x) < aHalfW + bHalfW &&
    Math.abs(aPos.z - bPos.z) < aHalfD + bHalfD
  );
}

/**
 * Motor de Decoração Automática Baseado em Regras Arquitetônicas (Constraint-Based Auto-Furnishing).
 * Posiciona móveis por tipo de cômodo respeitando paredes, portas e circulação mínima sem colisões.
 */
export function autoFurnishFloorPlan(
  rooms: RoomZone[],
  walls: WallSegment[],
  openings: OpeningItem[]
): FurnitureInstance[] {
  const placed: FurnitureInstance[] = [];
  const doorPoints = getDoorPositions(walls, openings);
  const wallMargin = 0.22; // Distância segura da face da parede

  const tryPlaceItem = (
    roomId: string,
    catalogId: string,
    candidatePositions: Array<{ x: number; z: number; rotY: number }>,
    roomBounds: ReturnType<typeof getPolygonBounds>,
    ignoreDoors = false
  ): FurnitureInstance | null => {
    const itemSpec = FURNITURE_CATALOG.find((c) => c.catalogId === catalogId);
    if (!itemSpec) return null;

    for (const cand of candidatePositions) {
      const swapped = Math.abs(Math.sin(cand.rotY)) > 0.7;
      const effW = swapped ? itemSpec.dimensions.depth : itemSpec.dimensions.width;
      const effD = swapped ? itemSpec.dimensions.width : itemSpec.dimensions.depth;

      // Garantir que cabe dentro dos limites internos do cômodo
      if (
        cand.x - effW / 2 < roomBounds.minX + 0.12 ||
        cand.x + effW / 2 > roomBounds.maxX - 0.12 ||
        cand.z - effD / 2 < roomBounds.minZ + 0.12 ||
        cand.z + effD / 2 > roomBounds.maxZ - 0.12
      ) {
        continue;
      }

      // Garantir que não bloqueia raio de abertura de portas (0.85m)
      if (!ignoreDoors) {
        const blocksDoor = doorPoints.some(
          (dp) =>
            Math.hypot(dp.x - cand.x, dp.z - cand.z) <
            Math.max(effW, effD) * 0.5 + 0.65
        );
        if (blocksDoor) continue;
      }

      // Garantir ausência de colisão com móveis já posicionados
      const collides = placed.some((existing) =>
        checkFurnitureOverlap(
          cand,
          itemSpec.dimensions,
          cand.rotY,
          existing.position,
          existing.dimensions,
          existing.rotationY,
          0.14
        )
      );
      if (collides) continue;

      const instance: FurnitureInstance = {
        id: `furn_${roomId}_${catalogId}_${placed.length + 1}`,
        roomId,
        catalogId: itemSpec.catalogId,
        name: itemSpec.name,
        position: {
          x: Math.round(cand.x * 100) / 100,
          y: 0,
          z: Math.round(cand.z * 100) / 100,
        },
        rotationY: cand.rotY,
        dimensions: { ...itemSpec.dimensions },
      };

      placed.push(instance);
      return instance;
    }
    return null;
  };

  for (const room of rooms) {
    const b = getPolygonBounds(room.polygon);
    if (b.width < 1.2 || b.depth < 1.2) continue;

    if (room.type === 'living_room') {
      // Sofá encostado na parede superior ou esquerda
      const sofa = tryPlaceItem(
        room.id,
        'sofa_3_seater',
        [
          { x: b.centerX, z: b.minZ + 0.55 + wallMargin, rotY: 0 },
          { x: b.minX + 0.55 + wallMargin, z: b.centerZ, rotY: Math.PI / 2 },
          { x: b.centerX, z: b.maxZ - 0.55 - wallMargin, rotY: Math.PI },
        ],
        b
      );

      // Rack de TV na parede oposta ao sofá
      tryPlaceItem(
        room.id,
        'tv_console',
        [
          { x: b.centerX, z: b.maxZ - 0.32 - wallMargin, rotY: Math.PI },
          { x: b.maxX - 0.32 - wallMargin, z: b.centerZ, rotY: -Math.PI / 2 },
          { x: b.centerX, z: b.minZ + 0.32 + wallMargin, rotY: 0 },
        ],
        b
      );

      // Mesa de centro entre o sofá e a TV
      if (sofa) {
        tryPlaceItem(
          room.id,
          'coffee_table',
          [
            { x: b.centerX, z: b.centerZ, rotY: sofa.rotationY },
            { x: b.centerX, z: b.centerZ + 0.2, rotY: sofa.rotationY },
          ],
          b,
          true
        );
      }

      // Se a sala for ampla (> 16 m²), adiciona mesa de jantar ou poltrona
      if (room.areaSqm >= 15) {
        tryPlaceItem(
          room.id,
          'dining_table_4',
          [
            { x: b.maxX - 1.1, z: b.minZ + 1.1, rotY: 0 },
            { x: b.minX + 1.1, z: b.maxZ - 1.1, rotY: 0 },
          ],
          b
        );
      } else {
        tryPlaceItem(
          room.id,
          'lounge_armchair',
          [
            { x: b.maxX - 0.65, z: b.centerZ, rotY: -Math.PI / 2 },
            { x: b.minX + 0.65, z: b.centerZ, rotY: Math.PI / 2 },
          ],
          b
        );
      }

      // Planta decorativa no canto
      tryPlaceItem(
        room.id,
        'indoor_plant',
        [
          { x: b.minX + 0.45, z: b.minZ + 0.45, rotY: 0 },
          { x: b.maxX - 0.45, z: b.maxZ - 0.45, rotY: 0 },
        ],
        b
      );
    } else if (room.type === 'dining_room') {
      tryPlaceItem(
        room.id,
        'dining_table_4',
        [
          { x: b.centerX, z: b.centerZ, rotY: 0 },
          { x: b.centerX, z: b.centerZ, rotY: Math.PI / 2 },
        ],
        b
      );
      tryPlaceItem(
        room.id,
        'indoor_plant',
        [{ x: b.maxX - 0.45, z: b.minZ + 0.45, rotY: 0 }],
        b
      );
    } else if (room.type === 'bedroom') {
      // Cama Queen centralizada na parede principal
      const bed = tryPlaceItem(
        room.id,
        'queen_bed',
        [
          { x: b.centerX, z: b.minZ + 1.08 + wallMargin, rotY: 0 },
          { x: b.minX + 1.08 + wallMargin, z: b.centerZ, rotY: Math.PI / 2 },
          { x: b.centerX, z: b.maxZ - 1.08 - wallMargin, rotY: Math.PI },
        ],
        b,
        true
      );

      // Guarda-roupa na parede lateral ou oposta
      tryPlaceItem(
        room.id,
        'wardrobe_sliding',
        [
          { x: b.centerX, z: b.maxZ - 0.35 - wallMargin, rotY: Math.PI },
          { x: b.maxX - 0.35 - wallMargin, z: b.centerZ, rotY: -Math.PI / 2 },
          { x: b.minX + 0.35 + wallMargin, z: b.centerZ, rotY: Math.PI / 2 },
        ],
        b
      );

      // Mesa de cabeceira ao lado da cama
      if (bed) {
        tryPlaceItem(
          room.id,
          'nightstand',
          [
            {
              x: bed.position.x + 1.18,
              z: b.minZ + 0.32 + wallMargin,
              rotY: 0,
            },
            {
              x: bed.position.x - 1.18,
              z: b.minZ + 0.32 + wallMargin,
              rotY: 0,
            },
          ],
          b,
          true
        );
      }
    } else if (room.type === 'kitchen') {
      // Bancada de pia
      tryPlaceItem(
        room.id,
        'kitchen_counter_sink',
        [
          { x: b.centerX, z: b.minZ + 0.36 + wallMargin, rotY: 0 },
          { x: b.minX + 0.36 + wallMargin, z: b.centerZ, rotY: Math.PI / 2 },
          { x: b.centerX, z: b.maxZ - 0.36 - wallMargin, rotY: Math.PI },
        ],
        b,
        true
      );

      // Geladeira Duplex
      tryPlaceItem(
        room.id,
        'refrigerator_duplex',
        [
          { x: b.maxX - 0.5, z: b.minZ + 0.45 + wallMargin, rotY: 0 },
          { x: b.minX + 0.5, z: b.maxZ - 0.45 - wallMargin, rotY: Math.PI },
          { x: b.maxX - 0.45 - wallMargin, z: b.maxZ - 0.5, rotY: -Math.PI / 2 },
        ],
        b,
        true
      );

      // Fogão
      tryPlaceItem(
        room.id,
        'stove_oven',
        [
          { x: b.minX + 0.55, z: b.minZ + 0.36 + wallMargin, rotY: 0 },
          { x: b.centerX, z: b.maxZ - 0.36 - wallMargin, rotY: Math.PI },
        ],
        b,
        true
      );
    } else if (room.type === 'bathroom') {
      // Box de banho no fundo do banheiro
      tryPlaceItem(
        room.id,
        'shower_box',
        [
          { x: b.maxX - 0.62, z: b.minZ + 0.52, rotY: 0 },
          { x: b.minX + 0.62, z: b.minZ + 0.52, rotY: 0 },
        ],
        b,
        true
      );

      // Bancada com cuba e espelho
      tryPlaceItem(
        room.id,
        'bathroom_vanity',
        [
          { x: b.minX + 0.55, z: b.maxZ - 0.32 - wallMargin, rotY: Math.PI },
          { x: b.centerX, z: b.minZ + 0.32 + wallMargin, rotY: 0 },
        ],
        b,
        true
      );

      // Vaso sanitário
      tryPlaceItem(
        room.id,
        'toilet_modern',
        [
          { x: b.centerX, z: b.maxZ - 0.38 - wallMargin, rotY: Math.PI },
          { x: b.maxX - 0.38 - wallMargin, z: b.centerZ, rotY: -Math.PI / 2 },
        ],
        b,
        true
      );
    } else if (room.type === 'office') {
      tryPlaceItem(
        room.id,
        'office_desk',
        [
          { x: b.centerX, z: b.minZ + 0.45 + wallMargin, rotY: 0 },
          { x: b.minX + 0.45 + wallMargin, z: b.centerZ, rotY: Math.PI / 2 },
        ],
        b,
        true
      );
      tryPlaceItem(
        room.id,
        'lounge_armchair',
        [{ x: b.maxX - 0.55, z: b.maxZ - 0.55, rotY: Math.PI }],
        b
      );
    } else if (room.type === 'balcony') {
      tryPlaceItem(
        room.id,
        'lounge_armchair',
        [{ x: b.centerX - 0.4, z: b.centerZ, rotY: 0 }],
        b,
        true
      );
      tryPlaceItem(
        room.id,
        'indoor_plant',
        [
          { x: b.maxX - 0.4, z: b.centerZ, rotY: 0 },
          { x: b.minX + 0.4, z: b.centerZ, rotY: 0 },
        ],
        b,
        true
      );
    }
  }

  return placed;
}

/**
 * Pipeline de Pré-processamento de Imagem em HTML5 Canvas.
 * Aplica rotação, correção de perspectiva/trapézio, ganho de contraste,
 * remoção de ruído e binarização opcional antes da leitura por visão computacional.
 */
export function processFloorPlanImageToCanvas(
  sourceImg: HTMLImageElement | HTMLCanvasElement,
  settings: PreprocessSettings,
  targetCanvas: HTMLCanvasElement
): string {
  const ctx = targetCanvas.getContext('2d');
  if (!ctx) return '';

  const maxDim = 1100;
  const srcW = sourceImg.width || 800;
  const srcH = sourceImg.height || 600;
  const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
  const w = Math.round(srcW * scale);
  const h = Math.round(srcH * scale);

  targetCanvas.width = w;
  targetCanvas.height = h;

  // Fundo limpo branco técnico
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate((settings.rotationDeg * Math.PI) / 180);

  // Simulação de correção de perspectiva afim por faixas horizontais/verticais
  const skewX = settings.perspectiveX * 0.008;
  const skewY = settings.perspectiveY * 0.008;
  ctx.transform(1, skewY, skewX, 1, 0, 0);

  ctx.drawImage(sourceImg, -w / 2, -h / 2, w, h);
  ctx.restore();

  // Processamento de pixels (contraste, redução de ruído e limiarização)
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;
  const contrastFactor =
    (259 * (settings.contrast + 255)) / (255 * (259 - settings.contrast));

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    // Ganho de contraste
    r = Math.min(255, Math.max(0, contrastFactor * (r - 128) + 128));
    g = Math.min(255, Math.max(0, contrastFactor * (g - 128) + 128));
    b = Math.min(255, Math.max(0, contrastFactor * (b - 128) + 128));

    const luma = 0.299 * r + 0.587 * g + 0.114 * b;

    // Remoção de ruído leve de fundo (clareia cinzas claros de fotos de papel)
    const denoiseCutoff = 242 - settings.denoiseLevel * 12;
    if (luma > denoiseCutoff) {
      r = 255;
      g = 255;
      b = 255;
    }

    if (settings.thresholdMode) {
      const bin = luma < 165 ? 20 : 255;
      data[i] = bin;
      data[i + 1] = bin;
      data[i + 2] = bin;
    } else {
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return targetCanvas.toDataURL('image/jpeg', 0.88);
}

/**
 * Renderiza uma imagem de planta baixa arquitetônica técnica (blueprint) a partir de um FloorPlanDocument
 * para servir como base visual de fundo nos projetos de exemplo ou exportação 2D.
 */
export function generateBlueprintDataUrlFromDocument(
  doc: FloorPlanDocument
): string {
  if (typeof document === 'undefined') return '';
  const canvas = document.createElement('canvas');
  const ppm = doc.scale.pixelsPerMeter || 65;

  let maxX = 8;
  let maxZ = 8;
  for (const w of doc.walls) {
    maxX = Math.max(maxX, w.start.x, w.end.x);
    maxZ = Math.max(maxZ, w.start.z, w.end.z);
  }

  const marginPx = 60;
  canvas.width = Math.round(maxX * ppm + marginPx * 2);
  canvas.height = Math.round(maxZ * ppm + marginPx * 2);

  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Papel arquitetônico creme claro
  ctx.fillStyle = '#F9F8F3';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Malha milimetrada sutil
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.05)';
  ctx.lineWidth = 1;
  for (let x = 0; x < canvas.width; x += ppm / 2) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y < canvas.height; y += ppm / 2) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  // Desenhar polígonos de cômodos e textos de cota
  for (const room of doc.rooms) {
    if (room.polygon.length < 3) continue;
    ctx.beginPath();
    room.polygon.forEach((pt, idx) => {
      const px = marginPx + pt.x * ppm;
      const py = marginPx + pt.z * ppm;
      if (idx === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.fillStyle = 'rgba(226, 232, 240, 0.35)';
    ctx.fill();

    const b = getPolygonBounds(room.polygon);
    const cx = marginPx + b.centerX * ppm;
    const cy = marginPx + b.centerZ * ppm;

    ctx.fillStyle = '#1E293B';
    ctx.font = '600 13px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(room.name.toUpperCase(), cx, cy - 6);

    ctx.fillStyle = '#475569';
    ctx.font = '500 11px "JetBrains Mono", monospace';
    ctx.fillText(
      `${b.width.toFixed(2)}m × ${b.depth.toFixed(2)}m (${room.areaSqm.toFixed(1)} m²)`,
      cx,
      cy + 12
    );
  }

  // Desenhar paredes técnicas
  for (const wall of doc.walls) {
    const x1 = marginPx + wall.start.x * ppm;
    const y1 = marginPx + wall.start.z * ppm;
    const x2 = marginPx + wall.end.x * ppm;
    const y2 = marginPx + wall.end.z * ppm;

    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = Math.max(4, wall.thickness * ppm);
    ctx.lineCap = 'square';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  return canvas.toDataURL('image/png');
}
