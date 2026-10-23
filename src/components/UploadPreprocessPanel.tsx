import React, { useEffect, useRef, useState } from 'react';
import {
  FloorPlanDocument,
  OpeningItem,
  PreprocessSettings,
  RoomType,
  RoomZone,
  WallSegment,
} from '../types/floorplan';
import {
  autoFurnishFloorPlan,
  computePolygonAreaSqm,
  processFloorPlanImageToCanvas,
} from '../utils/geometryAndAutoDecor';
import {
  AlertCircle,
  ArrowRight,
  Camera,
  CheckCircle2,
  FileImage,
  FlipHorizontal,
  Loader2,
  RotateCcw,
  RotateCw,
  Sliders,
  Sparkles,
  Upload,
} from 'lucide-react';

interface UploadPreprocessPanelProps {
  presets: FloorPlanDocument[];
  currentDocument: FloorPlanDocument;
  onSelectPreset: (doc: FloorPlanDocument) => void;
  onAnalysisComplete: (
    doc: FloorPlanDocument,
    detectedDimensions: string[],
    warnings: string[]
  ) => void;
  onSkipToManual2D: () => void;
}

export const UploadPreprocessPanel: React.FC<UploadPreprocessPanelProps> = ({
  presets,
  currentDocument,
  onSelectPreset,
  onAnalysisComplete,
  onSkipToManual2D,
}) => {
  const [sourceImageElement, setSourceImageElement] =
    useState<HTMLImageElement | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string>(
    'Residencial-Vila-Madalena-48m2.png'
  );
  const [preprocess, setPreprocess] = useState<PreprocessSettings>({
    rotationDeg: 0,
    perspectiveX: 0,
    perspectiveY: 0,
    contrast: 22,
    denoiseLevel: 2,
    thresholdMode: false,
  });

  const [processedDataUrl, setProcessedDataUrl] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisStepText, setAnalysisStepText] = useState<string>('');
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Estado da Câmera do Celular / Webcam
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Carrega a imagem da planta atual no preview inicial
  useEffect(() => {
    if (!currentDocument.sourceImageDataUrl) return;
    const img = new Image();
    img.onload = () => {
      setSourceImageElement(img);
    };
    img.src = currentDocument.sourceImageDataUrl;
  }, [currentDocument.id]);

  // Atualiza o canvas de pré-processamento sempre que os filtros mudam
  useEffect(() => {
    if (!sourceImageElement || !previewCanvasRef.current) return;
    const outUrl = processFloorPlanImageToCanvas(
      sourceImageElement,
      preprocess,
      previewCanvasRef.current
    );
    setProcessedDataUrl(outUrl);
  }, [sourceImageElement, preprocess]);

  // Leitura de arquivo JPG, PNG ou PDF enviado pelo usuário
  const handleFileSelected = (file: File) => {
    setAnalysisError(null);
    setUploadedFileName(file.name);

    if (file.type === 'application/pdf') {
      // Para PDFs sem rasterizador externo, gera aviso amigável e carrega canvas base para edição/análise
      const reader = new FileReader();
      reader.onload = () => {
        setAnalysisError(
          'Arquivo PDF recebido. Se desejar máxima nitidez de cotas, exporte a folha da planta em PNG/JPG ou clique em "Interpretar Planta com IA" para continuar.'
        );
      };
      reader.readAsDataURL(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      if (!dataUrl) return;
      const img = new Image();
      img.onload = () => {
        setSourceImageElement(img);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  // Captura de foto da planta pela câmera do celular/dispositivo
  const handleStartCamera = async () => {
    setAnalysisError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      setCameraActive(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
      }, 100);
    } catch {
      setAnalysisError(
        'Não foi possível acessar a câmera neste navegador. Envie uma foto ou imagem da planta pelo botão de upload.'
      );
    }
  };

  const handleCaptureCameraFrame = () => {
    if (!videoRef.current) return;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = videoRef.current.videoWidth || 800;
    tempCanvas.height = videoRef.current.videoHeight || 600;
    const ctx = tempCanvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0);
      const dataUrl = tempCanvas.toDataURL('image/jpeg', 0.92);
      const img = new Image();
      img.onload = () => setSourceImageElement(img);
      img.src = dataUrl;
    }
    const stream = videoRef.current.srcObject as MediaStream | null;
    stream?.getTracks().forEach((t) => t.stop());
    setCameraActive(false);
  };

  // Executa o Pipeline Híbrido: Pré-processamento + Gemini Vision (gemini-4-argon) + Construção Topológica
  const handleRunHybridAnalysis = async () => {
    if (!processedDataUrl) return;
    setIsAnalyzing(true);
    setAnalysisError(null);
    setAnalysisStepText(
      '1/3 Corrigindo perspectiva, contraste e isolando paredes estruturais...'
    );

    try {
      setTimeout(() => {
        setAnalysisStepText(
          '2/3 Extraindo paredes, portas, janelas, cotas (OCR) e cômodos com Gemini 4 Argon...'
        );
      }, 900);

      const response = await fetch('/api/floorplan/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: processedDataUrl,
          mimeType: 'image/jpeg',
          fileName: uploadedFileName,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success || !data.analysis) {
        throw new Error(
          data.error || 'Não foi possível concluir a leitura automática.'
        );
      }

      setAnalysisStepText(
        '3/3 Gerando malha vetorial 2D e posicionando mobiliário sem colisões...'
      );

      const parsed = data.analysis;

      // Converte paredes retornadas pelo modelo multimodal para WallSegment[]
      const walls: WallSegment[] = Array.isArray(parsed.walls) && parsed.walls.length >= 4
        ? parsed.walls.map((w: Record<string, unknown>, idx: number) => ({
            id: String(w.id || `w_${idx + 1}`),
            start: {
              x: Math.max(0, Number(w.startX) || 0),
              z: Math.max(0, Number(w.startZ) || 0),
            },
            end: {
              x: Math.max(0, Number(w.endX) || 4),
              z: Math.max(0, Number(w.endZ) || 4),
            },
            thickness: Math.max(0.12, Math.min(0.3, Number(w.thickness) || 0.15)),
            height: 2.7,
            isExterior: Boolean(w.isExterior),
          }))
        : currentDocument.walls;

      // Converte cômodos detectados para RoomZone[]
      const allowedTypes: RoomType[] = [
        'living_room',
        'bedroom',
        'kitchen',
        'bathroom',
        'dining_room',
        'office',
        'balcony',
        'hallway',
      ];

      const rooms: RoomZone[] =
        Array.isArray(parsed.rooms) && parsed.rooms.length > 0
          ? parsed.rooms.map((r: Record<string, unknown>, idx: number) => {
              const minX = Math.max(0, Number(r.minX) || 0);
              const minZ = Math.max(0, Number(r.minZ) || 0);
              const maxX = Math.max(minX + 1.8, Number(r.maxX) || minX + 3.5);
              const maxZ = Math.max(minZ + 1.8, Number(r.maxZ) || minZ + 3.2);
              const poly = [
                { x: minX, z: minZ },
                { x: maxX, z: minZ },
                { x: maxX, z: maxZ },
                { x: minX, z: maxZ },
              ];
              const rawType = String(r.type || 'living_room') as RoomType;
              const rType: RoomType = allowedTypes.includes(rawType)
                ? rawType
                : 'living_room';

              return {
                id: String(r.id || `room_${idx + 1}`),
                name: String(r.name || `Ambiente ${idx + 1}`),
                type: rType,
                polygon: poly,
                areaSqm: computePolygonAreaSqm(poly),
                floorMaterial:
                  rType === 'kitchen' || rType === 'bathroom'
                    ? 'porcelain_Beige'
                    : 'oak_herringbone',
                wallColor: '#F7F6F2',
                detectedText: String(r.detectedText || ''),
              };
            })
          : currentDocument.rooms;

      // Converte aberturas (portas e janelas) garantindo que referenciem uma parede existente
      const validWallIds = new Set(walls.map((w) => w.id));
      const openings: OpeningItem[] =
        Array.isArray(parsed.openings) && parsed.openings.length > 0
          ? parsed.openings
              .filter((op: Record<string, unknown>) =>
                validWallIds.has(String(op.wallId))
              )
              .map((op: Record<string, unknown>, idx: number) => {
                const isDoor = String(op.type) === 'door';
                return {
                  id: String(op.id || `op_${idx + 1}`),
                  wallId: String(op.wallId),
                  type: isDoor ? 'door' : 'window',
                  offset: Math.max(0.15, Math.min(0.85, Number(op.offset) || 0.5)),
                  width: Math.max(
                    0.6,
                    Math.min(2.6, Number(op.width) || (isDoor ? 0.85 : 1.5))
                  ),
                  height: isDoor ? 2.1 : 1.25,
                  elevation: isDoor ? 0 : 0.85,
                  swing: 'left',
                };
              })
          : currentDocument.openings;

      const autoFurniture = autoFurnishFloorPlan(rooms, walls, openings);

      const newDoc: FloorPlanDocument = {
        ...currentDocument,
        id: `proj_${Date.now()}`,
        name: String(parsed.projectName || uploadedFileName.replace(/\.[^.]+$/, '')),
        version: 1,
        updatedAt: new Date().toISOString(),
        sourceImageType:
          parsed.sourceType === 'hand_drawn' || parsed.sourceType === 'render_3d'
            ? parsed.sourceType
            : 'blueprint',
        sourceImageDataUrl: processedDataUrl,
        scale: {
          pixelsPerMeter: Math.max(
            20,
            Number(parsed.scale?.pixelsPerMeter) || 62
          ),
          calibrated: Boolean(parsed.scale?.calibrated),
          referenceLengthMeters:
            Number(parsed.scale?.referenceLengthMeters) || 4.0,
          confidence: Math.max(
            0.5,
            Math.min(1, Number(parsed.scale?.confidence) || 0.85)
          ),
          source: parsed.scale?.calibrated ? 'ocr_dimension' : 'ai_estimated',
        },
        walls,
        openings,
        rooms,
        furniture: autoFurniture,
      };

      const warningsList: string[] = Array.isArray(parsed.warnings)
        ? parsed.warnings.map(String)
        : [];
      if (!parsed.legible) {
        warningsList.unshift(
          'A imagem enviada possui baixa legibilidade ou perspectiva acentuada. Verifique as paredes e calibre a escala no Editor 2D.'
        );
      }

      onAnalysisComplete(
        newDoc,
        Array.isArray(parsed.detectedDimensions)
          ? parsed.detectedDimensions.map(String)
          : [],
        warningsList
      );
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Erro ao interpretar a planta baixa.';
      setAnalysisError(
        `${msg} Você pode ajustar o contraste/rotação ou prosseguir diretamente para o Editor 2D Assistido.`
      );
    } finally {
      setIsAnalyzing(false);
      setAnalysisStepText('');
    }
  };

  return (
    <div className="max-w-[1380px] mx-auto px-6 py-8">
      {/* Cabeçalho Editorial da Etapa 1 */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-white/10">
        <div>
          <div className="text-xs font-medium text-amber-400 mb-1">
            01. Recepção & Pré-Processamento Óptico da Planta Baixa
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
            Envie a planta do imóvel ou escolha um modelo de referência
          </h1>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={onSkipToManual2D}
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-medium transition-colors whitespace-nowrap shrink-0"
          >
            Ir Direto ao Editor 2D
          </button>
          <button
            onClick={handleRunHybridAnalysis}
            disabled={isAnalyzing}
            className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 font-semibold rounded-xl text-xs flex items-center gap-2 shadow-lg transition-colors whitespace-nowrap shrink-0"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Analisando com Gemini 4 Argon...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Interpretar Planta Automaticamente</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Status de Processamento ou Tratamento de Falhas Claras */}
      {isAnalyzing && (
        <div className="mt-5 bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-center gap-3">
          <Loader2 className="w-5 h-5 text-amber-400 animate-spin shrink-0" />
          <div>
            <div className="text-sm font-semibold text-white">
              Pipeline Híbrido de Visão em Execução
            </div>
            <div className="text-xs text-amber-200 mt-0.5">
              {analysisStepText}
            </div>
          </div>
        </div>
      )}

      {analysisError && (
        <div className="mt-5 bg-rose-950/50 border border-rose-500/40 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-semibold text-white">
                Aviso na Leitura da Imagem
              </div>
              <div className="text-xs text-rose-200 mt-0.5">{analysisError}</div>
            </div>
          </div>
          <button
            onClick={onSkipToManual2D}
            className="px-3.5 py-2 bg-rose-500 hover:bg-rose-400 text-slate-950 font-semibold rounded-lg text-xs whitespace-nowrap shrink-0"
          >
            Abrir Desenho Manual 2D
          </button>
        </div>
      )}

      {/* Grid Principal: Upload e Plantas de Exemplo (Esquerda) + Pré-processamento Óptico (Direita) */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Coluna Esquerda (5 cols): Upload Drag & Drop, Câmera e 3 Plantas de Exemplo */}
        <div className="lg:col-span-5 flex flex-col gap-5">
          {/* Zona de Upload */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files?.[0];
              if (file) handleFileSelected(file);
            }}
            className="bg-[#121820] border-2 border-dashed border-white/15 hover:border-amber-500/60 rounded-2xl p-6 text-center transition-colors"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,application/pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelected(file);
              }}
            />
            <div className="w-12 h-12 rounded-2xl bg-amber-500/15 text-amber-400 flex items-center justify-center mx-auto mb-3">
              <Upload className="w-6 h-6" />
            </div>
            <h2 className="text-base font-semibold text-white">
              Arraste sua planta baixa aqui
            </h2>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              Suporta JPG, PNG, PDF vetorial, plantas humanizadas, rascunhos à mão ou prints de render 3D.
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold rounded-xl text-xs flex items-center gap-1.5 transition-colors whitespace-nowrap"
              >
                <FileImage className="w-3.5 h-3.5" />
                <span>Selecionar Arquivo</span>
              </button>
              <button
                onClick={handleStartCamera}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap"
              >
                <Camera className="w-3.5 h-3.5 text-sky-400" />
                <span>Usar Câmera do Celular</span>
              </button>
            </div>

            {cameraActive && (
              <div className="mt-4 bg-black rounded-xl overflow-hidden border border-white/15 p-2">
                <video
                  ref={videoRef}
                  className="w-full h-48 object-cover rounded-lg"
                  playsInline
                  muted
                />
                <button
                  onClick={handleCaptureCameraFrame}
                  className="mt-2 w-full py-2 bg-emerald-500 text-slate-950 font-semibold rounded-lg text-xs"
                >
                  Capturar Foto da Planta
                </button>
              </div>
            )}
          </div>

          {/* Biblioteca de Plantas Baixas Prontas para Demonstração */}
          <div className="bg-[#121820] border border-white/10 rounded-2xl p-5 flex-1">
            <div className="text-xs font-medium text-slate-400 mb-3">
              Plantas de Exemplo Calibradas (Clique para Carregar)
            </div>
            <div className="space-y-2.5">
              {presets.map((preset) => {
                const isSelected = preset.id === currentDocument.id;
                const totalArea = preset.rooms.reduce(
                  (acc, r) => acc + r.areaSqm,
                  0
                );
                return (
                  <button
                    key={preset.id}
                    onClick={() => {
                      onSelectPreset(preset);
                      setUploadedFileName(`${preset.id}.png`);
                    }}
                    className={`w-full p-3.5 rounded-xl border text-left transition-all flex items-center justify-between gap-3 ${
                      isSelected
                        ? 'bg-amber-500/12 border-amber-500 text-white'
                        : 'bg-[#0B0F15] border-white/8 text-slate-300 hover:border-white/20'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-white truncate">
                        {preset.name}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                        {preset.description}
                      </div>
                      <div className="mt-1.5 flex items-center gap-2 text-[11px] font-mono text-amber-400 tabular-nums">
                        <span>{totalArea.toFixed(1)} m²</span>
                        <span aria-hidden="true">·</span>
                        <span>{preset.rooms.length} cômodos</span>
                        <span aria-hidden="true">·</span>
                        <span>{preset.furniture.length} móveis</span>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Coluna Direita (7 cols): Estúdio de Pré-Processamento de Imagem (Perspectiva, Rotação, Contraste, Ruído) */}
        <div className="lg:col-span-7 bg-[#121820] border border-white/10 rounded-2xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-amber-400" />
                <h2 className="text-sm font-semibold text-white">
                  Pré-Processamento & Correção Óptica da Planta
                </h2>
              </div>
              <button
                onClick={() =>
                  setPreprocess({
                    rotationDeg: 0,
                    perspectiveX: 0,
                    perspectiveY: 0,
                    contrast: 22,
                    denoiseLevel: 2,
                    thresholdMode: false,
                  })
                }
                className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restaurar Padrão</span>
              </button>
            </div>

            {/* Canvas de Visualização da Planta Pré-processada */}
            <div className="relative w-full h-72 sm:h-80 bg-[#0B0F15] border border-white/10 rounded-xl overflow-hidden flex items-center justify-center p-3">
              <canvas
                ref={previewCanvasRef}
                className="max-w-full max-h-full object-contain rounded shadow"
              />
              <div className="absolute bottom-3 right-3 bg-[#121820]/90 border border-white/10 rounded-lg px-2.5 py-1 text-[11px] font-mono text-slate-300">
                {uploadedFileName}
              </div>
            </div>
          </div>

          {/* Controles de Ajuste de Perspectiva, Rotação, Contraste e Ruído */}
          <div className="mt-5 pt-4 border-t border-white/10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-400">Rotação / Alinhamento</span>
                <span className="font-mono text-white tabular-nums">
                  {preprocess.rotationDeg}°
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="range"
                  min={-45}
                  max={45}
                  step={1}
                  value={preprocess.rotationDeg}
                  onChange={(e) =>
                    setPreprocess((p) => ({
                      ...p,
                      rotationDeg: parseInt(e.target.value, 10),
                    }))
                  }
                  className="flex-1 accent-amber-500"
                />
                <button
                  onClick={() =>
                    setPreprocess((p) => ({
                      ...p,
                      rotationDeg: (p.rotationDeg + 90) % 360,
                    }))
                  }
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-200"
                  title="Girar +90°"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-400">Correção Perspectiva X/Y</span>
                <span className="font-mono text-white tabular-nums">
                  {preprocess.perspectiveX} / {preprocess.perspectiveY}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={-20}
                  max={20}
                  step={1}
                  value={preprocess.perspectiveX}
                  onChange={(e) =>
                    setPreprocess((p) => ({
                      ...p,
                      perspectiveX: parseInt(e.target.value, 10),
                    }))
                  }
                  className="w-1/2 accent-amber-500"
                />
                <input
                  type="range"
                  min={-20}
                  max={20}
                  step={1}
                  value={preprocess.perspectiveY}
                  onChange={(e) =>
                    setPreprocess((p) => ({
                      ...p,
                      perspectiveY: parseInt(e.target.value, 10),
                    }))
                  }
                  className="w-1/2 accent-sky-500"
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-400">Contraste & Limpeza</span>
                <span className="font-mono text-white tabular-nums">
                  +{preprocess.contrast}%
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={-20}
                  max={80}
                  step={2}
                  value={preprocess.contrast}
                  onChange={(e) =>
                    setPreprocess((p) => ({
                      ...p,
                      contrast: parseInt(e.target.value, 10),
                    }))
                  }
                  className="flex-1 accent-amber-500"
                />
                <button
                  onClick={() =>
                    setPreprocess((p) => ({
                      ...p,
                      thresholdMode: !p.thresholdMode,
                    }))
                  }
                  className={`px-2 py-1 rounded text-[11px] font-medium whitespace-nowrap ${
                    preprocess.thresholdMode
                      ? 'bg-amber-500 text-slate-950 font-semibold'
                      : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  P&B
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
