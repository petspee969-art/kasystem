
import React, { useState, useEffect, useRef } from 'react';
import { Order, OrderItem, ProductDef, SIZE_GRIDS, User, Role } from '../types';
import { getOrders, updateOrderStatus, saveOrderPicking, getProducts, updateOrderRomaneio, getUsers, getRepPrices, addOrder, generateUUID, deleteOrder } from '../services/storageService';
import { Printer, Calculator, CheckCircle, X, Loader2, PackageOpen, Save, Lock, Unlock, AlertTriangle, Bell, RefreshCw, Plus, Trash, Search, Edit2, Check, Truck, Filter, User as UserIcon, Split, Scissors, ArrowRightLeft } from 'lucide-react';
import { BRANDING } from '../config/branding';

const ALL_SIZES = ['P', 'M', 'G', 'GG', 'G1', 'G2', 'G3'];

const AdminOrderList: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<ProductDef[]>([]); 
  const [reps, setReps] = useState<User[]>([]); 
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedRepId, setSelectedRepId] = useState(''); 
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'finalized'>('all'); 
  const [romaneioSearch, setRomaneioSearch] = useState(''); 
  
  const [showAggregation, setShowAggregation] = useState(false);

  // Separation Modal State
  const [pickingOrder, setPickingOrder] = useState<Order | null>(null);
  const [pickingItems, setPickingItems] = useState<OrderItem[]>([]);
  const [savingPicking, setSavingPicking] = useState(false);
  const [showRomaneioOptions, setShowRomaneioOptions] = useState(false); 
  const [inputRomaneio, setInputRomaneio] = useState('');

  // SORTIDO RESOLUTION STATE
  const [sortidoItemIdx, setSortidoItemIdx] = useState<number | null>(null);
  const [sortidoTargetColor, setSortidoTargetColor] = useState('');
  const [sortidoDist, setSortidoDist] = useState<{[size: string]: number}>({});

  const [currentRepPriceMap, setCurrentRepPriceMap] = useState<Record<string, number>>({});
  const [editingItemIdx, setEditingItemIdx] = useState<number | null>(null);

  const [addRef, setAddRef] = useState('');
  const [addColor, setAddColor] = useState('');

  const [newOrderNotification, setNewOrderNotification] = useState(false);
  
  // Polling Interval Ref
  const pollingRef = useRef<any>(null);
  const lastOrderCountRef = useRef<number>(0);

  const fetchData = async (isBackgroundUpdate = false) => {
    if (!isBackgroundUpdate) setLoading(true);
    
    try {
        const [ordersData, productsData, usersData] = await Promise.all([
            getOrders(),
            getProducts(),
            getUsers()
        ]);
        
        const sortedOrders = ordersData.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setOrders(sortedOrders);
        setProducts(productsData);
        setReps(usersData.filter(u => u.role === Role.REP));
        
        // Simples detecção de novos pedidos via contagem (Polling)
        if (isBackgroundUpdate && sortedOrders.length > lastOrderCountRef.current) {
            setNewOrderNotification(true);
            try {
                 const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
                 audio.volume = 0.5;
                 audio.play().catch(e => console.warn("Autoplay bloqueado", e));
            } catch (e) {}
            setTimeout(() => setNewOrderNotification(false), 8000);
        }
        lastOrderCountRef.current = sortedOrders.length;

    } catch (e) {
        console.error("Erro ao buscar dados", e);
    }
    
    if (!isBackgroundUpdate) setLoading(false);
  };

  useEffect(() => {
    fetchData();

    // Polling substituto para Realtime (a cada 10 segundos)
    pollingRef.current = setInterval(() => {
        fetchData(true);
    }, 10000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedOrderIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedOrderIds(newSet);
  };

  const filteredOrders = orders.filter(o => {
    if (romaneioSearch) {
        return o.romaneio && o.romaneio.includes(romaneioSearch);
    }
    const orderDate = o.createdAt.split('T')[0];
    const afterStart = !startDate || orderDate >= startDate;
    const beforeEnd = !endDate || orderDate <= endDate;
    const matchRep = !selectedRepId || o.repId === selectedRepId;
    let matchStatus = true;
    if (statusFilter === 'open') {
        matchStatus = !o.romaneio;
    } else if (statusFilter === 'finalized') {
        matchStatus = !!o.romaneio;
    }
    return afterStart && beforeEnd && matchRep && matchStatus;
  });

  const handleSelectAllFiltered = () => {
    if (selectedOrderIds.size === filteredOrders.length && filteredOrders.length > 0) {
        setSelectedOrderIds(new Set()); 
    } else {
        setSelectedOrderIds(new Set(filteredOrders.map(o => o.id))); 
    }
  };

  const handleDeleteOrder = async (order: Order) => {
      let confirmMsg = `Tem certeza que deseja DELETAR o Pedido #${order.displayId}?`;
      if (order.romaneio) {
          confirmMsg += `\n\nATENÇÃO: Este pedido já possui Romaneio (${order.romaneio}).\n\nAo deletar, as peças separadas retornarão ao estoque.`;
      } else {
          confirmMsg += `\n\nAs peças reservadas (estoque travado) ou separadas (estoque livre) retornarão ao estoque.`;
      }

      if (window.confirm(confirmMsg)) {
          setLoading(true);
          try {
              await deleteOrder(order.id);
              await fetchData();
              alert("Pedido excluído e estoque restaurado com sucesso.");
          } catch (e: any) {
              alert("Erro ao excluir pedido: " + e.message);
              setLoading(false);
          }
      }
  };

  const handleEditRomaneio = async (order: Order) => {
      const newRomaneio = prompt("Informe o número do Romaneio:", order.romaneio || "");
      if (newRomaneio !== null) {
          try {
              await updateOrderRomaneio(order.id, newRomaneio);
              const updatedOrders = orders.map(o => o.id === order.id ? { ...o, romaneio: newRomaneio } : o);
              setOrders(updatedOrders);
          } catch (e: any) {
              alert("Erro ao salvar Romaneio: " + (e.message || "Tente novamente."));
              fetchData(true); 
          }
      }
  };

  const openPickingModal = async (order: Order) => {
      if (order.romaneio) {
          alert("Este pedido já possui Romaneio e está finalizado.");
          return;
      }

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
          console.error("Erro ao carregar tabela de preços", e);
          setCurrentRepPriceMap({});
      }

      const itemsCopy = order.items.map(item => ({
          ...item,
          sizes: { ...item.sizes },
          picked: item.picked ? { ...item.picked } : {} 
      }));
      setPickingOrder(order);
      setPickingItems(itemsCopy);
      setEditingItemIdx(null); 
      setAddRef('');
      setAddColor('');
      setShowRomaneioOptions(false);
      setInputRomaneio('');
      setSortidoItemIdx(null);
  };

  const handlePickingChange = (itemIdx: number, size: string, val: string) => {
      const num = parseInt(val);
      const newItems = [...pickingItems];
      if (!newItems[itemIdx].picked) newItems[itemIdx].picked = {};
      if (!isNaN(num) && num >= 0) {
          newItems[itemIdx].picked![size] = num;
      } else if (val === '') {
          delete newItems[itemIdx].picked![size];
      }
      setPickingItems(newItems);
  };

  const handleOrderQtyChange = (itemIdx: number, size: string, val: string) => {
      const num = parseInt(val) || 0; 
      const newItems = [...pickingItems];
      if (!newItems[itemIdx].sizes) newItems[itemIdx].sizes = {};

      if (val !== '' && num >= 0) {
          newItems[itemIdx].sizes[size] = num;
      } else {
          delete newItems[itemIdx].sizes[size];
      }

      const newTotalQty = (Object.values(newItems[itemIdx].sizes) as number[]).reduce((acc, curr) => acc + (curr || 0), 0);
      newItems[itemIdx].totalQty = newTotalQty;
      newItems[itemIdx].totalItemValue = newTotalQty * newItems[itemIdx].unitPrice;

      setPickingItems(newItems);
  };

  const handleAddItem = () => {
      if (!addRef || !addColor) return;
      const product = products.find(p => p.reference === addRef && p.color === addColor);
      if (!product) return;
      const exists = pickingItems.some(i => i.reference === addRef && i.color === addColor);
      if (exists) {
          alert('Este produto já está na lista.');
          return;
      }
      const normalizedRef = product.reference.trim().toUpperCase();
      const repConfiguredPrice = currentRepPriceMap[normalizedRef];
      const finalPrice = repConfiguredPrice !== undefined ? repConfiguredPrice : (product.basePrice || 0);

      const newItem: OrderItem = {
          reference: product.reference,
          color: product.color,
          gridType: product.gridType,
          sizes: {}, 
          picked: {}, 
          totalQty: 0,
          unitPrice: finalPrice, 
          totalItemValue: 0
      };
      setPickingItems([...pickingItems, newItem]);
      setAddColor(''); 
  };

  const handleRemoveItem = (index: number) => {
      if (confirm('Tem certeza que deseja remover este item do pedido?')) {
          const newItems = [...pickingItems];
          newItems.splice(index, 1);
          setPickingItems(newItems);
          if (editingItemIdx === index) setEditingItemIdx(null);
      }
  };

  // --- LOGICA RESOLVER SORTIDO ---
  const handleOpenSortidoModal = (idx: number) => {
      setSortidoItemIdx(idx);
      setSortidoTargetColor('');
      setSortidoDist({});
  };

  const handleConfirmSortidoDistribution = () => {
      if (sortidoItemIdx === null || !sortidoTargetColor) return;
      
      const sortidoItem = pickingItems[sortidoItemIdx];
      const qtyToDistribute = Object.values(sortidoDist).reduce((a: number, b: number) => a+b, 0);
      
      if (qtyToDistribute === 0) {
          alert("Selecione pelo menos 1 peça.");
          return;
      }

      // 1. Reduzir do Sortido (Quantidade Pedida)
      // Se acabar tudo de um tamanho, remove do objeto sizes
      const newSortidoSizes = { ...sortidoItem.sizes };
      let sortidoEmpty = true;
      
      Object.entries(sortidoDist).forEach(([size, qtyVal]) => {
          const qty = Number(qtyVal);
          if (qty > 0) {
              const current = newSortidoSizes[size] || 0;
              const remain = Math.max(0, current - qty);
              if (remain === 0) delete newSortidoSizes[size];
              else newSortidoSizes[size] = remain;
          }
      });
      
      // Verifica se o item sortido ainda tem algo pedido
      if (Object.keys(newSortidoSizes).length > 0) sortidoEmpty = false;

      // 2. Adicionar/Atualizar no Item Destino (Cor Real)
      // Procura se a cor destino já existe na lista
      const targetIdx = pickingItems.findIndex(i => i.reference === sortidoItem.reference && i.color === sortidoTargetColor);
      let targetItem: OrderItem;

      if (targetIdx > -1) {
          // Já existe, atualiza
          targetItem = { ...pickingItems[targetIdx] };
          if (!targetItem.sizes) targetItem.sizes = {};
          if (!targetItem.picked) targetItem.picked = {};
      } else {
          // Cria novo
          // Busca preço correto
          let finalPrice = sortidoItem.unitPrice;
          // Tenta buscar preço da tabela se o sortido estiver zerado ou genérico (mas geralmente mantemos o preço do pedido)
          
          targetItem = {
              reference: sortidoItem.reference,
              color: sortidoTargetColor,
              gridType: sortidoItem.gridType,
              sizes: {}, // Quantidade Pedida "transferida"
              picked: {}, // Quantidade Separada (automático)
              totalQty: 0,
              unitPrice: finalPrice,
              totalItemValue: 0
          };
      }

      // Transfere quantidades
      Object.entries(sortidoDist).forEach(([size, qtyVal]) => {
          const qty = Number(qtyVal);
          if (qty > 0) {
              // Aumenta o "Pedido" do item real (pois estamos movendo o pedido do sortido pra cá)
              targetItem.sizes[size] = (targetItem.sizes[size] || 0) + qty;
              // Aumenta o "Separado" do item real (assumimos que ao distribuir, já está separando)
              targetItem.picked![size] = (targetItem.picked![size] || 0) + qty;
          }
      });

      // Recalcula totais do target
      targetItem.totalQty = Object.values(targetItem.sizes).reduce((a, b) => a + b, 0);
      targetItem.totalItemValue = targetItem.totalQty * targetItem.unitPrice;

      // Atualiza lista principal
      const newItems = [...pickingItems];
      
      // Atualiza o sortido
      if (sortidoEmpty) {
          // Se esvaziou o sortido, remove ele da lista?
          // Melhor manter ele visível mas zerado se quiser, ou remover. Vamos remover pra limpar.
          newItems.splice(sortidoItemIdx, 1);
      } else {
          const updatedSortido = { 
              ...sortidoItem, 
              sizes: newSortidoSizes,
              totalQty: Object.values(newSortidoSizes).reduce((a: number, b: number)=>a+b, 0)
          };
          updatedSortido.totalItemValue = updatedSortido.totalQty * updatedSortido.unitPrice;
          newItems[sortidoItemIdx] = updatedSortido;
      }

      // Insere/Atualiza o destino
      if (targetIdx > -1) {
          // O índice pode ter mudado se removemos o sortido e ele estava antes
          // Mas vamos simplificar: se removemos o sortido, e o target estava DEPOIS, o index mudou.
          // Estratégia segura: Adicionar no final se novo, ou atualizar no lugar se existente.
          
          // Se o sortido foi removido, precisamos re-encontrar o targetIdx ou ajustar
          if (sortidoEmpty && sortidoItemIdx < targetIdx) {
              newItems[targetIdx - 1] = targetItem;
          } else {
              newItems[targetIdx] = targetItem;
          }
      } else {
          newItems.push(targetItem);
      }

      setPickingItems(newItems);
      setSortidoItemIdx(null);
  };

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
                  const stockNeeded = qNewOrdered - qOldOrdered;
                  if (stockNeeded > 0) {
                      const currentStock = (product.stock[size] as number) || 0;
                      if (stockNeeded > currentStock) {
                          alert(`BLOQUEADO: Estoque insuficiente para ${item.reference} - ${item.color} (Tam: ${size}).\n\nDisponível: ${currentStock}.`);
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
          alert("Confirme a edição do item antes de salvar.");
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
          alert("Erro ao salvar: " + e.message);
      } finally {
          setSavingPicking(false);
      }
  };

  const handlePartialDelivery = async () => {
      if (!pickingOrder || !inputRomaneio) {
          alert("Informe o Romaneio.");
          return;
      }
      setSavingPicking(true);
      try {
          const deliveryItems: OrderItem[] = [];
          const remainingItems: OrderItem[] = [];
          let totalPickedCount = 0;

          pickingItems.forEach(item => {
               let unitPriceToUse = item.unitPrice;
               if (!unitPriceToUse || unitPriceToUse === 0) {
                   const normalizedRef = item.reference.trim().toUpperCase();
                   if (currentRepPriceMap[normalizedRef] !== undefined && currentRepPriceMap[normalizedRef] > 0) {
                       unitPriceToUse = currentRepPriceMap[normalizedRef];
                   } else {
                       const prod = products.find(p => p.reference === item.reference && p.color === item.color);
                       if (prod && prod.basePrice) unitPriceToUse = prod.basePrice;
                   }
               }

               const deliveryItem: OrderItem = { 
                   ...item, unitPrice: unitPriceToUse, sizes: {}, picked: undefined, totalQty: 0, totalItemValue: 0 
               };
               const remainingItem: OrderItem = { 
                   ...item, unitPrice: unitPriceToUse, sizes: {}, picked: {}, totalQty: 0, totalItemValue: 0 
               };
               let itemHasDelivery = false;
               let itemHasRemaining = false;
               const allSizes = new Set([...Object.keys(item.sizes), ...Object.keys(item.picked || {})]);

               allSizes.forEach(size => {
                   const ordered = Number(item.sizes[size]) || 0;
                   const picked = Number(item.picked?.[size]) || 0;
                   if (picked > 0) {
                       deliveryItem.sizes[size] = picked;
                       itemHasDelivery = true;
                       totalPickedCount = totalPickedCount + picked;
                   }
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
              alert("Nenhum item separado.");
              setSavingPicking(false);
              return;
          }
          if (remainingItems.length === 0) {
              await handleFinalizeWithCancel(); 
              return;
          }

          const backlogSubtotal = remainingItems.reduce((acc, i) => acc + i.totalItemValue, 0);
          let backlogDiscount = 0;
          if (pickingOrder.discountType === 'percentage') {
              backlogDiscount = backlogSubtotal * (pickingOrder.discountValue / 100);
          } else if (pickingOrder.discountType === 'fixed') {
               const originalSubtotal = pickingOrder.subtotalValue || 1; 
               const ratio = backlogSubtotal / originalSubtotal;
               backlogDiscount = pickingOrder.discountValue * ratio;
          }

          await addOrder({
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
              romaneio: null, 
              status: 'open',
              isPartial: false, 
              items: remainingItems,
              totalPieces: remainingItems.reduce((a, i) => a + i.totalQty, 0),
              subtotalValue: backlogSubtotal,
              discountType: pickingOrder.discountType,
              discountValue: pickingOrder.discountType === 'percentage' ? pickingOrder.discountValue : backlogDiscount,
              finalTotalValue: backlogSubtotal - backlogDiscount
          });

          await saveOrderPicking(pickingOrder.id, pickingOrder.items, deliveryItems);
          await updateOrderRomaneio(pickingOrder.id, inputRomaneio);
          
          // Manually update Partial flag - Using FETCH directly since storageService method is specific
          await fetch(`http://localhost:3001/api/orders/${pickingOrder.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ is_partial: true, status: 'printed' })
          });

          await fetchData(true);
          setPickingOrder(null);
          setEditingItemIdx(null);
          alert(`Sucesso! Entrega Parcial registrada. Saldo movido para novo pedido.`);
      } catch (e: any) {
          alert("Erro: " + e.message);
      } finally {
          setSavingPicking(false);
      }
  };

  const handleFinalizeWithCancel = async () => {
       if (!pickingOrder || !inputRomaneio) {
          alert("Informe o Romaneio.");
          return;
      }
      if (!confirm("Confirmar finalização?")) return;
      setSavingPicking(true);
      try {
          const finalItems: OrderItem[] = [];
          pickingItems.forEach(item => {
               let unitPriceToUse = item.unitPrice;
               if (!unitPriceToUse || unitPriceToUse === 0) {
                   const normalizedRef = item.reference.trim().toUpperCase();
                   if (currentRepPriceMap[normalizedRef]) unitPriceToUse = currentRepPriceMap[normalizedRef];
                   else {
                       const prod = products.find(p => p.reference === item.reference && p.color === item.color);
                       if (prod) unitPriceToUse = prod.basePrice || 0;
                   }
               }
               const newItem: OrderItem = { ...item, unitPrice: unitPriceToUse, sizes: {}, picked: undefined, totalQty: 0, totalItemValue: 0 };
               let hasContent = false;
               const allSizes = new Set([...Object.keys(item.sizes), ...Object.keys(item.picked || {})]);
               allSizes.forEach(size => {
                   const picked = Number(item.picked?.[size]) || 0;
                   if (picked > 0) {
                       newItem.sizes[size] = picked; 
                       newItem.picked = { ...newItem.picked, [size]: picked };
                       hasContent = true;
                   }
               });
               if (hasContent) {
                   newItem.totalQty = Object.values(newItem.sizes).reduce((a, b) => a + (b as number), 0);
                   newItem.totalItemValue = newItem.totalQty * newItem.unitPrice;
                   finalItems.push(newItem);
               }
          });

          await saveOrderPicking(pickingOrder.id, pickingOrder.items, finalItems);
          await updateOrderRomaneio(pickingOrder.id, inputRomaneio);
          await updateOrderStatus(pickingOrder.id, 'printed');

          await fetchData(true);
          setPickingOrder(null);
          setEditingItemIdx(null);
          alert("Pedido finalizado!");
      } catch (e: any) {
          alert("Erro: " + e.message);
      } finally {
          setSavingPicking(false);
      }
  };

  const uniqueRefs = Array.from(new Set(products.map(p => p.reference))).sort();
  const availableColors = addRef ? products.filter(p => p.reference === addRef).map(p => p.color).sort() : [];

  const handlePrintIndividual = async (order: Order) => {
    const printContent = document.getElementById(`print-order-${order.id}`);
    if (printContent) {
        updateOrderStatus(order.id, 'printed');
        const win = window.open('', '', 'height=700,width=900');
        if(win) {
            win.document.write('<html><head><title>Imprimir Pedido</title>');
            win.document.write('<script src="https://cdn.tailwindcss.com"></script>');
            win.document.write('<style>@media print { .no-print { display: none; } body { -webkit-print-color-adjust: exact; } table { border-collapse: collapse; width: 100%; } th, td { border: 1px solid black; } }</style>');
            win.document.write('</head><body class="p-8 bg-white">');
            let content = printContent.innerHTML;
            if (order.isPartial) content = content.replace('Pedido #', 'Pedido (ENTREGA PARCIAL) #');
            win.document.write(content);
            win.document.write('</body></html>');
            win.document.close();
            setTimeout(() => { win.print(); }, 500);
        }
    }
  };

  const getAggregatedItems = (): OrderItem[] => {
    const selected = orders.filter(o => selectedOrderIds.has(o.id));
    const aggregation: Record<string, OrderItem> = {}; 
    selected.forEach(order => {
      order.items.forEach(item => {
        const key = `${item.reference}-${item.color}`;
        if (!aggregation[key]) {
          aggregation[key] = { 
              ...item, 
              sizes: { ...item.sizes }, 
              totalQty: Number(item.totalQty) || 0 
          };
        } else {
          const addQty = Number(item.totalQty) || 0;
          const currentTotal = Number(aggregation[key].totalQty) || 0;
          aggregation[key].totalQty = currentTotal + addQty;
          
          if (item.sizes) {
              Object.keys(item.sizes).forEach((size) => {
                const qty = Number(item.sizes[size]) || 0;
                const current = Number(aggregation[key].sizes[size]) || 0;
                aggregation[key].sizes[size] = current + qty;
              });
          }
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
    const dateRange = startDate && endDate ? `Período: ${new Date(startDate).toLocaleDateString()} até ${new Date(endDate).toLocaleDateString()}` : 'Relatório Geral';
    const sizeTotals: Record<string, number> = {};
    ALL_SIZES.forEach(s => sizeTotals[s] = 0);
    aggregatedItems.forEach(item => {
        ALL_SIZES.forEach(s => {
            const qty = Number(item.sizes[s]) || 0;
            const current = sizeTotals[s] || 0;
            sizeTotals[s] = current + qty;
        });
    });

    const html = `
      <html><head><title>Lista de Produção - ${BRANDING.companyName}</title><script src="https://cdn.tailwindcss.com"></script><style>body { font-family: sans-serif; padding: 20px; } table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px; } th, td { border: 1px solid black; padding: 4px; text-align: center; } th { background-color: #f3f4f6; font-weight: bold; } td.left { text-align: left; } .header { margin-bottom: 20px; border-bottom: 2px solid black; padding-bottom: 10px; } @media print { button { display: none; } }</style></head><body>
          <div class="header"><h1 class="text-2xl font-bold uppercase">Resumo de Produção</h1><p class="text-sm text-gray-600">${dateRange}</p><p class="text-sm">Pedidos Selecionados: <strong>${selectedOrderIds.size}</strong></p><p class="text-xs uppercase mt-1 text-gray-400">${BRANDING.companyName}</p></div>
          <table><thead><tr><th width="20%" class="left">Referência</th><th width="20%" class="left">Cor</th>${ALL_SIZES.map(s => `<th>${s}</th>`).join('')}<th width="10%">Total</th></tr></thead><tbody>${aggregatedItems.map(item => `<tr><td class="left font-bold">${item.reference}</td><td class="left uppercase">${item.color}</td>${ALL_SIZES.map(s => `<td>${item.sizes[s] ? `<strong>${item.sizes[s]}</strong>` : '-'}</td>`).join('')}<td class="font-bold bg-gray-50 text-base">${item.totalQty}</td></tr>`).join('')}</tbody><tfoot><tr class="bg-gray-100"><td colspan="2" class="left font-bold uppercase p-2">Totais por Tamanho</td>${ALL_SIZES.map(s => `<td>${(sizeTotals[s] as number) > 0 ? sizeTotals[s] : ''}</td>`).join('')}<td class="font-bold text-xl">${totalPieces}</td></tr></tfoot></table><script>window.onload = function() { window.print(); }</script></body></html>`;
    win.document.write(html);
    win.document.close();
  };

  return (
    <div className="space-y-4 md:space-y-6 relative">
      {newOrderNotification && (
          <div className="fixed top-20 right-4 z-50 bg-green-600 text-white p-4 rounded-lg shadow-2xl flex items-center animate-bounce cursor-pointer" onClick={() => setNewOrderNotification(false)}>
              <Bell className="w-6 h-6 mr-3 text-white fill-current animate-pulse" />
              <div><h4 className="font-bold">Novo Pedido Recebido!</h4></div>
              <button className="ml-4" onClick={(e) => { e.stopPropagation(); setNewOrderNotification(false); }}><X className="w-4 h-4" /></button>
          </div>
      )}

      <div className="no-print bg-white p-4 rounded-lg shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex items-center gap-2">
                <h2 className="text-xl md:text-2xl font-bold text-gray-800">Gestão de Pedidos</h2>
                {loading && <Loader2 className="animate-spin w-5 h-5 text-blue-600" />}
            </div>
            <div className="flex gap-2">
                <button onClick={() => fetchData()} className="bg-gray-100 text-gray-700 p-2 rounded hover:bg-gray-200 shadow-sm" title="Atualizar"><RefreshCw className="w-5 h-5" /></button>
                {selectedOrderIds.size > 0 && (
                    <button onClick={() => setShowAggregation(true)} className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 flex items-center shadow"><Calculator className="w-4 h-4 mr-2" /> Somar ({selectedOrderIds.size})</button>
                )}
            </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
             <div className="lg:col-span-1"><label className="text-xs font-bold text-gray-500 block mb-1">Rastrear Romaneio</label><div className="relative"><Truck className="w-4 h-4 absolute left-3 top-2.5 text-blue-500" /><input type="text" placeholder="Código..." className="w-full pl-9 p-2 border rounded text-sm focus:ring-2 focus:ring-blue-500 bg-blue-50" value={romaneioSearch} onChange={(e) => setRomaneioSearch(e.target.value)} /></div></div>
             <div><label className="text-xs font-bold text-gray-500 block mb-1">Status</label><div className="relative"><Filter className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" /><select className="w-full pl-9 p-2 border rounded text-sm bg-white" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} disabled={!!romaneioSearch}><option value="all">Todos</option><option value="open">Aberto</option><option value="finalized">Finalizado</option></select></div></div>
             <div><label className="text-xs font-bold text-gray-500 block mb-1">Representante</label><div className="relative"><UserIcon className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" /><select className="w-full pl-9 p-2 border rounded text-sm bg-white" value={selectedRepId} onChange={(e) => setSelectedRepId(e.target.value)} disabled={!!romaneioSearch}><option value="">Todos</option>{reps.map(r => (<option key={r.id} value={r.id}>{r.name}</option>))}</select></div></div>
             <div><label className="text-xs font-bold text-gray-500 block mb-1">De</label><input type="date" className="w-full border p-2 rounded text-sm" value={startDate} onChange={(e) => setStartDate(e.target.value)} disabled={!!romaneioSearch} /></div>
             <div><label className="text-xs font-bold text-gray-500 block mb-1">Até</label><input type="date" className="w-full border p-2 rounded text-sm" value={endDate} onChange={(e) => setEndDate(e.target.value)} disabled={!!romaneioSearch} /></div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow no-print overflow-hidden border border-gray-200">
        <div className="overflow-x-auto">
          {loading && orders.length === 0 ? <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-blue-600" /></div> : (
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead className="bg-gray-50 text-gray-600 text-sm font-bold uppercase"><tr><th className="p-4 w-10"><input type="checkbox" onChange={handleSelectAllFiltered} checked={filteredOrders.length > 0 && selectedOrderIds.size >= filteredOrders.length} className="w-4 h-4" /></th><th className="p-4">Pedido #</th><th className="p-4">Data</th><th className="p-4">Cliente</th><th className="p-4">Repr.</th><th className="p-4 text-center">Peças</th><th className="p-4 text-center">Valor Total</th><th className="p-4 text-center">Status</th><th className="p-4 text-right">Ações</th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {filteredOrders.length === 0 ? <tr><td colSpan={9} className="p-8 text-center text-gray-400">Nenhum pedido encontrado.</td></tr> : filteredOrders.map(order => {
                let calculatedTotalPieces = 0; let calculatedSubtotal = 0;
                return (
                <tr key={order.id} className={`hover:bg-blue-50 transition ${selectedOrderIds.has(order.id) ? 'bg-blue-50' : ''}`}>
                  <td className="p-4"><input type="checkbox" checked={selectedOrderIds.has(order.id)} onChange={() => toggleSelect(order.id)} className="w-4 h-4" /></td>
                  <td className="p-4 font-bold text-gray-800">#{order.displayId}{order.romaneio && <div className="text-[10px] text-gray-500 font-normal mt-1">Romaneio: {order.romaneio}</div>}{order.isPartial && <div className="inline-block bg-purple-100 text-purple-800 text-[10px] font-bold px-1.5 rounded mt-1 border border-purple-200">PARCIAL</div>}</td>
                  <td className="p-4 text-sm text-gray-600">{new Date(order.createdAt).toLocaleDateString('pt-BR')}</td>
                  <td className="p-4 text-sm"><div className="font-medium text-gray-900">{order.clientName}</div><div className="text-xs text-gray-500">{order.clientCity}</div></td>
                  <td className="p-4 text-sm text-gray-600">{order.repName}</td>
                  <td className="p-4 text-center font-bold text-gray-600">{order.totalPieces}</td>
                  <td className="p-4 text-center font-bold text-green-600">R$ {(order.finalTotalValue || 0).toFixed(2)}</td>
                  <td className="p-4 text-center">{order.romaneio ? <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200"><CheckCircle className="w-3 h-3 mr-1" /> Finalizado</span> : <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 border border-yellow-200">Aberto</span>}</td>
                  <td className="p-4 text-right flex items-center justify-end gap-2">
                    <button onClick={() => handleDeleteOrder(order)} className="text-gray-400 hover:text-red-600 hover:bg-red-50 transition p-2 rounded" title="Excluir Pedido"><Trash className="w-5 h-5" /></button>
                    <button onClick={() => handleEditRomaneio(order)} className="text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition p-2 rounded"><Truck className="w-5 h-5" /></button>
                    {order.romaneio ? <div className="text-gray-300 p-2"><Lock className="w-5 h-5" /></div> : <button onClick={() => openPickingModal(order)} className="text-orange-500 hover:text-orange-700 hover:bg-orange-50 p-2 rounded transition"><PackageOpen className="w-5 h-5" /></button>}
                    <button onClick={() => handlePrintIndividual(order)} className="text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition p-2 rounded"><Printer className="w-5 h-5" /></button>
                    <div id={`print-order-${order.id}`} className="hidden"><div className="border-2 border-black p-8 font-sans max-w-3xl mx-auto"><div className="flex justify-between border-b-2 border-black pb-4 mb-6"><div><h1 className="text-4xl font-extrabold uppercase tracking-wider">Pedido #{order.displayId} {order.isPartial && <span className="text-xl ml-2 bg-gray-200 px-2 rounded">(PARCIAL)</span>}</h1><p className="text-sm mt-1">Emissão: {new Date().toLocaleDateString()}</p></div><div className="text-right"><p className="font-bold text-lg">{order.repName}</p><p className="text-sm text-gray-600">Representante</p></div></div><div className="mb-8 border border-black p-4 bg-gray-50"><div className="grid grid-cols-2 gap-4"><div><p className="text-xs uppercase text-gray-500 font-bold">Cliente</p><p className="font-bold text-lg">{order.clientName}</p></div><div><p className="text-xs uppercase text-gray-500 font-bold">Localização</p><p>{order.clientCity} - {order.clientState}</p></div><div><p className="text-xs uppercase text-gray-500 font-bold">Entrega</p><p>{(order.deliveryDate && !isNaN(new Date(order.deliveryDate).getTime())) ? new Date(order.deliveryDate).toLocaleDateString('pt-BR') : 'A Combinar'}</p></div><div><p className="text-xs uppercase text-gray-500 font-bold">Pagamento</p><p>{order.paymentMethod || '-'}</p></div>{order.romaneio && (<div className="col-span-2 mt-2 pt-2 border-t border-gray-300"><p className="text-xs uppercase text-gray-500 font-bold">Romaneio</p><p className="font-mono text-lg">{order.romaneio} {order.isPartial && '(ENTREGA PARCIAL)'}</p></div>)}</div></div><table className="w-full border-collapse border border-black text-sm"><thead><tr className="bg-gray-200"><th className="border border-black p-1 text-left">Ref</th><th className="border border-black p-1 text-left">Cor</th>{ALL_SIZES.map(s => (<th key={s} className="border border-black p-1 text-center w-8">{s}</th>))}<th className="border border-black p-1 w-16 text-right">Qtd</th><th className="border border-black p-1 w-24 text-right">Total (R$)</th></tr></thead><tbody>{order.items.map((item, idx) => { let displayRowTotal = 0; const cells = ALL_SIZES.map(s => { let rawVal = item.sizes?.[s]; let numVal = typeof rawVal === 'number' ? rawVal : 0; displayRowTotal = displayRowTotal + numVal; return numVal; }); if (displayRowTotal === 0) return null; calculatedTotalPieces = calculatedTotalPieces + displayRowTotal; const rowValue = displayRowTotal * (Number(item.unitPrice) || 0); calculatedSubtotal = calculatedSubtotal + rowValue; return (<tr key={idx}><td className="border border-black p-1 font-bold">{item.reference}</td><td className="border border-black p-1 uppercase">{item.color}</td>{cells.map((val, i) => (<td key={i} className="border border-black p-1 text-center">{val > 0 ? <span className="font-bold">{val}</span> : <span className="text-gray-300">-</span>}</td>))}<td className="border border-black p-1 text-right font-bold">{displayRowTotal}</td><td className="border border-black p-1 text-right">{rowValue.toFixed(2)}</td></tr>); })}</tbody><tfoot><tr className="bg-gray-100"><td colSpan={2} className="border border-black p-2 text-right font-bold uppercase">Totais</td><td colSpan={ALL_SIZES.length} className="border border-black p-2"></td><td className="border border-black p-2 text-right font-bold">{calculatedTotalPieces}</td><td className="border border-black p-2 text-right font-bold">-</td></tr>{order.discountValue > 0 && (<tr><td colSpan={ALL_SIZES.length + 3} className="border border-black p-2 text-right">{order.discountType === 'percentage' ? `Desconto (${order.discountValue}%)` : 'Desconto (Fixo)'}</td><td className="border border-black p-2 text-right text-red-600 font-bold">- {order.discountType === 'percentage' ? ((calculatedSubtotal * order.discountValue)/100).toFixed(2) : order.discountValue.toFixed(2)}</td></tr>)}<tr className="text-lg"><td colSpan={ALL_SIZES.length + 3} className="border border-black p-2 text-right uppercase font-bold">Total Final</td><td className="border border-black p-2 text-right font-bold">R$ {(order.discountType === 'percentage' ? calculatedSubtotal * (1 - order.discountValue/100) : calculatedSubtotal - order.discountValue).toFixed(2)}</td></tr></tfoot></table><div className="mt-12 pt-8 border-t border-black flex justify-between text-xs"><div>_______________________________<br/>Assinatura Representante</div><div className="text-center font-bold pt-2">{BRANDING.companyName}</div><div>_______________________________<br/>Assinatura Cliente</div></div></div></div></td>
                </tr>
              )})}
            </tbody>
          </table>)}
        </div>
      </div>

      {pickingOrder && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 md:p-4 animate-fade-in">
              <div className="bg-white rounded-lg w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl">
                   <div className="p-4 border-b flex justify-between items-center bg-orange-50 rounded-t-lg"><div><h2 className="text-lg font-bold text-orange-900 flex items-center"><PackageOpen className="w-6 h-6 mr-2" /> Separação de Pedido #{pickingOrder.displayId}</h2></div><button onClick={() => setPickingOrder(null)} className="p-2 hover:bg-orange-100 rounded-full"><X className="w-6 h-6 text-orange-800" /></button></div>
                    <div className="p-3 bg-gray-100 border-b flex flex-col md:flex-row gap-2 items-center"><span className="text-sm font-bold text-gray-600 flex items-center"><Plus className="w-4 h-4 mr-1" /> Incluir Ref:</span><select className="border p-1.5 rounded text-sm w-full md:w-40" value={addRef} onChange={(e) => { setAddRef(e.target.value); setAddColor(''); }}><option value="">Ref...</option>{uniqueRefs.map(r => <option key={r} value={r}>{r}</option>)}</select><select className="border p-1.5 rounded text-sm w-full md:w-40" value={addColor} onChange={(e) => setAddColor(e.target.value)} disabled={!addRef}><option value="">Cor...</option>{availableColors.map(c => <option key={c} value={c}>{c}</option>)}</select><button onClick={handleAddItem} disabled={!addRef || !addColor} className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm font-bold hover:bg-blue-700 disabled:opacity-50 w-full md:w-auto">Adicionar</button></div>
                    <div className="p-4 overflow-y-auto flex-1 bg-gray-50"><table className="w-full text-sm border-collapse bg-white shadow-sm rounded-lg"><thead><tr className="bg-gray-100 text-gray-700"><th className="p-3 text-left">Produto</th><th className="p-3 text-left">Controle de Estoque</th><th className="p-3 text-center">Tamanhos</th><th className="p-3 text-center w-10">Ações</th></tr></thead><tbody className="divide-y divide-gray-100">{pickingItems.map((item, idx) => { const product = products.find(p => p.reference === item.reference && p.color === item.color); const isLocked = product?.enforceStock; const isNewItem = !pickingOrder.items.some(original => original.reference === item.reference && original.color === item.color); const isEditing = editingItemIdx === idx; return (<tr key={idx} className={isEditing ? 'bg-orange-50' : ''}><td className="p-3 align-top"><p className="font-bold text-gray-800">{item.reference}</p><p className="text-xs uppercase text-gray-500">{item.color}</p>{isNewItem && <span className="text-[10px] bg-blue-100 text-blue-700 px-1 rounded ml-1 font-bold">NOVO</span>}{item.color === 'SORTIDO' && <span className="text-[10px] bg-purple-100 text-purple-700 px-1 rounded ml-1 font-bold">RESOLVER</span>}</td><td className="p-3 align-top">{isLocked ? (<div className="flex items-start text-xs text-red-600 bg-red-50 p-2 rounded border border-red-100"><Lock className="w-4 h-4 mr-1 flex-shrink-0" /><div><span className="font-bold block">Estoque Travado</span><span>{isNewItem || isEditing ? 'Verifique a disp. abaixo' : 'Já baixado no pedido.'}</span></div></div>) : item.color === 'SORTIDO' ? (<div className="text-xs text-purple-600 bg-purple-50 p-2 rounded border border-purple-100 font-bold">Definir Cores Abaixo</div>) : (<div className="flex items-start text-xs text-green-600 bg-green-50 p-2 rounded border border-green-100"><Unlock className="w-4 h-4 mr-1 flex-shrink-0" /><div><span className="font-bold block">Estoque Livre</span><span>Baixará ao salvar aqui.</span></div></div>)}</td><td className="p-3"><div className="flex flex-wrap gap-4 justify-center">{SIZE_GRIDS[item.gridType].map((size) => { const qty = Number(item.sizes[size]) || 0; const picked = Number(item.picked?.[size]) || 0; const isComplete = picked >= qty && qty > 0; const stockAvailable = (product?.stock?.[size] as number) || 0; return (<div key={size} className={`flex flex-col items-center border rounded p-2 ${isNewItem || isEditing ? 'bg-blue-50 border-blue-100' : 'bg-gray-50'}`}><span className="text-xs font-bold text-gray-500 mb-1">{size}</span><div className="flex items-center gap-1 mb-1"><span className="text-xs text-gray-400 mr-1">Ped:</span>{(isNewItem || isEditing) ? (<input type="number" min="0" className="w-12 text-center border-b border-blue-300 bg-transparent font-bold outline-none focus:bg-white text-sm" value={item.sizes[size] || ''} placeholder="0" onChange={(e) => handleOrderQtyChange(idx, size, e.target.value)} />) : (<span className="font-bold text-gray-800 text-sm">{qty}</span>)}</div>{item.color !== 'SORTIDO' && <div className="flex items-center gap-1"><span className="text-xs text-blue-600 mr-1 font-bold">Sep:</span><input type="number" min="0" className={`w-12 text-center border rounded p-1 font-bold outline-none focus:ring-2 focus:ring-blue-500 ${isComplete ? 'bg-green-50 text-green-700 border-green-300' : 'bg-white'}`} value={item.picked?.[size] !== undefined ? item.picked[size] : ''} placeholder="0" onChange={(e) => handlePickingChange(idx, size, e.target.value)} /></div>}{(isNewItem || isEditing) && isLocked && (<div className={`text-[10px] mt-1 font-bold ${qty > stockAvailable ? 'text-red-600' : 'text-green-600'}`}>Disp: {stockAvailable}</div>)}</div>) })}</div></td><td className="p-3 text-center align-middle"><div className="flex flex-col gap-2 items-center">{item.color === 'SORTIDO' && (<button onClick={() => handleOpenSortidoModal(idx)} className="text-purple-600 hover:text-purple-800 p-2 hover:bg-purple-50 rounded shadow-sm bg-white border border-purple-100" title="Distribuir Cores"><ArrowRightLeft className="w-5 h-5" /></button>)}{isEditing ? (<button onClick={() => setEditingItemIdx(null)} className="text-green-600 hover:text-green-800 p-2 hover:bg-green-50 rounded bg-white shadow-sm"><Check className="w-5 h-5" /></button>) : (<button onClick={() => setEditingItemIdx(idx)} className="text-blue-500 hover:text-blue-700 p-2 hover:bg-blue-50 rounded"><Edit2 className="w-5 h-5" /></button>)}<button onClick={() => handleRemoveItem(idx)} className="text-red-400 hover:text-red-600 p-2 hover:bg-red-50 rounded"><Trash className="w-5 h-5" /></button></div></td></tr>)})}</tbody></table></div>
                    
                    <div className="bg-orange-50 p-4 border-t border-orange-200 flex flex-col md:flex-row justify-between items-center gap-4">
                        <div className="flex gap-6 items-center">
                            {(() => { 
                                let currentPickedQty = 0; 
                                let currentPickedValue = 0; 
                                let currentOrderQty = 0; 
                                pickingItems.forEach(item => { 
                                    let unitPrice = item.unitPrice; 
                                    if (!unitPrice || unitPrice === 0) { 
                                        const normalizedRef = item.reference.trim().toUpperCase(); 
                                        if (currentRepPriceMap[normalizedRef]) unitPrice = currentRepPriceMap[normalizedRef]; 
                                        else { 
                                            const prod = products.find(p => p.reference === item.reference && p.color === item.color); 
                                            if (prod) unitPrice = prod.basePrice || 0; 
                                        } 
                                    } 
                                    const ordered = (Object.values(item.sizes) as number[]).reduce((a, b) => a + (Number(b) || 0), 0); 
                                    currentOrderQty += ordered; 
                                    const picked = item.picked ? (Object.values(item.picked) as number[]).reduce((a, b) => a + (Number(b) || 0), 0) : 0; 
                                    currentPickedQty += picked; 
                                    currentPickedValue += (picked * unitPrice); 
                                }); 
                                return (
                                    <>
                                        <div className="text-gray-600 text-sm">Total Pedido: <span className="font-bold">{currentOrderQty} pçs</span></div>
                                        <div className="bg-white px-4 py-2 rounded shadow-sm border border-green-200 flex items-center gap-3">
                                            <div>
                                                <span className="block text-xs font-bold text-gray-500 uppercase">Total Selecionado</span>
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

                    <div className="p-4 border-t bg-white rounded-b-lg flex flex-col md:flex-row justify-between items-center gap-3"><div className="text-xs text-gray-500 w-full md:w-auto text-center md:text-left">* Ao salvar, o estoque dos itens novos será baixado.</div><div className="flex gap-3 w-full md:w-auto justify-end"><button onClick={() => setPickingOrder(null)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">Fechar</button><button onClick={savePickingSimple} disabled={savingPicking} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center shadow-sm disabled:opacity-50 font-bold">{savingPicking ? <Loader2 className="animate-spin w-4 h-4 mr-2" /> : <Save className="w-4 h-4 mr-2" />} Salvar Progresso</button><button onClick={() => setShowRomaneioOptions(true)} disabled={savingPicking} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 flex items-center shadow-sm disabled:opacity-50 font-bold"><Truck className="w-4 h-4 mr-2" /> Gerar Romaneio...</button></div></div>
                    {showRomaneioOptions && (<div className="absolute inset-0 bg-white bg-opacity-95 z-10 flex items-center justify-center p-6 rounded-lg animate-fade-in backdrop-blur-sm"><div className="bg-white border-2 border-green-500 rounded-lg shadow-2xl p-6 max-w-lg w-full"><h3 className="text-xl font-bold text-green-800 mb-2 flex items-center"><Truck className="w-6 h-6 mr-2" /> Gerar Romaneio & Finalizar</h3><p className="text-sm text-gray-600 mb-6">Escolha como deseja processar a entrega deste pedido.</p><div className="mb-6"><label className="block text-sm font-bold text-gray-700 mb-1">Número do Romaneio</label><input autoFocus type="text" className="w-full border-2 border-gray-300 rounded p-3 text-lg font-bold uppercase focus:ring-2 focus:ring-green-500 outline-none" placeholder="Digite o nº..." value={inputRomaneio} onChange={e => setInputRomaneio(e.target.value)} /></div><div className="space-y-3"><button onClick={handlePartialDelivery} disabled={!inputRomaneio || savingPicking} className="w-full bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-lg flex items-center justify-between group transition disabled:opacity-50"><div className="text-left"><span className="block font-bold text-lg">Entrega Parcial</span><span className="text-xs opacity-90">Gera um novo pedido com os itens bipados. Mantém este aberto com o restante.</span></div><Split className="w-6 h-6 text-white opacity-80 group-hover:opacity-100" /></button><button onClick={handleFinalizeWithCancel} disabled={!inputRomaneio || savingPicking} className="w-full bg-green-600 hover:bg-green-700 text-white p-4 rounded-lg flex items-center justify-between group transition disabled:opacity-50"><div className="text-left"><span className="block font-bold text-lg">Finalizar & Cancelar Restante</span><span className="text-xs opacity-90">Fecha o pedido com o que foi bipado. Remove/Cancela os itens não bipados.</span></div><Scissors className="w-6 h-6 text-white opacity-80 group-hover:opacity-100" /></button></div><div className="mt-4 pt-4 border-t text-center"><button onClick={() => setShowRomaneioOptions(false)} className="text-gray-500 hover:text-gray-800 underline">Voltar para separação</button></div></div></div>)}
                    
                    {/* MODAL DISTRIBUIÇÃO SORTIDO */}
                    {sortidoItemIdx !== null && (
                        <div className="absolute inset-0 bg-white bg-opacity-95 z-20 flex items-center justify-center p-6 rounded-lg animate-fade-in backdrop-blur-sm">
                            <div className="bg-white border-2 border-purple-500 rounded-lg shadow-2xl p-6 max-w-xl w-full">
                                <h3 className="text-xl font-bold text-purple-800 mb-2 flex items-center">
                                    <ArrowRightLeft className="w-6 h-6 mr-2" /> Distribuir Cor (Item Sortido)
                                </h3>
                                <p className="text-sm text-gray-600 mb-4">
                                    Ref: <strong>{pickingItems[sortidoItemIdx].reference}</strong>. Escolha a cor real para enviar.
                                    <br/>Isso removerá a quantidade do item "Sortido" e criará um item com a cor selecionada.
                                </p>
                                
                                <div className="mb-4">
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Cor Destino (Real)</label>
                                    <select 
                                        className="w-full border p-2 rounded focus:ring-2 focus:ring-purple-500"
                                        value={sortidoTargetColor}
                                        onChange={e => setSortidoTargetColor(e.target.value)}
                                    >
                                        <option value="">Selecione a cor...</option>
                                        {products
                                            .filter(p => p.reference === pickingItems[sortidoItemIdx].reference && p.color !== 'SORTIDO')
                                            .map(p => <option key={p.color} value={p.color}>{p.color} (Est: {Object.values(p.stock).reduce((a,b)=>a+(b as number),0)})</option>)
                                        }
                                    </select>
                                </div>

                                <div className="mb-6">
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Quantidade a Mover</label>
                                    <div className="flex flex-wrap gap-2">
                                        {SIZE_GRIDS[pickingItems[sortidoItemIdx].gridType].map(size => {
                                            const availableInSortido = pickingItems[sortidoItemIdx].sizes[size] || 0;
                                            if (availableInSortido <= 0) return null;
                                            
                                            // Encontrar estoque real
                                            const realProduct = products.find(p => p.reference === pickingItems[sortidoItemIdx].reference && p.color === sortidoTargetColor);
                                            const realStock = realProduct?.stock?.[size] || 0;

                                            return (
                                                <div key={size} className="bg-gray-50 p-2 rounded border text-center w-20">
                                                    <span className="block text-xs font-bold text-gray-500">{size}</span>
                                                    <span className="text-[10px] text-purple-600 mb-1 block">Ped: {availableInSortido}</span>
                                                    <input 
                                                        type="number" 
                                                        min="0"
                                                        max={availableInSortido}
                                                        className="w-full border text-center p-1 rounded focus:ring-purple-500 outline-none"
                                                        value={sortidoDist[size] || ''}
                                                        onChange={e => {
                                                            let val = parseInt(e.target.value) || 0;
                                                            if (val > availableInSortido) val = availableInSortido;
                                                            setSortidoDist({...sortidoDist, [size]: val});
                                                        }}
                                                    />
                                                    {sortidoTargetColor && (
                                                        <span className={`text-[9px] block mt-1 ${realStock < (sortidoDist[size]||0) ? 'text-red-500 font-bold' : 'text-green-600'}`}>
                                                            Est: {realStock}
                                                        </span>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="flex justify-end gap-2 border-t pt-4">
                                    <button onClick={() => setSortidoItemIdx(null)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">Cancelar</button>
                                    <button onClick={handleConfirmSortidoDistribution} className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 font-bold shadow-sm">Confirmar Distribuição</button>
                                </div>
                            </div>
                        </div>
                    )}
              </div>
          </div>
      )}

      {showAggregation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 no-print p-2 md:p-4 animate-fade-in">
          <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl">
            <div className="p-4 md:p-6 border-b flex justify-between items-center bg-purple-50">
              <div>
                <h2 className="text-lg md:text-xl font-bold text-purple-900 flex items-center">
                  <Calculator className="w-5 h-5 mr-2" /> Resumo de Produção
                </h2>
                <p className="text-xs md:text-sm text-purple-600 mt-1">{selectedOrderIds.size} pedidos selecionados</p>
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
                      const colTotal = aggregatedItems.reduce<number>((acc, i) => {
                        const val = i.sizes && i.sizes[s];
                        const qty = typeof val === 'number' ? val : 0;
                        return acc + qty;
                      }, 0);
                      return <td key={s} className="border p-3 text-center">{colTotal || ''}</td>
                    })}
                    <td className="border p-3 text-right text-xl">
                      {aggregatedItems.reduce<number>((acc, i) => acc + (typeof i.totalQty === 'number' ? i.totalQty : 0), 0)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            
            <div className="p-4 md:p-6 border-t bg-gray-50 flex justify-end">
              <button onClick={handlePrintAggregation} className="bg-blue-600 text-white px-6 py-3 md:py-2 rounded hover:bg-blue-700 flex items-center shadow-lg w-full md:w-auto justify-center">
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
