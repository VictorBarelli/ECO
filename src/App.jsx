import React, { useEffect, useMemo, useState } from "react";
import { MotionConfig } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid } from "recharts";
import { Check, Leaf, LogInIcon, Settings as SettingsIcon, TrendingUp, Users, Target, Trophy, ClipboardPlus, Home, PieChart as PieIcon } from "lucide-react";

/**
 * ESG Buddy — React SPA PWA que integra com Google Sheets (via OAuth no navegador) — sem back‑end.
 *
 * Telas:
 *  1) Conectar (OAuth Google) / Escolher Planilha
 *  2) Dashboard (KPIs & feed rápido)
 *  3) Registrar Ação (formulário)
 *  4) Insights (gráficos e metas)
 *  5) Desafios & Ranking (gamificação)
 *  6) Configurações (opcional)
 *
 * PWA (iOS): manifest.json, service worker, meta tags, safe‑area para notch e banner de instalação.
 * Armazenamento: Google Sheets — aba "actions".
 * Modo Demo: funciona sem login.
 */

// =============================
// Utilidades
// =============================
const nice = (n) => (n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

const DEFAULT_EMISSION_FACTORS = {
  Energia: 0.05, // kgCO2e por kWh (exemplo)
  Resíduos: 1.9, // kgCO2e por kg (aterro)
  Transporte: 0.12, // kgCO2e por km (carro médio)
  Social: 0,
  Governança: 0,
};

function computeEmissionKg({ categoria, quantidade, fatorCustom }) {
  const f = typeof fatorCustom === "number" ? fatorCustom : DEFAULT_EMISSION_FACTORS[categoria] ?? 0;
  const q = Number(quantidade) || 0;
  return +(q * f).toFixed(3);
}

function seedDemoRows() {
  const now = new Date();
  const rows = [];
  const cats = ["Energia", "Resíduos", "Transporte", "Social", "Governança"];
  for (let i = 0; i < 40; i++) {
    const d = new Date(now.getTime() - i * 36 * 3600 * 1000);
    const categoria = cats[i % cats.length];
    const quantidade = Math.round(1 + Math.random() * 20);
    const fator_emissao = [null, 0.09, 0.12, 0.05][i % 4];
    const emissao_kg = computeEmissionKg({ categoria, quantidade, fatorCustom: fator_emissao ?? undefined });
    rows.push([
      d.toISOString(),
      "demo@empresa.com",
      categoria,
      categoria === "Energia" ? "Reduziu ar-condicionado" : categoria === "Resíduos" ? "Reciclou papel" : categoria === "Transporte" ? "Carona solidária" : categoria === "Social" ? "Voluntariado" : "Treinou LGPD",
      quantidade,
      categoria === "Energia" ? "kWh" : categoria === "Resíduos" ? "kg" : categoria === "Transporte" ? "km" : categoria === "Social" ? "h" : "h",
      fator_emissao ?? "",
      emissao_kg,
      ""
    ]);
  }
  return rows;
}

function groupBy(arr, keyGetter) {
  const m = new Map();
  for (const item of arr) {
    const k = keyGetter(item);
    m.set(k, [...(m.get(k) || []), item]);
  }
  return m;
}

// =============================
// Integração Google (gapi) — client-side only
// =============================
const GAPI_SCRIPT = "https://apis.google.com/js/api.js";

function useGapi() {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const el = document.createElement("script");
    el.src = GAPI_SCRIPT;
    el.async = true;
    el.onload = () => setLoaded(true);
    document.head.appendChild(el);
    return () => { document.head.removeChild(el); };
  }, []);
  return loaded;
}

async function gapiLoad() {
  await window.gapi.load("client:auth2");
}

async function gapiInit({ apiKey, clientId }) {
  await window.gapi.client.init({
    apiKey,
    clientId,
    discoveryDocs: [
      "https://sheets.googleapis.com/$discovery/rest?version=v4",
      "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest",
    ],
    scope: "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file",
  });
}

async function gapiSignIn() {
  const GoogleAuth = window.gapi.auth2.getAuthInstance();
  if (!GoogleAuth) throw new Error("Auth não inicializado");
  const user = await GoogleAuth.signIn();
  return user.getBasicProfile().getEmail();
}

async function sheetsAppend({ spreadsheetId, rows }) {
  return await window.gapi.client.sheets.spreadsheets.values.append({
    spreadsheetId,
    range: "actions!A:I",
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    resource: { values: rows },
  });
}

