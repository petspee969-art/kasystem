
import { User, ProductDef, Order, Client, Role, RepPrice, OrderItem } from '../types';
import { API_URL } from './supabaseClient';

// --- UTILS ---
export const generateUUID = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    try {
      return crypto.randomUUID();
    } catch (e) {
      // Falha silenciosa
    }
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

// Helper para formatar data compatível com MySQL (YYYY-MM-DD HH:mm:ss)
const getMySQLDate = () => {
    return new Date().toISOString().slice(0, 19).replace('T', ' ');
};

const handleResponse = async (res: Response) => {
    if (!res.ok) {
        // CORREÇÃO TELA BRANCA: Lê o texto uma única vez
        const textBody = await res.text();
        let errorMessage = res.statusText;
        
        try {
            // Tenta fazer parse do texto como JSON
            const errJson = JSON.parse(textBody);
            if (errJson && errJson.error) errorMessage = errJson.error;
        } catch (e) {
            // Se falhar o parse, usa o texto puro (pode ser erro HTML do servidor)
            if (textBody) errorMessage = textBody;
        }
        
        // Se for erro de HTML grande, corta para não poluir
        if (errorMessage.startsWith('<') && errorMessage.length > 200) {
            errorMessage = `Erro no servidor (Código ${res.status}). Verifique o terminal do backend.`;
        }

        throw new Error(errorMessage || 'Erro na requisição ao servidor');
    }
    return res.json();
};

// --- USERS ---
export const getUsers = async (): Promise<User[]> => {
  const res = await fetch(`${API_URL}/users`);
  const data = await handleResponse(res);
  return Array.isArray(data) ? data.filter((u: any) => u && u.id) : [];
};

export const addUser = async (user: User): Promise<void> => {
  await fetch(`${API_URL}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(user)
  });
};

export const deleteUser = async (id: string): Promise<void> => {
  await fetch(`${API_URL}/users/${id}`, { method: 'DELETE' });
};

// --- PRODUCTS ---
export const getProducts = async (): Promise<ProductDef[]> => {
  const res = await fetch(`${API_URL}/products`);
  const data = await handleResponse(res);
  
  if (!Array.isArray(data)) return [];

  // Mapeamento snake_case (banco) -> camelCase (app)
  // Adicionado .filter(p => p) para evitar crash se vier null
  return data.filter((p: any) => p).map((p: any) => ({
    id: p.id,
    reference: p.reference,
    color: p.color,
    gridType: p.grid_type || p.gridType,
    stock: p.stock || {}, 
    minStock: p.min_stock || {}, // Mapeia min_stock
    enforceStock: !!p.enforce_stock,
    basePrice: typeof p.base_price === 'string' ? parseFloat(p.base_price) : (p.base_price || 0)
  })) as ProductDef[];
};

export const addProduct = async (prod: ProductDef): Promise<void> => {
  const dbProd = {
    id: prod.id,
    reference: prod.reference,
    color: prod.color,
    grid_type: prod.gridType,
    stock: prod.stock,
    min_stock: prod.minStock, // Salva minStock
    enforce_stock: prod.enforceStock ? 1 : 0,
    base_price: prod.basePrice
  };

  await fetch(`${API_URL}/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dbProd)
  });
};

