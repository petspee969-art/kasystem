
import React, { useState } from 'react';
import { User } from '../types';
import { getUsers } from '../services/storageService';
import { Lock, User as UserIcon, Loader2, ServerCrash, Database } from 'lucide-react';

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
          throw new Error("Resposta inválida do servidor.");
      }

      const validUser = users.find(u => u.username === cleanUser && u.password === cleanPass);
      
      if (validUser) {
        onLogin(validUser);
      } else {
        setError(
            <span>
                Credenciais inválidas. <br/>
                Tente <strong>admin</strong> / <strong>admin</strong>
            </span>
        );
      }
    } catch (err: any) {
      console.error(err);
      // Mensagem de erro amigável para problemas de conexão
      setError(
        <div className="text-left">
            <p className="font-bold flex items-center gap-1"><ServerCrash className="w-4 h-4" /> Erro de Conexão!</p>
            <p className="mt-1">Não foi possível conectar ao servidor.</p>
            <ul className="list-disc ml-4 mt-2 text-xs opacity-90">
                <li>Verifique se o <strong>XAMPP (MySQL)</strong> está ligado (Start).</li>
                <li>Verifique se rodou <strong>npm start</strong> no terminal.</li>
            </ul>
        </div>
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 text-blue-600 mb-4">
            <UserIcon className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold text-blue-900">Confecção Pro</h1>
          <p className="text-gray-500 mt-2">Sistema de Gestão de Pedidos</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-50 text-red-700 p-4 rounded-lg text-sm border border-red-200">
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
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Digite seu usuário (ex: admin)"
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
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition"
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
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition duration-200 shadow-md flex justify-center items-center disabled:opacity-70 disabled:cursor-not-allowed"
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
