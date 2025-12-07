import React, { useState, useEffect } from 'react';
import { Order } from '../types';
import { getOrders } from '../services/storageService';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell } from 'recharts';
import { generateSalesAnalysis } from '../services/geminiService';
import { Sparkles, RefreshCcw, TrendingUp, Users, ShoppingBag, Package, Calendar, Loader2 } from 'lucide-react';

interface Props {
  onNavigate: (tab: string) => void;
}

const AdminDashboard: React.FC<Props> = ({ onNavigate }) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [aiAnalysis, setAiAnalysis] = useState<string>("");
  const [loadingAi, setLoadingAi] = useState(false);
  const [loadingData, setLoadingData] = useState(true);

  const fetchData = async () => {
    setLoadingData(true);
    const data = await getOrders();
    setOrders(data);
    setLoadingData(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  // --- ANALYTICS CALCULATIONS ---

  // 1. Basic KPIs
  const totalOrders = orders.length;
  const totalPieces = orders.reduce((acc, curr) => acc + curr.totalPieces, 0);
  const avgPiecesPerOrder = totalOrders > 0 ? Math.round(totalPieces / totalOrders) : 0;
  const activeClients = new Set(orders.map(o => o.clientId)).size;

  // 2. Rep Performance (Ranking)
  const repPerfMap: Record<string, { orders: number; pieces: number }> = {};
  orders.forEach(o => {
    const repName = o.repName || 'Desconhecido';
    if (!repPerfMap[repName]) repPerfMap[repName] = { orders: 0, pieces: 0 };
    repPerfMap[repName].orders += 1;
    repPerfMap[repName].pieces += o.totalPieces;
  });

  const repRankingData = Object.keys(repPerfMap)
    .map(rep => ({ name: rep, pecas: repPerfMap[rep].pieces, pedidos: repPerfMap[rep].orders }))
    .sort((a, b) => b.pecas - a.pecas);

  // 3. Top Products (Reference + Color)
  const productSales: Record<string, number> = {};
  orders.forEach(o => {
    o.items.forEach(item => {
      const key = `${item.reference} - ${item.color}`;
      productSales[key] = (productSales[key] || 0) + item.totalQty;
    });
  });

  const topProductsData = Object.keys(productSales)
    .map(key => ({ name: key, pecas: productSales[key] }))
    .sort((a, b) => b.pecas - a.pecas)
    .slice(0, 8); // Top 8

  // 4. Colors for Charts
  const COLORS = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899', '#6366f1', '#14b8a6'];

  const handleAiAnalysis = async () => {
    setLoadingAi(true);
    setAiAnalysis("");
    const result = await generateSalesAnalysis(orders);
    setAiAnalysis(result || "Sem dados suficientes.");
    setLoadingAi(false);
  };

  if (loadingData) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="animate-spin text-blue-600 w-8 h-8" /></div>
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-center">
        <div>
           <h2 className="text-3xl font-bold text-gray-900">Dashboard de Controle</h2>
           <p className="text-gray-500 mt-1">Visão estratégica da produção e vendas</p>
        </div>
        <div className="flex gap-2 mt-4 md:mt-0">
           <button 
             onClick={handleAiAnalysis}
             disabled={loadingAi}
             className="flex items-center bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 disabled:opacity-50 transition shadow-md"
           >
             <Sparkles className="w-4 h-4 mr-2" />
             {loadingAi ? 'Analisando...' : 'Gerar Análise IA'}
           </button>
           <button 
             onClick={fetchData}
             className="p-2 bg-white border rounded-lg hover:bg-gray-50 transition shadow-sm"
             title="Atualizar Dados"
           >
             <RefreshCcw className="w-5 h-5 text-gray-700" />
           </button>
        </div>
      </div>

      {/* AI Insights Section */}
      {aiAnalysis && (
        <div className="bg-gradient-to-r from-purple-50 to-indigo-50 p-6 rounded-xl border border-purple-100 shadow-sm">
          <h3 className="font-bold text-purple-900 mb-3 flex items-center text-lg">
            <Sparkles className="w-5 h-5 mr-2 text-purple-600" /> Insights Inteligentes da IA
          </h3>
          <p className="text-gray-800 whitespace-pre-line leading-relaxed">{aiAnalysis}</p>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition">
            <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-blue-50 rounded-lg text-blue-600"><ShoppingBag className="w-6 h-6" /></div>
                <span className="text-xs font-bold text-gray-400 uppercase">Total Pedidos</span>
            </div>
            <h3 className="text-3xl font-bold text-gray-900">{totalOrders}</h3>
            <p className="text-sm text-gray-500 mt-1">Pedidos realizados</p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition">
            <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-green-50 rounded-lg text-green-600"><Package className="w-6 h-6" /></div>
                <span className="text-xs font-bold text-gray-400 uppercase">Vol. Peças</span>
            </div>
            <h3 className="text-3xl font-bold text-gray-900">{totalPieces}</h3>
            <p className="text-sm text-green-600 mt-1 font-medium flex items-center">
               <TrendingUp className="w-3 h-3 mr-1" /> Produção Total
            </p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition">
            <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-purple-50 rounded-lg text-purple-600"><Users className="w-6 h-6" /></div>
                <span className="text-xs font-bold text-gray-400 uppercase">Clientes Ativos</span>
            </div>
            <h3 className="text-3xl font-bold text-gray-900">{activeClients}</h3>
            <p className="text-sm text-gray-500 mt-1">Compraram recentemente</p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition">
            <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-orange-50 rounded-lg text-orange-600"><Calendar className="w-6 h-6" /></div>
                <span className="text-xs font-bold text-gray-400 uppercase">Média/Pedido</span>
            </div>
            <h3 className="text-3xl font-bold text-gray-900">{avgPiecesPerOrder}</h3>
            <p className="text-sm text-gray-500 mt-1">Peças por pedido</p>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Top Products Chart */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="text-lg font-bold text-gray-800 mb-6">Top Produtos (Referência + Cor)</h3>
            <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topProductsData} layout="vertical" margin={{ left: 40 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" />
                        <YAxis dataKey="name" type="category" width={100} tick={{fontSize: 10}} />
                        <Tooltip contentStyle={{borderRadius: '8px'}} />
                        <Bar dataKey="pecas" name="Peças Vendidas" radius={[0, 4, 4, 0]}>
                            {topProductsData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>

        {/* Representative Performance Chart */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="text-lg font-bold text-gray-800 mb-6">Ranking de Representantes</h3>
            <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={repRankingData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip cursor={{fill: '#f3f4f6'}} contentStyle={{borderRadius: '8px'}} />
                        <Legend />
                        <Bar dataKey="pecas" name="Peças Vendidas" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="pedidos" name="Qtd Pedidos" fill="#fbbf24" radius={[4, 4, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
      </div>

      {/* Recent Activity Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-6 border-b border-gray-100">
             <h3 className="text-lg font-bold text-gray-800">Últimas Vendas</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-gray-500">
                    <tr>
                        <th className="p-4 font-medium">Data</th>
                        <th className="p-4 font-medium">Representante</th>
                        <th className="p-4 font-medium">Cliente</th>
                        <th className="p-4 font-medium">Itens</th>
                        <th className="p-4 font-medium text-right">Total Peças</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {orders.slice(0, 5).map(order => (
                        <tr key={order.id} className="hover:bg-gray-50">
                            <td className="p-4">{new Date(order.createdAt).toLocaleDateString()}</td>
                            <td className="p-4 font-medium text-gray-700">{order.repName}</td>
                            <td className="p-4">{order.clientName}</td>
                            <td className="p-4 text-gray-500">{order.items.length} modelos</td>
                            <td className="p-4 text-right font-bold text-blue-600">{order.totalPieces}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
          </div>
          <div className="p-4 bg-gray-50 text-center">
              <button 
                onClick={() => onNavigate('orders')}
                className="text-blue-600 font-medium hover:underline text-sm"
              >
                Ver todos os pedidos
              </button>
          </div>
      </div>
    </div>
  );
};

export default AdminDashboard;