
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
  return handleResponse(res);
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
  
  // Mapeamento snake_case (banco) -> camelCase (app)
  return data?.map((p: any) => ({
    id: p.id,
    reference: p.reference,
    color: p.color,
    gridType: p.grid_type || p.gridType,
    stock: p.stock || {}, 
    enforceStock: !!p.enforce_stock,
    basePrice: typeof p.base_price === 'string' ? parseFloat(p.base_price) : (p.base_price || 0)
  })) as ProductDef[] || [];
};

export const addProduct = async (prod: ProductDef): Promise<void> => {
  const dbProd = {
    id: prod.id,
    reference: prod.reference,
    color: prod.color,
    grid_type: prod.gridType,
    stock: prod.stock,
    enforce_stock: prod.enforceStock ? 1 : 0,
    base_price: prod.basePrice
  };

  await fetch(`${API_URL}/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dbProd)
  });
};

export const updateProductInventory = async (id: string, newStock: any, enforceStock: boolean, basePrice: number): Promise<void> => {
    await fetch(`${API_URL}/products/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            stock: newStock, 
            enforce_stock: enforceStock ? 1 : 0,
            base_price: basePrice
        })
    });
}

export const deleteProduct = async (id: string): Promise<void> => {
    await fetch(`${API_URL}/products/${id}`, { method: 'DELETE' });
};

// --- LOGICA DE ESTOQUE ---
export const updateStockOnOrderCreation = async (items: OrderItem[]): Promise<void> => {
    const currentProducts = await getProducts();

    for (const item of items) {
        const product = currentProducts.find(
            p => p.reference === item.reference && p.color === item.color
        );

        if (product && product.enforceStock) {
            const newStock = { ...product.stock };
            
            Object.entries(item.sizes).forEach(([size, qty]) => {
                const currentQty = newStock[size] || 0;
                newStock[size] = currentQty - qty;
            });

            await updateProductInventory(product.id, newStock, product.enforceStock, product.basePrice);
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
                 await updateProductInventory(product.id, newStock, product.enforceStock, product.basePrice);
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
      createdAt: row.created_at || row.createdAt,
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
    return data.map(formatOrder);
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

  // 1. Sequencial do ID (Gerado via tabela app_config no backend)
  let newSeq = 1; // Padrão agora começa em 1
  try {
      // Get current seq
      const confRes = await fetch(`${API_URL}/config/order_seq`);
      const confData = await handleResponse(confRes);
      
      if (confData && confData.value !== undefined && confData.value !== null) {
          // Garante que é número para evitar erro de string concatenation (ex: "1001" + 1 = "10011")
          const currentVal = parseInt(String(confData.value), 10);
          if (!isNaN(currentVal)) {
              newSeq = currentVal + 1;
          }
      }
      
      // Update seq
      await fetch(`${API_URL}/config`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'order_seq', value: newSeq })
      });

  } catch (err) {
    console.warn("Usando fallback de ID para pedido.", err);
    // Se der erro, usa fallback mas garante que seja numérico
    newSeq = Math.floor(Date.now() / 1000) % 100000;
  }

  // Garante que displayId nunca seja nulo
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
