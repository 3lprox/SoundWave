
import { Injectable, inject, signal } from '@angular/core';
import { GoogleGenAI } from '@google/genai';
import { environment } from '../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class GeminiService {
  private ai: GoogleGenAI | null = null;
  public error = signal<string | null>(null);

  constructor() {
    // IMPORTANT: This check is for the Applet environment where process.env is available.
    if (typeof process !== 'undefined' && process.env && process.env.API_KEY) {
      this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    } else {
      console.error('API_KEY environment variable not found.');
      this.error.set('Gemini API key is not configured. AI features are disabled.');
    }
  }

  async generateTrackDescription(title: string, artist: string): Promise<string> {
    this.error.set(null);
    if (!this.ai) {
      const errorMessage = 'Gemini AI client is not initialized.';
      this.error.set(errorMessage);
      return Promise.reject(new Error(errorMessage));
    }

    if (!title.trim() || !artist.trim()) {
       return Promise.resolve('');
    }

    const model = 'gemini-2.5-flash';
    const prompt = `Generate a short, creative description for a song titled '${title}' by the artist '${artist}'. Make it sound like something you'd read on SoundCloud or a music blog. Keep it under 40 words and do not use markdown formatting.`;

    try {
      const response = await this.ai.models.generateContent({
        model: model,
        contents: prompt,
      });
      return response.text.trim();
    } catch (e) {
      console.error('Error generating description:', e);
      const errorMessage = 'Could not generate description. Please try again later.';
      this.error.set(errorMessage);
      return Promise.reject(new Error(errorMessage));
    }
  }
}
