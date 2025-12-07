
import React, { useState, useEffect } from 'react';
import { Order, User, Role, ProductDef, OrderItem } from '../types';
import { getOrders, getUsers, getProducts } from '../services/storageService';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell, PieChart, Pie } from 'recharts';
import { Loader2, Calendar, Filter, Printer, Download, TrendingUp, Scissors, Users, Shirt, Truck, CheckCircle, Clock } from 'lucide-react';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1'];
const ALL_POSSIBLE_SIZES = ['P', 'M', 'G', 'GG', 'G1', 'G2', 'G3'];

const AdminReports: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [reps, setReps] = useState<User[]>([]);
  const [products, setProducts] = useState<ProductDef[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [selectedRepId, setSelectedRepId] = useState('');
  // NOVO: Filtro de Status para separar Romaneados de A Romanear
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'finalized'>('all');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [o, u, p] = await Promise.all([getOrders(), getUsers(), getProducts()]);
      setOrders(o);
      setReps(u.filter(x => x.role === Role.REP));
      setProducts(p);
      setLoading(false);
    };
    load();
  }, []);

  // Filter Logic
  const filteredOrders = orders.filter(o => {
    const d = o.createdAt.split('T')[0];
    const matchDate = d >= startDate && d <= endDate;
    const matchRep = selectedRepId ? o.repId === selectedRepId : true;
    
    // Filtro de Status/Romaneio
    let matchStatus = true;
    if (statusFilter === 'open') {
        matchStatus = !o.romaneio; // A Romanear
    } else if (statusFilter === 'finalized') {
        matchStatus = !!o.romaneio; // Romaneados
    }

    return matchDate && matchRep && matchStatus;
  });

  // Get Selected Rep Name for Printing
  const selectedRepName = selectedRepId ? reps.find(r => r.id === selectedRepId)?.name : '';

  // --- LÓGICA DE QUANTIDADE ---
  const getRelevantQty = (item: OrderItem, order: Order, size?: string): number => {
      // SE O PEDIDO JÁ TEM ROMANEIO (Finalizado ou Parcial):
      // A fonte da verdade é o campo 'sizes', pois o processo de finalização consolida o que foi separado dentro dele.
      if (order.romaneio) {
          if (size) return item.sizes[size] || 0;
          // Retorna a soma dos tamanhos em 'sizes'
          return (Object.values(item.sizes) as number[]).reduce((a, b) => a + b, 0);
      }
      
      // SE O PEDIDO ESTÁ ABERTO (A Romanear):
      // Usa a projeção do pedido original (sizes)
      // (Opcionalmente poderia usar 'picked' se quisesse ver o progresso, mas para relatório de produção futura usa-se o pedido)
      if (size) return item.sizes[size] || 0;
      return item.totalQty;
  };

  // --- AGGREGATIONS ---

  // 1. Matriz de Corte (Production Matrix)
  // Agrupa por (Ref + Cor) e soma os tamanhos usando a lógica híbrida
  const matrixData: Record<string, { ref: string, color: string, sizes: Record<string, number>, total: number }> = {};
  
  // 2. Totais Gerais (Baseados em Custo)
  let totalRevenueCost = 0; // Faturamento Baseado no Custo
  let totalPiecesCount = 0;

  // 3. Size Distribution (Curve)
  const sizeDist: Record<string, number> = {};

  filteredOrders.forEach(o => {
      o.items.forEach(item => {
          // MATRIZ DE CORTE
          const key = `${item.reference}__${item.color}`;
          if (!matrixData[key]) {
              matrixData[key] = {
                  ref: item.reference,
                  color: item.color,
                  sizes: {},
                  total: 0
              };
          }

          // Busca Custo Base do Produto
          const catalogProduct = products.find(p => p.reference === item.reference && p.color === item.color);
          const baseCost = catalogProduct ? catalogProduct.basePrice : 0;

          // Qtd Total deste item para este pedido (Híbrido)
          const qty = getRelevantQty(item, o);
          
          matrixData[key].total += qty;
          totalPiecesCount += qty;
          totalRevenueCost += (qty * baseCost);

          // Distribuição por Tamanho
          ALL_POSSIBLE_SIZES.forEach(s => {
              const sizeQty = getRelevantQty(item, o, s);
              if (sizeQty > 0) {
                  matrixData[key].sizes[s] = (matrixData[key].sizes[s] || 0) + sizeQty;
                  sizeDist[s] = (sizeDist[s] || 0) + sizeQty;
              }
          });
      });
  });

  const matrixList = Object.values(matrixData).sort((a,b) => a.ref.localeCompare(b.ref));

  // 4. Sales by Rep (Performance Financeira de Venda Real - Para gráfico)
  // Mantemos o valor de VENDA aqui para o gráfico de performance comercial
  const repSales: Record<string, number> = {};
  const repPieces: Record<string, number> = {};
  
  filteredOrders.forEach(o => {
      const name = o.repName || 'Desconhecido';
      // Para o gráfico de vendas, usamos o valor final do pedido (Venda), não custo
      repSales[name] = (repSales[name] || 0) + (o.finalTotalValue || 0);
      repPieces[name] = (repPieces[name] || 0) + o.totalPieces;
  });

  const repChartData = Object.keys(repSales).map(key => ({
      name: key,
      valor: repSales[key],
      pecas: repPieces[key]
  })).sort((a, b) => b.valor - a.valor);

  const sizeChartData = ALL_POSSIBLE_SIZES.map(s => ({
      name: s,
      value: sizeDist[s] || 0
  })).filter(d => d.value > 0);

  const totalOrdersCount = filteredOrders.length;

  const handlePrint = () => {
    window.print();
  };

  if (loading) return <div className="flex justify-center p-10"><Loader2 className="animate-spin text-blue-600 w-8 h-8" /></div>;

  return (
    <div className="space-y-8 pb-12">
        {/* Header & Filters (No Print) */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 no-print">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900 flex items-center">
                        <TrendingUp className="w-6 h-6 mr-2 text-blue-600" /> Relatórios de Produção & Custo
                    </h2>
                    <p className="text-gray-500 text-sm mt-1">
                        Matriz de corte baseada em projeção (abertos) ou separação real (romaneados).
                    </p>
                </div>
                <button 
                    onClick={handlePrint}
                    className="mt-4 md:mt-0 bg-gray-800 text-white px-4 py-2 rounded flex items-center hover:bg-gray-900 transition"
                >
                    <Printer className="w-4 h-4 mr-2" /> Imprimir Relatório
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                {/* Filtro de Status (NOVO) */}
                <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                    <label className="block text-xs font-bold text-blue-700 mb-1 uppercase flex items-center">
                        <Truck className="w-3 h-3 mr-1" /> Situação (Romaneio)
                    </label>
                    <select 
                        className="w-full border rounded p-2 text-sm focus:ring-2 focus:ring-blue-500 bg-white font-medium text-gray-700"
                        value={statusFilter}
                        onChange={e => setStatusFilter(e.target.value as any)}
                    >
                        <option value="all">Todos os Pedidos</option>
                        <option value="open">A Romanear (Abertos)</option>
                        <option value="finalized">Já Romaneados (Finalizados)</option>
                    </select>
                </div>

                <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Representante</label>
                    <div className="relative">
                        <Filter className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                        <select 
                            className="w-full border rounded p-2 pl-9 text-sm focus:ring-2 focus:ring-blue-500 bg-white"
                            value={selectedRepId}
                            onChange={e => setSelectedRepId(e.target.value)}
                        >
                            <option value="">Todos</option>
                            {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Data Inicial</label>
                    <div className="relative">
                        <Calendar className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                        <input 
                            type="date" 
                            className="w-full border rounded p-2 pl-9 text-sm focus:ring-2 focus:ring-blue-500"
                            value={startDate}
                            onChange={e => setStartDate(e.target.value)}
                        />
                    </div>
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Data Final</label>
                    <div className="relative">
                        <Calendar className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                        <input 
                            type="date" 
                            className="w-full border rounded p-2 pl-9 text-sm focus:ring-2 focus:ring-blue-500"
                            value={endDate}
                            onChange={e => setEndDate(e.target.value)}
                        />
                    </div>
                </div>
            </div>
            
            <div className="mt-4 text-right pb-2 text-sm text-gray-500">
                 Status Visualizado: <strong className="text-blue-600 uppercase">
                    {statusFilter === 'all' ? 'Geral (Híbrido)' : statusFilter === 'open' ? 'Projeção (Pedidos Abertos)' : 'Realizado (Peças Separadas)'}
                 </strong> • Exibindo <strong>{filteredOrders.length}</strong> pedidos.
            </div>
        </div>

        {/* PRINT HEADER ONLY */}
        <div className="hidden print-only mb-8 text-center border-b-2 border-black pb-4">
            <h1 className="text-3xl font-bold uppercase">Relatório de Custo & Produção</h1>
            <p className="text-lg mt-2">Período: {new Date(startDate).toLocaleDateString()} até {new Date(endDate).toLocaleDateString()}</p>
            <div className="flex justify-center gap-4 mt-2 font-bold text-sm">
                 <span>Status: {statusFilter === 'all' ? 'TODOS' : statusFilter === 'open' ? 'A ROMANEAR' : 'ROMANEADOS'}</span>
                 {selectedRepId && <span>Representante: {selectedRepName}</span>}
            </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-lg shadow-sm border border-l-4 border-l-green-500 border-gray-100">
                <p className="text-sm font-bold text-gray-500 uppercase mb-1">Custo Total (Produtos)</p>
                <p className="text-3xl font-bold text-gray-900">R$ {totalRevenueCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                <div className="mt-2 text-xs flex items-center text-green-700 bg-green-50 p-1 rounded w-fit">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Baseado no Preço de Custo
                </div>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-sm border border-l-4 border-l-blue-500 border-gray-100">
                <p className="text-sm font-bold text-gray-500 uppercase mb-1">Volume de Peças</p>
                <p className="text-3xl font-bold text-gray-900">{totalPiecesCount}</p>
                <p className="text-xs text-blue-600 mt-1">
                    {statusFilter === 'open' ? 'A produzir/separar' : statusFilter === 'finalized' ? 'Efetivamente separadas' : 'Mistura (Pedido + Separado)'}
                </p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-sm border border-l-4 border-l-purple-500 border-gray-100">
                <p className="text-sm font-bold text-gray-500 uppercase mb-1">Total Pedidos</p>
                <p className="text-3xl font-bold text-gray-900">{totalOrdersCount}</p>
            </div>
        </div>

        {/* CHARTS ROW */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 break-inside-avoid">
            {/* Sales by Rep */}
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <h3 className="font-bold text-gray-800 mb-4 flex items-center">
                    <Users className="w-5 h-5 mr-2 text-blue-600" /> Performance Comercial (Valor Venda)
                </h3>
                <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={repChartData} layout="vertical" margin={{ left: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                            <XAxis type="number" hide />
                            <YAxis dataKey="name" type="category" width={100} tick={{fontSize: 12}} />
                            <Tooltip formatter={(value) => typeof value === 'number' ? `R$ ${value.toFixed(2)}` : value} />
                            <Bar dataKey="valor" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={20}>
                                {repChartData.map((_, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Size Distribution */}
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <h3 className="font-bold text-gray-800 mb-4 flex items-center">
                    <Shirt className="w-5 h-5 mr-2 text-purple-600" /> Curva de Tamanhos
                </h3>
                <div className="h-64 flex items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={sizeChartData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="name" />
                            <YAxis />
                            <Tooltip />
                            <Bar dataKey="value" name="Qtd Peças" fill="#8b5cf6" radius={[4, 4, 0, 0]} barSize={40} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>

        {/* PRODUCTION MATRIX TABLE - THE "KILLER FEATURE" */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden break-before-page">
            <div className="p-6 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
                <div>
                    <h3 className="font-bold text-lg text-gray-800 flex items-center">
                        <Scissors className="w-5 h-5 mr-2 text-red-600" /> Matriz de Corte & Produção
                    </h3>
                    <p className="text-sm text-gray-500">
                        {statusFilter === 'open' 
                         ? 'Projeção de produção baseada em pedidos abertos (Qtd Pedida).' 
                         : statusFilter === 'finalized'
                         ? 'Relatório de saída baseado em romaneios (Qtd Separada).'
                         : 'Visão geral híbrida.'}
                    </p>
                </div>
            </div>
            
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="bg-white text-gray-900 font-bold uppercase border-b-2 border-gray-300">
                        <tr>
                            <th className="p-3 border-r">Referência</th>
                            <th className="p-3 border-r">Cor</th>
                            {ALL_POSSIBLE_SIZES.map(s => (
                                <th key={s} className="p-3 text-center bg-gray-50 border-r w-12">{s}</th>
                            ))}
                            <th className="p-3 text-right bg-gray-100">Total</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {matrixList.map((row, idx) => (
                            <tr key={idx} className="hover:bg-gray-50">
                                <td className="p-3 font-bold border-r text-gray-800">{row.ref}</td>
                                <td className="p-3 border-r uppercase text-gray-600">{row.color}</td>
                                {ALL_POSSIBLE_SIZES.map(s => (
                                    <td key={s} className={`p-3 text-center border-r ${row.sizes[s] ? 'font-bold text-gray-800' : 'text-gray-300'}`}>
                                        {row.sizes[s] || '-'}
                                    </td>
                                ))}
                                <td className="p-3 text-right font-bold bg-gray-50 text-blue-700">{row.total}</td>
                            </tr>
                        ))}
                        {matrixList.length === 0 && (
                            <tr><td colSpan={10} className="p-8 text-center text-gray-400">Nenhum dado para o período selecionado.</td></tr>
                        )}
                    </tbody>
                    <tfoot className="bg-gray-100 font-bold border-t-2 border-gray-300">
                        <tr>
                            <td colSpan={2} className="p-3 text-right uppercase">Totais da Grade</td>
                            {ALL_POSSIBLE_SIZES.map(s => {
                                const colTotal = matrixList.reduce((acc, row) => acc + (row.sizes[s] || 0), 0);
                                return <td key={s} className="p-3 text-center text-gray-800">{colTotal || ''}</td>
                            })}
                            <td className="p-3 text-right text-lg text-blue-800">{totalPiecesCount}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>

        {/* PRINT FOOTER */}
        <div className="hidden print-only mt-8 text-center text-sm text-gray-500">
            <p>Relatório gerado em {new Date().toLocaleString()}</p>
            <p>Sistema Confecção Pro</p>
        </div>
    </div>
  );
};

export default AdminReports;
