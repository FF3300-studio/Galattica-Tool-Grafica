<?php
/**
 * delete-logs.php
 * Securely deletes all logs from the server if the correct password is provided.
 */
header('Content-Type: application/json');

// Get raw POST data
$input = file_get_contents('php://input');
$data = json_decode($input, true);

$password = $data['password'] ?? '';
$hardcodedPassword = 'Stelle&Galassie2026';

if ($password !== $hardcodedPassword) {
    http_response_code(401);
    echo json_encode(['error' => 'Password non corretta']);
    exit;
}

$logsDir = 'logs';
$detailsDir = $logsDir . '/details';
$indexPath = $logsDir . '/entries.json';

// Delete details files
if (file_exists($detailsDir)) {
    $files = glob($detailsDir . '/*.json');
    foreach ($files as $file) {
        if (is_file($file)) {
            unlink($file);
        }
    }
}

// Clear entries index
if (file_exists($indexPath)) {
    file_put_contents($indexPath, json_encode([]));
}

echo json_encode(['success' => true]);
