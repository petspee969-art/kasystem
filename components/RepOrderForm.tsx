
import React, { useState, useEffect } from 'react';
import { User, ProductDef, OrderItem, Client, SizeGridType, SIZE_GRIDS } from '../types';
import { getProducts, getClients, addOrder, getRepPrices, generateUUID } from '../services/storageService';
import { Plus, Trash, Save, Edit2, Loader2, ChevronDown, Check, DollarSign, Calculator, Tag, AlertTriangle, Lock } from 'lucide-react';

interface Props {
  user: User;
  onOrderCreated: () => void;
}

const RepOrderForm: React.FC<Props> = ({ user, onOrderCreated }) => {
  const [products, setProducts] = useState<ProductDef[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [priceMap, setPriceMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  // Form State
  const [selectedClientId, setSelectedClientId] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [romaneio, setRomaneio] = useState(''); 
  
  // Descontos
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed' | ''>('');
  const [discountValue, setDiscountValue] = useState<string>('');

  // Item Entry State
  const [currentRef, setCurrentRef] = useState('');
  const [currentColor, setCurrentColor] = useState('');
  const [currentGrid, setCurrentGrid] = useState<SizeGridType>(SizeGridType.ADULT);
  const [manualUnitPrice, setManualUnitPrice] = useState<string>(''); 
  
  // Dados do produto selecionado (para validação de estoque)
  const [selectedProductData, setSelectedProductData] = useState<ProductDef | null>(null);

  // Editing State
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  // Order Items
  const [items, setItems] = useState<OrderItem[]>([]);

  // Helpers
  const [availableColors, setAvailableColors] = useState<string[]>([]);
  const [quickSizes, setQuickSizes] = useState<{[key: string]: string}>({});

  useEffect(() => {
    const loadData = async () => {
        setLoading(true);
        try {
          const [p, c, prices] = await Promise.all([
            getProducts(), 
            getClients(user.id),
            getRepPrices(user.id)
          ]);
          setProducts(p);
          setClients(c);
          
          // Mapeia preços para busca rápida
          // Normaliza a chave para Uppercase e Trim para garantir o match perfeito
          const pm: Record<string, number> = {};
          prices.forEach(pr => {
              if (pr.reference) {
                  pm[pr.reference.trim().toUpperCase()] = pr.price;
              }
          });
          setPriceMap(pm);
        } catch (e) {
          console.error("Erro ao carregar dados iniciais", e);
        } finally {
          setLoading(false);
        }
    };
    loadData();
  }, [user.id]);

  // Quando a referência muda, busca cores e PREÇO da tabela
  useEffect(() => {
    if (currentRef) {
      const searchRef = currentRef.trim().toUpperCase();

      const colors = products
        .filter(p => p.reference === searchRef)
        .map(p => p.color);
      setAvailableColors([...new Set(colors)]);
      
      // Tenta encontrar o produto para setar o grid corretamente se não estivermos editando
      if (editingIndex === null) {
        const prod = products.find(p => p.reference === searchRef);
        if (prod) setCurrentGrid(prod.gridType);
        
        // --- LÓGICA DE PREÇO UNITÁRIO ---
        // Busca EXCLUSIVAMENTE na tabela de preços do representante (priceMap).
        // O valor base (prod.basePrice) é IGNORADO aqui para evitar confusão.
        
        const repPrice = priceMap[searchRef];
        
        if (repPrice !== undefined && repPrice > 0) {
            setManualUnitPrice(repPrice.toFixed(2));
        } else {
            // Se não houver preço configurado pelo Representante, o campo fica em branco
            // para forçar a digitação, garantindo que não se use um valor "padrão" errado.
            setManualUnitPrice('');
        }
      }
    } else {
      setAvailableColors([]);
      if (editingIndex === null) setManualUnitPrice('');
    }
  }, [currentRef, products, editingIndex, priceMap]);

  // Atualiza o produto selecionado completo para acessar o ESTOQUE
  useEffect(() => {
      if (currentRef && currentColor) {
          const searchRef = currentRef.trim().toUpperCase();
          const searchColor = currentColor.trim().toUpperCase();
          const prod = products.find(p => p.reference === searchRef && p.color === searchColor);
          setSelectedProductData(prod || null);
      } else {
          setSelectedProductData(null);
      }
  }, [currentRef, currentColor, products]);

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(''); // Limpa erros anteriores
    if (!currentRef || !currentColor) return;

    // 1. Processa a entrada atual do formulário
    const inputSizes: {[key: string]: number} = {};
    let inputTotal = 0;

    Object.entries(quickSizes).forEach(([size, qtyStr]) => {
      const q = parseInt(qtyStr as string);
      if (q > 0) {
        inputSizes[size] = q;
        inputTotal += q;
      }
    });

    if (inputTotal === 0) {
        setErrorMsg('Adicione quantidade em pelo menos um tamanho.');
        return;
    }

    // 2. Verifica se este item (Ref + Cor) JÁ EXISTE no pedido
    // (Apenas se não estivermos no modo de edição direta de uma linha)
    const duplicateIndex = items.findIndex(item => 
        item.reference === currentRef.toUpperCase().trim() && 
        item.color === currentColor.toUpperCase().trim()
    );

    // 3. Define as quantidades FINAIS (Fusão ou Novo)
    const finalSizes: {[key: string]: number} = {};
    
    if (duplicateIndex !== -1 && editingIndex === null) {
        // CASO FUSÃO: O item já existe, vamos somar as quantidades
        const existingItem = items[duplicateIndex];
        
        // Copia quantidades existentes
        Object.assign(finalSizes, existingItem.sizes);
        
        // Soma as novas quantidades
        Object.entries(inputSizes).forEach(([size, qty]) => {
            finalSizes[size] = (finalSizes[size] || 0) + qty;
        });
    } else {
        // CASO NOVO ou EDITANDO: Usa apenas o input atual
        Object.assign(finalSizes, inputSizes);
    }

    // 4. Validação de Estoque (Baseada nas quantidades FINAIS acumuladas)
    let stockError = '';
    
    Object.entries(finalSizes).forEach(([size, totalQtyForSize]) => {
        if (selectedProductData && selectedProductData.enforceStock) {
            const availableInStock = selectedProductData.stock[size] || 0;
            
            if (totalQtyForSize > availableInStock) {
                stockError = `Estoque insuficiente para o tamanho ${size}. (Solicitado Total: ${totalQtyForSize}, Disponível: ${availableInStock}).`;
            }
        }
    });

    if (stockError) {
        setErrorMsg(stockError);
        return;
    }

    // 5. Cria o objeto do item atualizado
    const finalUnitPrice = parseFloat(manualUnitPrice) || 0;
    const finalTotalQty = Object.values(finalSizes).reduce((a, b) => a + b, 0);

    const newItem: OrderItem = {
      reference: currentRef.toUpperCase().trim(),
      color: currentColor.toUpperCase().trim(),
      gridType: currentGrid,
      sizes: finalSizes,
      totalQty: finalTotalQty,
      unitPrice: finalUnitPrice,
      totalItemValue: finalTotalQty * finalUnitPrice
    };

    // 6. Atualiza o Estado (Lista de Itens)
    const newItemsList = [...items];

    if (editingIndex !== null) {
        // Estava editando: substitui na posição original
        newItemsList[editingIndex] = newItem;
        setEditingIndex(null);
        setCurrentRef(''); // Limpa Ref se terminou edição
        setManualUnitPrice('');
    } else if (duplicateIndex !== -1) {
        // Encontrou duplicata: substitui na posição da duplicata (Fusão)
        newItemsList[duplicateIndex] = newItem;
        // Não limpa Ref/Preço para facilitar adição rápida, apenas avisa se quiser
    } else {
        // Novo item: adiciona ao final
        newItemsList.push(newItem);
    }

    setItems(newItemsList);
    
    // Limpeza padrão do formulário de entrada
    setQuickSizes({});
    setCurrentColor('');
    // Mantém a Referência e o Preço para facilitar digitação de várias cores do mesmo modelo
  };

  const startEditItem = (index: number) => {
    const item = items[index];
    setEditingIndex(index);
    setCurrentRef(item.reference);
    setCurrentColor(item.color);
    setCurrentGrid(item.gridType);
    setManualUnitPrice(item.unitPrice.toString());
    
    const sizeStrings: {[key: string]: string} = {};
    Object.entries(item.sizes).forEach(([k, v]) => {
      sizeStrings[k] = v.toString();
    });
    setQuickSizes(sizeStrings);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const removeItem = (index: number) => {
    if (confirm('Remover este item?')) {
      const newItems = [...items];
      newItems.splice(index, 1);
      setItems(newItems);
      if (editingIndex === index) {
        setEditingIndex(null);
        setQuickSizes({});
        setCurrentColor('');
        setCurrentRef('');
        setManualUnitPrice('');
      }
    }
  };

  // --- CÁLCULOS TOTAIS E DESCONTO ---
  const subtotalValue = items.reduce((acc, item) => acc + item.totalItemValue, 0);
  
  let discountAmount = 0;
  const distValNum = parseFloat(discountValue) || 0;
  
  if (discountType === 'percentage') {
    discountAmount = subtotalValue * (distValNum / 100);
  } else if (discountType === 'fixed') {
    discountAmount = distValNum;
  }
  
  let finalTotalValue = subtotalValue - discountAmount;
  if (finalTotalValue < 0) finalTotalValue = 0;

  const handleSaveOrder = async () => {
    if (!selectedClientId || items.length === 0) {
        setErrorMsg('Selecione um cliente e adicione pelo menos um item.');
        return;
    }

    const client = clients.find(c => c.id === selectedClientId);
    if (!client) return;

    setLoading(true);
    setErrorMsg('');

    try {
        await addOrder({
            id: generateUUID(),
            repId: user.id,
            repName: user.name,
            clientId: client.id,
            clientName: client.name,
            clientCity: client.city,
            clientState: client.state,
            createdAt: new Date().toISOString(),
            deliveryDate,
            paymentMethod,
            romaneio: romaneio, 
            status: 'open',
            items,
            totalPieces: items.reduce((acc, i) => acc + i.totalQty, 0),
            subtotalValue,
            discountType: discountType || null,
            discountValue: distValNum,
            finalTotalValue
        });
        // Sucesso
        onOrderCreated();
    } catch (error: any) {
        console.error("Erro ao salvar pedido:", error);
        setErrorMsg(`Não foi possível salvar o pedido. Detalhes: ${error.message || error.toString()}`);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
        setLoading(false);
    }
  };

  const uniqueRefs = [...new Set(products.map(p => p.reference))];

  if (loading && products.length === 0) {
      return <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-blue-600" /></div>
  }

  return (
    <div className="bg-white p-4 md:p-6 rounded-lg shadow-sm">
      <h2 className="text-xl font-bold mb-4 text-gray-800 flex items-center justify-between">
        <span>{editingIndex !== null ? 'Editando Item' : 'Novo Pedido'}</span>
        {editingIndex !== null && <span className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded">Modo Edição</span>}
      </h2>

      {errorMsg && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 p-3 rounded flex items-start">
            <AlertTriangle className="w-5 h-5 mr-2 flex-shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
        </div>
      )}

      {/* HEADER: Client Info */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6 pb-6 border-b">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Cliente</label>
          <div className="relative">
            <select 
                className="w-full border rounded p-2 pr-8 appearance-none bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                value={selectedClientId}
                onChange={(e) => setSelectedClientId(e.target.value)}
            >
                <option value="">Selecione...</option>
                {clients.map(c => (
                <option key={c.id} value={c.id}>{c.name} - {c.city}</option>
                ))}
            </select>
            <ChevronDown className="absolute right-3 top-3 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>
        </div>
        
        {/* Nova grid de 3 colunas para incluir o Romaneio */}
        <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Data Entrega</label>
              <input 
                  type="date" 
                  className="w-full border rounded p-2 focus:ring-2 focus:ring-blue-500 outline-none"
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pagamento</label>
              <input 
                  type="text" 
                  className="w-full border rounded p-2 focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Ex: 30/60 dias"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nº Romaneio</label>
              <input 
                  type="text" 
                  className="w-full border rounded p-2 focus:ring-2 focus:ring-blue-500 outline-none font-bold"
                  placeholder="Opcional"
                  value={romaneio}
                  onChange={(e) => setRomaneio(e.target.value)}
              />
            </div>
        </div>
      </div>

      {/* ÁREA DE ENTRADA DE ITENS */}
      <div className={`p-3 md:p-4 rounded-lg mb-6 border transition-colors ${editingIndex !== null ? 'bg-orange-50 border-orange-200' : 'bg-blue-50 border-blue-100'}`}>
        <form onSubmit={handleAddItem} className="flex flex-col gap-3">
          
          <div className="flex flex-col md:flex-row gap-3">
            {/* Reference */}
            <div className="flex-1">
                <label className="block text-xs font-bold text-gray-700 mb-1">Referência</label>
                <input 
                list="refs" 
                className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500 uppercase h-10"
                value={currentRef}
                onChange={(e) => setCurrentRef(e.target.value.toUpperCase())}
                placeholder="REF..."
                required
                />
                <datalist id="refs">
                {uniqueRefs.map(r => <option key={r} value={r} />)}
                </datalist>
            </div>

            {/* PREÇO UNITÁRIO (CARREGADO DA TABELA OU EDITÁVEL) */}
             <div className="w-full md:w-32">
                <label className="block text-xs font-bold text-gray-700 mb-1">Preço Unit. (R$)</label>
                <div className="relative">
                   <span className="absolute left-2 top-2 text-gray-500 text-sm">R$</span>
                   <input 
                      type="number"
                      step="0.01"
                      min="0"
                      className="w-full border p-2 pl-8 rounded focus:ring-2 focus:ring-blue-500 h-10 font-bold text-gray-800"
                      value={manualUnitPrice}
                      onChange={(e) => setManualUnitPrice(e.target.value)}
                      placeholder="0.00"
                   />
                </div>
            </div>

            {/* Color */}
            <div className="flex-1">
                <label className="block text-xs font-bold text-gray-700 mb-1">Cor</label>
                <input 
                list="colors"
                className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500 uppercase h-10"
                value={currentColor}
                onChange={(e) => setCurrentColor(e.target.value.toUpperCase())}
                placeholder="COR..."
                required
                />
                <datalist id="colors">
                {availableColors.map(c => <option key={c} value={c} />)}
                </datalist>
            </div>
          </div>

          {/* WARNING ABOUT STOCK MODE */}
          {selectedProductData && (
              <div className="flex items-center text-xs gap-2 mb-1">
                  {selectedProductData.enforceStock ? (
                      <span className="text-red-600 bg-red-50 px-2 py-0.5 rounded flex items-center font-bold">
                          <Lock className="w-3 h-3 mr-1" /> Venda Limitada ao Estoque
                      </span>
                  ) : (
                      <span className="text-green-600 bg-green-50 px-2 py-0.5 rounded flex items-center font-bold">
                          <Check className="w-3 h-3 mr-1" /> Venda Livre
                      </span>
                  )}
              </div>
          )}

          {/* Size Grid com Estoque */}
          <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Grade de Quantidades</label>
              <div className="bg-white p-2 rounded border border-gray-200 shadow-sm overflow-x-auto">
                <div className="flex gap-2 min-w-max">
                    {SIZE_GRIDS[currentGrid]?.map(size => {
                        const stock = selectedProductData?.stock?.[size] || 0;
                        const hasStock = stock > 0;
                        const enforce = selectedProductData?.enforceStock;
                        
                        return (
                        <div key={size} className="w-16">
                            <label className="block text-[10px] text-center text-gray-500 font-bold mb-1">{size}</label>
                            <input 
                                type="number"
                                min="0"
                                inputMode="numeric"
                                className={`w-full border text-center p-2 rounded text-base focus:bg-blue-50 outline-none 
                                    ${enforce && !hasStock ? 'bg-gray-100 text-gray-400' : ''}`}
                                value={quickSizes[size] || ''}
                                onChange={(e) => setQuickSizes({...quickSizes, [size]: e.target.value})}
                                onKeyDown={(e) => {
                                    if(e.key === 'Enter') handleAddItem(e);
                                }}
                            />
                            {/* Stock Indicator */}
                            {selectedProductData && (
                                <div className={`text-[10px] text-center mt-1 font-bold ${hasStock ? 'text-green-600' : 'text-red-500'}`}>
                                    Est: {stock}
                                </div>
                            )}
                        </div>
                        );
                    })}
                </div>
              </div>
          </div>

          <div className="flex gap-2 mt-2">
            <button 
                type="submit" 
                className={`flex-1 ${editingIndex !== null ? 'bg-orange-500 hover:bg-orange-600' : 'bg-blue-600 hover:bg-blue-700'} text-white p-3 rounded flex items-center justify-center font-bold shadow-sm active:scale-95 transition`}
            >
                {editingIndex !== null ? (
                <> <Save className="w-5 h-5 mr-2" /> Atualizar Item </>
                ) : (
                <> <Plus className="w-5 h-5 mr-2" /> Adicionar Item </>
                )}
            </button>
            
            {editingIndex !== null && (
                <button 
                type="button" 
                onClick={() => {
                    setEditingIndex(null);
                    setQuickSizes({});
                    setCurrentColor('');
                    setCurrentRef('');
                    setManualUnitPrice('');
                }}
                className="bg-gray-400 text-white p-3 rounded font-bold hover:bg-gray-500 w-24"
                >
                Cancelar
                </button>
            )}
          </div>
          
           <div className="flex gap-4 justify-center mt-1">
             <label className="flex items-center text-xs text-gray-600 cursor-pointer p-1">
               <input type="radio" name="gridType" checked={currentGrid === SizeGridType.ADULT} onChange={() => setCurrentGrid(SizeGridType.ADULT)} className="mr-1" /> Normal
             </label>
             <label className="flex items-center text-xs text-gray-600 cursor-pointer p-1">
               <input type="radio" name="gridType" checked={currentGrid === SizeGridType.PLUS} onChange={() => setCurrentGrid(SizeGridType.PLUS)} className="mr-1" /> Plus Size
             </label>
          </div>
        </form>
      </div>

      {/* ITEMS LIST */}
      {items.length > 0 && (
        <div className="mb-24">
            <h3 className="font-bold text-gray-700 mb-2 px-1">Itens Adicionados ({items.length})</h3>
            
            {/* Desktop Table View - COM COLUNA DE PREÇO */}
            <div className="hidden md:block overflow-x-auto border rounded-lg mb-4">
              <table className="w-full text-left bg-white text-sm">
                <thead className="bg-gray-100 text-gray-700 font-bold border-b">
                  <tr>
                    <th className="p-3">Ref / Cor</th>
                    <th className="p-3 text-center">Grade</th>
                    <th className="p-3 text-right">Qtd</th>
                    <th className="p-3 text-right">Preço Unit.</th>
                    <th className="p-3 text-right">Total</th>
                    <th className="p-3 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {items.map((item, idx) => (
                    <tr key={idx} className={`hover:bg-gray-50 ${editingIndex === idx ? 'bg-orange-50' : ''}`}>
                      <td className="p-3">
                        <span className="block font-bold text-gray-800">{item.reference}</span>
                        <span className="text-xs uppercase text-gray-500">{item.color}</span>
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex justify-center gap-1 flex-wrap">
                          {Object.entries(item.sizes).map(([size, qty]) => (
                             <span key={size} className="bg-gray-100 px-1.5 py-0.5 rounded text-xs border border-gray-200">
                                <b className="text-gray-500">{size}:</b> {qty}
                             </span>
                          ))}
                        </div>
                      </td>
                      <td className="p-3 text-right font-bold text-gray-700">{item.totalQty}</td>
                      <td className="p-3 text-right text-gray-600">R$ {item.unitPrice.toFixed(2)}</td>
                      <td className="p-3 text-right font-bold text-green-700">R$ {item.totalItemValue.toFixed(2)}</td>
                      <td className="p-3 text-center">
                         <div className="flex justify-center gap-2">
                             <button onClick={() => startEditItem(idx)} className="text-blue-600 hover:text-blue-800 p-1" title="Editar">
                                <Edit2 className="w-4 h-4" />
                             </button>
                             <button onClick={() => removeItem(idx)} className="text-red-500 hover:text-red-700 p-1" title="Remover">
                                <Trash className="w-4 h-4" />
                             </button>
                         </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden space-y-3">
                {items.map((item, idx) => (
                    <div key={idx} className={`bg-white border rounded-lg p-3 shadow-sm ${editingIndex === idx ? 'border-orange-400 ring-1 ring-orange-200' : 'border-gray-200'}`}>
                        <div className="flex justify-between items-start mb-2 border-b pb-2">
                            <div>
                                <span className="block font-bold text-gray-800 text-lg">{item.reference}</span>
                                <span className="block text-xs text-gray-500 uppercase">{item.color}</span>
                            </div>
                            <div className="text-right">
                                <span className="block font-bold text-blue-600 text-lg">{item.totalQty} pçs</span>
                                <span className="block text-xs text-gray-500">
                                   Unit: R$ {item.unitPrice.toFixed(2)} | Total: R$ {item.totalItemValue.toFixed(2)}
                                </span>
                            </div>
                        </div>
                        
                        <div className="grid grid-cols-4 gap-2 text-xs mb-3">
                            {Object.entries(item.sizes).map(([size, qty]) => (
                                <div key={size} className="bg-gray-50 p-1 rounded text-center border border-gray-100">
                                    <span className="block text-gray-400 font-bold text-[10px]">{size}</span>
                                    <span className="block font-bold text-gray-800">{qty}</span>
                                </div>
                            ))}
                        </div>

                        <div className="flex gap-2">
                             <button onClick={() => startEditItem(idx)} className="flex-1 bg-blue-50 text-blue-700 py-2 rounded text-sm font-medium flex items-center justify-center">
                                <Edit2 className="w-3 h-3 mr-1" /> Editar
                             </button>
                             <button onClick={() => removeItem(idx)} className="flex-1 bg-red-50 text-red-700 py-2 rounded text-sm font-medium flex items-center justify-center">
                                <Trash className="w-3 h-3 mr-1" /> Remover
                             </button>
                        </div>
                    </div>
                ))}
            </div>

            {/* FINANCIAL SUMMARY & DISCOUNT */}
            <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-xl p-4">
              <h4 className="font-bold text-gray-800 flex items-center mb-4">
                 <Calculator className="w-4 h-4 mr-2" /> Resumo Financeiro
              </h4>
              
              <div className="flex justify-between mb-2 text-gray-600">
                  <span>Subtotal:</span>
                  <span className="font-medium">R$ {subtotalValue.toFixed(2)}</span>
              </div>

              {/* OPÇÃO DE DESCONTO */}
              <div className="mb-4 pt-4 border-t border-yellow-200">
                 <label className="block text-xs font-bold text-gray-700 mb-2 flex items-center">
                    <Tag className="w-3 h-3 mr-1" /> Aplicar Desconto
                 </label>
                 <div className="flex gap-2">
                    <select 
                      className="border rounded p-2 text-sm bg-white flex-1"
                      value={discountType}
                      onChange={(e) => setDiscountType(e.target.value as any)}
                    >
                        <option value="">Sem Desconto</option>
                        <option value="percentage">Porcentagem (%)</option>
                        <option value="fixed">Valor Fixo (R$)</option>
                    </select>
                    <input 
                      type="number"
                      placeholder={discountType === 'percentage' ? "%" : "R$"}
                      className="border rounded p-2 text-sm w-32"
                      value={discountValue}
                      onChange={(e) => setDiscountValue(e.target.value)}
                      disabled={!discountType}
                    />
                 </div>
                 {discountAmount > 0 && (
                     <div className="text-right text-red-600 text-sm mt-1 font-medium">
                         - R$ {discountAmount.toFixed(2)}
                     </div>
                 )}
              </div>

              <div className="pt-3 border-t-2 border-yellow-300 flex justify-between items-center">
                  <span className="text-lg font-bold text-gray-800 uppercase">Total Final</span>
                  <span className="text-3xl font-bold text-green-700">R$ {finalTotalValue.toFixed(2)}</span>
              </div>
            </div>
        </div>
      )}

      {/* Footer Save Button */}
      <div className="fixed bottom-0 left-0 w-full p-4 bg-white border-t md:static md:bg-transparent md:border-0 md:p-0 md:mt-6 z-10 flex justify-end shadow-up md:shadow-none">
        <button 
          onClick={handleSaveOrder}
          disabled={items.length === 0 || !selectedClientId || editingIndex !== null || loading}
          className="w-full md:w-auto bg-green-600 text-white px-8 py-3 rounded-lg hover:bg-green-700 shadow-md flex items-center justify-center font-bold text-lg disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {loading ? <Loader2 className="animate-spin w-5 h-5 mr-2" /> : <Check className="w-5 h-5 mr-2" />}
          {editingIndex !== null ? 'Salve a Edição' : `Finalizar (R$ ${finalTotalValue.toFixed(2)})`}
        </button>
      </div>
    </div>
  );
};

export default RepOrderForm;
