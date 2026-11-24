import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { adminFetch } from "../adminFetch";
import { accountingRanges, expenseCategories, ledgerTypes, paidFromLabels, selectLedger } from "../../shared/accounting";
import type { AccountingReport, Expense, ExpenseFacts, PaidFrom } from "../../shared/accounting";
import "./AccountingPage.css";
const money = (value: string) => new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(Number(value));
const today = () => new Intl.DateTimeFormat("en-CA",{timeZone:"America/Chicago",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const newExpense = (): ExpenseFacts => ({date:today(),description:"",category:"Other",amount:"",paidFrom:"SEALED"});
export default function AccountingPage({onView}: {onView:(source:"SALE"|"ORDER"|"FUNDS",id:number)=>void}) {
  const [range,setRange]=useState("This Month"),[from,setFrom]=useState(""),[to,setTo]=useState("");
  const [type,setType]=useState("All"),[category,setCategory]=useState("All"),[ascending,setAscending]=useState(false);
  const [report,setReport]=useState<AccountingReport|null>(null),[error,setError]=useState(""),[loading,setLoading]=useState(true),[refresh,setRefresh]=useState(0);
  const [editing,setEditing]=useState<Expense|null>(null),[facts,setFacts]=useState<ExpenseFacts>(newExpense),[saving,setSaving]=useState(false),[formError,setFormError]=useState("");
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const changed=()=>setRefresh(n=>n+1);window.addEventListener("business-data-changed",changed);return()=>window.removeEventListener("business-data-changed",changed);},[]);
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);setError("");
    const query=new URLSearchParams({range,...(range === "Custom" ? {from,to} : {})});
    void adminFetch(`/api/accounting/ledger?${query}`,{signal:controller.signal}).then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error);if(!controller.signal.aborted)setReport(data);}).catch(cause=>{if(!controller.signal.aborted)setError(cause.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[range,from,to,refresh]);
  function open(expense:Expense|null) {setEditing(expense);setFacts(expense ? {date:expense.date,description:expense.description,category:expense.category,amount:expense.amount,paidFrom:expense.paidFrom} : newExpense());setFormError("");dialog.current?.showModal();}
  async function save(event:FormEvent) {event.preventDefault();await mutate(editing ? "PATCH" : "POST",editing?.id,{...facts,...(editing ? {version:editing.version} : {})});}
  async function mutate(method:string,id:number|undefined,body:unknown) {
    setSaving(true);setFormError("");try {
      const response=await adminFetch(`/api/accounting/expenses${id ? `/${id}` : ""}`,{method,headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
      const data=await response.json();if(!response.ok)throw new Error(data.error);dialog.current?.close();window.dispatchEvent(new Event("business-data-changed"));
    } catch(cause){setFormError(cause instanceof Error ? cause.message : "Expense could not be saved.");}finally{setSaving(false);}
  }
  const rows=selectLedger(report?.rows ?? [],type,category,ascending);
  return <section className="accounting-page"><header><h2>Accounting</h2><button className="primary-button" onClick={()=>open(null)}>Add Expense</button></header>
    <div className="accounting-filters"><label>Period<select value={range} onChange={e=>setRange(e.target.value)}>{accountingRanges.map(value=><option key={value}>{value}</option>)}</select></label>
      {range === "Custom" && <><label>From<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>To<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label></>}
      <label>Type<select value={type} onChange={e=>setType(e.target.value)}>{["All",...ledgerTypes].map(value=><option key={value}>{value}</option>)}</select></label>
      <label>Category<select value={category} onChange={e=>setCategory(e.target.value)}>{["All","Sales","Inventory",...expenseCategories].map(value=><option key={value}>{value}</option>)}</select></label>
      <button className="secondary-button" onClick={()=>setRefresh(n=>n+1)} disabled={loading}>Refresh</button>
    </div>
    {loading ? <p role="status">Loading ledger...</p> : error ? <p role="alert">{error}</p> : report && <>
      <div className="accounting-summary" aria-label="Selected period summary">{([["Revenue","revenue"],["COGS","cogs"],["Gross Profit","grossProfit"],["Expenses","expenses"],["Net Operating Profit","netOperatingProfit"],["Inventory Acquired (net)","inventoryPurchases"],["Inventory Cash Paid (net)","inventoryCashPaid"],["Net Cash Movement","netCashMovement"]] as const).map(([label,key])=><span key={key}>{label}<strong>{money(report.summary[key])}</strong></span>)}</div>
      <p className="accounting-note">Totals cover the selected period; type/category filters only narrow rows. Profit uses sealed Sales less allocation COGS and expenses. Inventory purchases are separate. Cash movement includes all existing Funds entries, including contributions, refunds, pack proceeds and Singles reconciliation.</p>
      <div className="accounting-scroll"><table><thead><tr><th aria-sort={ascending ? "ascending" : "descending"}><button onClick={()=>setAscending(!ascending)}>Date {ascending ? "Asc" : "Desc"}</button></th><th>Type</th><th>Description</th><th className="accounting-secondary">Category</th><th className="accounting-amount">Amount</th><th className="accounting-secondary">Paid From / Method</th><th className="accounting-secondary">Reference</th><th>Actions</th></tr></thead>
        <tbody>{rows.map(row=><tr key={row.id}><td>{row.date.slice(5).replace("-","/")+"/"+row.date.slice(2,4)}</td><td><span className={`accounting-type ${row.sourceType.toLowerCase()}`}>{row.type}</span></td><td><details><summary>{row.description}</summary><p>{row.detail}</p><p>{row.category} | {row.paymentMethod} | {row.referenceLabel}</p></details></td><td className="accounting-secondary">{row.category}</td><td className="accounting-amount">{Number(row.amount)>0 ? "+" : ""}{money(row.amount)}</td><td className="accounting-secondary">{row.paymentMethod}</td><td className="accounting-secondary">{row.referenceLabel}</td><td>{row.expense ? <button onClick={()=>open(row.expense!)}>Edit</button> : <button onClick={()=>onView(row.sourceType as "SALE"|"ORDER"|"FUNDS",row.sourceId)}>View</button>}</td></tr>)}</tbody></table></div>
      {!rows.length && <p>No transactions in this view.</p>}
      <p className="accounting-note">Expense edits restate the selected expense date. Voiding restores Funds; the original postings and revisions are retained. No duplicate cash deduction is made for Orders or COGS.</p>
    </>}
    <dialog ref={dialog} className="expense-dialog" onCancel={event=>{if(saving)event.preventDefault();}}><form onSubmit={save}><h3>{editing ? `Edit Expense #${editing.id}` : "Add Expense"}</h3>
      <label>Date<input required type="date" value={facts.date} onChange={e=>setFacts({...facts,date:e.target.value})}/></label>
      <label>Description<input autoFocus required maxLength={200} value={facts.description} onChange={e=>setFacts({...facts,description:e.target.value})}/></label>
      <label>Category<select value={facts.category} onChange={e=>setFacts({...facts,category:e.target.value})}>{expenseCategories.map(value=><option key={value}>{value}</option>)}</select></label>
      <label>Amount<input required type="number" min="0.01" max="9999999999.99" step="0.01" value={facts.amount} onChange={e=>setFacts({...facts,amount:e.target.value})}/></label>
      <label>Paid From<select value={facts.paidFrom} onChange={e=>setFacts({...facts,paidFrom:e.target.value as PaidFrom})}>{Object.entries(paidFromLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
      {formError && <p role="alert">{formError}</p>}<footer>{editing && <button type="button" className="danger-button" disabled={saving} onClick={()=>{if(window.confirm("Void this expense and restore its Funds? The audit history will be retained."))void mutate("DELETE",editing.id,{version:editing.version});}}>Delete / Void</button>}<button type="button" className="secondary-button" disabled={saving} onClick={()=>dialog.current?.close()}>Cancel</button><button className="primary-button" disabled={saving}>{saving ? "Saving..." : "Save"}</button></footer>
    </form></dialog>
  </section>;
}
