import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { Server } from "socket.io";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

app.get("*splat", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const rooms = new Map();

io.on("connection", (socket) => {
  socket.on("join-room", (roomId, callback) => {
    roomId = String(roomId || "").trim().slice(0, 100);
    if (!roomId) return callback?.({ ok: false, error: "部屋IDがありません。" });

    const current = rooms.get(roomId) || new Set();

    if (current.size >= 2 && !current.has(socket.id)) {
      return callback?.({ ok: false, error: "この部屋はすでに2人で使用中です。" });
    }

    socket.join(roomId);
    socket.data.roomId = roomId;
    current.add(socket.id);
    rooms.set(roomId, current);

    const others = current.size - 1;
    callback?.({ ok: true, isFirst: others === 0 });

    if (others > 0) {
      socket.to(roomId).emit("peer-joined");
    }
  });

  socket.on("offer", ({ roomId, offer }) => {
    socket.to(roomId).emit("offer", offer);
  });

  socket.on("answer", ({ roomId, answer }) => {
    socket.to(roomId).emit("answer", answer);
  });

  socket.on("ice-candidate", ({ roomId, candidate }) => {
    socket.to(roomId).emit("ice-candidate", candidate);
  });

  socket.on("leave-room", () => {
    leaveRoom(socket);
  });

  socket.on("disconnect", () => {
    leaveRoom(socket);
  });
});

function leaveRoom(socket) {
  const roomId = socket.data.roomId;
  if (!roomId) return;

  const room = rooms.get(roomId);
  if (!room) return;

  room.delete(socket.id);
  socket.to(roomId).emit("peer-left");

  if (room.size === 0) rooms.delete(roomId);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
