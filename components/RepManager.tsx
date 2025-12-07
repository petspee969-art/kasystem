
import React, { useState, useEffect } from 'react';
import { User, Role } from '../types';
import { getUsers, addUser, deleteUser, generateUUID } from '../services/storageService';
import { Trash, Plus, UserPlus, Shield, Loader2 } from 'lucide-react';

const RepManager: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const data = await getUsers();
    setUsers(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (users.find(u => u.username === username)) {
        alert('Este usuário já existe.');
        return;
    }

    setLoading(true);
    try {
        await addUser({
            id: generateUUID(),
            name,
            username,
            password,
            role: Role.REP
        });
        await fetchData();
        setName('');
        setUsername('');
        setPassword('');
    } catch (e: any) {
        alert('Erro ao cadastrar: ' + e.message);
    } finally {
        setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Tem certeza que deseja remover este representante?')) {
        setLoading(true);
        await deleteUser(id);
        await fetchData();
        setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
         <h2 className="text-2xl font-bold text-gray-800">Gerenciar Representantes</h2>
         {loading && <Loader2 className="animate-spin text-blue-600" />}
      </div>

      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <h3 className="text-lg font-semibold mb-4 text-gray-700 flex items-center">
            <UserPlus className="w-5 h-5 mr-2" /> Novo Representante
        </h3>
        <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome Completo</label>
            <input 
                type="text" 
                required
                className="w-full border p-2 rounded"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={loading}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Usuário (Login)</label>
            <input 
                type="text" 
                required
                className="w-full border p-2 rounded"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
            <input 
                type="text" 
                required
                className="w-full border p-2 rounded"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
            />
          </div>
          <button 
            type="submit"
            disabled={loading}
            className="bg-green-600 text-white p-2 rounded hover:bg-green-700 font-medium flex justify-center items-center h-[42px]"
          >
            <Plus className="w-5 h-5 mr-2" /> Cadastrar
          </button>
        </form>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {users.filter(u => u.role === Role.REP).map(user => (
            <div key={user.id} className="bg-white p-4 rounded-lg shadow border border-gray-100 flex justify-between items-center">
                <div>
                    <h4 className="font-bold text-gray-800">{user.name}</h4>
                    <p className="text-sm text-gray-500">User: {user.username}</p>
                    <p className="text-sm text-gray-500">Senha: {user.password}</p>
                </div>
                <button 
                    onClick={() => handleDelete(user.id)}
                    className="text-red-500 hover:bg-red-50 p-2 rounded-full transition"
                >
                    <Trash className="w-5 h-5" />
                </button>
            </div>
        ))}
        {users.filter(u => u.role === Role.REP).length === 0 && !loading && (
            <div className="col-span-3 text-center text-gray-500 py-8">
                Nenhum representante cadastrado.
            </div>
        )}
      </div>
    </div>
  );
};

export default RepManager;
