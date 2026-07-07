const blogPostsContainer = document.getElementById("blog-posts");

const toSafeBlogUrl = (slug) => {
  const normalized = String(slug || "").trim();
  if (!normalized) {
    return "/blog/";
  }

  return `/blog/${encodeURIComponent(normalized)}/`;
};

const toSafeIsoDate = (value) => {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toISOString();
};

const loadBlogPosts = async () => {
  try {
    const response = await fetch("/api/blog/posts");
    if (!response.ok) {
      throw new Error(`Failed to load blog posts: ${response.status}`);
    }

    const data = await response.json();
    if (!data.success || !Array.isArray(data.posts)) {
      throw new Error("Invalid response format");
    }

    if (data.posts.length === 0) {
      blogPostsContainer.innerHTML = `
        <div class="blog-state">
          <p class="blog-state-text">No blog posts yet. Check back soon!</p>
        </div>
      `;
      return;
    }

    const html = data.posts
      .map(post => {
        const postUrl = toSafeBlogUrl(post.slug);
        const publishedDateIso = toSafeIsoDate(post.published_date);
        const publishedDisplay = publishedDateIso
          ? new Date(publishedDateIso).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric"
          })
          : "";
        const readTime = Number.isFinite(Number(post.readTimeMinutes))
          ? Number(post.readTimeMinutes)
          : null;
        const tagsHtml = (post.tags || [])
          .map(tag => `<span class="blog-tag">${escapeHtml(tag)}</span>`)
          .join("");

        return `
        <article class="blog-post-card" itemscope itemtype="https://schema.org/BlogPosting">
          <meta itemprop="author" content="${escapeHtml(post.author || 'Soeraj Balak')}" />
          <meta itemprop="datePublished" content="${escapeHtml(publishedDateIso)}" />
          <meta itemprop="description" content="${escapeHtml(post.description || post.excerpt)}" />
          <h3 itemprop="headline">
            <a href="${postUrl}" itemprop="url">${escapeHtml(post.title)}</a>
          </h3>
          <p class="blog-meta">
            <time datetime="${escapeHtml(publishedDateIso)}" itemprop="datePublished">
              ${escapeHtml(publishedDisplay)}
            </time>
            <span class="blog-category" itemprop="keywords">${escapeHtml(post.category || 'General')}</span>
            ${readTime !== null ? `<span class="blog-read-time">${readTime} min read</span>` : ''}
          </p>
          ${tagsHtml ? `<div class="blog-tags">${tagsHtml}</div>` : ''}
          <p itemprop="description" class="blog-excerpt">${escapeHtml(post.excerpt)}</p>
          <a href="${postUrl}" class="read-more">Read More →</a>
        </article>
      `;
      })
      .join("");

    blogPostsContainer.innerHTML = html;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Failed to load blog posts";
    console.error(errorMessage);
    blogPostsContainer.innerHTML = `
      <div class="blog-state">
        <p class="blog-state-text blog-state-error">${escapeHtml(errorMessage)}</p>
      </div>
    `;
    if (window.toast) {
      window.toast.error("Failed to load blog posts");
    }
  }
};

if (blogPostsContainer) {
  loadBlogPosts();
}
