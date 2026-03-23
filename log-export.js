const LOG_KEY = "galattica_log_export";

/**
 * Adds a new export entry to the log on the server via PHP.
 * @param {Object} state - The current application state.
 * @param {string} exportType - "png" or "pdf".
 */
export async function addToLog(state, exportType) {
  const entry = {
    title: state.content.titolo || "Senza titolo",
    exportType: exportType,
    configuration: state // Full state
  };

  try {
    const response = await fetch('save-log.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry)
    });
    
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    console.log(`[Log-Export] Export logged to server: ${entry.title}`);
    return result;
  } catch (e) {
    console.warn("[Log-Export] Server logging failed.", e);
    
    // Minimal fallback to localStorage for the current session/user if server fails
    try {
        const localLogs = JSON.parse(localStorage.getItem(LOG_KEY) || "[]");
        localLogs.unshift({
            timestamp: new Date().toISOString(),
            title: entry.title,
            exportType: exportType,
            configuration: entry.configuration,
            isLocalOnly: true 
        });
        localStorage.setItem(LOG_KEY, JSON.stringify(localLogs.slice(0, 50)));
    } catch(err) { /* ignore */ }
  }
}

/**
 * Retrieves all logs from the server.
 * @returns {Promise<Array>}
 */
export async function getLogs() {
  try {
    const response = await fetch('get-logs.php');
    if (!response.ok) throw new Error('Failed to fetch logs');
    const serverLogs = await response.json();
    
    // Merge with any local-only logs (optional fallback)
    const localLogs = JSON.parse(localStorage.getItem(LOG_KEY) || "[]");
    return [...localLogs, ...serverLogs];
  } catch (e) {
    console.error("[Log-Export] Failed to fetch server logs", e);
    return JSON.parse(localStorage.getItem(LOG_KEY) || "[]");
  }
}

/**
 * Clears all logs from local storage only.
 * Server logs are persistent.
 */
export function clearLogs() {
  localStorage.removeItem(LOG_KEY);
}
