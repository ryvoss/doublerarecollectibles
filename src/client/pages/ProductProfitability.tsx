import { useEffect, useState } from "react";

type ProductPerformance = {
  productId: number;
  itemId: string;
  productName: string;
  unitsSold: number;
  revenue: number;
  cogs: number;
  grossProfit: number;
  grossMargin: number;
  roi: number;
  hasSales: boolean;
};
type PerformanceResponse = {
  products: ProductPerformance[];
  rankings: {
    bestSeller: ProductPerformance | null;
    highestGrossProfit: ProductPerformance | null;
    highestRoi: ProductPerformance | null;
  };
};
type SortField = "unitsSold" | "revenue" | "cogs" | "grossProfit" | "grossMargin" | "roi";

const money = (value: number) => new Intl.NumberFormat("en-US", {style: "currency", currency: "USD"}).format(value);
const percent = (value: number) => new Intl.NumberFormat("en-US", {style: "percent", maximumFractionDigits: 1}).format(value);

export default function ProductProfitability({refresh}: {refresh: number}) {
  const [data, setData] = useState<PerformanceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [search, setSearch] = useState("");
  const [includeUnsold, setIncludeUnsold] = useState(false);
  const [sortBy, setSortBy] = useState<SortField>("grossProfit");

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/sales/product-performance", {signal: controller.signal});
        if (!response.ok) throw new Error("Product profitability could not be loaded.");
        const result: PerformanceResponse = await response.json();
        if (!controller.signal.aborted) setData(result);
      } catch (error) {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Product profitability could not be loaded.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [refresh, retry]);

  const query = search.trim().toLowerCase();
  const products = (data?.products ?? []).filter((product) =>
    (includeUnsold || product.hasSales) && `${product.itemId} ${product.productName}`.toLowerCase().includes(query)
  ).sort((left, right) => {
    // Undefined ROI must sort below valid ROI, including negative returns.
    const eligible = (product: ProductPerformance) => sortBy === "roi"
      ? product.hasSales && product.cogs > 0 : product.hasSales;
    if (eligible(left) !== eligible(right)) return eligible(left) ? -1 : 1;
    return right[sortBy] - left[sortBy] || left.productName.localeCompare(right.productName);
  });

  return <section className="panel" style={{marginTop: "24px"}}>
    <div className="panel-header">
      <div><h3>Product Profitability</h3><p>All-time sealed sales, including inactive products. Uses historical sale values and FIFO costs.</p></div>
      <button type="button" disabled={loading} style={controlStyle} onClick={() => setRetry((value) => value + 1)}>Refresh Report</button>
    </div>
    <div style={{padding: "20px"}}>
      {loading ? <p role="status">Loading profitability...</p> : error ? <p role="alert">{error}</p> : data && <>
        <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "14px", marginBottom: "20px"}}>
          <Ranking label="Best Seller" product={data.rankings.bestSeller} value={data.rankings.bestSeller ? `${data.rankings.bestSeller.unitsSold} units sold` : "No eligible sales"} />
          <Ranking label="Highest Gross Profit" product={data.rankings.highestGrossProfit} value={data.rankings.highestGrossProfit ? money(data.rankings.highestGrossProfit.grossProfit) : "No eligible sales"} />
          <Ranking label="Highest ROI" product={data.rankings.highestRoi} value={data.rankings.highestRoi ? percent(data.rankings.highestRoi.roi) : "No eligible sales"} />
        </div>
        <div style={{display: "flex", flexWrap: "wrap", gap: "14px", alignItems: "center"}}>
          <input aria-label="Search product profitability" placeholder="Search product or Item ID" value={search} onChange={(event) => setSearch(event.target.value)} style={controlStyle} />
          <label style={{fontSize: "12px", color: "#a7a7ad"}}>Sort by{" "}
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value as SortField)} style={controlStyle}>
              <option value="grossProfit">Gross profit</option><option value="revenue">Revenue</option>
              <option value="unitsSold">Units sold</option><option value="cogs">FIFO COGS</option>
              <option value="grossMargin">Gross margin</option><option value="roi">ROI</option>
            </select>
          </label>
          <label style={{fontSize: "12px", color: "#a7a7ad"}}><input type="checkbox" checked={includeUnsold} onChange={(event) => setIncludeUnsold(event.target.checked)} /> Include products without sales</label>
        </div>
        <p style={{fontSize: "12px", color: "#898a91"}}>ROI = gross profit / FIFO COGS. ROI is unavailable without sales or positive COGS. Rankings cover all products and are unaffected by search or the transaction filters above.</p>
        {products.length === 0 ? <p>No products match. Record a sale or include products without sales.</p> :
          <div style={{overflowX: "auto"}}><table style={{width: "100%", borderCollapse: "collapse"}}>
            <thead><tr>{["Item ID", "Product", "Units Sold", "Revenue", "FIFO COGS", "Gross Profit", "Gross Margin", "ROI"].map((label) =>
              <th key={label} style={{...cellStyle, color: "#898a91", fontSize: "11px"}}>{label}</th>)}
            </tr></thead>
            <tbody>{products.map((product) => <tr key={product.productId}>
              <td style={cellStyle}>{product.itemId}</td><td style={cellStyle}>{product.productName}</td>
              <td style={cellStyle}>{product.unitsSold}</td><td style={cellStyle}>{money(product.revenue)}</td>
              <td style={cellStyle}>{money(product.cogs)}</td>
              <td style={{...cellStyle, color: product.grossProfit < 0 ? "#e47b7b" : "#a7a7ad"}}>{money(product.grossProfit)}</td>
              <td style={cellStyle}>{percent(product.grossMargin)}</td>
              <td style={cellStyle}>{product.hasSales && product.cogs > 0 ? percent(product.roi) : "N/A"}</td>
            </tr>)}</tbody>
          </table></div>}
      </>}
    </div>
  </section>;
}

function Ranking({label, product, value}: {label: string; product: ProductPerformance | null; value: string}) {
  return <article className="metric-card">
    <span className="metric-label">{label}</span>
    <strong style={{fontSize: "17px", margin: "10px 0", color: "#e5e5e7"}}>{product?.productName ?? "No ranking yet"}</strong>
    <span className="metric-detail">{value}</span>
  </article>;
}

const controlStyle = {padding: "9px 12px", border: "1px solid #303137", borderRadius: "7px", background: "#18191d", color: "#c8c8cd", fontSize: "12px"};
const cellStyle = {padding: "14px 16px", borderBottom: "1px solid #303137", textAlign: "left" as const, color: "#a7a7ad", fontSize: "13px", whiteSpace: "nowrap" as const};
