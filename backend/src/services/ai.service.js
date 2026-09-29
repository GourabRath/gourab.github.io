const { GoogleGenAI } = require('@google/genai');

class AIService {
  constructor() {
    // Initialize the SDK. It will automatically use process.env.GEMINI_API_KEY
    try {
      this.ai = new GoogleGenAI({});
    } catch (error) {
      console.warn("GoogleGenAI initialized without API key. Add GEMINI_API_KEY to .env to enable AI features.");
    }
  }

  async getSymptomGuidance(patientMessage) {
    if (!this.ai) return "AI service is not configured. Please add GEMINI_API_KEY.";

    const systemInstruction = `
      You are an AI Healthcare Assistant for MediCare Hospital.
      Your primary role is to provide symptom guidance, suggest relevant medical specialties, and generate summaries.
      
      CRITICAL SAFETY RULES:
      - NEVER claim to provide a definitive diagnosis.
      - NEVER prescribe medication independently.
      - NEVER replace a human doctor.
      - ALWAYS encourage professional consultation.
      - IF the symptoms sound like an emergency (e.g., severe chest pain, stroke symptoms, severe bleeding), you MUST immediately recommend calling emergency services or visiting the ER.
      
      Format your response with the following sections if applicable:
      - Possible General Causes
      - Recommended Action (including suggested specialty)
      - Urgent Warning Signs
    `;

    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: patientMessage,
        config: {
          systemInstruction: systemInstruction,
          temperature: 0.2, // Keep it deterministic and safe
        }
      });

      return response.text;
    } catch (error) {
      console.error("AI Error:", error);
      throw new Error("Failed to generate AI guidance. Check your API key.");
    }
  }
}

module.exports = new AIService();

