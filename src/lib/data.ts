import { supabase } from "./supabase";
import type { Category, Product, Settings } from "./types";

export const seedCategories: Category[] = [
  { id: "c-men", name: "Men", slug: "men" },
  { id: "c-women", name: "Women", slug: "women" },
  { id: "c-accessories", name: "Accessories", slug: "accessories" },
  { id: "c-kids", name: "Kids", slug: "kids" }
];

const U = (id: string) => `https://images.unsplash.com/${id}?q=80&w=900&auto=format&fit=crop`;

export const seedProducts: Product[] = [
  { id: "p1", name: "Premium Linen Shirt", description: "Breathable premium linen shirt. Perfect for Dhaka weather, formal and casual both.", category: "men", category_name: "Men", price: 2400, sale_price: 1850, image_url: U("photo-1596755094514-f87e34085b2c"), sizes: ["S", "M", "L", "XL"], stock: 25, featured: true, active: true },
  { id: "p2", name: "Charcoal Hoodie", description: "Heavy 320 GSM fleece hoodie with kangaroo pocket.", category: "men", category_name: "Men", price: 1800, sale_price: 1250, image_url: U("photo-1556821840-3a63f95609a7"), sizes: ["M", "L", "XL"], stock: 18, featured: true, active: true },
  { id: "p3", name: "Premium Panjabi", description: "Soft cotton panjabi with fine embroidery. Eid and jummah ready.", category: "men", category_name: "Men", price: 3200, sale_price: 2450, image_url: U("photo-1610030469983-98e550d6193c"), sizes: ["40", "42", "44"], stock: 12, featured: true, active: true },
  { id: "p4", name: "Slim Fit Jeans", description: "Stretch denim slim fit jeans, fade-proof wash.", category: "men", category_name: "Men", price: 2200, sale_price: 1650, image_url: U("photo-1542272604-787c3835535d"), sizes: ["30", "32", "34", "36"], stock: 20, featured: false, active: true },
  { id: "p5", name: "Graphic Tee", description: "100% cotton graphic t-shirt, 180 GSM.", category: "men", category_name: "Men", price: 950, sale_price: 750, image_url: U("photo-1521572163474-6864f9cf17ab"), sizes: ["S", "M", "L", "XL"], stock: 40, featured: false, active: true },
  { id: "p6", name: "Biker Jacket", description: "Premium faux-leather biker jacket with quilted shoulders.", category: "men", category_name: "Men", price: 4500, sale_price: 3600, image_url: U("photo-1551028719-00167b16eac5"), sizes: ["M", "L", "XL"], stock: 8, featured: true, active: true },
  { id: "p7", name: "Floral Summer Dress", description: "Light floral dress, comfortable summer fit.", category: "women", category_name: "Women", price: 2800, sale_price: 2100, image_url: U("photo-1595777457583-95e059d581b8"), sizes: ["S", "M", "L"], stock: 15, featured: true, active: true },
  { id: "p8", name: "Silk Saree", description: "Soft silk saree with zari border and blouse piece.", category: "women", category_name: "Women", price: 6500, sale_price: 4500, image_url: U("photo-1610189844806-3bab762b10ab"), sizes: ["Free"], stock: 6, featured: true, active: true },
  { id: "p9", name: "Three-Piece Set", description: "Cotton three-piece set with printed orna.", category: "women", category_name: "Women", price: 3400, sale_price: 2650, image_url: U("photo-1583391733956-6c78276477e2"), sizes: ["38", "40", "42"], stock: 14, featured: false, active: true },
  { id: "p10", name: "Modest Abaya", description: "Elegant Dubai-style abaya, premium nidha fabric.", category: "women", category_name: "Women", price: 3800, sale_price: 2950, image_url: U("photo-1585487000160-6ebcfceb0d03"), sizes: ["52", "54", "56"], stock: 10, featured: false, active: true },
  { id: "p11", name: "Casual Blouse", description: "Everyday casual blouse, easy to pair with saree or skirt.", category: "women", category_name: "Women", price: 1600, sale_price: 1200, image_url: U("photo-1594633312681-425c7b97ccd1"), sizes: ["S", "M", "L"], stock: 22, featured: false, active: true },
  { id: "p12", name: "Classic Polo", description: "Pique cotton polo with embroidered logo.", category: "men", category_name: "Men", price: 1450, sale_price: 1100, image_url: U("photo-1586363104862-3a5e2ab60d99"), sizes: ["M", "L", "XL"], stock: 30, featured: false, active: true }
];

