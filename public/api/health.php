<?php

require_once __DIR__ . "/../../backend/php/bootstrap.php";

json_response(200, [
    "status" => "ok",
    "service" => "portfolio-api-php",
    "timestamp" => gmdate("c"),
    "notifications" => [
        "mode" => contact_notification_mode()
    ]
]);
