
// Agora aponta para o servidor local criado em server.js
// Usando 127.0.0.1 para evitar problemas de resolução de DNS (IPv4 vs IPv6) no Windows
export const API_URL = 'http://127.0.0.1:3001/api';

// Mantemos um objeto vazio 'supabase' apenas para não quebrar imports que talvez não tenham sido migrados, 
// mas funcionalmente ele não faz nada.
export const supabase = {
    channel: () => ({
        on: () => ({
            subscribe: () => {}
        })
    }),
    removeChannel: () => {}
};
