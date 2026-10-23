"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { EmptyBlock, Panel } from "@/components/kit";
import type { EmptyGroup } from "@/lib/domain/stockKosong";

const nf = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });
const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/**
 * "Stock Kosong": devices that sold in the last 30 days but are empty in the SOH, per brand, with a
 * brand filter and a copy button that puts a WhatsApp-ready request for the warehouse team on the clipboard.
 */
export function StockKosong({ groups, text, range }: { groups: EmptyGroup[]; text: Record<string, string>; range: string }) {
  const [cat, setCat] = useState("");
  const [copied, setCopied] = useState(false);
  const shown = cat ? groups.filter((g) => g.category === cat) : groups;
  const total = shown.reduce((a, g) => a + g.items.length, 0);

  const copy = async () => {
    const t = text[cat] ?? text[""];
    try {
      await navigator.clipboard.writeText(t);
    } catch {
      // older browsers / no permission: select-and-copy fallback
      const ta = document.createElement("textarea");
      ta.value = t;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!groups.length)
    return (
      <Panel>
        <EmptyBlock title="Tidak ada stock kosong" need={false}>Semua device yang terjual {range} masih ada stoknya di SOH terakhir.</EmptyBlock>
      </Panel>
    );

  return (
    <>
      <section className="sd-panel flex flex-wrap gap-1.5 p-2.5 sm:gap-2 sm:p-3" aria-label="Filter brand">
        {[{ category: "", items: groups.flatMap((g) => g.items) }, ...groups].map((g) => (
          <button key={g.category || "all"} type="button" aria-pressed={g.category === cat} onClick={() => setCat(g.category)} className={`rounded-xl px-2.5 py-1.5 text-xs font-semibold sm:px-4 sm:py-2 sm:text-sm ${g.category === cat ? "bg-slate-500 text-white" : "text-slate-500 hover:bg-slate-100"}`}>
            {g.category || "Semua"} <span className="opacity-70">{g.items.length}</span>
          </button>
        ))}
      </section>

      <Panel
        title={cat || "Semua brand"}
        desc={`${total} artikel terjual ${range} tapi stoknya 0 / tidak ada di SOH. Urut dari yang paling laku.`}
        right={
          <button type="button" className="sd-btn primary" onClick={() => void copy()}>
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? "Tersalin" : "Copy untuk gudang"}
          </button>
        }
      >
        <div className="space-y-5">
          {shown.map((g) => (
            <div key={g.category}>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-black text-slate-900 dark:text-white">{g.category}</h3>
                <span className="sd-badge red">{g.items.length} kosong</span>
                <span className="sd-badge slate">sold {nf.format(g.sold)}</span>
                {!g.inSoh && <span className="sd-badge amber">brand ini tidak ada di SOH</span>}
              </div>
              <ul className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
                {g.items.map((it) => (
                  <li key={it.article} className="flex items-start justify-between gap-3 px-3 py-2.5">
                    <span className="min-w-0 text-[13px] leading-snug">
                      <span className="block font-semibold text-slate-800 dark:text-slate-100">{it.description || it.article}</span>
                      <span className="mt-0.5 block text-[11px] text-slate-400"><span className="font-mono">{it.article}</span> · terakhir terjual {dm(it.lastSold)}</span>
                      {it.alt.length > 0 && (
                        <span className="mt-1 block text-[11px] text-emerald-700 dark:text-emerald-400">
                          Warna lain ready: {it.alt.map((a) => `${a.color} ${a.qty}`).join(" · ")}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-right">
                      <b className="block text-base tabular-nums">{nf.format(it.sold)}</b>
                      <span className="block text-[10px] font-semibold text-slate-400 uppercase">sold</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Panel>
    </>
  );
}
