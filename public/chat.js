/* IBP Dispatch Dashboard — chat.js
   Floating Dispatch Assistant panel */

const todayISOc = () => new Date().toISOString().slice(0, 10);
let chatHistory = [];
let chatOpen = false;

window.toggleChat = function () {
  const panel = document.getElementById("chat-panel");
  const fab   = document.getElementById("chat-fab");
  chatOpen = !chatOpen;
  panel.classList.toggle("hidden", !chatOpen);
  fab.classList.toggle("chat-fab-open", chatOpen);
  if (chatOpen) document.getElementById("chat-input").focus();
};

window.sendChat = async function () {
  const input = document.getElementById("chat-input");
  const text  = input.value.trim();
  if (!text) return;

  input.value = "";
  appendBubble("user", text);
  chatHistory.push({ role: "user", content: text });

  const thinkingId = appendBubble("assistant", "…", true);
  document.getElementById("chat-send").disabled = true;

  try {
    const res = await fetch("/api/chat", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ messages: chatHistory, date: todayISOc() }),
    });
    const data = await res.json();
    const reply = data.reply ?? "No response.";

    removeBubble(thinkingId);
    appendBubble("assistant", reply);
    chatHistory.push({ role: "assistant", content: reply });

    // Keep history to last 20 messages to avoid token bloat
    if (chatHistory.length > 20) chatHistory = chatHistory.slice(-20);
  } catch (err) {
    removeBubble(thinkingId);
    appendBubble("assistant", `Error: ${err.message}`);
  } finally {
    document.getElementById("chat-send").disabled = false;
    input.focus();
  }
};

// Enter key to send
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("chat-input")?.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); window.sendChat(); }
  });
});

function appendBubble(role, text, isThinking = false) {
  const messages = document.getElementById("chat-messages");
  const id = `bubble-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const div = document.createElement("div");
  div.id = id;
  div.className = `chat-bubble ${role}${isThinking ? " thinking" : ""}`;
  div.innerHTML = renderMarkdown(text);
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
  return id;
}

function removeBubble(id) {
  document.getElementById(id)?.remove();
}

function renderMarkdown(text) {
  return text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/^#{1,3} (.+)$/gm, "<strong>$1</strong>")
    .replace(/^[\-•] (.+)$/gm, "• $1")
    .replace(/\n/g, "<br>");
}
