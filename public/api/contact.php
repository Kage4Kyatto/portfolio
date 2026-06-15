<?php

require_once __DIR__ . "/../../backend/php/bootstrap.php";

if ($_SERVER["REQUEST_METHOD"] !== "POST") {
    json_response(405, [
        "success" => false,
        "message" => "Method not allowed"
    ]);
}

$body = read_json_body();
$name = trim((string)($body["name"] ?? ($_POST["name"] ?? "")));
$email = trim((string)($body["email"] ?? ($_POST["email"] ?? "")));
$subject = trim((string)($body["subject"] ?? ($_POST["subject"] ?? "")));
$message = trim((string)($body["message"] ?? ($_POST["message"] ?? "")));
$website = trim((string)($body["website"] ?? ($_POST["website"] ?? "")));

if ($website !== "") {
    json_response(400, [
        "success" => false,
        "message" => "Invalid submission."
    ]);
}

$rateLimitFile = __DIR__ . "/../../backend/php/data/contact_rate_limits.json";
$clientIp = client_ip_address();
$now = time();
$windowSeconds = 600;
$maxRequestsPerWindow = 5;

$rateLimits = read_json_map_file($rateLimitFile);
$history = $rateLimits[$clientIp] ?? [];
if (!is_array($history)) {
    $history = [];
}

$history = array_values(array_filter($history, function ($timestamp) use ($now, $windowSeconds) {
    return is_numeric($timestamp) && ((int)$timestamp) > ($now - $windowSeconds);
}));

if (count($history) >= $maxRequestsPerWindow) {
    json_response(429, [
        "success" => false,
        "message" => "Too many messages sent. Please try again later."
    ]);
}

$history[] = $now;
$rateLimits[$clientIp] = $history;
write_json_map_file($rateLimitFile, $rateLimits);

if ($name === "" || $email === "" || $subject === "" || $message === "") {
    json_response(400, [
        "success" => false,
        "message" => "All fields are required."
    ]);
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    json_response(400, [
        "success" => false,
        "message" => "Please enter a valid email address."
    ]);
}

if (mb_strlen($name) > 120 || mb_strlen($email) > 254 || mb_strlen($subject) > 180 || mb_strlen($message) > 3000) {
    json_response(400, [
        "success" => false,
        "message" => "One or more fields exceed the allowed length."
    ]);
}

$messages = read_messages();
$newMessage = [
    "id" => (int) round(microtime(true) * 1000),
    "name" => $name,
    "email" => $email,
    "subject" => $subject,
    "message" => $message,
    "createdAt" => gmdate("c")
];

$messages[] = $newMessage;
write_messages($messages);
send_contact_notification_email([
    "name" => $name,
    "email" => $email,
    "subject" => $subject,
    "message" => $message,
    "createdAt" => $newMessage["createdAt"],
    "ip" => $clientIp
]);

json_response(201, [
    "success" => true,
    "message" => "Message received successfully.",
    "data" => $newMessage
]);
