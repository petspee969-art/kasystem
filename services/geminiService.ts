import { GoogleGenAI } from "@google/genai";
import { Order } from "../types";

// Helper seguro para recuperar a API Key sem quebrar o app no navegador
const getApiKey = () => {
  try {
    // Verifica process.env de forma segura
    if (typeof process !== 'undefined' && process.env && process.env.API_KEY) {
      return process.env.API_KEY;
    }
    // Verifica import.meta.env (Padrão Vite) de forma segura
    // @ts-ignore
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_KEY) {
      // @ts-ignore
      return import.meta.env.VITE_API_KEY;
    }
  } catch (e) {
    console.warn("Erro ao ler variáveis de ambiente", e);
  }
  return '';
};

export const generateSalesAnalysis = async (orders: Order[]) => {
  try {
    const apiKey = getApiKey();

    if (!apiKey) {
      throw new Error("API Key não encontrada. Configure a variável API_KEY ou VITE_API_KEY.");
    }

    const ai = new GoogleGenAI({ apiKey });
    
    // Prepare data summary for the AI to minimize token usage
    const summary = orders.map(o => ({
      date: o.createdAt.split('T')[0],
      total: o.totalPieces,
      items: o.items.map(i => `${i.reference} (${i.color}) x${i.totalQty}`).join(', ')
    })).slice(-50); // Analyze last 50 orders to avoid hitting limits

    const prompt = `
      Atue como um analista de negócios sênior para uma confecção de roupas.
      Analise os seguintes dados de vendas recentes (JSON simplificado):
      ${JSON.stringify(summary)}
      
      Por favor, forneça um resumo executivo curto (máximo 3 parágrafos) em Português cobrindo:
      1. Tendências de vendas (está aumentando ou diminuindo?).
      2. Quais referências ou cores parecem ser os "Best Sellers".
      3. Sugestão de ação para a semana que vem.
      
      Não use markdown complexo, apenas texto corrido e bullet points simples.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    return response.text;
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Não foi possível gerar a análise no momento. Verifique a chave de API.";
  }
};