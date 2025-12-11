
import React, { useState, useEffect } from 'react';
import { ProductDef, SIZE_GRIDS } from '../types';
import { getProducts } from '../services/storageService';
import { Scissors, Printer, Loader2, Search, RefreshCw, AlertTriangle, CheckCircle } from 'lucide-react';
import { BRANDING } from '../config/branding';

const AdminCutForecast: React.FC = () => {
  const [products, setProducts] = useState<ProductDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchData = async () => {
    setLoading(true);
    const data = await getProducts();
    // Ordena por referência
    setProducts(data.sort((a, b) => a.reference.localeCompare(b.reference)));
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  // --- LÓGICA DE CÁLCULO DE CORTE ---
  // Filtra apenas produtos que têm alguma necessidade de corte (Deficit > 0)
  const forecastData = products.map(p => {
      const sizes = SIZE_GRIDS[p.gridType];
      const needs: Record<string, number> = {};
      let totalToCut = 0;
      let hasNeed = false;

      sizes.forEach(size => {
          const current = p.stock[size] || 0;
          const min = p.minStock[size] || 0;
          
          // Cálculo: Meta - Atual. 
          // Se atual for negativo (venda sem estoque), soma-se a necessidade para cobrir o buraco e atingir o mínimo.
          // Ex: Min 10, Atual -5 -> Precisa de 15.
          const gap = min - current;
          
          const qtyToCut = gap > 0 ? gap : 0;
          
          needs[size] = qtyToCut;
          totalToCut += qtyToCut;
          
          if (qtyToCut > 0) hasNeed = true;
      });

      return {
          ...p,
          cutNeeds: needs,
          totalToCut,
          hasNeed
      };
  }).filter(p => p.hasNeed); // Mantém apenas os que precisam de corte

  // Aplica filtro de busca visual
  const filteredData = forecastData.filter(p => 
      p.reference.toLowerCase().includes(searchTerm.toLowerCase()) || 
      p.color.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPiecesToCut = filteredData.reduce((acc, p) => acc + p.totalToCut, 0);

  const handlePrint = () => {
    window.print();
  };

  if (loading) return <div className="flex justify-center items-center h-96"><Loader2 className="animate-spin text-blue-600 w-10 h-10" /></div>;

  return (
    <div className="space-y-6 pb-12 animate-fade-in">
        
        {/* Header - Não imprime */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 no-print">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900 flex items-center">
                        <Scissors className="w-6 h-6 mr-2 text-orange-600" /> Previsão de Corte Semanal
                    </h2>
                    <p className="text-gray-500 text-sm mt-1">
                        Planejamento de produção baseado no Estoque Mínimo definido vs Estoque Atual.
                    </p>
                </div>
                <div className="flex gap-2 mt-4 md:mt-0">
                    <button onClick={fetchData} className="p-2 bg-gray-100 text-gray-600 rounded hover:bg-gray-200" title="Atualizar">
                        <RefreshCw className="w-5 h-5" />
                    </button>
                    <button 
                        onClick={handlePrint}
                        className="bg-gray-800 text-white px-4 py-2 rounded flex items-center hover:bg-gray-900 transition"
                    >
                        <Printer className="w-4 h-4 mr-2" /> Imprimir Ordem
                    </button>
                </div>
            </div>

            <div className="flex flex-col md:flex-row gap-4 items-end">
                <div className="w-full md:w-1/2 relative">
                    <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                    <input 
                        type="text" 
                        placeholder="Filtrar por Referência ou Cor..." 
                        className="w-full pl-10 p-2 border rounded focus:ring-2 focus:ring-orange-500 outline-none"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
                
                <div className="flex-1 bg-orange-50 border border-orange-200 rounded p-2 px-4 flex items-center justify-between">
                    <span className="text-orange-800 font-bold text-sm uppercase flex items-center">
                        <AlertTriangle className="w-4 h-4 mr-2" /> Total a Cortar
                    </span>
                    <span className="text-2xl font-bold text-orange-700">{totalPiecesToCut} <span className="text-sm font-normal text-orange-600">peças</span></span>
                </div>
            </div>
        </div>

        {/* Header Impressão */}
        <div className="hidden print-only mb-6 text-center border-b-2 border-black pb-4">
            <h1 className="text-3xl font-bold uppercase">Ordem de Corte / Produção</h1>
            <p className="text-lg mt-2">Data: {new Date().toLocaleDateString()}</p>
            <p className="text-sm text-gray-500">Baseado no déficit de Estoque Mínimo</p>
            <div className="mt-2 text-xs text-gray-400 uppercase tracking-widest">{BRANDING.companyName}</div>
        </div>

        {/* Tabela de Previsão */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            {filteredData.length === 0 ? (
                <div className="p-12 text-center text-gray-500">
                    <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-500" />
                    <p className="text-lg font-bold">Tudo em dia!</p>
                    <p>Nenhum produto está abaixo do estoque mínimo no momento.</p>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-800 text-white font-bold uppercase">
                            <tr>
                                <th className="p-4">Produto</th>
                                <th className="p-4 text-center">Grade de Corte (Necessidade)</th>
                                <th className="p-4 text-right w-32">Total</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredData.map((item, idx) => (
                                <tr key={idx} className="hover:bg-gray-50 break-inside-avoid">
                                    <td className="p-4 align-top">
                                        <div className="font-bold text-lg text-gray-800">{item.reference}</div>
                                        <div className="text-sm uppercase text-gray-500 font-bold">{item.color}</div>
                                        <div className="text-xs text-gray-400 mt-1">
                                            Base: {item.gridType === 'ADULT' ? 'Normal' : 'Plus Size'}
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        <div className="flex flex-wrap justify-center gap-3">
                                            {SIZE_GRIDS[item.gridType].map(size => {
                                                const qty = item.cutNeeds[size] || 0;
                                                const current = item.stock[size] || 0;
                                                const min = item.minStock[size] || 0;
                                                
                                                // Só exibe o box se tiver necessidade ou se for para completar a visualização da linha
                                                // Mas para economizar tinta e focar, vamos destacar os que PRECISAM
                                                const needsAction = qty > 0;

                                                return (
                                                    <div key={size} className={`flex flex-col items-center border rounded w-16 p-1 ${needsAction ? 'bg-orange-50 border-orange-300' : 'bg-gray-50 opacity-60'}`}>
                                                        <span className="text-xs font-bold text-gray-500 mb-1">{size}</span>
                                                        
                                                        {/* QTD A CORTAR (DESTAQUE) */}
                                                        <span className={`text-xl font-bold ${needsAction ? 'text-orange-700' : 'text-gray-300'}`}>
                                                            {qty > 0 ? qty : '-'}
                                                        </span>

                                                        {/* Detalhe Pequeno (Atual / Meta) */}
                                                        <div className="flex justify-between w-full px-1 mt-1 pt-1 border-t border-gray-200 text-[9px]">
                                                            <span className={`${current < 0 ? 'text-red-600 font-bold' : 'text-gray-400'}`} title="Estoque Atual">{current}</span>
                                                            <span className="text-gray-300">/</span>
                                                            <span className="text-gray-500 font-bold" title="Estoque Mínimo (Meta)">{min}</span>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </td>
                                    <td className="p-4 text-right align-middle">
                                        <span className="text-2xl font-bold text-gray-900 block">{item.totalToCut}</span>
                                        <span className="text-xs text-gray-500 uppercase">Peças</span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot className="bg-gray-100 border-t-2 border-gray-300">
                            <tr>
                                <td colSpan={2} className="p-4 text-right font-bold uppercase text-gray-600">Total Geral a Produzir</td>
                                <td className="p-4 text-right text-2xl font-bold text-orange-700">{totalPiecesToCut}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            )}
        </div>
        
        <div className="hidden print-only mt-8 flex justify-between text-xs text-gray-500 border-t pt-4">
            <div>
                <p>Legenda dos quadros:</p>
                <p><strong>Número Grande:</strong> Quantidade a Cortar</p>
                <p><strong>Número Pequeno (Esq):</strong> Estoque Atual</p>
                <p><strong>Número Pequeno (Dir):</strong> Meta (Mínimo)</p>
            </div>
            <div className="text-right">
                <p>Aprovado por: __________________________</p>
            </div>
        </div>
    </div>
  );
};

export default AdminCutForecast;
