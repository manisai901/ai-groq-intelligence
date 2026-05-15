import fetch from "node-fetch";

async function testChat() {
  const res = await fetch("http://127.0.0.1:3000/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "hi", history: [] })
  });
  console.log(res.status);
  const text = await res.text();
  console.log(text);
}
testChat();
