import fs from "node:fs";
import path from "node:path";

type Message = {
  id: number;
  name: string;
  email: string;
  subject: string;
  message: string;
  createdAt: string;
};

const messagesPath = path.join(__dirname, "..", "..", "..", "backend", "php", "data", "messages.json");

const readMessages = (): Message[] => {
  const raw = fs.readFileSync(messagesPath, "utf8");
  const parsed = JSON.parse(raw) as Message[];
  return Array.isArray(parsed) ? parsed : [];
};

const messages = readMessages();
const uniqueSenders = new Set(messages.map((entry) => entry.email.toLowerCase())).size;
const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;

console.log("Message statistics");
console.log(`Total messages: ${messages.length}`);
console.log(`Unique senders: ${uniqueSenders}`);
console.log(`Last subject: ${lastMessage ? lastMessage.subject : "none"}`);