async function sheetsReadAll({ spreadsheetId }) {
  const res = await window.gapi.client.sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "actions!A:I",
  });
  const values = res.result.values || [];
  return values;
}

// =============================
// PWA helpers (iOS)
// =============================
function InstallBanner() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isInStandalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || (navigator).standalone === true;
    if (isIOS && !isInStandalone) setVisible(true);
  }, []);
  if (!visible) return null;
  return (
    <div className="fixed bottom-16 left-3 right-3 bg-emerald-600 text-white rounded-2xl shadow-lg p-3 z-50" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 8px)' }}>
      <div className="text-sm font-medium">Instale este app no seu iPhone</div>
      <div className="text-xs opacity-90">Toque em <b>Compartilhar</b> → <b>Adicionar à Tela de Início</b>.</div>
      <button onClick={()=>setVisible(false)} className="mt-2 text-xs underline">Fechar</button>
    </div>
  );
}

// =============================
// Componentes de UI
// =============================
function Nav({ current, onNav }) {
  const items = [
    { id: "home", label: "Dashboard", icon: <Home size={18} /> },
    { id: "log", label: "Registrar", icon: <ClipboardPlus size={18} /> },
    { id: "insights", label: "Insights", icon: <PieIcon size={18} /> },
    { id: "challenges", label: "Desafios", icon: <Trophy size={18} /> },
    { id: "settings", label: "Config.", icon: <SettingsIcon size={18} /> },
  ];
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur border-t border-gray-200 flex justify-around p-2 z-50" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0px)' }}>
      {items.map((it) => (
        <button key={it.id} onClick={() => onNav(it.id)} className={`flex items-center gap-1 px-3 py-3 rounded-2xl ${current===it.id?"bg-gray-900 text-white":"hover:bg-gray-100"}`}>
          {it.icon}
          <span className="text-sm">{it.label}</span>
        </button>
      ))}
    </div>
  );
}

function Stat({ icon, label, value, subtitle }) {
  return (
    <div className="rounded-2xl p-4 shadow-sm bg-white border border-gray-100">
      <div className="flex items-center gap-2 text-gray-600 mb-2">{icon}<span className="text-sm">{label}</span></div>
      <div className="text-2xl font-semibold">{value}</div>
      {subtitle && <div className="text-xs text-gray-500 mt-1">{subtitle}</div>}
    </div>
  );
}

function Section({ title, children, right }) {
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-semibold">{title}</h3>
        {right}
      </div>
      {children}
    </div>
  );
}

