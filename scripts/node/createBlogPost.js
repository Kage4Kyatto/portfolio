#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const BLOG_DIR = path.join(__dirname, "../../public/blog");
const BLOG_DATA_FILE = path.join(BLOG_DIR, "blog-posts.json");

const slugify = (text) => {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
};

const readBlogPosts = () => {
  try {
    if (!fs.existsSync(BLOG_DATA_FILE)) {
      return [];
    }
    const data = fs.readFileSync(BLOG_DATA_FILE, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    console.error("Error reading blog posts:", error);
    return [];
  }
};

const writeBlogPosts = (posts) => {
  try {
    if (!fs.existsSync(BLOG_DIR)) {
      fs.mkdirSync(BLOG_DIR, { recursive: true });
    }
    fs.writeFileSync(BLOG_DATA_FILE, JSON.stringify(posts, null, 2));
    return true;
  } catch (error) {
    console.error("Error writing blog posts:", error);
    return false;
  }
};

const createBlogPost = (args) => {
  if (args.length < 2) {
    console.error("Usage: npm run blog:new -- --title 'Post Title' --excerpt 'Brief excerpt' [--category 'Category']");
    process.exit(1);
  }

  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const key = args[i].slice(2);
      const value = args[i + 1];
      if (!value || value.startsWith("--")) {
        console.error(`Missing value for ${args[i]}`);
        process.exit(1);
      }
      options[key] = value;
      i++;
    }
  }

  const { title, excerpt, category } = options;

  if (!title || !excerpt) {
    console.error("Required: --title and --excerpt");
    process.exit(1);
  }

  const posts = readBlogPosts();
  const slug = slugify(title);

  if (posts.some(p => p.slug === slug)) {
    console.error(`Blog post with slug '${slug}' already exists`);
    process.exit(1);
  }

  const newPost = {
    id: crypto.randomUUID(),
    slug,
    title,
    excerpt,
    category: category || "General",
    published_date: new Date().toISOString(),
    published: false,
    content: `# ${title}\n\n${excerpt}\n\n## Your Content Here\n\nThis is a template. Edit the blog post HTML file to add your full content.`
  };

  posts.push(newPost);

  if (!writeBlogPosts(posts)) {
    console.error("Failed to create blog post");
    process.exit(1);
  }

  console.log(`✓ Blog post created: ${slug}`);
  console.log(`  ID: ${newPost.id}`);
  console.log(`  Status: Draft (set published: true in blog-posts.json to publish)`);
  console.log(`\nCreate /public/blog/${slug}/index.html for full post content`);
};

createBlogPost(process.argv.slice(2));
