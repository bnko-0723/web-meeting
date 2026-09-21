const socket = io();

const home = document.getElementById("home");
const call = document.getElementById("call");

const nameInput = document.getElementById("nameInput");
const joinButton = document.getElementById("joinButton");
const homeStatus = document.getElementById("homeStatus");

const roomUrl = document.getElementById("roomUrl");
const copyLink = document.getElementById("copyLink");
const statusEl = document.getElementById("status");

const videos = document.getElementById("videos");

const muteButton = document.getElementById("mute");
const cameraButton = document.getElementById("camera");
const hangupButton = document.getElementById("hangup");

const chatMessages = document.getElementById("chatMessages");
const chatInput = document.getElementById("chatInput");
const sendChat = document.getElementById("sendChat");

const roomId = getRoomIdFromUrl();

let localStream = null;
let myName = "";

let micOn = true;
let cameraOn = true;

const peers = new Map();
const userNames = new Map();

const rtcConfig = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" }
  ]
};

function getRoomIdFromUrl() {
  const parts = location.pathname.split("/").filter(Boolean);
  return parts[0] || null;
}

function makeRoomId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes]
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

function setStatus(text) {
  statusEl.textContent = text;
}

function createVideoElement(id, name, stream, isLocal = false) {
  const existing = document.getElementById(`video-${id}`);

  if (existing) {
    const video = existing.querySelector("video");
    if (video) video.srcObject = stream;
    return;
  }

  const box = document.createElement("div");
  box.className = "video-box";
  box.id = `video-${id}`;

  const video = document.createElement("video");

  video.autoplay = true;
  video.playsInline = true;
  video.srcObject = stream;

  if (isLocal) {
    video.muted = true;
  }

  const label = document.createElement("span");
  label.textContent = isLocal ? `${name}（あなた）` : name;

  box.appendChild(video);
  box.appendChild(label);

  videos.appendChild(box);
}

function removeVideoElement(id) {
  const element = document.getElementById(`video-${id}`);

  if (element) {
    element.remove();
  }
}

function createPeerConnection(targetId, targetName) {
  if (peers.has(targetId)) {
    return peers.get(targetId).pc;
  }

  const pc = new RTCPeerConnection(rtcConfig);

  for (const track of localStream.getTracks()) {
    pc.addTrack(track, localStream);
  }

  pc.ontrack = (event) => {
    const stream = event.streams[0];

    createVideoElement(
      targetId,
      targetName || userNames.get(targetId) || "参加者",
      stream
    );

    setStatus("通話中");
  };

  pc.onicecandidate = (event) => {
    if (!event.candidate) return;

    socket.emit("ice-candidate", {
      target: targetId,
      candidate: event.candidate
    });
  };

  pc.onconnectionstatechange = () => {
    const state = pc.connectionState;

    if (state === "connected") {
      setStatus("通話中");
    }

    if (state === "disconnected" || state === "failed") {
      removePeer(targetId);
    }
  };

  peers.set(targetId, {
    pc,
    name: targetName || "参加者"
  });

  return pc;
}

async function createOffer(targetId, targetName) {
  const pc = createPeerConnection(targetId, targetName);

  const offer = await pc.createOffer();

  await pc.setLocalDescription(offer);

  socket.emit("offer", {
    target: targetId,
    offer
  });
}

function removePeer(id) {
  const peer = peers.get(id);

  if (peer) {
    peer.pc.close();
    peers.delete(id);
  }

  removeVideoElement(id);
  userNames.delete(id);
}

