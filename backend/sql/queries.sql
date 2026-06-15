-- Useful SQL queries for admin dashboards or reporting.

-- Latest 10 contact submissions
SELECT id, name, email, subject, created_at
FROM contact_messages
ORDER BY created_at DESC
LIMIT 10;

-- Daily message volume
SELECT date(created_at) AS day, COUNT(*) AS total
FROM contact_messages
GROUP BY date(created_at)
ORDER BY day DESC;

-- Top senders by email
SELECT email, COUNT(*) AS total
FROM contact_messages
GROUP BY email
ORDER BY total DESC, email ASC;
