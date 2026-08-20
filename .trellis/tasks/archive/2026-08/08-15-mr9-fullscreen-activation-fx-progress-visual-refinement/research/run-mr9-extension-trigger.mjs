import WebSocket from "ws";

await new Promise((resolve) => setTimeout(resolve, 400));

const socket = new WebSocket("ws://127.0.0.1:39527");
const requestId = `mr9-native-extension-${Date.now()}`;
const timeout = setTimeout(() => {
  socket.close();
  process.exitCode = 1;
}, 5_000);

socket.on("open", () => {
  socket.send(JSON.stringify({
    action: "video_selected_v2",
    requestId,
    data: {
      url: `https://example.com/${requestId}.mp4`,
      pageUrl: "https://example.com/",
      siteHint: "generic",
      title: "MR9 native extension validation",
    },
  }));
});

socket.on("message", (raw) => {
  const message = JSON.parse(raw.toString());
  if (message?.success !== true || typeof message?.data?.traceId !== "string") {
    return;
  }
  clearTimeout(timeout);
  console.log(JSON.stringify(message));
  socket.close();
});

socket.on("close", () => {
  clearTimeout(timeout);
});

socket.on("error", (error) => {
  clearTimeout(timeout);
  console.error(error);
  process.exitCode = 1;
});
