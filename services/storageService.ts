
import { User, ProductDef, Order, Client, Role, RepPrice, OrderItem } from '../types';
import { supabase } from './supabaseClient';

// --- UTILS ---
// Função segura para gerar UUID em qualquer ambiente
export const generateUUID = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    try {
      return crypto.randomUUID();
    } catch (e) {
      // Falha silenciosa
    }
  }
  // Fallback manual
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

// --- USERS ---
export const getUsers = async (): Promise<User[]> => {
  const { data, error } = await supabase.from('users').select('*');
  if (error) { 
    console.error("Erro ao buscar usuários:", error); 
    throw error; 
  }
  return (data || []) as User[];
};

export const addUser = async (user: User): Promise<void> => {
  const { error } = await supabase.from('users').insert(user);
  if (error) throw error;
};

export const deleteUser = async (id: string): Promise<void> => {
  const { error } = await supabase.from('users').delete().eq('id', id);
  if (error) throw error;
};

// --- PRODUCTS ---
export const getProducts = async (): Promise<ProductDef[]> => {
  const { data, error } = await supabase.from('products').select('*');
  if (error) { 
    console.error(error); 
    return []; 
  }
  // Mapeamento snake_case (banco) -> camelCase (app)
  return data?.map((p: any) => ({
    id: p.id,
    reference: p.reference,
    color: p.color,
    gridType: p.grid_type || p.gridType,
    stock: p.stock || {}, 
    enforceStock: p.enforce_stock || false,
    basePrice: p.base_price || 0 // Mapeia o preço de custo
  })) as ProductDef[] || [];
};

export const addProduct = async (prod: ProductDef): Promise<void> => {
  // Mapeamento camelCase (app) -> snake_case (banco)
  const dbProd = {
    id: prod.id,
    reference: prod.reference,
    color: prod.color,
    grid_type: prod.gridType,
    stock: prod.stock,
    enforce_stock: prod.enforceStock,
    base_price: prod.basePrice // Salva o preço de custo
  };

  const { error } = await supabase.from('products').insert(dbProd);
  if (error) throw error;
};

// Função atualizada para editar estoque, preço base e configurações
export const updateProductInventory = async (id: string, newStock: any, enforceStock: boolean, basePrice: number): Promise<void> => {
    const { error } = await supabase
        .from('products')
        .update({ 
            stock: newStock, 
            enforce_stock: enforceStock,
            base_price: basePrice
        })
        .eq('id', id);
    if (error) throw error;
}

// Mantendo compatibilidade com código antigo se houver
export const updateProductStock = async (id: string, newStock: any): Promise<void> => {
    const { error } = await supabase
        .from('products')
        .update({ stock: newStock })
        .eq('id', id);
    if (error) throw error;
}

export const deleteProduct = async (id: string): Promise<void> => {
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) throw error;
};

// --- LOGICA DE ESTOQUE ---

