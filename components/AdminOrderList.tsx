import React, { useState, useEffect } from 'react';
import { Order, OrderItem, ProductDef, SIZE_GRIDS, User, Role } from '../types';
import { getOrders, updateOrderStatus, saveOrderPicking, getProducts, updateOrderRomaneio, getUsers, getRepPrices, addOrder, generateUUID } from '../services/storageService';
import { supabase } from '../services/supabaseClient'; // Importação do Supabase para Realtime
import { Printer, Calculator, CheckCircle, X, Loader2, PackageOpen, Save, Lock, Unlock, AlertTriangle, Bell, RefreshCw, Plus, Trash, Search, Edit2, Check, Truck, Filter, User as UserIcon, Split, Scissors } from 'lucide-react';

const ALL_SIZES = ['P', 'M', 'G', 'GG', 'G1', 'G2', 'G3'];

const AdminOrderList: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<ProductDef[]>([]); 
  const [reps, setReps] = useState<User[]>([]); // Lista de representantes para o filtro
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedRepId, setSelectedRepId] = useState(''); // Filtro por Representante
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'finalized'>('all'); // Filtro Aberto/Finalizado
  const [romaneioSearch, setRomaneioSearch] = useState(''); // Busca por Romaneio
  
  // Aggregation Modal State
  const [showAggregation, setShowAggregation] = useState(false);

  // Separation Modal State
  const [pickingOrder, setPickingOrder] = useState<Order | null>(null);
  const [pickingItems, setPickingItems] = useState<OrderItem[]>([]);
  const [savingPicking, setSavingPicking] = useState(false);
  const [showRomaneioOptions, setShowRomaneioOptions] = useState(false); // Modal interno de opções de romaneio
  const [inputRomaneio, setInputRomaneio] = useState('');

  // NOVO: Estado para armazenar os preços do representante do pedido atual
  const [currentRepPriceMap, setCurrentRepPriceMap] = useState<Record<string, number>>({});
  
  // NOVO: Estado para controlar qual item está sendo editado no modal de separação
  const [editingItemIdx, setEditingItemIdx] = useState<number | null>(null);

  // Add Item States inside Modal
  const [addRef, setAddRef] = useState('');
  const [addColor, setAddColor] = useState('');

  // NOVO: Estado para notificação de novo pedido
  const [newOrderNotification, setNewOrderNotification] = useState(false);

  const fetchData = async (isBackgroundUpdate = false) => {
    if (!isBackgroundUpdate) setLoading(true);
    
    // Busca pedidos, produtos e usuários (para filtro de reps) em paralelo
    const [ordersData, productsData, usersData] = await Promise.all([
        getOrders(),
        getProducts(),
        getUsers()
    ]);
    
    setOrders(ordersData.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    setProducts(productsData);
    setReps(usersData.filter(u => u.role === Role.REP));
    
    if (!isBackgroundUpdate) setLoading(false);
  };

  // Efeito Inicial + Realtime Subscription
  useEffect(() => {
    fetchData();

    // Configura o canal de Realtime do Supabase
    const channel = supabase
      .channel('admin-orders-channel')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders' },
        (payload) => {
          console.log('Novo pedido recebido em tempo real!', payload);
          
          // 1. Toca um som de notificação (beep suave)
          try {
             const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
             audio.volume = 0.5;
             audio.play().catch(e => console.warn("Autoplay bloqueado pelo navegador", e));
          } catch (e) {
             // Ignora erro de áudio
          }

          // 2. Exibe notificação visual
          setNewOrderNotification(true);
          
          // 3. Atualiza a lista automaticamente
          fetchData(true);

          // Remove a notificação visual após 8 segundos
          setTimeout(() => setNewOrderNotification(false), 8000);
        }
      )
      .subscribe();

    // Cleanup ao sair da tela
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedOrderIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedOrderIds(newSet);
  };

  const filteredOrders = orders.filter(o => {
    // 1. Prioridade Máxima: Busca por Romaneio (se digitado, ignora datas para facilitar rastreio)
    if (romaneioSearch) {
        return o.romaneio && o.romaneio.includes(romaneioSearch);
    }

    // 2. Filtros de Data
    const orderDate = o.createdAt.split('T')[0];
    const afterStart = !startDate || orderDate >= startDate;
    const beforeEnd = !endDate || orderDate <= endDate;
    
    // 3. Filtro de Representante
    const matchRep = !selectedRepId || o.repId === selectedRepId;

    // 4. Filtro de Status (Aberto vs Finalizado/Romaneio)
    let matchStatus = true;
    if (statusFilter === 'open') {
        // Aberto = SEM romaneio
        matchStatus = !o.romaneio;
    } else if (statusFilter === 'finalized') {
        // Finalizado = COM romaneio
        matchStatus = !!o.romaneio;
    }

    return afterStart && beforeEnd && matchRep && matchStatus;
  });

  const handleSelectAllFiltered = () => {
    if (selectedOrderIds.size === filteredOrders.length && filteredOrders.length > 0) {
        setSelectedOrderIds(new Set()); // Deselect all
    } else {
        setSelectedOrderIds(new Set(filteredOrders.map(o => o.id))); // Select all currently visible
    }
  };

  // --- ROMANEIO LOGIC ---
  const handleEditRomaneio = async (order: Order) => {
      const newRomaneio = prompt("Informe o número do Romaneio:", order.romaneio || "");
      if (newRomaneio !== null) {
          try {
              // Salva no banco (validação de duplicidade ocorre lá)
              await updateOrderRomaneio(order.id, newRomaneio);
              
              // Se sucesso, atualiza localmente
              const updatedOrders = orders.map(o => o.id === order.id ? { ...o, romaneio: newRomaneio } : o);
              setOrders(updatedOrders);
          } catch (e: any) {
              alert("Erro ao salvar Romaneio: " + (e.message || "Tente novamente."));
              fetchData(true); // Garante sincronia
          }
      }
  };

  // --- SEPARATION LOGIC ---
  const openPickingModal = async (order: Order) => {
      // Bloqueia edição se tiver romaneio
      if (order.romaneio) {
          alert("Este pedido já possui Romaneio e está finalizado. Não é possível alterar itens ou estoque.");
          return;
      }

      // CARREGA PREÇOS DO REPRESENTANTE ESPECÍFICO DESTE PEDIDO
      // Isso garante que se o admin adicionar um item, ele venha com o preço que o representante configurou
      try {
          const prices = await getRepPrices(order.repId);
          const priceMap: Record<string, number> = {};
          prices.forEach(p => {
              if (p.reference) {
                  priceMap[p.reference.trim().toUpperCase()] = p.price;
              }
          });
          setCurrentRepPriceMap(priceMap);
      } catch (e) {
          console.error("Erro ao carregar tabela de preços do representante", e);
          setCurrentRepPriceMap({});
      }

      // Deep clone items to avoid mutating state directly
      const itemsCopy = order.items.map(item => ({
          ...item,
          sizes: { ...item.sizes },
          picked: item.picked ? { ...item.picked } : {} 
      }));
      setPickingOrder(order);
      setPickingItems(itemsCopy);
      setEditingItemIdx(null); // Reseta edição
      setAddRef('');
      setAddColor('');
      setShowRomaneioOptions(false);
      setInputRomaneio('');
  };

  const handlePickingChange = (itemIdx: number, size: string, val: string) => {
      const num = parseInt(val);
      const newItems = [...pickingItems];
      if (!newItems[itemIdx].picked) newItems[itemIdx].picked = {};
      
      // Validação simples: não pode ser negativo
      if (!isNaN(num) && num >= 0) {
          newItems[itemIdx].picked![size] = num;
      } else if (val === '') {
          delete newItems[itemIdx].picked![size];
      }
      setPickingItems(newItems);
  };

  // NOVO: Função para alterar a quantidade PEDIDA (apenas para itens novos ou em edição)
  const handleOrderQtyChange = (itemIdx: number, size: string, val: string) => {
      const num = parseInt(val) || 0; // Se vazio ou inválido, considera 0 para cálculos
      const newItems = [...pickingItems];
      if (!newItems[itemIdx].sizes) newItems[itemIdx].sizes = {};

      if (val !== '' && num >= 0) {
          newItems[itemIdx].sizes[size] = num;
      } else {
          delete newItems[itemIdx].sizes[size];
      }

      // IMPORTANTE: Recalcula o Total Qty (Pedido) e Total Value imediatamente
      const newTotalQty = (Object.values(newItems[itemIdx].sizes) as number[]).reduce((acc, curr) => acc + (curr || 0), 0);
      newItems[itemIdx].totalQty = newTotalQty;
      newItems[itemIdx].totalItemValue = newTotalQty * newItems[itemIdx].unitPrice;

      setPickingItems(newItems);
  };

  const handleAddItem = () => {
      if (!addRef || !addColor) return;
      
      const product = products.find(p => p.reference === addRef && p.color === addColor);
      if (!product) return;

      // Check if already exists in list
      const exists = pickingItems.some(i => i.reference === addRef && i.color === addColor);
      if (exists) {
          alert('Este produto já está na lista.');
          return;
      }

      // LÓGICA DE PREÇO: Tenta pegar da tabela do representante carregada.
      // Se não tiver, usa o basePrice do produto.
      const normalizedRef = product.reference.trim().toUpperCase();
      const repConfiguredPrice = currentRepPriceMap[normalizedRef];
      const finalPrice = repConfiguredPrice !== undefined ? repConfiguredPrice : (product.basePrice || 0);

      const newItem: OrderItem = {
          reference: product.reference,
          color: product.color,
          gridType: product.gridType,
          sizes: {}, // Quantidade PEDIDA é 0 para item extra
          picked: {}, // Inicializa vazio
          totalQty: 0,
          unitPrice: finalPrice, // Usa o preço do representante ou base
          totalItemValue: 0
      };

      setPickingItems([...pickingItems, newItem]);
      setAddColor(''); // Reseta só a cor para facilitar adicionar outra
  };

  const handleRemoveItem = (index: number) => {
      if (confirm('Tem certeza que deseja remover este item do pedido? Se ele tiver sido baixado do estoque, a quantidade retornará ao estoque.')) {
          const newItems = [...pickingItems];
          newItems.splice(index, 1);
          setPickingItems(newItems);
          if (editingItemIdx === index) setEditingItemIdx(null);
      }
  };

  // --- LOGICA DE VALIDAÇÃO DE ESTOQUE COMPARTILHADA ---
  const validateStockBeforeAction = (): boolean => {
      for (const item of pickingItems) {
          const product = products.find(p => p.reference === item.reference && p.color === item.color);
          
          if (product && product.enforceStock) {
              const originalItemSnapshot = pickingOrder?.items.find(
                  i => i.reference === item.reference && i.color === item.color
              );

              const allSizes = new Set([
                  ...Object.keys(item.picked || {}),
                  ...Object.keys(item.sizes || {})
              ]);

              for (const size of allSizes) {
                  const qNewOrdered = (item.sizes?.[size] as number) || 0; 
                  const qOldOrdered = originalItemSnapshot?.sizes?.[size] || 0;

                  // LÓGICA DE VALIDAÇÃO PARA ITENS TRAVADOS:
                  // Se a quantidade PEDIDA (Ped) aumentou, precisamos verificar se há estoque para o aumento.
                  // Se diminuiu, não há problema (vai devolver estoque).
                  // A quantidade "Sep" (Picked) não interfere na validação de estoque para itens travados, 
                  // pois a reserva é baseada no pedido.
                  const stockNeeded = qNewOrdered - qOldOrdered;

                  if (stockNeeded > 0) {
                      const currentStock = (product.stock[size] as number) || 0;
                      if (stockNeeded > currentStock) {
                          alert(`BLOQUEADO: Estoque insuficiente para ${item.reference} - ${item.color} (Tam: ${size}).\n\nVocê está aumentando o pedido em ${stockNeeded} peça(s), mas só existem ${currentStock} disponíveis.`);
                          return false;
                      }
                  }
              }
          }
      }
      return true;
  };

  const savePickingSimple = async () => {
      if (!pickingOrder) return;
      if (editingItemIdx !== null) {
          alert("Por favor, confirme ou cancele a edição do item (clique no ✔) antes de salvar.");
          return;
      }
      if (!validateStockBeforeAction()) return;

      setSavingPicking(true);
      try {
          const updatedOrder = await saveOrderPicking(pickingOrder.id, pickingOrder.items, pickingItems);
          const updatedOrders = orders.map(o => o.id === pickingOrder.id ? updatedOrder : o);
          setOrders(updatedOrders);
          
          setPickingOrder(null);
          setEditingItemIdx(null);
          getProducts().then(setProducts);

      } catch (e: any) {
          alert("Erro ao salvar separação: " + e.message);
      } finally {
          setSavingPicking(false);
      }
  };

  // --- LÓGICA DE ENTREGA PARCIAL ---
  const handlePartialDelivery = async () => {
      if (!pickingOrder || !inputRomaneio) {
          alert("Informe o número do Romaneio.");
          return;
      }

      setSavingPicking(true);

      try {
          // 1. Calcular itens para o Pedido de ENTREGA (O que foi separado/bipado)
          // 2. Calcular itens para o Pedido de SALDO (O que faltou)

          const deliveryItems: OrderItem[] = [];
          const remainingItems: OrderItem[] = [];
          let totalPickedCount = 0;

          pickingItems.forEach(item => {
               // --- CORREÇÃO DE PREÇO GARANTIDA ---
               let unitPriceToUse = item.unitPrice;

               if (!unitPriceToUse || unitPriceToUse === 0) {
                   const normalizedRef = item.reference.trim().toUpperCase();
                   if (currentRepPriceMap[normalizedRef] !== undefined && currentRepPriceMap[normalizedRef] > 0) {
                       unitPriceToUse = currentRepPriceMap[normalizedRef];
                   } else {
                       const prod = products.find(p => p.reference === item.reference && p.color === item.color);
                       if (prod && prod.basePrice) {
                           unitPriceToUse = prod.basePrice;
                       }
                   }
               }

               const deliveryItem: OrderItem = { 
                   ...item, 
                   unitPrice: unitPriceToUse,
                   sizes: {}, 
                   picked: undefined, 
                   totalQty: 0, 
                   totalItemValue: 0 
               };
               
               const remainingItem: OrderItem = { 
                   ...item, 
                   unitPrice: unitPriceToUse,
                   sizes: {}, 
                   picked: {}, 
                   totalQty: 0, 
                   totalItemValue: 0 
               };

               let itemHasDelivery = false;
               let itemHasRemaining = false;

               const allSizes = new Set([...Object.keys(item.sizes), ...Object.keys(item.picked || {})]);

               allSizes.forEach(size => {
                   const ordered = (item.sizes[size] as number) || 0;
                   const picked = (item.picked?.[size] as number) || 0;
                   
                   // ENTREGA: Usa o 'picked'
                   if (picked > 0) {
                       deliveryItem.sizes[size] = picked;
                       itemHasDelivery = true;
                       totalPickedCount += picked;
                   }

                   // SALDO: Diferença
                   const balance = Math.max(0, ordered - picked);
                   if (balance > 0) {
                       remainingItem.sizes[size] = balance;
                       itemHasRemaining = true;
                   }
               });

               if (itemHasDelivery) {
                    deliveryItem.totalQty = Object.values(deliveryItem.sizes).reduce((a, b) => a + (b as number), 0);
                    deliveryItem.totalItemValue = deliveryItem.totalQty * deliveryItem.unitPrice;
                    deliveryItems.push(deliveryItem);
               }

               if (itemHasRemaining) {
                    remainingItem.totalQty = Object.values(remainingItem.sizes).reduce((a, b) => a + (b as number), 0);
                    remainingItem.totalItemValue = remainingItem.totalQty * remainingItem.unitPrice;
                    remainingItems.push(remainingItem);
               }
          });

          if (totalPickedCount === 0) {
              alert("Nenhum item foi bipado/separado para gerar entrega.");
              setSavingPicking(false);
              return;
          }

          // VERIFICA SE É UMA ENTREGA COMPLETA (Nada restou)
          // Se não houver itens restantes, APENAS finaliza o pedido atual (sem criar novo).
          if (remainingItems.length === 0) {
              // Chama a lógica de finalizar e cancelar (que na prática ajusta o pedido para o que foi bipado)
              // Como bipou TUDO, não haverá cancelamento real, apenas ajuste de structure (picked -> sizes)
              await handleFinalizeWithCancel(); 
              return;
          }

          // SE SOBROU SALDO:
          // 1. Criar NOVO pedido com o SALDO (Remaining)
          // 2. Atualizar o pedido ATUAL para conter apenas a ENTREGA (Delivery) + Romaneio

          // --- CRIAR PEDIDO DE SALDO (BACKLOG) ---
          const backlogSubtotal = remainingItems.reduce((acc, i) => acc + i.totalItemValue, 0);
          
          let backlogDiscount = 0;
          if (pickingOrder.discountType === 'percentage') {
              backlogDiscount = backlogSubtotal * (pickingOrder.discountValue / 100);
          } else if (pickingOrder.discountType === 'fixed') {
               // Proporcional
               const originalSubtotal = pickingOrder.subtotalValue || 1; 
               const ratio = backlogSubtotal / originalSubtotal;
               backlogDiscount = pickingOrder.discountValue * ratio;
          }

          const backlogOrderPayload = {
              id: generateUUID(),
              repId: pickingOrder.repId,
              repName: pickingOrder.repName,
              clientId: pickingOrder.clientId,
              clientName: pickingOrder.clientName,
              clientCity: pickingOrder.clientCity,
              clientState: pickingOrder.clientState,
              createdAt: new Date().toISOString(),
              deliveryDate: pickingOrder.deliveryDate,
              paymentMethod: pickingOrder.paymentMethod,
              romaneio: null, // Saldo fica aberto
              status: 'open' as const,
              isPartial: false, // É um novo pedido aberto
              items: remainingItems,
              totalPieces: remainingItems.reduce((a, i) => a + i.totalQty, 0),
              subtotalValue: backlogSubtotal,
              discountType: pickingOrder.discountType,
              discountValue: pickingOrder.discountType === 'percentage' ? pickingOrder.discountValue : backlogDiscount,
              finalTotalValue: backlogSubtotal - backlogDiscount
          };

          await addOrder(backlogOrderPayload);

          // --- ATUALIZAR PEDIDO ATUAL (ENTREGA PARCIAL) ---
          // Agora o pedido atual (#Original) fica com os itens entregues e recebe o Romaneio
          
          // Primeiro atualiza itens e estoque
          await saveOrderPicking(pickingOrder.id, pickingOrder.items, deliveryItems);
          
          // Depois define Romaneio e flag Partial
          await updateOrderRomaneio(pickingOrder.id, inputRomaneio);
          
          // Marca flag partial manualmente via update (precisamos fazer isso pois saveOrderPicking não seta flags arbitrárias)
          await supabase.from('orders').update({ is_partial: true, status: 'printed' }).eq('id', pickingOrder.id);

          // Refresh e Fechar
          await fetchData(true);
          setPickingOrder(null);
          setEditingItemIdx(null);
          alert(`Sucesso! Entrega Parcial registrada no pedido #${pickingOrder.displayId} (Romaneio: ${inputRomaneio}). O saldo restante foi movido para um novo pedido.`);

      } catch (e: any) {
          alert("Erro na entrega parcial: " + e.message);
      } finally {
          setSavingPicking(false);
      }
  };

  // --- LÓGICA DE FINALIZAR E CANCELAR RESTANTE ---
  const handleFinalizeWithCancel = async () => {
       if (!pickingOrder || !inputRomaneio) {
          alert("Informe o número do Romaneio.");
          return;
      }
      
      // Se chamado diretamente pelo botão (não pelo fluxo automático de completo), pede confirmação
      // Se for pelo fluxo automático, podemos pular ou manter para segurança
      if (!confirm("Confirmar finalização do pedido com os itens selecionados?")) {
          setSavingPicking(false);
          return;
      }

      setSavingPicking(true);

      try {
          // Ajusta os itens: Sizes passa a ser igual a Picked.
          const finalItems: OrderItem[] = [];

          pickingItems.forEach(item => {
               // --- CORREÇÃO DE PREÇO ---
               let unitPriceToUse = item.unitPrice;
               if (!unitPriceToUse || unitPriceToUse === 0) {
                   const normalizedRef = item.reference.trim().toUpperCase();
                   if (currentRepPriceMap[normalizedRef]) {
                       unitPriceToUse = currentRepPriceMap[normalizedRef];
                   } else {
                       const prod = products.find(p => p.reference === item.reference && p.color === item.color);
                       if (prod) unitPriceToUse = prod.basePrice || 0;
                   }
               }

               const newItem: OrderItem = { 
                   ...item, 
                   unitPrice: unitPriceToUse, // Aplica preço corrigido
                   sizes: {}, 
                   picked: undefined, 
                   totalQty: 0, 
                   totalItemValue: 0 
               };
               let hasContent = false;

               const allSizes = new Set([...Object.keys(item.sizes), ...Object.keys(item.picked || {})]);
               
               allSizes.forEach(size => {
                   const picked = (item.picked?.[size] as number) || 0;
                   if (picked > 0) {
                       newItem.sizes[size] = picked; // O Pedido vira o que foi separado
                       newItem.picked = { ...newItem.picked, [size]: picked }; // Mantém picked para registro visual ou consistência
                       hasContent = true;
                   }
               });

               if (hasContent) {
                   newItem.totalQty = Object.values(newItem.sizes).reduce((a, b) => a + (b as number), 0);
                   newItem.totalItemValue = newItem.totalQty * newItem.unitPrice;
                   finalItems.push(newItem);
               }
          });

          // 1. Atualiza itens e estoque (saveOrderPicking)
          await saveOrderPicking(pickingOrder.id, pickingOrder.items, finalItems);

          // 2. Define Romaneio
          await updateOrderRomaneio(pickingOrder.id, inputRomaneio);
          
          // 3. Garante status printed
          await updateOrderStatus(pickingOrder.id, 'printed');

          await fetchData(true);
          setPickingOrder(null);
          setEditingItemIdx(null);
          alert("Pedido finalizado com sucesso!");

      } catch (e: any) {
          alert("Erro ao finalizar: " + e.message);
      } finally {
          setSavingPicking(false);
      }
  };


  // Unique refs for dropdown in Modal
  const uniqueRefs = Array.from(new Set(products.map(p => p.reference))).sort();
  const availableColors = addRef 
      ? products.filter(p => p.reference === addRef).map(p => p.color).sort()
      : [];

  // --- PRINT LOGIC ---
  const handlePrintIndividual = async (order: Order) => {
    const printContent = document.getElementById(`print-order-${order.id}`);
    if (printContent) {
        // Optimistic update
        const updatedOrders = orders.map(o => o.id === order.id ? { ...o, status: 'printed' as const } : o);
        setOrders(updatedOrders);
        
        // Background update
        updateOrderStatus(order.id, 'printed');

        const win = window.open('', '', 'height=700,width=900');
        if(win) {
            win.document.write('<html><head><title>Imprimir Pedido</title>');
            win.document.write('<script src="https://cdn.tailwindcss.com"></script>');
            win.document.write('<style>@media print { .no-print { display: none; } body { -webkit-print-color-adjust: exact; } table { border-collapse: collapse; width: 100%; } th, td { border: 1px solid black; } }</style>');
            win.document.write('</head><body class="p-8 bg-white">');
            
            // Injeção de lógica visual para PARCIAL no PDF
            let content = printContent.innerHTML;
            if (order.isPartial) {
                // Adiciona (PARCIAL) ao título se for parcial
                content = content.replace('Pedido #', 'Pedido (ENTREGA PARCIAL) #');
            }
            win.document.write(content);
            
            win.document.write('</body></html>');
            win.document.close();
            setTimeout(() => {
                win.print();
            }, 500);
        }
    }
  };

  // Logic to aggregate items from selected orders
  const getAggregatedItems = (): OrderItem[] => {
    const selected = orders.filter(o => selectedOrderIds.has(o.id));
    const aggregation: Record<string, OrderItem> = {}; // Key: Ref-Color

    selected.forEach(order => {
      order.items.forEach(item => {
        const key = `${item.reference}-${item.color}`;
        if (!aggregation[key]) {
          aggregation[key] = { 
              ...item, 
              sizes: { ...item.sizes }, 
              totalQty: item.totalQty 
          };
        } else {
          aggregation[key].totalQty += item.totalQty;
          Object.entries(item.sizes).forEach(([size, qty]) => {
            const current = aggregation[key].sizes[size] || 0;
            aggregation[key].sizes[size] = current + (qty as number);
          });
        }
      });
    });

    return Object.values(aggregation).sort((a, b) => a.reference.localeCompare(b.reference));
  };

  const aggregatedItems: OrderItem[] = showAggregation ? getAggregatedItems() : [];

  const handlePrintAggregation = () => {
    const win = window.open('', '', 'height=800,width=1000');
    if (!win) return;

    const totalPieces = aggregatedItems.reduce((acc, i) => acc + i.totalQty, 0);
    const dateRange = startDate && endDate 
        ? `Período: ${new Date(startDate).toLocaleDateString()} até ${new Date(endDate).toLocaleDateString()}`
        : 'Relatório Geral';
    
    // Calculate vertical totals per size for the footer
    const sizeTotals: Record<string, number> = {};
    ALL_SIZES.forEach(s => sizeTotals[s] = 0);
    aggregatedItems.forEach(item => {
        ALL_SIZES.forEach(s => {
            const qty = item.sizes[s];
            if (typeof qty === 'number') {
                sizeTotals[s] += qty;
            }
        });
    });

    const html = `
      <html>
        <head>
          <title>Lista de Produção</title>
          <script src="https://cdn.tailwindcss.com"></script>
          <style>
            body { font-family: sans-serif; padding: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px; }
            th, td { border: 1px solid black; padding: 4px; text-align: center; }
            th { background-color: #f3f4f6; font-weight: bold; }
            td.left { text-align: left; }
            .header { margin-bottom: 20px; border-bottom: 2px solid black; padding-bottom: 10px; }
            @media print { button { display: none; } }
          </style>
        </head>
        <body>
          <div class="header">
            <h1 class="text-2xl font-bold uppercase">Resumo de Produção</h1>
            <p class="text-sm text-gray-600">${dateRange}</p>
            <p class="text-sm">Pedidos Selecionados: <strong>${selectedOrderIds.size}</strong></p>
          </div>

          <table>
            <thead>
              <tr>
                <th width="20%" class="left">Referência</th>
                <th width="20%" class="left">Cor</th>
                ${ALL_SIZES.map(s => `<th>${s}</th>`).join('')}
                <th width="10%">Total</th>
              </tr>
            </thead>
            <tbody>
              ${aggregatedItems.map(item => `
                <tr>
                  <td class="left font-bold">${item.reference}</td>
                  <td class="left uppercase">${item.color}</td>
                  ${ALL_SIZES.map(s => `<td>${item.sizes[s] ? `<strong>${item.sizes[s]}</strong>` : '-'}</td>`).join('')}
                  <td class="font-bold bg-gray-50 text-base">${item.totalQty}</td>
                </tr>
              `).join('')}
            </tbody>
            <tfoot>
               <tr class="bg-gray-100">
                 <td colspan="2" class="left font-bold uppercase p-2">Totais por Tamanho</td>
                 ${ALL_SIZES.map(s => `<td>${(sizeTotals[s] as number) > 0 ? sizeTotals[s] : ''}</td>`).join('')}
                 <td class="font-bold text-xl">${totalPieces}</td>
               </tr>
            </tfoot>
          </table>
          
          <div class="mt-8 text-xs text-gray-500">
            Impresso em: ${new Date().toLocaleString()}
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

  return (
    <div className="space-y-4 md:space-y-6 relative">
      {/* NOTIFICAÇÃO FLUTUANTE DE NOVO PEDIDO */}
      {newOrderNotification && (
          <div className="fixed top-20 right-4 z-50 bg-green-600 text-white p-4 rounded-lg shadow-2xl flex items-center animate-bounce cursor-pointer" onClick={() => setNewOrderNotification(false)}>
              <Bell className="w-6 h-6 mr-3 text-white fill-current animate-pulse" />
              <div>
                  <h4 className="font-bold">Novo Pedido Recebido!</h4>
                  <p className="text-sm text-green-100">A lista foi atualizada automaticamente.</p>
              </div>
              <button className="ml-4" onClick={(e) => { e.stopPropagation(); setNewOrderNotification(false); }}>
                  <X className="w-4 h-4" />
              </button>
          </div>
      )}

      {/* Header e Filtros */}
      <div className="no-print bg-white p-4 rounded-lg shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex items-center gap-2">
                <h2 className="text-xl md:text-2xl font-bold text-gray-800">Gestão de Pedidos</h2>
                {loading && <Loader2 className="animate-spin w-5 h-5 text-blue-600" />}
            </div>
            
            <div className="flex gap-2">
                <button 
                    onClick={() => fetchData()}
                    className="bg-gray-100 text-gray-700 p-2 rounded hover:bg-gray-200 shadow-sm"
                    title="Atualizar Lista Manualmente"
                >
                    <RefreshCw className="w-5 h-5" />
                </button>

                {selectedOrderIds.size > 0 && (
                    <button 
                    onClick={() => setShowAggregation(true)}
                    className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 flex items-center justify-center shadow transition"
                    >
                    <Calculator className="w-4 h-4 mr-2" />
                    Somar ({selectedOrderIds.size})
                    </button>
                )}
            </div>
        </div>

        {/* ÁREA DE FILTROS AVANÇADOS */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
             {/* 1. Busca por Romaneio (Alta Prioridade) */}
             <div className="lg:col-span-1">
                <label className="text-xs font-bold text-gray-500 block mb-1">Rastrear Romaneio</label>
                <div className="relative">
                    <Truck className="w-4 h-4 absolute left-3 top-2.5 text-blue-500" />
                    <input 
                        type="text" 
                        placeholder="Digite o código..." 
                        className="w-full pl-9 p-2 border rounded text-sm focus:ring-2 focus:ring-blue-500 border-blue-200 bg-blue-50"
                        value={romaneioSearch}
                        onChange={(e) => setRomaneioSearch(e.target.value)}
                    />
                </div>
             </div>

             {/* 2. Status (Aberto/Finalizado) */}
             <div>
                <label className="text-xs font-bold text-gray-500 block mb-1">Status do Pedido</label>
                <div className="relative">
                    <Filter className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
                    <select 
                        className="w-full pl-9 p-2 border rounded text-sm focus:ring-2 focus:ring-blue-500 bg-white"
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as any)}
                        disabled={!!romaneioSearch}
                    >
                        <option value="all">Todos</option>
                        <option value="open">Aberto (Sem Romaneio)</option>
                        <option value="finalized">Finalizado (Com Romaneio)</option>
                    </select>
                </div>
             </div>

             {/* 3. Representante */}
             <div>
                <label className="text-xs font-bold text-gray-500 block mb-1">Representante</label>
                <div className="relative">
                    <UserIcon className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
                    <select 
                        className="w-full pl-9 p-2 border rounded text-sm focus:ring-2 focus:ring-blue-500 bg-white"
                        value={selectedRepId}
                        onChange={(e) => setSelectedRepId(e.target.value)}
                        disabled={!!romaneioSearch}
                    >
                        <option value="">Todos</option>
                        {reps.map(r => (
                            <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                    </select>
                </div>
             </div>

             {/* 4. Data Inicial */}
             <div>
                <label className="text-xs font-bold text-gray-500 block mb-1">De</label>
                <input 
                  type="date" 
                  className="w-full border p-2 rounded text-sm focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400" 
                  value={startDate} 
                  onChange={(e) => setStartDate(e.target.value)}
                  disabled={!!romaneioSearch} 
                />
             </div>

             {/* 5. Data Final */}
             <div>
                <label className="text-xs font-bold text-gray-500 block mb-1">Até</label>
                <input 
                  type="date" 
                  className="w-full border p-2 rounded text-sm focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400" 
                  value={endDate} 
                  onChange={(e) => setEndDate(e.target.value)}
                  disabled={!!romaneioSearch} 
                />
             </div>
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-lg shadow no-print overflow-hidden border border-gray-200">
        <div className="overflow-x-auto">
          {loading && orders.length === 0 ? (
              <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-blue-600" /></div>
          ) : (
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead className="bg-gray-50 text-gray-600 text-sm font-bold uppercase">
              <tr>
                <th className="p-4 w-10">
                  <input 
                    type="checkbox" 
                    onChange={handleSelectAllFiltered}
                    checked={filteredOrders.length > 0 && selectedOrderIds.size >= filteredOrders.length}
                    className="w-4 h-4 cursor-pointer"
                  />
                </th>
                <th className="p-4">Pedido #</th>
                <th className="p-4">Data</th>
                <th className="p-4">Cliente</th>
                <th className="p-4">Repr.</th>
                <th className="p-4 text-center">Peças</th>
                <th className="p-4 text-center">Valor Total</th>
                <th className="p-4 text-center">Status</th>
                <th className="p-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredOrders.length === 0 ? (
                  <tr><td colSpan={9} className="p-8 text-center text-gray-400">Nenhum pedido encontrado.</td></tr>
              ) : filteredOrders.map(order => {
                
                // --- CÁLCULO DE TOTAIS REAIS PARA IMPRESSÃO (NOVO) ---
                // Isso garante que o template oculto (usado para impressão) tenha os valores
                // matematicamente corretos baseados na grade exibida, independentemente do que está no DB.
                let calculatedTotalPieces = 0;
                let calculatedSubtotal = 0;

                return (
                <tr key={order.id} className={`hover:bg-blue-50 transition ${selectedOrderIds.has(order.id) ? 'bg-blue-50' : ''}`}>
                  <td className="p-4">
                    <input 
                      type="checkbox" 
                      checked={selectedOrderIds.has(order.id)} 
                      onChange={() => toggleSelect(order.id)}
                      className="w-4 h-4 cursor-pointer"
                    />
                  </td>
                  <td className="p-4 font-bold text-gray-800">
                      #{order.displayId}
                      {order.romaneio && <div className="text-[10px] text-gray-500 font-normal mt-1">Romaneio: {order.romaneio}</div>}
                      {/* INDICADOR VISUAL PARCIAL NA TABELA */}
                      {order.isPartial && <div className="inline-block bg-purple-100 text-purple-800 text-[10px] font-bold px-1.5 rounded mt-1 border border-purple-200">PARCIAL</div>}
                  </td>
                  <td className="p-4 text-sm text-gray-600">
                    {new Date(order.createdAt).toLocaleDateString('pt-BR')}
                    <div className="text-xs text-gray-400">{new Date(order.createdAt).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}</div>
                  </td>
                  <td className="p-4 text-sm">
                    <div className="font-medium text-gray-900">{order.clientName}</div>
                    <div className="text-xs text-gray-500">{order.clientCity}</div>
                  </td>
                  <td className="p-4 text-sm text-gray-600">{order.repName}</td>
                  <td className="p-4 text-center font-bold text-gray-600">{order.totalPieces}</td>
                  <td className="p-4 text-center font-bold text-green-600">R$ {(order.finalTotalValue || 0).toFixed(2)}</td>
                  <td className="p-4 text-center">
                    {order.romaneio ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200">
                        <CheckCircle className="w-3 h-3 mr-1" /> Finalizado
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 border border-yellow-200">
                         Aberto
                      </span>
                    )}
                  </td>
                  <td className="p-4 text-right flex items-center justify-end gap-2">
                    <button 
                        onClick={() => handleEditRomaneio(order)}
                        className="text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition p-2 rounded"
                        title="Editar Número do Romaneio"
                    >
                        <Truck className="w-5 h-5" />
                    </button>

                    {order.romaneio ? (
                        <div title="Pedido Finalizado (Com Romaneio)" className="text-gray-300 p-2 cursor-not-allowed">
                            <Lock className="w-5 h-5" />
                        </div>
                    ) : (
                        <button
                            onClick={() => openPickingModal(order)}
                            className="text-orange-500 hover:text-orange-700 hover:bg-orange-50 p-2 rounded transition"
                            title="Separação de Pedido / Baixa Estoque"
                        >
                            <PackageOpen className="w-5 h-5" />
                        </button>
                    )}

                    <button 
                      onClick={() => handlePrintIndividual(order)}
                      className="text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition p-2 rounded"
                      title="Imprimir Pedido"
                    >
                      <Printer className="w-5 h-5" />
                    </button>
                    
                    {/* Hidden Print Template */}
                    <div id={`print-order-${order.id}`} className="hidden">
                      <div className="border-2 border-black p-8 font-sans max-w-3xl mx-auto">
                        <div className="flex justify-between border-b-2 border-black pb-4 mb-6">
                            <div>
                                {/* INDICADOR PARCIAL NA IMPRESSÃO */}
                                <h1 className="text-4xl font-extrabold uppercase tracking-wider">
                                    Pedido #{order.displayId} 
                                    {order.isPartial && <span className="text-xl ml-2 bg-gray-200 px-2 rounded">(PARCIAL)</span>}
                                </h1>
                                <p className="text-sm mt-1">Emissão: {new Date().toLocaleDateString()}</p>
                            </div>
                            <div className="text-right">
                                <p className="font-bold text-lg">{order.repName}</p>
                                <p className="text-sm text-gray-600">Representante</p>
                            </div>
                        </div>

                        <div className="mb-8 border border-black p-4 bg-gray-50">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-xs uppercase text-gray-500 font-bold">Cliente</p>
                                    <p className="font-bold text-lg">{order.clientName}</p>
                                </div>
                                <div>
                                    <p className="text-xs uppercase text-gray-500 font-bold">Localização</p>
                                    <p>{order.clientCity} - {order.clientState}</p>
                                </div>
                                <div>
                                    <p className="text-xs uppercase text-gray-500 font-bold">Entrega</p>
                                    <p>{order.deliveryDate ? new Date(order.deliveryDate).toLocaleDateString() : 'A Combinar'}</p>
                                </div>
                                <div>
                                    <p className="text-xs uppercase text-gray-500 font-bold">Pagamento</p>
                                    <p>{order.paymentMethod || '-'}</p>
                                </div>
                                {/* Exibe Romaneio se existir */}
                                {order.romaneio && (
                                    <div className="col-span-2 mt-2 pt-2 border-t border-gray-300">
                                        <p className="text-xs uppercase text-gray-500 font-bold">Romaneio</p>
                                        <p className="font-mono text-lg">{order.romaneio} {order.isPartial && '(ENTREGA PARCIAL)'}</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        <table className="w-full border-collapse border border-black text-sm">
                            <thead>
                                <tr className="bg-gray-200">
                                    <th className="border border-black p-1 text-left">Ref</th>
                                    <th className="border border-black p-1 text-left">Cor</th>
                                    {ALL_SIZES.map(s => (
                                        <th key={s} className="border border-black p-1 text-center w-8">{s}</th>
                                    ))}
                                    <th className="border border-black p-1 w-16 text-right">Qtd</th>
                                    <th className="border border-black p-1 w-24 text-right">Total (R$)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {order.items.map((item, idx) => {
                                    // CÁLCULO DINÂMICO PARA O PDF
                                    // CORREÇÃO: Se tem Romaneio ou é Parcial, o pedido já foi processado e salvo com os itens corretos em 'sizes'.
                                    // Portanto, devemos confiar em 'sizes' se for Finalizado/Parcial.
                                    // Apenas se for Aberto, olhamos para 'picked' para mostrar progresso (se desejado), mas padrão é mostrar o pedido.
                                    
                                    const isFinalized = !!order.romaneio || !!order.isPartial;

                                    let displayRowTotal = 0;
                                    const cells = ALL_SIZES.map(s => {
                                        let numVal = 0;
                                        // Se Finalizado/Parcial: Use SIZES (pois o processo de split moveu picked -> sizes)
                                        // Se Aberto: Use SIZES (mostra o pedido original)
                                        // A visualização de 'Picked' só é relevante no modal de separação.
                                        numVal = (item.sizes && item.sizes[s]) || 0;
                                        
                                        displayRowTotal += numVal;
                                        return numVal;
                                    });

                                    // Se o total desta linha for 0, não exibe
                                    if (displayRowTotal === 0) {
                                        return null;
                                    }

                                    // Acumula totais globais do pedido baseados na visualização
                                    calculatedTotalPieces += displayRowTotal;
                                    const rowValue = displayRowTotal * item.unitPrice;
                                    calculatedSubtotal += rowValue;

                                    return (
                                        <tr key={idx}>
                                            <td className="border border-black p-1 font-bold">{item.reference}</td>
                                            <td className="border border-black p-1 uppercase">{item.color}</td>
                                            {cells.map((val, i) => (
                                                <td key={i} className="border border-black p-1 text-center">
                                                    {val > 0 ? <span className="font-bold">{val}</span> : <span className="text-gray-300">-</span>}
                                                </td>
                                            ))}
                                            {/* Usa o total recalculado, não o do banco */}
                                            <td className="border border-black p-1 text-right font-bold">{displayRowTotal}</td>
                                            <td className="border border-black p-1 text-right">{rowValue.toFixed(2)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot>
                                <tr className="bg-gray-100">
                                    <td colSpan={2} className="border border-black p-2 text-right font-bold uppercase">Totais</td>
                                    <td colSpan={ALL_SIZES.length} className="border border-black p-2"></td>
                                    {/* Usa totais recalculados */}
                                    <td className="border border-black p-2 text-right font-bold">{calculatedTotalPieces}</td>
                                    <td className="border border-black p-2 text-right font-bold">-</td>
                                </tr>
                                {order.discountValue > 0 && (
                                    <tr>
                                       <td colSpan={ALL_SIZES.length + 3} className="border border-black p-2 text-right">
                                          {order.discountType === 'percentage' 
                                              ? `Desconto (${order.discountValue}%)` 
                                              : 'Desconto (Fixo)'}
                                       </td>
                                       <td className="border border-black p-2 text-right text-red-600 font-bold">
                                         - {order.discountType === 'percentage' ? ((calculatedSubtotal * order.discountValue)/100).toFixed(2) : order.discountValue.toFixed(2)}
                                       </td>
                                    </tr>
                                )}
                                <tr className="text-lg">
                                     <td colSpan={ALL_SIZES.length + 3} className="border border-black p-2 text-right uppercase font-bold">Total Final</td>
                                     <td className="border border-black p-2 text-right font-bold">
                                        R$ {(
                                            order.discountType === 'percentage' 
                                            ? calculatedSubtotal * (1 - order.discountValue/100) 
                                            : calculatedSubtotal - order.discountValue
                                        ).toFixed(2)}
                                     </td>
                                </tr>
                            </tfoot>
                        </table>
                        
                        <div className="mt-12 pt-8 border-t border-black flex justify-between text-xs">
                            <div>_______________________________<br/>Assinatura Representante</div>
                            <div>_______________________________<br/>Assinatura Cliente</div>
                        </div>
                    </div>
                    </div>
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
          )}
        </div>
      </div>

      {/* SEPARATION / PICKING MODAL */}
      {pickingOrder && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 md:p-4 animate-fade-in">
              <div className="bg-white rounded-lg w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl">
                   <div className="p-4 border-b flex justify-between items-center bg-orange-50 rounded-t-lg">
                        <div>
                            <h2 className="text-lg font-bold text-orange-900 flex items-center">
                                <PackageOpen className="w-6 h-6 mr-2" /> Separação de Pedido #{pickingOrder.displayId}
                            </h2>
                            <p className="text-xs text-orange-700 mt-1">
                                Digite a quantidade separada e clique em salvar para confirmar.
                            </p>
                        </div>
                        <button onClick={() => setPickingOrder(null)} className="p-2 hover:bg-orange-100 rounded-full">
                            <X className="w-6 h-6 text-orange-800" />
                        </button>
                    </div>
                    
                    {/* ADICIONAR ITEM NA SEPARAÇÃO */}
                    <div className="p-3 bg-gray-100 border-b flex flex-col md:flex-row gap-2 items-center">
                        <span className="text-sm font-bold text-gray-600 flex items-center">
                            <Plus className="w-4 h-4 mr-1" /> Incluir Ref:
                        </span>
                        <select 
                            className="border p-1.5 rounded text-sm w-full md:w-40"
                            value={addRef}
                            onChange={(e) => {
                                setAddRef(e.target.value);
                                setAddColor('');
                            }}
                        >
                            <option value="">Ref...</option>
                            {uniqueRefs.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                        <select 
                            className="border p-1.5 rounded text-sm w-full md:w-40"
                            value={addColor}
                            onChange={(e) => setAddColor(e.target.value)}
                            disabled={!addRef}
                        >
                            <option value="">Cor...</option>
                            {availableColors.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <button 
                            onClick={handleAddItem}
                            disabled={!addRef || !addColor}
                            className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm font-bold hover:bg-blue-700 disabled:opacity-50 w-full md:w-auto"
                        >
                            Adicionar
                        </button>
                    </div>

                    <div className="p-4 overflow-y-auto flex-1 bg-gray-50">
                        <table className="w-full text-sm border-collapse bg-white shadow-sm rounded-lg">
                            <thead>
                                <tr className="bg-gray-100 text-gray-700">
                                    <th className="p-3 text-left">Produto</th>
                                    <th className="p-3 text-left">Controle de Estoque</th>
                                    <th className="p-3 text-center">Tamanhos</th>
                                    <th className="p-3 text-center w-10">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {pickingItems.map((item, idx) => {
                                    // Procura o produto original para verificar se é Travado ou Livre
                                    const product = products.find(p => p.reference === item.reference && p.color === item.color);
                                    const isLocked = product?.enforceStock;
                                    
                                    // Verifica se o item é NOVO (adicionado nesta sessão)
                                    const isNewItem = !pickingOrder.items.some(
                                        original => original.reference === item.reference && original.color === item.color
                                    );
                                    
                                    // Verifica se está sendo editado
                                    const isEditing = editingItemIdx === idx;
                                    
                                    return (
                                    <tr key={idx} className={isEditing ? 'bg-orange-50' : ''}>
                                        <td className="p-3 align-top">
                                            <p className="font-bold text-gray-800">{item.reference}</p>
                                            <p className="text-xs uppercase text-gray-500">{item.color}</p>
                                            {isNewItem && <span className="text-[10px] bg-blue-100 text-blue-700 px-1 rounded ml-1 font-bold">NOVO</span>}
                                            {isEditing && <span className="text-[10px] bg-orange-200 text-orange-800 px-1 rounded ml-1 font-bold">EDITANDO</span>}
                                        </td>
                                        <td className="p-3 align-top">
                                            {isLocked ? (
                                                <div className="flex items-start text-xs text-red-600 bg-red-50 p-2 rounded border border-red-100">
                                                    <Lock className="w-4 h-4 mr-1 flex-shrink-0" />
                                                    <div>
                                                        <span className="font-bold block">Estoque Travado</span>
                                                        <span>{isNewItem || isEditing ? 'Verifique a disp. abaixo' : 'Já baixado no pedido.'}</span>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="flex items-start text-xs text-green-600 bg-green-50 p-2 rounded border border-green-100">
                                                    <Unlock className="w-4 h-4 mr-1 flex-shrink-0" />
                                                    <div>
                                                        <span className="font-bold block">Estoque Livre</span>
                                                        <span>Baixará ao salvar aqui.</span>
                                                    </div>
                                                </div>
                                            )}
                                        </td>
                                        <td className="p-3">
                                            <div className="flex flex-wrap gap-4 justify-center">
                                                {SIZE_GRIDS[item.gridType].map((size) => {
                                                    const qty = (item.sizes[size] as number) || 0; // Quantidade PEDIDA
                                                    const picked = (item.picked?.[size] as number) || 0;
                                                    const isComplete = picked >= qty && qty > 0;
                                                    
                                                    // Estoque Atual disponível (importante para item novo ou edição)
                                                    const stockAvailable = (product?.stock?.[size] as number) || 0;
                                                    
                                                    return (
                                                        <div key={size} className={`flex flex-col items-center border rounded p-2 ${isNewItem || isEditing ? 'bg-blue-50 border-blue-100' : 'bg-gray-50'}`}>
                                                            <span className="text-xs font-bold text-gray-500 mb-1">{size}</span>
                                                            
                                                            <div className="flex items-center gap-1 mb-1">
                                                                <span className="text-xs text-gray-400 mr-1">Ped:</span>
                                                                {(isNewItem || isEditing) ? (
                                                                    // INPUT para editar Pedido se for item NOVO ou em EDIÇÃO
                                                                    <input 
                                                                        type="number"
                                                                        min="0"
                                                                        className="w-12 text-center border-b border-blue-300 bg-transparent font-bold outline-none focus:bg-white text-sm"
                                                                        value={item.sizes[size] || ''}
                                                                        placeholder="0"
                                                                        onChange={(e) => handleOrderQtyChange(idx, size, e.target.value)}
                                                                    />
                                                                ) : (
                                                                    // TEXTO fixo se for item existente
                                                                    <span className="font-bold text-gray-800 text-sm">{qty}</span>
                                                                )}
                                                            </div>
                                                            
                                                            <div className="flex items-center gap-1">
                                                                <span className="text-xs text-blue-600 mr-1 font-bold">Sep:</span>
                                                                <input 
                                                                    type="number" 
                                                                    min="0"
                                                                    className={`w-12 text-center border rounded p-1 font-bold outline-none focus:ring-2 focus:ring-blue-500 ${isComplete ? 'bg-green-50 text-green-700 border-green-300' : 'bg-white'}`}
                                                                    value={item.picked?.[size] !== undefined ? item.picked[size] : ''}
                                                                    placeholder="0"
                                                                    onChange={(e) => handlePickingChange(idx, size, e.target.value)}
                                                                />
                                                            </div>

                                                            {/* Mostrar Estoque Disponível para Itens Novos ou Editados com Estoque Travado */}
                                                            {(isNewItem || isEditing) && isLocked && (
                                                                <div className={`text-[10px] mt-1 font-bold ${qty > stockAvailable ? 'text-red-600' : 'text-green-600'}`}>
                                                                    Disp: {stockAvailable}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        </td>
                                        <td className="p-3 text-center align-middle">
                                            <div className="flex flex-col gap-2 items-center">
                                                {isEditing ? (
                                                    <button 
                                                        onClick={() => setEditingItemIdx(null)}
                                                        className="text-green-600 hover:text-green-800 p-2 hover:bg-green-50 rounded bg-white shadow-sm"
                                                        title="Salvar Edição"
                                                    >
                                                        <Check className="w-5 h-5" />
                                                    </button>
                                                ) : (
                                                    <button 
                                                        onClick={() => setEditingItemIdx(idx)}
                                                        className="text-blue-500 hover:text-blue-700 p-2 hover:bg-blue-50 rounded"
                                                        title="Editar Quantidade do Pedido"
                                                    >
                                                        <Edit2 className="w-5 h-5" />
                                                    </button>
                                                )}

                                                <button 
                                                    onClick={() => handleRemoveItem(idx)}
                                                    className="text-red-400 hover:text-red-600 p-2 hover:bg-red-50 rounded"
                                                    title="Remover Item"
                                                >
                                                    <Trash className="w-5 h-5" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                )})}
                            </tbody>
                        </table>
                    </div>

                    {/* BARRA DE TOTAIS EM TEMPO REAL NO MODAL DE SEPARAÇÃO */}
                    <div className="bg-orange-50 p-4 border-t border-orange-200 flex flex-col md:flex-row justify-between items-center gap-4">
                        <div className="flex gap-6 items-center">
                            {(() => {
                                // Cálculo em Tempo Real
                                let currentPickedQty = 0;
                                let currentPickedValue = 0;
                                let currentOrderQty = 0;

                                pickingItems.forEach(item => {
                                    // Preço unitário garantido (igual lógica de Partial)
                                    let unitPrice = item.unitPrice;
                                    if (!unitPrice || unitPrice === 0) {
                                        const normalizedRef = item.reference.trim().toUpperCase();
                                        if (currentRepPriceMap[normalizedRef]) {
                                            unitPrice = currentRepPriceMap[normalizedRef];
                                        } else {
                                            const prod = products.find(p => p.reference === item.reference && p.color === item.color);
                                            if (prod) unitPrice = prod.basePrice || 0;
                                        }
                                    }

                                    // Soma Quantidade Pedida
                                    const ordered = Object.values(item.sizes).reduce((a: number, b) => a + (Number(b) || 0), 0);
                                    currentOrderQty += ordered;

                                    // Soma Quantidade Separada (Picked)
                                    const picked = item.picked ? Object.values(item.picked).reduce((a: number, b) => a + (Number(b) || 0), 0) : 0;
                                    currentPickedQty += picked;
                                    currentPickedValue += (picked * unitPrice);
                                });

                                return (
                                    <>
                                        <div className="text-gray-600 text-sm">
                                            Total Pedido: <span className="font-bold">{currentOrderQty} pçs</span>
                                        </div>
                                        <div className="bg-white px-4 py-2 rounded shadow-sm border border-green-200 flex items-center gap-3">
                                            <div>
                                                <span className="block text-xs font-bold text-gray-500 uppercase">Total Selecionado (Baixa)</span>
                                                <span className="text-xl font-bold text-green-700">{currentPickedQty} pçs</span>
                                            </div>
                                            <div className="h-8 w-px bg-gray-300 mx-1"></div>
                                            <div>
                                                <span className="block text-xs font-bold text-gray-500 uppercase">Valor Atual</span>
                                                <span className="text-xl font-bold text-green-700">R$ {currentPickedValue.toFixed(2)}</span>
                                            </div>
                                        </div>
                                    </>
                                );
                            })()}
                        </div>
                    </div>

                    {/* RODAPÉ DO MODAL COM NOVAS OPÇÕES */}
                    <div className="p-4 border-t bg-white rounded-b-lg flex flex-col md:flex-row justify-between items-center gap-3">
                         <div className="text-xs text-gray-500 w-full md:w-auto text-center md:text-left">
                            * Ao salvar, o estoque dos itens novos será baixado e o dos antigos recalculado.
                         </div>

                         <div className="flex gap-3 w-full md:w-auto justify-end">
                            <button 
                                onClick={() => setPickingOrder(null)}
                                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
                            >
                                Fechar
                            </button>

                            {/* Botão Salvar Simples (Apenas Estoque) */}
                            <button 
                                onClick={savePickingSimple}
                                disabled={savingPicking}
                                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center shadow-sm disabled:opacity-50 font-bold"
                            >
                                {savingPicking ? <Loader2 className="animate-spin w-4 h-4 mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                                Salvar Progresso
                            </button>

                            {/* Botão Gerar Romaneio (Abre Opções) */}
                            <button 
                                onClick={() => setShowRomaneioOptions(true)}
                                disabled={savingPicking}
                                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 flex items-center shadow-sm disabled:opacity-50 font-bold"
                            >
                                <Truck className="w-4 h-4 mr-2" />
                                Gerar Romaneio...
                            </button>
                         </div>
                    </div>

                    {/* MODAL INTERNO DE OPÇÕES DE ROMANEIO (OVERLAY) */}
                    {showRomaneioOptions && (
                        <div className="absolute inset-0 bg-white bg-opacity-95 z-10 flex items-center justify-center p-6 rounded-lg animate-fade-in backdrop-blur-sm">
                            <div className="bg-white border-2 border-green-500 rounded-lg shadow-2xl p-6 max-w-lg w-full">
                                <h3 className="text-xl font-bold text-green-800 mb-2 flex items-center">
                                    <Truck className="w-6 h-6 mr-2" /> Gerar Romaneio & Finalizar
                                </h3>
                                <p className="text-sm text-gray-600 mb-6">
                                    Escolha como deseja processar a entrega deste pedido.
                                </p>

                                <div className="mb-6">
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Número do Romaneio</label>
                                    <input 
                                        autoFocus
                                        type="text" 
                                        className="w-full border-2 border-gray-300 rounded p-3 text-lg font-bold uppercase focus:ring-2 focus:ring-green-500 outline-none"
                                        placeholder="Digite o nº..."
                                        value={inputRomaneio}
                                        onChange={e => setInputRomaneio(e.target.value)}
                                    />
                                </div>

                                <div className="space-y-3">
                                    <button 
                                        onClick={handlePartialDelivery}
                                        disabled={!inputRomaneio || savingPicking}
                                        className="w-full bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-lg flex items-center justify-between group transition disabled:opacity-50"
                                    >
                                        <div className="text-left">
                                            <span className="block font-bold text-lg">Entrega Parcial</span>
                                            <span className="text-xs opacity-90">Gera um novo pedido com os itens bipados. Mantém este aberto com o restante.</span>
                                        </div>
                                        <Split className="w-6 h-6 text-white opacity-80 group-hover:opacity-100" />
                                    </button>

                                    <button 
                                        onClick={handleFinalizeWithCancel}
                                        disabled={!inputRomaneio || savingPicking}
                                        className="w-full bg-green-600 hover:bg-green-700 text-white p-4 rounded-lg flex items-center justify-between group transition disabled:opacity-50"
                                    >
                                        <div className="text-left">
                                            <span className="block font-bold text-lg">Finalizar & Cancelar Restante</span>
                                            <span className="text-xs opacity-90">Fecha o pedido com o que foi bipado. Remove/Cancela os itens não bipados.</span>
                                        </div>
                                        <Scissors className="w-6 h-6 text-white opacity-80 group-hover:opacity-100" />
                                    </button>
                                </div>

                                <div className="mt-4 pt-4 border-t text-center">
                                    <button 
                                        onClick={() => setShowRomaneioOptions(false)}
                                        className="text-gray-500 hover:text-gray-800 underline"
                                    >
                                        Voltar para separação
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
              </div>
          </div>
      )}

      {/* Aggregation Modal (Mantido) */}
      {showAggregation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 no-print p-2 md:p-4">
          <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl">
            {/* ... Conteúdo do Modal de Soma ... */}
             <div className="p-4 md:p-6 border-b flex justify-between items-center bg-purple-50">
              <div>
                <h2 className="text-lg md:text-xl font-bold text-purple-900 flex items-center">
                  <Calculator className="w-5 h-5 mr-2" /> Resumo de Produção
                </h2>
                <p className="text-xs md:text-sm text-purple-600 mt-1">
                  {selectedOrderIds.size} pedidos selecionados
                </p>
              </div>
              <button onClick={() => setShowAggregation(false)} className="p-2 hover:bg-purple-100 rounded-full">
                <X className="w-6 h-6 text-purple-800" />
              </button>
            </div>
            
            <div className="p-4 md:p-6 overflow-y-auto flex-1 overflow-x-auto">
              <table className="w-full text-sm border-collapse border border-gray-300 min-w-[700px]">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="border p-2 text-left">Ref</th>
                    <th className="border p-2 text-left">Cor</th>
                    {ALL_SIZES.map(s => <th key={s} className="border p-2 text-center w-10">{s}</th>)}
                    <th className="border p-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {aggregatedItems.map((item, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="border p-2 font-bold">{item.reference}</td>
                      <td className="border p-2 uppercase">{item.color}</td>
                      {ALL_SIZES.map(s => (
                          <td key={s} className="border p-2 text-center">
                              {item.sizes[s] ? <span className="font-bold">{item.sizes[s]}</span> : <span className="text-gray-300">-</span>}
                          </td>
                      ))}
                      <td className="border p-2 text-right font-bold text-lg">{item.totalQty}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-purple-50 font-bold text-purple-900">
                    <tr>
                        <td colSpan={2} className="border p-3 text-right">TOTAL:</td>
                        {ALL_SIZES.map(s => {
                            // Fixed: Explicitly typed reduce parameters to avoid arithmetic errors
                            const colTotal = aggregatedItems.reduce((acc: number, i: OrderItem) => {
                                const qty = i.sizes[s] || 0;
                                return acc + qty;
                            }, 0);
                            return <td key={s} className="border p-3 text-center">{colTotal || ''}</td>
                        })}
                        <td className="border p-3 text-right text-xl">
                            {/* Fixed: Explicitly typed reduce parameters */}
                            {aggregatedItems.reduce((acc: number, i: OrderItem) => acc + (i.totalQty || 0), 0)}
                        </td>
                    </tr>
                </tfoot>
              </table>
            </div>

            <div className="p-4 md:p-6 border-t bg-gray-50 flex justify-end">
               <button 
                 onClick={handlePrintAggregation}
                 className="bg-blue-600 text-white px-6 py-3 md:py-2 rounded hover:bg-blue-700 flex items-center shadow-lg w-full md:w-auto justify-center"
               >
                 <Printer className="w-5 h-5 mr-2" /> Imprimir Lista
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminOrderList;