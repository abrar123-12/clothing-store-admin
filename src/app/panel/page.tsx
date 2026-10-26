"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { formatBDT } from "@/lib/data";
import type { Order, Settings } from "@/lib/types";
import { defaultSettings } from "@/lib/data";

type Tab = "dashboard" | "products" | "orders" | "customers" | "settings";
type ProdView = "list" | "grid";
const STATUSES = ["Pending", "Confirmed", "Shipped", "Delivered", "Cancelled"];

interface RawProduct { id: string; name: string; description: string; category_id: string; price: number; sale_price: number | null; image_url: string; sizes: string; stock: number; featured: boolean; active: boolean; }
interface RawCategory { id: string; name: string; slug: string; }

const emptyProduct: Omit<RawProduct, "id"> = { name: "", description: "", category_id: "", price: 0, sale_price: null, image_url: "", sizes: "S,M,L,XL", stock: 10, featured: false, active: true };

const statusBadge = (st: string) => "badge " + ({
  Pending: "bg-amber-100 text-amber-800", Confirmed: "bg-blue-100 text-blue-800",
  Shipped: "bg-violet-100 text-violet-800", Delivered: "bg-emerald-100 text-emerald-800",
  Cancelled: "bg-red-100 text-red-600"
} as Record<string, string>)[st] || "bg-slate-100 text-slate-700";

const PRICE_RANGES = [
  { label: "All Price", test: (_p: number) => true },
  { label: "Below ৳1000", test: (p: number) => p < 1000 },
  { label: "৳1000 – ৳2000", test: (p: number) => p >= 1000 && p <= 2000 },
  { label: "৳2000 – ৳5000", test: (p: number) => p > 2000 && p <= 5000 },
  { label: "৳5000+", test: (p: number) => p > 5000 }
];

