const { GoogleGenAI } = require('@google/genai');

const DISCLAIMER = '\n\nDisclaimer: This is general information, not a diagnosis or treatment. Please consult a qualified healthcare professional. If you may be experiencing an emergency, contact local emergency services immediately.';
const UNAVAILABLE = `AI guidance is temporarily unavailable. Please contact a qualified healthcare professional; if this may be an emergency, contact local emergency services.${DISCLAIMER}`;

class AIService {
  constructor() {
    this.ai = null;
    if (process.env.GEMINI_API_KEY) {
      try {
        this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      } catch (_) {
        // Fail closed; startup and user-facing errors must not expose provider details.
      }
    }
  }

  async getSymptomGuidance(patientMessage) {
    if (!this.ai) return UNAVAILABLE;

    const systemInstruction = `
      You provide general symptom information only, never a diagnosis or treatment plan.
      Do not prescribe medication. Encourage consultation with a qualified healthcare professional.
      For possible emergencies (including severe chest pain, stroke symptoms, or severe bleeding),
      direct the user to local emergency services immediately. State uncertainty clearly.
    `;

    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: patientMessage,
        config: { systemInstruction, temperature: 0.2 },
      });
      const text = typeof response.text === 'string' ? response.text.trim() : '';
      return `${text || 'I could not provide guidance for that message.'}${DISCLAIMER}`;
    } catch (_) {
      // Never log symptom text or provider payloads; return a safe, non-success-shaped response.
      return UNAVAILABLE;
    }
  }
}

module.exports = new AIService();
