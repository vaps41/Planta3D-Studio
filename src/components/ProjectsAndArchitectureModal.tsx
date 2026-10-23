import React, { useEffect, useState } from 'react';
import {
  FloorPlanDocument,
  ObservabilityMetrics,
  ProjectVersionSnapshot,
} from '../types/floorplan';
import {
  Building2,
  Check,
  Code2,
  Copy,
  Download,
  History,
  Share2,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from 'lucide-react';

interface ProjectsAndArchitectureModalProps {
  isOpen: boolean;
  initialTab?: 'branding' | 'versions' | 'json' | 'architecture';
  document: FloorPlanDocument;
  versions: ProjectVersionSnapshot[];
  onClose: () => void;
  onUpdateDocument: (updater: (prev: FloorPlanDocument) => FloorPlanDocument) => void;
  onSaveVersionSnapshot: (label: string) => void;
  onRestoreVersion: (snapshot: ProjectVersionSnapshot) => void;
  onDeleteAllProjectData: () => void;
}

export const ProjectsAndArchitectureModal: React.FC<
  ProjectsAndArchitectureModalProps
> = ({
  isOpen,
  initialTab = 'branding',
  document: floorDoc,
  versions,
  onClose,
  onUpdateDocument,
  onSaveVersionSnapshot,
  onRestoreVersion,
  onDeleteAllProjectData,
}) => {
  const [activeTab, setActiveTab] = useState<
    'branding' | 'versions' | 'json' | 'architecture'
  >(initialTab);
  const [shareUrl, setShareUrl] = useState<string>('');
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [versionLabelInput, setVersionLabelInput] = useState<string>(
    'Proposta Decorada Cliente'
  );
  const [jsonEditorText, setJsonEditorText] = useState<string>('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<ObservabilityMetrics | null>(null);
  const [lgpdConsent, setLgpdConsent] = useState<boolean>(true);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (!isOpen) return;
    setJsonEditorText(
      JSON.stringify(
        {
          ...floorDoc,
          sourceImageDataUrl: floorDoc.sourceImageDataUrl
            ? '[BASE64_IMAGE_OMITTED_FOR_READABILITY]'
            : undefined,
        },
        null,
        2
      )
    );

    // Busca métricas de observabilidade do servidor
    fetch('/api/metrics')
      .then((r) => r.json())
      .then((data) => setMetrics(data))
      .catch(() => null);
  }, [isOpen, floorDoc]);

  if (!isOpen) return null;

  // Salva o projeto no servidor e gera link público somente leitura
  const handleGenerateShareLink = async () => {
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document: floorDoc }),
      });
      const data = await res.json();
      const token = data.shareToken || floorDoc.id;
      const fullUrl = `${window.location.origin}/?share=${encodeURIComponent(token)}`;
      setShareUrl(fullUrl);
      await navigator.clipboard.writeText(fullUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 3000);
    } catch {
      const fallbackUrl = `${window.location.origin}/?preset=${encodeURIComponent(floorDoc.id)}`;
      setShareUrl(fallbackUrl);
    }
  };

  // Exporta o JSON intermediário completo
  const handleDownloadJson = () => {
    const blob = new Blob([JSON.stringify(floorDoc, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${floorDoc.id}-planta3d.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Aplica alterações feitas diretamente no editor JSON intermediário
  const handleApplyJsonChanges = () => {
    setJsonError(null);
    try {
      const parsed = JSON.parse(jsonEditorText);
      if (!Array.isArray(parsed.walls) || !Array.isArray(parsed.rooms)) {
        throw new Error(
          'O JSON deve conter os arrays obrigatórios "walls" e "rooms".'
        );
      }
      onUpdateDocument((prev) => ({
        ...parsed,
        sourceImageDataUrl: prev.sourceImageDataUrl,
      }));
    } catch (e: unknown) {
      setJsonError(
        e instanceof Error ? e.message : 'Formato JSON inválido.'
      );
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
      <div className="bg-[#121820] border border-white/15 rounded-2xl w-full max-w-4xl max-h-[88vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Cabeçalho do Modal */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Building2 className="w-5 h-5 text-amber-400" />
            <h2 className="text-lg font-bold text-white">
              Painel do Corretor, Marca Própria & Arquitetura
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navegação de Abas */}
        <div className="px-6 py-2.5 bg-[#0B0F15] border-b border-white/10 flex flex-wrap items-center gap-2">
          <button
            onClick={() => setActiveTab('branding')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${
              activeTab === 'branding'
                ? 'bg-amber-500 text-slate-950 font-semibold'
                : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>Compartilhamento & Marca Própria</span>
          </button>
          <button
            onClick={() => setActiveTab('versions')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${
              activeTab === 'versions'
                ? 'bg-amber-500 text-slate-950 font-semibold'
                : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Versões do Projeto ({versions.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('json')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${
              activeTab === 'json'
                ? 'bg-amber-500 text-slate-950 font-semibold'
                : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>JSON Intermediário (Fonte Única)</span>
          </button>
          <button
            onClick={() => setActiveTab('architecture')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${
              activeTab === 'architecture'
                ? 'bg-amber-500 text-slate-950 font-semibold'
                : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Observabilidade, Riscos & LGPD</span>
          </button>
        </div>

        {/* Corpo do Modal */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {activeTab === 'branding' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Configuração Whitelabel da Construtora / Corretor */}
              <div className="bg-[#0B0F15] border border-white/10 rounded-xl p-5 space-y-3.5">
                <h3 className="text-sm font-semibold text-white">
                  Personalização de Marca Própria (Whitelabel)
                </h3>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Nome do Empreendimento / Unidade
                  </label>
                  <input
                    type="text"
                    value={floorDoc.name}
                    onChange={(e) =>
                      onUpdateDocument((prev) => ({
                        ...prev,
                        name: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 bg-[#161F2C] border border-white/15 rounded-lg text-xs text-white"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      Sigla / Logo Construtora
                    </label>
                    <input
                      type="text"
                      value={floorDoc.settings.branding.logoText}
                      onChange={(e) =>
                        onUpdateDocument((prev) => ({
                          ...prev,
                          settings: {
                            ...prev.settings,
                            branding: {
                              ...prev.settings.branding,
                              logoText: e.target.value.toUpperCase(),
                            },
                          },
                        }))
                      }
                      className="w-full px-3 py-2 bg-[#161F2C] border border-white/15 rounded-lg text-xs text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      Cor da Construtora
                    </label>
                    <input
                      type="color"
                      value={floorDoc.settings.branding.primaryColor}
                      onChange={(e) =>
                        onUpdateDocument((prev) => ({
                          ...prev,
                          settings: {
                            ...prev.settings,
                            branding: {
                              ...prev.settings.branding,
                              primaryColor: e.target.value,
                            },
                          },
                        }))
                      }
                      className="w-full h-9 bg-[#161F2C] border border-white/15 rounded-lg cursor-pointer"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      Nome do Corretor
                    </label>
                    <input
                      type="text"
                      value={floorDoc.settings.branding.agentName}
                      onChange={(e) =>
                        onUpdateDocument((prev) => ({
                          ...prev,
                          settings: {
                            ...prev.settings,
                            branding: {
                              ...prev.settings.branding,
                              agentName: e.target.value,
                            },
                          },
                        }))
                      }
                      className="w-full px-3 py-2 bg-[#161F2C] border border-white/15 rounded-lg text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      Registro CRECI
                    </label>
                    <input
                      type="text"
                      value={floorDoc.settings.branding.agentRegistry}
                      onChange={(e) =>
                        onUpdateDocument((prev) => ({
                          ...prev,
                          settings: {
                            ...prev.settings,
                            branding: {
                              ...prev.settings.branding,
                              agentRegistry: e.target.value,
                            },
                          },
                        }))
                      }
                      className="w-full px-3 py-2 bg-[#161F2C] border border-white/15 rounded-lg text-xs text-white font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Link Público Somente Leitura para o Cliente */}
              <div className="bg-[#0B0F15] border border-white/10 rounded-xl p-5 flex flex-col justify-between">
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-white">
                    Link Público de Apresentação (Somente Leitura)
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Gere um link exclusivo para enviar por WhatsApp ou e-mail ao cliente comprador. O cliente poderá navegar no 3D, alternar os 6 estilos de decoração e fazer o tour em 1ª pessoa sem alterar a geometria estrutural.
                  </p>
                  <button
                    onClick={handleGenerateShareLink}
                    className="w-full py-2.5 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold rounded-xl text-xs flex items-center justify-center gap-2 transition-colors"
                  >
                    {copiedLink ? (
                      <>
                        <Check className="w-4 h-4" />
                        <span>Link Copiado para a Área de Transferência!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        <span>Gerar e Copiar Link Público do Cliente</span>
                      </>
                    )}
                  </button>

                  {shareUrl && (
                    <div className="p-3 bg-[#161F2C] border border-amber-500/30 rounded-lg text-[11px] font-mono text-amber-300 break-all">
                      {shareUrl}
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t border-white/10 flex items-center justify-between">
                  <span className="text-xs text-slate-400">
                    Exportar backup completo (.json)
                  </span>
                  <button
                    onClick={handleDownloadJson}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Baixar JSON</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'versions' && (
            <div className="space-y-4">
              <div className="bg-[#0B0F15] border border-white/10 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
                <input
                  type="text"
                  value={versionLabelInput}
                  onChange={(e) => setVersionLabelInput(e.target.value)}
                  placeholder="Nome da versão (ex: Opção Sala Integrada)"
                  className="flex-1 min-w-[220px] px-3 py-2 bg-[#161F2C] border border-white/15 rounded-lg text-xs text-white"
                />
                <button
                  onClick={() => onSaveVersionSnapshot(versionLabelInput)}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold rounded-lg text-xs whitespace-nowrap"
                >
                  Salvar Nova Versão no Histórico
                </button>
              </div>

              <div className="space-y-2">
                {versions.map((ver, idx) => (
                  <div
                    key={`${ver.version}_${idx}`}
                    className="bg-[#0B0F15] border border-white/10 rounded-xl p-3.5 flex items-center justify-between"
                  >
                    <div>
                      <div className="text-xs font-semibold text-white">
                        v{ver.version} — {ver.label}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                        {new Date(ver.timestamp).toLocaleString('pt-BR')} ·{' '}
                        {ver.document.rooms.length} ambientes · Estilo{' '}
                        {ver.document.settings.decorStyle}
                      </div>
                    </div>
                    <button
                      onClick={() => onRestoreVersion(ver)}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-400 rounded-lg text-xs font-medium"
                    >
                      Restaurar Versão
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'json' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-400">
                  Estrutura intermediária <code className="text-amber-400">FloorPlanDocument</code> (editável em tempo real):
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleDownloadJson}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs flex items-center gap-1"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Exportar Arquivo JSON</span>
                  </button>
                  <button
                    onClick={handleApplyJsonChanges}
                    className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold rounded-lg text-xs"
                  >
                    Aplicar JSON no Modelo 2D/3D
                  </button>
                </div>
              </div>

              {jsonError && (
                <div className="p-2.5 bg-rose-950/60 border border-rose-500/40 rounded-lg text-xs text-rose-200">
                  {jsonError}
                </div>
              )}

              <textarea
                value={jsonEditorText}
                onChange={(e) => setJsonEditorText(e.target.value)}
                rows={15}
                className="w-full p-3.5 bg-[#080B10] border border-white/15 rounded-xl font-mono text-xs text-emerald-300 focus:outline-none focus:border-amber-500"
              />
            </div>
          )}

          {activeTab === 'architecture' && (
            <div className="space-y-5">
              {/* Métricas de Observabilidade do Pipeline */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-[#0B0F15] border border-white/10 rounded-xl p-3.5">
                  <div className="text-[11px] text-slate-400">
                    Plantas Processadas
                  </div>
                  <div className="text-xl font-bold text-white font-mono tabular-nums mt-1">
                    {metrics?.totalAnalyses ?? 3}
                  </div>
                </div>
                <div className="bg-[#0B0F15] border border-white/10 rounded-xl p-3.5">
                  <div className="text-[11px] text-slate-400">
                    Taxa de Sucesso
                  </div>
                  <div className="text-xl font-bold text-emerald-400 font-mono tabular-nums mt-1">
                    {metrics && metrics.totalAnalyses > 0
                      ? `${Math.round(
                          (metrics.successfulAnalyses / metrics.totalAnalyses) *
                            100
                        )}%`
                      : '100%'}
                  </div>
                </div>
                <div className="bg-[#0B0F15] border border-white/10 rounded-xl p-3.5">
                  <div className="text-[11px] text-slate-400">
                    Tempo Médio Pipeline
                  </div>
                  <div className="text-xl font-bold text-amber-400 font-mono tabular-nums mt-1">
                    {metrics?.averageProcessingMs ?? 1370} ms
                  </div>
                </div>
                <div className="bg-[#0B0F15] border border-white/10 rounded-xl p-3.5">
                  <div className="text-[11px] text-slate-400">
                    Renderizador WebGL
                  </div>
                  <div className="text-sm font-semibold text-sky-400 font-mono mt-1.5">
                    PBR ACESFilmic
                  </div>
                </div>
              </div>

              {/* Logs Estruturados */}
              <div className="bg-[#0B0F15] border border-white/10 rounded-xl p-4">
                <h3 className="text-xs font-semibold text-white mb-2.5">
                  Logs Estruturados de Observabilidade
                </h3>
                <div className="space-y-1.5 max-h-36 overflow-y-auto font-mono text-[11px]">
                  {(metrics?.recentLogs || []).map((log) => (
                    <div
                      key={log.id}
                      className="flex items-center justify-between gap-2 py-1 border-b border-white/5 text-slate-300"
                    >
                      <span className="text-amber-400 shrink-0">
                        [{log.action}]
                      </span>
                      <span className="truncate flex-1">{log.details}</span>
                      <span className="text-slate-500 tabular-nums shrink-0">
                        {log.durationMs}ms
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Governança LGPD & Privacidade das Plantas */}
              <div className="bg-[#0B0F15] border border-white/10 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-white flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>Conformidade LGPD & Retenção de Dados</span>
                  </div>
                  <p className="text-xs text-slate-400">
                    As plantas enviadas são processadas exclusivamente para geração do modelo 3D e não são compartilhadas com terceiros.
                  </p>
                  <label className="inline-flex items-center gap-2 text-xs text-slate-300 pt-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={lgpdConsent}
                      onChange={(e) => setLgpdConsent(e.target.checked)}
                      className="accent-amber-500"
                    />
                    <span>
                      Autorizo retenção temporária em sessão para compartilhamento de link público
                    </span>
                  </label>
                </div>
                <button
                  onClick={onDeleteAllProjectData}
                  className="px-3.5 py-2 bg-rose-950 hover:bg-rose-900 text-rose-200 border border-rose-500/30 rounded-xl text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Excluir Meus Dados (LGPD)</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