export const updateProductInventory = async (id: string, newStock: any, enforceStock: boolean, basePrice: number, minStock: any = null): Promise<void> => {
    let finalMinStock = minStock;
    if (!finalMinStock) {
        const res = await fetch(`${API_URL}/products`); 
        const all = await handleResponse(res);
        const current = all.find((p:any) => p.id === id);
        finalMinStock = current ? (current.min_stock || {}) : {};
    }

    await fetch(`${API_URL}/products/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            stock: newStock, 
            min_stock: finalMinStock,
            enforce_stock: enforceStock ? 1 : 0,
            base_price: basePrice
        })
    });
}

export const deleteProduct = async (id: string): Promise<void> => {
    await fetch(`${API_URL}/products/${id}`, { method: 'DELETE' });
};

// --- LOGICA DE ESTOQUE ---
export const updateStockOnOrderCreation = async (items: OrderItem[], reverse: boolean = false): Promise<void> => {
    const currentProducts = await getProducts();

    for (const item of items) {
        if (item.color === 'SORTIDO') continue;

        const product = currentProducts.find(
            p => p.reference === item.reference && p.color === item.color
        );

        if (product && product.enforceStock) {
            const newStock = { ...product.stock };
            let changed = false;

            Object.entries(item.sizes).forEach(([size, qty]) => {
                const currentQty = newStock[size] || 0;
                if (reverse) {
                    newStock[size] = currentQty + qty; 
                } else {
                    newStock[size] = currentQty - qty; 
                }
                changed = true;
            });

            if (changed) {
                await updateProductInventory(product.id, newStock, product.enforceStock, product.basePrice, product.minStock);
            }
        }
    }
};

export const saveOrderPicking = async (orderId: string, oldItems: OrderItem[], newItems: OrderItem[]): Promise<Order> => {
    const res = await fetch(`${API_URL}/orders/${orderId}`);
    const currentOrder = await handleResponse(res);
    
    if (currentOrder.romaneio) {
        throw new Error("Este pedido já possui Romaneio (Finalizado). Não é possível alterar itens ou estoque.");
    }

    let newTotalPieces = 0;
    let newSubtotalValue = 0;

    const processedItems = newItems.map(item => {
        const orderedQty = item.sizes ? Object.values(item.sizes).reduce((a, b) => a + (b || 0), 0) : 0;
        item.totalQty = orderedQty;

        const pickedQty = item.picked ? Object.values(item.picked).reduce((a, b) => a + b, 0) : 0;
        newTotalPieces += orderedQty;

        const quantityForValue = pickedQty > 0 ? pickedQty : orderedQty;
        const itemValue = quantityForValue * item.unitPrice;
        newSubtotalValue += itemValue;

        return { ...item, totalItemValue: itemValue };
    });

    let discountAmount = 0;
    const discountVal = parseFloat(currentOrder.discount_value || currentOrder.discountValue || 0);
    const discType = currentOrder.discount_type || currentOrder.discountType;

    if (discType === 'percentage') {
        discountAmount = newSubtotalValue * (discountVal / 100);
    } else if (discType === 'fixed') {
        discountAmount = discountVal;
    }

    const newFinalValue = Math.max(0, newSubtotalValue - discountAmount);

    const updateRes = await fetch(`${API_URL}/orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            items: processedItems,
            total_pieces: newTotalPieces,
            subtotal_value: newSubtotalValue,
            final_total_value: newFinalValue
        })
    });
    const updatedRow = await handleResponse(updateRes);
    
    const currentProducts = await getProducts();
    const processedKeys = new Set<string>();
    const getKey = (ref: string, color: string) => `${ref}:::${color}`;

    const oldMap: Record<string, OrderItem> = {};
    oldItems.forEach(i => oldMap[getKey(i.reference, i.color)] = i);

    const newMap: Record<string, OrderItem> = {};
    processedItems.forEach(i => newMap[getKey(i.reference, i.color)] = i);

    Object.keys(oldMap).forEach(k => processedKeys.add(k));
    Object.keys(newMap).forEach(k => processedKeys.add(k));

    for (const key of processedKeys) {
        const [ref, color] = key.split(':::');
        if (color === 'SORTIDO') continue;

        const oldItem = oldMap[key];
        const newItem = newMap[key];
        const product = currentProducts.find(p => p.reference === ref && p.color === color);

        if (product) {
            let stockChanged = false;
            const newStock = { ...product.stock };
            
            const oldPicked = oldItem?.picked || {};
            const oldOrderedSizes = oldItem?.sizes || {};
            const newPicked = newItem?.picked || {};
            const newOrderedSizes = newItem?.sizes || {};

            const allSizes = new Set([
                ...Object.keys(oldPicked), ...Object.keys(oldOrderedSizes),
                ...Object.keys(newPicked), ...Object.keys(newOrderedSizes)
            ]);

            allSizes.forEach(size => {
                const qOldOrdered = oldOrderedSizes[size] || 0;
                const qOldPicked = oldPicked[size] || 0;
                const qNewOrdered = newOrderedSizes[size] || 0;
                const qNewPicked = newPicked[size] || 0;

                let delta = 0;
                if (!product.enforceStock) {
                    delta = qNewPicked - qOldPicked;
                } else {
                    delta = qNewOrdered - qOldOrdered;
                }

                if (delta !== 0) {
                    const currentStockQty = newStock[size] || 0;
                    newStock[size] = currentStockQty - delta;
                    stockChanged = true;
                }
            });

            if (stockChanged) {
                 await updateProductInventory(product.id, newStock, product.enforceStock, product.basePrice, product.minStock);
            }
        }
    }

    return formatOrder(updatedRow);
};


// --- REP PRICES ---
export const getRepPrices = async (repId: string): Promise<RepPrice[]> => {
    const res = await fetch(`${API_URL}/rep_prices?rep_id=${repId}`);
    const data = await handleResponse(res);
    return data.map((d: any) => ({
        id: d.id,
        repId: d.rep_id,
        reference: d.reference,
        price: parseFloat(d.price)
    }));
};

