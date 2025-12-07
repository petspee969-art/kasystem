
export enum Role {
  ADMIN = 'admin',
  REP = 'rep'
}

export enum SizeGridType {
  ADULT = 'ADULT', // Agora chamado visualmente de "Normal" (P, M, G, GG)
  PLUS = 'PLUS',   // G1, G2, G3
}

export interface User {
  id: string;
  name: string;
  username: string; // Used for login
  password?: string;
  role: Role;
}

export interface ProductDef {
  id: string;
  reference: string;
  color: string;
  gridType: SizeGridType;
  stock: { [size: string]: number }; // Estoque por tamanho ex: { "P": 10, "M": 5 }
  enforceStock: boolean; // Se true, não deixa vender sem estoque
  basePrice: number; // Novo campo: Preço de Custo/Base para relatórios administrativos
}

export interface RepPrice {
  id?: string;
  repId: string;
  reference: string;
  price: number;
}

export interface Client {
  id: string;
  repId: string;
  name: string;
  city: string;
  neighborhood: string;
  state: string;
}

export interface OrderItem {
  reference: string;
  color: string;
  gridType: SizeGridType;
  sizes: { [size: string]: number }; // e.g. { "P": 10, "M": 5 } (Quantidade Pedida)
  picked?: { [size: string]: number }; // NOVO: Quantidade Separada/Bipada
  totalQty: number;
  unitPrice: number; // Preço unitário no momento da venda
  totalItemValue: number; // unitPrice * totalQty
}

export interface Order {
  id: string;
  displayId: number; // Sequential ID (Pedido #101)
  romaneio?: string; // Novo campo: Número do Romaneio
  isPartial?: boolean; // Identifica se é uma entrega parcial
  repId: string;
  repName: string;
  clientId: string;
  clientName: string;
  clientCity: string;
  clientState: string;
  createdAt: string; // ISO date
  deliveryDate: string;
  paymentMethod: string;
  status: 'open' | 'printed';
  items: OrderItem[];
  totalPieces: number;
  
  // Financeiro
  subtotalValue: number; // Soma dos itens
  discountType: 'percentage' | 'fixed' | null;
  discountValue: number; // Valor numérico do desconto (ex: 10 para 10% ou 10 reais)
  finalTotalValue: number; // Valor final a pagar
}

export const SIZE_GRIDS = {
  [SizeGridType.ADULT]: ['P', 'M', 'G', 'GG'],
  [SizeGridType.PLUS]: ['G1', 'G2', 'G3'],
};
