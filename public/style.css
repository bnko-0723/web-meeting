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
const MAX_USERS = 6;

io.on("connection", (socket) => {

  socket.on("join-room", ({ roomId, name }, callback) => {
    roomId = String(roomId || "").trim().slice(0, 100);
    name = String(name || "").trim().slice(0, 30);

    if (!roomId) {
      return callback?.({
        ok: false,
        error: "部屋IDがありません。"
      });
    }

    if (!name) {
      return callback?.({
        ok: false,
        error: "名前を入力してください。"
      });
    }

    let room = rooms.get(roomId);

    if (!room) {
      room = new Map();
      rooms.set(roomId, room);
    }

    if (room.size >= MAX_USERS) {
      return callback?.({
        ok: false,
        error: `この部屋は${MAX_USERS}人までです。`
      });
    }

    const existingUsers = [...room.entries()].map(
      ([id, user]) => ({
        id,
        name: user.name
      })
    );

    room.set(socket.id, {
      name
    });

    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.name = name;

    callback?.({
      ok: true,
      isFirst: existingUsers.length === 0,
      users: existingUsers
    });

    socket.to(roomId).emit("peer-joined", {
      id: socket.id,
      name
    });
  });

  // WebRTC offer
  socket.on("offer", ({ target, offer }) => {
    if (!target || !offer) return;

    io.to(target).emit("offer", {
      from: socket.id,
      offer
    });
  });

  // WebRTC answer
  socket.on("answer", ({ target, answer }) => {
    if (!target || !answer) return;

    io.to(target).emit("answer", {
      from: socket.id,
      answer
    });
  });

  // ICE candidate
  socket.on("ice-candidate", ({ target, candidate }) => {
    if (!target || !candidate) return;

    io.to(target).emit("ice-candidate", {
      from: socket.id,
      candidate
    });
  });

  // チャット
  socket.on("chat-message", ({ message }) => {
    const roomId = socket.data.roomId;
    const name = socket.data.name;

    if (!roomId || !name) return;

    const text = String(message || "").trim().slice(0, 500);

    if (!text) return;

    io.to(roomId).emit("chat-message", {
      id: socket.id,
      name,
      message: text,
      time: new Date().toISOString()
    });
  });

  // 退出
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

  const user = room.get(socket.id);

  room.delete(socket.id);

  socket.to(roomId).emit("peer-left", {
    id: socket.id,
    name: user?.name || "参加者"
  });

  if (room.size === 0) {
    rooms.delete(roomId);
  }
}

const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
