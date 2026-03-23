<?php
/**
 * save-log.php
 * Handles saving export logs and configuration details to the server.
 */
header('Content-Type: application/json');

// Get raw POST data
$input = file_get_contents('php://input');
$data = json_decode($input, true);

if (!$data || !isset($data['configuration'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Dati non validi o mancanti']);
    exit;
}

$logsDir = 'logs';
$detailsDir = $logsDir . '/details';

// Create directories if not exist
if (!file_exists($logsDir)) {
    mkdir($logsDir, 0777, true);
}
if (!file_exists($detailsDir)) {
    mkdir($detailsDir, 0777, true);
}

// Generate unique filename for full configuration
$timestamp = time();
$dateStr = date('Y-m-d_H-i-s', $timestamp);
$detailsFilename = "config_{$dateStr}_{$timestamp}.json";
$detailsPath = $detailsDir . '/' . $detailsFilename;

// Save full configuration state
file_put_contents($detailsPath, json_encode($data['configuration'], JSON_PRETTY_PRINT));

// Prepare summary entry for the main list
$entry = [
    'timestamp' => date('c', $timestamp),
    'title' => $data['title'] ?? 'Senza titolo',
    'exportType' => $data['exportType'] ?? 'unknown',
    'detailsFile' => $detailsFilename
];

$indexPath = $logsDir . '/entries.json';
$entries = [];
if (file_exists($indexPath)) {
    $entries = json_decode(file_get_contents($indexPath), true) ?: [];
}

// Add new entry to the beginning of the list
array_unshift($entries, $entry);

// Limit list size to 1000 entries
if (count($entries) > 1000) {
    $entries = array_slice($entries, 0, 1000);
}

// Save the entries list
if (file_put_contents($indexPath, json_encode($entries, JSON_PRETTY_PRINT))) {
    echo json_encode(['success' => true, 'entry' => $entry]);
} else {
    http_response_code(500);
    echo json_encode(['error' => 'Impossibile salvare il file di log index']);
}