// Função chamada na CRIAÇÃO do pedido.
// Regra: Só baixa estoque se enforceStock == true.
export const updateStockOnOrderCreation = async (items: OrderItem[]): Promise<void> => {
    const currentProducts = await getProducts();

    for (const item of items) {
        const product = currentProducts.find(
            p => p.reference === item.reference && p.color === item.color
        );

        // Só baixa na hora do pedido se estiver Travado (enforceStock = true)
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

// Função para SALVAR A SEPARAÇÃO e baixar estoque
// AGORA: Recalcula totais do pedido com base na separação E gerencia estoque de itens extras
export const saveOrderPicking = async (orderId: string, oldItems: OrderItem[], newItems: OrderItem[]): Promise<Order> => {
    
    // 1. Busca dados atuais do pedido para pegar as configurações de desconto
    const { data: currentOrder, error: fetchError } = await supabase
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .single();
    
    if (fetchError) throw fetchError;

    // VALIDAÇÃO DE TRAVA: Se tem Romaneio, não pode editar itens.
    if (currentOrder.romaneio) {
        throw new Error("Este pedido já possui Romaneio (Finalizado). Não é possível alterar itens ou estoque.");
    }

    // 2. Recalcula os totais com base nos novos itens
    let newTotalPieces = 0;
    let newSubtotalValue = 0;

    const processedItems = newItems.map(item => {
        // Recalcula a Quantidade Pedida (Ordered) com base no objeto sizes (Fonte da Verdade)
        const orderedQty = item.sizes ? Object.values(item.sizes).reduce((a, b) => a + (b || 0), 0) : 0;
        
        // Atualiza o totalQty do item para refletir fielmente o que foi PEDIDO
        item.totalQty = orderedQty;

        // Calcula a Quantidade Separada (Picked)
        const pickedQty = item.picked ? Object.values(item.picked).reduce((a, b) => a + b, 0) : 0;

        // LÓGICA DE TOTAIS:
        // O Total de Peças do Pedido (newTotalPieces) deve ser sempre a quantidade PEDIDA (orderedQty).
        // Isso garante que o indicador "Separação: X / Y" mostre Y correto (ex: 1/13).
        newTotalPieces += orderedQty;

        // LÓGICA FINANCEIRA (Subtotal):
        // Se houver separação (pickedQty > 0), normalmente cobra-se o que foi separado.
        // Se ainda não houve separação, projeta-se o valor do pedido original.
        // No entanto, para consistência simples, usamos o que for maior ou o pedido, 
        // mas aqui vamos priorizar o PEDIDO para o valor projetado se nada foi separado,
        // e o SEPARADO se o processo já começou.
        // Simplificação: Se picked > 0, usa picked. Se não, usa ordered.
        const quantityForValue = pickedQty > 0 ? pickedQty : orderedQty;
        const itemValue = quantityForValue * item.unitPrice;
        
        newSubtotalValue += itemValue;

        return {
            ...item,
            totalItemValue: itemValue 
        };
    });

    // 3. Recalcula Desconto
    let discountAmount = 0;
    if (currentOrder.discount_type === 'percentage') {
        discountAmount = newSubtotalValue * (currentOrder.discount_value / 100);
    } else if (currentOrder.discount_type === 'fixed') {
        discountAmount = currentOrder.discount_value;
    }

    const newFinalValue = Math.max(0, newSubtotalValue - discountAmount);

    // 4. Atualiza o Pedido no Banco
    const { data: updatedRow, error } = await supabase
        .from('orders')
        .update({ 
            items: processedItems,
            total_pieces: newTotalPieces,
            subtotal_value: newSubtotalValue,
            final_total_value: newFinalValue
        })
        .eq('id', orderId)
        .select()
        .single();
    
    if (error) throw error;

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
            
            // Dados Antigos (Estado anterior no DB)
            const oldPicked = oldItem?.picked || {};
            const oldOrderedSizes = oldItem?.sizes || {};
            
            // Dados Novos (O que está sendo salvo agora)
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
                    // LÓGICA ESTOQUE LIVRE:
                    // Apenas calcula a diferença do que foi "separado" agora vs antes.
                    delta = qNewPicked - qOldPicked;
                } else {
                    // LÓGICA ESTOQUE TRAVADO:
                    // A reserva de estoque para itens travados é baseada no PEDIDO (qOrdered), não na separação.
                    // Isso garante que se o representante pediu 10, 10 estão reservados.
                    // Se o admin alterar o pedido para 12, baixa mais 2.
                    // Se alterar para 8, devolve 2.
                    // Se deletar o item (qNewOrdered = 0), devolve 10.
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

    // Retorna o objeto Order formatado corretamente (camelCase)
    let itemsList = updatedRow.items;
    if (itemsList && !Array.isArray(itemsList) && itemsList.list) itemsList = itemsList.list;

    return {
      ...updatedRow,
      id: updatedRow.id,
      displayId: updatedRow.display_id,
      romaneio: updatedRow.romaneio, // Recupera o campo romaneio
      isPartial: updatedRow.is_partial, // Recupera campo is_partial
      repId: updatedRow.rep_id,
      repName: updatedRow.rep_name,
      clientId: updatedRow.client_id,
      clientName: updatedRow.client_name,
      clientCity: updatedRow.client_city,
      clientState: updatedRow.client_state,
      createdAt: updatedRow.created_at,
      deliveryDate: updatedRow.delivery_date,
      paymentMethod: updatedRow.payment_method,
      status: updatedRow.status,
      items: Array.isArray(itemsList) ? itemsList : [], 
      totalPieces: updatedRow.total_pieces,
      subtotalValue: updatedRow.subtotal_value,
      discountType: updatedRow.discount_type,
      discountValue: updatedRow.discount_value,
      finalTotalValue: updatedRow.final_total_value
    } as Order;
};


// --- REP PRICES ---
export const getRepPrices = async (repId: string): Promise<RepPrice[]> => {
  const { data, error } = await supabase.from('rep_prices').select('*').eq('rep_id', repId);
  if (error) {
    console.warn("Tabela rep_prices pode não existir ainda ou erro de conexão", error);
    return [];
  }
  return data?.map(d => ({
    id: d.id,
    repId: d.rep_id,
    reference: d.reference,
    price: d.price
  })) || [];
};

export const upsertRepPrice = async (priceData: RepPrice): Promise<void> => {
  const { data: existing } = await supabase
    .from('rep_prices')
    .select('id')
    .eq('rep_id', priceData.repId)
    .eq('reference', priceData.reference)
    .single();

  if (existing) {
     const { error } = await supabase
      .from('rep_prices')
      .update({ price: priceData.price })
      .eq('id', existing.id);
     if (error) throw error;
  } else {
     const { error } = await supabase
      .from('rep_prices')
      .insert({ 
        rep_id: priceData.repId, 
        reference: priceData.reference, 
        price: priceData.price 
      });
     if (error) throw error;
  }
};

// --- CLIENTS ---
export const getClients = async (repId?: string): Promise<Client[]> => {
  let query = supabase.from('clients').select('*');
  
  if (repId) {
    query = query.eq('rep_id', repId);
  }
  
  const { data, error } = await query;
  if (error) { 
    console.error(error); 
    return []; 
  }
  
  return data?.map((row: any) => ({
    id: row.id,
    repId: row.rep_id,
    name: row.name,
    city: row.city,
    neighborhood: row.neighborhood,
    state: row.state
  })) as Client[] || [];
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

  const { error } = await supabase.from('clients').insert(dbClient);
  if (error) throw error;
};

export const updateClient = async (updatedClient: Client): Promise<void> => {
  const dbClient = {
    rep_id: updatedClient.repId,
    name: updatedClient.name,
    city: updatedClient.city,
    neighborhood: updatedClient.neighborhood,
    state: updatedClient.state
  };

  const { error } = await supabase
    .from('clients')
    .update(dbClient)
    .eq('id', updatedClient.id);
  if (error) throw error;
};

export const deleteClient = async (id: string): Promise<void> => {
  const { error } = await supabase.from('clients').delete().eq('id', id);
  if (error) throw error; 
};

// --- ORDERS ---
export const getOrders = async (): Promise<Order[]> => {
  const { data, error } = await supabase.from('orders').select('*');
  if (error) { 
    console.error("Erro ao buscar pedidos:", error); 
    return []; 
  }

  return data?.map((row: any) => {
    let items = row.items;
    if (items && !Array.isArray(items) && items.list) {
        items = items.list; 
    }

    return {
      ...row,
      id: row.id,
      displayId: row.display_id || row.displayId,
      romaneio: row.romaneio, // Mapeia o campo do banco
      isPartial: row.is_partial, // Mapeia is_partial
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
      subtotalValue: row.subtotal_value || row.subtotalValue || 0,
      discountType: row.discount_type || row.discountType || null,
      discountValue: row.discount_value || row.discountValue || 0,
      finalTotalValue: row.final_total_value || row.finalTotalValue || 0
    };
  }) as Order[] || [];
};

// --- VALIDATION HELPER ---
const checkRomaneioExists = async (romaneio: string, excludeOrderId?: string): Promise<boolean> => {
    if (!romaneio) return false;
    let query = supabase.from('orders').select('id').eq('romaneio', romaneio);
    if (excludeOrderId) {
        query = query.neq('id', excludeOrderId);
    }
    const { data, error } = await query;
    if (error) throw error;
    return data && data.length > 0;
};

export const addOrder = async (order: Omit<Order, 'displayId'>): Promise<Order | null> => {
  // 0. Validação de Duplicidade de Romaneio
  if (order.romaneio) {
      const exists = await checkRomaneioExists(order.romaneio);
      if (exists) {
          throw new Error(`O Romaneio nº ${order.romaneio} já existe em outro pedido. Verifique o número.`);
      }
  }

  // 1. Sequencial do ID
  let newSeq = 1000;
  try {
    const { data: seqData, error: seqError } = await supabase
      .from('app_config')
      .select('value')
      .eq('key', 'order_seq')
      .maybeSingle();
    
    if (!seqError && seqData) {
      const currentSeq = seqData.value;
      newSeq = currentSeq + 1;
      await supabase.from('app_config').upsert({ key: 'order_seq', value: newSeq });
    } else if (!seqError && !seqData) {
      await supabase.from('app_config').insert({ key: 'order_seq', value: 1001 });
      newSeq = 1001;
    } else {
       throw new Error("Table config missing");
    }
  } catch (err) {
    console.warn("Usando fallback de ID para pedido.");
    newSeq = Math.floor(Date.now() / 1000) % 100000;
  }

  const orderWithSeq = { ...order, displayId: newSeq };

  const dbOrder = {
    id: orderWithSeq.id,
    display_id: orderWithSeq.displayId,
    romaneio: orderWithSeq.romaneio || null, // Salva campo romaneio (pode ser nulo)
    is_partial: orderWithSeq.isPartial || false, // Salva se é parcial
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

  // 2. Salva o Pedido
  const { error } = await supabase.from('orders').insert(dbOrder);
  
  if (error) {
    console.error("Erro ao criar pedido (Supabase):", error);
    throw new Error(error.message || "Erro desconhecido ao salvar no banco");
  }

  // 3. Atualiza o Estoque (SOMENTE para enforceStock=true)
  try {
      await updateStockOnOrderCreation(orderWithSeq.items);
  } catch (err) {
      console.error("Pedido salvo, mas erro ao atualizar estoque:", err);
  }

  return orderWithSeq as Order;
};

// NOVO: Atualiza apenas o Romaneio
export const updateOrderRomaneio = async (id: string, romaneio: string): Promise<void> => {
  // Validação de Duplicidade
  const exists = await checkRomaneioExists(romaneio, id);
  if (exists) {
      throw new Error(`O Romaneio nº ${romaneio} já existe em outro pedido.`);
  }

  const { error } = await supabase.from('orders').update({ romaneio }).eq('id', id);
  if (error) throw error;
};

export const updateOrderStatus = async (id: string, status: 'open' | 'printed'): Promise<void> => {
  const { error } = await supabase.from('orders').update({ status }).eq('id', id);
  if (error) console.error(error);
};

export const initializeStorage = () => {
  console.log("Serviço de armazenamento Supabase inicializado com mapeamento de colunas.");
};
