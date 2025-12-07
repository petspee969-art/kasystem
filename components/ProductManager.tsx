
import React, { useState, useEffect, useMemo } from 'react';
import { ProductDef, SizeGridType, SIZE_GRIDS } from '../types';
import { getProducts, addProduct, deleteProduct, updateProductInventory, generateUUID } from '../services/storageService';
import { Trash, Plus, Loader2, Package, Edit2, X, Save, ArrowDownToLine, Check, Layers, Ruler } from 'lucide-react';

const ProductManager: React.FC = () => {
  const [products, setProducts] = useState<ProductDef[]>([]);
  const [newRef, setNewRef] = useState('');
  const [newColor, setNewColor] = useState('');
  const [newGrid, setNewGrid] = useState<SizeGridType>(SizeGridType.ADULT);
  const [newBasePrice, setNewBasePrice] = useState(''); 
  
  // Novos estados para cadastro de estoque
  const [initialStock, setInitialStock] = useState<{[key: string]: string}>({});
  const [enforceStock, setEnforceStock] = useState(false);

  // Estados para EDIÇÃO
  const [editingProduct, setEditingProduct] = useState<ProductDef | null>(null);
  const [editStockValues, setEditStockValues] = useState<{[key: string]: string}>({});
  const [editEnforceStock, setEditEnforceStock] = useState(false);
  const [editBasePrice, setEditBasePrice] = useState(''); 

  // --- Estados para ENTRADA DE ESTOQUE (Recebimento) ---
  const [showStockEntry, setShowStockEntry] = useState(false);
  
  // Seleção de Produto para Entrada
  const [entryRef, setEntryRef] = useState('');
  const [entryColor, setEntryColor] = useState('');
  
  // Modo de Entrada: 'grid' = Adiciona em todos os tamanhos, 'size' = Adiciona em um tamanho específico
  const [entryMode, setEntryMode] = useState<'size' | 'grid'>('grid'); 
  const [entrySize, setEntrySize] = useState('');
  const [entryQty, setEntryQty] = useState(''); // Quantidade a adicionar

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const data = await getProducts();
    setProducts(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Limpa os inputs de estoque quando muda a grade (Cadastro)
  useEffect(() => {
    setInitialStock({});
  }, [newGrid]);

  // Limpa filtros do modal ao fechar ou abrir
  useEffect(() => {
      if (!showStockEntry) {
          setEntryRef('');
          setEntryColor('');
          setEntrySize('');
          setEntryQty('');
          setEntryMode('grid');
      }
  }, [showStockEntry]);

  // Helpers para o Modal de Entrada (Derived State)
  const uniqueRefs = useMemo(() => {
      return Array.from(new Set(products.map(p => p.reference))).sort();
  }, [products]);

  const availableColorsForRef = useMemo(() => {
      if (!entryRef) return [];
      return products
        .filter(p => p.reference === entryRef)
        .map(p => p.color)
        .sort();
  }, [products, entryRef]);

  const activeEntryProduct = useMemo(() => {
      if (!entryRef || !entryColor) return null;
      return products.find(p => p.reference === entryRef && p.color === entryColor) || null;
  }, [products, entryRef, entryColor]);


  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!newRef || !newColor) {
        setError('Preencha referência e cor.');
        return;
    }

    // Uniqueness Check
    const exists = products.some(p => 
        p.reference.toUpperCase() === newRef.toUpperCase() && 
        p.color.toUpperCase() === newColor.toUpperCase()
    );

    if (exists) {
        setError('Esta combinação de Referência e Cor já existe no catálogo.');
        return;
    }

    // Converte inputs de estoque para números
    const finalStock: {[key: string]: number} = {};
    SIZE_GRIDS[newGrid].forEach(size => {
        const val = parseInt(initialStock[size] || '0');
        if (val > 0) finalStock[size] = val;
    });

    try {
        await addProduct({
            id: generateUUID(),
            reference: newRef.toUpperCase(),
            color: newColor.toUpperCase(),
            gridType: newGrid,
            stock: finalStock,
            enforceStock: enforceStock,
            basePrice: parseFloat(newBasePrice) || 0
        });

        await fetchData();
        // Não limpa newRef para agilizar cadastro de cores
        setNewColor('');
        setInitialStock({});
        setNewBasePrice('');
    } catch (e: any) {
        setError('Erro: ' + e.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Tem certeza que deseja remover este produto do catálogo?')) {
        await deleteProduct(id);
        await fetchData();
    }
  };

  // --- Lógica de Edição ---
  const handleEditClick = (product: ProductDef) => {
    setEditingProduct(product);
    setEditEnforceStock(product.enforceStock);
    setEditBasePrice(product.basePrice ? product.basePrice.toString() : '');
    
    // Converte o estoque atual (number) para string para os inputs
    const stockStrings: {[key: string]: string} = {};
    if (product.stock) {
        Object.entries(product.stock).forEach(([key, val]) => {
            stockStrings[key] = val.toString();
        });
    }
    setEditStockValues(stockStrings);
  };

  const handleSaveEdit = async () => {
    if (!editingProduct) return;
    setLoading(true);
    
    try {
        const finalStock: {[key: string]: number} = {};
        SIZE_GRIDS[editingProduct.gridType].forEach(size => {
            const val = parseInt(editStockValues[size] || '0');
            if (!isNaN(val)) finalStock[size] = val;
        });

        const finalBasePrice = parseFloat(editBasePrice) || 0;

        await updateProductInventory(editingProduct.id, finalStock, editEnforceStock, finalBasePrice);
        
        await fetchData();
        setEditingProduct(null);
    } catch (e: any) {
        alert("Erro ao atualizar estoque/preço: " + e.message);
    } finally {
        setLoading(false);
    }
  };

  // --- Lógica de Entrada de Estoque (Recebimento) ---
  const handleSaveStockEntry = async () => {
      if (!activeEntryProduct) return;
      if (!entryQty) {
          alert("Informe a quantidade.");
          return;
      }
      
      const qtyToAdd = parseInt(entryQty);
      if (isNaN(qtyToAdd) || qtyToAdd <= 0) {
          alert("Quantidade inválida.");
          return;
      }

      if (entryMode === 'size' && !entrySize) {
          alert("Selecione o tamanho para adicionar.");
          return;
      }

      setLoading(true);
      try {
          const currentStock = { ...activeEntryProduct.stock };
          
          if (entryMode === 'grid') {
              // Lógica de GRADE: Adiciona a quantidade EM CADA tamanho da grade
              const sizes = SIZE_GRIDS[activeEntryProduct.gridType];
              sizes.forEach(size => {
                  const currentQty = currentStock[size] || 0;
                  currentStock[size] = currentQty + qtyToAdd;
              });
          } else {
              // Lógica de TAMANHO ÚNICO: Adiciona apenas no tamanho selecionado
              const currentQty = currentStock[entrySize] || 0;
              currentStock[entrySize] = currentQty + qtyToAdd;
          }

          // Atualiza no banco
          await updateProductInventory(
              activeEntryProduct.id, 
              currentStock, 
              activeEntryProduct.enforceStock, 
              activeEntryProduct.basePrice
          );
          
          await fetchData();
          
          // Reset parcial para permitir adicionar mais do mesmo produto rapidamente
          setEntryQty('');
          
          if (entryMode === 'grid') {
              alert(`Sucesso! Adicionado +${qtyToAdd} peças em TODOS os tamanhos da grade de ${activeEntryProduct.reference} - ${activeEntryProduct.color}.`);
          } else {
              alert(`Sucesso! Adicionado +${qtyToAdd} peças ao tamanho ${entrySize} de ${activeEntryProduct.reference} - ${activeEntryProduct.color}.`);
          }

      } catch (e: any) {
          alert("Erro ao dar entrada no estoque: " + e.message);
      } finally {
          setLoading(false);
      }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold text-gray-800">Catálogo de Produtos e Estoque</h2>
            {loading && <Loader2 className="animate-spin text-blue-600" />}
        </div>
        {/* Botão Principal de Entrada */}
        <button 
            onClick={() => setShowStockEntry(true)}
            className="bg-green-600 text-white px-4 py-2 rounded-lg flex items-center shadow hover:bg-green-700 transition"
        >
            <ArrowDownToLine className="w-5 h-5 mr-2" /> Incluir Peças (Chegada)
        </button>
      </div>
      
      {/* Formulário de Cadastro de Novo Produto */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <h3 className="text-lg font-semibold mb-4 text-gray-700">Cadastrar Novo Produto</h3>
        {error && <div className="mb-4 text-red-600 text-sm bg-red-50 p-2 rounded">{error}</div>}
        
        <form onSubmit={handleAdd} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Referência</label>
              <input 
                  type="text" 
                  className="w-full border p-2 rounded uppercase focus:ring-2 focus:ring-blue-500"
                  value={newRef}
                  onChange={(e) => setNewRef(e.target.value)}
                  placeholder="EX: CAMISA-01"
                  disabled={loading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cor</label>
              <input 
                  type="text" 
                  className="w-full border p-2 rounded uppercase focus:ring-2 focus:ring-blue-500"
                  value={newColor}
                  onChange={(e) => setNewColor(e.target.value)}
                  placeholder="EX: AZUL MARINHO"
                  disabled={loading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Grade</label>
              <select 
                  className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500"
                  value={newGrid}
                  onChange={(e) => setNewGrid(e.target.value as SizeGridType)}
                  disabled={loading}
              >
                  <option value={SizeGridType.ADULT}>Normal (P-GG)</option>
                  <option value={SizeGridType.PLUS}>Plus (G1-G3)</option>
              </select>
            </div>
             <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Preço Custo (Base)</label>
              <div className="relative">
                  <span className="absolute left-2 top-2 text-gray-500 text-sm">R$</span>
                  <input 
                      type="number" 
                      step="0.01"
                      className="w-full border p-2 pl-8 rounded focus:ring-2 focus:ring-blue-500"
                      value={newBasePrice}
                      onChange={(e) => setNewBasePrice(e.target.value)}
                      placeholder="0.00"
                      disabled={loading}
                  />
              </div>
            </div>
          </div>

          {/* Área de Estoque Inicial */}
          <div className="bg-gray-50 p-4 rounded border border-gray-200">
             <div className="flex justify-between items-center mb-2">
                 <h4 className="text-sm font-bold text-gray-700 flex items-center">
                    <Package className="w-4 h-4 mr-2" /> Estoque Inicial
                 </h4>
                 <label className="flex items-center text-sm cursor-pointer select-none">
                    <input 
                        type="checkbox" 
                        className="mr-2 w-4 h-4 text-blue-600 rounded"
                        checked={enforceStock}
                        onChange={(e) => setEnforceStock(e.target.checked)}
                    />
                    <span className={`${enforceStock ? 'text-red-600 font-bold' : 'text-gray-600'}`}>
                        Bloquear venda sem estoque
                    </span>
                 </label>
             </div>
             
             <div className="flex flex-wrap gap-4">
                {SIZE_GRIDS[newGrid].map(size => (
                    <div key={size} className="w-20">
                        <label className="block text-xs font-bold text-center mb-1 text-gray-500">{size}</label>
                        <input 
                            type="number"
                            min="0"
                            className="w-full border p-2 text-center rounded focus:ring-2 focus:ring-blue-500"
                            placeholder="0"
                            value={initialStock[size] || ''}
                            onChange={(e) => setInitialStock({...initialStock, [size]: e.target.value})}
                        />
                    </div>
                ))}
             </div>
             <p className="text-xs text-gray-400 mt-2">Deixe em branco ou 0 para iniciar sem estoque.</p>
          </div>

          <button 
            type="submit"
            disabled={loading}
            className="w-full md:w-auto bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 font-medium flex justify-center items-center"
          >
            <Plus className="w-5 h-5 mr-2" /> Adicionar Produto
          </button>
        </form>
      </div>

      {/* Lista de Produtos */}
      <div className="bg-white rounded-lg shadow overflow-hidden border border-gray-200">
        <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[900px]">
                <thead className="bg-gray-50 text-gray-600 font-bold uppercase text-sm">
                    <tr>
                        <th className="p-4">Referência</th>
                        <th className="p-4">Cor</th>
                        <th className="p-4">Grade</th>
                        <th className="p-4">Custo Base</th>
                        <th className="p-4 text-center">Controle Estoque</th>
                        <th className="p-4">Resumo Estoque</th>
                        <th className="p-4 text-right">Ações</th>
                    </tr>
                </thead>
                <tbody className="divide-y">
                    {products.length === 0 && !loading && (
                        <tr><td colSpan={7} className="p-6 text-center text-gray-400">Nenhum produto cadastrado.</td></tr>
                    )}
                    {products.sort((a,b) => a.reference.localeCompare(b.reference)).map(prod => {
                        const totalStock = prod.stock ? (Object.values(prod.stock) as number[]).reduce((a, b) => a + b, 0) : 0;
                        return (
                        <tr key={prod.id} className="hover:bg-gray-50">
                            <td className="p-4 font-bold">{prod.reference}</td>
                            <td className="p-4 uppercase">{prod.color}</td>
                            <td className="p-4 text-sm text-gray-500">
                                {prod.gridType === SizeGridType.ADULT && 'Normal'}
                                {prod.gridType === SizeGridType.PLUS && 'Plus Size'}
                            </td>
                            <td className="p-4 font-bold text-gray-700">
                                R$ {(prod.basePrice || 0).toFixed(2)}
                            </td>
                            <td className="p-4 text-center">
                                {prod.enforceStock ? (
                                    <span className="bg-red-100 text-red-700 px-2 py-1 rounded text-xs font-bold">Travado</span>
                                ) : (
                                    <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-bold">Livre</span>
                                )}
                            </td>
                            <td className="p-4 text-sm">
                                <span className={`font-bold ${totalStock < 0 ? 'text-red-600' : 'text-gray-700'}`}>{totalStock} peças</span>
                                <div className="text-xs mt-1 flex flex-wrap gap-1">
                                    {SIZE_GRIDS[prod.gridType].map((size) => {
                                        const qty = prod.stock?.[size] || 0;
                                        // Estilo condicional para facilitar a leitura
                                        let badgeStyle = "bg-gray-100 text-gray-400";
                                        if (qty > 0) badgeStyle = "bg-green-50 text-green-700 border border-green-200 font-bold";
                                        if (qty < 0) badgeStyle = "bg-red-50 text-red-600 border border-red-200 font-bold";
                                        
                                        return (
                                            <span key={size} className={`px-1.5 py-0.5 rounded ${badgeStyle}`}>
                                                {size}: {qty}
                                            </span>
                                        );
                                    })}
                                </div>
                            </td>
                            <td className="p-4 text-right flex justify-end gap-2">
                                <button 
                                    onClick={() => handleEditClick(prod)}
                                    className="text-blue-600 hover:bg-blue-50 p-2 rounded transition"
                                    title="Editar Estoque e Preço"
                                >
                                    <Edit2 className="w-5 h-5" />
                                </button>
                                <button 
                                    onClick={() => handleDelete(prod.id)}
                                    className="text-red-500 hover:bg-red-50 p-2 rounded transition"
                                    title="Remover Produto"
                                >
                                    <Trash className="w-5 h-5" />
                                </button>
                            </td>
                        </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
      </div>

      {/* MODAL DE ENTRADA DE ESTOQUE (NOVO FLUXO) */}
      {showStockEntry && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 animate-fade-in">
              <div className="bg-white rounded-lg w-full max-w-lg shadow-xl flex flex-col">
                   <div className="p-4 border-b flex justify-between items-center bg-green-50 rounded-t-lg">
                        <h3 className="font-bold text-lg text-green-900 flex items-center">
                            <ArrowDownToLine className="w-5 h-5 mr-2" /> Incluir Peças (Chegada)
                        </h3>
                        <button onClick={() => setShowStockEntry(false)} className="text-gray-500 hover:text-gray-700">
                            <X className="w-6 h-6" />
                        </button>
                    </div>
                    
                    <div className="p-6 space-y-5">
                        
                        {/* 1. SELEÇÃO DE PRODUTO (REF e COR separados) */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">1. Referência</label>
                                <select 
                                    className="w-full border p-2 rounded focus:ring-2 focus:ring-green-500"
                                    value={entryRef}
                                    onChange={(e) => {
                                        setEntryRef(e.target.value);
                                        setEntryColor(''); // Reset color on ref change
                                    }}
                                >
                                    <option value="">Selecione...</option>
                                    {uniqueRefs.map(ref => (
                                        <option key={ref} value={ref}>{ref}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">2. Cor</label>
                                <select 
                                    className="w-full border p-2 rounded focus:ring-2 focus:ring-green-500 disabled:bg-gray-100"
                                    value={entryColor}
                                    onChange={(e) => setEntryColor(e.target.value)}
                                    disabled={!entryRef}
                                >
                                    <option value="">Selecione...</option>
                                    {availableColorsForRef.map(color => (
                                        <option key={color} value={color}>{color}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* 2. MODO DE ENTRADA (GRADE ou TAMANHO) */}
                        {activeEntryProduct && (
                            <div className="bg-gray-50 p-4 rounded border border-gray-200">
                                <label className="block text-sm font-bold text-gray-700 mb-3">3. Como adicionar?</label>
                                <div className="flex gap-4 mb-4">
                                    <label className={`flex-1 flex items-center justify-center p-3 rounded cursor-pointer border transition-all ${entryMode === 'grid' ? 'bg-white border-green-500 shadow-sm ring-1 ring-green-500' : 'bg-gray-100 border-gray-200 hover:bg-gray-200'}`}>
                                        <input 
                                            type="radio" 
                                            className="sr-only" 
                                            name="entryMode" 
                                            checked={entryMode === 'grid'} 
                                            onChange={() => setEntryMode('grid')} 
                                        />
                                        <div className="text-center">
                                            <Layers className={`w-6 h-6 mx-auto mb-1 ${entryMode === 'grid' ? 'text-green-600' : 'text-gray-500'}`} />
                                            <span className={`text-xs font-bold ${entryMode === 'grid' ? 'text-green-800' : 'text-gray-600'}`}>
                                                Por Grade Completa
                                            </span>
                                        </div>
                                    </label>

                                    <label className={`flex-1 flex items-center justify-center p-3 rounded cursor-pointer border transition-all ${entryMode === 'size' ? 'bg-white border-blue-500 shadow-sm ring-1 ring-blue-500' : 'bg-gray-100 border-gray-200 hover:bg-gray-200'}`}>
                                        <input 
                                            type="radio" 
                                            className="sr-only" 
                                            name="entryMode" 
                                            checked={entryMode === 'size'} 
                                            onChange={() => setEntryMode('size')} 
                                        />
                                        <div className="text-center">
                                            <Ruler className={`w-6 h-6 mx-auto mb-1 ${entryMode === 'size' ? 'text-blue-600' : 'text-gray-500'}`} />
                                            <span className={`text-xs font-bold ${entryMode === 'size' ? 'text-blue-800' : 'text-gray-600'}`}>
                                                Por Tamanho Único
                                            </span>
                                        </div>
                                    </label>
                                </div>

                                {/* INPUTS DE ACORDO COM O MODO */}
                                <div className="flex items-end gap-3">
                                    {entryMode === 'size' && (
                                        <div className="flex-1">
                                            <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Tamanho</label>
                                            <select 
                                                className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500"
                                                value={entrySize}
                                                onChange={(e) => setEntrySize(e.target.value)}
                                            >
                                                <option value="">...</option>
                                                {SIZE_GRIDS[activeEntryProduct.gridType].map(s => (
                                                    <option key={s} value={s}>{s}</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}
                                    
                                    <div className="flex-1">
                                        <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">
                                            {entryMode === 'grid' ? 'Qtd por Tamanho' : 'Quantidade'}
                                        </label>
                                        <input 
                                            type="number"
                                            min="1"
                                            className="w-full border p-2 rounded focus:ring-2 focus:ring-green-500"
                                            value={entryQty}
                                            onChange={(e) => setEntryQty(e.target.value)}
                                            placeholder="Ex: 10"
                                            autoFocus
                                        />
                                    </div>
                                </div>

                                {/* RESUMO DA AÇÃO */}
                                {entryQty && parseInt(entryQty) > 0 && (
                                    <div className="mt-4 p-2 bg-green-100 rounded text-xs text-green-800 border border-green-200">
                                        <strong>Resumo:</strong> 
                                        {entryMode === 'grid' 
                                            ? ` Adicionará +${entryQty} peças para CADA tamanho da grade (${SIZE_GRIDS[activeEntryProduct.gridType].join(', ')}). Total: +${parseInt(entryQty) * SIZE_GRIDS[activeEntryProduct.gridType].length} peças.`
                                            : ` Adicionará +${entryQty} peças apenas no tamanho ${entrySize || '?'}.`
                                        }
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="p-4 border-t bg-gray-50 rounded-b-lg flex justify-end gap-2">
                        <button 
                            onClick={() => setShowStockEntry(false)}
                            className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded"
                        >
                            Cancelar
                        </button>
                        <button 
                            onClick={handleSaveStockEntry}
                            disabled={loading || !activeEntryProduct || !entryQty}
                            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 font-bold flex items-center shadow-sm disabled:opacity-50"
                        >
                            <Check className="w-4 h-4 mr-2" /> Confirmar Inclusão
                        </button>
                    </div>
              </div>
          </div>
      )}

      {/* MODAL DE EDIÇÃO */}
      {editingProduct && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg w-full max-w-lg shadow-xl animate-fade-in">
                <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-lg">
                    <h3 className="font-bold text-lg text-gray-800 flex items-center">
                        <Edit2 className="w-5 h-5 mr-2 text-blue-600" />
                        Editar Estoque e Preço
                    </h3>
                    <button onClick={() => setEditingProduct(null)} className="text-gray-400 hover:text-gray-600">
                        <X className="w-6 h-6" />
                    </button>
                </div>
                
                <div className="p-6">
                    <div className="mb-4 bg-blue-50 p-3 rounded border border-blue-100">
                        <p className="text-sm text-blue-900"><strong>Referência:</strong> {editingProduct.reference}</p>
                        <p className="text-sm text-blue-900"><strong>Cor:</strong> {editingProduct.color}</p>
                    </div>
                    
                    {/* Campo Preço Base na Edição */}
                    <div className="mb-6">
                        <label className="block text-sm font-bold text-gray-700 mb-1">Preço de Custo (Base)</label>
                        <div className="relative">
                            <span className="absolute left-2 top-2 text-gray-500 text-sm">R$</span>
                            <input 
                                type="number" 
                                step="0.01"
                                className="w-full border p-2 pl-8 rounded focus:ring-2 focus:ring-blue-500"
                                value={editBasePrice}
                                onChange={(e) => setEditBasePrice(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="mb-6">
                        <div className="flex justify-between items-center mb-2">
                             <label className="text-sm font-bold text-gray-700">Quantidade por Tamanho</label>
                             <label className="flex items-center text-sm cursor-pointer select-none">
                                <input 
                                    type="checkbox" 
                                    className="mr-2 w-4 h-4 text-blue-600 rounded"
                                    checked={editEnforceStock}
                                    onChange={(e) => setEditEnforceStock(e.target.checked)}
                                />
                                <span className={`${editEnforceStock ? 'text-red-600 font-bold' : 'text-gray-600'}`}>
                                    Travar venda sem estoque
                                </span>
                             </label>
                        </div>
                        
                        <div className="grid grid-cols-4 gap-3">
                            {SIZE_GRIDS[editingProduct.gridType].map(size => (
                                <div key={size}>
                                    <label className="block text-xs font-bold text-center mb-1 text-gray-500">{size}</label>
                                    <input 
                                        type="number"
                                        // Sem min="0" para permitir ajustes negativos manuais se necessário
                                        className="w-full border p-2 text-center rounded focus:ring-2 focus:ring-blue-500"
                                        value={editStockValues[size] || ''}
                                        onChange={(e) => setEditStockValues({...editStockValues, [size]: e.target.value})}
                                        placeholder="0"
                                    />
                                </div>
                            ))}
                        </div>
                        <p className="text-xs text-gray-400 mt-2">Valores negativos são permitidos (indicam venda a descoberto).</p>
                    </div>
                </div>

                <div className="p-4 bg-gray-50 rounded-b-lg flex justify-end gap-2 border-t">
                    <button 
                        onClick={() => setEditingProduct(null)}
                        className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded font-medium"
                    >
                        Cancelar
                    </button>
                    <button 
                        onClick={handleSaveEdit}
                        disabled={loading}
                        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium flex items-center shadow-sm"
                    >
                        {loading ? <Loader2 className="animate-spin w-4 h-4 mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                        Salvar Alterações
                    </button>
                </div>
            </div>
        </div>
      )}

    </div>
  );
};

export default ProductManager;
