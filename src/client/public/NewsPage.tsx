import { useEffect, useState } from "react";
import type { PublicNewsArticle, PublicNewsSummary } from "../../shared/storefrontContent";
import { NewsArticle, NewsCard } from "./StorefrontSections";
import { PublicLink } from "./PublicLink";

export default function NewsPage({ slug, businessName, onNavigate }: { slug?: string; businessName: string; onNavigate: (path: string) => void }) {
  const [posts, setPosts] = useState<PublicNewsSummary[]>([]);
  const [article, setArticle] = useState<PublicNewsArticle | null>(null);
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    document.title = `${article?.title ?? "News & Updates"} | ${businessName}`;
  }, [article, businessName]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(null); setArticle(null);
    void fetch(slug ? `/api/public/news/${encodeURIComponent(slug)}` : `/api/public/news?page=${page}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(response.status === 404 ? "This update is not available." : "Updates could not be loaded right now.");
        if (slug) {
          const post = await response.json() as PublicNewsArticle;
          if (!controller.signal.aborted) setArticle(post);
        } else {
          const body = await response.json() as { posts: PublicNewsSummary[]; hasMore: boolean };
          if (!controller.signal.aborted) { setPosts(body.posts); setMore(body.hasMore); }
        }
      }).catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Updates are unavailable."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [slug, page, retry]);
  return <section className="public-inner-page"><div className="public-container">
    {slug ? <PublicLink className="public-text-link" href="/news" onNavigate={onNavigate}>&larr; All news & updates</PublicLink> : <><p className="public-kicker">From the Double Rare table</p><h1>News & updates</h1><p className="public-inner-page__lead">New arrivals, show notes, and updates from our collection to yours.</p></>}
    {loading && <p role="status">Loading updates…</p>}
    {!loading && error && <div className="public-catalog-message" role="alert"><h2>{error}</h2><button className="public-button public-button--secondary" onClick={() => setRetry((value) => value + 1)}>Try again</button></div>}
    {!loading && !error && (article ? <NewsArticle post={article} /> : <>
      {posts.length ? <div className="public-news-grid">{posts.map((post) => <NewsCard key={post.slug} post={post} onNavigate={onNavigate} />)}</div> : <p>No updates have been posted yet. <PublicLink className="public-text-link" href="/inventory" onNavigate={onNavigate}>Browse inventory &rarr;</PublicLink></p>}
      {(page > 1 || more) && <nav className="public-page-actions" aria-label="News pages"><button className="public-button public-button--secondary" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>Previous</button><span aria-live="polite">Page {page}</span><button className="public-button public-button--secondary" disabled={!more} onClick={() => setPage((value) => value + 1)}>Next</button></nav>}
    </>)}
  </div></section>;
}
