package main

import (
  "encoding/json"
  "fmt"
  "os"
)

type Message struct {
  ID        int64  `json:"id"`
  Name      string `json:"name"`
  Email     string `json:"email"`
  Subject   string `json:"subject"`
  Message   string `json:"message"`
  CreatedAt string `json:"createdAt"`
}

func main() {
  bytes, err := os.ReadFile("backend/php/data/messages.json")
  if err != nil {
    fmt.Printf("Failed to read messages: %v\n", err)
    os.Exit(1)
  }

  var messages []Message
  if err := json.Unmarshal(bytes, &messages); err != nil {
    fmt.Printf("Failed to parse messages: %v\n", err)
    os.Exit(1)
  }

  fmt.Printf("Total messages: %d\n", len(messages))
  if len(messages) == 0 {
    return
  }

  latest := messages[len(messages)-1]
  fmt.Printf("Latest message from: %s (%s)\n", latest.Name, latest.Email)
  fmt.Printf("Latest subject: %s\n", latest.Subject)
}