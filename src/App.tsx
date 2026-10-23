/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  FloorPlanDocument,
  ProjectVersionSnapshot,
} from './types/floorplan';
import { getPresetFloorPlans } from './data/presets';
import { autoFurnishFloorPlan } from './utils/geometryAndAutoDecor';
import { UploadPreprocessPanel } from './components/UploadPreprocessPanel';
import { Editor2DCanvas } from './components/Editor2DCanvas';
import { Viewer3DCanvas } from './components/Viewer3DCanvas';
import { ProjectsAndArchitectureModal } from './components/ProjectsAndArchitectureModal';

type WorkspaceStep = 'upload' | 'review_2d' | 'view_3d';

const STORAGE_KEY_DOC = 'planta3d_active_document_v1';
const STORAGE_KEY_VERSIONS = 'planta3d_versions_v1';

export default function App() {
  const presets = useMemo(() => getPresetFloorPlans(), []);

  const [activeStep, setActiveStep] = useState<WorkspaceStep>('view_3d');
  const [floorDoc, setFloorDoc] = useState<FloorPlanDocument>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_DOC);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && Array.isArray(parsed.walls) && Array.isArray(parsed.rooms)) {
          return parsed;
        }
      }
    } catch {
      // Fallback para preset inicial
    }
    return presets[0];
  });

  const [versions, setVersions] = useState<ProjectVersionSnapshot[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_VERSIONS);
      if (saved) return JSON.parse(saved);
    } catch {
      // Fallback
    }
    return [
      {
        version: 1,
        timestamp: new Date().toISOString(),
        label: 'Planta Base Original Calibrada',
        document: presets[0],
      },
    ];
  });

  const [detectedDimensions, setDetectedDimensions] = useState<string[]>([
    'SALA ESTAR 4,50 x 3,60m',
    'COZINHA 4,50 x 2,40m',
    'SUÍTE 3,50 x 3,80m',
  ]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [isReadOnlyShare, setIsReadOnlyShare] = useState<boolean>(false);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [modalInitialTab, setModalInitialTab] = useState<
    'branding' | 'versions' | 'json' | 'architecture'
  >('branding');

  // Verifica se o acesso é via Link Público de Compartilhamento (?share=... ou ?preset=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shareToken = params.get('share');
    const presetParam = params.get('preset');

    if (shareToken) {
      fetch(`/api/share/${encodeURIComponent(shareToken)}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.success && data.project?.document) {
            setFloorDoc(data.project.document as FloorPlanDocument);
            setIsReadOnlyShare(true);
            setActiveStep('view_3d');
          }
        })
        .catch(() => null);
    } else if (presetParam) {
      const found = presets.find((p) => p.id === presetParam);
      if (found) {
        setFloorDoc(found);
        setIsReadOnlyShare(true);
        setActiveStep('view_3d');
      }
    }
  }, [presets]);

  // Sincroniza alterações no localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_DOC, JSON.stringify(floorDoc));
    } catch {
      // Ignora caso exceda quota do navegador
    }
  }, [floorDoc]);

  const handleUpdateDocument = (
    updater: (prev: FloorPlanDocument) => FloorPlanDocument
  ) => {
    setFloorDoc((prev) => {
      const next = updater(prev);
      return {
        ...next,
        updatedAt: new Date().toISOString(),
      };
    });
  };

  const handleAutoDecorate = () => {
    handleUpdateDocument((prev) => ({
      ...prev,
      furniture: autoFurnishFloorPlan(prev.rooms, prev.walls, prev.openings),
    }));
  };

  const handleSaveVersionSnapshot = (label: string) => {
    const nextVer = versions.length + 1;
    const snap: ProjectVersionSnapshot = {
      version: nextVer,
      timestamp: new Date().toISOString(),
      label: label || `Versão ${nextVer}`,
      document: JSON.parse(JSON.stringify(floorDoc)),
    };
    const updated = [snap, ...versions];
    setVersions(updated);
    try {
      localStorage.setItem(STORAGE_KEY_VERSIONS, JSON.stringify(updated));
    } catch {
      // Ignora erro de quota
    }
  };

  const handleDeleteAllProjectData = async () => {
    try {
      await fetch(`/api/projects/${encodeURIComponent(floorDoc.id)}`, {
        method: 'DELETE',
      });
    } catch {
      // Continua limpeza local
    }
    localStorage.removeItem(STORAGE_KEY_DOC);
    localStorage.removeItem(STORAGE_KEY_VERSIONS);
    setFloorDoc(presets[0]);
    setVersions([
      {
        version: 1,
        timestamp: new Date().toISOString(),
        label: 'Planta Base Restaurada',
        document: presets[0],
      },
    ]);
    setIsModalOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#0F1419] text-[#F3F4F6] flex flex-col">
      {/* Barra Superior Seguindo o Contrato Estrito de 3 Zonas */}
      <header className="h-16 flex items-center justify-between gap-8 px-6 border-b border-white/10 bg-[#0F1419] z-20">
        {/* Zona 1: Marca (1 linha, sem subtítulos ou pílulas acopladas) */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveStep('view_3d');
          }}
          className="text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0 font-display"
        >
          Planta3D Studio
        </a>

        {/* Zona 2: 4 Links de Navegação Concisos em Linha Única */}
        <nav className="flex items-center gap-6 text-sm font-medium text-slate-300 overflow-x-auto">
          {!isReadOnlyShare && (
            <>
              <button
                onClick={() => setActiveStep('upload')}
                className={`transition-colors whitespace-nowrap shrink-0 pb-0.5 ${
                  activeStep === 'upload'
                    ? 'text-amber-400 border-b-2 border-amber-400 font-semibold'
                    : 'hover:text-white'
                }`}
              >
                01. Planta & IA
              </button>
              <button
                onClick={() => setActiveStep('review_2d')}
                className={`transition-colors whitespace-nowrap shrink-0 pb-0.5 ${
                  activeStep === 'review_2d'
                    ? 'text-amber-400 border-b-2 border-amber-400 font-semibold'
                    : 'hover:text-white'
                }`}
              >
                02. Revisão 2D
              </button>
            </>
          )}
          <button
            onClick={() => setActiveStep('view_3d')}
            className={`transition-colors whitespace-nowrap shrink-0 pb-0.5 ${
              activeStep === 'view_3d'
                ? 'text-amber-400 border-b-2 border-amber-400 font-semibold'
                : 'hover:text-white'
            }`}
          >
            03. Maquete 3D
          </button>
          <button
            onClick={() => {
              setModalInitialTab('architecture');
              setIsModalOpen(true);
            }}
            className="hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            Painel Corretor
          </button>
        </nav>

        {/* Zona 3: 1 Ação Primária */}
        <div className="flex items-center shrink-0">
          <button
            onClick={() => {
              setModalInitialTab('branding');
              setIsModalOpen(true);
            }}
            className="px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-500 rounded-lg hover:bg-amber-400 transition-colors whitespace-nowrap shrink-0"
          >
            Compartilhar Tour
          </button>
        </div>
      </header>

      {/* Conteúdo Principal por Etapa do Fluxo */}
      <main className="flex-1 relative">
        {activeStep === 'upload' && !isReadOnlyShare && (
          <UploadPreprocessPanel
            presets={presets}
            currentDocument={floorDoc}
            onSelectPreset={(presetDoc) => {
              setFloorDoc(presetDoc);
              setWarnings([]);
              setActiveStep('review_2d');
            }}
            onAnalysisComplete={(analyzedDoc, dims, warns) => {
              setFloorDoc(analyzedDoc);
              setDetectedDimensions(dims);
              setWarnings(warns);
              setActiveStep('review_2d');
            }}
            onSkipToManual2D={() => setActiveStep('review_2d')}
          />
        )}

        {activeStep === 'review_2d' && !isReadOnlyShare && (
          <Editor2DCanvas
            document={floorDoc}
            detectedDimensions={detectedDimensions}
            warnings={warnings}
            onUpdateDocument={handleUpdateDocument}
            onProceedTo3D={() => setActiveStep('view_3d')}
          />
        )}

        {activeStep === 'view_3d' && (
          <Viewer3DCanvas
            document={floorDoc}
            onUpdateDocument={handleUpdateDocument}
            onAutoDecorate={handleAutoDecorate}
            readOnly={isReadOnlyShare}
          />
        )}
      </main>

      {/* Modal de Projetos, Marca Própria, JSON Intermediário, Observabilidade e LGPD */}
      <ProjectsAndArchitectureModal
        isOpen={isModalOpen}
        initialTab={modalInitialTab}
        document={floorDoc}
        versions={versions}
        onClose={() => setIsModalOpen(false)}
        onUpdateDocument={handleUpdateDocument}
        onSaveVersionSnapshot={handleSaveVersionSnapshot}
        onRestoreVersion={(snap) => {
          setFloorDoc(snap.document);
          setIsModalOpen(false);
        }}
        onDeleteAllProjectData={handleDeleteAllProjectData}
      />
    </div>
  );
}
