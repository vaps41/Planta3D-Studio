# Planta3D Studio — Conversão de Planta Baixa em Modelo 3D Decorado e Navegável

Plataforma web SaaS em português do Brasil voltada para corretores imobiliários e construtoras que transforma imagens, fotos ou PDFs de plantas baixas em maquetes eletrônicas 3D decoradas, interativas e prontas para apresentação e compartilhamento com compradores.

## User Review & Critical Decisions

> [!IMPORTANT]
> As decisões abaixo consolidam as escolhas de escopo e arquitetura para a entrega executável completa do MVP, mantendo transparência sobre limitações de visão computacional e garantindo fluxo contínuo de ponta a ponta.

- **Decisão Confirmada 1 — Pipeline Híbrido de Interpretação da Planta**: Combinação de pré-processamento de imagem em HTML5 Canvas (correção de rotação, perspectiva, contraste, limiarização e remoção de ruído) + análise multimodal estruturada no servidor via **Gemini (`gemini-4-argon`)** com schema JSON rigoroso para detectar paredes, portas, janelas, cômodos, cotas e escala, acompanhado de heurística geométrica local e plantas de exemplo pré-carregadas para teste imediato.
- **Decisão Confirmada 2 — Escopo Completo no MVP Executável**: Entrega de ponta a ponta incluindo upload/pré-processamento, interpretação assistida, **Editor Vetorial 2D** obrigatório para revisão e calibração explícita de escala (`metros por pixel`), **Gerador 3D PBR em Three.js** com extrusão de paredes, recortes de esquadrias, rodapés, mobiliário procedural composto (3–12 partes por peça), **6 estilos de decoração em tempo real**, **4 modos de câmera/tour** (Órbita, Dollhouse em corte, Primeira Pessoa WASD com colisão a 1,60 m, e Tour Guiado Automático), marca própria (whitelabel da construtora) e exportação de imagens/vídeo/JSON.
- **Decisão Confirmada 3 — Persistência Híbrida e Compartilhamento**: Armazenamento de projetos e versões tanto em API REST no servidor Express (com geração de links públicos somente leitura e configuração de marca da construtora) quanto sincronização local no navegador (`localStorage` + exportação/importação do JSON intermediário), permitindo funcionamento contínuo e compatibilidade com deploy em Vercel e containers.

---

## 1. Overview & Core Concept

- **O Que Faz**: Recebe qualquer planta baixa (JPG, PNG, PDF ou captura de câmera; inclusive plantas humanizadas ou rascunhos fotografados), realiza pré-processamento visual, extrai a topologia arquitetônica para uma estrutura JSON intermediária única, oferece uma etapa de revisão 2D intuitiva com calibração real de escala e constrói instantaneamente um modelo 3D decorado e iluminado.
- **Público-Alvo / Persona**: Corretores de imóveis, incorporadoras, construtoras e arquitetos comerciais que precisam encantar compradores mostrando a espacialidade e o potencial de decoração de um imóvel na planta em poucos segundos, sem depender de softwares CAD pesados.
- **Valor Principal**: Reduz o tempo entre receber uma planta baixa estática e apresentar um tour virtual 3D decorado de dias para menos de 2 minutos, aumentando a conversão de vendas com links públicos personalizados com a marca da construtora.

---

## 2. User Experience & Visual Design

### Fluxo Completo do Usuário (Passo a Passo)

1. **Etapa 1 — Upload & Pré-Processamento**: O usuário faz upload da planta (arrastar e soltar JPG/PNG/PDF, câmera mobile ou seleciona uma das 3 plantas reais de demonstração: *Apartamento Studio 48m²*, *Casa Térrea 3 Quartos 115m²*, *Cobertura Duplex/Ampla 160m²*). Ajusta rotação, correção de perspectiva/contraste e remoção de ruído com visualização lado a lado antes de disparar a leitura automática.
2. **Etapa 2 — Revisão 2D & Calibração de Escala**: O sistema exibe a planta original sob o canvas vetorial interativo. O usuário:
   - Confirma ou calibra a **escala real** clicando em dois pontos de uma cota conhecida e informando a medida em metros (nunca assumimos escala silenciosamente sem alerta explícito).
   - Move vértices, desenha ou remove paredes, adiciona/reposiciona portas e janelas, e edita o nome e a tipologia de cada cômodo detectado (Sala de Estar, Quarto/Suíte, Cozinha, Banheiro, Varanda, Escritório).
