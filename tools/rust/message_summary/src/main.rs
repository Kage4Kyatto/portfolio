use serde::Deserialize;
use std::fs;

#[derive(Deserialize)]
struct Message {
    id: i64,
    name: String,
    email: String,
    subject: String,
    message: String,
    #[serde(rename = "createdAt")]
    created_at: String,
}

fn main() {
    let raw = match fs::read_to_string("backend/php/data/messages.json") {
        Ok(content) => content,
        Err(err) => {
            eprintln!("Failed to read messages: {}", err);
            std::process::exit(1);
        }
    };

    let messages: Vec<Message> = match serde_json::from_str(&raw) {
        Ok(items) => items,
        Err(err) => {
            eprintln!("Failed to parse messages: {}", err);
            std::process::exit(1);
        }
    };

    println!("Total messages: {}", messages.len());
    if let Some(last) = messages.last() {
        println!("Latest message from: {} ({})", last.name, last.email);
        println!("Latest subject: {}", last.subject);
    }
}
