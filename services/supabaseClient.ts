
// Detecta URL da API baseado no ambiente
// Se estiver no Vite (porta 5173), aponta para o servidor Node na 3001.
// Se estiver em produção (mesmo domínio) ou servido pelo Node, usa caminho relativo.

const getApiUrl = () => {
    if (typeof window !== 'undefined') {
        if (window.location.port === '5173') {
            return 'http://127.0.0.1:3001/api';
        }
    }
    // Fallback seguro para produção ou mesma porta (caminho relativo)
    return '/api';
};

export const API_URL = getApiUrl();

// Mantemos um objeto vazio 'supabase' apenas para compatibilidade de tipos, 
// caso o código antigo ainda o referencie.
export const supabase = {
    channel: () => ({
        on: () => ({
            subscribe: () => {}
        })
    }),
    removeChannel: () => {}
};