3. **Etapa 3 — Geração 3D, Decoração & Estilos em Tempo Real**: O modelo 3D é construído com paredes extrudadas (pé-direito configurável, padrão `2,70 m`, espessura configurável `0,15 m`), recortes reais para portas e janelas, pisos por ambiente, rodapés e teto dinâmico. O motor de decoração posiciona móveis automaticamente respeitando zonas de circulação e abertura de portas. O usuário alterna em tempo real entre **6 estilos** (*Moderno*, *Minimalista*, *Industrial*, *Clássico*, *Escandinavo*, *Rústico*), podendo arrastar, girar (`R`), adicionar ou remover qualquer móvel diretamente no viewport 3D.
4. **Etapa 4 — Tour Interativo, Marca Própria & Compartilhamento**: O corretor navega pelos 4 modos de câmera (*Vista Aérea/Órbita*, *Dollhouse com corte de parede/teto*, *Primeira Pessoa em 1,60 m com colisão WASD/Toque*, *Tour Guiado Automático* com transição suave entre ambientes), ajusta o ciclo solar (*Manhã*, *Meio-dia*, *Entardecer Golden Hour*, *Noite*) e o perfil gráfico (*Baixo*, *Médio*, *Alto*), aplica o logo e cor da construtora, captura fotos em alta resolução, grava vídeo WebM do tour e gera o link público somente leitura para enviar ao cliente.

### Identidade Visual & Tema (Arquitetura & PropTech Studio)

- **Direção Estética**: *Precision Architectural Studio* — estética limpa, editorial e técnica inspirada em estúdios de arquitetura contemporânea brasileira (superfícies neutras em pedra travertino/ardósia escura, linhas de cota precisas e tipografia geométrica).
- **Paleta de Cores (60-30-10)**:
  - **60% Canvas Dominante**: No workspace 3D/2D, fundo técnico grafite profundo (`#0F1419`) que destaca a iluminação natural do modelo 3D e as linhas de cota; nas áreas de gestão do corretor, superfície neutra clara (`#F8F7F4`) ou escura com alto contraste WCAG AA.
  - **30% Superfícies Estruturais**: Painéis e dock inferior em ardósia sólida (`rgba(18, 24, 32, 0.94)` com borda sutil `1px solid rgba(255, 255, 255, 0.08)` — sem `backdrop-filter` sobre o canvas WebGL para garantir 60 fps constantes).
  - **10% Acento de Alta Intenção**: Âmbar Arquitetônico (`#D97706` / `#F59E0B`) para ações primárias, calibração de cota ativa e seleção de cômodos, combinado com Azul Ciano Técnico (`#0EA5E9`) para eixos de simetria e guias de escala.
- **Tipografia & Hierarquia (Regra 2+1)**:
  - *Display / Títulos*: `Outfit` (SemiBold 600) para cabeçalhos e nomes de empreendimentos.
  - *Corpo / Controles*: `Plus Jakarta Sans` (Regular 400 / Medium 500) para excelente legibilidade em português.
  - *Cotas, Áreas & Telemetria*: `JetBrains Mono` com `tabular-nums` para medidas em metros (`2,70 m`), áreas (`48,50 m²`) e coordenadas X/Z.
- **Layout Viewport-First**:
  - Barra superior seguindo o contrato de 3 zonas (Marca / Etapas do Fluxo / Ação Primária de Compartilhar & Exportar).
  - No modo 3D, **100% do centro do viewport fica desobstruído**, com todos os controles de câmera, estilo de decoração, ciclo dia/noite, corte de pé-direito e catálogo de móveis consolidados em um **Dock Inferior Retrátil** (`▾ Ocultar Controles / Modo Apresentação`).

---

## 3. Key Product Decisions & Trade-Offs

### Decisão 1: Pipeline Híbrido de Visão Computacional (Canvas + Gemini Vision + Editor 2D)
- **Abordagem Escolhida**: Pré-processamento de imagem no cliente (rotação, perspectiva, binarização adaptativa e detecção de segmentos de linha no Canvas 2D) aliado à chamada server-side para `gemini-4-argon` com `responseSchema` estruturado para inferir semântica de cômodos, cotas escritas e aberturas, desaguando obrigatoriamente na tela de revisão 2D antes ou junto da geração 3D.
- **Por quê**: Plantas enviadas por corretores variam de PDFs vetoriais limpos a fotos inclinadas de folders impressos ou plantas humanizadas coloridas. Algoritmos puramente baseados em Hough Transform falham em plantas humanizadas; já LLMs multimodais puros compreendem perfeitamente a semântica ("Suíte Master 3,40 x 4,10"), mas podem ter imprecisão sub-pixel nas coordenadas. A união dos dois com validação 2D garante >95% de precisão prática.
- **Alternativas Consideradas**: Pipeline 100% automático sem tela de revisão 2D (descartado: erros de escala ou parede faltante destruiriam a confiança do corretor diante do comprador).

