<?php

function env_value($name, $default = "")
{
    $value = getenv($name);
    if ($value === false || $value === null || $value === "") {
        return $default;
    }
    return $value;
}

function json_response($statusCode, $payload)
{
    http_response_code($statusCode);
    header("Content-Type: application/json; charset=utf-8");
    header("X-Content-Type-Options: nosniff");
    header("X-Frame-Options: DENY");
    header("Referrer-Policy: strict-origin-when-cross-origin");
    echo json_encode($payload, JSON_UNESCAPED_SLASHES);
    exit;
}

function read_json_body()
{
    $raw = file_get_contents("php://input");
    if (!$raw) {
        return [];
    }

    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        return [];
    }

    return $decoded;
}

function messages_file_path()
{
    return __DIR__ . DIRECTORY_SEPARATOR . "data" . DIRECTORY_SEPARATOR . "messages.json";
}

function read_messages()
{
    $file = messages_file_path();
    if (!file_exists($file)) {
        return [];
    }

    $raw = file_get_contents($file);
    if (!$raw) {
        return [];
    }

    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function write_messages($messages)
{
    $file = messages_file_path();
    file_put_contents($file, json_encode($messages, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
}

function read_json_map_file($file)
{
    if (!file_exists($file)) {
        return [];
    }

    $raw = file_get_contents($file);
    if (!$raw) {
        return [];
    }

    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function write_json_map_file($file, $value)
{
    if (!is_array($value)) {
        $value = [];
    }

    file_put_contents($file, json_encode($value, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
}

function client_ip_address()
{
    $forwarded = $_SERVER["HTTP_X_FORWARDED_FOR"] ?? "";
    if ($forwarded !== "") {
        $parts = explode(",", $forwarded);
        $candidate = trim($parts[0]);
        if ($candidate !== "") {
            return $candidate;
        }
    }

    return $_SERVER["REMOTE_ADDR"] ?? "unknown";
}

function basic_auth_credentials()
{
    if (isset($_SERVER["PHP_AUTH_USER"], $_SERVER["PHP_AUTH_PW"])) {
        return [$_SERVER["PHP_AUTH_USER"], $_SERVER["PHP_AUTH_PW"]];
    }

    $header = $_SERVER["HTTP_AUTHORIZATION"] ?? "";
    if (!$header || stripos($header, "Basic ") !== 0) {
        return [null, null];
    }

    $encoded = trim(substr($header, 6));
    $decoded = base64_decode($encoded, true);
    if ($decoded === false || strpos($decoded, ":") === false) {
        return [null, null];
    }

    return explode(":", $decoded, 2);
}

function verify_admin_auth()
{
    list($username, $password) = basic_auth_credentials();
    if ($username === null || $password === null) {
        return false;
    }

    $validUser = env_value("ADMIN_USER", "");
    $validPass = env_value("ADMIN_PASS", "");
    $validHash = strtolower(env_value("ADMIN_PASS_HASH", ""));

    if ($validUser === "" || ($validPass === "" && $validHash === "")) {
        return false;
    }

    $usernameOk = hash_equals($validUser, $username);
    $plainOk = $validPass !== "" && hash_equals($validPass, $password);
    $hashOk = $validHash !== "" && hash_equals($validHash, hash("sha256", $password));

    return $usernameOk && ($plainOk || $hashOk);
}

function admin_auth_is_configured()
{
    $validUser = env_value("ADMIN_USER", "");
    $validPass = env_value("ADMIN_PASS", "");
    $validHash = strtolower(env_value("ADMIN_PASS_HASH", ""));
    return $validUser !== "" && ($validPass !== "" || $validHash !== "");
}

function require_admin_auth()
{
    if (!admin_auth_is_configured()) {
        json_response(500, [
            "success" => false,
            "message" => "Admin authentication is not configured."
        ]);
    }

    $attemptFile = __DIR__ . DIRECTORY_SEPARATOR . "data" . DIRECTORY_SEPARATOR . "admin_auth_attempts.json";
    $ipAddress = client_ip_address();
    $now = time();
    $windowSeconds = 900;
    $maxAttempts = 5;
    $lockoutSeconds = 900;

    $attemptMap = read_json_map_file($attemptFile);
    $entry = $attemptMap[$ipAddress] ?? ["count" => 0, "windowStart" => $now, "blockedUntil" => 0];
    $count = (int)($entry["count"] ?? 0);
    $windowStart = (int)($entry["windowStart"] ?? $now);
    $blockedUntil = (int)($entry["blockedUntil"] ?? 0);

    if ($blockedUntil > $now) {
        json_response(429, [
            "success" => false,
            "message" => "Too many failed login attempts. Try again later."
        ]);
    }

    if (($now - $windowStart) > $windowSeconds) {
        $count = 0;
        $windowStart = $now;
    }

    if (verify_admin_auth()) {
        unset($attemptMap[$ipAddress]);
        write_json_map_file($attemptFile, $attemptMap);
        return;
    }

    $count += 1;
    $updatedEntry = [
        "count" => $count,
        "windowStart" => $windowStart,
        "blockedUntil" => 0
    ];

    if ($count >= $maxAttempts) {
        $updatedEntry["count"] = 0;
        $updatedEntry["windowStart"] = $now;
        $updatedEntry["blockedUntil"] = $now + $lockoutSeconds;
    }

    $attemptMap[$ipAddress] = $updatedEntry;
    write_json_map_file($attemptFile, $attemptMap);

    header('WWW-Authenticate: Basic realm="Portfolio Admin"');
    json_response(401, [
        "success" => false,
        "message" => "Unauthorized"
    ]);
}

function send_contact_notification_email($payload)
{
    $notifyTo = trim(env_value("CONTACT_NOTIFY_TO", ""));
    if ($notifyTo === "") {
        return true;
    }

    $notifyFrom = trim(env_value("CONTACT_NOTIFY_FROM", ""));
    if ($notifyFrom === "" || !filter_var($notifyFrom, FILTER_VALIDATE_EMAIL)) {
        $notifyFrom = "no-reply@localhost";
    }

    $senderName = str_replace(["\r", "\n"], " ", (string)($payload["name"] ?? "Unknown"));
    $senderEmail = (string)($payload["email"] ?? "");
    $senderSubject = str_replace(["\r", "\n"], " ", (string)($payload["subject"] ?? "No subject"));
    $createdAt = (string)($payload["createdAt"] ?? gmdate("c"));
    $clientIp = (string)($payload["ip"] ?? "unknown");
    $messageBody = (string)($payload["message"] ?? "");

    $subjectLine = "New contact form submission: " . $senderSubject;
    $textBody = "You received a new contact form message.\n\n"
        . "Name: " . $senderName . "\n"
        . "Email: " . $senderEmail . "\n"
        . "Subject: " . $senderSubject . "\n"
        . "Submitted (UTC): " . $createdAt . "\n"
        . "IP: " . $clientIp . "\n\n"
        . "Message:\n" . $messageBody . "\n";

    $resendApiKey = trim(env_value("RESEND_API_KEY", ""));
    if ($resendApiKey !== "") {
        $httpBody = json_encode([
            "from" => "Portfolio Contact <" . $notifyFrom . ">",
            "to" => [$notifyTo],
            "subject" => $subjectLine,
            "text" => $textBody,
            "reply_to" => $senderEmail !== "" ? [$senderEmail] : []
        ]);

        $context = stream_context_create([
            "http" => [
                "method" => "POST",
                "header" => "Authorization: Bearer " . $resendApiKey . "\r\n"
                    . "Content-Type: application/json\r\n",
                "content" => $httpBody,
                "ignore_errors" => true,
                "timeout" => 10
            ]
        ]);

        $response = @file_get_contents("https://api.resend.com/emails", false, $context);
        $statusCode = 0;
        $responseHeaders = function_exists("http_get_last_response_headers") ? http_get_last_response_headers() : [];
        if (is_array($responseHeaders) && count($responseHeaders) > 0) {
            if (preg_match('/\s(\d{3})\s/', $responseHeaders[0], $matches)) {
                $statusCode = (int)$matches[1];
            }
        }

        if ($statusCode >= 200 && $statusCode < 300 && $response !== false) {
            return true;
        }

        error_log("Resend contact notification failed with status " . $statusCode . ". Falling back to PHP mail().");
    }

    $headers = [
        "MIME-Version: 1.0",
        "Content-Type: text/plain; charset=UTF-8",
        "From: Portfolio Contact <" . $notifyFrom . ">"
    ];
    if ($senderEmail !== "" && filter_var($senderEmail, FILTER_VALIDATE_EMAIL)) {
        $headers[] = "Reply-To: " . $senderEmail;
    }

    $mailSent = @mail($notifyTo, $subjectLine, $textBody, implode("\r\n", $headers));
    if (!$mailSent) {
        error_log("Contact notification email failed to send via mail().");
    }

    return $mailSent;
}

function contact_notification_mode()
{
    $notifyTo = trim(env_value("CONTACT_NOTIFY_TO", ""));
    if ($notifyTo === "") {
        return "disabled";
    }

    $resendApiKey = trim(env_value("RESEND_API_KEY", ""));
    if ($resendApiKey !== "") {
        return "resend";
    }

    return "php-mail-fallback";
}
