
import React, { useState } from 'react';
import { User } from '../types';
import { getUsers } from '../services/storageService';
import { Lock, User as UserIcon, Loader2, ServerCrash, Database, AlertCircle } from 'lucide-react';
import { BRANDING } from '../config/branding';

interface Props {
  onLogin: (user: User) => void;
}

const Login: React.FC<Props> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<React.ReactNode>('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Remove espaços em branco acidentais
    const cleanUser = username.trim();
    const cleanPass = password.trim();

    try {
      const users = await getUsers();
      
      if (!Array.isArray(users)) {
          throw new Error("Resposta inválida do servidor (formato incorreto).");
      }

      const validUser = users.find(u => u.username === cleanUser && u.password === cleanPass);
      
      if (validUser) {
        onLogin(validUser);
      } else {
        setError(
            <span className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                <span>Credenciais inválidas. Tente <b>admin</b> / <b>admin</b></span>
            </span>
        );
      }
    } catch (err: any) {
      console.error(err);
      
      let errorDetails = err.message || "Erro desconhecido";
      if (errorDetails.includes("Failed to fetch")) {
          errorDetails = "O servidor backend parece estar desligado.";
      }

      setError(
        <div className="text-left">
            <p className="font-bold flex items-center gap-1 text-red-800"><ServerCrash className="w-4 h-4" /> Falha na Comunicação</p>
            <p className="mt-1 font-semibold text-red-700">{errorDetails}</p>
            
            <div className="mt-3 bg-white p-3 rounded border border-red-100 text-xs text-gray-600">
                <p className="font-bold mb-1">Checklist de Solução:</p>
                <ul className="list-disc ml-4 space-y-1">
                    <li>Verifique se o <strong>XAMPP</strong> está aberto e o <strong>MySQL</strong> está "Running" (Verde).</li>
                    <li>Verifique o terminal onde você rodou o comando. Ele deve mostrar: <code className="bg-gray-100 px-1 rounded">Backend rodando em http://127.0.0.1:3001</code></li>
                    <li>Se o erro for de banco de dados, verifique se a senha do root no arquivo <code>server.js</code> está correta.</li>
                </ul>
            </div>
        </div>
      );
    } finally {
      setLoading(false);
    }
  };

  const BrandIcon = BRANDING.DefaultIcon;

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8">
        <div className="text-center mb-8">
          {BRANDING.logoUrl ? (
             <img src={BRANDING.logoUrl} alt={BRANDING.appName} className="h-16 mx-auto mb-4 object-contain" />
          ) : (
            <div 
                className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4"
                style={{ backgroundColor: `${BRANDING.primaryColor}20`, color: BRANDING.primaryColor }} // 20 é alpha (transparência)
            >
               <BrandIcon className="w-8 h-8" />
            </div>
          )}
          <h1 className="text-3xl font-bold" style={{ color: BRANDING.primaryColor }}>{BRANDING.appName}</h1>
          <p className="text-gray-500 mt-2">{BRANDING.tagline}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-50 text-red-700 p-4 rounded-lg text-sm border border-red-200 shadow-inner">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Usuário / Email</label>
            <div className="relative">
              <UserIcon className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
              <input
                type="text"
                required
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 outline-none transition"
                style={{ '--tw-ring-color': BRANDING.primaryColor } as React.CSSProperties} // Hack para focus ring na cor da marca
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Digite seu usuário"
                disabled={loading}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Senha</label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
              <input
                type="password"
                required
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 outline-none transition"
                style={{ '--tw-ring-color': BRANDING.primaryColor } as React.CSSProperties}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={loading}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full text-white py-3 rounded-lg font-semibold shadow-md flex justify-center items-center disabled:opacity-70 disabled:cursor-not-allowed hover:brightness-90 transition-all"
            style={{ backgroundColor: BRANDING.primaryColor }}
          >
            {loading ? <Loader2 className="animate-spin w-5 h-5 mr-2" /> : 'Entrar no Sistema'}
          </button>
        </form>
        
        <div className="mt-8 text-center">
             <p className="text-xs text-gray-400 mb-2">Status do Ambiente:</p>
             <div className="flex justify-center gap-4 text-xs text-gray-500">
                <span className="flex items-center gap-1"><Database className="w-3 h-3" /> Banco: Local (XAMPP)</span>
             </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
