const blogPostsContainer = document.getElementById("blog-posts");

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
        <div style="padding: 48px 24px; text-align: center;">
          <p style="color: var(--text); font-size: 1.1rem;">No blog posts yet. Check back soon!</p>
        </div>
      `;
      return;
    }

    const html = data.posts
      .map(post => `
        <article class="blog-post-card" itemscope itemtype="https://schema.org/BlogPosting">
          <meta itemprop="author" content="Soeraj Balak" />
          <meta itemprop="datePublished" content="${post.published_date}" />
          <h3 itemprop="headline">
            <a href="/blog/${post.slug}/" itemprop="url">${escapeHtml(post.title)}</a>
          </h3>
          <p class="blog-meta">
            <time datetime="${post.published_date}" itemprop="datePublished">
              ${new Date(post.published_date).toLocaleDateString('en-US', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}
            </time>
            <span class="blog-category" itemprop="keywords">${escapeHtml(post.category || 'General')}</span>
          </p>
          <p itemprop="description" class="blog-excerpt">${escapeHtml(post.excerpt)}</p>
          <a href="/blog/${post.slug}/" class="read-more">Read More →</a>
        </article>
      `)
      .join("");

    blogPostsContainer.innerHTML = html;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Failed to load blog posts";
    console.error(errorMessage);
    blogPostsContainer.innerHTML = `
      <div style="padding: 48px 24px; text-align: center;">
        <p style="color: var(--error); font-size: 1rem;">${escapeHtml(errorMessage)}</p>
      </div>
    `;
    if (window.toast) {
      window.toast.error("Failed to load blog posts");
    }
  }
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

if (blogPostsContainer) {
  loadBlogPosts();
}
