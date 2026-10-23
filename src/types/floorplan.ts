/**
 * Definições de tipos da estrutura intermediária JSON (FloorPlanDocument)
 * Fonte única de verdade para o Editor 2D, Gerador 3D Three.js e API de Visão.
 */

export type RoomType =
  | 'living_room'
  | 'bedroom'
  | 'kitchen'
  | 'bathroom'
  | 'dining_room'
  | 'office'
  | 'balcony'
  | 'hallway';

export type DecorStyleId =
  | 'modern'
  | 'minimalist'
  | 'industrial'
  | 'classic'
  | 'scandinavian'
  | 'rustic';

export type FloorMaterialId =
  | 'oak_herringbone'
  | 'warm_wood_planks'
  | 'porcelain_Beige'
  | 'carrara_marble'
  | 'polished_concrete'
  | 'terracotta_rustic'
  | 'ceramic_grid';

export type LightingPresetId = 'morning' | 'noon' | 'golden_hour' | 'night';

export type QualityProfileId = 'low' | 'medium' | 'high';

export type CameraModeId = 'orbit' | 'dollhouse' | 'first_person' | 'guided_tour';

export interface Point2D {
  x: number; // Coordenada X em metros no espaço do projeto
  z: number; // Coordenada Z em metros no espaço do projeto
}

export interface ScaleConfig {
  pixelsPerMeter: number; // Proporção calculada entre imagem original e metros reais
  calibrated: boolean; // Indica se foi confirmada por cota lida ou régua do usuário
  referenceLengthMeters: number; // Medida de referência utilizada na calibração
  confidence: number; // Confiança da detecção (0 a 1)
  source: 'ocr_dimension' | 'user_ruler' | 'ai_estimated';
}

export interface WallSegment {
  id: string;
  start: Point2D;
  end: Point2D;
  thickness: number; // Espessura em metros (padrão 0.15 m)
  height: number; // Pé-direito em metros (padrão 2.70 m)
  isExterior: boolean;
}

export interface OpeningItem {
  id: string;
  wallId: string;
  type: 'door' | 'window';
  offset: number; // Posição normalizada ao longo da parede (0.1 a 0.9)
  width: number; // Largura em metros (ex: porta 0.80m, janela 1.50m)
  height: number; // Altura em metros (ex: porta 2.10m, janela 1.20m)
  elevation: number; // Peitoril em metros (0.0m para porta, 0.90m para janela)
  swing?: 'left' | 'right';
}

export interface RoomZone {
  id: string;
  name: string;
  type: RoomType;
  polygon: Point2D[];
  areaSqm: number;
  floorMaterial: FloorMaterialId;
  wallColor: string;
  detectedText?: string; // Rótulo/cota original lido via OCR
}

export interface FurnitureCatalogItem {
  catalogId: string;
  name: string;
  category: RoomType;
  dimensions: {
    width: number;
    depth: number;
    height: number;
  };
  clearanceRadius: number; // Espaço mínimo de circulação em metros
}

export interface FurnitureInstance {
  id: string;
  roomId: string;
  catalogId: string;
  name: string;
  position: {
    x: number;
    y: number;
    z: number;
  };
  rotationY: number; // Rotação em radianos ao redor do eixo Y
  dimensions: {
    width: number;
    depth: number;
    height: number;
  };
}

export interface BrandingConfig {
  companyName: string;
  primaryColor: string;
  agentName: string;
  agentRegistry: string; // Ex: CRECI 142.890-F
  agentPhone: string;
  logoText: string;
}

export interface ProjectSettings {
  ceilingHeight: number;
  defaultWallThickness: number;
  decorStyle: DecorStyleId;
  lightingPreset: LightingPresetId;
  qualityProfile: QualityProfileId;
  showRoof: boolean;
  showDimensions2D: boolean;
  branding: BrandingConfig;
}

export interface FloorPlanDocument {
  id: string;
  name: string;
  description: string;
  version: number;
  updatedAt: string;
  sourceImageType?: 'blueprint' | 'hand_drawn' | 'render_3d' | 'preset';
  sourceImageDataUrl?: string;
  scale: ScaleConfig;
  settings: ProjectSettings;
  walls: WallSegment[];
  openings: OpeningItem[];
  rooms: RoomZone[];
  furniture: FurnitureInstance[];
}

export interface PreprocessSettings {
  rotationDeg: number;
  perspectiveX: number;
  perspectiveY: number;
  contrast: number;
  denoiseLevel: number;
  thresholdMode: boolean;
}

export interface StyleDefinition {
  id: DecorStyleId;
  name: string;
  tagline: string;
  wallColor: string;
  accentWallColor: string;
  baseboardColor: string;
  livingFloor: FloorMaterialId;
  bedroomFloor: FloorMaterialId;
  wetFloor: FloorMaterialId;
  woodColor: string;
  woodRoughness: number;
  fabricPrimaryColor: string;
  fabricSecondaryColor: string;
  metalColor: string;
  metalness: number;
  metalRoughness: number;
  stoneColor: string;
  rugColor: string;
}

export interface AnalysisResponse {
  success: boolean;
  legible: boolean;
  sourceType: 'blueprint' | 'hand_drawn' | 'render_3d';
  warnings: string[];
  detectedDimensions: string[];
  processingTimeMs: number;
  document: FloorPlanDocument;
}

export interface ProjectVersionSnapshot {
  version: number;
  timestamp: string;
  label: string;
  document: FloorPlanDocument;
}

export interface ObservabilityMetrics {
  totalAnalyses: number;
  successfulAnalyses: number;
  failedOrIllegible: number;
  averageProcessingMs: number;
  recentLogs: Array<{
    id: string;
    timestamp: string;
    action: string;
    durationMs: number;
    status: 'ok' | 'warning' | 'error';
    details: string;
  }>;
}
