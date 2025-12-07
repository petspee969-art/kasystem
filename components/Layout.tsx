
import React, { useState } from 'react';
import { User, Role } from '../types';
import { LogOut, LayoutDashboard, ShoppingCart, Users, Package, Shirt, Menu, X, DollarSign, FileBarChart, PieChart, Archive } from 'lucide-react';

interface LayoutProps {
  user: User;
  onLogout: () => void;
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const Layout: React.FC<LayoutProps> = ({ user, onLogout, children, activeTab, setActiveTab }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isAdmin = user.role === Role.ADMIN;

  const NavItem = ({ id, icon: Icon, label }: { id: string; icon: any; label: string }) => (
    <button
      onClick={() => { setActiveTab(id); setMobileMenuOpen(false); }}
      className={`flex items-center w-full px-4 py-3 mb-2 rounded-lg transition-colors ${
        activeTab === id 
          ? 'bg-blue-600 text-white shadow-md' 
          : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      <Icon className="w-5 h-5 mr-3" />
      <span className="font-medium">{label}</span>
    </button>
  );

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar Desktop */}
      <aside className="hidden md:flex flex-col w-64 bg-white border-r border-gray-200 fixed h-full z-10 no-print">
        <div className="p-6 border-b border-gray-100">
          <h1 className="text-xl font-bold text-blue-800">Confecção Pro</h1>
          <p className="text-sm text-gray-500 mt-1 truncate">Olá, {user.name.split(' ')[0]}</p>
        </div>
        
        <nav className="flex-1 p-4 overflow-y-auto">
          {isAdmin ? (
            <>
              <NavItem id="dashboard" icon={LayoutDashboard} label="Dashboard Geral" />
              <NavItem id="reports" icon={FileBarChart} label="Relatórios & Matriz" />
              <NavItem id="stock-report" icon={Archive} label="Relatório de Estoque" />
              <NavItem id="orders" icon={Package} label="Pedidos & Produção" />
              <NavItem id="products" icon={Shirt} label="Catálogo Produtos" />
              <NavItem id="reps" icon={Users} label="Representantes" />
            </>
          ) : (
            <>
              <NavItem id="rep-dashboard" icon={LayoutDashboard} label="Meus Pedidos" />
              <NavItem id="new-order" icon={ShoppingCart} label="Novo Pedido" />
              <NavItem id="clients" icon={Users} label="Meus Clientes" />
              <NavItem id="prices" icon={DollarSign} label="Tabela de Preços" />
              <NavItem id="rep-reports" icon={PieChart} label="Meus Relatórios" />
            </>
          )}
        </nav>

        <div className="p-4 border-t border-gray-100">
          <button 
            onClick={onLogout}
            className="flex items-center text-red-600 hover:text-red-700 w-full px-4 py-2 hover:bg-red-50 rounded-lg transition"
          >
            <LogOut className="w-5 h-5 mr-3" />
            Sair
          </button>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="md:hidden fixed w-full bg-white z-20 border-b flex justify-between items-center p-4 shadow-sm no-print">
        <h1 className="font-bold text-blue-800 text-lg">Confecção Pro</h1>
        <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-2">
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-10 bg-white pt-20 px-4 no-print animate-fade-in">
           <nav className="flex flex-col space-y-2">
            {isAdmin ? (
              <>
                <NavItem id="dashboard" icon={LayoutDashboard} label="Dashboard" />
                <NavItem id="reports" icon={FileBarChart} label="Relatórios" />
                <NavItem id="stock-report" icon={Archive} label="Relat. Estoque" />
                <NavItem id="orders" icon={Package} label="Pedidos" />
                <NavItem id="products" icon={Shirt} label="Produtos" />
                <NavItem id="reps" icon={Users} label="Representantes" />
              </>
            ) : (
              <>
                <NavItem id="rep-dashboard" icon={LayoutDashboard} label="Meus Pedidos" />
                <NavItem id="new-order" icon={ShoppingCart} label="Novo Pedido" />
                <NavItem id="clients" icon={Users} label="Meus Clientes" />
                <NavItem id="prices" icon={DollarSign} label="Tabela de Preços" />
                <NavItem id="rep-reports" icon={PieChart} label="Meus Relatórios" />
              </>
            )}
            <div className="border-t pt-4 mt-4">
                <button 
                onClick={onLogout}
                className="flex items-center text-red-600 w-full px-4 py-3 bg-red-50 rounded-lg"
                >
                <LogOut className="w-5 h-5 mr-3" /> Sair
                </button>
            </div>
          </nav>
        </div>
      )}

      {/* Main Content - Adjusted padding for mobile */}
      <main className="flex-1 md:ml-64 p-3 md:p-8 pt-20 md:pt-8 overflow-x-hidden w-full">
        {children}
      </main>
    </div>
  );
};

export default Layout;
