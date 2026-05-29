export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
  image_url?: string;
  active: boolean;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  description?: string;
  price: number;
  compare_price?: number;
  category_id?: string;
  category?: Category;
  images: string[];
  tags?: string[];
  active: boolean;
  featured: boolean;
  stock: number;
  sku?: string;
  created_at: string;
  updated_at: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export type OrderStatus = 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled';

export interface Order {
  id: string;
  order_number: string;
  user_id?: string;
  status: OrderStatus;
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  billing_name: string;
  billing_id_type: string;
  billing_id: string;
  billing_razon_social?: string;
  billing_email: string;
  billing_phone: string;
  billing_address: string;
  billing_city: string;
  billing_depto: string;
  delivery_address?: string;
  delivery_city?: string;
  delivery_depto?: string;
  payment_method?: string;
  payment_status: string;
  payment_ref?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  items?: OrderItem[];
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  product_name: string;
  product_sku?: string;
  unit_price: number;
  quantity: number;
  subtotal: number;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  order_id: string;
  seller_nit: string;
  seller_name: string;
  seller_address: string;
  buyer_name: string;
  buyer_id_type: string;
  buyer_id: string;
  buyer_email: string;
  buyer_address: string;
  buyer_city: string;
  subtotal: number;
  tax_iva: number;
  total: number;
  status: 'draft' | 'issued' | 'cancelled';
  issued_at?: string;
  created_at: string;
  order?: Order;
}

export interface InventoryLog {
  id: string;
  product_id: string;
  type: 'in' | 'out' | 'adjustment';
  quantity: number;
  notes?: string;
  created_at: string;
  product?: Product;
}

export interface PetService {
  id: string;
  name: string;
  description?: string;
  price: number;
  duration_minutes?: number;
  category: string;
  is_active: boolean;
  image_url?: string;
  created_at: string;
}

export interface PetServiceBooking {
  id: string;
  service_id: string;
  user_id: string;
  pet_name?: string;
  scheduled_at: string;
  address: string;
  notes?: string;
  status: string;
  created_at: string;
  service?: Pick<PetService, 'name' | 'category' | 'price'>;
}

export interface Referral {
  id: string;
  referrer_id: string;
  code: string;
  discount_percent: number;
  uses_count: number;
  max_uses?: number | null;
  is_active: boolean;
  created_at: string;
}

export interface OrderRating {
  id: string;
  order_id: string;
  user_id: string;
  rating: number;
  comment?: string;
  created_at: string;
}