export default function AdminPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [adminEmail, setAdminEmail] = useState("");
  const [tab, setTab] = useState<Tab>("dashboard");
  const [prodOpen, setProdOpen] = useState(false);
  const [prodView, setProdView] = useState<ProdView>("grid");
  const [showForm, setShowForm] = useState(false);
  const [products, setProducts] = useState<RawProduct[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [categories, setCategories] = useState<RawCategory[]>([]);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [msg, setMsg] = useState("");

  // product form
  const [form, setForm] = useState<Omit<RawProduct, "id"> & { id?: string }>(emptyProduct);
  // category form
  const [catName, setCatName] = useState("");
  const [catSlug, setCatSlug] = useState("");
  // search / filters (top bar search drives these per tab)
  const [orderQuery, setOrderQuery] = useState("");
  const [orderStatusFilter, setOrderStatusFilter] = useState("All");
  const [prodQuery, setProdQuery] = useState("");
  const [custQuery, setCustQuery] = useState("");
  const [draftCats, setDraftCats] = useState<string[]>(["all"]);
  const [appliedCats, setAppliedCats] = useState<string[]>(["all"]);
  const [draftPrice, setDraftPrice] = useState(0);
  const [appliedPrice, setAppliedPrice] = useState(0);
  const [invoiceOrder, setInvoiceOrder] = useState<Order | null>(null);

  const loadAll = useCallback(async () => {
    if (!supabase) return;
    const [p, o, c, s] = await Promise.all([
      supabase.from("products").select("*").order("created_at", { ascending: false }),
      supabase.from("orders").select("*, order_items(*)").order("created_at", { ascending: false }),
      supabase.from("categories").select("*").order("name"),
      supabase.from("settings").select("*").eq("id", 1).maybeSingle()
    ]);
    if (p.data) setProducts(p.data.map((r: any) => ({ ...r, sizes: Array.isArray(r.sizes) ? r.sizes.join(",") : String(r.sizes || "") })));
    if (o.data) setOrders(o.data as Order[]);
    if (c.data) setCategories(c.data as RawCategory[]);
    if (s.data) setSettings({
      store_name: s.data.store_name || "KAPOR", bkash_number: s.data.bkash_number || "", nagad_number: s.data.nagad_number || "",
      delivery_dhaka: Number(s.data.delivery_dhaka ?? 60), delivery_outside: Number(s.data.delivery_outside ?? 120),
      free_threshold: Number(s.data.free_threshold ?? 2000), facebook_url: s.data.facebook_url || "",
      hero_banners: Array.isArray(s.data.hero_banners) && s.data.hero_banners.length ? s.data.hero_banners : defaultSettings.hero_banners
    });
  }, []);

  useEffect(() => {
    (async () => {
      if (!supabase) { router.push("/login"); return; }
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }
      setAdminEmail(session.user.email || "");
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", session.user.id).maybeSingle();
      if (profile?.role !== "admin") { await supabase.auth.signOut(); router.push("/login"); return; }
      setReady(true);
      loadAll();
    })();
  }, [router, loadAll]);

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 3000); };

  const saveProduct = async () => {
    if (!supabase) return;
    if (!form.name.trim()) return flash("Product name is required");
    const payload = {
      name: form.name.trim(), description: form.description, category_id: form.category_id || null,
      price: Number(form.price), sale_price: form.sale_price ? Number(form.sale_price) : null,
      image_url: form.image_url, sizes: form.sizes.split(",").map(x => x.trim()).filter(Boolean),
      stock: Number(form.stock), featured: form.featured, active: form.active
    };
    const res = form.id
      ? await supabase.from("products").update(payload).eq("id", form.id)
      : await supabase.from("products").insert(payload);
    if (res.error) return flash("Error: " + res.error.message);
    setForm(emptyProduct);
    setShowForm(false);
    flash(form.id ? "Product updated ✅" : "Product added ✅");
    loadAll();
  };

  const uploadPhoto = async (file: File) => {
    if (!supabase) return;
    const path = `${Date.now()}-${file.name.replace(/\s+/g, "-")}`;
    const { error } = await supabase.storage.from("product-photos").upload(path, file);
    if (error) return flash("Upload failed: " + error.message + " (you can paste an image URL instead)");
    const { data } = supabase.storage.from("product-photos").getPublicUrl(path);
    setForm(f => ({ ...f, image_url: data.publicUrl }));
    flash("Photo uploaded ✅");
  };

  const deleteProduct = async (id: string, name: string) => {
    if (!supabase) return;
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) return flash("Error: " + error.message);
    flash("Deleted"); loadAll();
  };

  const setOrderStatus = async (id: string, status: string) => {
    if (!supabase) return;
    const { error } = await supabase.from("orders").update({ status }).eq("id", id);
    if (error) return flash("Error: " + error.message);
    flash("Order updated ✅"); loadAll();
  };

  const saveCategory = async () => {
    if (!supabase || !catName.trim()) return;
    const slug = (catSlug.trim() || catName.trim().toLowerCase().replace(/\s+/g, "-"));
    const { error } = await supabase.from("categories").insert({ name: catName.trim(), slug });
    if (error) return flash("Error: " + error.message);
    setCatName(""); setCatSlug(""); flash("Category added ✅"); loadAll();
  };

  const deleteCategory = async (id: string, name: string) => {
    if (!supabase) return;
    if (!confirm(`Delete category "${name}"? Products in it will lose their category.`)) return;
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) return flash("Error: " + error.message);
    flash("Category deleted"); loadAll();
  };

  const saveSettings = async () => {
    if (!supabase) return;
    const { error } = await supabase.from("settings").update({
      store_name: settings.store_name, bkash_number: settings.bkash_number, nagad_number: settings.nagad_number,
      delivery_dhaka: Number(settings.delivery_dhaka), delivery_outside: Number(settings.delivery_outside),
      free_threshold: Number(settings.free_threshold), facebook_url: settings.facebook_url,
      hero_banners: settings.hero_banners
    }).eq("id", 1);
    if (error) return flash("Error: " + error.message);
    flash("Settings saved ✅");
  };

  const logout = async () => { await supabase?.auth.signOut(); router.push("/login"); };

  const goProducts = (view: ProdView) => { setTab("products"); setProdView(view); setProdOpen(true); };
  const goCreate = () => { setTab("products"); setShowForm(true); setProdOpen(true); setTimeout(() => document.getElementById("product-form")?.scrollIntoView({ behavior: "smooth" }), 100); };
  const editProduct = (p: RawProduct) => { setForm({ ...p }); setShowForm(true); setTimeout(() => document.getElementById("product-form")?.scrollIntoView({ behavior: "smooth" }), 100); };

  if (!ready) return <p className="text-center py-20">Checking admin access...</p>;

  const revenue = orders.filter(o => o.status === "Delivered").reduce((s, o) => s + Number(o.total), 0);
  const pending = orders.filter(o => o.status === "Pending").length;
  const lowStock = products.filter(p => Number(p.stock) < 5);
  const today = new Date().toDateString();
  const todayOrders = orders.filter(o => new Date(o.created_at).toDateString() === today).length;
  const totalRevenue = orders.filter(o => o.status !== "Cancelled").reduce((s, o) => s + Number(o.total), 0);

  const shownOrders = orders.filter(o =>
    (orderStatusFilter === "All" || o.status === orderStatusFilter) &&
    (orderQuery.trim() === "" || o.customer_name.toLowerCase().includes(orderQuery.toLowerCase()) || o.phone.includes(orderQuery.trim()))
  );

  const filteredProducts = products.filter(p => {
    const q = prodQuery.trim().toLowerCase();
    if (q && !p.name.toLowerCase().includes(q)) return false;
    if (!appliedCats.includes("all") && appliedCats.length > 0 && !appliedCats.includes(p.category_id)) return false;
    const price = p.sale_price && p.sale_price > 0 ? p.sale_price : p.price;
    if (!PRICE_RANGES[appliedPrice].test(price)) return false;
    return true;
  });

  const customers = (() => {
    const map = new Map<string, { phone: string; name: string; count: number; total: number; last: string }>();
    orders.forEach(o => {
      const cur = map.get(o.phone) || { phone: o.phone, name: o.customer_name, count: 0, total: 0, last: o.created_at };
      cur.count += 1; cur.total += Number(o.total);
      if (o.created_at > cur.last) cur.last = o.created_at;
      map.set(o.phone, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  })();
  const shownCustomers = customers.filter(c =>
    custQuery.trim() === "" || c.name.toLowerCase().includes(custQuery.toLowerCase()) || c.phone.includes(custQuery.trim())
  );

  const topQuery = tab === "products" ? prodQuery : tab === "orders" ? orderQuery : tab === "customers" ? custQuery : "";
  const setTopQuery = (v: string) => { if (tab === "products") setProdQuery(v); else if (tab === "orders") setOrderQuery(v); else if (tab === "customers") setCustQuery(v); };
  const topPlaceholder = tab === "products" ? "Search product..." : tab === "orders" ? "Search by name or phone..." : tab === "customers" ? "Search customers..." : "Search...";

  const inputCls = "border rounded-xl px-3 py-2.5 w-full text-sm";
  const labelCls = "text-xs font-bold uppercase text-neutral-500";

  const navBtn = (active: boolean) =>
    `w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-semibold text-left ${active ? "bg-amber-50 text-amber-700 border-l-4 border-amber-500" : "text-slate-600 hover:bg-slate-50"}`;
  const subBtn = (active: boolean) =>
    `w-full text-left pl-12 pr-4 py-2 text-sm font-medium rounded-lg ${active ? "bg-amber-50 text-amber-700" : "text-slate-500 hover:bg-slate-50"}`;

  const sidebar = (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-5 py-5">
        <span className="w-9 h-9 rounded-lg bg-amber-500 text-white flex items-center justify-center font-black text-lg">K</span>
        <div>
          <p className="font-bold leading-none">KAPOR <span className="text-amber-600">Admin</span></p>
          <p className="text-[11px] text-slate-400 mt-1">Store management</p>
        </div>
      </div>
      <nav className="flex flex-col gap-1 px-3">
        <button onClick={() => setTab("dashboard")} className={navBtn(tab === "dashboard")}>▦ <span>Overview</span></button>
        <button onClick={() => { setTab("products"); setProdOpen(!prodOpen); }} className={navBtn(tab === "products")}>📦 <span className="flex-1">Product</span><span>{prodOpen ? "▾" : "▸"}</span></button>
        {prodOpen && (
          <div className="flex flex-col gap-0.5">
            <button onClick={() => goProducts("list")} className={subBtn(tab === "products" && prodView === "list")}>List</button>
            <button onClick={() => goProducts("grid")} className={subBtn(tab === "products" && prodView === "grid")}>Grid</button>
            <button onClick={goCreate} className={subBtn(false)}>Create</button>
          </div>
        )}
        <button onClick={() => setTab("orders")} className={navBtn(tab === "orders")}>🛒 <span>Orders</span>{pending > 0 && <span className="ml-auto bg-amber-500 text-white text-[11px] font-bold rounded-full px-2 py-0.5">{pending}</span>}</button>
        <button onClick={() => setTab("customers")} className={navBtn(tab === "customers")}>👥 <span>Customer</span></button>
        <button onClick={() => setTab("settings")} className={navBtn(tab === "settings")}>⚙️ <span>Settings</span></button>
      </nav>
      <div className="mt-auto px-3 pb-4 flex flex-col gap-1">
        <a href="https://clothing-store-mauve-pi.vercel.app/" target="_blank" rel="noreferrer" className={navBtn(false)}>🛍️ <span>View Store</span></a>
        <button onClick={logout} className={navBtn(false)}>⎋ <span>Log Out</span></button>
      </div>
    </div>
  );

  const productForm = (
    <div id="product-form" className="card p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-extrabold uppercase">{form.id ? "Edit Product" : "Add Product"}</h3>
        <button onClick={() => { setForm(emptyProduct); setShowForm(false); }} className="text-sm font-semibold text-slate-500">✕ Close</button>
      </div>
      <div className="flex flex-col gap-3 mt-3">
        <div><p className={labelCls}>Name</p><input className={inputCls} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
        <div><p className={labelCls}>Description</p><textarea className={inputCls} rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
        <div><p className={labelCls}>Category</p>
          <select className={inputCls} value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })}>
            <option value="">Select category</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select></div>
        <div className="grid grid-cols-2 gap-2">
          <div><p className={labelCls}>Price ৳</p><input type="number" className={inputCls} value={form.price} onChange={e => setForm({ ...form, price: Number(e.target.value) })} /></div>
          <div><p className={labelCls}>Sale Price ৳</p><input type="number" className={inputCls} value={form.sale_price ?? ""} onChange={e => setForm({ ...form, sale_price: e.target.value ? Number(e.target.value) : null })} /></div>
        </div>
        <div><p className={labelCls}>Photo URL</p><input className={inputCls} value={form.image_url} onChange={e => setForm({ ...form, image_url: e.target.value })} placeholder="https://..." /></div>
        <div><p className={labelCls}>Or Upload Photo</p><input type="file" accept="image/*" className="text-sm" onChange={e => { const f = e.target.files?.[0]; if (f) uploadPhoto(f); }} /></div>
        <div className="grid grid-cols-2 gap-2">
          <div><p className={labelCls}>Sizes (comma)</p><input className={inputCls} value={form.sizes} onChange={e => setForm({ ...form, sizes: e.target.value })} /></div>
          <div><p className={labelCls}>Stock</p><input type="number" className={inputCls} value={form.stock} onChange={e => setForm({ ...form, stock: Number(e.target.value) })} /></div>
        </div>
        <label className="flex gap-2 text-sm items-center"><input type="checkbox" checked={form.featured} onChange={e => setForm({ ...form, featured: e.target.checked })} /> Featured (Best Selling)</label>
        <label className="flex gap-2 text-sm items-center"><input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} /> Active (visible in shop)</label>
        <button onClick={saveProduct} className="bg-amber-500 hover:bg-amber-600 text-white font-bold py-3 rounded-full">{form.id ? "UPDATE PRODUCT" : "ADD PRODUCT"}</button>
        {form.id && <button onClick={() => setForm(emptyProduct)} className="border font-bold py-2 rounded-full text-sm">Cancel Edit</button>}
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      {/* Sidebar (desktop) */}
      <aside className="hidden lg:block w-64 shrink-0 bg-white border-r border-slate-200 sticky top-0 h-screen">{sidebar}</aside>

      <div className="flex-1 min-w-0">
        {/* Top bar */}
        <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-slate-200 px-4 py-3 flex items-center gap-3">
          <input
            value={topQuery}
            onChange={e => setTopQuery(e.target.value)}
            placeholder={topPlaceholder}
            className="flex-1 max-w-xl !w-auto border border-slate-200 rounded-full px-4 py-2 text-sm outline-none"
          />
          <button onClick={goCreate} className="hidden sm:inline-flex bg-amber-500 hover:bg-amber-600 text-white font-bold px-4 py-2 rounded-full text-sm whitespace-nowrap">+ New Product</button>
          <span className="hidden md:flex items-center gap-2 text-sm font-semibold text-slate-600">
            <span className="w-8 h-8 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center font-bold">{(adminEmail.charAt(0) || "A").toUpperCase()}</span>
            <span className="max-w-32 truncate">{adminEmail}</span>
          </span>
          <button onClick={logout} className="lg:hidden border font-bold px-3 py-2 rounded-full text-sm">Logout</button>
        </div>

        {/* Mobile tab pills */}
        <div className="lg:hidden flex gap-2 px-4 pt-3 overflow-x-auto no-scrollbar">
          {(["dashboard", "products", "orders", "customers", "settings"] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-full font-bold text-sm uppercase whitespace-nowrap ${tab === t ? "bg-amber-500 text-white" : "border border-slate-300 bg-white text-slate-700"}`}>{t}</button>
          ))}
        </div>

        <div className="p-4 md:p-6 max-w-7xl mx-auto">
          {msg && <p className="mb-4 bg-green-50 border border-green-200 text-green-800 rounded-xl px-4 py-2 text-sm font-semibold">{msg}</p>}

          {tab === "dashboard" && (
            <div>
              <div className="rounded-2xl bg-gradient-to-r from-amber-500 to-orange-400 p-5 text-white mb-5">
                <p className="text-xl font-bold">Welcome back, Admin 👋</p>
                <p className="mt-1 text-amber-50 text-sm">Ajke {todayOrders} ta order • {pending} ta pending • Mot {orders.length} ta order</p>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="card p-4"><p className="text-xs uppercase text-neutral-500 font-bold">Revenue (Delivered)</p><p className="text-2xl font-black text-amber-600 mt-1">{formatBDT(revenue)}</p></div>
                <div className="card p-4"><p className="text-xs uppercase text-neutral-500 font-bold">Total Orders</p><p className="text-2xl font-black mt-1">{orders.length}</p></div>
                <div className="card p-4"><p className="text-xs uppercase text-neutral-500 font-bold">Pending Orders</p><p className="text-2xl font-black mt-1 text-amber-600">{pending}</p></div>
                <div className="card p-4"><p className="text-xs uppercase text-neutral-500 font-bold">Products</p><p className="text-2xl font-black mt-1">{products.length}</p></div>
                <div className="card p-4"><p className="text-xs uppercase text-neutral-500 font-bold">Today&apos;s Orders</p><p className="text-2xl font-black mt-1">{todayOrders}</p></div>
                <div className="card p-4"><p className="text-xs uppercase text-neutral-500 font-bold">Total Revenue (excl. Cancelled)</p><p className="text-2xl font-black text-amber-600 mt-1">{formatBDT(totalRevenue)}</p></div>
              </div>
              <h3 className="font-display font-extrabold uppercase mt-8 mb-3">⚠️ Low Stock (under 5)</h3>
              {lowStock.length === 0 ? <p className="text-sm text-neutral-500">No low-stock products. Good!</p> : (
                <div className="flex flex-col gap-2">{lowStock.map(p => <div key={p.id} className="border border-amber-200 bg-amber-50 rounded-xl px-4 py-2 text-sm flex justify-between"><span>{p.name}</span><b>Stock: {p.stock}</b></div>)}</div>
              )}
              <h3 className="font-display font-extrabold uppercase mt-8 mb-3">Latest Orders</h3>
              <div className="flex flex-col gap-2">{orders.slice(0, 5).map(o => <div key={o.id} className="border rounded-xl px-4 py-2 text-sm flex justify-between flex-wrap gap-2 bg-white"><span>#{String(o.id).slice(0, 8)} — {o.customer_name} ({o.phone})</span><span><span className={statusBadge(o.status)}>{o.status}</span> • <b>{formatBDT(Number(o.total))}</b></span></div>)}</div>
            </div>
          )}

          {tab === "products" && (
            <div>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h2 className="font-display font-bold text-2xl">Product {prodView === "grid" ? "Grid" : "List"}</h2>
                <div className="flex gap-2">
                  <button onClick={() => setProdView("list")} className={`px-4 py-2 rounded-full text-sm font-bold ${prodView === "list" ? "bg-neutral-900 text-white" : "border bg-white"}`}>☰ List</button>
                  <button onClick={() => setProdView("grid")} className={`px-4 py-2 rounded-full text-sm font-bold ${prodView === "grid" ? "bg-neutral-900 text-white" : "border bg-white"}`}>▦ Grid</button>
                  {!showForm && <button onClick={() => setShowForm(true)} className="px-4 py-2 rounded-full text-sm font-bold bg-amber-500 text-white">+ Create</button>}
                </div>
              </div>
              <div className="flex flex-col lg:flex-row gap-5 mt-4 items-start">
                {/* Filter panel (reference style) */}
                <div className="card p-4 w-full lg:w-64 shrink-0">
                  <p className="font-bold text-sm">Categories</p>
                  <div className="flex flex-col gap-1.5 mt-2">
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draftCats.includes("all")} onChange={() => setDraftCats(["all"])} /> All Categories</label>
                    {categories.map(c => (
                      <label key={c.id} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={draftCats.includes(c.id)} onChange={() => setDraftCats(prev => {
                          const withoutAll = prev.filter(x => x !== "all");
                          return withoutAll.includes(c.id) ? withoutAll.filter(x => x !== c.id) : [...withoutAll, c.id];
                        })} /> {c.name}
                      </label>
                    ))}
                  </div>
                  <p className="font-bold text-sm mt-5">Product Price</p>
                  <div className="flex flex-col gap-1.5 mt-2">
                    {PRICE_RANGES.map((r, i) => (
                      <label key={r.label} className="flex items-center gap-2 text-sm">
                        <input type="radio" name="price-range" checked={draftPrice === i} onChange={() => setDraftPrice(i)} /> {r.label}
                      </label>
                    ))}
                  </div>
                  <button onClick={() => { setAppliedCats(draftCats.length ? draftCats : ["all"]); setAppliedPrice(draftPrice); }} className="mt-4 w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-2.5 rounded-full text-sm">Apply</button>
                  <button onClick={() => { setDraftCats(["all"]); setAppliedCats(["all"]); setDraftPrice(0); setAppliedPrice(0); setProdQuery(""); }} className="mt-2 w-full border font-bold py-2 rounded-full text-sm">Clear Filters</button>
                </div>
                {/* Results */}
                <div className="flex-1 min-w-0 w-full">
                  {showForm && <div className="mb-5">{productForm}</div>}
                  <p className="text-sm text-slate-500">Showing {filteredProducts.length} of {products.length} products</p>
                  {prodView === "grid" ? (
                    <div className="grid grid-cols-2 xl:grid-cols-3 gap-4 mt-3">
                      {filteredProducts.map(p => (
                        <div key={p.id} className="card overflow-hidden">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={p.image_url} alt={p.name} className="w-full aspect-square object-cover" loading="lazy" />
                          <div className="p-3">
                            <p className="font-bold text-sm truncate">{p.name}</p>
                            <p className="text-xs text-slate-500 line-clamp-2 mt-0.5 min-h-8">{p.description}</p>
                            <p className="font-extrabold mt-1">{p.sale_price ? <>{formatBDT(p.sale_price)} <span className="line-through text-slate-400 text-xs font-normal">{formatBDT(p.price)}</span></> : formatBDT(p.price)}</p>
                            <p className="text-xs text-slate-500 mt-0.5">Stock {p.stock} • {p.active ? "Active" : "Hidden"}{p.featured ? " • Featured" : ""}</p>
                            <div className="flex gap-2 mt-2">
                              <button onClick={() => editProduct(p)} className="flex-1 border font-bold py-1.5 rounded-full text-xs">Edit</button>
                              <button onClick={() => deleteProduct(p.id, p.name)} className="flex-1 bg-red-50 text-red-600 font-bold py-1.5 rounded-full text-xs">Delete</button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2 mt-3">
                      {filteredProducts.map(p => (
                        <div key={p.id} className="card p-3 flex gap-3 items-center">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={p.image_url} alt={p.name} className="w-14 h-14 rounded-lg object-cover" />
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-sm truncate">{p.name}</p>
                            <p className="text-xs text-neutral-500">{p.sale_price ? <>{formatBDT(p.sale_price)} <span className="line-through">{formatBDT(p.price)}</span></> : formatBDT(p.price)} • Stock {p.stock} • {p.active ? "Active" : "Hidden"}{p.featured ? " • Featured" : ""}</p>
                          </div>
                          <button onClick={() => editProduct(p)} className="border font-bold px-3 py-1.5 rounded-full text-xs">Edit</button>
                          <button onClick={() => deleteProduct(p.id, p.name)} className="bg-red-50 text-red-600 font-bold px-3 py-1.5 rounded-full text-xs">Delete</button>
                        </div>
                      ))}
                    </div>
                  )}
                  {filteredProducts.length === 0 && <p className="text-sm text-neutral-500 mt-4">No products match these filters.</p>}
                </div>
              </div>
            </div>
          )}

          {tab === "orders" && (
            <div>
              {invoiceOrder ? (
                <div>
                  <div className="flex gap-2">
                    <button onClick={() => setInvoiceOrder(null)} className="border bg-white font-bold px-4 py-2 rounded-full text-sm">← Back to Orders</button>
                    <button onClick={() => window.print()} className="bg-neutral-900 text-white font-bold px-4 py-2 rounded-full text-sm">🖨️ Print Invoice</button>
                  </div>
                  <div className="card p-6 mt-4 max-w-2xl">
                    <div className="flex justify-between flex-wrap gap-2">
                      <div>
                        <p className="font-display font-bold text-2xl">{settings.store_name}</p>
                        <p className="text-sm text-slate-500">Invoice #{String(invoiceOrder.id).slice(0, 8).toUpperCase()}</p>
                      </div>
                      <div className="text-right text-sm">
                        <p>{new Date(invoiceOrder.created_at).toLocaleString()}</p>
                        <span className={statusBadge(invoiceOrder.status)}>{invoiceOrder.status}</span>
                      </div>
                    </div>
                    <div className="border-t mt-4 pt-4 text-sm">
                      <p className="font-bold">Billed to</p>
                      <p>{invoiceOrder.customer_name} • {invoiceOrder.phone}</p>
                      <p className="text-slate-600">{invoiceOrder.address} ({invoiceOrder.area === "dhaka" ? "Inside Dhaka" : "Outside Dhaka"})</p>
                    </div>
                    <table className="w-full text-sm mt-4">
                      <thead><tr className="text-left border-b"><th className="py-2">Item</th><th>Size</th><th>Qty</th><th className="text-right">Amount</th></tr></thead>
                      <tbody>
                        {invoiceOrder.order_items?.map((it, i) => (
                          <tr key={i} className="border-b"><td className="py-2">{it.product_name}</td><td>{it.size}</td><td>{it.qty}</td><td className="text-right">{formatBDT(Number(it.price) * it.qty)}</td></tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="text-sm mt-4 space-y-1">
                      <p className="flex justify-between"><span>Delivery</span><span>{formatBDT(Number(invoiceOrder.delivery_charge))}</span></p>
                      <p className="flex justify-between font-bold text-base"><span>Total</span><span>{formatBDT(Number(invoiceOrder.total))}</span></p>
                      <p className="text-slate-600">Payment: <b>{invoiceOrder.payment_method}</b>{invoiceOrder.payment_trx ? ` • TrxID: ${invoiceOrder.payment_trx}` : ""}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <h2 className="font-display font-bold text-2xl">Orders</h2>
                    <select className="border rounded-xl px-3 py-2.5 text-sm font-semibold !w-auto bg-white" value={orderStatusFilter} onChange={e => setOrderStatusFilter(e.target.value)}>
                      <option>All</option>
                      {STATUSES.map(st => <option key={st} value={st}>{st}</option>)}
                    </select>
                  </div>
                  <p className="text-xs text-neutral-500">Showing {shownOrders.length} of {orders.length} orders</p>
                  {shownOrders.map(o => (
                    <div key={o.id} className="card p-4">
                      <div className="flex justify-between flex-wrap gap-2">
                        <span className="flex items-center gap-2"><b>#{String(o.id).slice(0, 8)}</b><span className={statusBadge(o.status)}>{o.status}</span></span>
                        <span className="text-sm text-neutral-500">{new Date(o.created_at).toLocaleString()}</span>
                      </div>
                      <p className="text-sm mt-1">{o.customer_name} • {o.phone}</p>
                      <p className="text-sm text-neutral-600">{o.address} ({o.area === "dhaka" ? "Inside Dhaka" : "Outside Dhaka"})</p>
                      <div className="text-sm mt-2">{o.order_items?.map((it, i) => <p key={i}>• {it.product_name} (Size {it.size}) × {it.qty} — {formatBDT(Number(it.price) * it.qty)}</p>)}</div>
                      <p className="text-sm mt-2">Payment: <b>{o.payment_method}</b>{o.payment_trx ? ` • TrxID: ${o.payment_trx}` : ""} • Delivery {formatBDT(Number(o.delivery_charge))} • <b className="text-amber-600">Total {formatBDT(Number(o.total))}</b></p>
                      <div className="flex items-center gap-2 mt-3 flex-wrap">
                        <span className="text-xs font-bold uppercase">Status:</span>
                        <select value={o.status} onChange={e => setOrderStatus(o.id, e.target.value)} className="border rounded-full px-3 py-1.5 text-sm font-semibold !w-auto bg-white">
                          {STATUSES.map(st => <option key={st} value={st}>{st}</option>)}
                        </select>
                        <a href={`tel:${o.phone}`} className="border font-bold px-3 py-1.5 rounded-full text-xs">📞 Call Customer</a>
                        <a href={`https://wa.me/880${o.phone.replace(/\D/g, "").replace(/^0/, "")}`} target="_blank" rel="noreferrer" className="border font-bold px-3 py-1.5 rounded-full text-xs">💬 WhatsApp</a>
                        <button onClick={() => setInvoiceOrder(o)} className="border font-bold px-3 py-1.5 rounded-full text-xs">🧾 Invoice</button>
                      </div>
                    </div>
                  ))}
                  {orders.length === 0 && <p className="text-sm text-neutral-500">No orders yet.</p>}
                </div>
              )}
            </div>
          )}

          {tab === "customers" && (
            <div>
              <h2 className="font-display font-bold text-2xl">Customers</h2>
              <p className="text-sm text-slate-500 mt-1">Built from your orders — {shownCustomers.length} customers</p>
              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3 mt-4">
                {shownCustomers.map(c => (
                  <div key={c.phone} className="card p-4">
                    <div className="flex items-center gap-3">
                      <span className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center font-bold">{c.name.charAt(0).toUpperCase()}</span>
                      <div>
                        <p className="font-bold text-sm">{c.name}</p>
                        <p className="text-xs text-slate-500">{c.phone}</p>
                      </div>
                    </div>
                    <div className="flex gap-4 mt-3 text-sm">
                      <span><b>{c.count}</b> orders</span>
                      <span><b>{formatBDT(c.total)}</b> spent</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-2">Last order: {new Date(c.last).toLocaleDateString()}</p>
                    <div className="flex gap-2 mt-3">
                      <a href={`tel:${c.phone}`} className="border font-bold px-3 py-1.5 rounded-full text-xs">📞 Call</a>
                      <a href={`https://wa.me/880${c.phone.replace(/\D/g, "").replace(/^0/, "")}`} target="_blank" rel="noreferrer" className="border font-bold px-3 py-1.5 rounded-full text-xs">💬 WhatsApp</a>
                    </div>
                  </div>
                ))}
              </div>
              {shownCustomers.length === 0 && <p className="text-sm text-neutral-500 mt-4">No customers yet — customers appear here after their first order.</p>}
            </div>
          )}

          {tab === "settings" && (
            <div className="max-w-2xl card p-5 flex flex-col gap-4">
              <h3 className="font-display font-extrabold uppercase">Store Settings</h3>
              <div><p className={labelCls}>Store Name</p><input className={inputCls} value={settings.store_name} onChange={e => setSettings({ ...settings, store_name: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><p className={labelCls}>bKash Number</p><input className={inputCls} value={settings.bkash_number} onChange={e => setSettings({ ...settings, bkash_number: e.target.value })} /></div>
                <div><p className={labelCls}>Nagad Number</p><input className={inputCls} value={settings.nagad_number} onChange={e => setSettings({ ...settings, nagad_number: e.target.value })} /></div>
                <div><p className={labelCls}>Delivery — Dhaka ৳</p><input type="number" className={inputCls} value={settings.delivery_dhaka} onChange={e => setSettings({ ...settings, delivery_dhaka: Number(e.target.value) })} /></div>
                <div><p className={labelCls}>Delivery — Outside ৳</p><input type="number" className={inputCls} value={settings.delivery_outside} onChange={e => setSettings({ ...settings, delivery_outside: Number(e.target.value) })} /></div>
                <div><p className={labelCls}>Free Delivery Over ৳</p><input type="number" className={inputCls} value={settings.free_threshold} onChange={e => setSettings({ ...settings, free_threshold: Number(e.target.value) })} /></div>
                <div><p className={labelCls}>Facebook Group/Page URL</p><input className={inputCls} value={settings.facebook_url} onChange={e => setSettings({ ...settings, facebook_url: e.target.value })} /></div>
              </div>
              <h4 className="font-display font-extrabold uppercase text-sm mt-2">Hero Banners (3 slides)</h4>
              {[0, 1, 2].map(i => {
                const b = settings.hero_banners[i] || { image: "", headline: "", subheadline: "", link: "/shop" };
                const update = (patch: Partial<typeof b>) => {
                  const arr = [...settings.hero_banners];
                  while (arr.length < 3) arr.push({ image: "", headline: "", subheadline: "", link: "/shop" });
                  arr[i] = { ...arr[i], ...patch };
                  setSettings({ ...settings, hero_banners: arr });
                };
                return (
                  <div key={i} className="border rounded-xl p-3 flex flex-col gap-2">
                    <p className="text-xs font-bold">Slide {i + 1}</p>
                    <input className={inputCls} placeholder="Image URL" value={b.image} onChange={e => update({ image: e.target.value })} />
                    <input className={inputCls} placeholder="Headline (e.g. BIG SALE)" value={b.headline} onChange={e => update({ headline: e.target.value })} />
                    <input className={inputCls} placeholder="Sub-headline" value={b.subheadline} onChange={e => update({ subheadline: e.target.value })} />
                    <input className={inputCls} placeholder="Button link (e.g. /shop?category=men)" value={b.link} onChange={e => update({ link: e.target.value })} />
                  </div>
                );
              })}
              <button onClick={saveSettings} className="bg-amber-500 hover:bg-amber-600 text-white font-bold py-3 rounded-full">SAVE SETTINGS</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
