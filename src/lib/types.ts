export interface Category {
  id: string;
  name: string;
  slug: string;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  category: string; // slug, e.g. "men"
  category_name: string;
  price: number; // original price in BDT
  sale_price: number | null; // discounted price in BDT (null = no discount)
  image_url: string;
  sizes: string[];
  stock: number;
  featured: boolean;
  active: boolean;
  created_at?: string;
}

export interface HeroBanner {
  image: string;
  headline: string;
  subheadline: string;
  link: string;
}

export interface Settings {
  store_name: string;
  bkash_number: string;
  nagad_number: string;
  delivery_dhaka: number;
  delivery_outside: number;
  free_threshold: number;
  hero_banners: HeroBanner[];
  facebook_url: string;
}

export interface CartItem {
  product_id: string;
  name: string;
  image_url: string;
  price: number; // effective unit price
  size: string;
  qty: number;
}

export interface OrderItem {
  id?: string;
  order_id?: string;
  product_id: string;
  product_name: string;
  size: string;
  price: number;
  qty: number;
}

export interface Order {
  id: string;
  customer_name: string;
  phone: string;
  address: string;
  area: string; // "dhaka" | "outside"
  payment_method: string; // "COD" | "bKash" | "Nagad"
  payment_trx?: string | null;
  subtotal: number;
  delivery_charge: number;
  total: number;
  status: string; // Pending | Confirmed | Shipped | Delivered | Cancelled
  created_at: string;
  order_items?: OrderItem[];
}
