import * as THREE from 'three';
import { FloorMaterialId } from '../types/floorplan';

/**
 * Cache de texturas procedurais PBR para evitar recriação de Canvas e vazamento de memória GPU.
 */
const textureCache = new Map<string, THREE.CanvasTexture>();

/**
 * Gera texturas de piso 100% procedurais com alta nitidez (SRGBColorSpace + anisotropia máxima).
 * Nunca utiliza URLs externas sujeitas a erro 404.
 */
export function getProceduralFloorTexture(
  materialId: FloorMaterialId,
  maxAnisotropy = 4
): THREE.CanvasTexture {
  const key = `${materialId}_${maxAnisotropy}`;
  const cached = textureCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  if (materialId === 'oak_herringbone') {
    // Parquet Carvalho Espinha de Peixe
    ctx.fillStyle = '#C8A984';
    ctx.fillRect(0, 0, 512, 512);

    const w = 64;
    const h = 16;
    const tones = ['#CCA982', '#BE9A72', '#D4B48E', '#B58F67', '#C3A079'];

    for (let y = -64; y < 576; y += h) {
      for (let x = -64; x < 576; x += w) {
        const idx = Math.abs((x / w + y / h) | 0) % tones.length;
        ctx.save();
        ctx.translate(x, y);
        ctx.fillStyle = tones[idx];
        ctx.fillRect(0, 0, w - 1.5, h - 1.5);
        ctx.strokeStyle = 'rgba(70, 45, 22, 0.24)';
        ctx.lineWidth = 1;
        ctx.strokeRect(0, 0, w - 1.5, h - 1.5);

        // Veios sutis da madeira
        ctx.fillStyle = 'rgba(90, 58, 30, 0.08)';
        ctx.fillRect(4, h * 0.35, w - 10, 1.5);
        ctx.restore();
      }
    }
  } else if (materialId === 'warm_wood_planks') {
    // Tábua Corrida de Freijó / Nogueira
    ctx.fillStyle = '#966946';
    ctx.fillRect(0, 0, 512, 512);

    const plankH = 64;
    const tones = ['#9D6F4B', '#8E613E', '#A57753', '#875B39'];
    for (let row = 0; row < 8; row++) {
      const y = row * plankH;
      const offset = (row % 2) * 128;
      for (let col = -1; col < 3; col++) {
        const x = col * 256 + offset;
        ctx.fillStyle = tones[(row + col + 4) % tones.length];
        ctx.fillRect(x, y, 254, plankH - 2);

        // Veios longitudinais
        ctx.fillStyle = 'rgba(45, 25, 10, 0.12)';
        for (let g = 8; g < plankH - 6; g += 11) {
          ctx.fillRect(x + 6, y + g, 240, 1.5);
        }
      }
    }
  } else if (materialId === 'carrara_marble') {
    // Mármore Carrara Branco com Veios Cinza-Azulados
    ctx.fillStyle = '#F5F6F8';
    ctx.fillRect(0, 0, 512, 512);

    // Placas 256x256
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, 256, 256);
    ctx.strokeRect(256, 0, 256, 256);
    ctx.strokeRect(0, 256, 256, 256);
    ctx.strokeRect(256, 256, 256, 256);

    // Veios orgânicos
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.28)';
    ctx.lineWidth = 3;
    for (let v = 0; v < 9; v++) {
      ctx.beginPath();
      let vx = (v * 67) % 512;
      let vy = 0;
      ctx.moveTo(vx, vy);
      while (vy < 512) {
        vx += Math.sin(vy * 0.03 + v) * 18;
        vy += 32;
        ctx.lineTo(vx, vy);
      }
      ctx.stroke();
    }
  } else if (materialId === 'polished_concrete') {
    // Cimento Queimado Industrial
    ctx.fillStyle = '#8F969D';
    ctx.fillRect(0, 0, 512, 512);

    for (let i = 0; i < 480; i++) {
      const cx = (i * 97) % 512;
      const cy = (i * 53) % 512;
      const r = 10 + (i % 28);
      ctx.fillStyle =
        i % 2 === 0
          ? 'rgba(255, 255, 255, 0.035)'
          : 'rgba(30, 41, 59, 0.04)';
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.22)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(0, 0, 256, 256);
    ctx.strokeRect(256, 256, 256, 256);
  } else if (materialId === 'terracotta_rustic') {
    // Lajota Terracota Rústica
    ctx.fillStyle = '#9E5437';
    ctx.fillRect(0, 0, 512, 512);
    const tile = 128;
    const tones = ['#B35D3E', '#A45235', '#BC6748', '#984B30'];
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        ctx.fillStyle = tones[(r * 3 + c) % tones.length];
        ctx.fillRect(c * tile + 3, r * tile + 3, tile - 6, tile - 6);
      }
    }
  } else if (materialId === 'ceramic_grid') {
    // Cerâmica Acetinada de Áreas Molhadas
    ctx.fillStyle = '#CBD5E1';
    ctx.fillRect(0, 0, 512, 512);
    const tile = 64;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        ctx.fillStyle = (r + c) % 2 === 0 ? '#F1F5F9' : '#E8EEF5';
        ctx.fillRect(c * tile + 2, r * tile + 2, tile - 4, tile - 4);
      }
    }
  } else {
    // Porcelanato Acetinado Bege (porcelain_Beige)
    ctx.fillStyle = '#DED8CE';
    ctx.fillRect(0, 0, 512, 512);
    const tile = 256;
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 2; c++) {
        ctx.fillStyle = (r + c) % 2 === 0 ? '#EAE5DC' : '#E5DFD5';
        ctx.fillRect(c * tile + 2, r * tile + 2, tile - 4, tile - 4);
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2.2, 2.2);
  texture.anisotropy = maxAnisotropy;
  texture.needsUpdate = true;

  textureCache.set(key, texture);
  return texture;
}

/**
 * Gera uma textura radial suave para sombra de contato (Contact Shadow) sob móveis e estruturas.
 */
let cachedContactShadowTex: THREE.CanvasTexture | null = null;

export function getContactShadowTexture(): THREE.CanvasTexture {
  if (cachedContactShadowTex) return cachedContactShadowTex;

  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(64, 64, 8, 64, 64, 60);
  grad.addColorStop(0, 'rgba(10, 14, 20, 0.55)');
  grad.addColorStop(0.55, 'rgba(10, 14, 20, 0.22)');
  grad.addColorStop(1, 'rgba(10, 14, 20, 0.0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);

  cachedContactShadowTex = new THREE.CanvasTexture(canvas);
  cachedContactShadowTex.needsUpdate = true;
  return cachedContactShadowTex;
}
