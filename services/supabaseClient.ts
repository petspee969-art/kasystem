
// Agora aponta para o servidor local criado em server.js
export const API_URL = 'http://localhost:3001/api';

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
