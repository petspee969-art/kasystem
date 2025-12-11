
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

const handleResponse = async (res: Response) => {
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || 'Erro na requisição');
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
    // Se minStock não for passado (em chamadas antigas ou updates parciais), buscamos o atual?
    // Para simplificar, a API espera o objeto completo ou faz merge. No backend atual (PUT), substituimos tudo.
    // Portanto, o frontend deve passar o minStock atual se não quiser alterá-lo.
    
    // NOTA: Se minStock for null, a API pode falhar se não tratada.
    // O ideal é que quem chama essa função passe o minStock.
    // Se a chamada vier de um lugar que não sabe o minStock (ex: vendas), precisamos lidar com isso.
    
    // Melhor abordagem aqui para Vendas: Se minStock for undefined/null, precisamos ler do produto atual antes de salvar?
    // O endpoint PUT no server.js espera todos os campos.
    
    let finalMinStock = minStock;
    if (!finalMinStock) {
        // Se não fornecido, busca o produto atual para preservar o minStock
        const res = await fetch(`${API_URL}/products`); // Ineficiente mas seguro para este arquitetura local
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
        // Se for SORTIDO, não mexe no estoque na criação/edição (será resolvido na separação)
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
                    newStock[size] = currentQty + qty; // Devolve ao estoque
                } else {
                    newStock[size] = currentQty - qty; // Tira do estoque
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
    // 1. Busca pedido atual
    const res = await fetch(`${API_URL}/orders/${orderId}`);
    const currentOrder = await handleResponse(res);
    
    if (currentOrder.romaneio) {
        throw new Error("Este pedido já possui Romaneio (Finalizado). Não é possível alterar itens ou estoque.");
    }

    // 2. Recalcula totais
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

    // 4. Atualiza o Pedido
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
    
    // 5. Calcula diferença e atualiza estoque
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
        // Ignora SORTIDO no controle de estoque fino
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

    // Retorna formatado
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
    state: row.state
  }));
};

export const addClient = async (client: Client): Promise<void> => {
  const dbClient = {
    id: client.id,
    rep_id: client.repId,
    name: client.name,
    city: client.city,
    neighborhood: client.neighborhood,
    state: client.state
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
    state: updatedClient.state
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
    created_at: orderWithSeq.createdAt,
    delivery_date: orderWithSeq.deliveryDate,
    payment_method: orderWithSeq.paymentMethod,
    status: orderWithSeq.status,
    items: orderWithSeq.items, 
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

  return orderWithSeq as Order;
};

// ATUALIZAÇÃO COMPLETA DE PEDIDO (Para edição do Representante)
export const updateOrderFull = async (orderId: string, updatedData: Partial<Order>): Promise<void> => {
    // 1. Busca o pedido antigo para reverter estoque
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

    // 3. Reverte o estoque dos itens antigos (Devolve para o estoque)
    await updateStockOnOrderCreation(oldItems, true);

    // 4. Salva o pedido atualizado
    const dbOrderUpdate = {
        client_id: updatedData.clientId,
        client_name: updatedData.clientName,
        client_city: updatedData.clientCity,
        client_state: updatedData.clientState,
        delivery_date: updatedData.deliveryDate,
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

    // 5. Baixa o estoque dos novos itens
    if (updatedData.items) {
        await updateStockOnOrderCreation(updatedData.items, false);
    }
};

export const deleteOrder = async (orderId: string): Promise<void> => {
    // 1. Busca detalhes do pedido (precisa dos itens para devolver ao estoque)
    const res = await fetch(`${API_URL}/orders/${orderId}`);
    const rawOrder = await handleResponse(res);
    
    // Normaliza os itens se vierem como string
    const items: OrderItem[] = typeof rawOrder.items === 'string' ? JSON.parse(rawOrder.items) : rawOrder.items;

    // 2. Busca catálogo de produtos para saber quais têm estoque travado vs livre
    const allProducts = await getProducts();

    // 3. Devolve estoque
    for (const item of items) {
        // Ignora itens puramente descritivos que não tem referência válida
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
                    // Se o estoque é travado, o que foi baixado foi a Quantidade PEDIDA (sizes)
                    // Devolvemos o que foi pedido.
                    qtyToRestore = item.sizes[size] || 0;
                } else {
                    // Se o estoque é livre, o que foi baixado foi a Quantidade SEPARADA (picked)
                    // Devolvemos apenas o que foi fisicamente separado.
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

    // 4. Deleta o registro do pedido
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