### Decisão 2: Mobiliário Procedural Composto (3–12 Partes PBR) vs. Dependência de Arquivos GLB Externos
- **Abordagem Escolhida**: Biblioteca de mobiliário arquitetônico gerada proceduralmente em `THREE.Group` com 3 a 12 sub-partes distintas por móvel (ex.: sofá com base de madeira, assentos chanfrados via `ExtrudeGeometry`, encostos, braços, almofadas e pés metálicos; cama com cabeceira estofada, colchão, travesseiros e manta; bancada de cozinha com pia esculpida, torneira curva em `TubeGeometry` e eletrodomésticos), além de suporte a exportação/importação de cenas e texturas procedurais `CanvasTexture` PBR (`SRGBColorSpace` + mapas de rugosidade/relevo).
- **Por quê**: Elimina 100% de falhas de rede (404), permite carregamento inicial abaixo de 1,5 s e viabiliza a **troca instantânea em tempo real dos 6 estilos de decoração** (alterando geometria, materiais PBR, tecidos, madeiras e metais a 60 fps sem esperar download de dezenas de megabytes).

### Decisão 3: Fonte Única de Verdade em JSON Intermediário (`FloorPlanDocument`)
- **Abordagem Escolhida**: Toda alteração no Editor 2D, na calibração de escala ou na movimentação de móveis no 3D atualiza um único documento JSON tipado e versionado.
- **Por quê**: Permite desfazer/refazer (Undo/Redo), versionamento instantâneo, cálculo exato de áreas em metros quadrados (`Shoelace formula`) e compartilhamento leve via URL/API.

---

## 4. Riscos Técnicos Principais e Estratégias de Mitigação

| Risco Técnico | Impacto | Estratégia de Mitigação Implementada |
| :--- | :--- | :--- |
| **1. Imprecisão na leitura de plantas fotografadas ou de baixa resolução** | Paredes desconectadas, cômodos abertos ou portas fora de lugar. | Pré-processamento com ajuste de contraste/perspectiva, snapping magnético ortogonal e de vértices (`snap-to-grid` e `snap-to-wall`), fechamento automático de polígonos de cômodos e fallback imediato para edição manual 2D com 1 clique. |
| **2. Escala incorreta ou ausência de cotas legíveis na imagem** | Móveis desproporcionais (ex.: sofá gigante ou micro-quarto). | Nunca assumir escala oculta: se nenhuma cota for detectada com alta confiança, exibir um banner claro solicitando que o usuário use a **Régua de Calibração** (clicar nos extremos de uma parede ou porta padrão de `0,80 m` e digitar a medida real). |
| **3. Colisão de mobiliário ou bloqueio de portas/janelas** | Móveis atravessando paredes ou impedindo a passagem no tour em 1ª pessoa. | Algoritmo de layout baseado em restrições (*Constraint-Based Auto-Furnishing*): calcula a *Bounding Box* interna de cada cômodo descontando a espessura das paredes e cria zonas de exclusão (raios de giro de `0,90 m` nas portas e corredor de circulação mínima de `0,65 m`). |
| **4. Queda de FPS em notebooks sem GPU dedicada ou celulares** | Engasgos durante o tour em primeira pessoa ou na vista aérea. | Detecção automática de renderizador via WebGL (`isSoftwareGl`) e seletor de perfil de desempenho (*Baixo*, *Médio*, *Alto*) que ajusta `pixelRatio`, `PCFSoftShadowMap`, iluminação de área e pós-processamento mantendo a mesma geometria. |

---

## 5. Technical Architecture & Data Strategy

### Diagrama de Arquitetura e Fluxo de Dados

