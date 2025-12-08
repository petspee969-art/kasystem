
import React, { useState, useEffect } from 'react';
import { ProductDef, SIZE_GRIDS } from '../types';
import { getProducts } from '../services/storageService';
import { Loader2, Search, Archive, Package, AlertCircle } from 'lucide-react';

const RepStockView: React.FC = () => {
  const [products, setProducts] = useState<ProductDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const data = await getProducts();
      setProducts(data.sort((a, b) => a.reference.localeCompare(b.reference)));
      setLoading(false);
    };
    load();
  }, []);

  const filteredProducts = products.filter(p => {
    const term = searchTerm.toLowerCase();
    return p.reference.toLowerCase().includes(term) || p.color.toLowerCase().includes(term);
  });

  const productsWithStock = filteredProducts.filter(p => {
      const stockValues = Object.values(p.stock) as number[];
      // Mostra se tiver pelo menos um item com estoque positivo ou negativo
      return stockValues.some(val => val !== 0);
  });

  if (loading) return <div className="flex justify-center p-10"><Loader2 className="animate-spin text-blue-600 w-8 h-8" /></div>;

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 flex items-center">
              <Archive className="w-6 h-6 mr-2 text-blue-600" /> Estoque Disponível
            </h2>
            <p className="text-gray-500 text-sm mt-1">Consulte a quantidade de peças disponíveis por Referência e Cor.</p>
          </div>
        </div>

        <div className="relative max-w-md">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
            <input 
            type="text" 
            placeholder="Filtrar por Referência ou Cor..."
            className="w-full border rounded p-2 pl-9 text-sm focus:ring-2 focus:ring-blue-500 bg-gray-50"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            />
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
         <div className="overflow-x-auto">
             <table className="w-full text-sm text-left">
                 <thead className="bg-gray-50 text-gray-600 font-bold uppercase border-b text-xs">
                     <tr>
                         <th className="p-4">Referência</th>
                         <th className="p-4">Cor</th>
                         <th className="p-4">Grade Disponível</th>
                         <th className="p-4 text-right">Total</th>
                     </tr>
                 </thead>
                 <tbody className="divide-y divide-gray-100">
                     {productsWithStock.length === 0 ? (
                         <tr><td colSpan={4} className="p-8 text-center text-gray-400">Nenhum produto com estoque encontrado para sua busca.</td></tr>
                     ) : (
                        productsWithStock.map((item) => {
                             const totalQty = Object.values(item.stock).reduce<number>((acc, curr) => acc + (curr as number), 0);
                             return (
                             <tr key={item.id} className="hover:bg-gray-50">
                                 <td className="p-4 font-bold text-gray-800">{item.reference}</td>
                                 <td className="p-4 uppercase text-gray-600">{item.color}</td>
                                 <td className="p-4">
                                     <div className="flex flex-wrap gap-2">
                                         {SIZE_GRIDS[item.gridType].map(size => {
                                             const qty = item.stock[size] || 0;
                                             // Lógica visual: Verde (Positivo), Vermelho (Negativo/Falta), Cinza (Zero)
                                             let colorClass = "bg-gray-100 text-gray-400";
                                             if (qty > 0) colorClass = "bg-green-50 text-green-700 border-green-200 font-bold";
                                             if (qty < 0) colorClass = "bg-red-50 text-red-600 border-red-200 font-bold";
                                             
                                             return (
                                                 <span key={size} className={`text-xs px-2 py-1 rounded border ${colorClass}`}>
                                                     <span className="mr-1">{size}:</span>{qty}
                                                 </span>
                                             );
                                         })}
                                     </div>
                                 </td>
                                 <td className={`p-4 text-right font-bold text-lg ${totalQty > 0 ? 'text-blue-600' : 'text-gray-400'}`}>
                                     {totalQty}
                                 </td>
                             </tr>
                             )
                        })
                     )}
                 </tbody>
             </table>
         </div>
      </div>
      
      <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 flex items-center text-sm text-blue-800">
          <AlertCircle className="w-4 h-4 mr-2" />
          <span>Nota: Números negativos indicam que o item já foi vendido além do estoque físico atual (Pré-venda).</span>
      </div>
    </div>
  );
};

export default RepStockView;
