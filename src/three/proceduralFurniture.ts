import * as THREE from 'three';
import {
  FurnitureInstance,
  OpeningItem,
  StyleDefinition,
} from '../types/floorplan';
import { getContactShadowTexture } from './proceduralTextures';

/**
 * Cria geometria extrudada com chanfro (bevel) para estofados, colchões e bancadas,
 * garantindo leitura de silhueta realista e reflexos especulares suaves nas bordas.
 */
function createBeveledBlock(
  width: number,
  height: number,
  depth: number,
  bevel = 0.025
): THREE.ExtrudeGeometry {
  const w = Math.max(0.05, width - bevel * 2);
  const d = Math.max(0.05, depth - bevel * 2);
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, -d / 2);
  shape.lineTo(w / 2, -d / 2);
  shape.lineTo(w / 2, d / 2);
  shape.lineTo(-w / 2, d / 2);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    steps: 1,
    depth: Math.max(0.02, height - bevel * 2),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
  });
  geo.rotateX(-Math.PI / 2);
  geo.computeBoundingBox();
  const minY = geo.boundingBox ? geo.boundingBox.min.y : 0;
  geo.translate(0, -minY, 0);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Adiciona plano de sombra de contato radial suave sob o móvel (evita aspecto flutuante).
 */
function addContactShadowPlane(
  group: THREE.Group,
  width: number,
  depth: number
) {
  const shadowGeo = new THREE.PlaneGeometry(width * 1.18, depth * 1.18);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: getContactShadowTexture(),
    transparent: true,
    depthWrite: false,
    opacity: 0.55,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
  shadowMesh.position.y = 0.008;
  group.add(shadowMesh);
}

/**
 * Constrói um modelo 3D procedural composto (de 4 a 12 partes distintas em THREE.Group)
 * para cada item do catálogo de mobiliário, variando rugosidade e metalicidade conforme o estilo ativo.
 * Pivô sempre na base central (y = 0) alinhado ao piso.
 */
