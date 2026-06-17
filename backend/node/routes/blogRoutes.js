const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();
const BLOG_DIR = path.join(__dirname, "../../public/blog");
const BLOG_DATA_FILE = path.join(BLOG_DIR, "blog-posts.json");

const readBlogPosts = async () => {
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

const writeBlogPosts = async (posts) => {
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

/**
 * @swagger
 * /api/blog/posts:
 *   get:
 *     tags:
 *       - Blog
 *     summary: Get all blog posts
 *     description: Retrieve published blog posts sorted by date
 *     parameters:
 *       - name: limit
 *         in: query
 *         schema:
 *           type: integer
 *           default: 10
 *       - name: offset
 *         in: query
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: Blog posts retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 posts:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       slug:
 *                         type: string
 *                       title:
 *                         type: string
 *                       excerpt:
 *                         type: string
 *                       category:
 *                         type: string
 *                       published_date:
 *                         type: string
 */
router.get("/posts", async (req, res) => {
  try {
    const posts = await readBlogPosts();
    const limit = Math.min(parseInt(req.query.limit || 10), 50);
    const offset = parseInt(req.query.offset || 0);

    const published = posts.filter(post => post.published === true);
    const sorted = published.sort((a, b) => 
      new Date(b.published_date) - new Date(a.published_date)
    );

    res.status(200).json({
      success: true,
      posts: sorted.slice(offset, offset + limit),
      total: sorted.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load blog posts"
    });
  }
});

/**
 * @swagger
 * /api/blog/posts/{slug}:
 *   get:
 *     tags:
 *       - Blog
 *     summary: Get a single blog post
 *     parameters:
 *       - name: slug
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Blog post found
 *       404:
 *         description: Blog post not found
 */
router.get("/posts/:slug", async (req, res) => {
  try {
    const posts = await readBlogPosts();
    const post = posts.find(p => p.slug === req.params.slug && p.published === true);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Blog post not found"
      });
    }

    res.status(200).json({
      success: true,
      post
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load blog post"
    });
  }
});

module.exports = router;
