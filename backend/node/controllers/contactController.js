const fs = require("fs");
const path = require("path");

const messagesPath = path.join(__dirname, "..", "..", "php", "data", "messages.json");

const readMessages = () => {
  try {
    const file = fs.readFileSync(messagesPath, "utf8");
    return JSON.parse(file || "[]");
  } catch (error) {
    return [];
  }
};

const writeMessages = (messages) => {
  fs.writeFileSync(messagesPath, JSON.stringify(messages, null, 2));
};

const getHealth = (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "portfolio-api",
    timestamp: new Date().toISOString()
  });
};

const getMessages = (req, res) => {
  const messages = readMessages();
  res.status(200).json(messages);
};

const submitContact = (req, res) => {
  const { name, email, subject, message } = req.body;

  if (!name || !email || !subject || !message) {
    return res.status(400).json({
      success: false,
      message: "All fields are required."
    });
  }

  const messages = readMessages();
  const newMessage = {
    id: Date.now(),
    name,
    email,
    subject,
    message,
    createdAt: new Date().toISOString()
  };

  messages.push(newMessage);
  writeMessages(messages);

  return res.status(201).json({
    success: true,
    message: "Message received successfully.",
    data: newMessage
  });
};

module.exports = {
  getHealth,
  getMessages,
  submitContact
};