export function buildProceduralFurnitureGroup(
  item: FurnitureInstance,
  style: StyleDefinition,
  isSelected: boolean,
  isSoftwareGl: boolean
): THREE.Group {
  const group = new THREE.Group();
  group.name = item.id;
  group.userData = {
    furnitureId: item.id,
    catalogId: item.catalogId,
    roomId: item.roomId,
    isFurnitureRoot: true,
  };

  const { width: W, depth: D, height: H } = item.dimensions;

  // Materiais PBR coordenados pelo estilo arquitetônico selecionado
  const woodMat = new THREE.MeshStandardMaterial({
    color: style.woodColor,
    roughness: style.woodRoughness,
    metalness: 0.05,
  });

  const fabricPrimaryMat = new THREE.MeshStandardMaterial({
    color: style.fabricPrimaryColor,
    roughness: 0.85,
    metalness: 0.02,
  });

  const fabricSecondaryMat = new THREE.MeshStandardMaterial({
    color: style.fabricSecondaryColor,
    roughness: 0.78,
    metalness: 0.04,
  });

  const metalMat = new THREE.MeshStandardMaterial({
    color: style.metalColor,
    roughness: style.metalRoughness,
    metalness: style.metalness,
  });

  const stoneMat = new THREE.MeshStandardMaterial({
    color: style.stoneColor,
    roughness: 0.22,
    metalness: 0.08,
  });

  const ceramicWhiteMat = new THREE.MeshPhysicalMaterial({
    color: '#F8FAFC',
    roughness: 0.14,
    metalness: 0.05,
    clearcoat: 0.6,
  });

  const darkScreenMat = new THREE.MeshPhysicalMaterial({
    color: '#0B0F17',
    roughness: 0.12,
    metalness: 0.4,
    clearcoat: 0.9,
  });

  // Sombra de contato sob o móvel
  addContactShadowPlane(group, W, D);

  if (item.catalogId === 'sofa_3_seater') {
    // 1. Tapete sob a área de estar
    const rugGeo = new THREE.BoxGeometry(W * 1.25, 0.012, D * 1.7);
    const rugMat = new THREE.MeshStandardMaterial({
      color: style.rugColor,
      roughness: 0.92,
      metalness: 0.0,
    });
    const rug = new THREE.Mesh(rugGeo, rugMat);
    rug.position.set(0, 0.006, D * 0.25);
    rug.receiveShadow = true;
    group.add(rug);

    // 2. Base estrutural em madeira maciça
    const base = new THREE.Mesh(
      createBeveledBlock(W, 0.12, D, 0.015),
      woodMat
    );
    base.position.y = 0.1;
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);

    // 3..6. Quatro pés cilíndricos metálicos/madeira
    const legGeo = new THREE.CylinderGeometry(0.022, 0.016, 0.1, 12);
    const legOffsets = [
      [-W * 0.44, -D * 0.4],
      [W * 0.44, -D * 0.4],
      [-W * 0.44, D * 0.4],
      [W * 0.44, D * 0.4],
    ];
    for (const [lx, lz] of legOffsets) {
      const leg = new THREE.Mesh(legGeo, metalMat);
      leg.position.set(lx, 0.05, lz);
      leg.castShadow = true;
      group.add(leg);
    }

    // 7..9. Três almofadas de assento chanfradas
    const cushionW = (W - 0.34) / 3;
    for (let i = 0; i < 3; i++) {
      const seat = new THREE.Mesh(
        createBeveledBlock(cushionW - 0.02, 0.18, D * 0.78, 0.035),
        fabricPrimaryMat
      );
      seat.position.set(
        -cushionW + i * cushionW,
        0.21,
        D * 0.06
      );
      seat.castShadow = true;
      seat.receiveShadow = true;
      group.add(seat);

      // Encosto correspondente
      const back = new THREE.Mesh(
        createBeveledBlock(cushionW - 0.03, 0.42, 0.2, 0.035),
        fabricPrimaryMat
      );
      back.position.set(-cushionW + i * cushionW, 0.38, -D * 0.33);
      back.rotation.x = -0.1;
      back.castShadow = true;
      group.add(back);
    }

    // 10..11. Braços laterais estofados
    const armGeo = createBeveledBlock(0.16, 0.46, D * 0.94, 0.03);
    const leftArm = new THREE.Mesh(armGeo, fabricPrimaryMat);
    leftArm.position.set(-W / 2 + 0.08, 0.16, 0);
    leftArm.castShadow = true;
    group.add(leftArm);

    const rightArm = new THREE.Mesh(armGeo, fabricPrimaryMat);
    rightArm.position.set(W / 2 - 0.08, 0.16, 0);
    rightArm.castShadow = true;
    group.add(rightArm);

    // 12. Almofadas decorativas de contraste
    const pillowGeo = createBeveledBlock(0.32, 0.28, 0.12, 0.03);
    const p1 = new THREE.Mesh(pillowGeo, fabricSecondaryMat);
    p1.position.set(-W * 0.32, 0.4, -D * 0.16);
    p1.rotation.set(0.15, 0.25, 0);
    group.add(p1);

    const p2 = new THREE.Mesh(pillowGeo, fabricSecondaryMat);
    p2.position.set(W * 0.32, 0.4, -D * 0.16);
    p2.rotation.set(0.15, -0.25, 0);
    group.add(p2);
  } else if (item.catalogId === 'tv_console') {
    // 1. Painel ripado de fundo
    const panel = new THREE.Mesh(
      createBeveledBlock(W, H, 0.04, 0.01),
      woodMat
    );
    panel.position.set(0, 0.15, -D / 2 + 0.03);
    panel.castShadow = true;
    group.add(panel);

    // 2. Rack baixo suspenso
    const consoleBody = new THREE.Mesh(
      createBeveledBlock(W, 0.36, D * 0.88, 0.02),
      woodMat
    );
    consoleBody.position.set(0, 0.14, 0.02);
    consoleBody.castShadow = true;
    consoleBody.receiveShadow = true;
    group.add(consoleBody);

    // 3. Tampo de pedra no rack
    const topSlab = new THREE.Mesh(
      createBeveledBlock(W + 0.02, 0.03, D * 0.9, 0.008),
      stoneMat
    );
    topSlab.position.set(0, 0.5, 0.02);
    group.add(topSlab);

    // 4. Smart TV OLED 65"
    const tvScreen = new THREE.Mesh(
      createBeveledBlock(W * 0.78, 0.78, 0.03, 0.006),
      darkScreenMat
    );
    tvScreen.position.set(0, 0.68, -D * 0.25);
    tvScreen.castShadow = true;
    group.add(tvScreen);

    // 5. Soundbar metálica
    const soundbar = new THREE.Mesh(
      createBeveledBlock(W * 0.48, 0.055, 0.08, 0.01),
      metalMat
    );
    soundbar.position.set(0, 0.53, -0.02);
    group.add(soundbar);
  } else if (item.catalogId === 'coffee_table') {
    // 1. Tampo em pedra travertino/mármore chanfrado
    const tabletop = new THREE.Mesh(
      createBeveledBlock(W, 0.045, D, 0.015),
      stoneMat
    );
    tabletop.position.y = H - 0.045;
    tabletop.castShadow = true;
    tabletop.receiveShadow = true;
    group.add(tabletop);

    // 2..3. Duas bases esculturais cilindricas caneladas
    const pedGeo = new THREE.CylinderGeometry(0.14, 0.16, H - 0.045, 20);
    const ped1 = new THREE.Mesh(pedGeo, woodMat);
    ped1.position.set(-W * 0.26, (H - 0.045) / 2, 0);
    ped1.castShadow = true;
    group.add(ped1);

    const ped2 = new THREE.Mesh(pedGeo, woodMat);
    ped2.position.set(W * 0.26, (H - 0.045) / 2, 0);
    ped2.castShadow = true;
    group.add(ped2);

    // 4. Livro de arte decorativo
    const book = new THREE.Mesh(
      createBeveledBlock(0.28, 0.035, 0.22, 0.005),
      fabricSecondaryMat
    );
    book.position.set(-0.18, H, 0.04);
    book.rotation.y = 0.2;
    group.add(book);

    // 5. Vaso cerâmico em LatheGeometry
    const vasePts = [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(0.06, 0),
      new THREE.Vector2(0.09, 0.08),
      new THREE.Vector2(0.05, 0.18),
      new THREE.Vector2(0.065, 0.22),
    ];
    const vaseGeo = new THREE.LatheGeometry(vasePts, 18);
    const vase = new THREE.Mesh(vaseGeo, ceramicWhiteMat);
    vase.position.set(0.22, H, -0.04);
    vase.castShadow = true;
    group.add(vase);
  } else if (item.catalogId === 'dining_table_4') {
    // 1. Tampo da mesa de jantar
    const top = new THREE.Mesh(
      createBeveledBlock(W, 0.05, D, 0.015),
      woodMat
    );
    top.position.y = H - 0.05;
    top.castShadow = true;
    top.receiveShadow = true;
    group.add(top);

    // 2..5. Quatro pernas torneadas
    const legGeo = new THREE.CylinderGeometry(0.03, 0.02, H - 0.05, 14);
    const legPos = [
      [-W * 0.42, -D * 0.38],
      [W * 0.42, -D * 0.38],
      [-W * 0.42, D * 0.38],
      [W * 0.42, D * 0.38],
    ];
    for (const [lx, lz] of legPos) {
      const leg = new THREE.Mesh(legGeo, metalMat);
      leg.position.set(lx, (H - 0.05) / 2, lz);
      leg.castShadow = true;
      group.add(leg);
    }

    // 6..9. Quatro cadeiras estofadas ao redor
    const chairOffsets = [
      { x: -W * 0.24, z: -D * 0.56, rot: 0 },
      { x: W * 0.24, z: -D * 0.56, rot: 0 },
      { x: -W * 0.24, z: D * 0.56, rot: Math.PI },
      { x: W * 0.24, z: D * 0.56, rot: Math.PI },
    ];
    for (const ch of chairOffsets) {
      const chairGroup = new THREE.Group();
      const seat = new THREE.Mesh(
        createBeveledBlock(0.44, 0.06, 0.42, 0.015),
        fabricPrimaryMat
      );
      seat.position.y = 0.44;
      const back = new THREE.Mesh(
        createBeveledBlock(0.42, 0.36, 0.05, 0.015),
        fabricPrimaryMat
      );
      back.position.set(0, 0.62, -0.18);
      const cBase = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02, 0.18, 0.44, 12),
        metalMat
      );
      cBase.position.y = 0.22;
      chairGroup.add(seat, back, cBase);
      chairGroup.position.set(ch.x, 0, ch.z);
      chairGroup.rotation.y = ch.rot;
      group.add(chairGroup);
    }
  } else if (item.catalogId === 'queen_bed') {
    // 1. Cabeceira estofada arquitetônica
    const headboard = new THREE.Mesh(
      createBeveledBlock(W + 0.12, H, 0.14, 0.03),
      fabricSecondaryMat
    );
    headboard.position.set(0, 0, -D / 2 + 0.07);
    headboard.castShadow = true;
    group.add(headboard);

    // 2. Base box em madeira
    const bedFrame = new THREE.Mesh(
      createBeveledBlock(W, 0.26, D - 0.12, 0.015),
      woodMat
    );
    bedFrame.position.set(0, 0.06, 0.05);
    bedFrame.castShadow = true;
    group.add(bedFrame);

    // 3. Colchão ortopédico chanfrado
    const mattress = new THREE.Mesh(
      createBeveledBlock(W - 0.06, 0.26, D - 0.18, 0.04),
      ceramicWhiteMat
    );
    mattress.position.set(0, 0.31, 0.05);
    mattress.castShadow = true;
    mattress.receiveShadow = true;
    group.add(mattress);

    // 4. Edredom / Peseira têxtil
    const blanket = new THREE.Mesh(
      createBeveledBlock(W - 0.02, 0.28, D * 0.58, 0.04),
      fabricPrimaryMat
    );
    blanket.position.set(0, 0.31, D * 0.2);
    blanket.castShadow = true;
    group.add(blanket);

    // 5..8. Quatro travesseiros chanfrados
    const pillowGeo = createBeveledBlock(W * 0.38, 0.12, 0.28, 0.03);
    for (const side of [-1, 1]) {
      const pBack = new THREE.Mesh(pillowGeo, ceramicWhiteMat);
      pBack.position.set(side * (W * 0.22), 0.58, -D * 0.32);
      pBack.rotation.x = 0.22;
      group.add(pBack);

      const pFront = new THREE.Mesh(pillowGeo, fabricSecondaryMat);
      pFront.position.set(side * (W * 0.22), 0.59, -D * 0.18);
      pFront.rotation.x = 0.3;
      group.add(pFront);
    }
  } else if (item.catalogId === 'wardrobe_sliding') {
    // 1. Corpo principal do guarda-roupa
    const body = new THREE.Mesh(
      createBeveledBlock(W, H, D, 0.015),
      woodMat
    );
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // 2..4. Três portas de correr com textura acetinada e puxadores verticais
    const doorW = (W - 0.08) / 3;
    for (let i = 0; i < 3; i++) {
      const door = new THREE.Mesh(
        createBeveledBlock(doorW - 0.015, H - 0.08, 0.03, 0.008),
        i === 1 ? stoneMat : fabricPrimaryMat
      );
      door.position.set(
        -doorW + i * doorW,
        0.04,
        D / 2 + (i % 2 === 0 ? 0.008 : -0.005)
      );
      group.add(door);

      // Puxador metálico
      const handle = new THREE.Mesh(
        new THREE.BoxGeometry(0.018, 0.9, 0.025),
        metalMat
      );
      handle.position.set(
        -doorW + i * doorW + doorW * 0.36,
        H * 0.48,
        D / 2 + 0.025
      );
      group.add(handle);
    }
  } else if (item.catalogId === 'nightstand') {
    // 1. Gabinete da mesa de cabeceira
    const cab = new THREE.Mesh(
      createBeveledBlock(W, 0.46, D, 0.015),
      woodMat
    );
    cab.position.y = 0.08;
    cab.castShadow = true;
    group.add(cab);

    // 2. Abajur escultural em LatheGeometry
    const lampBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.08, 0.18, 16),
      metalMat
    );
    lampBase.position.set(0, 0.63, 0);
    group.add(lampBase);

    const lampShade = new THREE.Mesh(
      new THREE.ConeGeometry(0.14, 0.18, 20, 1, true),
      new THREE.MeshStandardMaterial({
        color: '#FFFBEB',
        emissive: '#F59E0B',
        emissiveIntensity: 0.35,
        roughness: 0.6,
        side: THREE.DoubleSide,
      })
    );
    lampShade.position.set(0, 0.76, 0);
    group.add(lampShade);
  } else if (item.catalogId === 'kitchen_counter_sink') {
    // 1. Gabinete inferior em marcenaria
    const baseCab = new THREE.Mesh(
      createBeveledBlock(W, H - 0.05, D, 0.015),
      woodMat
    );
    baseCab.castShadow = true;
    baseCab.receiveShadow = true;
    group.add(baseCab);

    // 2. Tampo de quartzo/granito
    const stoneTop = new THREE.Mesh(
      createBeveledBlock(W + 0.03, 0.05, D + 0.03, 0.01),
      stoneMat
    );
    stoneTop.position.y = H - 0.05;
    stoneTop.castShadow = true;
    group.add(stoneTop);

    // 3. Cuba esculpida em inox
    const sinkBasin = new THREE.Mesh(
      new THREE.BoxGeometry(0.56, 0.02, 0.38),
      metalMat
    );
    sinkBasin.position.set(-W * 0.15, H + 0.002, 0);
    group.add(sinkBasin);

    // 4. Torneira gourmet curva em TubeGeometry
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-W * 0.15, H, -0.18),
      new THREE.Vector3(-W * 0.15, H + 0.28, -0.18),
      new THREE.Vector3(-W * 0.15, H + 0.32, -0.06),
      new THREE.Vector3(-W * 0.15, H + 0.22, -0.02),
    ]);
    const faucetGeo = new THREE.TubeGeometry(curve, 20, 0.014, 10, false);
    const faucet = new THREE.Mesh(faucetGeo, metalMat);
    faucet.castShadow = true;
    group.add(faucet);
  } else if (item.catalogId === 'refrigerator_duplex') {
    const stainlessMat = new THREE.MeshStandardMaterial({
      color: '#CBD5E1',
      roughness: 0.24,
      metalness: 0.88,
    });
    // 1. Gabinete principal
    const body = new THREE.Mesh(
      createBeveledBlock(W, H, D * 0.9, 0.02),
      stainlessMat
    );
    body.position.z = -0.03;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // 2..3. Portas superiores e freezer inferior
    const topDoor = new THREE.Mesh(
      createBeveledBlock(W - 0.02, H * 0.58, 0.05, 0.012),
      stainlessMat
    );
    topDoor.position.set(0, H * 0.39, D * 0.45);
    group.add(topDoor);

    const botDoor = new THREE.Mesh(
      createBeveledBlock(W - 0.02, H * 0.36, 0.05, 0.012),
      stainlessMat
    );
    botDoor.position.set(0, H * 0.02, D * 0.45);
    group.add(botDoor);

    // 4. Painel digital e dispenser
    const dispenser = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.26, 0.02),
      darkScreenMat
    );
    dispenser.position.set(-W * 0.2, H * 0.62, D * 0.48);
    group.add(dispenser);
  } else if (item.catalogId === 'stove_oven') {
    // 1. Corpo do fogão/forno
    const body = new THREE.Mesh(
      createBeveledBlock(W, H, D, 0.015),
      metalMat
    );
    body.castShadow = true;
    group.add(body);

    // 2. Visor do forno em vidro escuro
    const ovenGlass = new THREE.Mesh(
      new THREE.BoxGeometry(W * 0.78, H * 0.52, 0.02),
      darkScreenMat
    );
    ovenGlass.position.set(0, H * 0.42, D / 2 + 0.005);
    group.add(ovenGlass);

    // 3..6. Quatro queimadores circulares no cooktop
    const burnerGeo = new THREE.CylinderGeometry(0.08, 0.09, 0.02, 16);
    const bCoords = [
      [-W * 0.24, -D * 0.22],
      [W * 0.24, -D * 0.22],
      [-W * 0.24, D * 0.22],
      [W * 0.24, D * 0.22],
    ];
    for (const [bx, bz] of bCoords) {
      const burner = new THREE.Mesh(burnerGeo, darkScreenMat);
      burner.position.set(bx, H + 0.01, bz);
      group.add(burner);
    }
  } else if (item.catalogId === 'bathroom_vanity') {
    // 1. Gabinete suspenso em madeira
    const cabinet = new THREE.Mesh(
      createBeveledBlock(W, 0.48, D, 0.015),
      woodMat
    );
    cabinet.position.y = 0.34;
    cabinet.castShadow = true;
    group.add(cabinet);

    // 2. Bancada de pedra
    const counter = new THREE.Mesh(
      createBeveledBlock(W + 0.02, 0.06, D + 0.02, 0.01),
      stoneMat
    );
    counter.position.y = 0.82;
    group.add(counter);

    // 3. Cuba de apoio cerâmica
    const vessel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.19, 0.15, 0.13, 24),
      ceramicWhiteMat
    );
    vessel.position.set(0, 0.94, 0.02);
    vessel.castShadow = true;
    group.add(vessel);

    // 4. Espelho redondo retroiluminado na parede
    const mirror = new THREE.Mesh(
      new THREE.CylinderGeometry(0.36, 0.36, 0.025, 32),
      new THREE.MeshPhysicalMaterial({
        color: '#E2E8F0',
        roughness: 0.05,
        metalness: 0.95,
        clearcoat: 1.0,
      })
    );
    mirror.rotation.x = Math.PI / 2;
    mirror.position.set(0, 1.42, -D / 2 + 0.02);
    group.add(mirror);
  } else if (item.catalogId === 'toilet_modern') {
    // 1. Base esculpida da bacia sanitária
    const bowl = new THREE.Mesh(
      createBeveledBlock(W * 0.86, 0.41, D * 0.85, 0.04),
      ceramicWhiteMat
    );
    bowl.position.set(0, 0, 0.04);
    bowl.castShadow = true;
    group.add(bowl);

    // 2. Caixa acoplada
    const tank = new THREE.Mesh(
      createBeveledBlock(W * 0.92, 0.38, 0.2, 0.02),
      ceramicWhiteMat
    );
    tank.position.set(0, 0.4, -D / 2 + 0.12);
    tank.castShadow = true;
    group.add(tank);

    // 3. Botão de acionamento duplo cromado
    const flushBtn = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 0.015, 16),
      metalMat
    );
    flushBtn.position.set(0, 0.79, -D / 2 + 0.12);
    group.add(flushBtn);
  } else if (item.catalogId === 'shower_box') {
    // 1. Piso rebaixado de pedra do box
    const tray = new THREE.Mesh(
      createBeveledBlock(W, 0.04, D, 0.008),
      stoneMat
    );
    tray.receiveShadow = true;
    group.add(tray);

    // 2. Painel de vidro temperado transparente
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: '#E0F2FE',
      roughness: 0.08,
      metalness: 0.05,
      transmission: isSoftwareGl ? 0 : 0.88,
      transparent: true,
      opacity: isSoftwareGl ? 0.32 : 0.95,
      ior: 1.52,
      depthWrite: false,
    });
    const glassPanel = new THREE.Mesh(
      new THREE.BoxGeometry(W, H - 0.06, 0.015),
      glassMat
    );
    glassPanel.position.set(0, H / 2, D / 2 - 0.02);
    glassPanel.renderOrder = 4;
    group.add(glassPanel);

    // 3. Trilho superior metálico
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(W, 0.035, 0.035),
      metalMat
    );
    rail.position.set(0, H - 0.03, D / 2 - 0.02);
    group.add(rail);

    // 4. Ducha de teto
    const showerHead = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.14, 0.02, 20),
      metalMat
    );
    showerHead.position.set(0, H - 0.12, -D * 0.18);
    group.add(showerHead);
  } else if (item.catalogId === 'office_desk') {
    // 1. Tampo da mesa executiva
    const top = new THREE.Mesh(
      createBeveledBlock(W, 0.04, D, 0.012),
      woodMat
    );
    top.position.y = 0.72;
    top.castShadow = true;
    group.add(top);

    // 2..3. Cavaletes laterais metálicos
    const frameGeo = new THREE.BoxGeometry(0.05, 0.72, D * 0.86);
    const fLeft = new THREE.Mesh(frameGeo, metalMat);
    fLeft.position.set(-W * 0.44, 0.36, 0);
    const fRight = new THREE.Mesh(frameGeo, metalMat);
    fRight.position.set(W * 0.44, 0.36, 0);
    group.add(fLeft, fRight);

    // 4. Monitor Ultrawide
    const monitor = new THREE.Mesh(
      createBeveledBlock(0.68, 0.32, 0.025, 0.006),
      darkScreenMat
    );
    monitor.position.set(0, 0.84, -D * 0.22);
    group.add(monitor);

    // 5. Cadeira ergonômica
    const seat = new THREE.Mesh(
      createBeveledBlock(0.48, 0.06, 0.46, 0.015),
      fabricSecondaryMat
    );
    seat.position.set(0, 0.45, D * 0.45);
    const back = new THREE.Mesh(
      createBeveledBlock(0.46, 0.48, 0.05, 0.015),
      fabricSecondaryMat
    );
    back.position.set(0, 0.68, D * 0.66);
    group.add(seat, back);
  } else {
    // Poltrona de leitura ou Vaso de Planta Ornamental
    if (item.catalogId === 'indoor_plant') {
      const potPts = [
        new THREE.Vector2(0, 0),
        new THREE.Vector2(0.16, 0),
        new THREE.Vector2(0.22, 0.38),
        new THREE.Vector2(0.19, 0.42),
      ];
      const pot = new THREE.Mesh(
        new THREE.LatheGeometry(potPts, 20),
        ceramicWhiteMat
      );
      pot.castShadow = true;
      group.add(pot);

      const foliageMat = new THREE.MeshStandardMaterial({
        color: '#2E5A36',
        roughness: 0.55,
        metalness: 0.02,
      });

      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        const leaf = new THREE.Mesh(
          createBeveledBlock(0.22, 0.42, 0.03, 0.01),
          foliageMat
        );
        leaf.position.set(
          Math.cos(angle) * 0.14,
          0.52 + (i % 2) * 0.12,
          Math.sin(angle) * 0.14
        );
        leaf.rotation.y = -angle;
        leaf.rotation.z = 0.35;
        leaf.castShadow = true;
        group.add(leaf);
      }
    } else {
      // Poltrona Lounge
      const base = new THREE.Mesh(
        createBeveledBlock(W * 0.9, 0.32, D * 0.9, 0.03),
        fabricPrimaryMat
      );
      base.position.y = 0.12;
      base.castShadow = true;
      const back = new THREE.Mesh(
        createBeveledBlock(W * 0.88, 0.46, 0.18, 0.03),
        fabricPrimaryMat
      );
      back.position.set(0, 0.34, -D * 0.32);
      back.rotation.x = -0.15;
      back.castShadow = true;
      group.add(base, back);
    }
  }

  // Anel indicador de seleção quando o usuário clica no móvel no viewport 3D
  if (isSelected) {
    const ringGeo = new THREE.RingGeometry(
      Math.max(W, D) * 0.58,
      Math.max(W, D) * 0.64,
      36
    );
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: '#F59E0B',
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 0.015;
    group.add(ring);
  }

  group.position.set(item.position.x, 0, item.position.z);
  group.rotation.y = item.rotationY;

  return group;
}

