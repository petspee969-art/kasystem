
import React, { useState, useEffect } from 'react';
import { User, Client } from '../types';
import { getClients, addClient, updateClient, deleteClient, generateUUID } from '../services/storageService';
import { Plus, MapPin, Store, Edit2, Trash, Save, X, Loader2, AlertCircle } from 'lucide-react';

interface Props {
  user: User;
}

const ClientManager: React.FC<Props> = ({ user }) => {
  const [clients, setClients] = useState<Client[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  const [form, setForm] = useState({
    name: '', city: '', neighborhood: '', state: ''
  });

  const fetchClients = async () => {
    setLoading(true);
    const data = await getClients(user.id);
    setClients(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchClients();
  }, [user.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    
    try {
      if (editingId) {
          // Update existing
          await updateClient({
              id: editingId,
              repId: user.id,
              ...form
          });
          setEditingId(null);
      } else {
          // Create new
          await addClient({
              id: generateUUID(), // Correção aqui: usa função segura
              repId: user.id,
              ...form
          });
      }
      await fetchClients();
      setForm({ name: '', city: '', neighborhood: '', state: '' });
    } catch (error: any) {
      console.error("Erro ao salvar:", error);
      // Exibe a mensagem real do erro
      setErrorMsg(`Erro: ${error.message || 'Falha desconhecida ao salvar'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (e: React.MouseEvent, client: Client) => {
    e.preventDefault();
    e.stopPropagation();
    setErrorMsg('');
    setForm({
        name: client.name,
        city: client.city,
        neighborhood: client.neighborhood,
        state: client.state
    });
    setEditingId(client.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation(); // CRITICAL: Stop event bubbling
    setErrorMsg('');
    
    if (window.confirm('Tem certeza que deseja excluir este cliente?')) {
        setLoading(true);
        try {
            await deleteClient(id);
            if (editingId === id) {
              handleCancel();
            }
            await fetchClients();
        } catch (error: any) {
            console.error("Erro ao deletar:", error);
            
            // Check for foreign key violation (Postgres error code 23503)
            if (error?.code === '23503' || (error?.message && error.message.includes('foreign key'))) {
                alert("Não é possível excluir este cliente pois ele possui PEDIDOS registrados no sistema. Exclua os pedidos primeiro.");
            } else {
                alert(`Não foi possível excluir o cliente. Erro: ${error?.message || 'Desconhecido'}`);
            }
        } finally {
            setLoading(false);
        }
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    setForm({ name: '', city: '', neighborhood: '', state: '' });
    setErrorMsg('');
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-800">Meus Clientes</h2>
        {loading && <Loader2 className="animate-spin text-blue-600" />}
      </div>

      {errorMsg && (
        <div className="bg-red-50 text-red-700 p-3 rounded flex items-center">
            <AlertCircle className="w-5 h-5 mr-2" /> {errorMsg}
        </div>
      )}

      <div className={`p-6 rounded-lg shadow-sm border transition-colors ${editingId ? 'bg-orange-50 border-orange-200' : 'bg-white border-gray-200'}`}>
        <div className="flex justify-between items-center mb-4">
            <h3 className={`text-lg font-semibold flex items-center ${editingId ? 'text-orange-800' : 'text-gray-700'}`}>
                {editingId ? (
                    <><Edit2 className="w-5 h-5 mr-2" /> Editando Cliente</>
                ) : (
                    <><Store className="w-5 h-5 mr-2 text-blue-600" /> Cadastrar Novo Cliente</>
                )}
            </h3>
            {editingId && (
                <button onClick={handleCancel} type="button" className="text-sm text-gray-500 hover:text-gray-700 flex items-center">
                    <X className="w-4 h-4 mr-1" /> Cancelar Edição
                </button>
            )}
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome da Loja / Cliente</label>
                <input 
                    required
                    className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                    value={form.name}
                    onChange={e => setForm({...form, name: e.target.value})}
                    placeholder="Ex: Boutique Elegance"
                    disabled={loading}
                />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cidade</label>
                <input 
                    required
                    className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                    value={form.city}
                    onChange={e => setForm({...form, city: e.target.value})}
                    disabled={loading}
                />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Estado (UF)</label>
                <input 
                    required
                    className="w-full border p-2 rounded uppercase focus:ring-2 focus:ring-blue-500 outline-none"
                    maxLength={2}
                    value={form.state}
                    onChange={e => setForm({...form, state: e.target.value})}
                    placeholder="SP"
                    disabled={loading}
                />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bairro</label>
                <input 
                    required
                    className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                    value={form.neighborhood}
                    onChange={e => setForm({...form, neighborhood: e.target.value})}
                    disabled={loading}
                />
            </div>
            <div className="md:col-span-2 flex justify-end mt-2 gap-2">
                {editingId && (
                    <button 
                        type="button" 
                        onClick={handleCancel}
                        disabled={loading}
                        className="bg-gray-200 text-gray-700 px-4 py-2 rounded hover:bg-gray-300"
                    >
                        Cancelar
                    </button>
                )}
                <button 
                    type="submit" 
                    disabled={loading}
                    className={`${editingId ? 'bg-orange-600 hover:bg-orange-700' : 'bg-blue-600 hover:bg-blue-700'} text-white px-6 py-2 rounded flex items-center shadow-sm transition disabled:opacity-50`}
                >
                    {loading ? <Loader2 className="animate-spin w-4 h-4 mr-2" /> : (editingId ? <Save className="w-4 h-4 mr-2" /> : <Plus className="w-4 h-4 mr-2" />)} 
                    {editingId ? 'Salvar Alterações' : 'Salvar Cliente'}
                </button>
            </div>
        </form>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
         {clients.map(client => (
             <div key={client.id} className={`bg-white p-4 rounded-lg shadow border-l-4 group relative ${editingId === client.id ? 'border-orange-400 bg-orange-50' : 'border-blue-500'}`}>
                 <div className="flex justify-between items-start">
                    <div>
                        <h4 className="font-bold text-lg text-gray-800">{client.name}</h4>
                        <div className="flex items-center text-gray-500 mt-2">
                            <MapPin className="w-4 h-4 mr-1" />
                            <span className="text-sm">{client.city} - {client.state}</span>
                        </div>
                        <p className="text-xs text-gray-400 mt-1">{client.neighborhood}</p>
                    </div>
                    <div className="flex gap-1">
                        <button 
                            type="button"
                            onClick={(e) => handleEdit(e, client)}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-full z-10"
                            title="Editar"
                        >
                            <Edit2 className="w-4 h-4" />
                        </button>
                        <button 
                            type="button"
                            onClick={(e) => handleDelete(e, client.id)}
                            className="p-2 text-red-500 hover:bg-red-50 rounded-full z-10"
                            title="Excluir"
                        >
                            <Trash className="w-4 h-4" />
                        </button>
                    </div>
                 </div>
             </div>
         ))}
         {!loading && clients.length === 0 && (
             <div className="col-span-3 text-center text-gray-400 py-10">
                 Você ainda não tem clientes cadastrados.
             </div>
         )}
      </div>
    </div>
  );
};

export default ClientManager;
