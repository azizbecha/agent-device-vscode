// Shared helpers for Agent Device webviews.
// Loaded before each panel's main script via a separate <script> tag.

(function (global) {
  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatDuration(ms) {
    const value = Math.max(0, Math.floor(ms));
    if (value < 1000) return value + 'ms';
    const seconds = Math.floor(value / 1000);
    if (seconds < 60) return seconds + 's';
    const minutes = Math.floor(seconds / 60);
    const remSeconds = seconds % 60;
    if (minutes < 60) {
      return remSeconds === 0 ? minutes + 'm' : minutes + 'm ' + remSeconds + 's';
    }
    const hours = Math.floor(minutes / 60);
    const remMinutes = minutes % 60;
    return remMinutes === 0 ? hours + 'h' : hours + 'h ' + remMinutes + 'm';
  }

  global.AgentDevice = global.AgentDevice || {};
  global.AgentDevice.escapeHtml = escapeHtml;
  global.AgentDevice.formatDuration = formatDuration;
})(window);