async function joinRoom() {
  if (!roomId) {
    homeStatus.textContent = "部屋IDがありません。";
    return;
  }

  myName = nameInput.value.trim();

  if (!myName) {
    homeStatus.textContent = "名前を入力してください。";
    nameInput.focus();
    return;
  }

  joinButton.disabled = true;
  homeStatus.textContent = "";

  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });

    home.classList.add("hidden");
    call.classList.remove("hidden");

    roomUrl.textContent = location.href;

    createVideoElement(
      "local",
      myName,
      localStream,
      true
    );

    setStatus("部屋に参加しています…");

    socket.emit(
      "join-room",
      {
        roomId,
        name: myName
      },
      async (result) => {

        if (!result?.ok) {
          setStatus(result?.error || "部屋に入れませんでした。");

          localStream.getTracks().forEach(track => track.stop());

          call.classList.add("hidden");
          home.classList.remove("hidden");

          joinButton.disabled = false;

          return;
        }

        for (const user of result.users || []) {
          userNames.set(user.id, user.name);

          await createOffer(
            user.id,
            user.name
          );
        }

        if (result.users?.length > 0) {
          setStatus("参加者に接続しています…");
        } else {
          setStatus("参加しました。ほかの人を待っています…");
        }
      }
    );

  } catch (error) {
    console.error(error);

    homeStatus.textContent =
      "カメラ・マイクを使用できませんでした。ブラウザの許可設定を確認してください。";

    joinButton.disabled = false;
  }
}

joinButton.addEventListener("click", joinRoom);

nameInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    joinRoom();
  }
});

socket.on("peer-joined", async ({ id, name }) => {
  userNames.set(id, name);

  setStatus(`${name} が参加しました。接続中…`);

  // 新しく入った人には、すでにいる側から接続する
  await createOffer(id, name);
});

socket.on("offer", async ({ from, offer }) => {
  const name = userNames.get(from) || "参加者";

  const pc = createPeerConnection(from, name);

  await pc.setRemoteDescription(offer);

  const answer = await pc.createAnswer();

  await pc.setLocalDescription(answer);

  socket.emit("answer", {
    target: from,
    answer
  });
});

socket.on("answer", async ({ from, answer }) => {
  const peer = peers.get(from);

  if (!peer) return;

  try {
    await peer.pc.setRemoteDescription(answer);
  } catch (error) {
    console.error("Answer error:", error);
  }
});

socket.on("ice-candidate", async ({ from, candidate }) => {
  const peer = peers.get(from);

  if (!peer) return;

  try {
    await peer.pc.addIceCandidate(candidate);
  } catch (error) {
    console.error("ICE candidate error:", error);
  }
});

socket.on("peer-left", ({ id, name }) => {
  removePeer(id);

  setStatus(
    `${name || "参加者"} が退出しました。`
  );
});

muteButton.addEventListener("click", () => {
  micOn = !micOn;

  localStream?.getAudioTracks().forEach(track => {
    track.enabled = micOn;
  });

  muteButton.textContent =
    micOn ? "🎤 ミュート" : "🔇 ミュート解除";
});

cameraButton.addEventListener("click", () => {
  cameraOn = !cameraOn;

  localStream?.getVideoTracks().forEach(track => {
    track.enabled = cameraOn;
  });

  cameraButton.textContent =
    cameraOn ? "📷 カメラOFF" : "📷 カメラON";
});

copyLink.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(location.href);

    copyLink.textContent = "コピーしました！";

    setTimeout(() => {
      copyLink.textContent = "🔗 URLをコピー";
    }, 1500);

  } catch {
    alert(
      "URLをコピーできませんでした。アドレスバーからコピーしてください。"
    );
  }
});

function sendMessage() {
  const message = chatInput.value.trim();

  if (!message) return;

  socket.emit("chat-message", {
    message
  });

  chatInput.value = "";
  chatInput.focus();
}

sendChat.addEventListener("click", sendMessage);

chatInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    sendMessage();
  }
});

socket.on("chat-message", (data) => {
  const message = document.createElement("div");
  message.className = "chat-message";

  const name = document.createElement("strong");
  name.textContent = data.name;

  const text = document.createElement("div");
  text.textContent = data.message;

  message.appendChild(name);
  message.appendChild(text);

  chatMessages.appendChild(message);

  chatMessages.scrollTop = chatMessages.scrollHeight;
});

hangupButton.addEventListener("click", () => {
  socket.emit("leave-room");

  for (const [, peer] of peers) {
    peer.pc.close();
  }

  peers.clear();

  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
  }

  location.href = "/";
});

if (!roomId) {
  // トップページ
} else {
  // 名前を入力してから参加する
}