export const upsertRepPrice = async (priceData: RepPrice): Promise<void> => {
    await fetch(`${API_URL}/rep_prices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            rep_id: priceData.repId,
            reference: priceData.reference,
            price: priceData.price
        })
    });
};

// --- CLIENTS ---
export const getClients = async (repId?: string): Promise<Client[]> => {
  let url = `${API_URL}/clients`;
  if (repId) url += `?rep_id=${repId}`;
  
  const res = await fetch(url);
  const data = await handleResponse(res);
  
  return data.map((row: any) => ({
    id: row.id,
    repId: row.rep_id,
    name: row.name,
    city: row.city,
    neighborhood: row.neighborhood,
    state: row.state,
    cpfCnpj: row.cpf_cnpj, 
    mobile: row.mobile 
  }));
};

export const addClient = async (client: Client): Promise<void> => {
  const dbClient = {
    id: client.id,
    rep_id: client.repId,
    name: client.name,
    city: client.city,
    neighborhood: client.neighborhood,
    state: client.state,
    cpf_cnpj: client.cpfCnpj, 
    mobile: client.mobile 
  };
  await fetch(`${API_URL}/clients`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dbClient)
  });
};

export const updateClient = async (updatedClient: Client): Promise<void> => {
  const dbClient = {
    rep_id: updatedClient.repId,
    name: updatedClient.name,
    city: updatedClient.city,
    neighborhood: updatedClient.neighborhood,
    state: updatedClient.state,
    cpf_cnpj: updatedClient.cpfCnpj, 
    mobile: updatedClient.mobile 
  };
  await fetch(`${API_URL}/clients/${updatedClient.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dbClient)
  });
};

export const deleteClient = async (id: string): Promise<void> => {
    await fetch(`${API_URL}/clients/${id}`, { method: 'DELETE' });
};

// --- ORDERS ---
const formatOrder = (row: any): Order => {
    let items = row.items;
    if (typeof items === 'string') {
        try { items = JSON.parse(items); } catch(e) {}
    }
    
    // CORREÇÃO CRÍTICA DE DATA:
    let createdAt = row.created_at || row.createdAt;
    if (createdAt && typeof createdAt === 'string' && createdAt.includes(' ') && !createdAt.includes('T')) {
        createdAt = createdAt.replace(' ', 'T');
    }

    return {
      ...row,
      id: row.id,
      displayId: row.display_id || row.displayId,
      romaneio: row.romaneio,
      isPartial: !!row.is_partial,
      repId: row.rep_id || row.repId,
      repName: row.rep_name || row.repName,
      clientId: row.client_id || row.clientId,
      clientName: row.client_name || row.clientName,
      clientCity: row.client_city || row.clientCity,
      clientState: row.client_state || row.clientState,
      createdAt: createdAt,
      deliveryDate: row.delivery_date || row.deliveryDate,
      paymentMethod: row.payment_method || row.paymentMethod,
      status: row.status,
      items: Array.isArray(items) ? items : [], 
      totalPieces: row.total_pieces || row.totalPieces,
      subtotalValue: parseFloat(row.subtotal_value || row.subtotalValue || 0),
      discountType: row.discount_type || row.discountType || null,
      discountValue: parseFloat(row.discount_value || row.discountValue || 0),
      finalTotalValue: parseFloat(row.final_total_value || row.finalTotalValue || 0)
    };
};

export const getOrders = async (): Promise<Order[]> => {
    const res = await fetch(`${API_URL}/orders`);
    const data = await handleResponse(res);
    // Filtro para garantir que não existam linhas vazias
    return Array.isArray(data) ? data.filter((row: any) => row && row.id).map(formatOrder) : [];
};

const checkRomaneioExists = async (romaneio: string, excludeOrderId?: string): Promise<boolean> => {
    if (!romaneio) return false;
    let url = `${API_URL}/orders?romaneio=${romaneio}`;
    if (excludeOrderId) url += `&excludeId=${excludeOrderId}`;
    
    const res = await fetch(url);
    const data = await handleResponse(res);
    return data && data.length > 0;
};

