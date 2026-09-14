import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { env, requireClassifierEnv } from '../src/config/env.js';
import { classifierInfo } from '../src/services/classificationService.js';

console.log('Classifier:', classifierInfo());
try {
  requireClassifierEnv();
  if (env.classifierProvider === 'disabled') {
    console.log('Classifier is disabled by configuration.');
    process.exit(0);
  }
  const ai = new GoogleGenAI({ apiKey: env.geminiApiKey });
  const response = await ai.models.generateContent({
    model: env.classifierModel,
    contents: 'Reply with exactly: OK',
    config: { thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL }, maxOutputTokens: 16 },
  });
  console.log('Classifier connection OK:', (response.text || '').trim());
} catch (error) {
  console.error('Classifier health check failed:', error.message || error);
  process.exitCode = 1;
}
