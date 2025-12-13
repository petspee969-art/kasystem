
// Verifica se estamos rodando em produção (buildado pelo Vite)
// @ts-ignore
const isProduction = import.meta.env.PROD;

// Em produção (nuvem), usamos caminho relativo '/api' para que o navegador use o mesmo domínio do site.
// Em desenvolvimento local, apontamos para o servidor Node fixo.
export const API_URL = isProduction ? '/api' : 'http://127.0.0.1:3001/api';

// Mantemos um objeto vazio 'supabase' apenas para compatibilidade de tipos
export const supabase = {
    channel: () => ({
        on: () => ({
            subscribe: () => {}
        })
    }),
    removeChannel: () => {}
};
