package main

import (
	"encoding/json"
	"flag"
	"fmt"
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
	Engine        string `json:"engine"`
	TotalMessages int    `json:"totalMessages"`
	LatestName    string `json:"latestName"`
	LatestEmail   string `json:"latestEmail"`
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
	help := flag.Bool("help", false, "Show usage information")
	flag.BoolVar(help, "h", false, "Show usage information")
	portFlag := flag.String("port", "", "Port for the HTTP server (overrides GO_REPORT_PORT)")
	flag.Parse()

	if *help {
		fmt.Println("Go report service")
		fmt.Println()
		fmt.Println("Usage:")
		fmt.Println("  go run ./tools/go/report_service/main.go [--port <port>] [--help]")
		fmt.Println()
		fmt.Println("Options:")
		fmt.Println("  -h, --help       Show this help and exit")
		fmt.Println("  --port <port>    Port to listen on")
		fmt.Println()
		fmt.Println("Environment:")
		fmt.Println("  GO_REPORT_PORT   Default port when --port is not set (default: 8091)")
		fmt.Println("  MESSAGES_FILE    Path to messages JSON (default: backend/php/data/messages.json)")
		return
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ok","service":"go-report"}`))
	})
	mux.HandleFunc("/summary", summaryHandler)

	port := *portFlag
	if port == "" {
		port = os.Getenv("GO_REPORT_PORT")
	}
	if port == "" {
		port = "8091"
	}

	log.Printf("Go report service listening on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, mux))
}