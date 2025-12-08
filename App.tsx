
import React, { useState, useEffect } from 'react';
import Layout from './components/Layout';
import Login from './components/Login';
import AdminDashboard from './components/AdminDashboard';
import AdminOrderList from './components/AdminOrderList';
import ProductManager from './components/ProductManager';
import RepManager from './components/RepManager';
import ClientManager from './components/ClientManager';
import RepOrderForm from './components/RepOrderForm';
import RepOrderList from './components/RepOrderList';
import RepPriceManager from './components/RepPriceManager';
import AdminReports from './components/AdminReports';
import RepReports from './components/RepReports';
import StockReport from './components/StockReport';
import RepStockView from './components/RepStockView'; // Novo import
import { User, Role, Order } from './types';
import { initializeStorage } from './services/storageService';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);

  useEffect(() => {
    initializeStorage();
    const savedUser = localStorage.getItem('current_user');
    if (savedUser) {
      try {
        const parsedUser = JSON.parse(savedUser);
        if (parsedUser && parsedUser.id && parsedUser.role) {
            setUser(parsedUser);
            // Se o usuário já estava logado como Rep, define uma aba padrão segura
            if (parsedUser.role === Role.REP && activeTab === 'dashboard') {
                setActiveTab('rep-dashboard');
            }
        } else {
            localStorage.removeItem('current_user');
        }
      } catch (e) {
        console.error("Erro ao ler usuário salvo:", e);
        localStorage.removeItem('current_user');
      }
    }
  }, []);

  const handleLogin = (u: User) => {
    setUser(u);
    localStorage.setItem('current_user', JSON.stringify(u));
    setActiveTab(u.role === Role.ADMIN ? 'dashboard' : 'rep-dashboard');
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('current_user');
    setActiveTab('dashboard');
    setEditingOrder(null);
  };

  // Função chamada pelo RepOrderList para iniciar edição
  const handleStartEditOrder = (order: Order) => {
      setEditingOrder(order);
      setActiveTab('new-order');
  };

  // Reseta o editingOrder se sair da aba 'new-order'
  useEffect(() => {
      if (activeTab !== 'new-order') {
          setEditingOrder(null);
      }
  }, [activeTab]);

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <Layout user={user} onLogout={handleLogout} activeTab={activeTab} setActiveTab={setActiveTab}>
      {/* Rotas de Administrador */}
      {user.role === Role.ADMIN && (
        <>
          {activeTab === 'dashboard' && <AdminDashboard onNavigate={setActiveTab} />}
          {activeTab === 'reports' && <AdminReports />}
          {activeTab === 'stock-report' && <StockReport />}
          {activeTab === 'orders' && <AdminOrderList />}
          {activeTab === 'products' && <ProductManager />}
          {activeTab === 'reps' && <RepManager />}
        </>
      )}

      {/* Rotas de Representante */}
      {user.role === Role.REP && (
        <>
          {activeTab === 'rep-dashboard' && <RepOrderList user={user} onEditOrder={handleStartEditOrder} />}
          {activeTab === 'new-order' && (
              <RepOrderForm 
                  user={user} 
                  onOrderCreated={() => { 
                      setActiveTab('rep-dashboard'); 
                      setEditingOrder(null); 
                  }} 
                  initialOrder={editingOrder} // Passa o pedido a editar
              />
          )}
          {activeTab === 'rep-stock' && <RepStockView />}
          {activeTab === 'clients' && <ClientManager user={user} />}
          {activeTab === 'prices' && <RepPriceManager user={user} />}
          {activeTab === 'rep-reports' && <RepReports user={user} />}
        </>
      )}
    </Layout>
  );
};

export default App;
