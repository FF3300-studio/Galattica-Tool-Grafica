const LOG_KEY = "galattica_log_export";

/**
 * Adds a new export entry to the log in localStorage.
 * @param {Object} state - The current application state.
 * @param {string} exportType - "png" or "pdf".
 */
export function addToLog(state, exportType) {
  try {
    const logs = getLogs();
    
    // Create a clean copy of the state without heavy blobs/dataURLs if possible,
    // but the user wants the "file json relativo", which usually means the preset.
    // Our state contains some dataURLs for logos and background. 
    // We'll keep them to allow full restoration.
    
    const entry = {
      timestamp: new Date().toISOString(),
      title: state.content.titolo || "Senza titolo",
      exportType: exportType,
      configuration: JSON.parse(JSON.stringify(state)) // Deep copy
    };
    
    logs.push(entry);
    localStorage.setItem(LOG_KEY, JSON.stringify(logs));
    console.log(`[Log-Export] Export logged: ${entry.title} (${exportType})`);
  } catch (e) {
    console.warn("[Log-Export] Failed to save log", e);
    // If localStorage is full, we might want to truncate old logs, 
    // but let's keep it simple for now.
  }
}

/**
 * Retrieves all logs from localStorage.
 * @returns {Array}
 */
export function getLogs() {
  const stored = localStorage.getItem(LOG_KEY);
  if (!stored) return [];
  try {
    return JSON.parse(stored);
  } catch (e) {
    console.error("[Log-Export] Failed to parse logs", e);
    return [];
  }
}

/**
 * Clears all logs from localStorage.
 */
export function clearLogs() {
  localStorage.removeItem(LOG_KEY);
}
