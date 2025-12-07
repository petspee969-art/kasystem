
import React, { useState, useEffect } from 'react';
import { User, Order, Client } from '../types';
import { getOrders, getClients } from '../services/storageService';
import { Package, Clock, CheckCircle, Search, Eye, X, Loader2, Printer, CheckCheck } from 'lucide-react';

interface Props {
  user: User;
}

const ALL_SIZES = ['P', 'M', 'G', 'GG', 'G1', 'G2', 'G3'];

const RepOrderList: React.FC<Props> = ({ user }) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [selectedClientId, setSelectedClientId] = useState('');

  // Modal State
  const [viewOrder, setViewOrder] = useState<Order | null>(null);

  useEffect(() => {
    const fetchData = async () => {
        setLoading(true);
        const [o, c] = await Promise.all([getOrders(), getClients(user.id)]);
        setClients(c);
        setOrders(o.filter(o => o.repId === user.id).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
        setLoading(false);
    };
    fetchData();
  }, [user.id]);

  const handlePrint = (order: Order) => {
    const win = window.open('', '', 'height=800,width=900');
    if (!win) return;
    
    // VARIÁVEIS PARA RECALCULO DE TOTAL NO PRINT
    let calculatedTotalPieces = 0;
    let calculatedSubtotal = 0;

    const itemsHtml = order.items.map(item => {
        // CÁLCULO DINÂMICO DO TOTAL DA LINHA
        // CORREÇÃO: Se tem Romaneio ou é Parcial, usamos 'sizes' pois é o pedido consolidado.
        
        const isFinalized = !!order.romaneio || !!order.isPartial;

        let rowTotal = 0;
        const cellsHtml = ALL_SIZES.map(s => {
            let numVal = 0;
            
            // Lógica Unificada com Admin:
            // O campo 'sizes' contém o que foi efetivamente faturado no pedido (seja parcial ou completo).
            // Ignoramos 'picked' na impressão final, pois 'picked' é controle de processo de separação.
            numVal = (item.sizes && item.sizes[s]) || 0;
            
            rowTotal += numVal;
            return `<td class="text-center">${numVal > 0 ? numVal : '-'}</td>`;
        }).join('');

        // SE O PEDIDO ESTÁ FINALIZADO E A QUANTIDADE DESTA LINHA É 0, NÃO EXIBE NO PDF
        if (isFinalized && rowTotal === 0) {
            return '';
        }

        // Se a linha tiver total 0 mesmo não sendo finalizado (ex: item deletado logicamente), esconde
        if (rowTotal === 0) {
            return '';
        }

        calculatedTotalPieces += rowTotal;
        const rowValue = rowTotal * item.unitPrice;
        calculatedSubtotal += rowValue;

        return `
        <tr>
            <td class="p-2">
                <strong>${item.reference}</strong><br/>
                <span class="uppercase text-xs">${item.color}</span>
            </td>
            ${cellsHtml}
            <td class="text-right font-bold p-2">${rowTotal}</td>
            <td class="text-right p-2">${item.unitPrice.toFixed(2)}</td>
            <td class="text-right font-bold p-2">${rowValue.toFixed(2)}</td>
        </tr>
    `}).join('');

    const discountAmount = order.discountType === 'percentage' 
        ? (calculatedSubtotal * order.discountValue)/100 
        : order.discountValue;
    
    const finalTotal = calculatedSubtotal - discountAmount;

    // Formata o label do desconto para mostrar a porcentagem (ex: "Desconto (10%)")
    const discountLabel = order.discountType === 'percentage' 
        ? `Desconto (${order.discountValue}%)` 
        : `Desconto (Fixo)`;

    const html = `
      <html>
        <head>
          <title>Pedido #${order.displayId}</title>
          <script src="https://cdn.tailwindcss.com"></script>
          <style>
            @media print { 
                .no-print { display: none; } 
                body { -webkit-print-color-adjust: exact; } 
            }
            body { font-family: sans-serif; padding: 20px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #000; padding: 4px; }
            th { background-color: #f3f4f6; }
          </style>
        </head>
        <body class="bg-white text-black p-8">
            <div class="flex justify-between border-b-2 border-black pb-4 mb-6">
                <div>
                    <h1 class="text-3xl font-extrabold uppercase tracking-wider">
                        Pedido #${order.displayId}
                        ${order.isPartial ? '<span class="text-lg bg-gray-200 px-2 rounded ml-2">(PARCIAL)</span>' : ''}
                    </h1>
                    <p class="text-sm mt-1">Emissão: ${new Date(order.createdAt).toLocaleDateString()}</p>
                </div>
                <div class="text-right">
                    <p class="font-bold text-lg">${order.repName}</p>
                    <p class="text-sm text-gray-600">Representante</p>
                </div>
            </div>

            <div class="mb-6 border border-black p-4 bg-gray-50">
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <p class="text-xs uppercase text-gray-500 font-bold">Cliente</p>
                        <p class="font-bold text-lg">${order.clientName}</p>
                    </div>
                    <div>
                        <p class="text-xs uppercase text-gray-500 font-bold">Localização</p>
                        <p>${order.clientCity} - ${order.clientState}</p>
                    </div>
                    <div>
                        <p class="text-xs uppercase text-gray-500 font-bold">Entrega</p>
                        <p>${order.deliveryDate ? new Date(order.deliveryDate).toLocaleDateString() : 'A Combinar'}</p>
                    </div>
                    <div>
                        <p class="text-xs uppercase text-gray-500 font-bold">Pagamento</p>
                        <p>${order.paymentMethod || '-'}</p>
                    </div>
                    ${order.romaneio ? `
                    <div class="col-span-2 pt-2 border-t border-gray-300 mt-2">
                        <p class="text-xs uppercase text-gray-500 font-bold">Romaneio</p>
                        <p class="font-mono text-lg font-bold">${order.romaneio}</p>
                    </div>` : ''}
                </div>
            </div>

            <table class="w-full mb-6">
                <thead>
                    <tr class="bg-gray-200">
                        <th class="text-left p-2">Ref / Cor</th>
                        ${ALL_SIZES.map(s => `<th class="text-center w-8">${s}</th>`).join('')}
                        <th class="text-right p-2 w-16">Qtd</th>
                        <th class="text-right p-2 w-24">Unit.</th>
                        <th class="text-right p-2 w-24">Total</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsHtml}
                </tbody>
                <tfoot>
                    <tr class="bg-gray-100">
                        <td colspan="${ALL_SIZES.length + 1}" class="text-right font-bold uppercase p-2">Total Itens</td>
                        <td class="text-right font-bold p-2">${calculatedTotalPieces}</td>
                        <td class="text-right font-bold p-2">-</td>
                        <td class="text-right font-bold p-2">${calculatedSubtotal.toFixed(2)}</td>
                    </tr>
                    ${order.discountValue > 0 ? `
                    <tr>
                        <td colspan="${ALL_SIZES.length + 3}" class="text-right p-2">
                            ${discountLabel}
                        </td>
                        <td class="text-right text-red-600 font-bold p-2">
                            - ${discountAmount.toFixed(2)}
                        </td>
                    </tr>` : ''}
                    <tr class="text-lg border-t-2 border-black">
                        <td colspan="${ALL_SIZES.length + 3}" class="text-right uppercase font-bold p-2">Total Final</td>
                        <td class="text-right font-bold p-2">R$ ${finalTotal.toFixed(2)}</td>
                    </tr>
                </tfoot>
            </table>

            <div class="mt-12 pt-8 border-t border-black flex justify-between text-xs">
                <div class="text-center">
                    _______________________________<br/>
                    ${order.repName}<br/>(Representante)
                </div>
                <div class="text-center">
                    _______________________________<br/>
                    ${order.clientName}<br/>(Cliente)
                </div>
            </div>
            
            <script>
                window.onload = function() { window.print(); }
            </script>
        </body>
      </html>
    `;

    win.document.write(html);
    win.document.close();
  };

  const filteredOrders = selectedClientId 
    ? orders.filter(o => o.clientId === selectedClientId)
    : orders;

  if (loading) return <div className="flex justify-center p-10"><Loader2 className="animate-spin text-blue-600" /></div>;

  return (
    <div className="space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <h2 className="text-2xl font-bold text-gray-800">Meus Pedidos</h2>
            
            <div className="flex items-center w-full md:w-auto">
                <Search className="w-5 h-5 text-gray-400 mr-2" />
                <select
                    className="border p-2 rounded w-full md:w-64"
                    value={selectedClientId}
                    onChange={(e) => setSelectedClientId(e.target.value)}
                >
                    <option value="">Todos os Clientes</option>
                    {clients.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                </select>
            </div>
        </div>
        
        <div className="grid gap-4">
            {filteredOrders.map(order => {
                // Cálculo de progresso de separação
                let totalSeparado = 0;
                let totalPedido = order.totalPieces;
                order.items.forEach(item => {
                    if (item.picked) {
                        // Cast Object.values to number[] to avoid 'unknown' type errors
                        totalSeparado += (Object.values(item.picked) as number[]).reduce((a, b) => a + b, 0);
                    }
                });

                const isFullyPicked = totalSeparado >= totalPedido && totalPedido > 0;
                
                return (
                    <div key={order.id} className={`bg-white p-4 rounded-lg shadow border-l-4 ${order.romaneio ? 'border-green-600' : isFullyPicked ? 'border-green-400' : 'border-blue-400'} flex flex-col md:flex-row justify-between items-center transition-all`}>
                        <div className="mb-2 md:mb-0">
                            <div className="flex items-center gap-2">
                                <span className={`font-bold text-lg ${order.romaneio ? 'text-green-900' : isFullyPicked ? 'text-green-700' : 'text-blue-900'}`}>
                                    Pedido #{order.displayId} 
                                    {order.isPartial && <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded ml-2">PARCIAL</span>}
                                </span>
                                <span className="text-sm text-gray-500">{new Date(order.createdAt).toLocaleDateString()}</span>
                            </div>
                            <div className="text-gray-700 font-medium">{order.clientName}</div>
                            {order.romaneio && (
                                <div className="text-xs text-gray-500 mt-0.5">Romaneio: <span className="font-mono font-bold text-gray-700">{order.romaneio}</span></div>
                            )}
                            <div className="text-sm text-gray-500 mt-1">
                                {order.totalPieces} peças • <span className="text-green-600 font-bold">R$ {(order.finalTotalValue || 0).toFixed(2)}</span>
                            </div>
                             {/* Indicador de Separação - Só exibe se NÃO tiver romaneio e houver algo separado */}
                             {totalSeparado > 0 && !order.romaneio && (
                                <div className={`mt-2 text-xs inline-block px-2 py-1 rounded border font-bold ${isFullyPicked ? 'bg-green-100 text-green-800 border-green-200' : 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                                    {isFullyPicked ? 'Separação Completa: ' : 'Separação: '}
                                    <span className="ml-1">
                                        {totalSeparado} / {totalPedido}
                                    </span>
                                </div>
                            )}
                        </div>
                        
                        <div className="flex items-center gap-2">
                            {order.romaneio ? (
                                <div className="flex items-center text-green-800 bg-green-200 px-3 py-1 rounded-full text-sm font-bold mr-2 border border-green-300">
                                    <CheckCircle className="w-4 h-4 mr-2" /> Finalizado
                                </div>
                            ) : order.status === 'printed' ? (
                                <div className="flex items-center text-green-600 bg-green-50 px-3 py-1 rounded-full text-sm font-bold mr-2">
                                    <CheckCircle className="w-4 h-4 mr-2" /> Processado
                                </div>
                            ) : isFullyPicked ? (
                                <div className="flex items-center text-green-700 bg-green-100 px-3 py-1 rounded-full text-sm font-bold mr-2 border border-green-200">
                                    <CheckCheck className="w-4 h-4 mr-2" /> Completo
                                </div>
                            ) : (
                                <div className="flex items-center text-yellow-600 bg-yellow-50 px-3 py-1 rounded-full text-sm font-bold mr-2">
                                    <Clock className="w-4 h-4 mr-2" /> Aguardando
                                </div>
                            )}
                            
                            <button 
                                onClick={() => handlePrint(order)}
                                className="text-gray-600 hover:bg-gray-100 p-2 rounded-full transition"
                                title="Imprimir Pedido"
                            >
                                <Printer className="w-5 h-5" />
                            </button>

                            <button 
                            onClick={() => setViewOrder(order)}
                            className="text-blue-600 hover:bg-blue-50 p-2 rounded-full transition"
                            title="Ver Detalhes"
                            >
                                <Eye className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                );
            })}
            {filteredOrders.length === 0 && (
                <div className="text-center py-12 bg-white rounded-lg border border-dashed">
                    <Package className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                    <p className="text-gray-500">Nenhum pedido encontrado.</p>
                </div>
            )}
        </div>

        {/* View Order Modal */}
        {viewOrder && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-lg w-full max-w-2xl shadow-xl flex flex-col max-h-[90vh]">
                    <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-lg">
                        <h3 className="font-bold text-lg text-gray-800">
                            Detalhes do Pedido #{viewOrder.displayId}
                            {viewOrder.isPartial && <span className="text-sm bg-purple-100 text-purple-700 px-2 py-0.5 rounded ml-2 align-middle font-normal">PARCIAL</span>}
                        </h3>
                        <button onClick={() => setViewOrder(null)}>
                            <X className="w-6 h-6 text-gray-500 hover:text-gray-700" />
                        </button>
                    </div>
                    <div className="p-6 overflow-y-auto">
                        <div className="grid grid-cols-2 gap-4 mb-6">
                            <div>
                                <p className="text-xs text-gray-500 uppercase">Cliente</p>
                                <p className="font-bold">{viewOrder.clientName}</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-500 uppercase">Entrega</p>
                                <p>{viewOrder.deliveryDate ? new Date(viewOrder.deliveryDate).toLocaleDateString() : 'A combinar'}</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-500 uppercase">Pagamento</p>
                                <p>{viewOrder.paymentMethod || '-'}</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-500 uppercase">Romaneio</p>
                                <p className="font-mono font-bold">{viewOrder.romaneio || '-'}</p>
                            </div>
                        </div>

                        <table className="w-full text-sm border-collapse border border-gray-200">
                            <thead className="bg-gray-100">
                                <tr>
                                    <th className="border p-2 text-left">Ref</th>
                                    <th className="border p-2 text-left">Cor</th>
                                    <th className="border p-2 text-center">Grade</th>
                                    <th className="border p-2 text-right">Qtd</th>
                                    <th className="border p-2 text-right">Total</th>
                                </tr>
                            </thead>
                            
                            {/* IIFE para calcular totais dinamicamente dentro do render */}
                            {(() => {
                                let modalTotalPieces = 0;
                                let modalSubtotal = 0;
                                
                                // FLAG CRÍTICA: Se tem Romaneio, o cálculo é ESTRITO (só o que foi separado/bipado)
                                const isFinalized = !!viewOrder.romaneio || !!viewOrder.isPartial;

                                const rows = viewOrder.items.map((item, idx) => {
                                     let rowTotal = 0;
                                     ALL_SIZES.forEach(s => {
                                         let numVal = 0;
                                         
                                         // Correção de lógica: 
                                         // Se é finalizado/parcial, a quantidade real está em 'sizes' (o pedido foi reescrito).
                                         // Ignoramos 'picked' para pedidos finalizados pois 'picked' é um estado transiente de separação.
                                         numVal = (item.sizes && item.sizes[s]) || 0;
                                         
                                         rowTotal += numVal;
                                     });
                                     
                                     // Se for finalizado e a linha estiver zerada, não exibe
                                     if (isFinalized && rowTotal === 0) return null;

                                     modalTotalPieces += rowTotal;
                                     const rowValue = rowTotal * item.unitPrice;
                                     modalSubtotal += rowValue;

                                     return (
                                        <tr key={idx}>
                                            <td className="border p-2 font-medium">{item.reference}</td>
                                            <td className="border p-2">{item.color}</td>
                                            <td className="border p-2 text-center">
                                                {/* Visualização de Grade */}
                                                {ALL_SIZES.map(s => {
                                                    const q = (item.sizes && item.sizes[s]) || 0;
                                                    const p = (item.picked && item.picked[s]) || 0;

                                                    if (q === 0 && p === 0) return null;

                                                    let displayStr = `${q}`;
                                                    let style = 'bg-gray-100 text-gray-600 border-gray-200';

                                                    // Se estiver aberto e tiver separação em andamento, mostra X/Y
                                                    // Se estiver fechado, mostra só a quantidade final (q)
                                                    if (!isFinalized && p > 0) {
                                                        if (q === 0) {
                                                            displayStr = `${p}`;
                                                            style = 'bg-blue-100 text-blue-800 border-blue-200';
                                                        } else {
                                                            displayStr = `${p}/${q}`;
                                                            if (p >= q) style = 'bg-green-100 text-green-800 border-green-200';
                                                            else style = 'bg-yellow-50 text-yellow-700 border-yellow-200';
                                                        }
                                                    }

                                                    return (
                                                        <span key={s} className={`${style} px-1.5 py-0.5 mx-0.5 rounded text-xs border inline-block mb-1`}>
                                                            <span className="font-bold mr-0.5">{s}:</span>{displayStr}
                                                        </span>
                                                    )
                                                })}
                                                {(!item.sizes && !item.picked) && <span className="text-gray-300">-</span>}
                                            </td>
                                            <td className="border p-2 text-right font-bold">{rowTotal}</td>
                                            <td className="border p-2 text-right">R$ {rowValue.toFixed(2)}</td>
                                        </tr>
                                     );
                                });

                                // Footer Totals
                                let discountAmount = 0;
                                if (viewOrder.discountType === 'percentage') {
                                    discountAmount = modalSubtotal * (viewOrder.discountValue / 100);
                                } else if (viewOrder.discountType === 'fixed') {
                                    discountAmount = viewOrder.discountValue;
                                }
                                const finalTotal = modalSubtotal - discountAmount;

                                return (
                                    <>
                                        <tbody>{rows}</tbody>
                                        <tfoot className="bg-gray-50 font-bold">
                                            <tr>
                                                <td colSpan={3} className="border p-2 text-right">Total Peças</td>
                                                <td className="border p-2 text-right">{modalTotalPieces}</td>
                                                <td className="border p-2 text-right">-</td>
                                            </tr>
                                            {viewOrder.discountValue > 0 && (
                                                <tr className="text-red-600">
                                                    <td colSpan={4} className="border p-2 text-right">
                                                        {viewOrder.discountType === 'percentage' 
                                                            ? `Desconto (${viewOrder.discountValue}%)` 
                                                            : 'Desconto (Fixo)'}
                                                    </td>
                                                    <td className="border p-2 text-right">- {discountAmount.toFixed(2)}</td>
                                                </tr>
                                            )}
                                            <tr className="text-lg">
                                                <td colSpan={4} className="border p-2 text-right uppercase">Total Final</td>
                                                <td className="border p-2 text-right text-green-700">R$ {finalTotal.toFixed(2)}</td>
                                            </tr>
                                        </tfoot>
                                    </>
                                );
                            })()}
                        </table>
                    </div>
                    
                    {/* Botão de Imprimir/Compartilhar no Modal */}
                    <div className="p-4 border-t bg-gray-50 rounded-b-lg flex justify-end">
                        <button 
                            onClick={() => handlePrint(viewOrder)}
                            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 flex items-center shadow-sm font-medium"
                        >
                            <Printer className="w-5 h-5 mr-2" />
                            Imprimir / Compartilhar
                        </button>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};

export default RepOrderList;