export const defaultSettings: Settings = {
  store_name: "KAPOR",
  bkash_number: "",
  nagad_number: "",
  delivery_dhaka: 60,
  delivery_outside: 120,
  free_threshold: 2000,
  facebook_url: "",
  hero_banners: [
    { image: U("photo-1441986300917-64674bd600d8"), headline: "BIG SALE UP TO 50% OFF", subheadline: "New season clothing collection", link: "/shop" },
    { image: U("photo-1445205170230-053b83016050"), headline: "NEW ARRIVAL", subheadline: "Premium shirts, hoodies and more", link: "/shop?category=men" },
    { image: U("photo-1483985988355-763728e1935b"), headline: "LADIES COLLECTION", subheadline: "Saree, dress, three-piece and abaya", link: "/shop?category=women" }
  ]
};

export function effectivePrice(p: Product): number {
  return p.sale_price && p.sale_price > 0 && p.sale_price < p.price ? p.sale_price : p.price;
}

export function discountPct(p: Product): number {
  if (!p.sale_price || p.sale_price >= p.price) return 0;
  return Math.round((1 - p.sale_price / p.price) * 100);
}

export function formatBDT(n: number): string {
  return "৳" + n.toLocaleString("en-IN");
}

// ---------- Fetch helpers (Supabase when configured, seed fallback otherwise) ----------

export async function fetchProducts(): Promise<Product[]> {
  if (!supabase) return seedProducts;
  const { data, error } = await supabase
    .from("products")
    .select("*, categories(name, slug)")
    .eq("active", true)
    .order("created_at", { ascending: false });
  if (error || !data || data.length === 0) return seedProducts;
  return data.map((r: any) => ({
    id: String(r.id),
    name: r.name,
    description: r.description || "",
    category: r.categories?.slug || r.category_slug || "men",
    category_name: r.categories?.name || "Men",
    price: Number(r.price),
    sale_price: r.sale_price ? Number(r.sale_price) : null,
    image_url: r.image_url || "",
    sizes: Array.isArray(r.sizes) ? r.sizes : String(r.sizes || "M").split(",").map((s: string) => s.trim()).filter(Boolean),
    stock: Number(r.stock || 0),
    featured: Boolean(r.featured),
    active: Boolean(r.active),
    created_at: r.created_at
  }));
}

export async function fetchCategories(): Promise<Category[]> {
  if (!supabase) return seedCategories;
  const { data, error } = await supabase.from("categories").select("*").order("name");
  if (error || !data || data.length === 0) return seedCategories;
  return data.map((r: any) => ({ id: String(r.id), name: r.name, slug: r.slug }));
}

export async function fetchSettings(): Promise<Settings> {
  if (!supabase) return defaultSettings;
  const { data, error } = await supabase.from("settings").select("*").eq("id", 1).maybeSingle();
  if (error || !data) return defaultSettings;
  return {
    store_name: data.store_name || defaultSettings.store_name,
    bkash_number: data.bkash_number || "",
    nagad_number: data.nagad_number || "",
    delivery_dhaka: Number(data.delivery_dhaka ?? 60),
    delivery_outside: Number(data.delivery_outside ?? 120),
    free_threshold: Number(data.free_threshold ?? 2000),
    facebook_url: data.facebook_url || "",
    hero_banners: Array.isArray(data.hero_banners) && data.hero_banners.length > 0 ? data.hero_banners : defaultSettings.hero_banners
  };
}
