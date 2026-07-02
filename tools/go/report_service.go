package main

import (
  "encoding/json"
  "log"
  "net/http"
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

type Summary struct {
  Engine       string `json:"engine"`
  TotalMessages int    `json:"totalMessages"`
  LatestName   string `json:"latestName"`
  LatestEmail  string `json:"latestEmail"`
  LatestSubject string `json:"latestSubject"`
}

func loadMessages() ([]Message, error) {
  filePath := os.Getenv("MESSAGES_FILE")
  if filePath == "" {
    filePath = "backend/php/data/messages.json"
  }

  bytes, err := os.ReadFile(filePath)
  if err != nil {
    return nil, err
  }

  var messages []Message
  if err := json.Unmarshal(bytes, &messages); err != nil {
    return nil, err
  }

  return messages, nil
}

func summaryHandler(w http.ResponseWriter, r *http.Request) {
  messages, err := loadMessages()
  if err != nil {
    http.Error(w, `{"success":false,"message":"Failed to load messages"}`, http.StatusInternalServerError)
    return
  }

  summary := Summary{Engine: "go", TotalMessages: len(messages)}
  if len(messages) > 0 {
    latest := messages[len(messages)-1]
    summary.LatestName = latest.Name
    summary.LatestEmail = latest.Email
    summary.LatestSubject = latest.Subject
  }

  w.Header().Set("Content-Type", "application/json")
  _ = json.NewEncoder(w).Encode(summary)
}

func main() {
  mux := http.NewServeMux()
  mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
    w.Header().Set("Content-Type", "application/json")
    _, _ = w.Write([]byte(`{"status":"ok","service":"go-report"}`))
  })
  mux.HandleFunc("/summary", summaryHandler)

  port := os.Getenv("GO_REPORT_PORT")
  if port == "" {
    port = "8091"
  }

  log.Printf("Go report service listening on :%s", port)
  log.Fatal(http.ListenAndServe(":"+port, mux))
}
