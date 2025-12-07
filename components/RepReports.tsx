
import React, { useState, useEffect } from 'react';
import { User, Order, Client } from '../types';
import { getOrders, getClients } from '../services/storageService';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Loader2, Calendar, Search, Filter, Printer, ShoppingBag, DollarSign, Package, UserCheck, ClipboardList } from 'lucide-react';

interface Props {
  user: User;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

const RepReports: React.FC<Props> = ({ user }) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [searchTerm, setSearchTerm] = useState(''); // Filtra por ref ou cor

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [allOrders, allClients] = await Promise.all([
        getOrders(), 
        getClients(user.id)
      ]);
      // Filter orders strictly for this rep
      setOrders(allOrders.filter(o => o.repId === user.id));
      setClients(allClients);
      setLoading(false);
    };
    load();
  }, [user.id]);

  // --- FILTER LOGIC ---
  const filteredOrders = orders.filter(o => {
    const d = o.createdAt.split('T')[0];
    const matchDate = d >= startDate && d <= endDate;
    const matchClient = selectedClientId ? o.clientId === selectedClientId : true;
    
    // Se tiver termo de busca, verifica se algum ITEM do pedido corresponde
    let matchTerm = true;
    if (searchTerm) {
      const termLower = searchTerm.toLowerCase();
      matchTerm = o.items.some(item => 
        item.reference.toLowerCase().includes(termLower) || 
        item.color.toLowerCase().includes(termLower)
      );
    }

    return matchDate && matchClient && matchTerm;
  });

  // --- HELPER: Selected Client Object ---
  const selectedClient = selectedClientId ? clients.find(c => c.id === selectedClientId) : null;

  // --- AGGREGATIONS FOR KPI ---
  const totalRevenue = filteredOrders.reduce((acc, o) => acc + (o.finalTotalValue || 0), 0);
  const totalPieces = filteredOrders.reduce((acc, o) => acc + o.totalPieces, 0);
  const totalOrdersCount = filteredOrders.length;

  // --- AGGREGATION FOR CHARTS ---
  // Top 5 Clientes por Valor
  const clientSales: Record<string, number> = {};
  filteredOrders.forEach(o => {
      clientSales[o.clientName] = (clientSales[o.clientName] || 0) + (o.finalTotalValue || 0);
  });
  const topClientsData = Object.entries(clientSales)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  // --- FLATTEN ITEMS FOR DETAILED TABLE ---
  // Transforma lista de pedidos em lista de itens vendidos
  const soldItems = filteredOrders.flatMap(o => 
    o.items.map(item => ({
       orderId: o.displayId,
       date: o.createdAt,
       clientName: o.clientName,
       reference: item.reference,
       color: item.color,
       totalQty: item.totalQty,
       unitPrice: item.unitPrice,
       totalValue: item.totalItemValue,
       sizes: item.sizes
    }))
  ).filter(item => {
    // Aplica filtro de termo novamente no nível do item para a tabela ficar limpa
    if (!searchTerm) return true;
    const termLower = searchTerm.toLowerCase();
    return item.reference.toLowerCase().includes(termLower) || item.color.toLowerCase().includes(termLower);
  });

  // Ordenar itens por data
  soldItems.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

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
                        <Package className="w-6 h-6 mr-2 text-blue-600" /> Meus Relatórios de Vendas
                    </h2>
                    <p className="text-gray-500 text-sm mt-1">Acompanhe seu desempenho, vendas por cliente e produtos.</p>
                </div>
                <button 
                    onClick={handlePrint}
                    className="mt-4 md:mt-0 bg-gray-800 text-white px-4 py-2 rounded flex items-center hover:bg-gray-900 transition"
                >
                    <Printer className="w-4 h-4 mr-2" /> Imprimir
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">De</label>
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
                    <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Até</label>
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
                <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Cliente</label>
                    <div className="relative">
                        <Filter className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                        <select 
                            className="w-full border rounded p-2 pl-9 text-sm focus:ring-2 focus:ring-blue-500 bg-white"
                            value={selectedClientId}
                            onChange={e => setSelectedClientId(e.target.value)}
                        >
                            <option value="">Todos os Clientes</option>
                            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>
                </div>
                 <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Ref ou Cor</label>
                    <div className="relative">
                        <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                        <input 
                            type="text" 
                            placeholder="Buscar..."
                            className="w-full border rounded p-2 pl-9 text-sm focus:ring-2 focus:ring-blue-500"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
            </div>
        </div>

        {/* PRINT HEADER ONLY */}
        <div className="hidden print-only mb-6 text-center border-b-2 border-black pb-4">
            <h1 className="text-2xl font-bold uppercase">Relatório de Vendas - {user.name}</h1>
            <p className="text-sm mt-1">Período: {new Date(startDate).toLocaleDateString()} até {new Date(endDate).toLocaleDateString()}</p>
            {selectedClient && <p className="font-bold mt-2">Cliente: {selectedClient.name}</p>}
        </div>

        {/* SUMMARY HEADER IF CLIENT SELECTED */}
        {selectedClient && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center animate-fade-in">
                <div className="bg-blue-100 p-2 rounded-full mr-3 text-blue-600">
                    <UserCheck className="w-5 h-5" />
                </div>
                <div>
                    <span className="block text-xs font-bold text-blue-500 uppercase">Filtrado por Cliente</span>
                    <span className="block text-lg font-bold text-blue-900">{selectedClient.name}</span>
                    <span className="text-sm text-blue-700">{selectedClient.city} - {selectedClient.state}</span>
                </div>
            </div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
             <div className="bg-white p-5 rounded-lg shadow-sm border border-l-4 border-l-green-500 border-gray-100 flex items-center">
                <div className="p-3 bg-green-50 rounded-full mr-4 text-green-600">
                    <DollarSign className="w-6 h-6" />
                </div>
                <div>
                    <p className="text-xs font-bold text-gray-500 uppercase">Total Vendido</p>
                    <p className="text-2xl font-bold text-gray-900">R$ {totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                </div>
            </div>
            
            <div className="bg-white p-5 rounded-lg shadow-sm border border-l-4 border-l-blue-500 border-gray-100 flex items-center">
                <div className="p-3 bg-blue-50 rounded-full mr-4 text-blue-600">
                    <Package className="w-6 h-6" />
                </div>
                <div>
                    <p className="text-xs font-bold text-gray-500 uppercase">Peças Vendidas</p>
                    <p className="text-2xl font-bold text-gray-900">{totalPieces}</p>
                </div>
            </div>

            {/* CARD DINÂMICO DE PEDIDOS */}
             <div className="bg-white p-5 rounded-lg shadow-sm border border-l-4 border-l-purple-500 border-gray-100 flex items-center">
                <div className="p-3 bg-purple-50 rounded-full mr-4 text-purple-600">
                    <ShoppingBag className="w-6 h-6" />
                </div>
                <div>
                    <p className="text-xs font-bold text-gray-500 uppercase">
                        {selectedClient ? `Pedidos (${selectedClient.name.split(' ')[0]})` : 'Total de Pedidos'}
                    </p>
                    <p className="text-2xl font-bold text-gray-900">{totalOrdersCount}</p>
                    {selectedClient && (
                         <span className="text-[10px] text-purple-600 bg-purple-50 px-1 rounded">neste período</span>
                    )}
                </div>
            </div>
        </div>

        {/* NOVA TABELA: HISTÓRICO DE PEDIDOS (RESUMO) */}
        {selectedClient && filteredOrders.length > 0 && (
             <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden animate-fade-in break-inside-avoid">
                <div className="p-4 bg-gray-50 border-b border-gray-200 flex items-center">
                     <ClipboardList className="w-5 h-5 mr-2 text-blue-600" />
                     <h3 className="font-bold text-gray-800 text-sm uppercase">
                        Histórico de Pedidos - {selectedClient.name}
                     </h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-white text-gray-600 font-bold uppercase border-b text-xs">
                            <tr>
                                <th className="p-3">Data</th>
                                <th className="p-3">Pedido #</th>
                                <th className="p-3 text-center">Qtd Peças</th>
                                <th className="p-3 text-right">Valor Total</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredOrders.sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map(order => (
                                <tr key={order.id} className="hover:bg-gray-50">
                                    <td className="p-3 text-gray-600">
                                        {new Date(order.createdAt).toLocaleDateString()}
                                    </td>
                                    <td className="p-3 font-bold text-gray-800">#{order.displayId}</td>
                                    <td className="p-3 text-center text-blue-600 font-medium">{order.totalPieces}</td>
                                    <td className="p-3 text-right font-bold text-green-700">
                                        R$ {(order.finalTotalValue || 0).toFixed(2)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot className="bg-gray-50 border-t border-gray-200">
                            <tr>
                                <td colSpan={2} className="p-3 text-right font-bold text-gray-500 uppercase">Total do Período</td>
                                <td className="p-3 text-center font-bold text-blue-800 text-lg">{totalPieces}</td>
                                <td className="p-3 text-right font-bold text-green-800 text-lg">R$ {totalRevenue.toFixed(2)}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* TOP CLIENTES CHART - Só exibe se NÃO tiver cliente selecionado */}
            {!selectedClientId && (
                <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 lg:col-span-1 break-inside-avoid">
                    <h3 className="font-bold text-gray-800 mb-4 text-sm uppercase">Top 5 Clientes (Valor)</h3>
                    <div className="h-64">
                        {topClientsData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={topClientsData} layout="vertical" margin={{ left: 0, right: 30 }}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                    <XAxis type="number" hide />
                                    <YAxis dataKey="name" type="category" width={90} tick={{fontSize: 10}} />
                                    <Tooltip formatter={(value) => `R$ ${Number(value).toFixed(2)}`} />
                                    <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={20}>
                                        {topClientsData.map((_, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full flex items-center justify-center text-gray-400 text-sm">Sem dados</div>
                        )}
                    </div>
                </div>
            )}

            {/* DETAILED ITEMS TABLE */}
            <div className={`bg-white rounded-lg shadow-sm border border-gray-200 ${selectedClientId ? 'lg:col-span-3' : 'lg:col-span-2'} overflow-hidden break-before-page`}>
                <div className="p-4 bg-gray-50 border-b border-gray-200">
                     <h3 className="font-bold text-gray-800 text-sm uppercase">
                        {selectedClient ? `Detalhamento de Itens - ${selectedClient.name}` : 'Histórico de Itens Vendidos'}
                     </h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-white text-gray-600 font-bold uppercase border-b text-xs">
                            <tr>
                                <th className="p-3">Data</th>
                                {!selectedClientId && <th className="p-3">Cliente</th>}
                                <th className="p-3">Item (Ref/Cor)</th>
                                <th className="p-3 text-center">Grade</th>
                                <th className="p-3 text-right">Qtd</th>
                                <th className="p-3 text-right">Total</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {soldItems.length === 0 ? (
                                <tr><td colSpan={selectedClientId ? 5 : 6} className="p-6 text-center text-gray-400">Nenhum item encontrado com os filtros atuais.</td></tr>
                            ) : (
                                soldItems.map((item, idx) => (
                                    <tr key={idx} className="hover:bg-gray-50">
                                        <td className="p-3 text-gray-500 whitespace-nowrap">
                                            {new Date(item.date).toLocaleDateString()}
                                            <div className="text-[10px] text-gray-400">#{item.orderId}</div>
                                        </td>
                                        {!selectedClientId && <td className="p-3 font-medium text-gray-800">{item.clientName}</td>}
                                        <td className="p-3">
                                            <span className="font-bold block">{item.reference}</span>
                                            <span className="text-xs uppercase text-gray-500">{item.color}</span>
                                        </td>
                                        <td className="p-3 text-center">
                                            <div className="flex flex-wrap justify-center gap-1">
                                                {Object.entries(item.sizes).map(([s, q]) => (
                                                    <span key={s} className="bg-gray-100 text-gray-600 px-1 rounded text-[10px] border">
                                                        {s}:{q}
                                                    </span>
                                                ))}
                                            </div>
                                        </td>
                                        <td className="p-3 text-right font-bold text-blue-600">{item.totalQty}</td>
                                        <td className="p-3 text-right text-gray-700">R$ {item.totalValue.toFixed(2)}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>
  );
};

export default RepReports;
