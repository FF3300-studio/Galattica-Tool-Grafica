<?php
header('Content-Type: application/json');

$dir = '.';
$files = scandir($dir);
$result = [];

foreach ($files as $file) {
    if (preg_match('/\.(png|jpg|jpeg|webp)$/i', $file)) {
        $result[] = $file;
    }
}

echo json_encode($result);
?>