```
┌───────────────────────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React 19 + TypeScript + Vite)                    │
│                                                                                   │
│  ┌─────────────────────┐    ┌──────────────────────┐    ┌──────────────────────┐  │
│  │ 1. Upload &         │    │ 2. Editor 2D Vetorial│    │ 3. Engine 3D Three.js│  │
│  │ Pré-Processamento   ├───►│ & Calibração Escala  ├───►│ PBR + Auto-Decoração │  │
│  │ (Canvas Filters/PDF)│    │ (Paredes/Portas/Cota)│    │ (6 Estilos + Tours)  │  │
│  └──────────┬──────────┘    └──────────┬───────────┘    └──────────┬───────────┘  │
│             │                          │                           │              │
│             ▼                          ▼                           ▼              │
│  ┌─────────────────────────────────────────────────────────────────────────────┐  │
│  │       ESTADO CENTRAL & FONTE ÚNICA DE VERDADE (FloorPlanDocument JSON)      │  │
│  │   • Escala (px/m) • Paredes • Esquadrias • Cômodos • Mobiliário • Branding  │  │
│  └──────────┬──────────────────────────────────────────────────────┬───────────┘  │
└─────────────┼──────────────────────────────────────────────────────┼──────────────┘
              │ POST /api/floorplan/analyze                          │ POST /api/projects
              ▼ (Imagem Base64 + Metadados)                          ▼ GET  /api/projects/:id
┌───────────────────────────────────────────────────────────────────────────────────┐
│                        BACKEND (Node.js + Express Server)                         │
│                                                                                   │
│  ┌────────────────────────────────────────┐   ┌────────────────────────────────┐  │
│  │ Pipeline Multimodal de Visão           │   │ Serviço de Projetos, Versões   │  │
│  │ • @google/genai (gemini-4-argon)       │   │ & Links Públicos Whitelabel    │  │
│  │ • Extração de Topologia, OCR de Cotas, │   │ • Validação de Upload & Rate   │  │
│  │   Classificação de Cômodos & Escala    │   │ • Logs Estruturados & Métricas │  │
│  └────────────────────────────────────────┘   └────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────────────────┘
```

### Esquema do JSON Intermediário da Planta (`FloorPlanDocument`)

```json
{
  "id": "proj_apt_jardins_01",
  "name": "Residencial Aurora — Unidade 402",
  "version": 3,
  "updatedAt": "2026-10-21T21:00:00Z",
  "scale": {
    "pixelsPerMeter": 65.0,
    "calibrated": true,
    "referenceLengthMeters": 3.5,
    "confidence": 0.96
  },
  "settings": {
    "ceilingHeight": 2.7,
    "defaultWallThickness": 0.15,
    "decorStyle": "scandinavian",
    "lightingPreset": "golden_hour",
    "qualityProfile": "high",
    "branding": {
      "companyName": "Construtora Horizonte",
      "primaryColor": "#D97706",
      "agentName": "Carlos Mendes — CRECI 142.890",
      "agentPhone": "(11) 99812-4400"
    }
  },
  "walls": [
    {
      "id": "w1",
      "start": { "x": 0.0, "z": 0.0 },
      "end": { "x": 7.2, "z": 0.0 },
      "thickness": 0.15,
      "height": 2.7,
      "isExterior": true
    }
  ],
  "openings": [
    {
      "id": "op1",
      "wallId": "w1",
      "type": "window",
      "offset": 0.5,
      "width": 1.6,
      "height": 1.2,
      "elevation": 0.9,
      "swing": "left"
    }
  ],
  "rooms": [
    {
      "id": "r1",
      "name": "Sala de Estar e Jantar",
      "type": "living_room",
      "polygon": [
        { "x": 0.0, "z": 0.0 },
        { "x": 4.2, "z": 0.0 },
        { "x": 4.2, "z": 4.8 },
        { "x": 0.0, "z": 4.8 }
      ],
      "areaSqm": 20.16,
      "floorMaterial": "oak_herringbone",
      "wallColor": "#F4F1EA"
    }
  ],
  "furniture": [
    {
      "id": "f1",
      "roomId": "r1",
      "catalogId": "sofa_3_seater",
      "name": "Sofá 3 Lugares",
      "position": { "x": 2.1, "y": 0.0, "z": 0.65 },
      "rotationY": 0.0,
      "dimensions": { "width": 2.2, "depth": 0.92, "height": 0.82 }
    }
  ]
}
```

### Mapeamento Interativo de Componentes e Estado

