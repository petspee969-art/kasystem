
import React, { useState, useEffect } from 'react';
import { ProductDef, SizeGridType, SIZE_GRIDS } from '../types';
import { getProducts } from '../services/storageService';
import { Loader2, Search, Printer, Package, DollarSign, Archive, Filter, Info } from 'lucide-react';

const StockReport: React.FC = () => {
  const [products, setProducts] = useState<ProductDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const data = await getProducts();
      // Ordena por referência
      setProducts(data.sort((a, b) => a.reference.localeCompare(b.reference)));
      setLoading(false);
    };
    load();
  }, []);

  // Filtros
  const filteredProducts = products.filter(p => {
    const term = searchTerm.toLowerCase();
    return p.reference.toLowerCase().includes(term) || p.color.toLowerCase().includes(term);
  });

  // Cálculos de Totais
  let totalStockQty = 0;
  let totalStockValue = 0;

  const processedData = filteredProducts.map(p => {
    const stockValues = Object.values(p.stock) as number[];
    
    // Qtd Líquida (Exibição na Tabela - mostra realidade)
    const netQty = stockValues.reduce((acc, curr) => acc + curr, 0);
    
    // Qtd Física/Positiva (Cálculo de Ativos - ignora negativos)
    const positiveQty = stockValues.reduce((acc, curr) => acc + (curr > 0 ? curr : 0), 0);
    
    const basePrice = p.basePrice || 0;
    const valueOfPositive = positiveQty * basePrice;

    // Acumula APENAS os positivos nos totais gerais
    totalStockQty += positiveQty;
    totalStockValue += valueOfPositive;

    return {
      ...p,
      totalQty: netQty,
      totalValue: netQty * basePrice // Valor da linha mantém a lógica líquida
    };
  });

  const handlePrint = () => {
    window.print();
  };

  if (loading) return <div className="flex justify-center p-10"><Loader2 className="animate-spin text-blue-600 w-8 h-8" /></div>;

  return (
    <div className="space-y-6 pb-12">
      {/* Header & Filters (No Print) */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 no-print">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 flex items-center">
              <Archive className="w-6 h-6 mr-2 text-blue-600" /> Relatório de Estoque Valorizado
            </h2>
            <p className="text-gray-500 text-sm mt-1">Visão geral quantitativa e financeira. Totais consideram apenas estoque físico (positivo).</p>
          </div>
          <button 
            onClick={handlePrint}
            className="mt-4 md:mt-0 bg-gray-800 text-white px-4 py-2 rounded flex items-center hover:bg-gray-900 transition"
          >
            <Printer className="w-4 h-4 mr-2" /> Imprimir Relatório
          </button>
        </div>

        <div className="flex flex-col md:flex-row gap-4 items-end">
          <div className="w-full md:w-1/2">
            <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Filtrar Referência ou Cor</label>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
              <input 
                type="text" 
                placeholder="Ex: CAMISA-01, AZUL..."
                className="w-full border rounded p-2 pl-9 text-sm focus:ring-2 focus:ring-blue-500"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <div className="text-sm text-gray-500 pb-2">
             Exibindo <strong>{filteredProducts.length}</strong> produtos.
          </div>
        </div>
      </div>

      {/* Cabeçalho Apenas para Impressão */}
      <div className="hidden print-only mb-6 text-center border-b-2 border-black pb-4">
        <h1 className="text-2xl font-bold uppercase">Relatório de Estoque</h1>
        <p className="text-sm mt-1">Gerado em: {new Date().toLocaleString()}</p>
        {searchTerm && <p className="text-sm mt-1">Filtro aplicado: "{searchTerm}"</p>}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 break-inside-avoid">
        <div className="bg-white p-6 rounded-lg shadow-sm border border-l-4 border-l-blue-500 border-gray-100 flex items-center">
           <div className="p-3 bg-blue-50 rounded-full mr-4 text-blue-600">
               <Package className="w-6 h-6" />
           </div>
           <div>
               <p className="text-xs font-bold text-gray-500 uppercase">Peças em Estoque (Positivo)</p>
               <p className="text-2xl font-bold text-gray-900">{totalStockQty}</p>
           </div>
       </div>

       <div className="bg-white p-6 rounded-lg shadow-sm border border-l-4 border-l-green-500 border-gray-100 flex items-center">
           <div className="p-3 bg-green-50 rounded-full mr-4 text-green-600">
               <DollarSign className="w-6 h-6" />
           </div>
           <div>
               <p className="text-xs font-bold text-gray-500 uppercase">Valor Ativo (Custo)</p>
               <p className="text-2xl font-bold text-gray-900">R$ {totalStockValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
           </div>
       </div>

       <div className="bg-white p-6 rounded-lg shadow-sm border border-l-4 border-l-purple-500 border-gray-100 flex items-center">
           <div className="p-3 bg-purple-50 rounded-full mr-4 text-purple-600">
               <Archive className="w-6 h-6" />
           </div>
           <div>
               <p className="text-xs font-bold text-gray-500 uppercase">Total SKUs</p>
               <p className="text-2xl font-bold text-gray-900">{processedData.length}</p>
               <span className="text-xs text-gray-400">Modelos/Cores distintos</span>
           </div>
       </div>
      </div>

      {/* Tabela Detalhada */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden break-before-auto">
         <div className="overflow-x-auto">
             <table className="w-full text-sm text-left">
                 <thead className="bg-gray-50 text-gray-600 font-bold uppercase border-b text-xs">
                     <tr>
                         <th className="p-4">Referência</th>
                         <th className="p-4">Cor</th>
                         <th className="p-4 text-center">Detalhamento Grade</th>
                         <th className="p-4 text-right">Custo Unit.</th>
                         <th className="p-4 text-right">Qtd Líquida</th>
                         <th className="p-4 text-right">Valor Líquido</th>
                     </tr>
                 </thead>
                 <tbody className="divide-y divide-gray-100">
                     {processedData.length === 0 ? (
                         <tr><td colSpan={6} className="p-8 text-center text-gray-400">Nenhum produto encontrado.</td></tr>
                     ) : (
                        processedData.map((item) => (
                             <tr key={item.id} className="hover:bg-gray-50">
                                 <td className="p-4 font-bold text-gray-800">{item.reference}</td>
                                 <td className="p-4 uppercase text-gray-600">{item.color}</td>
                                 <td className="p-4">
                                     <div className="flex flex-wrap justify-center gap-2">
                                         {SIZE_GRIDS[item.gridType].map(size => {
                                             const qty = item.stock[size] || 0;
                                             // Destacar negativo em vermelho, zero em cinza, positivo normal
                                             let colorClass = "bg-gray-100 text-gray-400";
                                             if (qty > 0) colorClass = "bg-blue-50 text-blue-700 border-blue-100";
                                             if (qty < 0) colorClass = "bg-red-50 text-red-600 border-red-100 font-bold";

                                             return (
                                                 <span key={size} className={`text-xs px-1.5 py-0.5 rounded border ${colorClass}`}>
                                                     <span className="font-bold">{size}:</span> {qty}
                                                 </span>
                                             );
                                         })}
                                     </div>
                                 </td>
                                 <td className="p-4 text-right text-gray-600">R$ {(item.basePrice || 0).toFixed(2)}</td>
                                 <td className={`p-4 text-right font-bold ${item.totalQty < 0 ? 'text-red-600' : 'text-blue-600'}`}>
                                     {item.totalQty}
                                 </td>
                                 <td className="p-4 text-right font-bold text-green-700">
                                     R$ {item.totalValue.toFixed(2)}
                                 </td>
                             </tr>
                         ))
                     )}
                 </tbody>
                 <tfoot className="bg-gray-100 font-bold border-t border-gray-300">
                     <tr>
                         <td colSpan={4} className="p-4 text-right uppercase text-gray-600 flex items-center justify-end">
                            <Info className="w-4 h-4 mr-2" />
                            Totais Gerais (Apenas Positivos)
                         </td>
                         <td className="p-4 text-right text-lg text-blue-800">{totalStockQty}</td>
                         <td className="p-4 text-right text-lg text-green-800">R$ {totalStockValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                     </tr>
                 </tfoot>
             </table>
         </div>
      </div>
    </div>
  );
};

export default StockReport;
