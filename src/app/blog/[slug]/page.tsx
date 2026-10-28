import PublicSite from "@/components/PublicSite";
import { one } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ locale?: string }>;
};
async function postFor(props: Props) {
  const { slug } = await props.params;
  const { locale } = await props.searchParams;
  return one(
    "SELECT title,body,locale,cover_data,cover_alt,created_at FROM posts WHERE slug=$1 AND locale=$2 AND published",
    [slug, locale === "ar" ? "ar" : "en"],
  );
}
export async function generateMetadata(props: Props) {
  const post = await postFor(props);
  return {
    title: post?.title || "Article unavailable",
    description: post?.body.slice(0, 155),
    openGraph: { title: post?.title || "Black Infinity" },
  };
}
export default async function Article(props: Props) {
  const post = await postFor(props);
  if (!post) notFound();
  return (
    <PublicSite
      page="article"
      article={
        <main className="container public-content trust-content">
          <Link href="/blog" className="text-link">
            ← Journal / المدونة
          </Link>
          <article dir={post.locale === "ar" ? "rtl" : "ltr"} className="mt-4">
            <span className="eyebrow">
              {new Date(post.created_at).toLocaleDateString(
                post.locale === "ar" ? "ar-EG" : "en-GB",
              )}
            </span>
            <h1>{post.title}</h1>
            {post.cover_data ? (
              <img
                className="blog-cover"
                src={post.cover_data}
                alt={post.cover_alt || post.title}
              />
            ) : null}
            <div className="post-body">{post.body}</div>
          </article>
        </main>
      }
    />
  );
}