export const addOrder = async (order: Omit<Order, 'displayId'>): Promise<Order | null> => {
  if (order.romaneio) {
      const exists = await checkRomaneioExists(order.romaneio);
      if (exists) throw new Error(`O Romaneio nº ${order.romaneio} já existe.`);
  }

  // 1. Sequencial do ID
  let newSeq = 1;
  try {
      const confRes = await fetch(`${API_URL}/config/order_seq`);
      const confData = await handleResponse(confRes);
      
      if (confData && confData.value !== undefined && confData.value !== null) {
          const currentVal = parseInt(String(confData.value), 10);
          if (!isNaN(currentVal)) {
              newSeq = currentVal + 1;
          }
      }
      
      await fetch(`${API_URL}/config`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'order_seq', value: newSeq })
      });

  } catch (err) {
    console.warn("Usando fallback de ID para pedido.", err);
    newSeq = Math.floor(Date.now() / 1000) % 100000;
  }

  if (!newSeq || isNaN(newSeq)) newSeq = 1;

  const orderWithSeq = { ...order, displayId: newSeq };

  // CORREÇÃO: Formata a data para MySQL (remove T e Z)
  const formattedCreatedAt = getMySQLDate();

  // Objeto completo com chaves snake_case para enviar à API
  const dbOrder = {
    id: orderWithSeq.id,
    display_id: orderWithSeq.displayId,
    romaneio: orderWithSeq.romaneio || null,
    is_partial: orderWithSeq.isPartial ? 1 : 0,
    rep_id: orderWithSeq.repId,
    rep_name: orderWithSeq.repName,
    client_id: orderWithSeq.clientId,
    client_name: orderWithSeq.clientName,
    client_city: orderWithSeq.clientCity,
    client_state: orderWithSeq.clientState,
    created_at: formattedCreatedAt,
    delivery_date: orderWithSeq.deliveryDate || null, 
    payment_method: orderWithSeq.paymentMethod,
    status: orderWithSeq.status,
    items: orderWithSeq.items, // O Server irá fazer stringify
    total_pieces: orderWithSeq.totalPieces,
    subtotal_value: orderWithSeq.subtotalValue,
    discount_type: orderWithSeq.discountType,
    discount_value: orderWithSeq.discountValue,
    final_total_value: orderWithSeq.finalTotalValue
  };

  await fetch(`${API_URL}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dbOrder)
  });

  try {
      await updateStockOnOrderCreation(orderWithSeq.items);
  } catch (err) {
      console.error("Pedido salvo, mas erro ao atualizar estoque:", err);
  }

  return { ...orderWithSeq, createdAt: formattedCreatedAt } as Order;
};

// ATUALIZAÇÃO COMPLETA DE PEDIDO (Para edição do Representante)
export const updateOrderFull = async (orderId: string, updatedData: Partial<Order>): Promise<void> => {
    // 1. Busca o pedido antigo
    const res = await fetch(`${API_URL}/orders/${orderId}`);
    const oldOrder = await handleResponse(res);
    const oldItems = typeof oldOrder.items === 'string' ? JSON.parse(oldOrder.items) : oldOrder.items;

    if (oldOrder.romaneio) {
        throw new Error("Não é possível editar um pedido já finalizado (Com Romaneio).");
    }

    // 2. Verifica romaneio se mudou
    if (updatedData.romaneio && updatedData.romaneio !== oldOrder.romaneio) {
        const exists = await checkRomaneioExists(updatedData.romaneio, orderId);
        if (exists) throw new Error(`O Romaneio nº ${updatedData.romaneio} já existe.`);
    }

    // 3. Reverte o estoque dos itens antigos (Devolve para o estoque - APENAS para EnforceStock=true)
    await updateStockOnOrderCreation(oldItems, true);

    // --- LÓGICA DE FUSÃO: Preserva 'picked' (separação) e ajusta estoque se houver redução ---
    // Busca produtos para saber se são de estoque travado ou livre
    const allProducts = await getProducts();
    
    if (updatedData.items && Array.isArray(updatedData.items)) {
        const mergedItems: OrderItem[] = [];

        // Processa item por item sequencialmente
        for (const newItem of updatedData.items) {
            const matchingOldItem = oldItems.find((oi: OrderItem) =>
                oi.reference === newItem.reference && oi.color === newItem.color
            );

            // Se o item já existia e tinha separação (picked)
            if (matchingOldItem && matchingOldItem.picked) {
                const preservedPicked = { ...matchingOldItem.picked };
                const product = allProducts.find(p => p.reference === newItem.reference && p.color === newItem.color);
                
                let stockUpdateNeeded = false;
                const stockToUpdate = product ? { ...product.stock } : {};

                // Verifica se a quantidade pedida DIMINUIU abaixo do que já estava separado
                for (const size of Object.keys(preservedPicked)) {
                    const pickedQty = preservedPicked[size];
                    const requestedQty = newItem.sizes[size] || 0;

                    if (pickedQty > requestedQty) {
                        // Ex: Pediu 2, Separou 2. Agora mudou pedido para 1.
                        // Surplus (Sobra) = 2 - 1 = 1.
                        const surplus = pickedQty - requestedQty;
                        
                        // Ajusta o 'picked' para o novo máximo (1)
                        preservedPicked[size] = requestedQty;

                        // Se o produto NÃO tem estoque travado (enforceStock=false), 
                        // significa que o estoque foi baixado na separação (Picking).
                        // Precisamos DEVOLVER a sobra para o estoque.
                        // (Se fosse travado, o passo 3 e 5 já resolveriam via 'sizes').
                        if (product && !product.enforceStock) {
                            stockToUpdate[size] = (stockToUpdate[size] || 0) + surplus;
                            stockUpdateNeeded = true;
                        }
                    }
                }

                // Salva o retorno ao estoque se necessário
                if (stockUpdateNeeded && product) {
                    await updateProductInventory(
                        product.id, 
                        stockToUpdate, 
                        product.enforceStock, 
                        product.basePrice, 
                        product.minStock
                    );
                    // Atualiza a ref local para consistência
                    product.stock = stockToUpdate; 
                }
                
                // Limpa chaves zeradas
                Object.keys(preservedPicked).forEach(k => {
                    if (preservedPicked[k] === 0) delete preservedPicked[k];
                });

                // Adiciona o item com o 'picked' preservado/ajustado
                mergedItems.push({ ...newItem, picked: preservedPicked });
            } else {
                // Item novo ou sem separação anterior
                mergedItems.push(newItem);
            }
        }
        updatedData.items = mergedItems;
    }
    // --- FIM LÓGICA FUSÃO ---

    // 4. Salva o pedido atualizado - Mapeamento Snake_case
    const dbOrderUpdate = {
        client_id: updatedData.clientId,
        client_name: updatedData.clientName,
        client_city: updatedData.clientCity,
        client_state: updatedData.clientState,
        delivery_date: updatedData.deliveryDate || null, 
        payment_method: updatedData.paymentMethod,
        romaneio: updatedData.romaneio,
        items: updatedData.items,
        total_pieces: updatedData.totalPieces,
        subtotal_value: updatedData.subtotalValue,
        discount_type: updatedData.discountType,
        discount_value: updatedData.discountValue,
        final_total_value: updatedData.finalTotalValue
    };

    await fetch(`${API_URL}/orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dbOrderUpdate)
    });

    // 5. Baixa o estoque dos novos itens (APENAS para EnforceStock=true)
    if (updatedData.items) {
        await updateStockOnOrderCreation(updatedData.items, false);
    }
};