// =============================
// Telas
// =============================
function ConnectScreen({ cfg, setCfg, onConnect, onDemo }) {
  const [busy, setBusy] = useState(false);
  const gLoaded = useGapi();

  const tryConnect = async () => {
    try {
      setBusy(true);
      if (!gLoaded) throw new Error("Biblioteca gapi ainda carregando");
      await gapiLoad();
      await gapiInit({ apiKey: cfg.apiKey || undefined, clientId: cfg.clientId });
      const email = await gapiSignIn();
      onConnect({ email });
    } catch (e) {
      alert(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center bg-gradient-to-b from-emerald-50 to-white p-4">
      <div className="max-w-xl w-full rounded-3xl shadow-lg border border-emerald-100 bg-white p-6">
        <div className="flex items-center gap-3 mb-2">
          <Leaf className="text-emerald-600" />
          <h1 className="text-2xl font-bold">ESG Buddy</h1>
        </div>
        <p className="text-gray-600 mb-4">Conecte sua conta Google e selecione uma planilha para registrar ações e acompanhar métricas ESG. Sem back‑end.</p>
        <div className="grid gap-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="text-sm">CLIENT_ID
              <input value={cfg.clientId} onChange={(e)=>setCfg(v=>({...v, clientId:e.target.value}))} placeholder="xxxxxxxxx.apps.googleusercontent.com" className="w-full mt-1 px-3 py-3 border rounded-xl" />
            </label>
            <label className="text-sm">API Key (opcional)
              <input value={cfg.apiKey} onChange={(e)=>setCfg(v=>({...v, apiKey:e.target.value}))} placeholder="AIza... (opcional)" className="w-full mt-1 px-3 py-3 border rounded-xl" />
            </label>
          </div>
          <label className="text-sm">Spreadsheet ID (sua planilha com aba actions)
            <input value={cfg.spreadsheetId} onChange={(e)=>setCfg(v=>({...v, spreadsheetId:e.target.value}))} placeholder="1AbCDeF..." className="w-full mt-1 px-3 py-3 border rounded-xl" />
          </label>
          <div className="flex flex-wrap gap-2 mt-2">
            <button onClick={tryConnect} disabled={busy || !cfg.clientId} className="px-4 py-3 rounded-2xl bg-emerald-600 text-white disabled:opacity-50 flex items-center gap-2"><LogInIcon size={16}/> {busy?"Conectando...":"Conectar com Google"}</button>
            <button onClick={onDemo} className="px-4 py-3 rounded-2xl bg-gray-900 text-white">Usar modo demo</button>
          </div>
          <details className="mt-2 text-sm text-gray-600">
            <summary className="cursor-pointer">Como criar a planilha?</summary>
            <ol className="list-decimal ml-6 mt-2 space-y-1">
              <li>Crie uma nova planilha e renomeie a primeira aba para <b>actions</b>.</li>
              <li>Na linha 1, crie os cabeçalhos: <code>timestamp, userEmail, categoria, acao, quantidade, unidade, fator_emissao, emissao_kg, notas</code>.</li>
              <li>Copie o ID da planilha (na URL) e cole acima.</li>
            </ol>
          </details>
        </div>
      </div>
    </div>
  );
}

function DashboardScreen({ rows, onNav }) {
  const parsed = useMemo(() => rows.map(r => ({
    timestamp: r[0],
    userEmail: r[1],
    categoria: r[2],
    acao: r[3],
    quantidade: Number(r[4]) || 0,
    unidade: r[5],
    fator: r[6] === "" ? undefined : Number(r[6]),
    emissao_kg: Number(r[7]) || 0,
    notas: r[8] || ""
  })), [rows]);

  const total = parsed.reduce((s, x) => s + (x.emissao_kg||0), 0);
  const byCat = Array.from(groupBy(parsed, x=>x.categoria)).map(([categoria, arr]) => ({ categoria, emissao: arr.reduce((s,x)=>s+x.emissao_kg,0) }));

  const last7 = parsed
    .filter(x => Date.now() - new Date(x.timestamp).getTime() <= 7*24*3600*1000)
    .reduce((s, x) => s + x.emissao_kg, 0);

  return (
    <div className="p-4 pb-24 max-w-6xl mx-auto">
      <div className="flex items-center gap-2 mb-4">
        <Leaf className="text-emerald-600"/>
        <h2 className="text-2xl font-bold">Dashboard</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Stat icon={<TrendingUp />} label="Emissões registradas (kg CO₂e)" value={nice(total)} subtitle="Somatório de todas as ações" />
        <Stat icon={<Target />} label="Últimos 7 dias" value={nice(last7)} />
        <Stat icon={<Users />} label="Ações registradas" value={nice(parsed.length)} />
        <Stat icon={<Check />} label="Categorias ativas" value={nice(byCat.length)} />
      </div>

      <Section title="Emissões por categoria">
        <div className="h-64 w-full bg-white rounded-2xl border p-3">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={byCat}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="categoria" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="emissao" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Section>

      <Section title="Feed de ações recentes" right={<button onClick={()=>onNav("log")} className="text-sm px-3 py-1 rounded-xl bg-gray-900 text-white">+ Registrar</button>}>
        <div className="grid gap-2">
          {parsed.slice(-10).reverse().map((x, i) => (
            <div key={i} className="bg-white border rounded-2xl p-3 flex items-center justify-between">
              <div>
                <div className="font-medium">{x.acao} <span className="text-gray-500">— {x.categoria}</span></div>
                <div className="text-sm text-gray-600">{new Date(x.timestamp).toLocaleString()} • {x.quantidade} {x.unidade} • {x.userEmail}</div>
              </div>
              <div className="text-right">
                <div className="font-semibold">{nice(x.emissao_kg)} kg</div>
                <div className="text-xs text-gray-500">CO₂e</div>
              </div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

function LogActionScreen({ onSubmit, defaultUser }) {
  const [form, setForm] = useState({
    timestamp: new Date().toISOString(),
    userEmail: defaultUser || "",
    categoria: "Energia",
    acao: "",
    quantidade: 1,
    unidade: "kWh",
    fator_emissao: "",
    notas: "",
  });

  useEffect(()=>{
    const mapUnit = { Energia: "kWh", Resíduos: "kg", Transporte: "km", Social: "h", Governança: "h" };
    setForm(f => ({ ...f, unidade: mapUnit[f.categoria] }));
  }, [form.categoria]);

  const emissao_kg = computeEmissionKg({ categoria: form.categoria, quantidade: form.quantidade, fatorCustom: form.fator_emissao === "" ? undefined : Number(form.fator_emissao) });

  const submit = (e) => {
    e.preventDefault();
    const row = [
      form.timestamp,
      form.userEmail,
      form.categoria,
      form.acao,
      Number(form.quantidade) || 0,
      form.unidade,
      form.fator_emissao,
      emissao_kg,
      form.notas,
    ];
    onSubmit(row);
  };

  return (
    <div className="p-4 pb-24 max-w-3xl mx-auto">
      <div className="flex items-center gap-2 mb-4">
        <ClipboardPlus/>
        <h2 className="text-2xl font-bold">Registrar Ação</h2>
      </div>
      <form onSubmit={submit} className="grid gap-3 bg-white border rounded-2xl p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="text-sm">Data/Hora
            <input type="datetime-local" value={new Date(form.timestamp).toISOString().slice(0,16)} onChange={(e)=>setForm(v=>({...v, timestamp:new Date(e.target.value).toISOString()}))} className="w-full mt-1 px-3 py-3 border rounded-xl"/>
          </label>
          <label className="text-sm">Seu e-mail
            <input value={form.userEmail} onChange={(e)=>setForm(v=>({...v, userEmail:e.target.value}))} placeholder="voce@empresa.com" className="w-full mt-1 px-3 py-3 border rounded-xl"/>
          </label>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="text-sm">Categoria
            <select value={form.categoria} onChange={(e)=>setForm(v=>({...v, categoria:e.target.value}))} className="w-full mt-1 px-3 py-3 border rounded-xl">
              {Object.keys(DEFAULT_EMISSION_FACTORS).map(c=> <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="text-sm">Quantidade
            <input type="number" step="0.01" value={form.quantidade} onChange={(e)=>setForm(v=>({...v, quantidade:e.target.value}))} className="w-full mt-1 px-3 py-3 border rounded-xl"/>
          </label>
          <label className="text-sm">Unidade
            <input value={form.unidade} onChange={(e)=>setForm(v=>({...v, unidade:e.target.value}))} className="w-full mt-1 px-3 py-3 border rounded-xl"/>
          </label>
        </div>
        <label className="text-sm">Ação (descrição curta)
          <input value={form.acao} onChange={(e)=>setForm(v=>({...v, acao:e.target.value}))} placeholder="Ex.: desligou 10 luzes" className="w-full mt-1 px-3 py-3 border rounded-xl"/>
        </label>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="text-sm">Fator de emissão (opcional)
            <input type="number" step="0.0001" value={form.fator_emissao} onChange={(e)=>setForm(v=>({...v, fator_emissao:e.target.value}))} placeholder="kgCO₂e por unidade" className="w-full mt-1 px-3 py-3 border rounded-xl"/>
          </label>
          <div className="text-sm bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center">Estimativa: <span className="font-semibold ml-1">{nice(emissao_kg)} kg CO₂e</span></div>
        </div>
        <label className="text-sm">Notas
          <textarea value={form.notas} onChange={(e)=>setForm(v=>({...v, notas:e.target.value}))} className="w-full mt-1 px-3 py-3 border rounded-xl" rows={3}/>
        </label>
        <div className="flex gap-2">
          <button className="px-4 py-3 rounded-2xl bg-gray-900 text-white">Salvar</button>
        </div>
      </form>
    </div>
  );
}

function InsightsScreen({ rows }) {
  const parsed = useMemo(() => rows.map(r => ({
    date: new Date(r[0]),
    categoria: r[2],
    emissao_kg: Number(r[7])||0,
  })), [rows]);

  const byMonth = useMemo(() => {
    const m = new Map();
    for (const x of parsed) {
      const key = `${x.date.getFullYear()}-${String(x.date.getMonth()+1).padStart(2,"0")}`;
      m.set(key, (m.get(key)||0) + x.emissao_kg);
    }
    return Array.from(m.entries()).map(([month, total]) => ({ month, total }));
  }, [parsed]);

  const byCat = useMemo(() => {
    const m = new Map();
    for (const x of parsed) m.set(x.categoria, (m.get(x.categoria)||0)+x.emissao_kg);
    const total = Array.from(m.values()).reduce((s,v)=>s+v,0) || 1;
    return Array.from(m.entries()).map(([categoria, val]) => ({ categoria, val, pct: +(100*val/total).toFixed(1) }));
  }, [parsed]);

  const goal = 150; // meta mensal (exemplo)
  const currentMonth = useMemo(()=>{
    const now = new Date();
    const key = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
    const item = byMonth.find(x=>x.month===key);
    return item?.total || 0;
  }, [byMonth]);

  return (
    <div className="p-4 pb-24 max-w-6xl mx-auto">
      <div className="flex items-center gap-2 mb-4">
        <PieIcon/>
        <h2 className="text-2xl font-bold">Insights & Metas</h2>
      </div>

      <Section title="Evolução mensal (kg CO₂e)">
        <div className="h-64 bg-white border rounded-2xl p-3">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={byMonth}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="total" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Section>

      <Section title="Distribuição por categoria">
        <div className="h-64 bg-white border rounded-2xl p-3">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={byCat} dataKey="val" nameKey="categoria" outerRadius={100} label>
                {byCat.map((_, i) => <Cell key={i} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </Section>

      <Section title="Meta do mês">
        <div className="rounded-2xl border bg-white p-4 flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-600">Meta mensal</div>
            <div className="text-2xl font-semibold">{nice(goal)} kg CO₂e</div>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-600">Acumulado</div>
            <div className="text-2xl font-semibold">{nice(currentMonth)} kg</div>
          </div>
        </div>
      </Section>
    </div>
  );
}

function ChallengesScreen({ rows }) {
  const parsed = useMemo(() => rows.map(r => ({ email: r[1], emissao_kg: Number(r[7])||0 })), [rows]);
  const byUser = useMemo(()=>{
    const m = new Map();
    for (const x of parsed) m.set(x.email, (m.get(x.email)||0)+x.emissao_kg);
    return Array.from(m.entries()).map(([email, total])=>({ email, total })).sort((a,b)=>b.total-a.total);
  }, [parsed]);

  return (
    <div className="p-4 pb-24 max-w-4xl mx-auto">
      <div className="flex items-center gap-2 mb-4">
        <Trophy/>
        <h2 className="text-2xl font-bold">Desafios & Ranking</h2>
      </div>
      <div className="bg-white border rounded-2xl p-4">
        <ol className="space-y-2">
          {byUser.map((u, i) => (
            <li key={u.email} className="flex items-center justify-between p-3 rounded-xl border">
              <div className="flex items-center gap-3">
                <span className="w-8 h-8 grid place-items-center rounded-full bg-gray-900 text-white">{i+1}</span>
                <div>
                  <div className="font-medium">{u.email}</div>
                  <div className="text-sm text-gray-600">{nice(u.total)} kg CO₂e</div>
                </div>
              </div>
              <button className="px-3 py-1 rounded-xl bg-emerald-600 text-white text-sm">Parabenizar</button>
            </li>
          ))}
        </ol>
      </div>
      <div className="mt-4 text-sm text-gray-600">
        Dica: crie campanhas (ex.: "Mês da Mobilidade Sustentável") e acompanhe a evolução pelo ranking. Pontue reduções estimadas de CO₂e.
      </div>
    </div>
  );
}

function SettingsScreen({ cfg, setCfg, onSync, connectedEmail }) {
  return (
    <div className="p-4 pb-24 max-w-3xl mx-auto">
      <div className="flex items-center gap-2 mb-4">
        <SettingsIcon/>
        <h2 className="text-2xl font-bold">Configurações</h2>
      </div>
      <div className="bg-white border rounded-2xl p-4 grid gap-3">
        <div className="text-sm text-gray-600">Conectado como: <b>{connectedEmail || "(não conectado)"}</b></div>
        <label className="text-sm">Spreadsheet ID
          <input value={cfg.spreadsheetId} onChange={(e)=>setCfg(v=>({...v, spreadsheetId:e.target.value}))} className="w-full mt-1 px-3 py-3 border rounded-xl"/>
        </label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="text-sm">CLIENT_ID
            <input value={cfg.clientId} onChange={(e)=>setCfg(v=>({...v, clientId:e.target.value}))} className="w-full mt-1 px-3 py-3 border rounded-xl"/>
          </label>
          <label className="text-sm">API Key (opcional)
            <input value={cfg.apiKey} onChange={(e)=>setCfg(v=>({...v, apiKey:e.target.value}))} className="w-full mt-1 px-3 py-3 border rounded-xl"/>
          </label>
        </div>
        <div className="flex gap-2">
          <button onClick={onSync} className="px-4 py-3 rounded-2xl bg-gray-900 text-white">Sincronizar planilha</button>
        </div>
        <details className="text-sm text-gray-600">
          <summary>Fatores de emissão padrão</summary>
          <ul className="list-disc ml-6 mt-2">
            {Object.entries(DEFAULT_EMISSION_FACTORS).map(([k,v])=> <li key={k}><b>{k}:</b> {v} kgCO₂e por unidade</li>)}
          </ul>
        </details>
      </div>
    </div>
  );
}

// =============================
// App principal
// =============================
export default function App() {
  const [screen, setScreen] = useState("connect");
  const [cfg, setCfg] = useState({ clientId: "", apiKey: "", spreadsheetId: "" });
  const [email, setEmail] = useState("");
  const [rows, setRows] = useState([]);
  const [demo, setDemo] = useState(false);

  // Registrar Service Worker (PWA)
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(()=>{});
    }
  }, []);

  useEffect(()=>{
    if (demo && rows.length===0) setRows(seedDemoRows());
  }, [demo]);

  const onConnect = async ({ email }) => {
    setEmail(email);
    setDemo(false);
    setScreen("home");
    if (cfg.spreadsheetId) {
      try {
        const all = await sheetsReadAll({ spreadsheetId: cfg.spreadsheetId });
        const headerless = all[0]?.[0]?.toLowerCase().includes("timestamp") ? all.slice(1) : all;
        setRows(headerless);
      } catch (e) {
        alert("Falha ao ler planilha: " + (e.message||String(e)));
      }
    }
  };

  const onDemo = () => {
    setDemo(true);
    setScreen("home");
  };

  const addRow = async (row) => {
    if (demo) {
      setRows(prev => [...prev, row]);
      alert("Ação salva (modo demo)");
      return;
    }
    if (!cfg.spreadsheetId) {
      alert("Configure o Spreadsheet ID nas Configurações");
      return;
    }
    try {
      await sheetsAppend({ spreadsheetId: cfg.spreadsheetId, rows: [row] });
      setRows(prev => [...prev, row]);
      alert("Ação salva na planilha!");
    } catch (e) {
      alert("Erro ao salvar: " + (e.message || String(e)));
    }
  };

  const syncSheet = async () => {
    if (demo) { alert("No modo demo, os dados já estão locais."); return; }
    if (!cfg.spreadsheetId) { alert("Informe o Spreadsheet ID"); return; }
    try {
      const all = await sheetsReadAll({ spreadsheetId: cfg.spreadsheetId });
      const headerless = all[0]?.[0]?.toLowerCase().includes("timestamp") ? all.slice(1) : all;
      setRows(headerless);
      alert("Sincronizado!");
    } catch (e) {
      alert("Falha: " + (e.message||String(e)));
    }
  };

  return (
    <MotionConfig>
      <div className="min-h-screen bg-gray-50 text-gray-900">
        <InstallBanner />
        {screen === "connect" && (
          <ConnectScreen cfg={cfg} setCfg={setCfg} onConnect={onConnect} onDemo={onDemo} />
        )}

        {screen !== "connect" && (
          <>
            {screen === "home" && <DashboardScreen rows={rows} onNav={setScreen} />}
            {screen === "log" && <LogActionScreen onSubmit={addRow} defaultUser={email || (demo?"demo@empresa.com":"")} />}
            {screen === "insights" && <InsightsScreen rows={rows} />}
            {screen === "challenges" && <ChallengesScreen rows={rows} />}
            {screen === "settings" && <SettingsScreen cfg={cfg} setCfg={setCfg} onSync={syncSheet} connectedEmail={email} />}
            <Nav current={screen} onNav={setScreen} />
          </>
        )}
      </div>
    </MotionConfig>
  );
}

/* =============================
   Arquivos adicionais para PWA (adicione em /public):

1) /public/manifest.json
{
  "name": "ESG Buddy",
  "short_name": "ESG Buddy",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#10b981",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}

2) /public/sw.js
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open('esg-buddy-v1').then((cache) =>
      cache.addAll(['/', '/index.html', '/manifest.json'])
    )
  );
});
self.addEventListener('fetch', (e) => {
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});

3) Adicione no <head> do seu index.html:
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<link rel="manifest" href="/manifest.json" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<link rel="apple-touch-icon" href="/icons/icon-192.png" />
============================= */