/**
 * Constrói uma esquadria 3D composta (Porta com batente, folha semiaberta e maçaneta,
 * ou Janela com caixilho, peitoril de pedra, montantes e vidro físico).
 */
export function buildOpeningMeshGroup(
  opening: OpeningItem,
  wallThickness: number,
  style: StyleDefinition,
  isSoftwareGl: boolean
): THREE.Group {
  const group = new THREE.Group();
  const frameDepth = wallThickness + 0.03;

  const frameMat = new THREE.MeshStandardMaterial({
    color: opening.type === 'door' ? style.woodColor : style.metalColor,
    roughness: opening.type === 'door' ? style.woodRoughness : 0.3,
    metalness: opening.type === 'door' ? 0.05 : 0.75,
  });

  if (opening.type === 'door') {
    const w = opening.width;
    const h = opening.height;

    // 1..3. Batentes laterais e superior
    const jambGeo = new THREE.BoxGeometry(0.045, h, frameDepth);
    const leftJamb = new THREE.Mesh(jambGeo, frameMat);
    leftJamb.position.set(-w / 2 + 0.022, h / 2, 0);
    const rightJamb = new THREE.Mesh(jambGeo, frameMat);
    rightJamb.position.set(w / 2 - 0.022, h / 2, 0);
    const topJamb = new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.045, frameDepth),
      frameMat
    );
    topJamb.position.set(0, h - 0.022, 0);
    group.add(leftJamb, rightJamb, topJamb);

    // 4. Folha da porta entreaberta (25 graus) para permitir passagem visual e em 1ª pessoa
    const pivotGroup = new THREE.Group();
    pivotGroup.position.set(-w / 2 + 0.04, 0, 0);
    const leaf = new THREE.Mesh(
      new THREE.BoxGeometry(w - 0.08, h - 0.04, 0.042),
      frameMat
    );
    leaf.position.set((w - 0.08) / 2, (h - 0.04) / 2, 0);
    leaf.castShadow = true;
    pivotGroup.add(leaf);

    // 5. Maçaneta metálica dupla
    const handleMat = new THREE.MeshStandardMaterial({
      color: style.metalColor,
      roughness: 0.2,
      metalness: 0.9,
    });
    const handle = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.022, 0.14),
      handleMat
    );
    handle.position.set(w - 0.18, 1.0, 0);
    pivotGroup.add(handle);

    pivotGroup.rotation.y = opening.swing === 'right' ? -0.42 : 0.42;
    group.add(pivotGroup);
  } else {
    // Janela composta com peitoril, caixilho perimetral, montante central e vidro
    const w = opening.width;
    const h = opening.height;
    const elev = opening.elevation;

    // 1. Peitoril de pedra
    const sillMat = new THREE.MeshStandardMaterial({
      color: style.stoneColor,
      roughness: 0.25,
    });
    const sill = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.08, 0.04, frameDepth + 0.05),
      sillMat
    );
    sill.position.set(0, elev + 0.02, 0);
    group.add(sill);

    // 2. Moldura perimetral e montante central
    const topBar = new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.045, frameDepth),
      frameMat
    );
    topBar.position.set(0, elev + h - 0.022, 0);
    const leftBar = new THREE.Mesh(
      new THREE.BoxGeometry(0.045, h, frameDepth),
      frameMat
    );
    leftBar.position.set(-w / 2 + 0.022, elev + h / 2, 0);
    const rightBar = new THREE.Mesh(
      new THREE.BoxGeometry(0.045, h, frameDepth),
      frameMat
    );
    rightBar.position.set(w / 2 - 0.022, elev + h / 2, 0);
    const centerMullion = new THREE.Mesh(
      new THREE.BoxGeometry(0.035, h - 0.06, frameDepth * 0.8),
      frameMat
    );
    centerMullion.position.set(0, elev + h / 2, 0);
    group.add(topBar, leftBar, rightBar, centerMullion);

    // 3. Vidro arquitetônico translúcido
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: '#BAE6FD',
      roughness: 0.06,
      metalness: 0.05,
      transmission: isSoftwareGl ? 0 : 0.86,
      transparent: true,
      opacity: isSoftwareGl ? 0.3 : 0.92,
      ior: 1.5,
      depthWrite: false,
    });
    const glassPane = new THREE.Mesh(
      new THREE.BoxGeometry(w - 0.08, h - 0.08, 0.016),
      glassMat
    );
    glassPane.position.set(0, elev + h / 2, 0);
    glassPane.renderOrder = 3;
    group.add(glassPane);
  }

  return group;
}