export const deleteOrder = async (orderId: string): Promise<void> => {
    const res = await fetch(`${API_URL}/orders/${orderId}`);
    const rawOrder = await handleResponse(res);
    const items: OrderItem[] = typeof rawOrder.items === 'string' ? JSON.parse(rawOrder.items) : rawOrder.items;
    const allProducts = await getProducts();

    for (const item of items) {
        if (!item.reference) continue;

        const product = allProducts.find(p => p.reference === item.reference && p.color === item.color);

        if (product) {
            const currentStock = { ...product.stock };
            let hasChange = false;

            const allSizes = new Set([
                ...Object.keys(item.sizes || {}),
                ...(item.picked ? Object.keys(item.picked) : [])
            ]);

            allSizes.forEach(size => {
                let qtyToRestore = 0;

                if (product.enforceStock) {
                    qtyToRestore = item.sizes[size] || 0;
                } else {
                    qtyToRestore = item.picked?.[size] || 0;
                }

                if (qtyToRestore > 0) {
                    currentStock[size] = (currentStock[size] || 0) + qtyToRestore;
                    hasChange = true;
                }
            });

            if (hasChange) {
                await updateProductInventory(product.id, currentStock, product.enforceStock, product.basePrice, product.minStock);
            }
        }
    }

    await fetch(`${API_URL}/orders/${orderId}`, { method: 'DELETE' });
};

export const updateOrderRomaneio = async (id: string, romaneio: string): Promise<void> => {
  const exists = await checkRomaneioExists(romaneio, id);
  if (exists) throw new Error(`O Romaneio nº ${romaneio} já existe.`);

  await fetch(`${API_URL}/orders/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ romaneio })
  });
};

export const updateOrderStatus = async (id: string, status: 'open' | 'printed'): Promise<void> => {
    await fetch(`${API_URL}/orders/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
    });
};

export const initializeStorage = () => {
  console.log("Serviço de armazenamento API Local inicializado.");
};
