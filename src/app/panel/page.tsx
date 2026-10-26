"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { formatBDT } from "@/lib/data";
import type { Order, Settings } from "@/lib/types";
import { defaultSettings } from "@/lib/data";

type Tab = "dashboard" | "products" | "orders" | "categories" | "settings";
const STATUSES = ["Pending", "Confirmed", "Shipped", "Delivered", "Cancelled"];
const statusBadge = (st: string) => "badge " + ({
  Pending: "bg-amber-100 text-amber-800", Confirmed: "bg-blue-100 text-blue-800",
  Shipped: "bg-violet-100 text-violet-800", Delivered: "bg-emerald-100 text-emerald-800",
  Cancelled: "bg-red-100 text-red-600"
} as Record<string, string>)[st] || "bg-slate-100 text-slate-700";

interface RawProduct { id: string; name: string; description: string; category_id: string; price: number; sale_price: number | null; image_url: string; sizes: string; stock: number; featured: boolean; active: boolean; }
interface RawCategory { id: string; name: string; slug: string; }

const emptyProduct: Omit<RawProduct, "id"> = { name: "", description: "", category_id: "", price: 0, sale_price: null, image_url: "", sizes: "S,M,L,XL", stock: 10, featured: false, active: true };

export default function AdminPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>("dashboard");
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
  // admin search/filter (client-side, over already-loaded data)
  const [orderQuery, setOrderQuery] = useState("");
  const [orderStatusFilter, setOrderStatusFilter] = useState("All");
  const [prodQuery, setProdQuery] = useState("");

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
  const shownProducts = products.filter(p => prodQuery.trim() === "" || p.name.toLowerCase().includes(prodQuery.toLowerCase()));

  const inputCls = "border rounded-xl px-3 py-2.5 w-full text-sm";
  const labelCls = "text-xs font-bold uppercase text-neutral-500";

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="sticky top-0 z-10 -mx-4 px-4 py-3 bg-white/90 backdrop-blur border-b border-slate-200 flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-display font-bold text-xl text-emerald-700">🛍️ KAPOR Admin</h1>
        <div className="flex gap-2"><a href="https://clothing-store-mauve-pi.vercel.app/" target="_blank" rel="noreferrer" className="btn-secondary py-2 text-sm">View Store</a><button onClick={logout} className="btn-secondary py-2 text-sm">Logout</button></div>
      </div>
      {msg && <p className="mt-3 bg-green-50 border border-green-200 text-green-800 rounded-xl px-4 py-2 text-sm font-semibold">{msg}</p>}
      <div className="flex gap-2 mt-4 overflow-x-auto no-scrollbar">
        {(["dashboard", "products", "orders", "categories", "settings"] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-full font-bold text-sm uppercase whitespace-nowrap ${tab === t ? "bg-emerald-600 text-white" : "border"}`}>{t}</button>
        ))}
      </div>

      {tab === "dashboard" && (
        <div className="mt-6">
          <div className="rounded-2xl bg-gradient-to-r from-emerald-700 to-emerald-500 p-5 text-white mb-5">
            <p className="text-xl font-bold">Welcome back, Admin 👋</p>
            <p className="mt-1 text-emerald-50 text-sm">Ajke {todayOrders} ta order • {pending} ta pending • Mot {orders.length} ta order</p>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="card p-5"><p className="text-xs uppercase text-neutral-500 font-bold">Revenue (Delivered)</p><p className="text-2xl font-black text-emerald-700 mt-1">{formatBDT(revenue)}</p></div>
            <div className="card p-5"><p className="text-xs uppercase text-neutral-500 font-bold">Total Orders</p><p className="text-2xl font-black mt-1">{orders.length}</p></div>
            <div className="card p-5"><p className="text-xs uppercase text-neutral-500 font-bold">Pending Orders</p><p className="text-2xl font-black mt-1 text-amber-600">{pending}</p></div>
            <div className="card p-5"><p className="text-xs uppercase text-neutral-500 font-bold">Products</p><p className="text-2xl font-black mt-1">{products.length}</p></div>
            <div className="card p-5"><p className="text-xs uppercase text-neutral-500 font-bold">Today&apos;s Orders</p><p className="text-2xl font-black mt-1">{todayOrders}</p></div>
            <div className="card p-5"><p className="text-xs uppercase text-neutral-500 font-bold">Total Revenue (excl. Cancelled)</p><p className="text-2xl font-black text-emerald-700 mt-1">{formatBDT(totalRevenue)}</p></div>
          </div>
          <h3 className="font-display font-extrabold uppercase mt-8 mb-3">⚠️ Low Stock (under 5)</h3>
          {lowStock.length === 0 ? <p className="text-sm text-neutral-500">No low-stock products. Good!</p> : (
            <div className="flex flex-col gap-2">{lowStock.map(p => <div key={p.id} className="border border-amber-200 bg-amber-50 rounded-xl px-4 py-2 text-sm flex justify-between"><span>{p.name}</span><b>Stock: {p.stock}</b></div>)}</div>
          )}
          <h3 className="font-display font-extrabold uppercase mt-8 mb-3">Latest Orders</h3>
          <div className="flex flex-col gap-2">{orders.slice(0, 5).map(o => <div key={o.id} className="border rounded-xl px-4 py-2 text-sm flex justify-between flex-wrap gap-2"><span>#{String(o.id).slice(0, 8)} — {o.customer_name} ({o.phone})</span><span><span className={statusBadge(o.status)}>{o.status}</span> • <b>{formatBDT(Number(o.total))}</b></span></div>)}</div>
        </div>
      )}

      {tab === "products" && (
        <div className="mt-6 grid lg:grid-cols-5 gap-6">
          <div className="lg:col-span-2 card p-5 h-fit">
            <h3 className="font-display font-extrabold uppercase mb-3">{form.id ? "Edit Product" : "Add Product"}</h3>
            <div className="flex flex-col gap-3">
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
              <button onClick={saveProduct} className="bg-emerald-600 text-white font-bold py-3 rounded-full">{form.id ? "UPDATE PRODUCT" : "ADD PRODUCT"}</button>
              {form.id && <button onClick={() => setForm(emptyProduct)} className="border font-bold py-2 rounded-full text-sm">Cancel Edit</button>}
            </div>
          </div>
          <div className="lg:col-span-3 flex flex-col gap-2">
            <input className={inputCls} placeholder="Search products by name..." value={prodQuery} onChange={e => setProdQuery(e.target.value)} />
            {shownProducts.map(p => (
              <div key={p.id} className="card p-3 flex gap-3 items-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.image_url} alt={p.name} className="w-14 h-14 rounded-lg object-cover" />
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm truncate">{p.name}</p>
                  <p className="text-xs text-neutral-500">{p.sale_price ? <>{formatBDT(p.sale_price)} <span className="line-through">{formatBDT(p.price)}</span></> : formatBDT(p.price)} • Stock {p.stock} • {p.active ? "Active" : "Hidden"}{p.featured ? " • Featured" : ""}</p>
                </div>
                <button onClick={() => setForm({ ...p })} className="border font-bold px-3 py-1.5 rounded-full text-xs">Edit</button>
                <button onClick={() => deleteProduct(p.id, p.name)} className="bg-red-50 text-red-600 font-bold px-3 py-1.5 rounded-full text-xs">Delete</button>
              </div>
            ))}
            {products.length === 0 && <p className="text-sm text-neutral-500">No products yet. Add your first product from the form.</p>}
          </div>
        </div>
      )}

      {tab === "orders" && (
        <div className="mt-6 flex flex-col gap-3">
          <div className="flex gap-2 flex-wrap">
            <input className={`${inputCls} flex-1 min-w-[200px]`} placeholder="Search by customer name or phone..." value={orderQuery} onChange={e => setOrderQuery(e.target.value)} />
            <select className="border rounded-xl px-3 py-2.5 text-sm font-semibold w-auto" value={orderStatusFilter} onChange={e => setOrderStatusFilter(e.target.value)}>
              <option>All</option>
              {STATUSES.map(st => <option key={st} value={st}>{st}</option>)}
            </select>
          </div>
          <p className="text-xs text-neutral-500">Showing {shownOrders.length} of {orders.length} orders</p>
          {shownOrders.map(o => (
            <div key={o.id} className="card p-5">
              <div className="flex justify-between flex-wrap gap-2">
                <span className="flex items-center gap-2"><b>#{String(o.id).slice(0, 8)}</b><span className={statusBadge(o.status)}>{o.status}</span></span>
                <span className="text-sm text-neutral-500">{new Date(o.created_at).toLocaleString()}</span>
              </div>
              <p className="text-sm mt-1">{o.customer_name} • {o.phone}</p>
              <p className="text-sm text-neutral-600">{o.address} ({o.area === "dhaka" ? "Inside Dhaka" : "Outside Dhaka"})</p>
              <div className="text-sm mt-2">{o.order_items?.map((it, i) => <p key={i}>• {it.product_name} (Size {it.size}) × {it.qty} — {formatBDT(Number(it.price) * it.qty)}</p>)}</div>
              <p className="text-sm mt-2">Payment: <b>{o.payment_method}</b>{o.payment_trx ? ` • TrxID: ${o.payment_trx}` : ""} • Delivery {formatBDT(Number(o.delivery_charge))} • <b className="text-emerald-700">Total {formatBDT(Number(o.total))}</b></p>
              <div className="flex items-center gap-2 mt-3">
                <span className="text-xs font-bold uppercase">Status:</span>
                <select value={o.status} onChange={e => setOrderStatus(o.id, e.target.value)} className="border rounded-full px-3 py-1.5 text-sm font-semibold w-auto">
                  {STATUSES.map(st => <option key={st} value={st}>{st}</option>)}
                </select>
                <a href={`tel:${o.phone}`} className="border font-bold px-3 py-1.5 rounded-full text-xs">📞 Call Customer</a>
                <a href={`https://wa.me/880${o.phone.replace(/\D/g, "").replace(/^0/, "")}`} target="_blank" rel="noreferrer" className="border font-bold px-3 py-1.5 rounded-full text-xs">💬 WhatsApp</a>
              </div>
            </div>
          ))}
          {orders.length === 0 && <p className="text-sm text-neutral-500">No orders yet.</p>}
        </div>
      )}

      {tab === "categories" && (
        <div className="mt-6 max-w-lg">
          <div className="card p-5 flex flex-col gap-3">
            <h3 className="font-display font-extrabold uppercase">Add Category</h3>
            <input className={inputCls} placeholder="Name (e.g. Shoes)" value={catName} onChange={e => setCatName(e.target.value)} />
            <input className={inputCls} placeholder="Slug (optional, e.g. shoes)" value={catSlug} onChange={e => setCatSlug(e.target.value)} />
            <button onClick={saveCategory} className="bg-emerald-600 text-white font-bold py-2.5 rounded-full">ADD CATEGORY</button>
          </div>
          <div className="flex flex-col gap-2 mt-4">
            {categories.map(c => (
              <div key={c.id} className="card px-4 py-2.5 flex justify-between items-center">
                <span className="font-semibold text-sm">{c.name} <span className="text-neutral-400">/{c.slug}</span></span>
                <button onClick={() => deleteCategory(c.id, c.name)} className="bg-red-50 text-red-600 font-bold px-3 py-1 rounded-full text-xs">Delete</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "settings" && (
        <div className="mt-6 max-w-2xl card p-5 flex flex-col gap-4">
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
          <button onClick={saveSettings} className="bg-emerald-600 text-white font-bold py-3 rounded-full">SAVE SETTINGS</button>
        </div>
      )}
    </div>
  );
}
