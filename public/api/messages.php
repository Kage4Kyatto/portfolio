<?php

require_once __DIR__ . "/../../backend/php/bootstrap.php";

require_admin_auth();

json_response(200, read_messages());