- **PreprocessWorkspace**: Executa filtros reais em pixel buffer no `<canvas>` (rotação em graus, correção de trapézio/perspectiva horizontal e vertical, ganho de contraste, remoção de ruído mediana e limiarização P&B), converte PDFs ou imagens de entrada e envia o frame tratado ao endpoint `/api/floorplan/analyze` ou aplica detecção geométrica vetorial local.
- **Editor2DCanvas**: Canvas vetorial interativo com zoom/pan, grade métrica, ferramenta de adição de parede com snapping ortogonal, inserção de portas/janelas sobre paredes existentes, **Régua de Calibração de Escala** (define `pixelsPerMeter` recalculando todas as coordenadas em metros), edição de polígonos de cômodos e botão de **"Regerar Mobiliário Automático"**.
- **Viewer3DCanvas**: Container WebGL isolado (`useRef`) com `RoomEnvironment` via `PMREMGenerator`, `ACESFilmicToneMapping`, geração de malhas de paredes com aberturas reais (subtração geométrica de vãos de portas e janelas com molduras, folhas de porta entreabertas e vidros físicos), pisos texturizados proceduralmente por cômodo, rodapés e mobiliário composto.
  - **Interação Direta 3D**: Raycasting otimizado permitindo clicar em qualquer móvel para selecioná-lo, arrastá-lo pelo plano do piso com restrição de colisão, girá-lo em 45°/90°, trocá-lo ou excluí-lo.
  - **4 Modos de Tour**:
    1. *Órbita (Maquete)*: Controle suave com amortecimento exponencial.
    2. *Dollhouse (Corte)*: Oculta automaticamente o teto e rebaixa paredes frontais voltadas para a câmera para visão desimpedida do interior.
    3. *Primeira Pessoa (Caminhada)*: Altura dos olhos fixa em `1,60 m`, movimentação `WASD` / Setas + controles virtuais na tela para celular, e verificação de colisão circular contra paredes e móveis.
    4. *Tour Guiado Automático*: Interpola suavemente a câmera entre o centro de cada cômodo nomeado, exibindo um cartão discreto com nome do ambiente, área em `m²` e acabamento.

---

## 6. Roadmap em Fases (MVP → V2 → V3)

- **Fase 1 — MVP Executável (Implementado nesta entrega)**:
  - Upload de imagem/PDF e câmera, filtros de pré-processamento (perspectiva, rotação, contraste, ruído), análise híbrida via Gemini Vision (`gemini-4-argon`) + detector geométrico local, 3 plantas completas de demonstração, Editor 2D com calibração de escala obrigatória, extrusão 3D com recortes de portas/janelas, auto-decoração sem colisão, 6 estilos em tempo real, 4 modos de tour (incluindo 1ª pessoa a 1,60 m e tour guiado), personalização de marca do corretor, captura de foto PNG, gravação de vídeo WebM do tour e links públicos de compartilhamento.
- **Fase 2 — V2 (Expansão SaaS & Catálogo Comercial)**:
  - Integração com catálogos reais de fabricantes (modelos GLB/KTX2 hospedados em CDN com compressão Meshopt), geração de orçamento estimado de reforma/decoração por m² e autenticação multi-corretor por imobiliária com controle de permissões.
- **Fase 3 — V3 (Multi-Pavimentos, WebXR & Render Cloud)**:
  - Suporte a escadas e múltiplos andares empilhados com alinhamento de prumadas, modo imersivo WebXR para óculos Meta Quest / Apple Vision Pro e renderização fotorealista estática via Path Tracing em nuvem.

---

## 7. Plano de Testes e Critérios de Aceite Mensuráveis

1. **Precisão Geométrica e Escala**:
   - *Critério*: Ao calibrar uma parede de referência com `4,00 m`, todas as demais paredes e áreas (`m²`) devem refletir a razão métrica com erro `< 1%`.
2. **Pipeline de Visão e Fallback Resiliente**:
   - *Critério*: Plantas limpas devem detectar `> 90%` das paredes externas e internas; caso uma imagem ilegível seja enviada, o sistema deve retornar diagnóstico estruturado em `< 5 s` e abrir o Editor 2D assistido sem travar a aplicação.
3. **Zero Colisões na Decoração Automática**:
   - *Critério*: `100%` dos móveis posicionados automaticamente devem estar contidos dentro do polígono do respectivo cômodo e respeitar raio livre de `0,80 m` junto às portas.
4. **Desempenho de Renderização e Responsividade**:
   - *Critério*: Manter `60 fps` em perfil Alto/Médio em desktops e `>= 30 fps` em dispositivos móveis ou software WebGL, com carregamento inicial `< 3 s` e zero dependências externas quebradas (404).
