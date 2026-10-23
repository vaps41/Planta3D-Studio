import { GoogleGenAI, Type } from '@google/genai';

/**
 * Handler Serverless compatível com Vercel (/api/floorplan/analyze)
 * Utiliza o modelo multimodal gemini-4-argon para extrair paredes, portas, janelas, cômodos e escala.
 */
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido. Use POST.' });
  }

  const startTime = Date.now();

  try {
    const { imageBase64, mimeType } = req.body || {};
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return res
        .status(400)
        .json({ error: 'Nenhuma imagem válida foi enviada.' });
    }

    const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, '');
    const validMime =
      mimeType && /^image\/(png|jpeg|jpg|webp)$/i.test(mimeType)
        ? mimeType
        : 'image/jpeg';

    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const response = await ai.models.generateContent({
      model: 'gemini-4-argon',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: validMime,
              data: cleanBase64,
            },
          },
          {
            text: `Analise esta planta baixa imobiliária brasileira e retorne paredes (walls), aberturas (openings), cômodos (rooms), cotas lidas (detectedDimensions) e escala em metros (scale).`,
          },
        ],
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            legible: { type: Type.BOOLEAN },
            sourceType: { type: Type.STRING },
            projectName: { type: Type.STRING },
            warnings: { type: Type.ARRAY, items: { type: Type.STRING } },
            detectedDimensions: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            scale: {
              type: Type.OBJECT,
              properties: {
                pixelsPerMeter: { type: Type.NUMBER },
                calibrated: { type: Type.BOOLEAN },
                referenceLengthMeters: { type: Type.NUMBER },
                confidence: { type: Type.NUMBER },
              },
              required: [
                'pixelsPerMeter',
                'calibrated',
                'referenceLengthMeters',
                'confidence',
              ],
            },
            walls: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  startX: { type: Type.NUMBER },
                  startZ: { type: Type.NUMBER },
                  endX: { type: Type.NUMBER },
                  endZ: { type: Type.NUMBER },
                  thickness: { type: Type.NUMBER },
                  isExterior: { type: Type.BOOLEAN },
                },
                required: [
                  'id',
                  'startX',
                  'startZ',
                  'endX',
                  'endZ',
                  'thickness',
                  'isExterior',
                ],
              },
            },
            openings: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  wallId: { type: Type.STRING },
                  type: { type: Type.STRING },
                  offset: { type: Type.NUMBER },
                  width: { type: Type.NUMBER },
                },
                required: ['id', 'wallId', 'type', 'offset', 'width'],
              },
            },
            rooms: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  name: { type: Type.STRING },
                  type: { type: Type.STRING },
                  minX: { type: Type.NUMBER },
                  minZ: { type: Type.NUMBER },
                  maxX: { type: Type.NUMBER },
                  maxZ: { type: Type.NUMBER },
                  detectedText: { type: Type.STRING },
                },
                required: [
                  'id',
                  'name',
                  'type',
                  'minX',
                  'minZ',
                  'maxX',
                  'maxZ',
                ],
              },
            },
          },
          required: [
            'legible',
            'sourceType',
            'projectName',
            'warnings',
            'detectedDimensions',
            'scale',
            'walls',
            'openings',
            'rooms',
          ],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    return res.status(200).json({
      success: true,
      processingTimeMs: Date.now() - startTime,
      analysis: parsed,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro interno.';
    return res.status(500).json({ error: msg });
  }
}
