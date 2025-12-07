
import React, { useState, useEffect } from 'react';
import { User, ProductDef, RepPrice } from '../types';
import { getProducts, getRepPrices, upsertRepPrice } from '../services/storageService';
import { Loader2, DollarSign, Save, Search, AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
  user: User;
}

const RepPriceManager: React.FC<Props> = ({ user }) => {
  const [products, setProducts] = useState<ProductDef[]>([]);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [savingRef, setSavingRef] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadData();
  }, [user.id]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [prods, existingPrices] = await Promise.all([
        getProducts(),
        getRepPrices(user.id)
      ]);
      
      setProducts(prods);
      
      // Normaliza as chaves para maiúsculo e remove espaços
      const priceMap: Record<string, number> = {};
      existingPrices.forEach(p => {
        priceMap[p.reference.trim().toUpperCase()] = p.price;
      });
      setPrices(priceMap);
    } catch (error) {
      console.error("Erro ao carregar dados", error);
    } finally {
      setLoading(false);
    }
  };

  // Extrair referências únicas
  const uniqueRefs = (Array.from(new Set(products.map(p => p.reference))) as string[]).sort();
  
  const filteredRefs = uniqueRefs.filter(ref => 
    ref.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handlePriceChange = (ref: string, val: string) => {
    const num = parseFloat(val);
    setPrices(prev => ({
      ...prev,
      [ref.trim().toUpperCase()]: isNaN(num) ? 0 : num
    }));
  };

  const savePrice = async (ref: string) => {
    setSavingRef(ref);
    try {
      const normalizedRef = ref.trim().toUpperCase();
      const price = prices[normalizedRef] || 0;
      await upsertRepPrice({
        repId: user.id,
        reference: normalizedRef,
        price: price
      });
      // Pequeno delay visual para feedback
      setTimeout(() => setSavingRef(null), 500);
    } catch (error) {
      alert("Erro ao salvar preço");
      setSavingRef(null);
    }
  };

  if (loading) return <div className="flex justify-center p-10"><Loader2 className="animate-spin text-blue-600" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Tabela de Preços</h2>
          <p className="text-sm text-gray-500">Defina o preço de venda para cada referência.</p>
        </div>
        
        <div className="flex items-center gap-2 w-full md:w-auto">
             <div className="relative w-full md:w-64">
                <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                <input 
                    type="text" 
                    placeholder="Buscar referência..." 
                    className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                />
             </div>
             <button onClick={loadData} className="p-2 bg-white border rounded hover:bg-gray-50" title="Recarregar">
                <RefreshCw className="w-5 h-5 text-gray-500" />
             </button>
        </div>
      </div>

      <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-800">
          <p className="font-bold">Como salvar:</p>
          <p>Digite o valor e clique fora do campo ou aperte TAB para salvar automaticamente. Você também pode clicar no botão de disquete ao lado.</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden border border-gray-200">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 text-gray-600 font-bold uppercase text-xs">
              <tr>
                <th className="p-4">Referência</th>
                <th className="p-4 w-48">Preço Unitário (R$)</th>
                <th className="p-4 w-24 text-center">Salvar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredRefs.map(ref => {
                const normRef = ref.trim().toUpperCase();
                return (
                <tr key={ref} className="hover:bg-gray-50">
                  <td className="p-4 font-bold text-gray-800">{ref}</td>
                  <td className="p-4">
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-gray-500 text-sm">R$</span>
                      <input 
                        type="number" 
                        step="0.01"
                        min="0"
                        className="w-full pl-8 pr-3 py-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none font-bold text-gray-700"
                        value={prices[normRef] || ''}
                        onChange={(e) => handlePriceChange(normRef, e.target.value)}
                        onBlur={() => savePrice(normRef)} 
                        placeholder="0.00"
                      />
                    </div>
                  </td>
                  <td className="p-4 text-center">
                    <button 
                      onClick={() => savePrice(normRef)}
                      className={`p-2 rounded-full transition ${savingRef === normRef ? 'text-green-600 bg-green-50' : 'text-blue-600 hover:bg-blue-100'}`}
                      title="Salvar Preço"
                    >
                      {savingRef === normRef ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <Save className="w-5 h-5" />
                      )}
                    </button>
                  </td>
                </tr>
              )})}
              {filteredRefs.length === 0 && (
                <tr>
                  <td colSpan={3} className="p-12 text-center text-gray-500">
                    <p className="font-bold mb-2">Nenhum produto encontrado.</p>
                    <p className="text-sm">Peça ao administrador para cadastrar referências no "Catálogo de Produtos" primeiro.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default RepPriceManager;
