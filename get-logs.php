<?php
/**
 * get-logs.php
 * Retrieves the list of export logs from the server.
 */
header('Content-Type: application/json');

$indexPath = 'logs/entries.json';

if (file_exists($indexPath)) {
    echo file_get_contents($indexPath);
} else {
    // Return an empty array if no logs exist yet
    echo json_encode([]);
}
