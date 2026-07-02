use serde::{Deserialize, Serialize};
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

#[derive(Serialize)]
struct Summary {
    engine: String,
    #[serde(rename = "totalMessages")]
    total_messages: usize,
    #[serde(rename = "latestName")]
    latest_name: String,
    #[serde(rename = "latestEmail")]
    latest_email: String,
    #[serde(rename = "latestSubject")]
    latest_subject: String,
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let json_mode = args.iter().any(|arg| arg == "--json");

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

    if json_mode {
        let latest = messages.last();
        let summary = Summary {
            engine: "rust".to_string(),
            total_messages: messages.len(),
            latest_name: latest.map(|m| m.name.clone()).unwrap_or_default(),
            latest_email: latest.map(|m| m.email.clone()).unwrap_or_default(),
            latest_subject: latest.map(|m| m.subject.clone()).unwrap_or_default(),
        };

        match serde_json::to_string(&summary) {
            Ok(serialized) => println!("{}", serialized),
            Err(err) => {
                eprintln!("Failed to serialize summary: {}", err);
                std::process::exit(1);
            }
        }
        return;
    }

    println!("Total messages: {}", messages.len());
    if let Some(last) = messages.last() {
        println!("Latest message from: {} ({})", last.name, last.email);
        println!("Latest subject: {}", last.subject);
    }
}
